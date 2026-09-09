import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { ROOT } from './common.mjs';
import { loadDecisions, patchDecision } from './decisions.mjs';

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(['.pdf', '.docx', '.txt']);
export async function addApplicationAttachment(id, payload, { root = ROOT } = {}) {
  const name = payload.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 180 || /[\\/\x00-\x1f]/.test(name)) throw new Error('Choose a valid filename');
  const extension = extname(name).toLowerCase();
  if (!TYPES.has(extension)) throw new Error('Choose a PDF, DOCX, or TXT document');
  if (typeof payload.data !== 'string' || !payload.data || payload.data.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.data)) throw new Error('Invalid file data or file exceeds 8 MB');
  const bytes = Buffer.from(payload.data, 'base64');
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('File must be between 1 byte and 8 MB');
  if (extension === '.pdf' && bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('This file does not appear to be a PDF');
  if (extension === '.docx' && bytes.subarray(0, 4).toString('hex') !== '504b0304') throw new Error('This file does not appear to be a DOCX');
  const attachment = { id: randomUUID(), name, size: bytes.length, addedAt: new Date().toISOString(), kind: ['cv', 'letter', 'other'].includes(payload.kind) ? payload.kind : 'other' };
  const dir = join(root, 'state', 'attachments');
  const path = join(dir, attachment.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' });
  try {
    await patchDecision(id, (entry) => {
      if ((entry.attachments || []).length >= 20) throw new Error('This application already has 20 attachments');
      return { attachments: [...(entry.attachments || []), attachment] };
    }, { root });
  } catch (err) { await rm(path, { force: true }); throw err; }
  return attachment;
}

export async function applicationAttachment(id, attachmentId, { root = ROOT } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(attachmentId)) throw new Error('Attachment not found');
  const log = await loadDecisions(root);
  const entry = log.decisions.find((item) => item.id === id);
  const attachment = entry?.attachments?.find((item) => item.id === attachmentId);
  if (!attachment) throw new Error('Attachment not found');
  return { ...attachment, path: join(root, 'state', 'attachments', attachmentId) };
}
