import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiscoveryScheduler, nextDailyRun } from './discovery-scheduler.mjs';
test('timezone scheduling skips DST gaps and repeated local-time occurrences', () => {
  assert.equal(nextDailyRun(new Date('2026-03-29T00:00:00Z'), '02:30', 'Europe/Berlin'), '2026-03-30T00:30:00.000Z');
  assert.equal(nextDailyRun(new Date('2026-10-25T00:31:00Z'), '02:30', 'Europe/Berlin'), '2026-10-26T01:30:00.000Z');
});
test('persisted schedules coalesce missed runs, prevent overlap and deduplicate alerts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'scout-schedule-')); t.after(() => rm(root, { recursive: true, force: true }));
  let time = new Date('2026-01-01T08:00:00Z'), runs = 0, external = 0, jobs = [];
  const options = { root, now: () => time, runSearch: async () => { runs++; }, observe: async () => ({ jobs, followUps: [{ id: 'fixture', followUpDate: '2026-01-01' }] }), external: async () => { external++; } };
  let scheduler = createDiscoveryScheduler(options);
  await scheduler.configure({ schedule: { market: 'GB', time: '09:00', timezone: 'Europe/London', enabled: true } });
  await scheduler.configure({ schedule: { market: 'GB', time: '09:00', timezone: 'Europe/London', enabled: true } });
  assert.equal((await scheduler.snapshot()).schedules.length, 1);
  await scheduler.tick(); time = new Date('2026-01-05T10:00:00Z');
  scheduler = createDiscoveryScheduler(options); await Promise.all([scheduler.tick(), scheduler.tick()]); assert.equal(runs, 1);
  jobs = [{ id: 'new', meaningful: true }]; await scheduler.tick(); await scheduler.tick();
  const data = await scheduler.snapshot(); assert.equal(data.notifications.length, 2); assert.equal(external, 0);
  assert.ok(data.schedules[0].nextRun > time.toISOString());
  await assert.rejects(scheduler.configure({ externalEnabled: true }), /consent/);
  await assert.rejects(scheduler.configure({ schedule: { market: 'GB', time: '09:00', timezone: 'UTC', enabled: true, allowPaid: true } }), /permission/);
});
