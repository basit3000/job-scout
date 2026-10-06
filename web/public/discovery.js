export function openDiscovery() {
  const dialog = document.createElement('dialog'); dialog.className = 'document-editor-dialog';
  dialog.innerHTML = `<h2>Discovery tools</h2><p>Schedules run only while Job Scout is running. Missed searches coalesce to one run.</p>
    <h3>Daily schedule</h3><label>Market <select id="scheduleMarket">${['DE','GB','US','AE','SA','IN'].map(id => `<option>${id}</option>`).join('')}</select></label>
    <label>Time <input id="scheduleTime" type="time" value="09:00"></label><label>Timezone <input id="scheduleZone"></label>
    <label><input type="checkbox" id="schedulePaid">Allow paid Apify for this schedule</label><button id="scheduleCreate">Enable daily search</button>
    <div id="scheduleList"></div><h3>Notifications</h3><div id="notificationList"></div><button id="notificationsRead">Mark all read</button>
    <label><input type="checkbox" id="externalAlerts">Enable external webhook alerts (consent to sharing generic alert messages)</label><button id="externalSave">Save notification choice</button>
    <p>Configure JOB_SCOUT_NOTIFICATION_WEBHOOK in .env first. External alerts are off by default.</p>
    <h3>Semantic search</h3><p>Uses the optional local embedding configuration. Falls back to deterministic matching if unavailable.</p>
    <label>Related work or interests <input id="semanticQuery"></label><button id="semanticSearch">Search current results</button><div id="semanticResults"></div>
    <p id="discoveryStatus" role="status"></p><button id="discoveryClose">Close</button>`;
  document.body.append(dialog); dialog.showModal();
  const el = id => dialog.querySelector('#' + id);
  el('scheduleZone').value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const request = async (path, body) => { const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; };
  const run = fn => async () => { try { await fn(); } catch (error) { el('discoveryStatus').textContent = error.message; } };
  const refresh = async () => {
    const data = await request('/api/discovery'); el('externalAlerts').checked = data.externalEnabled;
    el('scheduleList').replaceChildren();
    for (const schedule of data.schedules) {
      const row = document.createElement('p'); row.textContent = `${schedule.market} ${schedule.time} ${schedule.timezone}: ${schedule.status}; last ${schedule.lastRun || 'never'}; next ${schedule.enabled ? schedule.nextRun : 'paused'} `;
      const pause = document.createElement('button'); pause.textContent = schedule.enabled ? 'Pause' : 'Resume';
      pause.onclick = run(async () => { await request('/api/discovery', { schedule: { ...schedule, enabled: !schedule.enabled, paidConsent: schedule.allowPaid } }); await refresh(); });
      const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.onclick = run(async () => { await request('/api/discovery', { remove: schedule.id }); await refresh(); });
      row.append(pause, remove); el('scheduleList').append(row);
    }
    el('notificationList').replaceChildren();
    for (const note of data.notifications.slice().reverse()) { const row = document.createElement('p'); row.textContent = `${note.read ? '' : 'New: '}${note.message} ${note.createdAt}`; el('notificationList').append(row); }
  };
  el('scheduleCreate').onclick = run(async () => { await request('/api/discovery', { schedule: { market: el('scheduleMarket').value, time: el('scheduleTime').value, timezone: el('scheduleZone').value, enabled: true, allowPaid: el('schedulePaid').checked, paidConsent: el('schedulePaid').checked } }); await refresh(); });
  el('externalSave').onclick = run(async () => { await request('/api/discovery', { externalEnabled: el('externalAlerts').checked, consent: el('externalAlerts').checked }); await refresh(); });
  el('notificationsRead').onclick = run(async () => { await request('/api/discovery', { markRead: true }); await refresh(); });
  el('semanticSearch').onclick = run(async () => {
    el('discoveryStatus').textContent = 'Searching…';
    const result = await request('/api/semantic-search', { query: el('semanticQuery').value });
    el('discoveryStatus').textContent = result.reason; el('semanticResults').replaceChildren();
    for (const row of result.results.slice(0, 30)) {
      const p = document.createElement('p'); p.textContent = `${row.job.title} — ${row.job.company}: ${row.fit.verdict}${row.excluded ? ' (excluded)' : ''}; similarity ${row.similarity == null ? 'unknown' : row.similarity.toFixed(3)}. ${(row.fit.gaps || []).join('; ')}`;
      const link = document.createElement('a'); link.textContent = ' Open posting'; if (/^https?:\/\//.test(row.job.url)) link.href = row.job.url; link.target = '_blank'; link.rel = 'noopener'; p.append(link); el('semanticResults').append(p);
    }
  });
  el('discoveryClose').onclick = () => dialog.remove(); run(refresh)();
}
