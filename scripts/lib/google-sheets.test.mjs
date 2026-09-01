import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHEET_HEADERS,
  isLegacySheetHeader,
  isCurrentSheetHeader,
  remapLegacySheetRow,
  remapShiftedSheetRow,
  isShiftedSheetRow,
  dateHintForShiftedRow,
  rowFromEntry,
  normalizeSheetStatus,
  findDecisionForSheetRow,
  looksLikeJobId,
  normalizeSheetRow,
  nextSheetDataRow,
} from './google-sheets.mjs';

describe('sheet layout', () => {
  it('headers start with Date, Company, Title, Applied, Links', () => {
    assert.deepEqual(SHEET_HEADERS.slice(0, 5), [
      'Date',
      'Company',
      'Title',
      'Applied',
      'Links',
    ]);
    assert.ok(!SHEET_HEADERS.includes('Job ID'));
  });

  it('detects legacy vs current header', () => {
    assert.equal(isLegacySheetHeader(['Job ID', 'Date', 'Company']), true);
    assert.equal(isLegacySheetHeader(['Date', 'Company', 'Title', 'Job ID']), true);
    assert.equal(isCurrentSheetHeader(['Date', 'Company', 'Title', 'Applied', 'Links']), true);
    assert.equal(isCurrentSheetHeader(['Date', 'Company', 'Job ID', 'Applied']), false);
    assert.equal(isCurrentSheetHeader(['Job ID', 'Date']), false);
  });

  it('detects a Job ID cell and remaps only those rows', () => {
    assert.equal(looksLikeJobId('germany:linkedin:11a9b9e41efe'), true);
    assert.equal(looksLikeJobId('2026-09-01'), false);
    const mixed = normalizeSheetRow([
      '2026-09-01', 'Neue GmbH', 'AI Engineer', 'applied', 'https://example.com/new',
    ]);
    assert.equal(mixed[0], '2026-09-01');
    assert.equal(mixed[1], 'Neue GmbH');
    const legacy = normalizeSheetRow([
      'germany:linkedin:abc', '2026-08-03', 'Acme', 'Full Stack Engineer', 'Berlin', 'linkedin',
      'applied', 'https://example.com/job',
    ]);
    assert.equal(legacy[0], '2026-08-03');
    assert.equal(legacy[1], 'Acme');
    assert.equal(legacy[3], 'applied');
    assert.equal(legacy[4], 'https://example.com/job');
  });

  it('repairs a shifted row so Date is first like new Apply writes', () => {
    const shifted = [
      'GSK Stockmann',
      'Fullstack Software Engineer Tech & AI (m/w/d)',
      'applied',
      'linkedin',
      '',
      'https://www.linkedin.com/jobs/view/4446834664',
      'Berlin',
      '2026-08-10',
      '',
      'no',
      '2026-08-06T12:30:43.743Z',
    ];
    assert.equal(isShiftedSheetRow(shifted), true);
    assert.equal(isShiftedSheetRow(['2026-08-31', 'adesso SE', 'Full Stack', 'applied', 'https://x.test']), false);
    const hint = dateHintForShiftedRow(shifted, [
      { date: '2026-08-03', url: 'https://www.linkedin.com/jobs/view/4446834664' },
    ]);
    assert.equal(hint, '2026-08-03');
    const fixed = remapShiftedSheetRow(shifted, hint);
    assert.deepEqual(fixed.slice(0, 7), [
      '2026-08-03',
      'GSK Stockmann',
      'Fullstack Software Engineer Tech & AI (m/w/d)',
      'applied',
      'https://www.linkedin.com/jobs/view/4446834664',
      'Berlin',
      'linkedin',
    ]);
    const viaNormalize = normalizeSheetRow(shifted, hint);
    assert.equal(viaNormalize[0], '2026-08-03');
    assert.equal(viaNormalize[1], 'GSK Stockmann');
  });

  it('writes the next row after the last used data row', () => {
    assert.equal(nextSheetDataRow([]), 2);
    assert.equal(nextSheetDataRow([['Date', 'Company']]), 2);
    assert.equal(nextSheetDataRow([['Date'], ['2026-09-01', 'Acme']]), 3);
  });

  it('remaps a legacy row and drops Job ID', () => {
    const old = [
      'germany:linkedin:abc',
      '2026-08-03',
      'Acme',
      'Full Stack Engineer',
      'Berlin',
      'linkedin',
      'applied',
      'https://example.com/job',
      'note',
      '2026-08-10',
      '60k',
      'yes',
      '2026-08-03T12:00:00.000Z',
    ];
    assert.deepEqual(remapLegacySheetRow(old), [
      '2026-08-03',
      'Acme',
      'Full Stack Engineer',
      'applied',
      'https://example.com/job',
      'Berlin',
      'linkedin',
      'note',
      '2026-08-10',
      '60k',
      'yes',
      '2026-08-03T12:00:00.000Z',
    ]);
  });

  it('new rows use the same column order and no Job ID', () => {
    const row = rowFromEntry(
      {
        id: 'germany:linkedin:abc',
        date: '2026-09-01',
        company: 'Neue GmbH',
        title: 'AI Engineer',
        decision: 'applied',
        url: 'https://example.com/new',
        board: 'indeed',
        note: '',
        followUpDate: '2026-09-08',
      },
      { location: 'Munich', salary: '', remote: true },
    );
    assert.equal(row[0], '2026-09-01');
    assert.equal(row[1], 'Neue GmbH');
    assert.equal(row[2], 'AI Engineer');
    assert.equal(row[3], 'applied');
    assert.equal(row[4], 'https://example.com/new');
    assert.equal(row.length, SHEET_HEADERS.length);
    assert.ok(!row.includes('germany:linkedin:abc'));
  });

  it('normalizes sheet Applied values to rejected', () => {
    assert.equal(normalizeSheetStatus('rejected'), 'rejected');
    assert.equal(normalizeSheetStatus('Rejected'), 'rejected');
    assert.equal(normalizeSheetStatus('abgelehnt'), 'rejected');
    assert.equal(normalizeSheetStatus('applied'), 'applied');
    assert.equal(normalizeSheetStatus(''), null);
  });

  it('matches a sheet row to a local decision by URL then company+title', () => {
    const decisions = [
      { id: 'germany:linkedin:1', url: 'https://example.com/a', company: 'Acme', title: 'AI Engineer' },
    ];
    assert.equal(
      findDecisionForSheetRow({ links: 'https://example.com/a' }, decisions, []).id,
      'germany:linkedin:1',
    );
    assert.equal(
      findDecisionForSheetRow({ company: 'Acme', title: 'AI Engineer', links: '' }, decisions, []).id,
      'germany:linkedin:1',
    );
    assert.equal(
      findDecisionForSheetRow({ company: 'Nope', title: 'Other', links: '' }, decisions, []),
      null,
    );
  });
});
