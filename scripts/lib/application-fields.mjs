import { VALID_DECISIONS } from './decisions.mjs';
import { validDateKey } from '../../web/public/tracker-view.js';

export function applicationFields(body, { creating = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Application fields are required');
  const fields = {};
  const limits = { title: 300, company: 300, location: 300, salary: 150, contactName: 200, contactEmail: 254, contactPhone: 100, url: 2000, note: 10000 };
  for (const [key, limit] of Object.entries(limits)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string') throw new Error(`${key} must be text`);
    const value = body[key].trim();
    if (value.length > limit) throw new Error(`${key} is too long (maximum ${limit} characters)`);
    if (['title', 'company'].includes(key) && !value) throw new Error('Company and job title are required');
    fields[key] = value;
  }
  if (creating && (!fields.title || !fields.company)) throw new Error('Company and job title are required');
  if (fields.url) {
    let url;
    try { url = new URL(fields.url); } catch { throw new Error('Use a complete http:// or https:// job URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an http:// or https:// job URL without credentials');
    fields.url = url.href;
  }
  if (fields.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contactEmail)) throw new Error('Enter a valid contact email');
  for (const key of ['appliedDate', 'followUpDate']) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && body[key] !== '' && !validDateKey(body[key])) throw new Error(`Enter a valid ${key === 'appliedDate' ? 'application' : 'follow-up'} date`);
    fields[key] = body[key] || null;
  }
  if (body.decision !== undefined) {
    if (!VALID_DECISIONS.includes(body.decision)) throw new Error('Choose a valid application status');
    fields.decision = body.decision;
  }
  if (creating) fields.decision ||= 'applied';
  return fields;
}
