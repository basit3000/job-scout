export function mountDiscovery(container) {
  container.innerHTML = `<div class="discovery-intro page-guidance"><strong>A little help with your daily search.</strong><p>Schedules run while Job Scout is open. You choose when to search and which notifications to share.</p></div>
    <p id="discoveryStatus" class="workspace-feedback" role="status" aria-live="polite"></p>
    <div class="discovery-grid">
    <section class="tool-card"><span class="tool-category">AUTOMATE YOUR SEARCH</span><h3>Daily schedules</h3><p>Choose a market, local time and timezone. Missed searches are combined into one run when the app is next open.</p>
      <form id="scheduleForm" class="discovery-form"><label>Market<select id="scheduleMarket">${[['DE','Germany'],['GB','United Kingdom'],['US','United States'],['AE','United Arab Emirates'],['SA','Saudi Arabia'],['IN','India']].map(([id,name]) => `<option value="${id}">${name}</option>`).join('')}</select></label>
      <label>Search time<input id="scheduleTime" type="time" value="09:00" required></label><label class="field-wide">Timezone<input id="scheduleZone" required></label>
      <label class="check-row field-wide"><input type="checkbox" id="schedulePaid">Allow paid Apify searches for this schedule</label><button class="btn primary" id="scheduleCreate" type="submit">Enable daily search</button></form>
      <div id="scheduleList" class="discovery-list"></div></section>
    <section class="tool-card"><span class="tool-category">STAY UP TO DATE</span><h3>Notifications</h3><p>New matches, ready documents and follow-ups in one place.</p><div id="notificationList" class="discovery-list"></div><button class="btn" id="notificationsRead">Mark all read</button>
      <details class="discovery-external"><summary>External notification settings</summary><p>External alerts share generic notification messages with your configured webhook. They are off by default.</p><label class="check-row"><input type="checkbox" id="externalAlerts">Allow external webhook alerts</label><button class="btn" id="externalSave">Save notification choice</button><p class="meta">Requires JOB_SCOUT_NOTIFICATION_WEBHOOK in your local .env configuration.</p></details></section>
    <section class="tool-card discovery-semantic"><span class="tool-category">EXPLORE YOUR RESULTS</span><h3>Find related roles</h3><p>Describe the work you want to do. Searches your saved results with local embeddings when available, otherwise regular matching.</p>
      <form id="semanticForm" class="semantic-form"><label>Work or interests<input id="semanticQuery" placeholder="e.g. building reliable backend services" required></label><button class="btn primary" id="semanticSearch" type="submit">Search saved results</button></form><div id="semanticResults" class="discovery-list"></div></section>
    </div><div class="page-footer"><button class="btn" id="discoveryRefresh">Refresh schedules &amp; notifications</button> <button class="btn ghost" id="discoveryClose" data-go="results">Back to Find jobs</button></div>`;
  const el = id => container.querySelector('#' + id);
  el('scheduleZone').value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let loading = false, loaded = false, externalDirty = false;
  el('externalAlerts').onchange = () => { externalDirty = true; };
  const request = async (path, body) => {
    const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed. Try again.'); return data;
  };
  const message = (text, error = false) => { el('discoveryStatus').textContent = text; el('discoveryStatus').classList.toggle('is-error', error); };
  const run = fn => async event => {
    event?.preventDefault(); if (loading) return;
    loading = true; container.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await fn(); } catch (error) { message(error.message, true); }
    finally { loading = false; container.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  };
  const formatTime = value => value ? new Date(value).toLocaleString() : 'Not run yet';
  const button = (text, handler) => { const element = document.createElement('button'); element.type = 'button'; element.className = 'btn small'; element.textContent = text; element.onclick = run(handler); return element; };
  async function load() {
    const data = await request('/api/discovery');
    if (!externalDirty) el('externalAlerts').checked = Boolean(data.externalEnabled);
    el('scheduleList').replaceChildren();
    for (const schedule of data.schedules || []) {
      const row = document.createElement('article'); row.className = 'discovery-item';
      const title = document.createElement('strong'); title.textContent = `${schedule.market} · ${schedule.time} · ${schedule.timezone}`;
      const detail = document.createElement('p'); detail.textContent = `${schedule.status || (schedule.enabled ? 'Scheduled' : 'Paused')} · ${schedule.enabled ? `Next: ${formatTime(schedule.nextRun)}` : 'Paused'} · Last run: ${formatTime(schedule.lastRun)}`;
      const actions = document.createElement('div'); actions.className = 'discovery-actions';
      actions.append(button(schedule.enabled ? 'Pause' : 'Resume', async () => { await request('/api/discovery', { schedule: { ...schedule, enabled: !schedule.enabled, paidConsent: schedule.allowPaid } }); await load(); message('Schedule updated.'); }),
        button('Remove', async () => { if (!window.confirm('Remove this daily search schedule?')) return; await request('/api/discovery', { remove: schedule.id }); await load(); message('Schedule removed.'); }));
      row.append(title, detail, actions); el('scheduleList').append(row);
    }
    if (!data.schedules?.length) el('scheduleList').textContent = 'No schedules yet. Enable a daily search above to get started.';
    el('notificationList').replaceChildren();
    for (const note of (data.notifications || []).slice().reverse()) {
      const row = document.createElement('article'); row.className = `discovery-item${note.read ? '' : ' unread'}`;
      const title = document.createElement('strong'); title.textContent = `${note.read ? '' : 'New · '}${note.message}`;
      const time = document.createElement('p'); time.textContent = formatTime(note.createdAt); row.append(title, time); el('notificationList').append(row);
    }
    if (!data.notifications?.length) el('notificationList').textContent = 'You’re all caught up. Notifications will appear here as you search and prepare.';
    loaded = true;
  }
  const refresh = async () => {
    if (loaded) return;
    try { await load(); } catch (error) { message(`Could not load Discovery: ${error.message}`, true); }
  };
  el('discoveryRefresh').onclick = run(async () => { await load(); message('Schedules and notifications refreshed.'); });
  el('scheduleForm').onsubmit = run(async () => {
    await request('/api/discovery', { schedule: { market: el('scheduleMarket').value, time: el('scheduleTime').value, timezone: el('scheduleZone').value, enabled: true, allowPaid: el('schedulePaid').checked, paidConsent: el('schedulePaid').checked } });
    await load(); message('Daily search enabled. Keep Job Scout open at the scheduled time.');
  });
  el('externalSave').onclick = run(async () => { await request('/api/discovery', { externalEnabled: el('externalAlerts').checked, consent: el('externalAlerts').checked }); externalDirty = false; await load(); message('Notification choice saved.'); });
  el('notificationsRead').onclick = run(async () => { await request('/api/discovery', { markRead: true }); await load(); message('All notifications marked as read.'); });
  el('semanticForm').onsubmit = run(async () => {
    message('Searching saved results…');
    const result = await request('/api/semantic-search', { query: el('semanticQuery').value });
    message(result.reason || 'Search complete.'); el('semanticResults').replaceChildren();
    for (const row of (result.results || []).slice(0, 30)) {
      const p = document.createElement('p'); p.className = 'discovery-item';
      p.textContent = `${row.job.title} — ${row.job.company} · ${row.fit.verdict}${row.excluded ? ' (excluded)' : ''}. ${(row.fit.gaps || []).join('; ')}`;
      if (/^https?:\/\//.test(row.job.url)) { const link = document.createElement('a'); link.textContent = ' Open posting ↗'; link.href = row.job.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; p.append(link); }
      el('semanticResults').append(p);
    }
    if (!result.results?.length) el('semanticResults').textContent = 'No related roles found. Try a broader description or run a new job search.';
  });
  return { refresh };
}
