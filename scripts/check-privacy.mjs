#!/usr/bin/env node
// Check publishable files without printing candidate details or secret values.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const run = promisify(execFile);
const cwd = process.cwd();
const staged = process.argv.includes('--staged');
const git = async args => (await run('git', args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })).stdout;
const optional = async file => { try { return await readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } };
const needles = [];
function add(label, value) {
  if (typeof value !== 'string') return;
  const text = value.trim();
  if (text.length < 5 || /YOUR_|example\.(com|org|net)|^https?:\/\/?$/i.test(text)) return;
  needles.push({ label, value: text.toLowerCase() });
}
const profileText = await optional('profile.json');
const memoryText = await optional('state/memory.json');
const memory = memoryText ? JSON.parse(memoryText) : null;
const localPromptText = await optional('prompts/local.json');
const localPrompts = localPromptText ? JSON.parse(localPromptText.replace(/^\uFEFF/, '')) : {};
const legacyProfile = profileText ? JSON.parse(profileText) : {};
const profile = memory?.facts || legacyProfile;
// Keep checking retired source identities as well as current canonical values.
add('candidate name', legacyProfile.name);
for (const value of Object.values(legacyProfile.links || {})) add('candidate contact/link', value);
add('candidate name', profile.name);
add('candidate handle', profile.githubUsername);
for (const value of Object.values(profile.links || {})) add('candidate contact/link', value);
for (const key of ['email', 'phone', 'phoneNumber']) add('candidate contact', profile[key]);
for (const entry of profile.experience || []) {
  if (!/^(personal|independent)$/i.test(entry.org || '')) add('candidate employer/project', entry.org);
  add('candidate employer', entry.employer);
  add('candidate client', entry.client);
}
for (const entry of profile.education || []) add('candidate school', entry.school);
for (const entry of profile.projects || []) {
  for (const key of ['name', 'url', 'repository', 'repo']) add('candidate project', entry[key]);
}
// Long private text is checked independently of identity fields. Short generic
// values (skill names, fonts, yes/no answers, etc.) are not personal identifiers.
function addPrivateText(label, value) {
  if (typeof value === 'string' && value.trim().length >= 40) {
    add(label, value);
    for (const line of value.split(/\r?\n/)) if (line.trim().length >= 40) add(label, line);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) addPrivateText(label, item);
  }
}
addPrivateText('private candidate preference', memory?.preferences);
addPrivateText('private saved answer', memory?.answers);
addPrivateText('private prompt instruction', localPrompts.instructions);
for (const template of localPrompts.templates || []) {
  if (String(template.id || '').length >= 12) add('private template ID', template.id);
  if (String(template.name || '').length >= 12) add('private template name', template.name);
}
for (const value of [memory?.facts?.background?.techStack, memory?.facts?.background?.coverLetterNotes,
  memory?.preferences?.agentRules, memory?.preferences?.writingRules]) {
  if (value) add('private memory content', value);
}
const resume = await optional('cv/resume.md');
for (const value of resume.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) add('candidate email', value);
for (const value of resume.match(/\+\d[\d ()-]{8,}\d/g) || []) add('candidate phone', value);
for (const line of (await optional('.env')).split(/\r?\n/)) {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
  if (m && /TOKEN|SECRET|PASSWORD|API_KEY|PROJECT_ID|SPREADSHEET_ID/.test(m[1])) {
    const value = m[2].replace(/^['"]|['"]$/g, '');
    if (value.length >= 8 && !/^x+$/i.test(value)) add('configured secret/private ID', value);
  }
}
const privatePath = file => {
  if (file === 'prompts/local.json') return true;
  if (/^(?:profile|search-profile)(?:\.[^/]*)?\.json$/.test(file)) return !file.endsWith('.example.json');
  if (/^cv\//.test(file)) return !/^cv\/(?:\.gitkeep|README\.md|(?:resume|cover-letter|cover-letter-notes)\.example\.md)$/.test(file);
  if (/^state\//.test(file)) return !/^state\/[^/]+\.example\.json$/.test(file) && file !== 'state/.gitkeep';
  return /^(?:\.env(?:\.|$)|secrets\/|\.workspace\/|\.cv-workspace\/|downloads\/|backups\/|outputs\/|work\/|\.agents\/skills\/cv-tailor\.local\/)/.test(file) && file !== '.env.example'
    || /\.(?:pdf|docx|pem|key|p12|pfx|bak|backup)$/i.test(file);
};
const files = [...new Set((await git(staged ? ['ls-files', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean))];
const problems = [];
for (const file of files) {
  if (privatePath(file)) problems.push({ file, reason: 'private/generated file in publishable set' });
  let text;
  try { text = staged ? await git(['show', ':' + file]) : await readFile(file, 'utf8'); }
  catch (e) { if (!staged && e.code === 'ENOENT') continue; throw e; }
  const lower = text.toLowerCase();
  const labels = [...new Set(needles.filter(n => lower.includes(n.value)).map(n => n.label))];
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) labels.push('private key');
  if (labels.length) problems.push({ file, reason: labels.join(', ') });
}
for (const item of problems) console.error(`${item.file}: ${item.reason}`);
if (problems.length) {
  console.error(`Privacy check failed (${staged ? 'Git index' : 'working files'}). Values have been withheld.`);
  process.exitCode = 1;
} else console.log(`Privacy check passed: ${files.length} ${staged ? 'indexed' : 'publishable working'} files. Checks known local identity values and private file paths; not a complete secret scanner.`);
