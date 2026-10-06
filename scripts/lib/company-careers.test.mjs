import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMarket } from './common.mjs';
import { companyQueries, fetchCompanyCareers, matchesEmployer, parseJobPostings, parsePersonio } from './company-careers.mjs';
import { fetchArbeitsagentur, hydrateJobDescription } from './de-portals.mjs';
import { relevantExperience, scoreJob } from './fit.mjs';
import { mergeJobArchives } from './dedupe.mjs';
const market = await loadMarket({ market: 'DE' });
const query = { company: { name: 'Example', provider: 'greenhouse', tenant: 'example' }, include: ['software|backend'], exclude: ['senior'] };
test('direct watchlists support UK and distinguish empty, failure and unsupported sources', async t => {
  const gb = await loadMarket({ market: 'GB' });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ jobs: [
    { id: 'uk', title: 'Backend Engineer', location: { name: 'London, United Kingdom' }, absolute_url: 'https://example.org/jobs/uk', content: 'Build APIs', first_published: '2026-10-01' },
    { id: 'de', title: 'Backend Engineer', location: { name: 'Berlin, Germany' }, absolute_url: 'https://example.org/jobs/de', content: 'Build APIs' },
  ] }));
  const jobs = await fetchCompanyCareers(query, {}, gb); assert.equal(jobs.length, 1); assert.equal(jobs[0].nativeId, 'uk');
  await assert.rejects(fetchCompanyCareers({ ...query, company: { name: 'Example' } }, {}, gb), /unsupported/);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ jobs: [] })); assert.deepEqual(await fetchCompanyCareers(query, {}, gb), []);
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 })); await assert.rejects(fetchCompanyCareers(query, {}, gb), /503/);
});

test('company plans run once per employer, independent of city/title multiplication', () => {
  const q = companyQueries({ companies: [{ name: 'Example' }] }, { search: { titles: ['Nurse', 'Staff Nurse'], includeTitlePatterns: ['nurse'] } });
  assert.equal(q.length, 1);
  assert.deepEqual(q[0].titles, ['Nurse', 'Staff Nurse']);
  assert.equal(matchesEmployer('Example GmbH', q[0].company), true);
  assert.equal(matchesEmployer('Unrelated GmbH', q[0].company), false);
  assert.throws(() => companyQueries({}, {}), /watchlist/);
});

test('Personio supplies full descriptions, real office and publication date', () => {
  const [job] = parsePersonio('<workzag-jobs><position><id>7</id><name>Software Engineer</name><office>Berlin</office><createdAt>2026-09-25</createdAt><jobDescriptions><jobDescription><name>Requirements</name><value><![CDATA[<p>Python &amp; SQL</p>]]></value></jobDescription></jobDescriptions></position></workzag-jobs>', { name: 'Example', tenant: 'example' });
  assert.equal(job.location, 'Berlin');
  assert.match(job.description, /Python/);
  assert.match(job.url, /\/job\/7/);
  assert.equal(job.postedAt, '2026-09-25');
});

test('JSON-LD reads nested job graphs and excludes expired postings', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [
    { '@type': 'JobPosting', title: 'Software Engineer', description: 'Python APIs', jobLocation: { address: { addressLocality: 'Berlin', addressCountry: 'DE' } } },
    { '@type': 'JobPosting', title: 'Expired', validThrough: '2020-01-01' },
  ] })}</script>`;
  const jobs = parseJobPostings(html, 'https://example.org/jobs/1', { name: 'Example' });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].location, 'Berlin, DE');
});

test('ATS fetch keeps DE alternatives, filters seniority and merges with archive', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ jobs: [
    { id: 1, title: 'Backend Developer', location: { name: 'Berlin, Germany; London, United Kingdom' }, absolute_url: 'https://example.org/jobs/1', content: 'Build Python services' },
    { id: 2, title: 'Senior Backend Developer', location: { name: 'Berlin' }, absolute_url: 'https://example.org/jobs/2' },
    { id: 3, title: 'Backend Developer', location: { name: 'London, United Kingdom' }, absolute_url: 'https://example.org/jobs/3' },
    { id: 4, title: 'Backend Developer', location: { name: 'Berlin' }, absolute_url: 'javascript:alert(1)' },
  ] })));
  const jobs = await fetchCompanyCareers(query, { limit: 20 }, market);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].location, 'Berlin, Germany');
  assert.equal(jobs[0].postedAt, null);
  const archived = mergeJobArchives([{ ...jobs[0], id: 'old', source: 'de:indeed', description: '' }], jobs);
  assert.equal(archived.length, 1);
  assert.match(archived[0].description, /Python/);
  assert.ok([archived[0].id, ...archived[0].mergedIds].includes('old'));
});

test('Amazon paginates, checks actual country and retains qualification sections', async t => {
  const offsets = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const u = new URL(url); offsets.push(u.searchParams.get('offset'));
    assert.equal(u.searchParams.get('country'), 'DEU');
    const second = u.searchParams.get('offset') === '100';
    return new Response(JSON.stringify({ hits: 101, jobs: second ? [{ id: 2, title: 'Backend Developer', city: 'Boston', country_code: 'USA' }]
      : [{ id: 1, title: 'Backend Developer', country_code: 'DEU', city: 'Berlin', job_path: '/en/jobs/1/example',
        posted_date: 'September 25, 2026', description: 'Build APIs', basic_qualifications: '3 years experience required', preferred_qualifications: 'Python preferred' }] }));
  });
  const jobs = await fetchCompanyCareers({ ...query, company: { name: 'Example', provider: 'amazon', searchTerm: 'backend' } }, {}, market);
  assert.deepEqual(offsets, ['0', '100']);
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].description, /3 years experience required/);
  assert.match(jobs[0].description, /Python preferred/);
  assert.equal(jobs[0].postedAt, '2026-09-25T00:00:00.000Z');
});

test('malformed successful HTTP payloads do not masquerade as empty job feeds', async t => {
  assert.throws(() => parsePersonio('<html>Temporarily unavailable</html>', {}), /Invalid Personio/);
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await assert.rejects(fetchArbeitsagentur({ what: 'Engineer' }, {}, market), /invalid jobs response/);
});

test('Arbeitsagentur may omit the results array when its total is explicitly zero', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ maxErgebnisse: 0, page: 1, size: 20 })));
  assert.deepEqual(await fetchArbeitsagentur({ what: 'Engineer' }, {}, market), []);
});

test('source HTTP failures remain errors instead of false empty success', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(fetchCompanyCareers(query, {}, market), /503/);
});

test('Arbeitsagentur fetch hydrates details with encoded reference; missing remote stays unknown', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push(String(url));
    assert.ok(opts.signal);
    return new Response(JSON.stringify(String(url).includes('/jobdetails/')
      ? { stellenangebotsBeschreibung: 'Python APIs. German B2 required.' }
      : { ergebnisliste: [{ referenznummer: '123-abc-S', stellenangebotsTitel: 'Backend Developer', firma: 'Example', stellenlokationen: [{ adresse: { ort: 'Berlin', land: 'DEUTSCHLAND' } }] }] }));
  });
  const [job] = await fetchArbeitsagentur({ what: 'Python', employer: 'Example' }, { limit: 5 }, market);
  assert.match(calls[0], /arbeitgeber=Example/);
  assert.ok(calls[1].endsWith(encodeURIComponent(Buffer.from('123-abc-S').toString('base64'))));
  assert.equal(job.remote, null);
  assert.match(job.description, /German B2/);
  assert.equal(await hydrateJobDescription({ ...job, description: 'Beruf: Softwareentwickler/in' }), job.description);
});

test('failed details retain BA listings without pretending an occupation is a description', async t => {
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('/jobdetails/') ? new Response('', { status: 404 })
    : new Response(JSON.stringify({ ergebnisliste: [{ referenznummer: '123', stellenangebotsTitel: 'Developer', hauptberuf: 'Softwareentwickler/in' }] })));
  const jobs = await fetchArbeitsagentur({ what: 'Python' }, { limit: 5 }, market);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].description, null);
});

test('supporting experience quotes Memory bullets and leaves unrelated work out', () => {
  const profile = { experience: [
    { title: 'Developer', org: 'Example', bullets: ['Built Python APIs', 'Maintained SQL reports'] },
    { title: 'Volunteer', org: 'Community', bullets: ['Organised events'] },
  ] };
  const result = relevantExperience(profile, ['Python']);
  assert.deepEqual(result[0].bullets, ['Built Python APIs']);
  assert.equal(result[0].memoryPath, 'facts.experience[0]');
  assert.equal(result.length, 1);
  const fit = scoreJob({ title: 'Python Developer', board: 'arbeitsagentur', description: 'Beruf: Softwareentwickler/in' }, profile);
  assert.equal(fit.eligibility.status, 'needs-checking');
  assert.notEqual(fit.verdict, 'Strong');
});
