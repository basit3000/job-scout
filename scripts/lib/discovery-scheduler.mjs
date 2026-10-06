import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './common.mjs';
import { readPrivate, writePrivate } from './private-store.mjs';

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}
export function nextDailyRun(now, time, timezone) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Use HH:MM for the schedule time');
  const current = localParts(now, timezone); // validates the IANA timezone
  const start = Math.floor(new Date(now).getTime() / 60000) * 60000 + 60000;
  for (let minute = 0; minute < 3 * 24 * 60; minute++) {
    const date = new Date(start + minute * 60000), local = localParts(date, timezone);
    if (local.time === time && !(local.day === current.day && current.time >= time)) return date.toISOString();
  }
  throw new Error('No schedule occurrence found');
}

export function createDiscoveryScheduler({ root = ROOT, now = () => new Date(), busy = () => false, runSearch,
  observe = async () => ({ jobs: [], followUps: [] }), external = async () => {} }) {
  const path = join(root, 'state', 'discovery.json'); let ticking = false, queue = Promise.resolve();
  const initial = { schedules: [], notifications: [], seen: [], initialized: false, externalEnabled: false };
  const read = () => readPrivate(path, initial);
  const mutate = fn => { const task = queue.catch(() => {}).then(async () => { const data = await read(); const result = await fn(data); await writePrivate(path, data); return result; }); queue = task; return task; };
  async function notify(data, key, kind, message, jobId) {
    if (data.seen.includes(key)) return;
    data.seen.push(key);
    const notification = { id: randomUUID(), key, kind, message, jobId, createdAt: now().toISOString(), read: false };
    data.notifications = [...data.notifications, notification].slice(-500);
    if (data.externalEnabled) {
      // Persist delivery intent before sending; uncertain deliveries are never retried automatically.
      notification.external = 'attempted'; await writePrivate(path, data);
      try { await external({ kind, message }); notification.external = 'delivered'; }
      catch { notification.external = 'failed'; data.externalEnabled = false; data.notifications.push({ id: randomUUID(), kind: 'failure', message: 'External notification failed; integration disabled. Check configuration before enabling again.', createdAt: now().toISOString(), read: false }); }
    }
  }
  return {
    snapshot: read,
    async configure(body) {
      return mutate(data => {
        if (body.externalEnabled !== undefined) {
          if (body.externalEnabled && body.consent !== true) throw new Error('External alerts require explicit consent.');
          data.externalEnabled = body.externalEnabled === true;
        }
        if (body.markRead) for (const item of data.notifications) item.read = true;
        if (body.remove) data.schedules = data.schedules.filter(s => s.id !== body.remove);
        if (body.schedule) {
          const input = body.schedule;
          if (!['DE','GB','US','AE','SA','IN'].includes(input.market)) throw new Error('Choose one supported market');
          const nextRun = nextDailyRun(now(), input.time, input.timezone);
          if (input.allowPaid && input.paidConsent !== true) throw new Error('Paid scheduled searches require explicit permission.');
          const previous = data.schedules.find(s => input.id ? s.id === input.id : s.market === input.market && s.time === input.time && s.timezone === input.timezone);
          const schedule = { ...previous, id: previous?.id || randomUUID(), market: input.market, time: input.time, timezone: input.timezone,
            enabled: input.enabled === true, allowPaid: input.allowPaid === true, nextRun, status: input.enabled ? 'scheduled' : 'paused' };
          if (previous) Object.assign(previous, schedule); else data.schedules.push(schedule);
        }
        return data;
      });
    },
    async tick() {
      if (ticking) return; ticking = true;
      try {
        const observations = await observe();
        await mutate(async data => {
          if (!data.initialized) { data.seen.push(...observations.jobs.map(job => `job:${job.id}`)); data.initialized = true; }
          else for (const job of observations.jobs) {
            if (job.meaningful) await notify(data, `job:${job.id}`, 'match', 'A new matching vacancy is available.', job.id);
          }
          const today = localParts(now(), data.schedules[0]?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone).day;
          for (const item of observations.followUps) if (item.followUpDate <= today) await notify(data, `followup:${item.id}:${item.followUpDate}`, 'followup', 'An application follow-up is due.', item.id);
          for (const schedule of data.schedules) if (schedule.status === 'running') {
            schedule.status = 'interrupted'; schedule.nextRun = nextDailyRun(now(), schedule.time, schedule.timezone);
            await notify(data, `interrupted:${schedule.id}:${schedule.lastRun}`, 'failure', 'Scheduled search interrupted. Next run scheduled; no automatic replay.');
          }
        });
        if (busy()) return;
        const due = (await read()).schedules.find(s => s.enabled && s.nextRun <= now().toISOString());
        if (!due) return;
        const reserved = await mutate(data => {
          const s = data.schedules.find(s => s.id === due.id);
          if (!s?.enabled || s.nextRun > now().toISOString()) return false;
          for (const item of data.schedules.filter(item => item.enabled && item.market === s.market && item.nextRun <= now().toISOString())) {
            item.status = item.id === s.id ? 'running' : 'coalesced'; item.lastRun = now().toISOString(); item.nextRun = nextDailyRun(now(), item.time, item.timezone);
          }
          return true;
        });
        if (!reserved) return;
        try {
          await runSearch(due);
          await mutate(data => { const s = data.schedules.find(s => s.id === due.id); if (s) { s.status = 'complete'; s.lastFinished = now().toISOString(); } });
        } catch {
          await mutate(async data => { const s = data.schedules.find(s => s.id === due.id); if (s) { s.status = 'failed'; await notify(data, `failed:${s.id}:${s.lastRun}`, 'failure', 'Scheduled search failed. Inspect Activity and source status.'); } });
        }
      } finally { ticking = false; }
    },
  };
}

export async function sendExternalNotification(notification, { url = process.env.JOB_SCOUT_NOTIFICATION_WEBHOOK, fetchImpl = fetch } = {}) {
  const endpoint = new URL(url || '');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Configure an HTTPS notification webhook');
  const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notification) });
  if (!response.ok) throw new Error('Notification delivery failed');
}
