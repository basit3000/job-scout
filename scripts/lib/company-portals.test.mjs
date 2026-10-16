import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPortal,
  portalId,
  mergeDiscoveredPortals,
  portalQueries,
  DISCOVERED_BOARD,
} from './company-portals.mjs';

test('detectPortal identifies known applicant tracking systems from job links', () => {
  assert.deepEqual(detectPortal('https://boards.greenhouse.io/stripe/jobs/12345'), {
    provider: 'greenhouse',
    tenant: 'stripe',
  });
  assert.deepEqual(detectPortal('https://job-boards.greenhouse.io/stripe/jobs/12345'), {
    provider: 'greenhouse',
    tenant: 'stripe',
  });
  assert.deepEqual(detectPortal('https://boards.eu.greenhouse.io/deliveroo/jobs/678'), {
    provider: 'greenhouse',
    tenant: 'deliveroo',
  });
  assert.deepEqual(detectPortal('https://jobs.lever.co/figma/abc-def-123'), {
    provider: 'lever',
    tenant: 'figma',
  });
  assert.deepEqual(detectPortal('https://jobs.eu.lever.co/spotify/abc-def-123'), {
    provider: 'lever',
    tenant: 'spotify',
    domain: 'eu',
  });
  assert.deepEqual(detectPortal('https://jobs.ashbyhq.com/linear/456'), {
    provider: 'ashby',
    tenant: 'linear',
  });
  assert.deepEqual(detectPortal('https://apply.workable.com/resend/j/XYZ123/'), {
    provider: 'workable',
    tenant: 'resend',
  });
  assert.deepEqual(detectPortal('https://jobs.smartrecruiters.com/AcmeCorp/7439999-engineer'), {
    provider: 'smartrecruiters',
    tenant: 'AcmeCorp',
  });
  assert.deepEqual(detectPortal('https://acme.jobs.personio.de/job/123'), {
    provider: 'personio',
    tenant: 'acme',
    domain: 'de',
  });
  assert.deepEqual(detectPortal('https://supermetrics.recruitee.com/o/senior-developer'), {
    provider: 'recruitee',
    tenant: 'supermetrics',
  });
  assert.equal(detectPortal('https://www.linkedin.com/jobs/view/12345'), null);
  assert.equal(detectPortal('https://www.indeed.com/viewjob?jk=12345'), null);
  assert.equal(detectPortal('invalid-url'), null);
});

test('mergeDiscoveredPortals adds unique portals and updates seen counts', () => {
  const store = { version: 1, portals: [] };
  const jobs = [
    {
      id: 'job-1',
      company: 'Stripe',
      url: 'https://boards.greenhouse.io/stripe/jobs/1',
      board: 'linkedin',
    },
    {
      id: 'job-2',
      company: 'Linear',
      url: 'https://jobs.ashbyhq.com/linear/2',
      board: 'indeed',
    },
    {
      id: 'job-3',
      company: 'Stripe Europe',
      url: 'https://boards.greenhouse.io/stripe/jobs/3',
      board: 'indeed',
    },
  ];

  const { store: updated, added } = mergeDiscoveredPortals(store, jobs, { marketId: 'GB' });
  assert.equal(added, 2);
  assert.equal(updated.portals.length, 2);

  const stripe = updated.portals.find((p) => p.tenant === 'stripe');
  assert.ok(stripe);
  assert.equal(stripe.provider, 'greenhouse');
  assert.equal(stripe.seenCount, 2);
  assert.deepEqual(stripe.markets, ['GB']);
  assert.ok(stripe.discoveredFrom.includes('linkedin'));
  assert.ok(stripe.discoveredFrom.includes('indeed'));
});

test('portalQueries builds valid queries for enabled portals without duplicating manual watchlist', () => {
  const store = {
    version: 1,
    portals: [
      {
        id: 'greenhouse:stripe',
        name: 'Stripe',
        provider: 'greenhouse',
        tenant: 'stripe',
        enabled: true,
        markets: ['US'],
      },
      {
        id: 'ashby:linear',
        name: 'Linear',
        provider: 'ashby',
        tenant: 'linear',
        enabled: true,
        markets: ['US'],
      },
      {
        id: 'lever:disabledco',
        name: 'Disabled Co',
        provider: 'lever',
        tenant: 'disabledco',
        enabled: false,
        markets: ['US'],
      },
    ],
  };

  const config = {
    companies: [
      {
        name: 'Stripe Manual',
        provider: 'greenhouse',
        tenant: 'stripe',
      },
    ],
  };

  const profile = {
    search: {
      titles: ['Backend Engineer'],
      includeTitlePatterns: ['backend'],
      excludeTitlePatterns: ['lead'],
    },
  };

  const market = { id: 'US', name: 'United States' };
  const queries = portalQueries(store, config, profile, market);

  assert.equal(queries.length, 1);
  assert.equal(queries[0].what, 'Linear');
  assert.equal(queries[0].board, DISCOVERED_BOARD);
  assert.equal(queries[0].company.provider, 'ashby');
  assert.equal(queries[0].company.tenant, 'linear');
});
