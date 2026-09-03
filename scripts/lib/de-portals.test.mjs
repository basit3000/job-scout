import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStepstoneAgo,
  parseStepstoneCard,
  stepstoneCitySlug,
  stepstoneSearchUrl,
  stepstoneSlug,
  xingSearchUrl,
  parseXingCard,
  ppaSearchUrl,
  extractNextPpa,
  mapPpaOffer,
  parseGermantechTitle,
  parseRssItems,
} from './de-portals.mjs';

describe('stepstone portal', () => {
  it('builds DE search URLs', () => {
    assert.equal(stepstoneSlug('Software Developer (m/w/d)'), 'software-developer-m-w-d');
    assert.equal(stepstoneCitySlug('Munich'), 'muenchen');
    assert.equal(stepstoneCitySlug('Germany'), 'deutschland');
    assert.equal(
      stepstoneSearchUrl({ what: 'Software Developer', where: 'Berlin' }),
      'https://www.stepstone.de/jobs/software-developer/in-berlin',
    );
    assert.equal(
      stepstoneSearchUrl({ what: 'Python', where: 'Germany' }, 2),
      'https://www.stepstone.de/jobs/python/in-deutschland?page=2',
    );
  });

  it('parses German relative dates', () => {
    const ago = parseStepstoneAgo('vor 4 Tagen');
    assert.ok(ago);
    const days = (Date.now() - Date.parse(ago)) / 86400000;
    assert.ok(days >= 3.5 && days <= 4.5);
  });

  it('parses a listing card', () => {
    const html = `
      <div data-testid="job-item">
        <a href="/stellenangebote--Software-Developer-Berlin-Acme--13913974-inline.html" data-testid="job-item-title">
          <div>Software Developer</div>
        </a>
        <span data-at="job-item-company-name"><span>Acme GmbH</span></span>
        <span data-at="job-item-location"><span>Berlin</span></span>
        <span data-at="job-item-timeago">vor 2 Tagen</span>
        <div data-at="jobcard-content"><span>Build APIs in Berlin. Remote possible.</span></div>
      </div>`;
    const card = parseStepstoneCard(html);
    assert.equal(card.nativeId, '13913974');
    assert.equal(card.title, 'Software Developer');
    const dirty = parseStepstoneCard(`
      <a href="/stellenangebote--X--1-inline.html" data-testid="job-item-title" data-at="job-item-title" tabindex="-1">
        <div>Backend Engineer</div>
      </a>
      <span data-at="job-item-company-name">Acme</span>
      <span data-at="job-item-location">Berlin</span>
    `);
    assert.equal(dirty.title, 'Backend Engineer');
    assert.equal(card.company, 'Acme GmbH');
    assert.equal(card.location, 'Berlin');
    assert.equal(card.remote, true);
    assert.match(card.href, /13913974-inline\.html/);
  });
});

describe('xing portal', () => {
  it('builds DACH search URLs', () => {
    assert.equal(
      xingSearchUrl({ what: 'Software Developer', where: 'Berlin' }),
      'https://www.xing.com/jobs/search?keywords=Software+Developer&location=Berlin',
    );
    assert.equal(
      xingSearchUrl({ what: 'Python', where: 'Germany', radiusKm: 50 }, 2),
      'https://www.xing.com/jobs/search?keywords=Python&radius=50&page=2',
    );
  });

  it('parses a listing card', () => {
    const html = `
      <article data-testid="job-search-result">
        <a href="/jobs/berlin-software-developer-154980065"></a>
        <img title="Acme GmbH" aria-label="Acme GmbH" src="/logo.png"/>
        <h2 data-testid="job-teaser-list-title">Software Developer (m/f/d)</h2>
        <p class="job-teaser-list-item-styles__Company-sc-614863cf-11">Acme GmbH</p>
        <div class="multi-location-display-styles__Container-sc-cd6c43d-0">
          <p>Berlin<b>+ 0 more</b></p>
        </div>
        <ul><li>Build APIs. Remote possible.</li></ul>
        <time dateTime="2026-09-02T12:34:43Z">21 hours ago</time>
      </article>`;
    const card = parseXingCard(html);
    assert.equal(card.nativeId, '154980065');
    assert.equal(card.title, 'Software Developer (m/f/d)');
    assert.equal(card.company, 'Acme GmbH');
    assert.equal(card.location, 'Berlin');
    assert.equal(card.remote, true);
    assert.equal(card.postedAt, '2026-09-02T12:34:43Z');
    assert.equal(card.href, '/jobs/berlin-software-developer-154980065');
  });
});

describe('kimeta / heise PPA portals', () => {
  it('builds search URLs', () => {
    assert.equal(
      ppaSearchUrl('https://www.kimeta.de', { what: 'Softwareentwickler', where: 'Berlin', radiusKm: 50 }),
      'https://www.kimeta.de/search?q=Softwareentwickler&loc=Berlin&r=50',
    );
    assert.equal(
      ppaSearchUrl('https://jobs.heise.de', { what: 'Python', where: 'Germany' }, 2),
      'https://jobs.heise.de/search?q=Python&page=2',
    );
  });

  it('decodes packed Next.js PPA and maps offers', () => {
    const payload = {
      searchResults: {
        jobOffers: [
          {
            documentId: '986735065',
            title: 'Backend Engineer (m/w/d)',
            companyName: 'Acme GmbH',
            location: 'Berlin',
            offerUrl: 'https://www.kimeta.de/job/986735065',
            firstFound: '2026-08-31T07:04:38.313Z',
            teaser: 'Build APIs in Berlin. Homeoffice possible.',
            hours: ['Vollzeit'],
          },
        ],
      },
    };
    const codes = [...JSON.stringify(payload)].map((c) => c.charCodeAt(0));
    const html = `<script id="__NEXT_DATA__">${JSON.stringify({
      props: { pageProps: { __PPA__: codes } },
    })}</script>`;
    const ppa = extractNextPpa(html);
    const offer = mapPpaOffer(ppa.searchResults.jobOffers[0]);
    assert.equal(offer.nativeId, '986735065');
    assert.equal(offer.title, 'Backend Engineer (m/w/d)');
    assert.equal(offer.company, 'Acme GmbH');
    assert.equal(offer.location, 'Berlin');
    assert.equal(offer.remote, true);
    assert.equal(offer.employmentType, 'Vollzeit');
  });
});

describe('germantechjobs portal', () => {
  it('parses RSS titles and items', () => {
    const parsed = parseGermantechTitle(
      'Embedded Software Engineer IoT (m/w/d) @ Wirelane GmbH [60.000 - 65.000 €]',
    );
    assert.equal(parsed.title, 'Embedded Software Engineer IoT (m/w/d)');
    assert.equal(parsed.company, 'Wirelane GmbH');
    assert.match(parsed.salary, /60\.000/);
    const items = parseRssItems(`
      <rss><channel>
        <item>
          <title>CIAM Platform Engineer @ Acme GmbH [50.000 - 80.000 €]</title>
          <link>https://germantechjobs.de/jobs/acme-ciam?utm_source=our_rss_feed</link>
          <pubDate>Thu, 03 Sep 2026 07:55:39 GMT</pubDate>
          <description><![CDATA[<p>Salary listed. Remote possible.</p>]]></description>
        </item>
      </channel></rss>`);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'CIAM Platform Engineer @ Acme GmbH [50.000 - 80.000 €]');
    assert.match(items[0].link, /germantechjobs\.de\/jobs\/acme-ciam/);
  });
});
