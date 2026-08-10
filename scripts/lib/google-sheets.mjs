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

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Statuses written/updated in the sheet (application pipeline). */
export const SHEET_SYNC_DECISIONS = ['applied', 'interviewing', 'rejected', 'closed'];

export const SHEET_HEADERS = [
  'Job ID',
  'Date',
  'Company',
  'Title',
  'Location',
  'Board',
  'Status',
  'URL',
  'Note',
  'Follow-up',
  'Salary',
  'Remote',
  'Updated at',
];

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

async function ensureHeaderRow() {
  const tab = sheetsTabName();
  const data = await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, 'A1:M1'))}`,
  );
  const row = data.values?.[0] || [];
  if (row[0] === SHEET_HEADERS[0] && row.length >= 3) return { created: false };

  await sheetsFetch(`/values/${encodeURIComponent(a1(tab, 'A1'))}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: { values: [SHEET_HEADERS] },
  });
  return { created: true };
}

async function loadIdRowMap() {
  const tab = sheetsTabName();
  const data = await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, 'A:A'))}`,
  );
  const rows = data.values || [];
  const map = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const id = String(rows[i]?.[0] || '').trim();
    if (id) map.set(id, i + 1); // 1-based sheet row
  }
  return map;
}

function rowFromEntry(entry, job = null) {
  const remote = job?.remote === true ? 'yes' : job?.remote === false ? 'no' : '';
  return [
    entry.id || '',
    entry.date || '',
    entry.company || job?.company || '',
    entry.title || job?.title || '',
    job?.location || '',
    entry.board || job?.board || '',
    entry.decision || '',
    entry.url || job?.url || '',
    entry.note || '',
    entry.followUpDate || '',
    job?.salary || '',
    remote,
    new Date().toISOString(),
  ];
}

/**
 * Upsert one decision into the sheet (by Job ID in column A).
 */
export async function upsertDecisionToSheet(entry, job = null) {
  if (!entry?.id) throw new Error('entry.id required');
  if (!SHEET_SYNC_DECISIONS.includes(entry.decision)) {
    return { skipped: true, reason: `status ${entry.decision} not synced` };
  }

  await ensureHeaderRow();
  const map = await loadIdRowMap();
  const values = [rowFromEntry(entry, job)];
  const tab = sheetsTabName();
  const existingRow = map.get(entry.id);

  if (existingRow) {
    await sheetsFetch(
      `/values/${encodeURIComponent(a1(tab, `A${existingRow}:M${existingRow}`))}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: { values } },
    );
    return { ok: true, action: 'updated', row: existingRow, url: sheetsUrl() };
  }

  await sheetsFetch(
    `/values/${encodeURIComponent(a1(tab, 'A:M'))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: { values } },
  );
  return { ok: true, action: 'appended', url: sheetsUrl() };
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
  await ensureHeaderRow();

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

  return {
    ok: errors.length === 0,
    synced: entries.length,
    appended,
    updated,
    errors,
    url: sheetsUrl(),
    status,
  };
}

/**
 * Best-effort sync after a decision change. Never throws.
 */
export async function maybeSyncDecisionToSheet(entry) {
  try {
    const status = await sheetsStatus();
    if (!status.configured) return { skipped: true, reason: 'not configured' };
    if (!SHEET_SYNC_DECISIONS.includes(entry?.decision)) {
      return { skipped: true, reason: 'status not synced' };
    }
    const jobsData = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
    const job = (jobsData.jobs || []).find((j) => j.id === entry.id) || null;
    const result = await upsertDecisionToSheet(entry, job);
    return { ...result, status };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
