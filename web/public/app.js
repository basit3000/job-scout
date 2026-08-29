const $ = (id) => document.getElementById(id);

const els = {
  marketSelect: $('marketSelect'),
  allowPaid: $('allowPaid'),
  replaceResults: $('replaceResults'),
  limitPerQuery: $('limitPerQuery'),
  maxApifyRuns: $('maxApifyRuns'),
  maxAgeDays: $('maxAgeDays'),
  cvSource: $('cvSource'),
  agentProvider: $('agentProvider'),
  agentModel: $('agentModel'),
  overleafPush: $('overleafPush'),
  planHint: $('planHint'),
  runBtn: $('runBtn'),
  stopBtn: $('stopBtn'),
  emptyRunBtn: $('emptyRunBtn'),
  statusChip: $('statusChip'),
  candidateLine: $('candidateLine'),
  jobsMeta: $('jobsMeta'),
  jobList: $('jobList'),
  emptyState: $('emptyState'),
  boardStatus: $('boardStatus'),
  searchInput: $('searchInput'),
  decisionFilterMenu: $('decisionFilterMenu'),
  decisionFilterBtn: $('decisionFilterBtn'),
  decisionFilterPanel: $('decisionFilterPanel'),
  decisionFilterChecks: $('decisionFilterChecks'),
  decisionFilterCount: $('decisionFilterCount'),
  decisionFilterAll: $('decisionFilterAll'),
  decisionFilterActive: $('decisionFilterActive'),
  activeDecisionFilters: $('activeDecisionFilters'),
  fitFilter: $('fitFilter'),
  sortSelect: $('sortSelect'),
  pageSize: $('pageSize'),
  pager: $('pager'),
  pageLabel: $('pageLabel'),
  prevPage: $('prevPage'),
  nextPage: $('nextPage'),
  logView: $('logView'),
  clearLogBtn: $('clearLogBtn'),
  apifyTip: $('apifyTip'),
  alerts: $('alerts'),
  digestBadge: $('digestBadge'),
  viewResults: $('viewResults'),
  viewTracker: $('viewTracker'),
  viewAnswers: $('viewAnswers'),
  viewPortals: $('viewPortals'),
  viewDigest: $('viewDigest'),
  kanban: $('kanban'),
  followUpBanner: $('followUpBanner'),
  sheetsBar: $('sheetsBar'),
  sheetsOpenLink: $('sheetsOpenLink'),
  sheetsSyncBtn: $('sheetsSyncBtn'),
  sheetsHint: $('sheetsHint'),
  trackerColumnsMenu: $('trackerColumnsMenu'),
  trackerColumnsBtn: $('trackerColumnsBtn'),
  trackerColumnsPanel: $('trackerColumnsPanel'),
  trackerColumnsChecks: $('trackerColumnsChecks'),
  trackerColumnsCount: $('trackerColumnsCount'),
  trackerColumnsAll: $('trackerColumnsAll'),
  trackerColumnsActive: $('trackerColumnsActive'),
  answersForm: $('answersForm'),
  saveAnswersBtn: $('saveAnswersBtn'),
  portalsList: $('portalsList'),
  savePortalsBtn: $('savePortalsBtn'),
  digestList: $('digestList'),
  digestMeta: $('digestMeta'),
  prepView: $('prepView'),
  sideTitle: $('sideTitle'),
  setupOverlay: $('setupOverlay'),
  setupForm: $('setupForm'),
  setupMarket: $('setupMarket'),
  setupError: $('setupError'),
  setupSubmit: $('setupSubmit'),
  prepModal: $('prepModal'),
  prepModalTitle: $('prepModalTitle'),
  prepModalHint: $('prepModalHint'),
  prepInstrPreset: $('prepInstrPreset'),
  prepInstrCustom: $('prepInstrCustom'),
  prepModalCancel: $('prepModalCancel'),
  prepModalUseExisting: $('prepModalUseExisting'),
  prepModalFast: $('prepModalFast'),
  prepModalRecreate: $('prepModalRecreate'),
};

const DECISIONS = ['shortlisted', 'applied', 'skipped', 'interviewing', 'rejected', 'closed'];
/** Results filter keys — "none" = undecided (no decision yet). */
const DECISION_FILTER_OPTIONS = [
  { id: 'none', label: 'Undecided' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'applied', label: 'Applied' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'interviewing', label: 'Interviewing' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'closed', label: 'Closed' },
];
const TRACKER_COLUMN_OPTIONS = DECISIONS.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));
/** Preset: hide terminal / done statuses — keep hunting in the active pile. */
const ACTIVE_ONLY_HIDDEN = ['applied', 'skipped', 'rejected', 'closed'];
const LS_VISIBLE_DECISIONS = 'jobScout.visibleDecisions';
const LS_TRACKER_COLUMNS = 'jobScout.trackerVisibleColumns';
const LS_SORT = 'jobScout.sort';
const SORT_VALUES = ['fit', 'newest', 'oldest'];

const ANSWER_FIELDS = [
  ['workAuthorization', 'Work authorisation'],
  ['needsSponsorship', 'Needs sponsorship?'],
  ['noticePeriod', 'Notice period'],
  ['salaryExpectation', 'Salary expectation'],
  ['earliestStart', 'Earliest start'],
  ['citiesOpenTo', 'Cities open to'],
  ['remotePreference', 'Remote preference'],
  ['phone', 'Phone'],
  ['linkedin', 'LinkedIn'],
  ['github', 'GitHub'],
  ['portfolio', 'Portfolio'],
];

const FIT_CLASS = {
  Strong: 'fit-strong',
  'Worth a shot': 'fit-worth',
  Stretch: 'fit-stretch',
  No: 'fit-no',
};

let state = {
  page: 1,
  status: null,
  pagination: { page: 1, pages: 1, total: 0, pageSize: 10 },
  view: 'results',
  /** @type {Set<string>} */
  visibleDecisions: new Set(DECISION_FILTER_OPTIONS.map((o) => o.id)),
  /** @type {Set<string>} */
  trackerVisibleColumns: new Set(DECISIONS),
};

let jobsAbort = null;
let searchDebounce = null;

function loadSetFromStorage(key, allIds) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set(allIds);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(allIds);
    const next = new Set(parsed.filter((id) => allIds.includes(id)));
    return next.size ? next : new Set(allIds);
  } catch {
    return new Set(allIds);
  }
}

function saveSetToStorage(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function hiddenFromVisible(allIds, visibleSet) {
  return allIds.filter((id) => !visibleSet.has(id));
}

function closeFilterMenus(except) {
  for (const menu of [els.decisionFilterMenu, els.trackerColumnsMenu]) {
    if (!menu || menu === except) continue;
    menu.classList.remove('open');
    const btn = menu.querySelector('.filter-trigger');
    const panel = menu.querySelector('.filter-panel');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
  }
}

function toggleFilterMenu(menu, btn, panel) {
  if (!menu || !btn || !panel) return;
  const open = panel.hidden;
  closeFilterMenus(open ? menu : null);
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  menu.classList.toggle('open', open);
}

function renderFilterChecks(container, options, visibleSet, onChange) {
  if (!container) return;
  container.innerHTML = options
    .map(
      (o) => `
    <label class="filter-check">
      <input type="checkbox" value="${escapeAttr(o.id)}" ${visibleSet.has(o.id) ? 'checked' : ''} />
      <span>${escapeHtml(o.label)}</span>
    </label>`,
    )
    .join('');
  container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) visibleSet.add(input.value);
      else visibleSet.delete(input.value);
      // Keep at least one visible so the list never looks "broken empty"
      if (!visibleSet.size) {
        visibleSet.add(input.value);
        input.checked = true;
      }
      onChange();
    });
  });
}

function updateDecisionFilterUi() {
  const allIds = DECISION_FILTER_OPTIONS.map((o) => o.id);
  const hidden = hiddenFromVisible(allIds, state.visibleDecisions);
  if (els.decisionFilterCount) {
    els.decisionFilterCount.hidden = hidden.length === 0;
    els.decisionFilterCount.textContent = hidden.length ? String(hidden.length) : '';
  }
  if (els.decisionFilterBtn) {
    els.decisionFilterBtn.classList.toggle('has-filters', hidden.length > 0);
    els.decisionFilterBtn.title = hidden.length
      ? `Hiding: ${hidden.map((id) => DECISION_FILTER_OPTIONS.find((o) => o.id === id)?.label || id).join(', ')}`
      : 'Filter by decision status';
  }
  if (els.activeDecisionFilters) {
    if (!hidden.length) {
      els.activeDecisionFilters.hidden = true;
      els.activeDecisionFilters.innerHTML = '';
    } else {
      els.activeDecisionFilters.hidden = false;
      els.activeDecisionFilters.innerHTML = `
        <span class="active-filters-label">Hiding</span>
        ${hidden
          .map((id) => {
            const label = DECISION_FILTER_OPTIONS.find((o) => o.id === id)?.label || id;
            return `<button type="button" class="filter-chip" data-show="${escapeAttr(id)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`;
          })
          .join('')}
        <button type="button" class="filter-chip-clear" id="clearDecisionHides">Clear</button>`;
      els.activeDecisionFilters.querySelectorAll('[data-show]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.visibleDecisions.add(btn.dataset.show);
          onDecisionFilterChange({ rerender: true });
        });
      });
      els.activeDecisionFilters.querySelector('#clearDecisionHides')?.addEventListener('click', () => {
        state.visibleDecisions = new Set(allIds);
        onDecisionFilterChange({ rerender: true });
      });
    }
  }
}

function updateTrackerColumnsUi() {
  const hidden = hiddenFromVisible(DECISIONS, state.trackerVisibleColumns);
  if (els.trackerColumnsCount) {
    els.trackerColumnsCount.hidden = hidden.length === 0;
    els.trackerColumnsCount.textContent = hidden.length ? String(hidden.length) : '';
  }
  if (els.trackerColumnsBtn) {
    els.trackerColumnsBtn.classList.toggle('has-filters', hidden.length > 0);
    els.trackerColumnsBtn.title = hidden.length
      ? `Hiding columns: ${hidden.join(', ')}`
      : 'Show or hide tracker columns';
  }
}

function onDecisionFilterChange({ rerender = false } = {}) {
  saveSetToStorage(LS_VISIBLE_DECISIONS, state.visibleDecisions);
  if (rerender) {
    renderFilterChecks(
      els.decisionFilterChecks,
      DECISION_FILTER_OPTIONS,
      state.visibleDecisions,
      () => onDecisionFilterChange(),
    );
  }
  updateDecisionFilterUi();
  state.page = 1;
  refreshJobs();
  if (state.view === 'digest') refreshDigest();
}

function onTrackerColumnsChange({ rerender = false } = {}) {
  saveSetToStorage(LS_TRACKER_COLUMNS, state.trackerVisibleColumns);
  if (rerender) {
    renderFilterChecks(
      els.trackerColumnsChecks,
      TRACKER_COLUMN_OPTIONS,
      state.trackerVisibleColumns,
      () => onTrackerColumnsChange(),
    );
  }
  updateTrackerColumnsUi();
  if (state.view === 'tracker') refreshTracker();
}

function initFilterMenus() {
  const allDecisionIds = DECISION_FILTER_OPTIONS.map((o) => o.id);
  state.visibleDecisions = loadSetFromStorage(LS_VISIBLE_DECISIONS, allDecisionIds);
  // Migrate old single-checkbox preference
  try {
    if (localStorage.getItem('jobScout.hideAppliedColumn') === '1') {
      const migrated = loadSetFromStorage(LS_TRACKER_COLUMNS, DECISIONS);
      if (migrated.size === DECISIONS.length) {
        migrated.delete('applied');
        state.trackerVisibleColumns = migrated;
        saveSetToStorage(LS_TRACKER_COLUMNS, migrated);
      }
      localStorage.removeItem('jobScout.hideAppliedColumn');
    } else {
      state.trackerVisibleColumns = loadSetFromStorage(LS_TRACKER_COLUMNS, DECISIONS);
    }
  } catch {
    state.trackerVisibleColumns = loadSetFromStorage(LS_TRACKER_COLUMNS, DECISIONS);
  }

  renderFilterChecks(
    els.decisionFilterChecks,
    DECISION_FILTER_OPTIONS,
    state.visibleDecisions,
    () => onDecisionFilterChange(),
  );
  renderFilterChecks(
    els.trackerColumnsChecks,
    TRACKER_COLUMN_OPTIONS,
    state.trackerVisibleColumns,
    () => onTrackerColumnsChange(),
  );
  updateDecisionFilterUi();
  updateTrackerColumnsUi();
  if (els.sortSelect) els.sortSelect.value = loadSort();

  els.decisionFilterBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleFilterMenu(els.decisionFilterMenu, els.decisionFilterBtn, els.decisionFilterPanel);
  });
  els.trackerColumnsBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleFilterMenu(els.trackerColumnsMenu, els.trackerColumnsBtn, els.trackerColumnsPanel);
  });
  els.decisionFilterPanel?.addEventListener('click', (ev) => ev.stopPropagation());
  els.trackerColumnsPanel?.addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => closeFilterMenus());
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeFilterMenus();
  });

  els.decisionFilterAll?.addEventListener('click', () => {
    state.visibleDecisions = new Set(allDecisionIds);
    onDecisionFilterChange({ rerender: true });
  });
  els.decisionFilterActive?.addEventListener('click', () => {
    state.visibleDecisions = new Set(
      allDecisionIds.filter((id) => !ACTIVE_ONLY_HIDDEN.includes(id)),
    );
    onDecisionFilterChange({ rerender: true });
  });
  els.trackerColumnsAll?.addEventListener('click', () => {
    state.trackerVisibleColumns = new Set(DECISIONS);
    onTrackerColumnsChange({ rerender: true });
  });
  els.trackerColumnsActive?.addEventListener('click', () => {
    state.trackerVisibleColumns = new Set(
      DECISIONS.filter((id) => !ACTIVE_ONLY_HIDDEN.includes(id)),
    );
    onTrackerColumnsChange({ rerender: true });
  });
}

async function api(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(extraHeaders || {}) },
    ...rest,
  });
  if (rest.signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setFetchUi(running) {
  els.runBtn.disabled = running;
  if (els.emptyRunBtn) els.emptyRunBtn.disabled = running;
  if (els.stopBtn) {
    els.stopBtn.hidden = !running;
    els.stopBtn.disabled = false;
  }
}

function setChip(stateName, label) {
  els.statusChip.dataset.state = stateName;
  els.statusChip.textContent = label;
}

function appendLog(line, stream = 'stdout') {
  const span = document.createElement('span');
  if (stream === 'stderr') span.className = 'err';
  span.textContent = `${line}\n`;
  els.logView.appendChild(span);
  els.logView.scrollTop = els.logView.scrollHeight;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function connectStream() {
  const es = new EventSource('/api/fetch/stream');
  es.addEventListener('log', (ev) => {
    const data = JSON.parse(ev.data);
    appendLog(data.line, data.stream);
  });
  es.addEventListener('done', async (ev) => {
    const data = JSON.parse(ev.data);
    setFetchUi(false);
    if (data.stopped) {
      setChip('idle', 'Stopped');
      appendLog('Search stopped. Jobs found before stop were saved into the archive.');
    } else {
      setChip(data.code === 0 ? 'idle' : 'error', data.code === 0 ? 'Done' : `Exit ${data.code}`);
    }
    await refreshAll();
  });
  es.addEventListener('status', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.running) {
      setChip('running', 'Running');
      setFetchUi(true);
    }
  });
  return es;
}

function loadSort() {
  try {
    const raw = localStorage.getItem(LS_SORT);
    return SORT_VALUES.includes(raw) ? raw : 'fit';
  } catch {
    return 'fit';
  }
}

function saveSort(value) {
  try {
    localStorage.setItem(LS_SORT, SORT_VALUES.includes(value) ? value : 'fit');
  } catch {
    /* ignore */
  }
}

function queryString() {
  const p = new URLSearchParams({
    page: String(state.page),
    pageSize: els.pageSize.value || '10',
    q: els.searchInput.value.trim(),
    fit: els.fitFilter.value,
    sort: els.sortSelect?.value || 'fit',
  });
  const hide = hiddenFromVisible(
    DECISION_FILTER_OPTIONS.map((o) => o.id),
    state.visibleDecisions,
  );
  if (hide.length) p.set('hide', hide.join(','));
  return p.toString();
}

function renderJob(job, { compact = false } = {}) {
  const el = document.createElement('article');
  el.className = 'job';
  const decision = job.decision?.decision;
  const fit = job.fit;
  const facts = [
    job.location,
    job.remote === true ? 'Remote' : null,
    job.ageDays != null ? `${job.ageDays}d ago` : null,
    job.board ? `${job.board}${job.via ? ` / ${job.via}` : ''}` : null,
    job.salary,
  ].filter(Boolean);

  const also = (job.alsoOn || []).slice(0, 4);
  const flags = (job.flags || []).map((f) => `<span class="flag pill">${escapeHtml(f)}</span>`).join('');

  el.innerHTML = `
    <div class="job-top">
      <div>
        <h3 class="job-title">${
          job.url
            ? `<a href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a>`
            : escapeHtml(job.title)
        }</h3>
        <p class="job-company">${escapeHtml(job.company || 'unknown')}</p>
      </div>
      ${compact ? '' : '<button type="button" class="btn ghost toggle-desc">Details</button>'}
    </div>
    <div class="job-facts">
      ${
        fit
          ? `<span class="pill ${FIT_CLASS[fit.verdict] || ''}">${escapeHtml(fit.verdict)} · ${fit.score}</span>`
          : ''
      }
      ${job.isNew ? '<span class="pill new">New</span>' : ''}
      ${job.tailoredCv ? '<span class="pill ok">CV ready</span>' : ''}
      ${facts.map((f) => `<span>${escapeHtml(f)}</span>`).join('')}
      ${also.map((s) => `<span class="pill" title="Also seen on">also ${escapeHtml(s)}</span>`).join('')}
      ${flags}
    </div>
    ${
      compact
        ? ''
        : `
    <div class="job-actions">
      ${DECISIONS.map(
        (d) =>
          `<button type="button" class="btn small ${
            d === 'skipped' || d === 'rejected' || d === 'closed' ? 'danger' : ''
          } ${decision === d ? 'active' : ''}" data-decision="${d}">${d}</button>`,
      ).join('')}
      <button type="button" class="btn small" data-prep>Prep &amp; CV</button>
      ${
        job.tailoredCv
          ? `<a class="btn small" data-cv href="/api/prep/${encodeURIComponent(job.id)}/cv.html" target="_blank" rel="noopener">CV</a>
             ${
               job.tailoredPdfMain || job.tailoredPdfAts || job.tailoredPdf
                 ? `<button type="button" class="btn small" data-save-folder>Save folder</button>`
                 : ''
             }`
          : ''
      }
      ${
        job.url
          ? `<a class="btn small primary-link" data-apply href="${escapeAttr(job.url)}" target="_blank" rel="noopener">Apply</a>`
          : ''
      }
    </div>
    <div class="job-fit" hidden></div>
    <div class="job-desc" hidden></div>`
    }
  `;

  if (!compact) {
    const fitBox = el.querySelector('.job-fit');
    const desc = el.querySelector('.job-desc');
    fitBox.innerHTML = fit
      ? `<strong>Why:</strong> ${(fit.reasons || []).map(escapeHtml).join(' · ')}
         <ul>${(fit.gaps || []).slice(0, 5).map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>`
      : '';
    desc.textContent = job.description
      || (job.hasDescription === false
        ? 'No description — open the URL before judging.'
        : 'Expand to load description…');

    el.querySelector('.toggle-desc').addEventListener('click', async () => {
      const open = desc.hidden;
      if (open && !desc.dataset.loaded && job.description == null) {
        desc.textContent = 'Loading description…';
        try {
          const full = await api(`/api/jobs/${encodeURIComponent(job.id)}`);
          desc.textContent = full.job?.description || 'No description — open the URL before judging.';
        } catch (err) {
          desc.textContent = `Could not load description (${err.message}).`;
        }
        desc.dataset.loaded = '1';
      }
      desc.hidden = !open;
      fitBox.hidden = !open;
      el.classList.toggle('open', open);
    });

    el.querySelectorAll('[data-decision]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const d = btn.dataset.decision;
          const res = await api('/api/decisions', {
            method: 'POST',
            body: JSON.stringify({ id: job.id, decision: d }),
          });
          logSheetsResult(res.sheets, `Sheets (${d})`);
          // Shortlist → prompt for CV prep (first time or recreate)
          if (d === 'shortlisted') {
            await runPrepFlow(job);
          }
          await refreshJobs();
          if (state.view === 'tracker') await refreshTracker();
          if (state.view === 'digest') await refreshDigest();
        } catch (err) {
          appendLog(`Decision failed: ${err.message}`, 'stderr');
        }
      });
    });

    el.querySelector('[data-prep]')?.addEventListener('click', async () => {
      await runPrepFlow(job);
    });

    el.querySelector('[data-save-folder]')?.addEventListener('click', async () => {
      try {
        const res = await api('/api/prep/open-folder', {
          method: 'POST',
          body: JSON.stringify({ id: job.id }),
        });
        appendLog(`Saved + opened: ${res.folder}`);
      } catch (err) {
        appendLog(`Save folder failed: ${err.message}`, 'stderr');
      }
    });

    el.querySelector('[data-apply]')?.addEventListener('click', async () => {
      // Open posting in a new tab (browser default via href). Offer to mark applied.
      appendLog(`Opened apply link for ${job.title} — submit the form yourself.`);
      const mark = window.confirm(
        'Apply page opened in a new tab.\n\nMark this job as Applied in the tracker after you submit?\n(You still submit the application yourself.)',
      );
      if (!mark) return;
      try {
        const res = await api('/api/decisions', {
          method: 'POST',
          body: JSON.stringify({ id: job.id, decision: 'applied' }),
        });
        await refreshJobs();
        if (state.view === 'tracker') await refreshTracker();
        if (state.view === 'digest') await refreshDigest();
        appendLog(`Marked applied: ${job.title}`);
        logSheetsResult(res.sheets, 'Sheets (applied)');
      } catch (err) {
        appendLog(err.message, 'stderr');
      }
    });
  }

  return el;
}

function readPrepInstructions() {
  const preset = els.prepInstrPreset?.value || '';
  if (!preset) return '';
  if (preset === 'custom') return (els.prepInstrCustom?.value || '').trim().slice(0, 500);
  return preset;
}

function closePrepModal() {
  if (els.prepModal) els.prepModal.hidden = true;
}

/**
 * Show Prep dialog: Create CV (agent) / Fast / Use existing.
 * @returns {Promise<{ recreate: boolean, mode: 'agent'|'fast', extraInstructions: string } | null>}
 */
function openPrepModal(job) {
  return new Promise((resolve) => {
    if (!els.prepModal) {
      resolve({ recreate: true, mode: 'agent', extraInstructions: '' });
      return;
    }
    const hasCache = Boolean(job.prepCached || job.tailoredPdf || job.tailoredCv);
    const keyOk = Boolean(state.status?.cursorApiKeyPresent);
    els.prepModalTitle.textContent = hasCache ? 'Recreate CV?' : 'Prep & CV';
    els.prepModalHint.textContent = hasCache
      ? `Pack exists. Create CV = Cursor agent (cv-tailor)${keyOk ? '' : ' — set CURSOR_API_KEY or use Fast'}. Fast = reorder + light experience-bullet emphasis.`
      : `Create CV runs the Cursor agent (cv-tailor)${keyOk ? '' : ' — CURSOR_API_KEY missing, will fall back to Fast'}. Fast = keyword reorder + existing-bullet emphasis.`;
    els.prepModalUseExisting.hidden = !hasCache;
    els.prepModalRecreate.textContent = hasCache ? 'Recreate (agent)' : 'Create CV';
    if (els.prepInstrPreset) els.prepInstrPreset.value = '';
    if (els.prepInstrCustom) {
      els.prepInstrCustom.value = '';
      els.prepInstrCustom.hidden = true;
    }
    els.prepModal.hidden = false;

    const finish = (value) => {
      els.prepModalCancel?.removeEventListener('click', onCancel);
      els.prepModalUseExisting?.removeEventListener('click', onUse);
      els.prepModalRecreate?.removeEventListener('click', onRecreate);
      els.prepModalFast?.removeEventListener('click', onFast);
      els.prepInstrPreset?.removeEventListener('change', onPreset);
      closePrepModal();
      resolve(value);
    };
    const onCancel = () => finish(null);
    const onUse = () =>
      finish({ recreate: false, mode: 'agent', extraInstructions: readPrepInstructions() });
    const onRecreate = () =>
      finish({ recreate: true, mode: 'agent', extraInstructions: readPrepInstructions() });
    const onFast = () =>
      finish({ recreate: true, mode: 'fast', extraInstructions: readPrepInstructions() });
    const onPreset = () => {
      if (els.prepInstrCustom) {
        els.prepInstrCustom.hidden = els.prepInstrPreset.value !== 'custom';
      }
    };
    els.prepModalCancel?.addEventListener('click', onCancel);
    els.prepModalUseExisting?.addEventListener('click', onUse);
    els.prepModalRecreate?.addEventListener('click', onRecreate);
    els.prepModalFast?.addEventListener('click', onFast);
    els.prepInstrPreset?.addEventListener('change', onPreset);
  });
}

/** @param {string} startedAt ISO timestamp from POST /api/prep */
function waitForPrepDone(startedAt) {
  return new Promise((resolve, reject) => {
    const es = new EventSource('/api/prep/stream');
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      es.close();
      fn(value);
    };
    es.addEventListener('log', (ev) => {
      try {
        const entry = JSON.parse(ev.data);
        appendLog(entry.line || '', entry.stream || 'stdout');
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('done', (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        // Ignore stale completions from a previous run
        if (startedAt && parsed.startedAt && parsed.startedAt !== startedAt) return;
        finish(resolve, parsed);
      } catch (err) {
        finish(reject, err);
      }
    });
    es.onerror = () => {
      if (settled) return;
      if (es.readyState === EventSource.CLOSED) {
        finish(reject, new Error('Prep stream closed before completion'));
      }
    };
  });
}

function updateSheetsUi(sheets = state.status?.sheets) {
  const configured = Boolean(sheets?.configured);
  if (els.sheetsOpenLink) {
    if (configured && sheets.url) {
      els.sheetsOpenLink.hidden = false;
      els.sheetsOpenLink.href = sheets.url;
    } else {
      els.sheetsOpenLink.hidden = true;
      els.sheetsOpenLink.removeAttribute('href');
    }
  }
  if (els.sheetsSyncBtn) {
    els.sheetsSyncBtn.hidden = !configured;
    els.sheetsSyncBtn.disabled = false;
  }
  if (els.sheetsHint) {
    if (configured) {
      els.sheetsHint.hidden = false;
      els.sheetsHint.textContent = `Google Sheet tab “${sheets.tab || 'Applications'}” — applied / interviewing / rejected / closed sync here.`;
    } else if (sheets?.hint) {
      els.sheetsHint.hidden = false;
      els.sheetsHint.textContent = `Google Sheets: ${sheets.hint}`;
    } else {
      els.sheetsHint.hidden = true;
      els.sheetsHint.textContent = '';
    }
  }
}

function logSheetsResult(sheets, context = 'Sheets') {
  if (!sheets || sheets.skipped) return;
  if (sheets.ok === false && sheets.error) {
    appendLog(`${context}: ${sheets.error}`, 'stderr');
    return;
  }
  if (sheets.action === 'appended') appendLog(`${context}: row appended`);
  else if (sheets.action === 'updated') appendLog(`${context}: row updated`);
  else if (typeof sheets.synced === 'number') {
    appendLog(
      `${context}: synced ${sheets.synced} (${sheets.appended || 0} new, ${sheets.updated || 0} updated)`,
    );
    if (sheets.errors?.length) {
      appendLog(`${context}: ${sheets.errors.length} error(s)`, 'stderr');
    }
  }
}

function showLogView() {
  if (els.prepView) els.prepView.hidden = true;
  if (els.logView) els.logView.hidden = false;
  if (els.sideTitle) els.sideTitle.textContent = 'Run log';
}

async function finishPrepUi(job, data) {
  state.lastPrepJobId = job.id;
  if (data.cached) appendLog('Skipped compile — cached PDFs.');
  if (data.pack?.tailorMode) {
    appendLog(
      `Tailor mode: ${data.pack.tailorMode}${
        data.pack.fallbackReason ? ` (fallback: ${data.pack.fallbackReason})` : ''
      }`,
    );
  }
  if (data.pack?.relativeDir) {
    appendLog(`Prep pack ready: ${data.pack.relativeDir}`);
  }
  if (data.pack?.downloadFolderAbs) {
    appendLog(`Company folder: ${data.pack.downloadFolderAbs}`);
  }
  // Populate prep panel HTML but stay on the run log
  showPrep(data, { reveal: false });
  try {
    const res = await api('/api/prep/open-folder', {
      method: 'POST',
      body: JSON.stringify({ id: job.id }),
    });
    appendLog(`Opened: ${res.folder}`);
    const pathsEl = $('companyFolderPaths');
    if (pathsEl) {
      pathsEl.innerHTML = `<strong>Saved under project root:</strong><br/><code>${escapeHtml(
        res.folder || '',
      )}</code>`;
    }
  } catch (err) {
    appendLog(`Folder open failed: ${err.message}`, 'stderr');
  }
  await refreshJobs();
}

async function runPrepFlow(job) {
  const choice = await openPrepModal(job);
  if (!choice) {
    appendLog('Prep cancelled.');
    return;
  }
  showLogView();
  const mode = choice.mode === 'fast' ? 'fast' : 'agent';
  try {
    if (!choice.recreate) {
      appendLog(`Using existing prep pack for ${job.title}…`);
    } else if (mode === 'agent') {
      appendLog(
        `Starting agent Prep & CV for ${job.title}${choice.extraInstructions ? ' (with instructions)' : ''}…`,
      );
    } else {
      appendLog(`Building Fast (keyword) prep + CV for ${job.title}…`);
    }

    const data = await api('/api/prep', {
      method: 'POST',
      body: JSON.stringify({
        id: job.id,
        recreate: choice.recreate,
        extraInstructions: choice.extraInstructions || '',
        mode,
      }),
    });

    if (data.started) {
      setChip('busy', 'Agent CV…');
      // Connect after start; server replays buffered logs + matching done
      const final = await waitForPrepDone(data.startedAt);
      setChip('idle', 'Idle');
      if (!final?.ok) {
        throw new Error(final?.error || 'Agent prep failed');
      }
      await finishPrepUi(job, final);
      return;
    }

    await finishPrepUi(job, data);
  } catch (err) {
    setChip('idle', 'Idle');
    appendLog(`Prep failed: ${err.message}`, 'stderr');
  }
}

function showPrep(data, { reveal = true } = {}) {
  if (reveal) {
    els.sideTitle.textContent = 'Prep & CV';
    els.logView.hidden = true;
    els.prepView.hidden = false;
  } else {
    showLogView();
  }
  const pack = data.pack;
  const cvHtml = pack.downloadCvHtml || '';
  const cvMd = pack.downloadCvMd || '';
  const cvPdf = pack.downloadCvPdf || '';
  const cvAts = pack.downloadCvPdfAts || '';
  const cvMain = pack.downloadCvPdfMain || '';
  const apply = pack.applyUrl || '';
  const ol = pack.overleaf;
  const olLine = ol
    ? `Overleaf: ${ol.sync || '?'} · edited ${(ol.edited || []).join(', ') || 'none'} · push ${ol.pushed ? 'yes' : ol.pushReason || 'no'}`
    : '';
  const cachedNote = data.cached || pack.cached ? ' · cached' : '';
  const modeNote = pack.tailorMode
    ? ` · tailor: ${pack.tailorMode}${pack.fallbackReason ? ` (fallback)` : ''}`
    : '';
  els.prepView.innerHTML = `
    <h3>${escapeHtml(data.fit?.verdict || '')} · ${escapeHtml(pack.relativeDir || '')}</h3>
    <p>Source: <strong>${escapeHtml(pack.cvSource || 'local')}</strong>
      ${pack.cvContentSource ? `(${escapeHtml(pack.cvContentSource)})` : ''}
      ${pack.hasPdf ? ` · PDF ready (${escapeHtml(pack.pdfNote || '')})` : ` · ${escapeHtml(pack.pdfNote || 'no PDF')}`}
      ${escapeHtml(cachedNote)}${escapeHtml(modeNote)}</p>
    ${pack.extraInstructions ? `<p class="meta">Instructions: ${escapeHtml(pack.extraInstructions)}</p>` : ''}
    ${olLine ? `<p class="meta">${escapeHtml(olLine)}</p>` : ''}
    <div class="prep-actions">
      <button type="button" class="btn small primary-link" id="saveCompanyFolder">Save PDFs to company folder</button>
      ${cvMain || cvPdf ? `<a class="btn small" href="${escapeAttr(cvMain || cvPdf)}" target="_blank" rel="noopener">Preview Main</a>` : ''}
      ${cvAts ? `<a class="btn small" href="${escapeAttr(cvAts)}" target="_blank" rel="noopener">Preview ATS</a>` : ''}
      ${cvHtml ? `<a class="btn small" href="${escapeAttr(cvHtml)}" target="_blank" rel="noopener">Open CV.html</a>` : ''}
      ${apply ? `<a class="btn small primary-link" href="${escapeAttr(apply)}" target="_blank" rel="noopener">Apply (opens job)</a>` : ''}
    </div>
    <p class="meta" id="companyFolderPaths">
      ${
        pack.downloadFolderAbs
          ? `<strong>Saved under project root:</strong><br/><code>${escapeHtml(
              pack.downloadFolderAbs,
            )}</code>`
          : 'Folder not written yet — click <strong>Save PDFs to company folder</strong>.'
      }
    </p>
    ${pack.downloadError ? `<p class="meta" style="color:#b00">Download folder error: ${escapeHtml(pack.downloadError)}</p>` : ''}
    <p class="meta">PDFs go to <code>job-scout\\downloads\\&lt;Company&gt;\\</code> (not Windows Downloads). Files: <code>&lt;Your Name&gt; CV.pdf</code> (ATS) + <code>&lt;Your Name&gt; CV Main.pdf</code> (from profile.json).</p>
    <p>Cover letter draft:</p>
    <pre>${escapeHtml(pack.coverLetter || '')}</pre>
    <button type="button" class="btn ghost" id="backToLog">Back to log</button>
  `;

  async function saveAndOpenCompanyFolder() {
    const fromUrl = String(pack.downloadCvPdfMain || pack.downloadCvPdfAts || '')
      .match(/\/api\/prep\/([^/]+)\//)?.[1];
    const id = decodeURIComponent(pack.jobId || fromUrl || state.lastPrepJobId || '');
    if (!id) {
      appendLog('Save folder: missing job id — run Prep again.', 'stderr');
      return;
    }
    const res = await api('/api/prep/open-folder', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    const pathsEl = $('companyFolderPaths');
    if (pathsEl) {
      pathsEl.innerHTML = `<strong>Saved under project root:</strong><br/><code>${escapeHtml(
        res.folder || '',
      )}</code>`;
    }
    appendLog(`Saved + opened: ${res.folder}`);
  }

  $('saveCompanyFolder')?.addEventListener('click', async () => {
    try {
      await saveAndOpenCompanyFolder();
    } catch (err) {
      appendLog(`Save folder failed: ${err.message}`, 'stderr');
    }
  });
  $('backToLog')?.addEventListener('click', () => {
    showLogView();
  });
}

async function refreshJobs() {
  jobsAbort?.abort();
  jobsAbort = new AbortController();
  const { signal } = jobsAbort;
  try {
    const data = await api(`/api/jobs?${queryString()}`, { signal });
    if (signal.aborted) return;
    state.pagination = data.pagination;
    els.jobList.innerHTML = '';

    if (!data.pagination.total && !data.meta) {
      els.emptyState.hidden = false;
      els.pager.hidden = true;
      els.jobsMeta.textContent = data.message || 'No fetch yet.';
      return;
    }

    els.emptyState.hidden = data.pagination.total > 0;
    if (!data.jobs.length && data.pagination.total === 0) {
      els.emptyState.hidden = false;
    } else {
      els.emptyState.hidden = true;
    }

    const when = data.meta?.generatedAt ? new Date(data.meta.generatedAt).toLocaleString() : '—';
    const dup = (data.meta?.duplicatesRemoved ?? 0) + (data.meta?.duplicatesRemovedExtra ?? 0);
    const newN = data.meta?.newSinceLastFetch;
    const parts = [
      `${data.pagination.total} in archive`,
      data.meta?.marketName || '—',
      when,
    ];
    if (typeof newN === 'number') parts.push(`${newN} new last run`);
    if (dup) parts.push(`${dup} dupes collapsed`);
    if (data.meta?.replaced) parts.push('replaced');
    els.jobsMeta.textContent = parts.join(' · ');

    if (data.meta?.sourceStatus?.length) {
      els.boardStatus.hidden = false;
      els.boardStatus.innerHTML = data.meta.sourceStatus
        .map((s) => {
          const cls = s.ok ? 'ok' : 'bad';
          const text = s.ok ? `${s.board}: ${s.count} via ${s.via}` : `${s.board}: failed`;
          return `<span class="pill ${cls}" title="${escapeAttr(s.error || '')}">${escapeHtml(text)}</span>`;
        })
        .join('');
    } else {
      els.boardStatus.hidden = true;
    }

    const frag = document.createDocumentFragment();
    for (const job of data.jobs) frag.appendChild(renderJob(job));
    els.jobList.appendChild(frag);

    const { page, pages, total } = data.pagination;
    els.pager.hidden = total === 0;
    els.pageLabel.textContent = `Page ${page} / ${pages} (${total})`;
    els.prevPage.disabled = page <= 1;
    els.nextPage.disabled = page >= pages;
  } catch (err) {
    if (err?.name === 'AbortError') return;
    appendLog(`Results failed: ${err.message}`, 'stderr');
  }
}

function updatePlanHint(s = state.status) {
  if (!els.planHint || !s) return;
  const limit = Number(els.limitPerQuery?.value || s.limitPerQuery || 0);
  const perBoard = (s.titleCount || 0) * (s.cityCount || 0);
  const boards = s.boardCount || 0;
  const maxJobs = perBoard * limit;
  els.planHint.hidden = !(perBoard && boards);
  els.planHint.textContent = perBoard && boards
    ? `Plan: ${s.titleCount} titles × ${s.cityCount} cities = ${perBoard} queries/portal × ${boards} portals · up to ${maxJobs} jobs/portal (before filters)`
    : '';
}

async function saveSettings(partial) {
  state.status = await api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(partial),
  });
  updatePlanHint(state.status);
  return state.status;
}

async function refreshAgentModels(provider, selected) {
  if (!els.agentModel) return;
  const prov = provider || els.agentProvider?.value || 'cursor';
  try {
    const data = await api(`/api/prep/models?provider=${encodeURIComponent(prov)}`);
    const models = data.models || [];
    const sel = selected != null ? selected : (data.selected ?? '');
    const opts = models.map((m) => {
      const id = m.id ?? '';
      const label = m.displayName || id || 'CLI default';
      return `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`;
    });
    if (!models.some((m) => (m.id ?? '') === '')) {
      opts.unshift('<option value="">CLI / account default</option>');
    }
    els.agentModel.innerHTML = opts.join('');
    if ([...els.agentModel.options].some((o) => o.value === sel)) {
      els.agentModel.value = sel;
    } else if (sel) {
      const opt = document.createElement('option');
      opt.value = sel;
      opt.textContent = sel;
      els.agentModel.appendChild(opt);
      els.agentModel.value = sel;
    }
    const avail = data.availability;
    if (avail && !avail.ok) {
      els.agentProvider.title = avail.detail || 'Provider not ready';
    } else if (avail?.detail) {
      els.agentProvider.title = avail.detail;
    }
  } catch (err) {
    els.agentModel.innerHTML = '<option value="">(could not load models)</option>';
    appendLog(`Agent models: ${err.message}`, 'stderr');
  }
}

async function refreshStatus() {
  state.status = await api('/api/status');
  const s = state.status;
  els.candidateLine.textContent = [s.candidate, s.targetRole].filter(Boolean).join(' · ') || 'Local shortlist';
  if (s.marketId) els.marketSelect.value = s.marketId;
  if (els.limitPerQuery && document.activeElement !== els.limitPerQuery) {
    els.limitPerQuery.value = String(s.limitPerQuery ?? 10);
  }
  if (els.maxApifyRuns && document.activeElement !== els.maxApifyRuns) {
    els.maxApifyRuns.value = String(s.maxApifyRuns ?? 8);
  }
  if (els.maxAgeDays && document.activeElement !== els.maxAgeDays) {
    els.maxAgeDays.value = String(s.maxAgeDays ?? 30);
  }
  if (els.cvSource && document.activeElement !== els.cvSource) {
    els.cvSource.value = s.cv?.source === 'overleaf' ? 'overleaf' : 'local';
  }
  if (els.agentProvider && document.activeElement !== els.agentProvider) {
    const ap = s.cv?.agentProvider || 'cursor';
    els.agentProvider.value = ['cursor', 'claude-code', 'codex'].includes(ap) ? ap : 'cursor';
  }
  if (els.overleafPush && document.activeElement !== els.overleafPush) {
    els.overleafPush.checked = s.cv?.overleafPush !== false;
  }
  void refreshAgentModels(s.cv?.agentProvider || 'cursor', s.cv?.agentModel || '');
  updatePlanHint(s);
  updateSheetsUi(s.sheets);
  showSetup(Boolean(s.setup?.needsSetup));
  els.apifyTip.hidden = false;

  const alerts = [];
  if (s.followUpsDue > 0) {
    alerts.push(`${s.followUpsDue} follow-up(s) due — check Tracker`);
  }
  if (s.digestNewCount > 0) {
    alerts.push(`${s.digestNewCount} new posting(s) since last fetch`);
    els.digestBadge.hidden = false;
    els.digestBadge.textContent = String(s.digestNewCount);
  } else {
    els.digestBadge.hidden = true;
  }
  els.alerts.innerHTML = alerts.map((a) => `<div class="alert">${escapeHtml(a)}</div>`).join('');

  if (s.fetchRunning) {
    setChip('running', 'Running');
    setFetchUi(true);
  } else {
    setFetchUi(false);
    if (!els.runBtn.disabled) {
      setChip(
        s.lastFetchCode && s.lastFetchCode !== 0 ? 'error' : 'idle',
        s.lastFetchCode && s.lastFetchCode !== 0 ? `Exit ${s.lastFetchCode}` : 'Idle',
      );
    }
  }
}

async function refreshMarkets() {
  const { markets } = await api('/api/markets');
  const options = markets
    .map((m) => `<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)} (${escapeHtml(m.id)})</option>`)
    .join('');
  els.marketSelect.innerHTML = options;
  if (els.setupMarket) {
    els.setupMarket.innerHTML = options;
    if (![...els.setupMarket.options].some((o) => o.value === 'DE')) {
      /* keep whatever markets exist */
    } else {
      els.setupMarket.value = 'DE';
    }
  }
}

function showSetup(needs) {
  if (!els.setupOverlay) return;
  els.setupOverlay.hidden = !needs;
  document.body.classList.toggle('setup-open', Boolean(needs));
  if (needs && els.setupForm) {
    const role = els.setupForm.elements.targetRole;
    const titles = els.setupForm.elements.searchTitles;
    if (role && titles && !titles.value) {
      role.addEventListener(
        'change',
        () => {
          if (!titles.value.trim()) titles.value = role.value;
        },
        { once: true },
      );
    }
  }
}

async function refreshTracker() {
  updateSheetsUi(state.status?.sheets);
  const hide = hiddenFromVisible(DECISIONS, state.trackerVisibleColumns);
  const qs = hide.length ? `?hide=${encodeURIComponent(hide.join(','))}` : '';
  const data = await api(`/api/tracker${qs}`);
  if (data.followUps?.length) {
    els.followUpBanner.hidden = false;
    els.followUpBanner.innerHTML = `<strong>Follow-ups due:</strong> ${data.followUps
      .map((d) => `${escapeHtml(d.title || d.id)} (${escapeHtml(d.followUpDate)})`)
      .join(' · ')}`;
  } else {
    els.followUpBanner.hidden = true;
  }

  els.kanban.innerHTML = '';
  for (const col of data.valid) {
    const items = data.columns[col] || [];
    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.innerHTML = `<h3>${escapeHtml(col)} (${items.length})</h3>`;
    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.innerHTML = `
        <strong>${escapeHtml(item.title || item.id)}</strong>
        <div class="muted">${escapeHtml(item.company || '')}</div>
        <div class="muted">${item.followUpDate ? `Follow-up ${escapeHtml(item.followUpDate)}` : 'No follow-up'}
          ${item.prepPath ? ` · prep ready` : ''}</div>
        <div class="job-actions" style="margin-top:0.4rem">
          <input type="date" data-id="${escapeAttr(item.id)}" value="${escapeAttr(item.followUpDate || '')}" />
        </div>
      `;
      card.querySelector('input')?.addEventListener('change', async (ev) => {
        try {
          await api('/api/decisions', {
            method: 'PATCH',
            body: JSON.stringify({ id: item.id, followUpDate: ev.target.value || null }),
          });
          await refreshTracker();
          await refreshStatus();
        } catch (err) {
          appendLog(err.message, 'stderr');
        }
      });
      colEl.appendChild(card);
    }
    els.kanban.appendChild(colEl);
  }
}

async function refreshAnswers() {
  const { answers } = await api('/api/saved-answers');
  els.answersForm.innerHTML = ANSWER_FIELDS.map(
    ([key, label]) => `
    <label>
      ${escapeHtml(label)}
      <input name="${escapeAttr(key)}" value="${escapeAttr(answers[key] || '')}" />
    </label>`,
  ).join('');
}

function decisionKey(job) {
  return job?.decision?.decision || 'none';
}

/** Digest is an inbox of new postings — hide applied (and any Results-filter hides). */
function digestJobVisible(job) {
  const key = decisionKey(job);
  if (key === 'applied') return false;
  const hide = hiddenFromVisible(
    DECISION_FILTER_OPTIONS.map((o) => o.id),
    state.visibleDecisions,
  );
  return !hide.includes(key);
}

async function refreshDigest() {
  const data = await api('/api/digest');
  const jobs = (data.newJobs || []).filter(digestJobVisible);
  els.digestMeta.textContent = data.digest?.generatedAt
    ? `${jobs.length} new to review (${data.digest.previousFetchAt ? new Date(data.digest.previousFetchAt).toLocaleString() : 'first run'})`
    : 'Run a search to build a digest.';
  els.digestList.innerHTML = '';
  if (!jobs.length) {
    els.digestList.innerHTML = '<div class="empty"><p>No new postings left to review. Applied jobs are in Tracker.</p></div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const job of jobs) frag.appendChild(renderJob(job));
  els.digestList.appendChild(frag);
}

async function refreshPortals() {
  const data = await api('/api/boards');
  els.portalsList.innerHTML = data.boards
    .map((b) => {
      const disabled = b.available === false;
      const path = [
        b.jobspy ? 'JobSpy (free)' : null,
        b.api ? 'API (free)' : null,
        b.apify ? 'Apify (paid)' : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const skipReason = !b.available
        ? b.needsGermanyMarket
          ? 'Germany only — switch market to DE, or leave off.'
          : b.needsBaytCountry
            ? 'Skipped for this market (needs Bayt country). Safe to leave on or turn off.'
            : 'Not available for this market.'
        : null;
      return `
      <label class="portal-card${disabled ? ' is-muted' : ''}">
        <input type="checkbox" name="portal" value="${escapeAttr(b.id)}"
          ${b.enabled ? 'checked' : ''} />
        <span class="portal-body">
          <span class="portal-title">${escapeHtml(b.label)}</span>
          <span class="portal-meta">${escapeHtml(path)} · ${escapeHtml(b.regions || '')}</span>
          <span class="portal-note">${escapeHtml(skipReason || b.note || '')}</span>
        </span>
      </label>`;
    })
    .join('');
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  els.viewResults.hidden = view !== 'results';
  els.viewTracker.hidden = view !== 'tracker';
  els.viewAnswers.hidden = view !== 'answers';
  els.viewPortals.hidden = view !== 'portals';
  els.viewDigest.hidden = view !== 'digest';
  if (view === 'tracker') refreshTracker();
  if (view === 'answers') refreshAnswers();
  if (view === 'portals') refreshPortals();
  if (view === 'digest') refreshDigest();
}

async function runSearch() {
  const market = els.marketSelect.value;
  const allowPaid = els.allowPaid.checked;
  const replace = Boolean(els.replaceResults?.checked);
  const limit = Number(els.limitPerQuery?.value || 0);
  const maxApifyRuns = Number(els.maxApifyRuns?.value);
  const maxAgeDays = Number(els.maxAgeDays?.value || 0);
  if (allowPaid) {
    const ok = window.confirm(
      'Allow paid uses Apify first (costs money — often many actor runs).\n\n' +
        'JobSpy is only used as a fallback if Apify returns nothing. Paid runs are capped by Max paid.\n\n' +
        'New finds merge into your archive (duplicates skipped) unless Replace results is on.\n\n' +
        'Continue with Apify enabled?',
    );
    if (!ok) {
      els.allowPaid.checked = false;
      return;
    }
  }
  if (replace) {
    const ok = window.confirm(
      'Replace results will wipe your current Results archive before this search.\n\n' +
        'Tracker decisions are kept. Continue?',
    );
    if (!ok) {
      els.replaceResults.checked = false;
      return;
    }
  }
  try {
    if (market && state.status?.marketId !== market) {
      await api('/api/market', { method: 'PATCH', body: JSON.stringify({ market }) });
    }
    els.prepView.hidden = true;
    els.logView.hidden = false;
    els.sideTitle.textContent = 'Run log';
    els.logView.textContent = '';
    try {
      await saveSettings({
        ...(limit > 0 ? { limitPerQuery: limit } : {}),
        ...(Number.isFinite(maxApifyRuns) ? { maxApifyRuns } : {}),
        ...(maxAgeDays > 0 ? { maxAgeDays } : {}),
      });
    } catch (err) {
      appendLog(`Could not save limits: ${err.message}`, 'stderr');
    }
    appendLog(
      [
        `Starting fetch · market=${market}`,
        allowPaid ? 'allow-paid (Apify first, JobSpy fallback, capped)' : 'FREE JobSpy only',
        replace ? 'REPLACE archive' : 'merge into archive',
        limit > 0 ? `limit=${limit}/query` : null,
        Number.isFinite(maxApifyRuns) ? `max-paid=${maxApifyRuns}` : null,
        maxAgeDays > 0 ? `max-age=${maxAgeDays}d` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
    setChip('running', 'Running');
    setFetchUi(true);
    state.page = 1;
    await api('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({
        market,
        allowPaid,
        replace,
        ...(limit > 0 ? { limit } : {}),
        ...(Number.isFinite(maxApifyRuns) ? { maxApifyRuns } : {}),
        ...(maxAgeDays > 0 ? { maxAgeDays } : {}),
      }),
    });
  } catch (err) {
    appendLog(err.message, 'stderr');
    setChip('error', 'Error');
    setFetchUi(false);
  }
}

async function stopSearch() {
  if (!els.stopBtn || els.stopBtn.disabled) return;
  els.stopBtn.disabled = true;
  appendLog('Stopping search…', 'stderr');
  try {
    await api('/api/fetch/stop', { method: 'POST', body: '{}' });
  } catch (err) {
    appendLog(err.message, 'stderr');
    els.stopBtn.disabled = false;
  }
}

async function refreshAll() {
  await refreshStatus();
  await refreshJobs();
  if (state.view === 'tracker') await refreshTracker();
  if (state.view === 'portals') await refreshPortals();
  if (state.view === 'digest') await refreshDigest();
}

els.runBtn.addEventListener('click', runSearch);
els.emptyRunBtn.addEventListener('click', runSearch);
els.stopBtn?.addEventListener('click', stopSearch);
els.searchInput.addEventListener('input', () => {
  state.page = 1;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => refreshJobs(), 200);
});
els.fitFilter.addEventListener('change', () => {
  state.page = 1;
  refreshJobs();
});
els.sortSelect?.addEventListener('change', () => {
  saveSort(els.sortSelect.value);
  state.page = 1;
  refreshJobs();
});
els.pageSize.addEventListener('change', () => {
  state.page = 1;
  refreshJobs();
});
els.prevPage.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    refreshJobs();
  }
});
els.nextPage.addEventListener('click', () => {
  if (state.page < state.pagination.pages) {
    state.page += 1;
    refreshJobs();
  }
});
els.clearLogBtn.addEventListener('click', () => {
  els.logView.textContent = '';
});
els.sheetsSyncBtn?.addEventListener('click', async () => {
  if (!els.sheetsSyncBtn || els.sheetsSyncBtn.disabled) return;
  els.sheetsSyncBtn.disabled = true;
  appendLog('Syncing applied pipeline to Google Sheets…');
  try {
    const res = await api('/api/sheets/sync', { method: 'POST', body: '{}' });
    if (res.status) {
      state.status = { ...(state.status || {}), sheets: res.status };
      updateSheetsUi(res.status);
    }
    logSheetsResult(res, 'Sheets sync');
    if (res.url) appendLog(`Sheet: ${res.url}`);
  } catch (err) {
    appendLog(`Sheets sync failed: ${err.message}`, 'stderr');
  } finally {
    els.sheetsSyncBtn.disabled = false;
  }
});
els.marketSelect.addEventListener('change', async () => {
  try {
    await api('/api/market', {
      method: 'PATCH',
      body: JSON.stringify({ market: els.marketSelect.value }),
    });
    await refreshStatus();
    if (state.view === 'portals') await refreshPortals();
    appendLog(`Market set to ${els.marketSelect.value}`);
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});
els.saveAnswersBtn.addEventListener('click', async () => {
  const answers = {};
  for (const [key] of ANSWER_FIELDS) {
    const input = els.answersForm.querySelector(`[name="${key}"]`);
    answers[key] = input?.value ?? '';
  }
  try {
    await api('/api/saved-answers', { method: 'PUT', body: JSON.stringify({ answers }) });
    appendLog('Saved answers updated');
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});
els.savePortalsBtn.addEventListener('click', async () => {
  const boards = [...els.portalsList.querySelectorAll('input[name="portal"]:checked')].map(
    (el) => el.value,
  );
  try {
    await api('/api/boards', { method: 'PUT', body: JSON.stringify({ boards }) });
    await refreshStatus();
    appendLog(`Portals saved: ${boards.join(', ')}`);
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});

async function onLimitChange(key, el, { min, max }) {
  const n = Number(el.value);
  if (!Number.isFinite(n) || n < min || n > max) {
    appendLog(`${key} must be ${min}–${max}`, 'stderr');
    await refreshStatus();
    return;
  }
  try {
    await saveSettings({ [key]: n });
    appendLog(`Saved ${key}=${n}`);
    updatePlanHint(state.status);
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
}

els.limitPerQuery?.addEventListener('change', () => onLimitChange('limitPerQuery', els.limitPerQuery, { min: 1, max: 100 }));
els.maxApifyRuns?.addEventListener('change', () => onLimitChange('maxApifyRuns', els.maxApifyRuns, { min: 0, max: 200 }));
els.maxAgeDays?.addEventListener('change', () => onLimitChange('maxAgeDays', els.maxAgeDays, { min: 1, max: 365 }));
els.limitPerQuery?.addEventListener('input', () => updatePlanHint());
els.cvSource?.addEventListener('change', async () => {
  try {
    await saveSettings({ cvSource: els.cvSource.value });
    appendLog(`CV source → ${els.cvSource.value}`);
    if (els.cvSource.value === 'overleaf' && state.status?.overleaf && !state.status.overleaf.configured) {
      appendLog(state.status.overleaf.hint, 'stderr');
    }
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});
els.agentProvider?.addEventListener('change', async () => {
  try {
    const agentProvider = els.agentProvider.value;
    await saveSettings({ agentProvider });
    appendLog(`Prep agent → ${agentProvider}`);
    await refreshAgentModels(agentProvider, '');
    const st = state.status?.agentProviders?.find((p) => p.id === agentProvider);
    if (st && !st.ok) appendLog(st.detail || 'Provider not ready', 'stderr');
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});
els.agentModel?.addEventListener('change', async () => {
  try {
    await saveSettings({ agentModel: els.agentModel.value });
    appendLog(`Agent model → ${els.agentModel.value || '(default)'}`);
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});
els.overleafPush?.addEventListener('change', async () => {
  try {
    await saveSettings({ overleafPush: els.overleafPush.checked });
    appendLog(`Overleaf push → ${els.overleafPush.checked ? 'on' : 'off'}`);
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setView(tab.dataset.view));
});

els.setupForm?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (els.setupError) {
    els.setupError.hidden = true;
    els.setupError.textContent = '';
  }
  const fd = new FormData(els.setupForm);
  const payload = {
    name: fd.get('name'),
    email: fd.get('email'),
    targetRole: fd.get('targetRole'),
    headline: fd.get('headline'),
    market: fd.get('market'),
    currentLocation: fd.get('currentLocation'),
    cities: fd.get('cities'),
    seniority: fd.get('seniority'),
    searchTitles: fd.get('searchTitles'),
    skills: fd.get('skills'),
    linkedin: fd.get('linkedin'),
    github: fd.get('github'),
    portfolio: fd.get('portfolio'),
    openToRemote: fd.get('openToRemote') === 'on',
  };
  els.setupSubmit.disabled = true;
  try {
    const res = await api('/api/setup', { method: 'POST', body: JSON.stringify(payload) });
    state.status = res.status || (await api('/api/status'));
    showSetup(false);
    appendLog(`Setup saved for ${state.status.candidate} · market ${state.status.marketId}`);
    await refreshMarkets();
    await refreshStatus();
    await refreshJobs();
  } catch (err) {
    if (els.setupError) {
      els.setupError.hidden = false;
      els.setupError.textContent = err.message;
    }
  } finally {
    els.setupSubmit.disabled = false;
  }
});

connectStream();

(async function init() {
  try {
    initFilterMenus();
    await refreshMarkets();
    await refreshStatus();
    if (!state.status?.setup?.needsSetup) await refreshJobs();
    // Keep Allow paid OFF by default — JobSpy is free. Token presence is not consent to spend.
  } catch (err) {
    appendLog(`Init failed: ${err.message}`, 'stderr');
    setChip('error', 'Error');
  }
})();
