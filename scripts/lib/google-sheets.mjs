/**
 * Direct Google Sheets sync (service account — no Zapier).
 *
 * Env:
 *   GOOGLE_SHEETS_SPREADSHEET_ID  — from the sheet URL
 *   GOOGLE_SHEETS_CREDENTIALS     — path to service-account JSON (default: secrets/google-sheets.json)
 *   GOOGLE_SHEETS_TAB             — tab/sheet name (default: Applications)
 *
 * Share the spreadsheet with the service account email (Editor).
 */

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ROOT, loadJson, workspaceDir } from './common.mjs';
import { loadDecisions, recordDecision } from './decisions.mjs';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Statuses written/updated in the sheet (application pipeline). */
export const SHEET_SYNC_DECISIONS = ['applied', 'interviewing', 'rejected', 'closed'];

export const SHEET_HEADERS = [
  'Date',
  'Company',
  'Title',
  'Applied',
  'Links',
  'Location',
  'Board',
  'Note',
  'Follow-up',
  'Salary',
  'Remote',
  'Updated at',
];

const LAST_COL = 'L';

export function looksLikeJobId(cell) {
  return /^[a-z][a-z0-9_-]*:[a-z0-9._-]+:[a-z0-9._-]+$/i.test(String(cell || '').trim());
}

export function looksLikeIsoDate(cell) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(cell || '').trim());
}

/**
 * Company in A, status in C, board in D, URL in F — leftover after a remap
 * that dropped Date. New Apply rows already use Date first.
 */
export function isShiftedSheetRow(row = []) {
  if (looksLikeIsoDate(row[0]) || looksLikeJobId(row[0])) return false;
  const status = String(row[2] || '').trim().toLowerCase();
  if (!SHEET_SYNC_DECISIONS.includes(status) && status !== 'shortlisted') return false;
  const url = String(row[5] || '').trim();
  const board = String(row[3] || '').trim();
  return /^https?:\/\//i.test(url) || (Boolean(board) && !/^https?:\/\//i.test(board));
}

export function isLegacySheetHeader(row) {
  const cells = (row || []).map((c) => String(c || '').trim().toLowerCase());
  return cells[0] === 'job id' || cells.includes('job id');
}

export function isCurrentSheetHeader(row) {
  const cells = (row || []).map((c) => String(c || '').trim());
  return cells[0] === 'Date'
    && cells[1] === 'Company'
    && cells[2] === 'Title'
    && cells[3] === 'Applied'
    && cells[4] === 'Links';
}

/** Old: Job ID, Date, Company, Title, Location, Board, Status, URL, … */
export function remapLegacySheetRow(old = []) {
  const r = Array.isArray(old) ? old : [];
  return [
    r[1] || '',
    r[2] || '',
    r[3] || '',
    r[6] || '',
    r[7] || '',
    r[4] || '',
    r[5] || '',
    r[8] || '',
    r[9] || '',
    r[10] || '',
    r[11] || '',
    r[12] || '',
  ];
}

function dateFromUpdatedAt(cell) {
  const s = String(cell || '').trim();
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : '';
}

export function remapShiftedSheetRow(row = [], dateHint = '') {
  const r = Array.isArray(row) ? row : [];
  return [
    dateHint || dateFromUpdatedAt(r[10]) || '',
    r[0] || '',
    r[1] || '',
    r[2] || '',
    r[5] || '',
    r[6] || '',
    r[3] || '',
    r[4] || '',
    r[7] || '',
    r[8] || '',
    r[9] || '',
    r[10] || '',
  ];
}

export function rowFromEntry(entry, job = null) {
  const remote = job?.remote === true ? 'yes' : job?.remote === false ? 'no' : '';
  return [
    entry.date || '',
    entry.company || job?.company || '',
    entry.title || job?.title || '',
    entry.decision || '',
    entry.url || job?.url || '',
    job?.location || entry.location || '',
    entry.board || job?.board || '',
    entry.note || '',
    entry.followUpDate || '',
    job?.salary || entry.salary || '',
    remote,
    new Date().toISOString(),
  ];
}

/** 1-based sheet row to write the next application into (row 1 is the header). */
export function nextSheetDataRow(rows = []) {
  let last = 1;
  for (let i = 1; i < rows.length; i += 1) {
    if ((rows[i] || []).some((c) => String(c || '').trim())) last = i + 1;
  }
  return last + 1;
}

export function normalizeSheetRow(row = [], dateHint = '') {
  if (looksLikeJobId(row[0])) return remapLegacySheetRow(row);
  if (isShiftedSheetRow(row)) return remapShiftedSheetRow(row, dateHint);
  return SHEET_HEADERS.map((_, i) => row[i] || '');
}

export function dateHintForShiftedRow(row = [], decisions = []) {
  const url = String(row[5] || '').trim();
  const company = String(row[0] || '').trim().toLowerCase();
  const title = String(row[1] || '').trim().toLowerCase();
  if (url) {
    const byUrl = decisions.find((d) => String(d.url || '').trim() === url);
    if (byUrl?.date) return byUrl.date;
  }
  if (company && title) {
    const byCt = decisions.find(
      (d) => String(d.company || '').trim().toLowerCase() === company
        && String(d.title || '').trim().toLowerCase() === title,
    );
    if (byCt?.date) return byCt.date;
  }
  return '';
}

function rowMatchKeys(row) {
  const url = String(row?.[4] || '').trim();
  const company = String(row?.[1] || '').trim().toLowerCase();
  const title = String(row?.[2] || '').trim().toLowerCase();
  const keys = [];
  if (url) keys.push(`url:${url}`);
  if (company && title) keys.push(`ct:${company}|${title}`);
  return keys;
}

function entryMatchKeys(entry, job = null) {
  return rowMatchKeys(rowFromEntry(entry, job));
}

export function normalizeSheetStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['rejected', 'reject', 'abgelehnt', 'ablehnung'].includes(s)) return 'rejected';
  if (SHEET_SYNC_DECISIONS.includes(s)) return s;
  return null;
}

export function parseSheetDataRow(header, cells) {
  const obj = {};
  (header || SHEET_HEADERS).forEach((h, i) => {
    obj[h] = cells?.[i] ?? '';
  });
  return {
    date: obj.Date || cells?.[0] || '',
    company: obj.Company || cells?.[1] || '',
    title: obj.Title || cells?.[2] || '',
    applied: obj.Applied || cells?.[3] || '',
    links: obj.Links || cells?.[4] || '',
  };
}

export function findDecisionForSheetRow(row, decisions = [], jobs = []) {
  const url = String(row.links || '').trim();
  const company = String(row.company || '').trim().toLowerCase();
  const title = String(row.title || '').trim().toLowerCase();
  const pool = [
    ...(decisions || []),
    ...(jobs || []).map((j) => ({
      id: j.id,
      url: j.url,
      company: j.company,
      title: j.title,
    })),
  ];
  if (url) {
    const byUrl = pool.find((d) => String(d.url || '').trim() === url);
    if (byUrl?.id) return byUrl;
  }
  if (company && title) {
    return pool.find(
      (d) => d.id
        && String(d.company || '').trim().toLowerCase() === company
        && String(d.title || '').trim().toLowerCase() === title,
    ) || null;
  }
  return null;
}

let cachedToken = { accessToken: null, expiresAt: 0, email: null };

function credentialsPath() {
  const raw = (process.env.GOOGLE_SHEETS_CREDENTIALS || 'secrets/google-sheets.json').trim();
  return isAbsolute(raw) ? raw : join(ROOT, raw);
}

export function sheetsSpreadsheetId() {
  return (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '').trim();
}

export function sheetsTabName() {
  return (process.env.GOOGLE_SHEETS_TAB || 'Applications').trim() || 'Applications';
}

export function sheetsUrl() {
  const id = sheetsSpreadsheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

async function loadCredentials() {
  const path = credentialsPath();
  if (!existsSync(path)) {
    return { ok: false, error: `Credentials file missing: ${path}` };
  }
  let creds;
  try {
    creds = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    return { ok: false, error: `Invalid credentials JSON: ${err.message}` };
  }
  if (!creds.client_email || !creds.private_key) {
    return { ok: false, error: 'Credentials JSON needs client_email and private_key' };
  }
  return { ok: true, creds, path };
}

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken.accessToken
    && cachedToken.email === creds.client_email
    && cachedToken.expiresAt > now + 60
  ) {
    return cachedToken.accessToken;
  }

  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claim = b64urlJson({
    iss: creds.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(creds.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token HTTP ${res.status}`);
  }
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600),
    email: creds.client_email,
  };
  return cachedToken.accessToken;
}

async function sheetsFetch(path, { method = 'GET', body } = {}) {
  const loaded = await loadCredentials();
  if (!loaded.ok) throw new Error(loaded.error);
  const id = sheetsSpreadsheetId();
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');

  const token = await getAccessToken(loaded.creds);
  const url = path.startsWith('http') ? path : `${SHEETS_API}/${id}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.error_description || `Sheets HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function a1(tab, range) {
  const safe = `'${String(tab).replace(/'/g, "''")}'`;
  return `${safe}!${range}`;
}

export async function sheetsStatus() {
  const id = sheetsSpreadsheetId();
  const creds = await loadCredentials();
  const configured = Boolean(id && creds.ok);
  return {
    configured,
    spreadsheetId: id || null,
    url: sheetsUrl(),
    tab: sheetsTabName(),
    credentialsPath: credentialsPath(),
    credentialsOk: creds.ok,
    serviceAccountEmail: creds.ok ? creds.creds.client_email : null,
    hint: configured
      ? null
      : !id
        ? 'Set GOOGLE_SHEETS_SPREADSHEET_ID in .env'
        : creds.error || 'Add a service-account JSON and share the sheet with its email',
  };
}

export async function migrateSheetLayout() {
  return ensureLayout();
}

async function ensureLayout() {
  const tab = sheetsTabName();
  const data = await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, 'A:M'))}`,
  );
  const rows = data.values || [];
  const header = rows[0] || [];
  const headerIsData = looksLikeJobId(header[0]) || looksLikeIsoDate(header[0]);
  const dataRows = headerIsData ? rows : rows.slice(1);
  const needsHeader = !isCurrentSheetHeader(header);
  const needsRemap = isLegacySheetHeader(header)
    || dataRows.some((r) => looksLikeJobId(r[0]) || isShiftedSheetRow(r));

  if (!needsHeader && !needsRemap) return { migrated: false, rows };

  const log = await loadDecisions().catch(() => ({ decisions: [] }));
  const decisions = log.decisions || [];
  const next = [
    SHEET_HEADERS,
    ...dataRows.map((r) => {
      if (looksLikeJobId(r[0])) return remapLegacySheetRow(r);
      if (isShiftedSheetRow(r)) return remapShiftedSheetRow(r, dateHintForShiftedRow(r, decisions));
      return normalizeSheetRow(r);
    }),
  ];
  await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, `A1:${LAST_COL}${Math.max(next.length, 1)}`))}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: { values: next } },
  );
  await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, 'M:Z'))}:clear`,
    { method: 'POST', body: {} },
  );
  return { migrated: true, rows: next, remapped: next.length - 1 };
}

async function loadRowMap() {
  const tab = sheetsTabName();
  const data = await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, `A:${LAST_COL}`))}`,
  );
  const rows = data.values || [];
  const map = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const sheetRow = i + 1;
    for (const key of rowMatchKeys(rows[i])) {
      if (!map.has(key)) map.set(key, sheetRow);
    }
  }
  return map;
}

/**
 * Upsert one decision into the sheet (match by link, else company + title).
 */
export async function upsertDecisionToSheet(entry, job = null) {
  if (!entry?.id) throw new Error('entry.id required');
  if (!SHEET_SYNC_DECISIONS.includes(entry.decision)) {
    return { skipped: true, reason: `status ${entry.decision} not synced` };
  }

  const layout = await ensureLayout();
  const tab = sheetsTabName();
  const data = await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, `A:${LAST_COL}`))}`,
  );
  const rows = data.values || layout.rows || [];
  const map = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    for (const key of rowMatchKeys(rows[i])) {
      if (!map.has(key)) map.set(key, i + 1);
    }
  }
  const values = [rowFromEntry(entry, job)];
  let existingRow;
  for (const key of entryMatchKeys(entry, job)) {
    if (map.has(key)) {
      existingRow = map.get(key);
      break;
    }
  }

  const targetRow = existingRow || nextSheetDataRow(rows);
  await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, `A${targetRow}:${LAST_COL}${targetRow}`))}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: { values } },
  );
  return {
    ok: true,
    action: existingRow ? 'updated' : 'appended',
    row: targetRow,
    url: sheetsUrl(),
  };
}

/**
 * Sync all pipeline decisions from state/decisions.json.
 */
export async function syncDecisionsToSheet(decisions = null) {
  const status = await sheetsStatus();
  if (!status.configured) {
    return { ok: false, error: status.hint, status };
  }

  const log = decisions || (await loadJson(join(ROOT, 'state', 'decisions.json'), { decisions: [] }));
  const jobsData = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
  const byId = new Map((jobsData.jobs || []).map((j) => [j.id, j]));

  const entries = (log.decisions || []).filter((d) => SHEET_SYNC_DECISIONS.includes(d.decision));
  await ensureLayout();

  let appended = 0;
  let updated = 0;
  const errors = [];
  for (const entry of entries) {
    try {
      const result = await upsertDecisionToSheet(entry, byId.get(entry.id) || null);
      if (result.action === 'appended') appended += 1;
      else if (result.action === 'updated') updated += 1;
    } catch (err) {
      errors.push({ id: entry.id, error: err.message || String(err) });
    }
  }

  let pull = { skipped: true };
  try {
    pull = await pullRejectedFromSheet();
  } catch (err) {
    pull = { ok: false, error: err.message || String(err) };
  }

  return {
    ok: errors.length === 0 && pull.ok !== false,
    synced: entries.length,
    appended,
    updated,
    errors,
    pull,
    url: sheetsUrl(),
    status,
  };
}

async function readSheetEntries() {
  await ensureLayout();
  const tab = sheetsTabName();
  const data = await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, `A:${LAST_COL}`))}`,
  );
  const rows = data.values || [];
  const header = rows[0] || SHEET_HEADERS;
  return rows.slice(1).map((cells) => parseSheetDataRow(header, cells));
}

/**
 * Sheet → local: any row marked rejected updates the matching Job Scout decision.
 */
export async function pullRejectedFromSheet() {
  const status = await sheetsStatus();
  if (!status.configured) {
    return { ok: false, skipped: true, reason: status.hint, status };
  }

  const rows = await readSheetEntries();
  const log = await loadDecisions();
  const jobsData = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
  const updated = [];
  const unmatched = [];

  for (const row of rows) {
    if (normalizeSheetStatus(row.applied) !== 'rejected') continue;
    const match = findDecisionForSheetRow(row, log.decisions, jobsData.jobs || []);
    if (!match?.id) {
      unmatched.push({ company: row.company, title: row.title, links: row.links });
      continue;
    }
    const existing = log.decisions.find((d) => d.id === match.id);
    if (existing?.decision === 'rejected') continue;
    const result = await recordDecision(match.id, 'rejected', existing?.note || '');
    if (existing) {
      const i = log.decisions.findIndex((d) => d.id === match.id);
      if (i !== -1) log.decisions[i] = { ...log.decisions[i], decision: 'rejected' };
    } else {
      log.decisions.push({ id: match.id, decision: 'rejected' });
    }
    updated.push({
      id: match.id,
      from: result.previous || 'none',
      company: row.company,
      title: row.title,
    });
  }

  return {
    ok: true,
    pulled: updated.length,
    updated,
    unmatched,
    url: sheetsUrl(),
    status,
  };
}

/**
 * Best-effort sync after a decision change. Never throws.
 */
export async function maybeSyncDecisionToSheet(entry, jobSnapshot = null) {
  try {
    const status = await sheetsStatus();
    if (!status.configured) return { skipped: true, reason: 'not configured' };
    if (!SHEET_SYNC_DECISIONS.includes(entry?.decision)) {
      return { skipped: true, reason: 'status not synced' };
    }
    const jobsData = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
    const fromArchive = (jobsData.jobs || []).find((j) => j.id === entry.id) || null;
    const job = fromArchive || (jobSnapshot && typeof jobSnapshot === 'object' ? jobSnapshot : null);
    const result = await upsertDecisionToSheet(entry, job);
    return { ...result, status };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
