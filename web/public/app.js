import { createMemoryEditor } from './memory-editor.js';
import { openDocumentEditor } from './document-editor.js';
import { openDiscovery } from './discovery.js';
document.getElementById('openDiscovery')?.addEventListener('click', openDiscovery);
import { mountAtsCheck } from './ats-check.js';
import { openPrepModal } from './prep-modal.js';
import { renderCvTemplates, selectedCvTemplates } from './cv-templates.js';
import { mountPager } from './pagination.js';
import { openApplicationEditor } from './application-editor.js';
import { ACTIVE_STATUSES, validDateKey, followUpState, trackerSummary, filterTracker } from './tracker-view.js';
import { createActivity } from './activity.js';
import { renderRequirementCoverage } from './review-coverage.js';

const $ = (id) => document.getElementById(id);
mountAtsCheck();
const activity = createActivity();
const prepTasks = new Map();
const prepWatchers = new Map();

function openPrepResults(result) {
  showGooseResult(result);
  activity.close();
  if (!$('prepResultsDialog').open) $('prepResultsDialog').showModal();
}
$('closePrepResultsBtn').addEventListener('click', () => $('prepResultsDialog').close());

const els = {
  marketSelect: $('marketSelect'),
  allowPaid: $('allowPaid'),
  replaceResults: $('replaceResults'),
  limitPerQuery: $('limitPerQuery'),
  fetchConcurrency: $('fetchConcurrency'),
  maxApifyRuns: $('maxApifyRuns'),
  maxAgeDays: $('maxAgeDays'),
  cvSource: $('cvSource'),
  planHint: $('planHint'),
  runBtn: $('runBtn'),
  emptyRunBtn: $('emptyRunBtn'),
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
  langFilter: $('langFilter'),
  sortSelect: $('sortSelect'),
  resultScope: $('resultScope'),
  pageSize: $('pageSize'),
  pager: $('pager'),
  pageLabel: $('pageLabel'),
  prevPage: $('prevPage'),
  nextPage: $('nextPage'),
  layout: $('layout'),
  logView: $('logView'),
  clearLogBtn: $('clearLogBtn'),
  alerts: $('alerts'),
  digestBadge: $('digestBadge'),
  viewResults: $('viewResults'),
  viewTracker: $('viewTracker'),
  viewAnswers: $('viewAnswers'),
  viewPortals: $('viewPortals'),
  viewDigest: $('viewDigest'),
  trackerMeta: $('trackerMeta'),
  trackerSearch: $('trackerSearch'),
  trackerSort: $('trackerSort'),
  trackerPageSize: $('trackerPageSize'),
  trackerTabs: $('trackerTabs'),
  trackerList: $('trackerList'),
  trackerPager: $('trackerPager'),
  trackerPageLabel: $('trackerPageLabel'),
  trackerPrevPage: $('trackerPrevPage'),
  trackerNextPage: $('trackerNextPage'),
  sheetsBar: $('sheetsBar'),
  sheetsOpenLink: $('sheetsOpenLink'),
  sheetsSyncBtn: $('sheetsSyncBtn'),
  sheetsHint: $('sheetsHint'),
  answersForm: $('answersForm'),
  saveAnswersBtn: $('saveAnswersBtn'),
  copyAnswersBtn: $('copyAnswersBtn'),
  portalsList: $('portalsList'),
  savePortalsBtn: $('savePortalsBtn'),
  digestList: $('digestList'),
  digestMeta: $('digestMeta'),
  digestTiming: $('digestTiming'),
  digestHistoryBox: $('digestHistoryBox'),
  digestHistoryList: $('digestHistoryList'),
  batchOpenBtn: $('batchOpenBtn'),
  viewReady: $('viewReady'),
  readyBadge: $('readyBadge'),
  readyMeta: $('readyMeta'),
  readySearch: $('readySearch'),
  readyList: $('readyList'),
  readyEmpty: $('readyEmpty'),
  batchModal: $('batchModal'),
  batchModalTitle: $('batchModalTitle'),
  batchSetup: $('batchSetup'),
  batchSetupHint: $('batchSetupHint'),
  batchSelectAll: $('batchSelectAll'),
  batchSelectNone: $('batchSelectNone'),
  batchSelectMissing: $('batchSelectMissing'),
  batchSelectStrong: $('batchSelectStrong'),
  batchSelectWorth: $('batchSelectWorth'),
  batchSelectCount: $('batchSelectCount'),
  batchSelectList: $('batchSelectList'),
  batchIncludeLetter: $('batchIncludeLetter'),
  batchSkipExisting: $('batchSkipExisting'),
  batchInstructions: $('batchInstructions'),
  batchError: $('batchError'),
  batchCancelSetup: $('batchCancelSetup'),
  batchStart: $('batchStart'),
  batchProgress: $('batchProgress'),
  batchProgressHint: $('batchProgressHint'),
  batchProgressFill: $('batchProgressFill'),
  batchProgressLine: $('batchProgressLine'),
  batchProgressList: $('batchProgressList'),
  batchStop: $('batchStop'),
  batchClose: $('batchClose'),
  batchGoReady: $('batchGoReady'),
  batchHistoryBox: $('batchHistoryBox'),
  batchHistoryList: $('batchHistoryList'),
  prepView: $('prepView'),
  setupOverlay: $('setupOverlay'),
  setupForm: $('setupForm'),
  setupMarket: $('setupMarket'),
  setupError: $('setupError'),
  setupSubmit: $('setupSubmit'),
  statusModal: $('statusModal'),
  statusModalTitle: $('statusModalTitle'),
  statusModalHint: $('statusModalHint'),
  statusModalChoices: $('statusModalChoices'),
  statusModalCancel: $('statusModalCancel'),
  applyAssistModal: $('applyAssistModal'),
  applyAssistTitle: $('applyAssistTitle'),
  applyAssistHint: $('applyAssistHint'),
  applyAssistStatus: $('applyAssistStatus'),
  applyAssistPack: $('applyAssistPack'),
  applyAssistBookmarklet: $('applyAssistBookmarklet'),
  applyAssistClose: $('applyAssistClose'),
  applyAssistCopy: $('applyAssistCopy'),
  applyAssistOpenFolder: $('applyAssistOpenFolder'),
  applyAssistOpen: $('applyAssistOpen'),
  recruiterModal: $('recruiterModal'),
  recruiterModalTitle: $('recruiterModalTitle'),
  recruiterModalHint: $('recruiterModalHint'),
  recruiterName: $('recruiterName'),
  recruiterRole: $('recruiterRole'),
  recruiterEmail: $('recruiterEmail'),
  recruiterEmailOpen: $('recruiterEmailOpen'),
  recruiterLinkedin: $('recruiterLinkedin'),
  recruiterLinkedinOpen: $('recruiterLinkedinOpen'),
  recruiterStatus: $('recruiterStatus'),
  recruiterSources: $('recruiterSources'),
  recruiterLog: $('recruiterLog'),
  recruiterClose: $('recruiterClose'),
  recruiterSave: $('recruiterSave'),
  recruiterLookup: $('recruiterLookup'),
  recruiterStop: $('recruiterStop'),
  recruiterAgent: $('recruiterAgent'),
};

const DECISIONS = ['shortlisted', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'closed', 'skipped'];
const DECISION_LABELS = {
  shortlisted: 'Shortlisted',
  applied: 'Applied',
  skipped: 'Skipped',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  closed: 'Closed',
};
const NEGATIVE_DECISIONS = new Set(['skipped', 'rejected', 'closed']);
/** Results filter keys — "none" = undecided (no decision yet). */
const DECISION_FILTER_OPTIONS = [
  { id: 'none', label: 'Undecided' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'applied', label: 'Applied' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'interviewing', label: 'Interviewing' },
  { id: 'offer', label: 'Offer' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'closed', label: 'Closed' },
];
const TRACKER_STATUS_OPTIONS = DECISIONS.map((id) => ({
  id,
  label: DECISION_LABELS[id],
}));
/** Tracker default: the live pile, not skipped / rejected / closed. */
const TRACKER_DEFAULT_VISIBLE = [...ACTIVE_STATUSES];
/** Preset: hide terminal / done statuses — keep hunting in the active pile. */
const ACTIVE_ONLY_HIDDEN = ['applied', 'interviewing', 'offer', 'accepted', 'skipped', 'rejected', 'closed'];
const LS_VISIBLE_DECISIONS = 'jobScout.visibleDecisions';
const LS_TRACKER_COLUMNS = 'jobScout.trackerVisibleColumns.v2';
const LS_SORT = 'jobScout.sort';
const LS_TRACKER_SORT = 'jobScout.trackerSort';
const LS_TRACKER_PAGE_SIZE = 'jobScout.trackerPageSize';
const LS_LANG = 'jobScout.langFilter';
const SORT_VALUES = ['fit', 'newest', 'oldest'];
const TRACKER_SORT_VALUES = ['newest', 'oldest'];
const TRACKER_PAGE_SIZES = [10, 20, 50];
const LANG_VALUES = ['all', 'en', 'de'];
const LANG_LABEL = { en: 'English', de: 'German' };

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
  trackerVisibleColumns: new Set(TRACKER_DEFAULT_VISIBLE),
  trackerItems: [],
  trackerCounts: {},
  trackerPage: 1,
  trackerPageSize: 20,
  trackerSort: 'newest',
  trackerDueOnly: false,
  /** Digest jobs currently shown — the pool for Create CVs… */
  digestJobs: [],
  /** Last batch snapshot from the server */
  batch: null,
  fetchStartedAt: null,
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
  for (const menu of [els.decisionFilterMenu]) {
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

const listPages = { digest: { page: 1, pageSize: 10 }, ready: { page: 1, pageSize: 10 } };
const listRequests = {};
const listPagers = {};
for (const [name, list] of [['digest', els.digestList], ['ready', els.readyList]]) {
  listPagers[name] = mountPager(list, name === 'digest' ? 'New matches' : 'Ready to apply', (page, pageSize) => {
    listPages[name] = { page, pageSize };
    (name === 'digest' ? refreshDigest : refreshReady)();
    list.previousElementSibling?.scrollIntoView({ block: 'start' });
  });
}
const resultsPager = mountPager(els.jobList, 'Find jobs', (page, pageSize) => {
  state.page = page; els.pageSize.value = String(pageSize); refreshJobs();
}, { bottom: false });
let batchJobs = [], batchSelection = new Set();
let batchPage = { page: 1, pageSize: 20 }, progressPage = { page: 1, pageSize: 20 };
function localPage(items, requested) {
  const pages = Math.max(1, Math.ceil(items.length / requested.pageSize));
  const page = Math.min(requested.page, pages);
  return { page, pages, pageSize: requested.pageSize, total: items.length, items: items.slice((page - 1) * requested.pageSize, page * requested.pageSize) };
}
const batchPager = mountPager(els.batchSelectList, 'Batch selection', (page, pageSize) => { batchPage = { page, pageSize }; renderBatchSelectList(batchJobs); }, { size: 20 });
const progressPager = mountPager(els.batchProgressList, 'Batch progress', (page, pageSize) => { progressPage = { page, pageSize }; renderBatchProgress(state.batch); }, { size: 20 });
function listFeedback(list, message, retry) {
  let box = list.parentElement.querySelector(`[data-feedback="${list.id}"]`);
  if (!box) {
    box = document.createElement('div'); box.className = 'list-feedback';
    box.dataset.feedback = list.id; box.setAttribute('role', 'status');
    list.insertAdjacentElement('beforebegin', box);
  }
  box.replaceChildren(); box.hidden = !message;
  if (message) box.append(document.createTextNode(message));
  if (retry) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn small'; button.textContent = 'Retry'; button.onclick = retry; box.append(button);
  }
}
async function loadPagedView(name, list, load, retry) {
  listRequests[name]?.abort(); const controller = new AbortController(); listRequests[name] = controller;
  list.setAttribute('aria-busy', 'true'); listFeedback(list, 'Loading…');
  try { await load(controller.signal); if (!controller.signal.aborted) listFeedback(list, ''); }
  catch (err) { if (!controller.signal.aborted) listFeedback(list, `Could not load this list: ${err.message}. `, retry); }
  finally { if (listRequests[name] === controller) list.removeAttribute('aria-busy'); }
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
  if (state.view === 'digest') { listPages.digest.page = 1; refreshDigest(); }
}

function onTrackerStatusChange() {
  saveSetToStorage(LS_TRACKER_COLUMNS, state.trackerVisibleColumns);
  state.trackerPage = 1;
  renderTracker();
}

function initFilterMenus() {
  const allDecisionIds = DECISION_FILTER_OPTIONS.map((o) => o.id);
  state.visibleDecisions = loadSetFromStorage(LS_VISIBLE_DECISIONS, allDecisionIds);
  try {
    const raw = localStorage.getItem(LS_TRACKER_COLUMNS);
    state.trackerVisibleColumns = raw
      ? loadSetFromStorage(LS_TRACKER_COLUMNS, DECISIONS)
      : new Set(TRACKER_DEFAULT_VISIBLE);
    localStorage.removeItem('jobScout.hideAppliedColumn');
  } catch {
    state.trackerVisibleColumns = new Set(TRACKER_DEFAULT_VISIBLE);
  }

  renderFilterChecks(
    els.decisionFilterChecks,
    DECISION_FILTER_OPTIONS,
    state.visibleDecisions,
    () => onDecisionFilterChange(),
  );
  updateDecisionFilterUi();
  if (els.sortSelect) els.sortSelect.value = loadSort();
  if (els.langFilter) els.langFilter.value = loadLang();
  state.trackerSort = loadTrackerSort();
  state.trackerPageSize = loadTrackerPageSize();
  if (els.trackerSort) els.trackerSort.value = state.trackerSort;
  if (els.trackerPageSize) els.trackerPageSize.value = String(state.trackerPageSize);

  els.decisionFilterBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleFilterMenu(els.decisionFilterMenu, els.decisionFilterBtn, els.decisionFilterPanel);
  });
  els.decisionFilterPanel?.addEventListener('click', (ev) => ev.stopPropagation());
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

async function openSavedFolder(button, id, templateId) {
  let status = button.nextElementSibling;
  if (!status?.hasAttribute('data-folder-status')) {
    status = document.createElement('span');
    status.dataset.folderStatus = '';
    status.className = 'meta';
    status.setAttribute('role', 'status');
    button.after(status);
  }
  button.disabled = true;
  status.textContent = 'Opening folder…';
  try {
    if (!id) throw new Error('Job reference is missing. Reopen the saved preparation results.');
    const result = await api('/api/prep/open-folder', {
      method: 'POST', body: JSON.stringify({ id, templateId }),
    });
    // The server confirms a launch request, not that a desktop window is visible.
    status.textContent = `Folder window requested: ${result.folder}`;
    appendLog(`Folder window requested: ${result.folder}`);
    return result;
  } catch (error) {
    status.textContent = `Could not open folder: ${error.message}`;
    appendLog(status.textContent, 'stderr');
    return null;
  } finally { button.disabled = false; }
}

function jobSnapshot(job) {
  if (!job) return null;
  return {
    id: job.id,
    title: job.title || '',
    company: job.company || '',
    url: job.url || '',
    board: job.board || '',
    location: job.location || '',
    salary: job.salary || '',
    remote: job.remote,
  };
}

async function submitDecision(id, decision, job = null) {
  return api('/api/decisions', {
    method: 'POST',
    body: JSON.stringify({ id, decision, job: jobSnapshot(job) }),
  });
}

function formatDuration(ms) {
  const n = Math.max(0, Math.round(Number(ms) || 0));
  if (n < 1000) return `${n}ms`;
  const sec = Math.round(n / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (!rm && !s) return `${h}h`;
  if (!s) return `${h}h ${rm}m`;
  if (!rm) return `${h}h ${s}s`;
  return `${h}h ${rm}m ${s}s`;
}

function liveElapsedMs(startedAt, finishedAt = null) {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return 0;
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  return Math.max(0, (Number.isFinite(end) ? end : Date.now()) - start);
}

function formatRunWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function fetchHistoryLine(row) {
  const bits = [formatRunWhen(row.finishedAt || row.startedAt || row.recordedAt)];
  if (row.durationMs != null) bits.push(formatDuration(row.durationMs));
  if (row.avgMsPerQuery != null) bits.push(`${formatDuration(row.avgMsPerQuery)}/query`);
  if (row.queriesRun != null) {
    bits.push(`${row.queriesRun} quer${row.queriesRun === 1 ? 'y' : 'ies'}`);
  }
  if (typeof row.newCount === 'number') bits.push(`${row.newCount} new`);
  if (row.stopped) bits.push('stopped early');
  return bits.join(' · ');
}

function batchHistoryLine(row) {
  const bits = [formatRunWhen(row.finishedAt || row.startedAt || row.recordedAt)];
  bits.push('Goose');
  if (row.durationMs != null) bits.push(formatDuration(row.durationMs));
  if (row.avgMsPerJob != null) bits.push(`${formatDuration(row.avgMsPerJob)}/job`);
  const tail = [];
  if (row.done) tail.push(`${row.done} done`);
  if (row.skipped) tail.push(`${row.skipped} skipped`);
  if (row.failed) tail.push(`${row.failed} failed`);
  if (tail.length) bits.push(tail.join(', '));
  return bits.join(' · ');
}

function renderHistoryList(el, rows, formatLine) {
  if (!el) return;
  if (!rows?.length) {
    el.innerHTML = '<li>No saved runs yet.</li>';
    return;
  }
  el.innerHTML = rows
    .slice(0, 12)
    .map((row) => `<li>${escapeHtml(formatLine(row))}</li>`)
    .join('');
}

let batchClock = null;

function stopBatchClock() {
  if (batchClock) {
    clearInterval(batchClock);
    batchClock = null;
  }
}

function tickBatchClock() {
  if (!state.batch?.running) {
    stopBatchClock();
    return;
  }
  if (els.batchProgressLine && els.batchModal && !els.batchModal.hidden && els.batchProgress && !els.batchProgress.hidden) {
    els.batchProgressLine.textContent = batchSummaryText(state.batch);
  }
}

function ensureBatchClock(snap) {
  if (snap?.running && snap.startedAt) {
    if (!batchClock) batchClock = setInterval(tickBatchClock, 1000);
  } else {
    stopBatchClock();
  }
}

function setFetchUi(running, startedAt) {
  els.runBtn.disabled = running;
  if (els.emptyRunBtn) els.emptyRunBtn.disabled = running;
  if (running) {
    const start = startedAt || state.fetchStartedAt || state.status?.fetchStartedAt;
    state.fetchStartedAt = start;
    const previous = activity.get('search');
    activity.update('search', {
      startedAt: start, status: 'running', title: 'Searching job boards',
      message: previous?.startedAt === start && previous.stopping ? 'Stop requested. Saving jobs already found…' : 'You can keep browsing while the search runs.',
      stopping: previous?.startedAt === start && previous.stopping,
      stop: stopSearch,
    });
  }
}

function appendLog(line, stream = 'stdout', notify = true) {
  const span = document.createElement('span');
  const cls = { stderr: 'err', err: 'err', tool: 'tool', meta: 'meta', ok: 'ok' }[stream];
  if (cls) span.className = cls;
  span.textContent = `${line}\n`;
  const follow = els.logView.scrollHeight - els.logView.scrollTop - els.logView.clientHeight < 60;
  els.logView.appendChild(span);
  if (follow) els.logView.scrollTop = els.logView.scrollHeight;
  if (notify && (stream === 'stderr' || stream === 'err')) activity.report(line);
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

async function copyText(text) {
  const value = String(text || '');
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function atsPill(ats) {
  if (!ats || !ats.label || ats.id === 'none') return '';
  const kind = ats.kind || 'unknown';
  return `<span class="pill ats ats-${escapeAttr(kind)}" title="${escapeAttr(ats.hint || ats.label)}">${escapeHtml(ats.label)}</span>`;
}

let applyAssistContext = { job: null, pack: null, text: '', bookmarklet: '' };
document.getElementById('applyAssistResume')?.addEventListener('click', () => {
  if (applyAssistContext.job) fillApply(applyAssistContext.job).catch(error => appendLog(error.message, 'stderr'));
});
document.getElementById('applyAssistStop')?.addEventListener('click', async () => {
  if (applyAssistContext.job) await api('/api/apply-assist/stop', { method: 'POST', body: JSON.stringify({ id: applyAssistContext.job.id }) });
});
document.getElementById('applyAssistSubmit')?.addEventListener('click', () => {
  if (!document.getElementById('applyAssistReviewed').checked || applyAssistContext.pack?.ats?.id !== 'linkedin') {
    document.getElementById('applyAssistStatus').textContent = 'Review the form and documents first. Only LinkedIn submission is supported; other boards remain manual.';
    return;
  }
  fillApply(applyAssistContext.job, true).catch(error => appendLog(error.message, 'stderr'));
  document.getElementById('applyAssistReviewed').checked = false;
});

function paintApplyAssist({ title, hint, status, text, bookmarklet, folder, url }) {
  if (els.applyAssistTitle) els.applyAssistTitle.textContent = title || 'Apply assist';
  if (els.applyAssistHint) els.applyAssistHint.textContent = hint || 'Fills known fields only. You still click Submit.';
  if (els.applyAssistStatus) els.applyAssistStatus.textContent = status || '';
  if (els.applyAssistPack) els.applyAssistPack.textContent = text || '';
  if (els.applyAssistBookmarklet) {
    els.applyAssistBookmarklet.href = bookmarklet || '#';
    els.applyAssistBookmarklet.onclick = (ev) => {
      if (!bookmarklet || bookmarklet === '#') {
        ev.preventDefault();
        return;
      }
      // Clicking javascript: here would run on Job Scout. Copy instead.
      ev.preventDefault();
      copyText(bookmarklet).then((ok) => {
        appendLog(ok
          ? 'Copied Fill bookmarklet — paste as a bookmark, then click it on the apply form.'
          : 'Could not copy bookmarklet.');
      });
    };
  }
  if (els.applyAssistOpenFolder) {
    els.applyAssistOpenFolder.hidden = !folder;
  }
  if (els.applyAssistOpen) {
    els.applyAssistOpen.hidden = !url;
    els.applyAssistOpen.dataset.url = url || '';
  }
}

function showApplyAssistModal() {
  if (els.applyAssistModal) els.applyAssistModal.hidden = false;
}

function hideApplyAssistModal() {
  if (els.applyAssistModal) els.applyAssistModal.hidden = true;
}

async function fetchApplyAssist(job) {
  const id = job?.id;
  if (!id) throw new Error('Missing job id');
  return api('/api/apply-assist', {
    method: 'POST',
    body: JSON.stringify({ id, job: jobSnapshot(job) }),
  });
}

async function copyApplyPack(job) {
  const res = await fetchApplyAssist(job);
  applyAssistContext = { job, pack: res.pack, text: res.text, bookmarklet: res.bookmarklet };
  const ok = await copyText(res.text);
  if (!ok) throw new Error('Clipboard blocked');
  appendLog(`Copied apply pack for ${job.title || 'job'} (${res.pack?.ats?.label || 'unknown ATS'}).`);
  return res;
}

async function fillApply(job, submit = false) {
  applyAssistContext = { job, pack: null, text: '', bookmarklet: '' };
  paintApplyAssist({
    title: `Fill — ${job.title || 'role'}`,
    hint: job.ats?.id === 'linkedin'
      ? 'LinkedIn Easy Apply starts with a dry run. Missing answers pause; review before explicit submission.'
      : 'Chrome opens and known fields are filled. You still confirm Submit on non-LinkedIn forms.',
    status: 'Opening Chrome… For LinkedIn, log in in that window if asked (up to 2 minutes).',
    text: '',
    bookmarklet: '',
    folder: null,
    url: job.url,
  });
  showApplyAssistModal();
  let res;
  try {
    res = await api('/api/apply-assist/fill', {
      method: 'POST',
      body: JSON.stringify({ id: job.id, job: jobSnapshot(job), dryRun: !submit, authorizeSubmit: submit }),
    });
  } catch (err) {
    paintApplyAssist({
      title: `Fill — ${job.title || 'role'}`,
      hint: job.ats?.hint || '',
      status: `Could not start fill: ${err.message}`,
      text: '',
      bookmarklet: '',
      folder: null,
      url: job.url,
    });
    throw err;
  }
  applyAssistContext = { job, pack: res.pack, text: res.text, bookmarklet: res.bookmarklet };
  const fill = res.fill || {};
  let status;
  if (fill.needsLogin) {
    status = fill.message || 'Log into LinkedIn in the Chrome window, then click Fill again.';
  } else if (fill.needsCookies) {
    status = fill.message || 'Cookie dialog is still open in Chrome — click Accept there, then Fill again.';
  } else if (fill.alreadyApplied) {
    status = 'Already applied on LinkedIn.';
  } else if (fill.submitted) {
    status = `Submitted Easy Apply (${fill.filled ?? 0} fields`
      + (fill.uploaded ? `, ${fill.uploaded} file(s)` : '')
      + '). Marked Applied.';
  } else if (fill.needsReview) {
    status = fill.message || 'Easy Apply needs an answer Chrome could not guess — finish it in that window and Submit.';
  } else if (res.launched) {
    status = fill.message
      || `Opened Chrome and filled ${fill.filled ?? 0} field(s). Review that window.`;
  } else {
    status = res.reason || fill.error || 'Fill did not start.';
  }
  paintApplyAssist({
    title: `Fill — ${job.title || 'role'}`,
    hint: res.pack?.ats?.hint || job.ats?.hint || '',
    status,
    text: res.text || '',
    bookmarklet: res.bookmarklet || '',
    folder: res.pack?.files?.folderAbs,
    url: job.url || res.pack?.applyUrl,
  });
  appendLog(status);
  if ((fill.submitted || fill.alreadyApplied) && job.id) {
    try {
      const dec = await submitDecision(job.id, 'applied', job);
      logSheetsResult(dec.sheets, 'Sheets (applied)');
      await refreshJobs();
      if (state.view === 'tracker') await refreshTracker();
      if (state.view === 'ready') await refreshReady();
    } catch (err) {
      appendLog(`Could not mark applied: ${err.message}`, 'stderr');
    }
  }
  return res;
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTrackerWhen(item) {
  const stamp = item?.updatedAt || '';
  if (stamp && /T/.test(stamp)) {
    const d = new Date(stamp);
    if (!Number.isNaN(d.getTime())) {
      return {
        date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      };
    }
  }
  return { date: formatShortDate(item?.date) || '—', time: '' };
}

function formatBoard(board) {
  if (!board) return '';
  const known = {
    linkedin: 'LinkedIn',
    indeed: 'Indeed',
    glassdoor: 'Glassdoor',
    arbeitnow: 'Arbeitnow',
    arbeitsagentur: 'Arbeitsagentur',
    nomado24: 'Nomado24',
    stepstone: 'StepStone',
    xing: 'Xing',
    kimeta: 'Kimeta',
    heise: 'Heise Jobs',
    germantechjobs: 'GermanTechJobs',
    berlinstartupjobs: 'Berlin Startup Jobs',
    munichstartup: 'Munich Startup',
    pegel: 'Pegel',
  };
  const key = String(board).toLowerCase();
  if (known[key]) return known[key];
  return board.charAt(0).toUpperCase() + board.slice(1);
}

function connectStream() {
  const es = new EventSource('/api/fetch/stream');
  es.addEventListener('log', (ev) => {
    const data = JSON.parse(ev.data);
    appendLog(data.line, data.stream, false);
  });
  es.addEventListener('done', async (ev) => {
    const data = JSON.parse(ev.data);
    setFetchUi(false);
    finishSearchActivity(data);
    if (data.stopped) {
      appendLog('Search stopped. Jobs found before stop were saved into the archive.');
    }
    await refreshAll();
    if (data.code === 0 && !data.stopped) finishSearchActivity(data, state.status?.digestNewCount);
  });
  es.addEventListener('status', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.running) {
      setFetchUi(true, data.startedAt);
    } else if (data.startedAt && (!activity.get('search') || activity.get('search').status === 'running')) {
      setFetchUi(false);
      finishSearchActivity({ code: data.lastCode, stopped: data.lastCode == null, startedAt: data.startedAt, durationMs: data.lastDurationMs });
      void refreshAll();
    }
  });
  es.onerror = () => {
    if (activity.get('search')?.status === 'running') activity.update('search', { message: 'Connection interrupted. Reconnecting to check search progress…' });
  };
  return es;
}

function finishSearchActivity(data, count) {
  const failed = !data.stopped && data.code !== 0;
  const duration = data.durationMs != null ? ` Took ${formatDuration(data.durationMs)}.` : '';
  activity.update('search', {
    startedAt: data.startedAt || activity.get('search')?.startedAt,
    status: data.stopped ? 'stopped' : failed ? 'error' : 'success',
    title: data.stopped ? 'Search stopped' : failed ? 'Search failed' : 'Search complete',
    message: (data.stopped ? 'Jobs saved before the stop are available in Find jobs.' : failed ? 'The search could not finish. Check Technical logs for details, then run the search again.' : Number.isFinite(count) ? `${count} new matches available.` : 'Your results are ready to browse.') + duration,
    actionLabel: data.stopped ? 'View jobs' : failed ? 'View details' : 'View matches',
    action: failed ? () => { activity.open(); $('technicalLogs').open = true; } : () => setView(data.stopped ? 'results' : 'digest'),
  });
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

function loadTrackerSort() {
  try {
    const raw = localStorage.getItem(LS_TRACKER_SORT);
    return TRACKER_SORT_VALUES.includes(raw) ? raw : 'newest';
  } catch {
    return 'newest';
  }
}

function saveTrackerSort(value) {
  const next = TRACKER_SORT_VALUES.includes(value) ? value : 'newest';
  state.trackerSort = next;
  try {
    localStorage.setItem(LS_TRACKER_SORT, next);
  } catch {
    /* ignore */
  }
}

function loadTrackerPageSize() {
  try {
    const n = Number(localStorage.getItem(LS_TRACKER_PAGE_SIZE));
    return TRACKER_PAGE_SIZES.includes(n) ? n : 20;
  } catch {
    return 20;
  }
}

function saveTrackerPageSize(value) {
  const n = Number(value);
  const next = TRACKER_PAGE_SIZES.includes(n) ? n : 20;
  state.trackerPageSize = next;
  try {
    localStorage.setItem(LS_TRACKER_PAGE_SIZE, String(next));
  } catch {
    /* ignore */
  }
}

function loadLang() {
  try {
    const raw = localStorage.getItem(LS_LANG);
    return LANG_VALUES.includes(raw) ? raw : 'all';
  } catch {
    return 'all';
  }
}

function saveLang(value) {
  try {
    localStorage.setItem(LS_LANG, LANG_VALUES.includes(value) ? value : 'all');
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
    lang: els.langFilter?.value || 'all',
    sort: els.sortSelect?.value || 'fit',
    scope: els.resultScope?.value || 'current',
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
  el.dataset.prepJob = job.id;
  const decision = job.decision?.decision;
  const fit = job.fit;
  const facts = [
    job.location,
    job.remote === true ? 'Remote' : null,
    job.ageDays != null ? `Posted ${job.ageDays}d ago` : 'Posting date unknown',
    job.currentSearch?.lastSeenAt ? `Last seen ${new Date(job.currentSearch.lastSeenAt).toLocaleDateString()}` : null,
    job.board ? `${formatBoard(job.board)}${job.via ? ` via ${job.via}` : ''}` : null,
    job.salary,
  ].filter(Boolean);
  const written = job.writtenLanguage || job.language;
  const langLabel = LANG_LABEL[written];

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
      ${compact ? '' : '<button type="button" class="btn ghost toggle-desc" aria-expanded="false">View details</button>'}
    </div>
    <div class="job-facts">
      ${
        fit
          ? `<span class="pill ${FIT_CLASS[fit.verdict] || ''}">${escapeHtml(fit.verdict)} · ${fit.score}</span>`
          : ''
      }
      ${job.isNew ? '<span class="pill new">New</span>' : ''}
      ${langLabel ? `<span class="pill lang-${escapeAttr(written)}">${escapeHtml(langLabel)}</span>` : ''}
      ${job.germanRequired && written === 'en' ? '<span class="pill lang-de">German required</span>' : ''}
      ${atsPill(job.ats)}
      ${job.prepOutdated ? '<span class="pill flag">Outdated documents</span>' : ''}
      ${job.prepNeedsReview ? '<span class="pill flag">Documents need review</span>' : ''}
      ${job.currentSearch && !job.currentSearch.current ? `<span class="pill flag" title="${escapeAttr(job.currentSearch.reasons.join('; '))}">Outside current search</span>` : ''}
      ${fit?.eligibility?.status === 'needs-checking' ? '<span class="pill flag">Requirements need checking</span>' : ''}
      ${job.tailoredCv && job.prepFreshness?.cv === 'current' ? '<span class="pill ok">CV ready</span>' : ''}
      ${job.coverLetter && job.prepFreshness?.letter === 'current' ? '<span class="pill ok">Letter ready</span>' : ''}
      ${job.recruiter?.foundEmail ? '<span class="pill ok">Recruiter</span>' : ''}
      ${job.recruiter?.name && !job.recruiter?.foundEmail ? '<span class="pill">Recruiter name</span>' : ''}
      ${facts.map((f) => `<span>${escapeHtml(f)}</span>`).join('')}
      ${also.map((s) => `<span class="pill" title="Also seen on">also ${escapeHtml(s)}</span>`).join('')}
      ${flags}
    </div>
    ${
      compact
        ? ''
        : `
    <div class="job-actions">
      <button type="button" class="btn small ok" data-prep>${job.tailoredCv || job.tailoredPdf ? 'Recreate CV' : 'Create CV'}</button>
      <button type="button" class="btn small ${
        decision ? `active${NEGATIVE_DECISIONS.has(decision) ? ' danger' : ''}` : ''
      }" data-status title="Change status" aria-haspopup="dialog">${
        decision ? escapeHtml(DECISION_LABELS[decision] || decision) : 'Save / change status'
      }</button>
      ${
        job.tailoredCv
          ? `<a class="btn small" data-cv href="/api/prep/${encodeURIComponent(job.id)}/cv.html" target="_blank" rel="noopener">CV</a>
             ${
               job.tailoredPdfMain || job.tailoredPdfAts || job.tailoredPdf
                 ? `<button type="button" class="btn small" data-open-folder>Open Folder</button>`
                 : ''
             }`
          : ''
      }
      ${
        job.url
          ? `<button type="button" class="btn small" data-copy-pack>Copy pack</button>
             <button type="button" class="btn small" data-fill>${/linkedin\.com/i.test(job.url || '') ? 'Fill / submit Easy Apply' : 'Fill form'}</button>
             <button type="button" class="btn small" data-recruiter>Recruiter</button>
             <a class="btn small primary-link" data-apply href="${escapeAttr(job.url)}" target="_blank" rel="noopener">Open application ↗</a>`
          : ''
      }
    </div>
    <p class="job-prep-status" data-prep-status hidden></p>
    <div class="job-fit" hidden></div>
    <div class="job-desc" hidden></div>`
    }
  `;

  if (!compact) {
    const fitBox = el.querySelector('.job-fit');
    const desc = el.querySelector('.job-desc');
    fitBox.innerHTML = fit
      ? `<strong>Why:</strong> ${(fit.reasons || []).map(escapeHtml).join(' · ')}
         <ul>${(fit.gaps || []).slice(0, 5).map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>
         ${(fit.relevantExperience || []).length ? '<strong>Supporting experience from Memory</strong>' : ''}
         ${(fit.relevantExperience || []).map(role => `<p>${escapeHtml(role.title || '')} — ${escapeHtml(role.org || '')}</p><ul>${role.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`).join('')}`
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
      el.querySelector('.toggle-desc').setAttribute('aria-expanded', String(open));
      el.querySelector('.toggle-desc').textContent = open ? 'Hide details' : 'View details';
      desc.hidden = !open;
      fitBox.hidden = !open;
      el.classList.toggle('open', open);
    });

    el.querySelector('[data-status]')?.addEventListener('click', async () => {
      const next = await openStatusModal(job);
      if (!next || next === decision) return;
      try {
        const res = await submitDecision(job.id, next, job);
        logSheetsResult(res.sheets, `Sheets (${next})`);
        await refreshJobs();
        if (state.view === 'tracker') await refreshTracker();
        if (state.view === 'digest') await refreshDigest();
        if (state.view === 'ready') await refreshReady();
        else setReadyBadge((await api('/api/status')).readyCount);
      } catch (err) {
        appendLog(`Decision failed: ${err.message}`, 'stderr');
      }
    });

    el.querySelector('[data-prep]')?.addEventListener('click', async () => {
      await runPrepFlow(job);
    });

    el.querySelector('[data-open-folder]')?.addEventListener('click', event => {
      void openSavedFolder(event.currentTarget, job.id);
    });

    el.querySelector('[data-copy-pack]')?.addEventListener('click', async () => {
      try {
        await copyApplyPack(job);
      } catch (err) {
        appendLog(`Copy pack failed: ${err.message}`, 'stderr');
      }
    });

    el.querySelector('[data-fill]')?.addEventListener('click', async () => {
      try {
        await fillApply(job);
      } catch (err) {
        appendLog(`Fill failed: ${err.message}`, 'stderr');
      }
    });

    el.querySelector('[data-recruiter]')?.addEventListener('click', async () => {
      try {
        await openRecruiterModal(job);
      } catch (err) {
        appendLog(`Recruiter lookup failed: ${err.message}`, 'stderr');
      }
    });

    el.querySelector('[data-apply]')?.addEventListener('click', async () => {
      // Open posting in a new tab (browser default via href). Offer to mark applied.
      appendLog(`Opened apply link for ${job.title} (${job.ats?.label || 'unknown'}) — submit the form yourself.`);
      const mark = window.confirm(
        'Apply page opened in a new tab.\n\nMark this job as Applied in the tracker after you submit?\n(You still submit the application yourself.)',
      );
      if (!mark) return;
      try {
        const res = await submitDecision(job.id, 'applied', job);
        await refreshJobs();
        if (state.view === 'tracker') await refreshTracker();
        if (state.view === 'digest') await refreshDigest();
        if (state.view === 'ready') await refreshReady();
        appendLog(`Marked applied: ${job.title}`);
        logSheetsResult(res.sheets, 'Sheets (applied)');
      } catch (err) {
        appendLog(err.message, 'stderr');
      }
    });
  }

  updateJobPrepStatus(el, job.id);
  return el;
}

const RECRUITER_SIDECAR = 'http://127.0.0.1:4051';
let recruiterOrigin = null;
let recruiterJob = null;
let recruiterPoll = null;
let recruiterLookedUp = false;

async function resolveRecruiterOrigin() {
  if (recruiterOrigin !== null) return recruiterOrigin;
  try {
    const res = await fetch('/api/recruiter-contact/status');
    if (res.ok) {
      recruiterOrigin = '';
      return recruiterOrigin;
    }
  } catch { /* running server may predate this API */ }
  try {
    const res = await fetch(`${RECRUITER_SIDECAR}/api/recruiter-contact/status`);
    if (res.ok) {
      recruiterOrigin = RECRUITER_SIDECAR;
      return recruiterOrigin;
    }
  } catch { /* sidecar not up */ }
  recruiterOrigin = '';
  return recruiterOrigin;
}

async function recruiterApi(path, options = {}, retried = false) {
  const origin = await resolveRecruiterOrigin();
  const res = await fetch(`${origin}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!retried && origin === '' && res.status === 404) {
      recruiterOrigin = RECRUITER_SIDECAR;
      return recruiterApi(path, options, true);
    }
    throw new Error(data.error || res.statusText || 'Recruiter API failed');
  }
  return data;
}

function paintRecruiterContact(contact) {
  const c = contact || {};
  if (els.recruiterName) els.recruiterName.value = c.name || '';
  if (els.recruiterRole) els.recruiterRole.value = c.role || '';
  if (els.recruiterEmail) els.recruiterEmail.value = c.email || '';
  if (els.recruiterLinkedin) els.recruiterLinkedin.value = c.linkedinUrl || '';
  if (els.recruiterEmailOpen) {
    els.recruiterEmailOpen.hidden = !c.email;
    els.recruiterEmailOpen.href = c.email ? `mailto:${c.email}` : '#';
  }
  if (els.recruiterLinkedinOpen) {
    els.recruiterLinkedinOpen.hidden = !c.linkedinUrl;
    els.recruiterLinkedinOpen.href = c.linkedinUrl || '#';
  }
  if (els.recruiterSources) {
    const bits = (c.sources || [])
      .map((s) => s.kind || s.note)
      .filter(Boolean)
      .slice(-6);
    els.recruiterSources.textContent = bits.length ? `Sources: ${bits.join(' · ')}` : '';
  }
}

function paintRecruiterRun(run, { finishedWithoutEmail = false } = {}) {
  const running = Boolean(run?.running && run.jobId === recruiterJob?.id);
  const logs = (run?.logs || []).map((l) => l.line).filter(Boolean);
  if (els.recruiterLog) {
    els.recruiterLog.hidden = logs.length === 0;
    els.recruiterLog.textContent = logs.slice(-12).join('\n');
    els.recruiterLog.scrollTop = els.recruiterLog.scrollHeight;
  }
  if (els.recruiterStop) els.recruiterStop.hidden = !running;
  if (els.recruiterLookup) els.recruiterLookup.disabled = running;
  if (els.recruiterAgent) {
    const showAgent = !running && finishedWithoutEmail;
    els.recruiterAgent.hidden = !showAgent;
    els.recruiterAgent.disabled = running;
  }
  if (els.recruiterStatus) {
    if (running) {
      els.recruiterStatus.textContent = run.mode === 'agent'
        ? 'Agent is searching the public web…'
        : 'Looking up the posting and company pages…';
    } else if (run?.error) {
      els.recruiterStatus.textContent = run.error;
    }
  }
}

function stopRecruiterPoll() {
  if (recruiterPoll) {
    clearInterval(recruiterPoll);
    recruiterPoll = null;
  }
}

async function refreshRecruiterModal() {
  if (!recruiterJob) return;
  const data = await recruiterApi(`/api/recruiter-contact?id=${encodeURIComponent(recruiterJob.id)}`);
  const contact = data.contact;
  const run = data.run || {};
  paintRecruiterContact(contact);
  const running = Boolean(run.running && run.jobId === recruiterJob.id);
  const noEmail = !contact?.email;
  if (contact?.lookedUpAt) recruiterLookedUp = true;
  paintRecruiterRun(run, { finishedWithoutEmail: recruiterLookedUp && noEmail && !running });
  if (!running && els.recruiterStatus && !run.error) {
    if (contact?.email) {
      els.recruiterStatus.textContent = contact.genericEmail
        ? `Saved a generic inbox (${contact.email}). Agent search can try for a named recruiter.`
        : 'Saved.';
      if (contact.genericEmail && recruiterLookedUp) {
        if (els.recruiterAgent) els.recruiterAgent.hidden = false;
      }
    } else if (recruiterLookedUp) {
      els.recruiterStatus.textContent = 'No email on the posting or company pages. Use Search with agent to try the public web.';
    } else {
      els.recruiterStatus.textContent = 'Not looked up yet.';
    }
  }
  if (!running) stopRecruiterPoll();
  return { contact, run, running };
}

function startRecruiterPoll() {
  stopRecruiterPoll();
  recruiterPoll = setInterval(() => {
    refreshRecruiterModal().catch((err) => {
      stopRecruiterPoll();
      if (els.recruiterStatus) els.recruiterStatus.textContent = err.message;
    });
  }, 600);
}

async function startRecruiterLookup(mode) {
  if (!recruiterJob) return;
  if (mode === 'agent') recruiterLookedUp = true;
  paintRecruiterRun({ running: true, jobId: recruiterJob.id, mode, logs: [] });
  await recruiterApi('/api/recruiter-contact', {
    method: 'POST',
    body: JSON.stringify({ id: recruiterJob.id, mode }),
  });
  startRecruiterPoll();
  await refreshRecruiterModal();
}

async function openRecruiterModal(job) {
  recruiterJob = job;
  recruiterLookedUp = Boolean(job.recruiter?.email || job.recruiter?.name);
  if (els.recruiterModalTitle) {
    els.recruiterModalTitle.textContent = job.company
      ? `Recruiter — ${job.company}`
      : 'Recruiter';
  }
  if (els.recruiterModalHint) {
    els.recruiterModalHint.textContent = [job.title, job.company].filter(Boolean).join(' · ');
  }
  paintRecruiterContact(job.recruiter || {});
  if (els.recruiterStatus) els.recruiterStatus.textContent = 'Loading…';
  if (els.recruiterLog) {
    els.recruiterLog.hidden = true;
    els.recruiterLog.textContent = '';
  }
  if (els.recruiterAgent) els.recruiterAgent.hidden = true;
  if (els.recruiterModal) els.recruiterModal.hidden = false;
  try {
    await resolveRecruiterOrigin();
    const { contact, running } = await refreshRecruiterModal();
    if (running) {
      startRecruiterPoll();
      return;
    }
    if (!contact?.lookedUpAt && !contact?.email) {
      recruiterLookedUp = true;
      await startRecruiterLookup('lookup');
    }
  } catch (err) {
    if (els.recruiterStatus) {
      els.recruiterStatus.textContent = `${err.message} Start the recruiter sidecar (node web/recruiter-sidecar.mjs) if the main UI server was already running.`;
    }
    throw err;
  }
}

function hideRecruiterModal() {
  stopRecruiterPoll();
  recruiterJob = null;
  if (els.recruiterModal) els.recruiterModal.hidden = true;
}

async function saveRecruiterEdits() {
  if (!recruiterJob) return;
  const res = await recruiterApi('/api/recruiter-contact', {
    method: 'PATCH',
    body: JSON.stringify({
      id: recruiterJob.id,
      name: els.recruiterName?.value || '',
      role: els.recruiterRole?.value || '',
      email: els.recruiterEmail?.value || '',
      linkedinUrl: els.recruiterLinkedin?.value || '',
    }),
  });
  paintRecruiterContact(res.contact);
  if (els.recruiterStatus) els.recruiterStatus.textContent = 'Saved.';
  appendLog(`Recruiter saved for ${recruiterJob.title}`);
}

function closeStatusModal() {
  if (els.statusModal) els.statusModal.hidden = true;
}

/**
 * @returns {Promise<string | null>} decision id, or null if cancelled
 */
function openStatusModal(job) {
  return new Promise((resolve) => {
    if (!els.statusModal || !els.statusModalChoices) {
      resolve(null);
      return;
    }
    const current = job.decision?.decision || '';
    els.statusModalTitle.textContent = 'Set status';
    els.statusModalHint.textContent = [job.title, job.company].filter(Boolean).join(' · ') || 'Choose how to track this job.';
    els.statusModalChoices.innerHTML = DECISIONS.map((d) => {
      const danger = NEGATIVE_DECISIONS.has(d) ? ' danger' : '';
      const active = current === d ? ' active' : '';
      return `<button type="button" class="btn small${danger}${active}" data-pick="${d}">${escapeHtml(
        DECISION_LABELS[d] || d,
      )}</button>`;
    }).join('');
    els.statusModal.hidden = false;

    const finish = (value) => {
      els.statusModalCancel?.removeEventListener('click', onCancel);
      els.statusModalChoices.removeEventListener('click', onPick);
      els.statusModal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      closeStatusModal();
      resolve(value);
    };
    const onCancel = () => finish(null);
    const onBackdrop = (ev) => {
      if (ev.target === els.statusModal) finish(null);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(null);
    };
    const onPick = (ev) => {
      const btn = ev.target.closest('[data-pick]');
      if (!btn) return;
      finish(btn.dataset.pick);
    };
    els.statusModalCancel?.addEventListener('click', onCancel);
    els.statusModalChoices.addEventListener('click', onPick);
    els.statusModal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

/** Reconnects to the server's buffered events without starting another workflow. */
function waitForPrepDone(startedAt, job, runId) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/prep/stream?runId=${encodeURIComponent(runId)}`);
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
        appendLog(`${job.company || job.title}: ${entry.line || ''}`, entry.stream || 'stdout', false);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('done', (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        // Ignore stale completions from a previous run
        if (runId && parsed.runId !== runId) return;
        if (startedAt && parsed.startedAt && parsed.startedAt !== startedAt) return;
        finish(resolve, parsed);
      } catch (err) {
        finish(reject, err);
      }
    });
    es.addEventListener('status', (ev) => {
      const snapshot = JSON.parse(ev.data);
      if (snapshot.runId !== runId || snapshot.startedAt !== startedAt) {
        finish(reject, new Error('This run is no longer available. Check the job’s documents before preparing again.'));
      } else if (snapshot.running) {
        updatePrepTask(job, { message: snapshot.queued ? 'Queued. Waiting for a preparation slot.' : 'Preparing documents. You can keep browsing.' });
      }
    });
    es.onerror = () => {
      if (settled) return;
      updatePrepTask(job, { message: 'Connection interrupted. Reconnecting to check preparation progress…' });
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
      els.sheetsHint.textContent = `Google Sheet tab “${sheets.tab || 'Applications'}” — Application statuses, including offers and acceptances, sync here.`;
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

function logSheetsPull(pull) {
  if (!pull || pull.skipped) return;
  if (pull.ok === false && pull.error) {
    appendLog(`Sheets pull: ${pull.error}`, 'stderr');
    return;
  }
  if (pull.pulled > 0) {
    appendLog(`Sheets: marked ${pull.pulled} job(s) rejected from the sheet`);
    for (const u of pull.updated || []) {
      appendLog(`  ${u.company || '—'} — ${u.title || u.id} (${u.from} → rejected)`);
    }
  }
  if (pull.unmatched?.length) {
    appendLog(`Sheets: ${pull.unmatched.length} rejected row(s) had no matching job in Job Scout`);
  }
}

function showLogView() {
  $('prepResultsDialog').close();
  activity.open();
}

async function runPrepFlow(job, opts = {}) {
  $('prepResultsDialog').close();
  const choice = await openPrepModal(job, { ...opts, api });
  if (!choice) return;
  updatePrepTask(job, { status: 'running', title: 'Starting preparation', message: 'Starting the document workflow…', startedAt: new Date().toISOString(), stopping: false, starting: true });
  try {
    appendLog(`Starting Goose workflow for ${job.title}…`);
    const started = await api('/api/prep', {
      method: 'POST', body: JSON.stringify({ id: job.id, ...choice }),
    });
    await watchPrep(job, started.startedAt, started.runId);
  } catch (error) { failPrep(job, error); }
}

function updatePrepTask(job, patch) {
  const id = `prep:${job.id}`;
  const runId = patch.starting ? null : patch.runId || prepTasks.get(job.id)?.runId;
  const task = activity.update(id, {
    ...patch,
    runId,
    jobId: job.id,
    title: `${patch.title || 'Preparing documents'} · ${job.company ? `${job.company} — ` : ''}${job.title}`,
    stop: patch.starting ? null : async () => {
      activity.update(id, { stopping: true, message: 'Stop requested. Waiting for the current step to cancel…' });
      try { await api('/api/prep/stop', { method: 'POST', body: JSON.stringify({ runId }) }); }
      catch (error) { activity.update(id, { stopping: false, message: `Could not stop: ${error.message}` }); }
    },
  });
  prepTasks.set(job.id, task);
  document.querySelectorAll('[data-prep-job]').forEach((card) => updateJobPrepStatus(card, card.dataset.prepJob));
  return task;
}

function updateJobPrepStatus(card, id) {
  const task = prepTasks.get(id);
  const status = card.querySelector('[data-prep-status]');
  if (!status) return;
  status.hidden = !task;
  if (task) {
    status.dataset.state = task.status;
    status.textContent = `${task.status === 'running' ? 'Preparing documents' : task.status === 'error' ? 'Preparation failed' : task.status === 'stopped' ? 'Preparation stopped' : 'Preparation complete'} · ${task.message}`;
  }
  const trigger = card.querySelector('[data-prep]');
  if (trigger) trigger.disabled = task?.status === 'running';
}

function failPrep(job, error) {
  appendLog(`Prep failed: ${error.message}`, 'stderr', false);
  updatePrepTask(job, { status: 'error', title: 'Preparation failed', message: error.message, actionLabel: 'Try Prep again', action: () => runPrepFlow(job) });
}

function watchPrep(job, startedAt, runId) {
  if (prepWatchers.has(runId)) return prepWatchers.get(runId);
  updatePrepTask(job, { status: 'running', title: 'Preparing documents', message: 'The document workflow is running. You can keep browsing.', startedAt, runId, stopping: false, starting: false });
  const watch = (async () => {
    try {
      const result = await waitForPrepDone(startedAt, job, runId);
      if (result.cancelled) {
        updatePrepTask(job, { status: 'stopped', title: 'Preparation stopped', message: 'The workflow was cancelled. Previously accepted documents are preserved.', actionLabel: 'Prepare again', action: () => runPrepFlow(job) });
      } else {
        if (!result?.ok) throw new Error(result?.error || 'Document preparation failed');
        const status = result.workflow?.status;
        const incomplete = status && status !== 'completed';
        updatePrepTask(job, { status: incomplete ? 'error' : 'success', title: incomplete ? 'Preparation needs attention' : 'Preparation complete', message: incomplete ? 'Some preparation steps need review. Open results to see the findings.' : result.pack ? 'Preparation results are available. Open them to see documents and review findings.' : 'The workflow finished. Open results to read its findings.', actionLabel: 'View results', action: () => openPrepResults(result) });
      }
      await refreshAll();
    } catch (error) { failPrep(job, error); }
    finally { prepWatchers.delete(runId); }
  })();
  prepWatchers.set(runId, watch);
  return watch;
}

function showGooseResult(result) {
  const workflow = result.workflow;
  if (result.pack) showPrep(result);
  else {
    els.prepView.replaceChildren();
  }
  const section = document.createElement('section');
  section.className = 'goose-result';
  const title = document.createElement('h3');
  title.textContent = `Goose workflow · ${workflow.status}`;
  const steps = document.createElement('ol');
  for (const call of workflow.calls) {
    const item = document.createElement('li');
    item.textContent = `${call.tool}: ${call.status}`; steps.append(item);
  }
  const summary = document.createElement('pre'); summary.textContent = workflow.summary;
  const audit = document.createElement('p'); audit.className = 'meta';
  audit.textContent = `Run record: ${workflow.auditPath}`;
  section.append(title, steps, summary, audit); els.prepView.prepend(section);
  if (!result.pack) {
    const back = document.createElement('button'); back.className = 'btn ghost';
    back.textContent = 'View activity'; back.addEventListener('click', showLogView); section.append(back);
  }
  appendLog(`Goose workflow ${workflow.status}. ${workflow.auditPath}`);
}

function reviewScoreBits(scores) {
  if (!scores) return '';
  const parts = [
    scores.ats != null ? `ATS ${scores.ats}/10` : '',
    scores.postingFit != null ? `fit ${scores.postingFit}/10` : 'fit not assessed',
    scores.recruiterScan != null ? `scan ${scores.recruiterScan}/10` : '',
    scores.coverLetter != null ? `letter ${scores.coverLetter}/10` : '',
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(' · ')})` : '';
}

function reviewSectionHtml(label, block, href) {
  if (!block) return '';
  const verdict = block.verdict === 'not_reviewed' || !block.verdict ? 'Not reviewed' : String(block.verdict);
  const loop = block.ranFixLoop
    ? block.restored
      ? ' · fix loop reverted'
      : ' · fix loop applied'
    : '';
  const must = (block.mustFix || []).slice(0, 4);
  const mustHtml = must.length
    ? `<ul>${must.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    : '';
  const scores = reviewScoreBits(block.scores);
  const scoreLabel = verdict === 'Not reviewed' && scores ? ` · provisional scores${scores}` : scores;
  const limitations = (block.limitations || []).length
    ? `<p><strong>Review limitations:</strong></p><ul>${block.limitations.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '';
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(verdict)}${escapeHtml(scoreLabel)}${escapeHtml(loop)}${
    href ? ` · <a href="${escapeAttr(href)}" target="_blank" rel="noopener">Open</a>` : ''
  }</p>${block.error ? `<p>${escapeHtml(block.error)}</p>` : ''}${mustHtml}${limitations}${renderRequirementCoverage(block.requirementCoverage)}`;
}

function reviewPanel(review, jobId) {
  if (!review || (!review.cv && !review.letter)) return '';
  const revise = [review.cv, review.letter].some((r) => r && r.verdict !== 'pass');
  const base = jobId ? `/api/prep/${encodeURIComponent(jobId)}` : '';
  return `<div class="prep-review${revise ? ' revise' : ''}">
    <h4>Reviewer</h4>
    ${reviewSectionHtml('CV', review.cv, base ? `${base}/review.md` : '')}
    ${reviewSectionHtml('Cover letter', review.letter, base ? `${base}/cover-letter-review.md` : '')}
  </div>`;
}

function showPrep(data) {
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
    ? ` · tailor: ${pack.tailorMode}`
    : '';
  els.prepView.innerHTML = `
    ${(pack.variants || []).length ? `<h3>CV formats</h3><div class="prep-actions">${pack.variants.map(v =>
      `<span>${escapeHtml(v.templateName)} ${v.needsReview ? '(needs review)' : ''}</span>${v.downloadCvPdf ? `<a class="btn small" href="${escapeAttr(v.downloadCvPdf)}" target="_blank" rel="noopener">View PDF</a>` : ''}${v.downloadCvHtml ? `<a class="btn small" href="${escapeAttr(v.downloadCvHtml)}" target="_blank" rel="noopener">View HTML</a>` : ''}`).join('')}</div>` : ''}
    <h3>${escapeHtml(data.fit?.verdict || '')} · ${escapeHtml(pack.relativeDir || '')}</h3>
    <p>Source: <strong>${escapeHtml(pack.cvSource || 'local')}</strong>
      ${pack.cvContentSource ? `(${escapeHtml(pack.cvContentSource)})` : ''}
      ${pack.hasPdf ? ` · PDF ready (${escapeHtml(pack.pdfNote || '')})` : ` · ${escapeHtml(pack.pdfNote || 'no PDF')}`}
      ${escapeHtml(cachedNote)}${escapeHtml(modeNote)}</p>
    ${pack.extraInstructions ? `<p class="meta">Instructions: ${escapeHtml(pack.extraInstructions)}</p>` : ''}
    ${olLine ? `<p class="meta">${escapeHtml(olLine)}</p>` : ''}
    ${reviewPanel(pack.review, pack.jobId || data.jobId)}
    <div class="prep-actions">
      <button type="button" class="btn small primary-link" id="openCompanyFolder">Open Folder</button>
      <button type="button" class="btn small" id="generateCoverLetter">Generate cover letter</button>
      ${cvMain || cvPdf ? `<a class="btn small" href="${escapeAttr(cvMain || cvPdf)}" target="_blank" rel="noopener">Preview Main</a>` : ''}
      ${cvAts ? `<a class="btn small" href="${escapeAttr(cvAts)}" target="_blank" rel="noopener">Preview ATS</a>` : ''}
      ${cvHtml ? `<a class="btn small" href="${escapeAttr(cvHtml)}" target="_blank" rel="noopener">Open CV.html</a>` : ''}
      ${apply ? `<a class="btn small primary-link" href="${escapeAttr(apply)}" target="_blank" rel="noopener">Apply (opens job)</a>` : ''}
      ${pack.jobId ? `<button type="button" class="btn small" id="copyApplyPack">Copy pack</button>
      <button type="button" class="btn small" id="fillApplyForm">Fill</button>
      <button type="button" class="btn small" id="editPreparedDocument">Edit document</button>` : ''}
    </div>
    <p class="meta" id="companyFolderPaths">
      ${
        pack.downloadFolderAbs
          ? `<strong>Saved under project root:</strong><br/><code>${escapeHtml(
              pack.downloadFolderAbs,
            )}</code>`
          : 'Files are saved automatically after successful preparation.'
      }
    </p>
    ${pack.downloadError ? `<p class="meta error">Download folder error: ${escapeHtml(pack.downloadError)}</p>` : ''}
    <p class="meta">PDFs go to <code>job-scout\\downloads\\&lt;Company&gt;\\</code> (not Windows Downloads). Files: <code>&lt;Your Name&gt; CV.pdf</code> (ATS) + <code>&lt;Your Name&gt; CV Main.pdf</code> (from your master CV). Cover letter: <code>&lt;Your Name&gt; Cover Letter.pdf</code>.</p>
    <p>Cover letter draft:</p>
    <pre>${escapeHtml(pack.coverLetter || '')}</pre>
    <button type="button" class="btn ghost" id="backToLog">View activity</button>
  `;

  async function openCompanyFolder(button) {
    const fromUrl = String(pack.downloadCvPdfMain || pack.downloadCvPdfAts || '')
      .match(/\/api\/prep\/([^/]+)\//)?.[1];
    const id = decodeURIComponent(pack.jobId || fromUrl || state.lastPrepJobId || '');
    const res = await openSavedFolder(button, id, pack.templateId);
    if (!res) return;
    const pathsEl = $('companyFolderPaths');
    if (pathsEl) {
      pathsEl.innerHTML = `<strong>Saved under project root:</strong><br/><code>${escapeHtml(
        res.folder || '',
      )}</code>`;
    }
  }

  $('openCompanyFolder')?.addEventListener('click', event => {
    void openCompanyFolder(event.currentTarget);
  });
  function prepJobRef() {
    const fromUrl = String(pack.downloadCvPdfMain || pack.downloadCvPdfAts || pack.downloadCoverLetter || '')
      .match(/\/api\/prep\/([^/]+)\//)?.[1];
    const id = decodeURIComponent(pack.jobId || fromUrl || state.lastPrepJobId || '');
    return state.jobs?.find((j) => j.id === id)
      || { id, title: pack.title || 'this role', company: pack.company || '', url: pack.applyUrl };
  }
  $('copyApplyPack')?.addEventListener('click', async () => {
    try {
      await copyApplyPack(prepJobRef());
    } catch (err) {
      appendLog(`Copy pack failed: ${err.message}`, 'stderr');
    }
  });
  $('fillApplyForm')?.addEventListener('click', async () => {
    try {
      $('prepResultsDialog').close();
      await fillApply(prepJobRef());
    } catch (err) {
      appendLog(`Fill failed: ${err.message}`, 'stderr');
    }
  });
  $('editPreparedDocument')?.addEventListener('click', () => openDocumentEditor(prepJobRef()));
  $('generateCoverLetter')?.addEventListener('click', async () => {
    const fromUrl = String(pack.downloadCvPdfMain || pack.downloadCvPdfAts || pack.downloadCoverLetter || '')
      .match(/\/api\/prep\/([^/]+)\//)?.[1];
    const id = decodeURIComponent(pack.jobId || fromUrl || state.lastPrepJobId || '');
    const job = state.jobs?.find((j) => j.id === id);
    if (!job && !id) {
      appendLog('Cover letter: missing job id — open a result and click Prep.', 'stderr');
      return;
    }
    await runPrepFlow(
      job || { id, title: 'this role', company: '', url: pack.applyUrl, fit: data.fit },
      { preferCoverLetter: true },
    );
  });
  $('backToLog')?.addEventListener('click', () => {
    showLogView();
  });
}

/* ---------------------------------------------------------------------------
 * Ready to apply — jobs with a tailored CV / letter that are still open.
 * ------------------------------------------------------------------------- */

function setReadyBadge(count) {
  if (!els.readyBadge) return;
  const n = Number(count) || 0;
  els.readyBadge.hidden = n === 0;
  els.readyBadge.textContent = String(n);
}

function refreshReady() { return loadPagedView('ready', els.readyList, loadReady, refreshReady); }
async function loadReady(signal) {
  if (!els.readyList) return;
  const q = (els.readySearch?.value || '').trim();
  const params = new URLSearchParams({ ...listPages.ready, q });
  const data = await api(`/api/ready?${params}`, { signal });
  listPages.ready = data.pagination; listPagers.ready.update(data.pagination);
  const jobs = data.jobs || [];
  els.readyList.innerHTML = '';
  if (!q) setReadyBadge(data.total);
  if (els.readyMeta) {
    const c = data.counts || {};
    els.readyMeta.textContent = jobs.length
      ? `${data.total} ready${q ? ` matching “${q}”` : ''} · ${c.both || 0} with CV + letter · ${c.cvOnly || 0} CV only · ${c.letterOnly || 0} letter only. Mark Applied when done and they drop off this list.`
      : q
        ? `No ready postings match “${q}”.`
        : 'Postings with a tailored CV or cover letter that you have not applied to yet.';
  }
  if (els.readyEmpty) els.readyEmpty.hidden = jobs.length > 0;
  const frag = document.createDocumentFragment();
  for (const job of jobs) frag.appendChild(renderJob(job));
  els.readyList.appendChild(frag);
}

/* ---------------------------------------------------------------------------
 * Batch Prep — Create CVs… for many Digest postings at once.
 * ------------------------------------------------------------------------- */

let batchStream = null;

const BATCH_STATUS_LABEL = {
  pending: 'Queued',
  running: 'Working…',
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function batchPercent(snap) {
  if (!snap?.total) return 0;
  const finished = Number(snap.finished) || 0;
  return Math.min(100, Math.round((finished / snap.total) * 100));
}

function withLiveBatchTiming(snap) {
  if (!snap) return snap;
  const elapsed = liveElapsedMs(snap.startedAt, snap.running ? null : snap.finishedAt);
  const remaining = Math.max(0, (Number(snap.total) || 0) - (Number(snap.finished) || 0));
  const etaMs = snap.running && snap.avgMsPerJob && remaining > 0
    ? snap.avgMsPerJob * remaining
    : null;
  return { ...snap, elapsedMs: elapsed, etaMs };
}

function batchSummaryText(snap) {
  if (!snap) return '';
  const live = withLiveBatchTiming(snap);
  const c = live.counts || {};
  const bits = [`${live.finished || 0} / ${live.total || 0}`];
  if (live.elapsedMs) bits.push(formatDuration(live.elapsedMs));
  if (live.avgMsPerJob != null) bits.push(`${formatDuration(live.avgMsPerJob)}/job`);
  if (live.running && live.etaMs) bits.push(`~${formatDuration(live.etaMs)} left`);
  if (live.running && live.current) {
    bits.push(`${live.current.company || '—'} — ${live.current.title || ''}`);
  } else if (!live.running) {
    const tail = [];
    if (c.done) tail.push(`${c.done} done`);
    if (c.skipped) tail.push(`${c.skipped} skipped`);
    if (c.failed) tail.push(`${c.failed} failed`);
    if (c.cancelled) tail.push(`${c.cancelled} cancelled`);
    if (tail.length) bits.push(tail.join(', '));
  }
  if (live.running && live.stopping) bits.push('stopping…');
  return bits.join(' · ');
}

function renderBatchProgress(snap) {
  if (!els.batchProgress || !snap) return;
  if (els.batchProgressHint) {
    const live = withLiveBatchTiming(snap);
    const timing = [
      live.elapsedMs ? formatDuration(live.elapsedMs) : null,
      live.avgMsPerJob != null ? `${formatDuration(live.avgMsPerJob)}/job` : null,
    ].filter(Boolean).join(' · ');
    els.batchProgressHint.textContent = snap.running
      ? `Running in the background${timing ? ` — ${timing}` : ''}. You can close this and keep browsing. Files are written to each company folder; nothing opens.`
      : `Finished${timing ? ` — ${timing}` : ''}. Prepared postings are listed under Ready to apply.`;
  }
  if (els.batchProgressFill) els.batchProgressFill.style.width = `${batchPercent(snap)}%`;
  if (els.batchProgressLine) els.batchProgressLine.textContent = batchSummaryText(snap);
  if (els.batchProgressList) {
    const window = localPage(snap.items || [], progressPage); progressPage = window; progressPager.update(window);
    els.batchProgressList.innerHTML = window.items
      .map((it) => {
        const time = it.durationMs != null ? formatDuration(it.durationMs) : '';
        const detail = [it.error || it.note || (it.status === 'done' && it.tailorMode ? it.tailorMode : ''), time]
          .filter(Boolean)
          .join(' · ');
        return `<div class="batch-item is-${escapeAttr(it.status)}">
          <span class="batch-item-status">${escapeHtml(BATCH_STATUS_LABEL[it.status] || it.status)}</span>
          <span class="batch-item-body">
            <span class="batch-item-company">${escapeHtml(it.company || '—')}</span>
            <span class="batch-item-title">${escapeHtml(it.title || it.id)}</span>
            ${detail ? `<span class="batch-item-detail">${escapeHtml(detail)}</span>` : ''}
          </span>
        </div>`;
      })
      .join('');
  }
  if (els.batchStop) {
    els.batchStop.hidden = !snap.running;
    els.batchStop.disabled = Boolean(snap.stopping);
    els.batchStop.textContent = snap.stopping ? 'Stopping…' : 'Cancel run';
  }
  if (els.batchGoReady) els.batchGoReady.hidden = Boolean(snap.running) || !(snap.counts?.done > 0);
}

function applyBatchSnapshot(snap) {
  if (!snap) return;
  state.batch = snap;
  if (snap.total) {
    const failed = Boolean(snap.counts?.failed);
    activity.update('batch', {
      startedAt: snap.startedAt, status: snap.running ? 'running' : failed ? 'error' : snap.counts?.cancelled ? 'stopped' : 'success',
      title: snap.running ? 'Preparing documents in batch' : failed ? 'Batch preparation needs attention' : snap.counts?.cancelled ? 'Batch preparation stopped' : 'Batch preparation complete',
      message: [
        `${snap.finished || 0} of ${snap.total} jobs processed`,
        snap.running && snap.current ? `Working on ${snap.current.company || ''} ${snap.current.title || ''}`.trim() : '',
        snap.counts?.failed ? `${snap.counts.failed} failed` : '',
        snap.counts?.skipped ? `${snap.counts.skipped} skipped` : '',
        snap.stopping ? 'Stopping…' : '',
      ].filter(Boolean).join(' · '), stopping: snap.stopping, stop: stopBatch,
      details: () => showBatchModal('progress'),
      actionLabel: failed ? 'Review batch' : 'View prepared jobs',
      action: failed ? () => showBatchModal('progress') : () => setView('ready'),
    });
    for (const item of snap.items || []) {
      if (Date.parse(prepTasks.get(item.id)?.startedAt) > Date.parse(snap.startedAt)) continue;
      prepTasks.set(item.id, {
        startedAt: snap.startedAt,
        status: ['pending', 'running'].includes(item.status) ? 'running' : item.status === 'failed' ? 'error' : item.status === 'cancelled' ? 'stopped' : 'success',
        message: item.error || item.note || BATCH_STATUS_LABEL[item.status] || item.status,
      });
    }
    document.querySelectorAll('[data-prep-job]').forEach((card) => updateJobPrepStatus(card, card.dataset.prepJob));
  }
  ensureBatchClock(snap);
  if (els.batchModal && !els.batchModal.hidden && els.batchProgress && !els.batchProgress.hidden) {
    renderBatchProgress(snap);
  }
}

async function onBatchFinished(snap) {
  applyBatchSnapshot(snap);
  await refreshBatchHistory();
  await refreshStatus();
  await refreshJobs();
  if (state.view === 'digest') await refreshDigest();
  if (state.view === 'ready') await refreshReady();
  if (state.view === 'tracker') await refreshTracker();
}

function connectBatchStream() {
  if (batchStream) return;
  const es = new EventSource('/api/prep/batch/stream');
  batchStream = es;
  const close = () => {
    es.close();
    if (batchStream === es) batchStream = null;
  };
  es.addEventListener('status', (ev) => {
    try {
      applyBatchSnapshot(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  });
  es.addEventListener('progress', (ev) => {
    try {
      applyBatchSnapshot(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  });
  es.addEventListener('log', (ev) => {
    try {
      const entry = JSON.parse(ev.data);
      appendLog(entry.line || '', entry.stream || 'stdout', false);
    } catch {
      /* ignore */
    }
  });
  es.addEventListener('done', (ev) => {
    close();
    try {
      void onBatchFinished(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  });
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) close();
  };
}

async function stopBatch() {
  try {
    const res = await api('/api/prep/batch/stop', { method: 'POST', body: '{}' });
    if (res.batch) applyBatchSnapshot({ ...(state.batch || {}), ...res.batch, items: state.batch?.items || [] });
  } catch (err) {
    appendLog(`Cancel failed: ${err.message}`, 'stderr');
  }
}

function batchSelectedIds() {
  return [...batchSelection];
}

function updateBatchSelectCount() {
  if (!els.batchSelectCount) return;
  const n = batchSelectedIds().length;
  els.batchSelectCount.textContent = `${n} selected`;
  if (els.batchStart) els.batchStart.disabled = n === 0;
  // Keep company checkboxes in sync (checked / indeterminate)
  els.batchSelectList?.querySelectorAll('input[data-company]').forEach((box) => {
    const group = box.closest('.batch-group');
    const jobs = [...(group?.querySelectorAll('input[data-job]') || [])];
    const on = jobs.filter((j) => j.checked).length;
    box.checked = on > 0 && on === jobs.length;
    box.indeterminate = on > 0 && on < jobs.length;
  });
}

function renderBatchSelectList(jobs) {
  if (!els.batchSelectList) return;
  const window = localPage(jobs, batchPage); batchPage = window; batchPager.update(window);
  const groups = new Map();
  for (const job of window.items) {
    const key = (job.company || '—').trim() || '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  els.batchSelectList.innerHTML = sorted
    .map(([company, list]) => `
      <div class="batch-group">
        <label class="batch-group-head">
          <input type="checkbox" data-company="${escapeAttr(company)}" />
          <span>${escapeHtml(company)}</span>
          <span class="meta">${list.length}</span>
        </label>
        ${list
          .map((job) => {
            const has = job.tailoredCv || job.tailoredPdf;
            const letter = job.coverLetter;
            return `<label class="batch-row">
              <input type="checkbox" data-job="${escapeAttr(job.id)}" data-has-cv="${has ? '1' : '0'}" data-fit="${escapeAttr(job.fit?.verdict || '')}" ${batchSelection.has(job.id) ? 'checked' : ''} />
              <span class="batch-row-title">${escapeHtml(job.title)}</span>
              ${job.fit ? `<span class="pill ${FIT_CLASS[job.fit.verdict] || ''}">${escapeHtml(job.fit.verdict)}</span>` : ''}
              ${has ? '<span class="pill ok">CV</span>' : ''}
              ${letter ? '<span class="pill ok">Letter</span>' : ''}
            </label>`;
          })
          .join('')}
      </div>`)
    .join('');
  els.batchSelectList.querySelectorAll('input[data-company]').forEach((box) => {
    box.addEventListener('change', () => {
      box.closest('.batch-group')?.querySelectorAll('input[data-job]').forEach((j) => {
        j.checked = box.checked;
        if (j.checked) batchSelection.add(j.dataset.job); else batchSelection.delete(j.dataset.job);
      });
      updateBatchSelectCount();
    });
  });
  els.batchSelectList.querySelectorAll('input[data-job]').forEach((j) => {
    j.addEventListener('change', () => { if (j.checked) batchSelection.add(j.dataset.job); else batchSelection.delete(j.dataset.job); updateBatchSelectCount(); });
  });
  updateBatchSelectCount();
}

function setBatchChecked(predicate) {
  batchSelection = new Set(batchJobs.filter(job => predicate({ dataset: { hasCv: job.tailoredCv || job.tailoredPdf ? '1' : '0', fit: job.fit?.verdict || '' } })).map(job => job.id));
  renderBatchSelectList(batchJobs);
}

function showBatchModal(view) {
  if (!els.batchModal) return;
  els.batchModal.hidden = false;
  if (els.batchSetup) els.batchSetup.hidden = view !== 'setup';
  if (els.batchProgress) els.batchProgress.hidden = view !== 'progress';
  if (els.batchModalTitle) {
    els.batchModalTitle.textContent = view === 'setup' ? 'Create CVs for new postings' : 'Batch Prep';
  }
  if (view === 'progress' && state.batch) renderBatchProgress(state.batch);
  void refreshBatchHistory();
}

async function refreshBatchHistory() {
  if (!els.batchHistoryBox) return;
  try {
    const data = await api('/api/run-history');
    const rows = data.batch || [];
    els.batchHistoryBox.hidden = rows.length === 0;
    renderHistoryList(els.batchHistoryList, rows, batchHistoryLine);
  } catch {
    if (!els.batchHistoryList?.children.length) els.batchHistoryBox.hidden = true;
  }
}

function hideBatchModal() {
  if (els.batchModal) els.batchModal.hidden = true;
}

async function openBatchSetup() {
  let jobs;
  try { const data = await api(`/api/digest?${queryString()}&selection=1`); jobs = data.candidates || []; }
  catch (err) { listFeedback(els.digestList, `Could not load batch selection: ${err.message}. `, openBatchSetup); return; }
  if (els.batchError) {
    els.batchError.hidden = true;
    els.batchError.textContent = '';
  }
  if (state.batch?.running) {
    showBatchModal('progress');
    return;
  }
  if (!jobs.length) {
    appendLog('Create CVs: no new postings in Digest to prepare.', 'stderr');
    return;
  }
  if (els.batchSetupHint) {
    const setup = await api('/api/goose');
    const keyOk = Boolean(setup.status?.ok);
    renderCvTemplates(setup.templates || [], document.getElementById('batchTemplateChoices'));
    els.batchSetupHint.textContent = `${jobs.length} new posting(s) in Digest. Files go to the company folders; nothing opens. Finished jobs show up under Ready to apply.${
      keyOk ? '' : ' Configure Goose before starting a batch.'
    }`;
  }
  batchJobs = jobs; batchSelection = new Set(jobs.map(job => job.id)); batchPage.page = 1;
  renderBatchSelectList(jobs);
  if (els.batchInstructions) els.batchInstructions.value = '';
  if (els.batchSkipExisting) els.batchSkipExisting.checked = true;
  showBatchModal('setup');
}

async function startBatch() {
  const ids = batchSelectedIds();
  if (!ids.length) return;
  const mode = 'agent';
  const includeCoverLetter = Boolean(els.batchIncludeLetter?.checked);
  const skipExisting = Boolean(els.batchSkipExisting?.checked);
  const extraInstructions = (els.batchInstructions?.value || '').trim().slice(0, 500);
  const templateIds = selectedCvTemplates(document.getElementById('batchTemplateChoices'));
  if (els.batchStart) els.batchStart.disabled = true;
  if (els.batchError) els.batchError.hidden = true;
  try {
    const res = await api('/api/prep/batch', {
      method: 'POST',
      body: JSON.stringify({ ids, mode, includeCoverLetter, skipExisting, extraInstructions, templateIds }),
    });
    applyBatchSnapshot(res.batch);
    showBatchModal('progress');
    appendLog(`Batch Prep started: ${ids.length} job(s), ${mode}${includeCoverLetter ? ' + cover letter' : ''}.`);
    connectBatchStream();
  } catch (err) {
    if (els.batchError) {
      els.batchError.hidden = false;
      els.batchError.textContent = err.message;
    }
  } finally {
    if (els.batchStart) els.batchStart.disabled = false;
  }
}

els.batchOpenBtn?.addEventListener('click', openBatchSetup);
els.batchCancelSetup?.addEventListener('click', hideBatchModal);
els.batchClose?.addEventListener('click', hideBatchModal);
els.batchStart?.addEventListener('click', startBatch);
els.batchStop?.addEventListener('click', stopBatch);
els.batchGoReady?.addEventListener('click', () => {
  hideBatchModal();
  setView('ready');
});
els.batchSelectAll?.addEventListener('click', () => setBatchChecked(() => true));
els.batchSelectNone?.addEventListener('click', () => setBatchChecked(() => false));
els.batchSelectMissing?.addEventListener('click', () => setBatchChecked((j) => j.dataset.hasCv !== '1'));
els.batchSelectStrong?.addEventListener('click', () => setBatchChecked((j) => j.dataset.fit === 'Strong'));
els.batchSelectWorth?.addEventListener('click', () => setBatchChecked((j) => j.dataset.fit === 'Worth a shot'));
els.batchModal?.addEventListener('click', (ev) => {
  if (ev.target === els.batchModal) hideBatchModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && els.batchModal && !els.batchModal.hidden) hideBatchModal();
});
els.readySearch?.addEventListener('input', () => {
  listPages.ready.page = 1;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => refreshReady(), 200);
});

async function refreshJobs() {
  jobsAbort?.abort();
  jobsAbort = new AbortController();
  const { signal } = jobsAbort;
  listFeedback(els.jobList, 'Loading…');
  els.jobList.setAttribute('aria-busy', 'true');
  try {
    const data = await api(`/api/jobs?${queryString()}`, { signal });
    if (signal.aborted) return;
    state.pagination = data.pagination;
    state.page = data.pagination.page;
    resultsPager.update(data.pagination);
    listFeedback(els.jobList, '');
    state.jobs = data.jobs || [];
    updateResultsEmptyState(data);
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
      `${data.pagination.total} matching jobs`,
      data.meta?.marketName || '—',
      when,
    ];
    if (typeof newN === 'number') parts.push(`${newN} new last run`);
    if (data.meta?.durationMs != null) {
      parts.push(formatDuration(data.meta.durationMs));
      if (data.meta.avgMsPerQuery != null) parts.push(`${formatDuration(data.meta.avgMsPerQuery)}/query`);
    }
    if (dup) parts.push(`${dup} dupes collapsed`);
    if (data.meta?.replaced) parts.push('replaced');
    els.jobsMeta.textContent = parts.join(' · ');

    if ($('boardDetails')) $('boardDetails').hidden = !data.meta?.sourceStatus?.length;
    if ($('boardSummary') && data.meta?.sourceStatus?.length) {
      const sources = data.meta.sourceStatus;
      const failed = sources.filter((source) => !source.ok).length;
      $('boardSummary').textContent = `${sources.length - failed} sources returned results${failed ? ` · ${failed} need attention` : ''}`;
    }
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
    listFeedback(els.jobList, `Could not load jobs: ${err.message}. `, refreshJobs);
  } finally { if (!signal.aborted) els.jobList.removeAttribute('aria-busy'); }
}

function updatePlanHint(s = state.status) {
  if (!els.planHint || !s) return;
  const limit = Number(els.limitPerQuery?.value || s.limitPerQuery || 0);
  const parallel = Number(els.fetchConcurrency?.value || s.fetchConcurrency || 4);
  const perBoard = (s.titleCount || 0) * (s.cityCount || 0);
  const boards = s.boardCount || 0;
  const maxJobs = perBoard * limit;
  els.planHint.hidden = !(perBoard && boards);
  els.planHint.textContent = perBoard && boards
    ? `Plan: ${s.titleCount} titles × ${s.cityCount} cities = ${perBoard} queries/portal × ${boards} portals · ${parallel} portals at a time · up to ${maxJobs} jobs/portal (before filters)`
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

async function refreshStatus() {
  state.status = await api('/api/status?light=1');
  const s = state.status;
  els.candidateLine.textContent = [s.candidate, s.targetRole].filter(Boolean).join(' · ') || 'Local shortlist';
  if (s.marketId) els.marketSelect.value = s.marketId;
  if (els.limitPerQuery && document.activeElement !== els.limitPerQuery) {
    els.limitPerQuery.value = String(s.limitPerQuery ?? 10);
  }
  if (els.fetchConcurrency && document.activeElement !== els.fetchConcurrency) {
    els.fetchConcurrency.value = String(s.fetchConcurrency ?? 4);
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
  updatePlanHint(s);
  updateSheetsUi(s.sheets);
  showSetup(Boolean(s.setup?.needsSetup) && !s.setup?.profileParseError);

  const alerts = [];
  if (s.setup?.profileParseError) {
    alerts.push(`state/memory.json is invalid JSON (${s.setup.profileParseError}). Fix the file — your data is still there.`);
  }
  if (s.digestNewCount > 0) {
    // The New matches badge already communicates this without a duplicate alert.
    els.digestBadge.hidden = false;
    els.digestBadge.textContent = String(s.digestNewCount);
  } else {
    els.digestBadge.hidden = true;
  }
  if (s.readyCount != null) setReadyBadge(s.readyCount);
  if (s.batch) {
    // Items come over the stream; keep the ones we already have.
    applyBatchSnapshot({ ...s.batch, items: state.batch?.startedAt === s.batch.startedAt ? state.batch.items || [] : [] });
    if (s.batch.running) connectBatchStream();
  }
  for (const run of s.prepRuns || []) {
    if (!prepWatchers.has(run.runId)) {
      const job = state.jobs?.find(item => item.id === run.jobId) || { id: run.jobId, title: 'Current job' };
      void watchPrep(job, run.startedAt, run.runId);
    }
  }
  els.alerts.innerHTML = alerts.map((a) => `<div class="alert">${escapeHtml(a)}</div>`).join('');

  if (s.fetchRunning) {
    setFetchUi(true, s.fetchStartedAt);
  } else {
    setFetchUi(false);
  }
}

async function refreshMarkets() {
  const { markets } = await api('/api/markets');
  const options = markets
    .map((m) => `<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)} (${escapeHtml(m.id)})</option>`)
    .join('');
  els.marketSelect.innerHTML = options;
  if (state.status?.marketId) els.marketSelect.value = state.status.marketId;
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

function filteredTrackerItems() {
  return filterTracker(state.trackerItems, {
    query: els.trackerSearch?.value || '', statuses: state.trackerVisibleColumns,
    dueOnly: state.trackerDueOnly, sort: state.trackerSort,
  });
}

function showTrackerFeedback(message, isError = false) {
  const el = $('trackerFeedback');
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
}

function selectTrackerPreset(preset) {
  state.trackerDueOnly = preset === 'due';
  state.trackerVisibleColumns = new Set(preset === 'all' ? DECISIONS : ['interviewing', 'offer', 'accepted'].includes(preset) ? [preset] : ACTIVE_STATUSES);
  els.trackerSearch.value = '';
  onTrackerStatusChange();
}

function renderTrackerSummary() {
  const summary = trackerSummary(state.trackerItems);
  const cards = [
    ['all', summary.total, 'Saved jobs', 'Every stage, including closed'],
    ['active', summary.active, 'In progress', 'Your active applications'],
    ['interviewing', summary.interviewing, 'Interviewing', 'Keep the conversation moving'],
    ['offer', state.trackerCounts.offer || 0, 'Offers', 'Review your opportunities'],
    ['accepted', state.trackerCounts.accepted || 0, 'Accepted', 'Your next chapter'],
    ['due', summary.due, 'Follow-ups due', 'Scheduled for today or earlier'],
  ];
  const matchesPreset = (preset) => {
    const ids = preset === 'all' ? DECISIONS : ['interviewing', 'offer', 'accepted'].includes(preset) ? [preset] : ACTIVE_STATUSES;
    return (preset === 'due') === state.trackerDueOnly && ids.length === state.trackerVisibleColumns.size && ids.every((id) => state.trackerVisibleColumns.has(id));
  };
  $('trackerSummary').innerHTML = cards.map(([id, count, label, hint]) => `<button type="button" class="summary-card${id === 'due' && count ? ' needs-attention' : ''}" data-summary="${id}" aria-pressed="${matchesPreset(id)}"><span>${label}</span><strong>${count}</strong><small>${hint}</small></button>`).join('');
  $('trackerSummary').querySelectorAll('[data-summary]').forEach((button) => button.addEventListener('click', () => selectTrackerPreset(button.dataset.summary)));
  document.querySelectorAll('[data-tracker-preset]').forEach((button) => button.setAttribute('aria-pressed', String(matchesPreset(button.dataset.trackerPreset))));
}

function renderTrackerTabs() {
  if (!els.trackerTabs) return;
  const counts = state.trackerCounts || {};
  const pipeline = new Set(TRACKER_DEFAULT_VISIBLE);
  const order = [
    ...TRACKER_DEFAULT_VISIBLE,
    ...DECISIONS.filter((id) => !pipeline.has(id)),
  ];
  els.trackerTabs.innerHTML = order.map((id, i) => {
    const opt = TRACKER_STATUS_OPTIONS.find((o) => o.id === id) || { id, label: DECISION_LABELS[id] || id };
    const on = state.trackerVisibleColumns.has(opt.id);
    const count = counts[opt.id] ?? 0;
    const split = i === TRACKER_DEFAULT_VISIBLE.length
      ? '<span class="tracker-tabs-split" aria-hidden="true"></span>'
      : '';
    return `${split}<button type="button" class="tracker-tab${on ? ' is-on' : ''}${pipeline.has(opt.id) ? '' : ' is-done'}" data-status="${escapeAttr(opt.id)}" aria-pressed="${on}">
      ${escapeHtml(opt.label)}
      <span>${count}</span>
    </button>`;
  }).join('');
  els.trackerTabs.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.status;
      state.trackerDueOnly = false;
      state.trackerVisibleColumns = new Set([id]);
      onTrackerStatusChange();
    });
  });
}

function renderTracker() {
  if (!els.trackerList) return;
  renderTrackerSummary();
  renderTrackerTabs();
  const items = filteredTrackerItems();
  const visibleCount = (state.trackerItems || []).filter((item) =>
    state.trackerVisibleColumns.has(item.decision),
  ).length;
  const q = (els.trackerSearch?.value || '').trim();
  const newestFirst = state.trackerSort !== 'oldest';
  const sortLabel = state.trackerDueOnly ? 'earliest follow-up first' : newestFirst ? 'newest first' : 'oldest first';
  els.trackerSort.disabled = state.trackerDueOnly;
  const pageSize = state.trackerPageSize || 20;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  if (state.trackerPage > pages) state.trackerPage = pages;
  if (state.trackerPage < 1) state.trackerPage = 1;
  const start = (state.trackerPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  if (els.trackerMeta) {
    if (!visibleCount) {
      els.trackerMeta.textContent = 'Applications you mark from Results land here.';
    } else if (!items.length) {
      els.trackerMeta.textContent = q
        ? `0 of ${visibleCount} match “${q}” · ${sortLabel}`
        : `${visibleCount} in view · ${sortLabel}.`;
    } else {
      const from = start + 1;
      const to = start + pageItems.length;
      const range = `${from}–${to} of ${items.length}`;
      els.trackerMeta.textContent = q
        ? `${range} match “${q}” · ${sortLabel}`
        : `${range} · ${sortLabel}.`;
    }
  }

  if (els.trackerPager) {
    els.trackerPager.hidden = items.length === 0;
    if (els.trackerPageLabel) {
      els.trackerPageLabel.textContent = `Page ${state.trackerPage} of ${pages}`;
    }
    if (els.trackerPrevPage) els.trackerPrevPage.disabled = state.trackerPage <= 1;
    if (els.trackerNextPage) els.trackerNextPage.disabled = state.trackerPage >= pages;
  }

  if (!items.length) {
    const emptyTitle = q ? 'No matching applications' : state.trackerDueOnly ? 'You’re all caught up' : 'No applications in this view';
    const emptyBody = state.trackerDueOnly
      ? 'No follow-ups match this view. Add a follow-up date from any active application’s Notes & follow-up.'
      : q ? 'Try another search or reset the view to see all saved applications.'
      : 'Save a job from Find jobs, or choose All statuses to see previous applications.';
    els.trackerList.innerHTML = `<div class="empty tracker-empty"><h3>${escapeHtml(emptyTitle)}</h3><p>${escapeHtml(emptyBody)}</p><button type="button" class="btn" data-empty-all>Show all applications</button> <button type="button" class="btn primary" data-empty-find>Find jobs</button></div>`;
    els.trackerList.querySelector('[data-empty-all]').addEventListener('click', () => selectTrackerPreset('all'));
    els.trackerList.querySelector('[data-empty-find]').addEventListener('click', () => setView('results'));
    return;
  }

  const head = `<div class="tracker-row tracker-head">
    <span>Applications</span>
    <button type="button" class="tracker-sort" data-tracker-sort aria-pressed="${newestFirst ? 'true' : 'false'}" aria-label="Sort by date, ${newestFirst ? 'newest first' : 'oldest first'}">
      ${state.trackerDueOnly ? 'Follow-up ↑' : `Updated ${newestFirst ? '↓' : '↑'}`}
    </button>
  </div>`;
  els.trackerList.innerHTML = head;
  els.trackerList.querySelector('[data-tracker-sort]').disabled = state.trackerDueOnly;
  els.trackerList.querySelector('[data-tracker-sort]')?.addEventListener('click', () => {
    saveTrackerSort(newestFirst ? 'oldest' : 'newest');
    if (els.trackerSort) els.trackerSort.value = state.trackerSort;
    state.trackerPage = 1;
    renderTracker();
  });
  const frag = document.createDocumentFragment();
  for (const item of pageItems) {
    const title = item.title || item.id;
    const boardLabel = item.board === 'manual' ? 'Added manually' : formatBoard(item.board);
    const when = formatTrackerWhen(item);
    const row = document.createElement('article');
    row.className = `tracker-row is-${item.decision}`;
    row.dataset.jobId = item.id;
    const due = followUpState(item);
    const dueLabel = due === 'overdue' ? `Overdue · ${item.followUpDate}` : due === 'today' ? 'Follow up today' : due === 'upcoming' ? `Follow up · ${item.followUpDate}` : '';
    const statusOpts = DECISIONS.map(
      (d) =>
        `<option value="${escapeAttr(d)}"${item.decision === d ? ' selected' : ''}>${escapeHtml(
          DECISION_LABELS[d] || d,
        )}</option>`,
    ).join('');
    row.innerHTML = `
      <div class="tracker-identity">
      <div class="tracker-company">${escapeHtml(item.company || '—')}</div>
      <div class="tracker-role">
        ${
          item.url
            ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
            : `<span>${escapeHtml(title)}</span>`
        }
      </div>
      </div>
      <div class="tracker-metadata">
      <div class="tracker-date" title="${escapeAttr(item.updatedAt || item.date || '')}">
        <span>Updated ${escapeHtml(when.date)}</span>
        <small class="application-date">Applied: ${validDateKey(item.appliedDate) ? escapeHtml(item.appliedDate) : 'not recorded'}</small>
        ${dueLabel ? `<span class="follow-up-badge ${due}">${escapeHtml(dueLabel)}</span>` : ''}
      </div>
      <div class="tracker-board">${escapeHtml(boardLabel || '—')}${
        item.ats?.label
        && item.ats.id !== 'unknown'
        && item.ats.label.toLowerCase() !== boardLabel.toLowerCase()
          ? ` · ${escapeHtml(item.ats.label)}`
          : ''
      }</div>
      </div>
      <div class="tracker-controls">
      <label class="tracker-status">
        <span class="visually-hidden">Status</span>
        <select data-status>${statusOpts}</select>
      </label>
      <div class="tracker-actions">
        <button type="button" class="btn small primary" data-edit-application>Details${item.attachments?.length ? ` · ${item.attachments.length} ${item.attachments.length === 1 ? 'file' : 'files'}` : ''}</button>
        ${
          item.url
            ? `${item.decision === 'shortlisted' ? `<button type="button" class="btn small" data-copy-pack>Copy pack</button><button type="button" class="btn small" data-fill>${/linkedin\.com/i.test(item.url || '') ? 'Fill / submit Easy Apply' : 'Fill form'}</button>` : ''}
               <a class="btn small" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Open</a>`
            : ''
        }
        ${
          item.prepPath
            ? `<a class="btn small" href="/api/prep/${encodeURIComponent(item.id)}/cv.html" target="_blank" rel="noopener">Prepared CV</a>`
            : ''
        }
      </div>
      </div>
    `;
    row.querySelector('[data-edit-application]').addEventListener('click', () => editApplication(item));
    const details = document.createElement('details');
    details.className = 'tracker-notes';
    details.innerHTML = `<summary>${item.note || item.followUpDate ? 'Edit notes & follow-up' : 'Add notes & follow-up'}</summary>
      ${item.note ? `<p class="note-preview">${escapeHtml(item.note)}</p>` : ''}
      <form class="tracker-note-form">
        <label>Notes<textarea name="note" rows="3" maxlength="10000" placeholder="Contact, interview details, or your next step…">${escapeHtml(item.note || '')}</textarea></label>
        <label>Follow-up date<input type="date" name="followUpDate" value="${escapeAttr(validDateKey(item.followUpDate) ? item.followUpDate : '')}" /></label>
        <div class="note-form-actions"><button type="submit" class="btn primary small">Save notes</button><button type="button" class="btn ghost small" data-clear-date>Clear date</button><span class="meta">Reminders appear in Follow-ups due.</span></div>
        <p class="note-feedback" role="status" hidden></p>
      </form>`;
    row.appendChild(details);
    const noteForm = details.querySelector('form');
    details.querySelector('[data-clear-date]').addEventListener('click', () => { noteForm.elements.followUpDate.value = ''; });
    noteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = noteForm.querySelector('[type="submit"]');
      const feedback = details.querySelector('.note-feedback');
      const followUpDate = noteForm.elements.followUpDate.value;
      if (followUpDate && !validDateKey(followUpDate)) { feedback.hidden = false; feedback.textContent = 'Enter a valid follow-up date.'; return; }
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        await api('/api/decisions', { method: 'PATCH', body: JSON.stringify({ id: item.id, note: noteForm.elements.note.value.trim(), followUpDate: followUpDate || null }) });
        await refreshTracker();
        showTrackerFeedback(`Saved notes for ${item.company || title}.`);
        [...els.trackerList.querySelectorAll('article')].find((entry) => entry.dataset.jobId === item.id)?.querySelector('summary')?.focus();
      } catch (err) {
        feedback.hidden = false;
        feedback.textContent = `Could not save: ${err.message}. Your edits are still here.`;
      } finally { button.disabled = false; button.textContent = 'Save notes'; }
    });
    row.querySelector('[data-copy-pack]')?.addEventListener('click', async () => {
      try {
        await copyApplyPack(item);
      } catch (err) {
        appendLog(`Copy pack failed: ${err.message}`, 'stderr');
      }
    });
    row.querySelector('[data-fill]')?.addEventListener('click', async () => {
      try {
        await fillApply(item);
      } catch (err) {
        appendLog(`Fill failed: ${err.message}`, 'stderr');
      }
    });
    row.querySelector('[data-status]')?.addEventListener('change', async (ev) => {
      const next = ev.target.value;
      if (next === item.decision) return;
      try {
        const res = await submitDecision(item.id, next, item);
        logSheetsResult(res.sheets, `Sheets (${next})`);
        appendLog(`${title} → ${next}`);
        await refreshTracker();
      } catch (err) {
        ev.target.value = item.decision;
        appendLog(err.message, 'stderr');
        showTrackerFeedback(`Could not update ${title}: ${err.message}`, true);
      }
    });
    frag.appendChild(row);
  }
  els.trackerList.appendChild(frag);
}

function refreshTracker() { return loadPagedView('tracker', els.trackerList, loadTracker, refreshTracker); }
async function loadTracker(signal) {
  updateSheetsUi(state.status?.sheets);
  const data = await api('/api/tracker', { signal });
  state.trackerItems = data.items || [];
  state.trackerCounts = data.counts || {};
  renderTracker();
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
  if (['applied', 'interviewing', 'offer', 'accepted'].includes(key)) return false;
  const hide = hiddenFromVisible(
    DECISION_FILTER_OPTIONS.map((o) => o.id),
    state.visibleDecisions,
  );
  return !hide.includes(key);
}

function digestLangVisible(job) {
  const lang = els.langFilter?.value || 'all';
  if (lang === 'all') return true;
  return job?.language === lang;
}

function refreshDigest() { return loadPagedView('digest', els.digestList, loadDigest, refreshDigest); }
async function loadDigest(signal) {
  const params = new URLSearchParams(queryString());
  params.set('page', listPages.digest.page); params.set('pageSize', listPages.digest.pageSize);
  const data = await api(`/api/digest?${params}`, { signal });
  listPages.digest = data.pagination; listPagers.digest.update(data.pagination);
  const jobs = data.newJobs || [];
  state.digestJobs = jobs;
  if (els.batchOpenBtn) els.batchOpenBtn.disabled = !jobs.length && !state.batch?.running;
  els.digestMeta.textContent = data.digest?.generatedAt
    ? `${data.count} new to review (${data.digest.previousFetchAt ? new Date(data.digest.previousFetchAt).toLocaleString() : 'first run'})`
    : 'Run a search to build a digest.';
  if (els.digestTiming) {
    const d = data.digest || {};
    const bits = [];
    if (d.durationMs != null) bits.push(`Last search ${formatDuration(d.durationMs)}`);
    if (d.avgMsPerQuery != null) bits.push(`${formatDuration(d.avgMsPerQuery)}/query`);
    if (d.queriesRun != null) bits.push(`${d.queriesRun} quer${d.queriesRun === 1 ? 'y' : 'ies'}`);
    els.digestTiming.hidden = bits.length === 0;
    els.digestTiming.textContent = bits.join(' · ');
  }
  if (els.digestHistoryBox) {
    const rows = data.history || data.digest?.recentFetches || [];
    els.digestHistoryBox.hidden = rows.length === 0 && !data.digest?.durationMs;
    renderHistoryList(els.digestHistoryList, rows, fetchHistoryLine);
  }
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
          <span class="portal-title">${escapeHtml(b.label)}${b.flaky ? ' <span class="portal-flag">flaky</span>' : ''}</span>
          <span class="portal-meta">${escapeHtml(path)} · ${escapeHtml(b.regions || '')}</span>
          <span class="portal-note">${escapeHtml(skipReason || b.note || '')}</span>
        </span>
      </label>`;
    })
    .join('');
}

const memoryEditor = createMemoryEditor({ api, onSaved: async () => { await refreshStatus(); await refreshJobs(); } });

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  });
  $('searchToolbar').hidden = !['results', 'digest'].includes(view);
  els.runBtn.textContent = ['results', 'digest'].includes(view) ? 'Run search' : 'Find new jobs';
  history.replaceState(null, '', `#${view}`);
  els.viewResults.hidden = view !== 'results';
  els.viewTracker.hidden = view !== 'tracker';
  els.viewAnswers.hidden = view !== 'answers';
  $('viewMemory').hidden = view !== 'memory';
  els.viewPortals.hidden = view !== 'portals';
  els.viewDigest.hidden = view !== 'digest';
  if (els.viewReady) els.viewReady.hidden = view !== 'ready';
  if (view === 'results') refreshJobs();
  if (view === 'tracker') refreshTracker().catch((err) => { appendLog(err.message, 'stderr'); showTrackerFeedback(err.message, true); });
  if (view === 'answers') refreshAnswers().catch((err) => { appendLog(err.message, 'stderr');  });
  if (view === 'memory') memoryEditor.refresh();
  if (view === 'portals') refreshPortals().catch((err) => { appendLog(err.message, 'stderr');  });
  if (view === 'digest') refreshDigest().catch((err) => { appendLog(err.message, 'stderr');  });
  if (view === 'ready') refreshReady().catch((err) => { appendLog(err.message, 'stderr');  });
}

async function runSearch() {
  if (els.runBtn.disabled) return;
  const market = els.marketSelect.value;
  const allowPaid = els.allowPaid.checked;
  const replace = Boolean(els.replaceResults?.checked);
  const limit = Number(els.limitPerQuery?.value || 0);
  const fetchConcurrency = Number(els.fetchConcurrency?.value || 0);
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
    setFetchUi(true, new Date().toISOString());
    activity.update('search', { title: 'Starting search', message: 'Saving search options…', stop: null });
    if (market && state.status?.marketId !== market) {
      await api('/api/market', { method: 'PATCH', body: JSON.stringify({ market }) });
    }
    try {
      await saveSettings({
        ...(limit > 0 ? { limitPerQuery: limit } : {}),
        ...(fetchConcurrency > 0 ? { fetchConcurrency } : {}),
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
        fetchConcurrency > 0 ? `parallel=${fetchConcurrency}` : null,
        Number.isFinite(maxApifyRuns) ? `max-paid=${maxApifyRuns}` : null,
        maxAgeDays > 0 ? `max-age=${maxAgeDays}d` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
    state.page = 1;
    const started = await api('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({
        market,
        allowPaid,
        replace,
        ...(limit > 0 ? { limit } : {}),
        ...(fetchConcurrency > 0 ? { fetchConcurrency } : {}),
        ...(Number.isFinite(maxApifyRuns) ? { maxApifyRuns } : {}),
        ...(maxAgeDays > 0 ? { maxAgeDays } : {}),
      }),
    });
    if (activity.get('search')?.status === 'running') setFetchUi(true, started.startedAt);
  } catch (err) {
    appendLog(err.message, 'stderr', false);
    activity.update('search', { status: 'error', title: 'Search could not start', message: err.message, actionLabel: 'Try search again', action: runSearch });
    setFetchUi(false);
  }
}

async function stopSearch() {
  const search = activity.get('search');
  if (search?.status !== 'running' || search.stopping || !search.stop) return;
  appendLog('Stopping search…');
  activity.update('search', { stopping: true, message: 'Stop requested. Saving jobs already found…' });
  try {
    await api('/api/fetch/stop', { method: 'POST', body: '{}' });
  } catch (err) {
    appendLog(err.message, 'stderr', false);
    activity.update('search', { stopping: false, message: `Could not stop: ${err.message}` });
  }
}

async function refreshAll() {
  const refresh = { results: refreshJobs, tracker: refreshTracker, portals: refreshPortals, digest: refreshDigest, ready: refreshReady, answers: refreshAnswers, memory: memoryEditor.refresh }[state.view];
  const results = await Promise.allSettled([refreshStatus(), refresh?.()]);
  for (const result of results) if (result.status === 'rejected') appendLog(result.reason.message, 'stderr');
}

els.runBtn.addEventListener('click', () => {
  if (!['results', 'digest'].includes(state.view)) { setView('results'); return; }
  runSearch();
});
els.emptyRunBtn.addEventListener('click', runSearch);
els.searchInput.addEventListener('input', () => {
  state.page = 1;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => refreshJobs(), 200);
});
els.trackerSearch?.addEventListener('input', () => {
  state.trackerPage = 1;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => renderTracker(), 150);
});
els.trackerSort?.addEventListener('change', () => {
  saveTrackerSort(els.trackerSort.value);
  state.trackerPage = 1;
  renderTracker();
});
els.trackerPageSize?.addEventListener('change', () => {
  saveTrackerPageSize(els.trackerPageSize.value);
  state.trackerPage = 1;
  renderTracker();
});
els.trackerPrevPage?.addEventListener('click', () => {
  if (state.trackerPage > 1) {
    state.trackerPage -= 1;
    renderTracker();
  }
});
els.trackerNextPage?.addEventListener('click', () => {
  state.trackerPage += 1;
  renderTracker();
});
els.fitFilter.addEventListener('change', () => {
  state.page = 1;
  refreshJobs();
});
els.langFilter?.addEventListener('change', () => {
  saveLang(els.langFilter.value);
  state.page = 1;
  refreshJobs();
  if (state.view === 'digest') { listPages.digest.page = 1; refreshDigest(); }
});
els.sortSelect?.addEventListener('change', () => {
  saveSort(els.sortSelect.value);
  state.page = 1;
  refreshJobs();
});
els.resultScope?.addEventListener('change', () => { state.page = 1; refreshJobs(); });
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
    logSheetsPull(res.pull);
    if (res.pull?.pulled > 0) await refreshJobs();
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
    const { memory } = await api('/api/memory');
    const sections = { facts: memory.facts, preferences: memory.preferences, answers: memory.answers };
    for (const [key, value] of Object.entries(answers)) {
      if (['phone', 'linkedin', 'github', 'portfolio'].includes(key)) { sections.facts.links ||= {}; sections.facts.links[key] = value; }
      else sections.answers[key] = value;
    }
    const preview = await api('/api/memory/preview', { method: 'POST', body: JSON.stringify(sections) });
    const dialog = document.createElement('dialog');
    const heading = document.createElement('h2'); heading.textContent = 'Confirm saved-answer changes';
    const content = document.createElement('pre'); content.textContent = JSON.stringify({ before: preview.before, after: preview.after }, null, 2);
    const confirm = document.createElement('button'); confirm.textContent = 'Confirm and save';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
    confirm.onclick = async () => { try { await api('/api/memory', { method: 'PUT', body: JSON.stringify({ ...sections, confirmation: preview.confirmation }) }); dialog.remove(); appendLog('Saved answers updated'); } catch (error) { appendLog(error.message, 'stderr'); } };
    cancel.onclick = () => dialog.remove(); dialog.append(heading, content, confirm, cancel); document.body.append(dialog); dialog.showModal();
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});
els.copyAnswersBtn?.addEventListener('click', async () => {
  try {
    const res = await api('/api/apply-assist/answers');
    const ok = await copyText(res.text);
    appendLog(ok ? 'Copied profile + saved answers pack.' : 'Clipboard blocked.', ok ? 'stdout' : 'stderr');
  } catch (err) {
    appendLog(`Copy pack failed: ${err.message}`, 'stderr');
  }
});
els.applyAssistClose?.addEventListener('click', () => hideApplyAssistModal());
els.applyAssistModal?.addEventListener('click', (ev) => {
  if (ev.target === els.applyAssistModal) hideApplyAssistModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && els.applyAssistModal && !els.applyAssistModal.hidden) hideApplyAssistModal();
  if (ev.key === 'Escape' && els.recruiterModal && !els.recruiterModal.hidden) hideRecruiterModal();
});
els.recruiterClose?.addEventListener('click', () => hideRecruiterModal());
els.recruiterModal?.addEventListener('click', (ev) => {
  if (ev.target === els.recruiterModal) hideRecruiterModal();
});
els.recruiterSave?.addEventListener('click', async () => {
  try {
    await saveRecruiterEdits();
  } catch (err) {
    appendLog(`Recruiter save failed: ${err.message}`, 'stderr');
    if (els.recruiterStatus) els.recruiterStatus.textContent = err.message;
  }
});
els.recruiterLookup?.addEventListener('click', async () => {
  try {
    recruiterLookedUp = true;
    await startRecruiterLookup('lookup');
  } catch (err) {
    appendLog(`Recruiter lookup failed: ${err.message}`, 'stderr');
    if (els.recruiterStatus) els.recruiterStatus.textContent = err.message;
    paintRecruiterRun({ running: false, error: err.message });
  }
});
els.recruiterAgent?.addEventListener('click', async () => {
  try {
    await startRecruiterLookup('agent');
  } catch (err) {
    appendLog(`Recruiter agent failed: ${err.message}`, 'stderr');
    if (els.recruiterStatus) els.recruiterStatus.textContent = err.message;
    paintRecruiterRun({ running: false, error: err.message });
  }
});
els.recruiterStop?.addEventListener('click', async () => {
  try {
    await recruiterApi('/api/recruiter-contact/stop', { method: 'POST', body: '{}' });
    if (els.recruiterStatus) els.recruiterStatus.textContent = 'Stopping…';
  } catch (err) {
    appendLog(err.message, 'stderr');
  }
});
els.applyAssistCopy?.addEventListener('click', async () => {
  const text = applyAssistContext.text || els.applyAssistPack?.textContent || '';
  const ok = await copyText(text);
  appendLog(ok ? 'Copied apply pack.' : 'Clipboard blocked.', ok ? 'stdout' : 'stderr');
});
els.applyAssistOpen?.addEventListener('click', () => {
  const url = els.applyAssistOpen?.dataset.url || applyAssistContext.job?.url;
  if (url) window.open(url, '_blank', 'noopener');
});
els.applyAssistOpenFolder?.addEventListener('click', event => {
  void openSavedFolder(event.currentTarget, applyAssistContext.job?.id);
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
els.fetchConcurrency?.addEventListener('change', () => onLimitChange('fetchConcurrency', els.fetchConcurrency, { min: 1, max: 8 }));
els.maxApifyRuns?.addEventListener('change', () => onLimitChange('maxApifyRuns', els.maxApifyRuns, { min: 0, max: 200 }));
els.maxAgeDays?.addEventListener('change', () => onLimitChange('maxAgeDays', els.maxAgeDays, { min: 1, max: 365 }));
els.limitPerQuery?.addEventListener('input', () => updatePlanHint());
els.fetchConcurrency?.addEventListener('input', () => updatePlanHint());
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
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setView(tab.dataset.view));
  const panel = $('view' + tab.dataset.view[0].toUpperCase() + tab.dataset.view.slice(1));
  tab.id = `tab-${tab.dataset.view}`;
  tab.setAttribute('aria-controls', panel.id);
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('.tabs .tab')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    setView(tabs[next].dataset.view);
  });
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
    const preview = await api('/api/setup/preview', { method: 'POST', body: JSON.stringify(payload) });
    const confirmation = await new Promise(resolve => {
      const dialog = document.createElement('dialog'); const title = document.createElement('h2'); title.textContent = 'Review profile setup';
      const content = document.createElement('pre'); content.textContent = JSON.stringify({ before: preview.before, after: preview.after }, null, 2);
      const save = document.createElement('button'); save.textContent = 'Confirm setup'; const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
      const finish = value => { dialog.remove(); resolve(value); }; save.onclick = () => finish(preview.confirmation); cancel.onclick = () => finish(null); dialog.oncancel = () => finish(null);
      dialog.append(title, content, save, cancel); document.body.append(dialog); dialog.showModal();
    });
    if (!confirmation) return;
    payload.confirmation = confirmation;
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
  initFilterMenus();
  const initialView = location.hash.slice(1);
  setView(['results', 'tracker', 'answers', 'memory', 'portals', 'digest', 'ready'].includes(initialView) ? initialView : 'results');
  els.runBtn.disabled = true; els.emptyRunBtn.disabled = true;
  const startup = await Promise.allSettled([refreshMarkets(), refreshStatus()]);
  const startupReady = startup.every(result => result.status === 'fulfilled');
  els.runBtn.disabled = !startupReady || Boolean(state.status?.fetchRunning);
  els.emptyRunBtn.disabled = els.runBtn.disabled;
  for (const result of startup) if (result.status === 'rejected') {
    const box = document.createElement('div'); box.className = 'alert'; box.setAttribute('role', 'alert');
    box.textContent = `Some settings could not load: ${result.reason.message}. `;
    const retry = document.createElement('button'); retry.className = 'btn small'; retry.textContent = 'Retry';
    retry.onclick = () => location.reload(); box.append(retry); els.alerts.append(box);
  }
  // Optional sync never blocks navigation or the first list.
  if (state.status?.sheets?.configured) {
    try {
      const pull = await api('/api/sheets/pull', { method: 'POST', body: '{}' });
      logSheetsPull(pull);
      if (pull.pulled > 0) await refreshAll();
    } catch (err) { appendLog(`Sheets pull: ${err.message}`, 'stderr'); }
  }
})();

function updateResultsEmptyState(data) {
  const filtered = Boolean(els.searchInput.value.trim() || els.fitFilter.value !== 'all' || els.langFilter.value !== 'all' || state.visibleDecisions.size !== DECISION_FILTER_OPTIONS.length);
  $('emptyTitle').textContent = filtered ? 'No jobs match these filters' : data.meta ? 'No jobs in this search' : 'Your next opportunity starts here';
  $('emptyHint').textContent = filtered ? 'Try a broader search or reset your filters to see more jobs.' : 'Choose a market and run a search. Shortlist promising roles to keep them in your tracker.';
  $('emptyResetBtn').hidden = !filtered;
  els.emptyRunBtn.hidden = filtered;
}

function resetResultFilters(focus = false) {
  els.searchInput.value = '';
  els.fitFilter.value = 'all';
  els.langFilter.value = 'all';
  try { localStorage.setItem(LS_LANG, 'all'); } catch { /* optional preference */ }
  state.visibleDecisions = new Set(focus ? ['none', 'shortlisted'] : DECISION_FILTER_OPTIONS.map((option) => option.id));
  state.page = 1;
  onDecisionFilterChange({ rerender: true });
}

$('resetResultsBtn').addEventListener('click', () => resetResultFilters());
$('emptyResetBtn').addEventListener('click', () => resetResultFilters());
$('focusResultsBtn').addEventListener('click', () => resetResultFilters(true));
document.querySelectorAll('[data-tracker-preset]').forEach((button) => button.addEventListener('click', () => selectTrackerPreset(button.dataset.trackerPreset)));

function editApplication(item = null) {
  openApplicationEditor(item, { api, onSaved: async (message, savedEntry) => {
    if (savedEntry) {
      state.trackerVisibleColumns.add(savedEntry.decision);
      state.trackerDueOnly = false;
      els.trackerSearch.value = '';
      state.trackerPage = 1;
    }
    try { await refreshTracker(); showTrackerFeedback(message); }
    catch (err) { showTrackerFeedback(`${message} Could not refresh the list: ${err.message}`, true); }
    $('addApplicationBtn').focus();
  } });
}
$('addApplicationBtn').addEventListener('click', () => editApplication());
