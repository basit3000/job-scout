/** Shared, in-session activity for search and document workflows. */
export function createActivity({ document: doc = document } = {}) {
  const $ = (id) => doc.getElementById(id);
  const tasks = new Map();
  const drawer = $('activityDrawer');
  let opener = null;
  let sequence = 0;
  const active = (task) => task.status === 'running';
  const elapsed = (task) => {
    if (!active(task) || !task.startedAt) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(task.startedAt)) / 1000));
    if (!Number.isFinite(seconds)) return '';
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };
  function open() {
    if (drawer.open) return;
    opener = doc.activeElement;
    drawer.showModal();
    $('activityOpenBtn').setAttribute('aria-expanded', 'true');
    $('closeActivityBtn').focus();
  }
  function close() { drawer.close(); }
  drawer.addEventListener('close', () => {
    if (drawer.open) return;
    const target = opener?.isConnected && !opener.disabled && opener.getClientRects().length ? opener : $('activityOpenBtn');
    target.focus();
    $('activityOpenBtn').setAttribute('aria-expanded', 'false');
  });
  drawer.addEventListener('click', (event) => {
    if (event.target !== drawer) return;
    const rect = drawer.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  $('activityOpenBtn').addEventListener('click', () => {
    open();
    $('activityOpenBtn').setAttribute('aria-expanded', 'true');
  });
  $('closeActivityBtn').addEventListener('click', close);

  function button(label, action, token, className = '') {
    const el = doc.createElement('button');
    el.type = 'button';
    el.className = `btn small ${className}`;
    el.textContent = label;
    el.dataset.activityAction = token;
    el.addEventListener('click', async () => {
      el.disabled = true;
      try { await action(); }
      catch (error) { report(error.message); }
      finally { if (el.isConnected) el.disabled = false; }
    });
    return el;
  }

  function actions(task, container) {
    if (active(task) && task.details) container.append(button('Details', () => { close(); return task.details(); }, `${task.id}:details`));
    if (active(task) && task.stop) {
      const stop = button(task.stopping ? 'Stopping…' : 'Stop', task.stop, `${task.id}:stop`, 'danger');
      stop.disabled = Boolean(task.stopping);
      container.append(stop);
    }
    if (!active(task) && task.action) {
      container.append(button(task.actionLabel, () => { close(); return task.action(); }, `${task.id}:next`));
    }
    if (!active(task)) container.append(button('Dismiss', () => {
      tasks.set(task.id, { ...task, dismissed: true }); render();
    }, `${task.id}:dismiss`, 'ghost'));
  }

  function tick() {
    doc.querySelectorAll('[data-activity-time]').forEach((node) => {
      const task = tasks.get(node.dataset.activityTime);
      node.textContent = task ? elapsed(task) : '';
    });
  }

  function render() {
    const focusToken = doc.activeElement?.dataset.activityAction;
    const visible = [...tasks.values()].filter((task) => !task.dismissed).sort((a, b) => b.order - a.order);
    const running = visible.filter(active);
    const failed = visible.filter((task) => task.status === 'error');
    const primary = running[0] || failed[0] || visible[0];
    $('activityStrip').dataset.state = failed.length ? 'error' : primary?.status || 'idle';
    $('activityTitle').textContent = primary?.title || 'Activity';
    $('activityMessage').textContent = primary?.message || 'Search and document progress appears here.';
    $('activityTime').dataset.activityTime = primary?.id || '';
    $('activityCount').textContent = [running.length ? `${running.length} running` : '', failed.length ? `${failed.length} need attention` : '', visible.length > 1 ? `${visible.length} activities` : ''].filter(Boolean).join(' · ');
    $('activityActions').replaceChildren();
    if (primary) actions(primary, $('activityActions'));
    $('activityItems').replaceChildren();
    $('activityEmpty').hidden = visible.length > 0;
    for (const task of visible) {
      const row = doc.createElement('section');
      row.className = 'activity-item'; row.dataset.state = task.status;
      const heading = doc.createElement('h3'); heading.textContent = task.title;
      const status = doc.createElement('span'); status.className = 'activity-state';
      status.textContent = { running: 'In progress', success: 'Complete', error: 'Needs attention', stopped: 'Stopped' }[task.status] || 'Update';
      const time = doc.createElement('span'); time.className = 'activity-time'; time.dataset.activityTime = task.id;
      const message = doc.createElement('p'); message.textContent = task.message || '';
      const controls = doc.createElement('div'); controls.className = 'activity-item-actions';
      actions(task, controls);
      row.append(status, time, heading, message, controls);
      $('activityItems').append(row);
    }
    tick();
    if (focusToken) {
      const scope = drawer.open ? drawer : $('activityStrip');
      const replacement = [...scope.querySelectorAll('[data-activity-action]')].find((el) => el.dataset.activityAction === focusToken);
      (replacement || (drawer.open ? $('closeActivityBtn') : $('activityOpenBtn'))).focus();
    }
  }

  function update(id, patch) {
    const previous = tasks.get(id);
    const newRun = !previous || (patch.startedAt && patch.startedAt !== previous.startedAt);
    const task = { ...previous, ...patch, id, order: newRun ? ++sequence : previous.order, dismissed: newRun ? false : previous.dismissed };
    tasks.set(id, task);
    render();
    if (!previous || previous.status !== task.status || previous.title !== task.title) {
      $('activityAnnouncement').textContent = `${task.title}. ${task.message || ''}`;
    }
    return task;
  }
  function report(message) {
    update('notice', { title: 'An action needs attention', message, status: 'error', startedAt: new Date().toISOString() });
  }
  render();
  const clock = setInterval(tick, 1000);
  return { update, get: (id) => tasks.get(id), open, close, report, destroy: () => clearInterval(clock) };
}
