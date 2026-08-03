const $ = (id) => document.getElementById(id);

const els = {
  marketSelect: $('marketSelect'),
  allowPaid: $('allowPaid'),
  replaceResults: $('replaceResults'),
  limitPerQuery: $('limitPerQuery'),
  maxApifyRuns: $('maxApifyRuns'),
  maxAgeDays: $('maxAgeDays'),
  cvSource: $('cvSource'),
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
  decisionFilter: $('decisionFilter'),
  fitFilter: $('fitFilter'),
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
  prepModalRecreate: $('prepModalRecreate'),
};

const DECISIONS = ['shortlisted', 'applied', 'skipped', 'interviewing', 'rejected', 'closed'];
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
};

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
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

function queryString() {
  const p = new URLSearchParams({
    page: String(state.page),
    pageSize: els.pageSize.value || '10',
    q: els.searchInput.value.trim(),
    decision: els.decisionFilter.value,
    fit: els.fitFilter.value,
  });
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
    desc.textContent = job.description || 'No description — open the URL before judging.';

    el.querySelector('.toggle-desc').addEventListener('click', () => {
      const open = desc.hidden;
      desc.hidden = !open;
      fitBox.hidden = !open;
      el.classList.toggle('open', open);
    });

    el.querySelectorAll('[data-decision]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const d = btn.dataset.decision;
          await api('/api/decisions', {
            method: 'POST',
            body: JSON.stringify({ id: job.id, decision: d }),
          });
          // Shortlist → prompt for CV prep (first time or recreate)
          if (d === 'shortlisted') {
            await runPrepFlow(job);
          }
          await refreshJobs();
          if (state.view === 'tracker') await refreshTracker();
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
        await api('/api/decisions', {
          method: 'POST',
          body: JSON.stringify({ id: job.id, decision: 'applied' }),
        });
        await refreshJobs();
        if (state.view === 'tracker') await refreshTracker();
        appendLog(`Marked applied: ${job.title}`);
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
 * Show Prep dialog: Use existing vs Recreate, Extra instructions (default None).
 * @returns {Promise<{ recreate: boolean, extraInstructions: string } | null>}
 */
function openPrepModal(job) {
  return new Promise((resolve) => {
    if (!els.prepModal) {
      resolve({ recreate: true, extraInstructions: '' });
      return;
    }
    const hasCache = Boolean(job.prepCached || job.tailoredPdf || job.tailoredCv);
    els.prepModalTitle.textContent = hasCache ? 'Recreate CV?' : 'Prep & CV';
    els.prepModalHint.textContent = hasCache
      ? 'A pack already exists for this job. Use existing downloads or recreate (recompiles Overleaf PDFs).'
      : 'Create a tailored pack. Extra instructions are optional (default: none).';
    els.prepModalUseExisting.hidden = !hasCache;
    els.prepModalRecreate.textContent = hasCache ? 'Recreate CV' : 'Create CV';
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
      els.prepInstrPreset?.removeEventListener('change', onPreset);
      closePrepModal();
      resolve(value);
    };
    const onCancel = () => finish(null);
    const onUse = () => finish({ recreate: false, extraInstructions: readPrepInstructions() });
    const onRecreate = () => finish({ recreate: true, extraInstructions: readPrepInstructions() });
    const onPreset = () => {
      if (els.prepInstrCustom) {
        els.prepInstrCustom.hidden = els.prepInstrPreset.value !== 'custom';
      }
    };
    els.prepModalCancel?.addEventListener('click', onCancel);
    els.prepModalUseExisting?.addEventListener('click', onUse);
    els.prepModalRecreate?.addEventListener('click', onRecreate);
    els.prepInstrPreset?.addEventListener('change', onPreset);
  });
}

async function runPrepFlow(job) {
  const choice = await openPrepModal(job);
  if (!choice) {
    appendLog('Prep cancelled.');
    return;
  }
  try {
    if (choice.recreate) {
      appendLog(
        `Building prep + CV for ${job.title}${choice.extraInstructions ? ' (with instructions)' : ''}…`,
      );
    } else {
      appendLog(`Using existing prep pack for ${job.title}…`);
    }
    const data = await api('/api/prep', {
      method: 'POST',
      body: JSON.stringify({
        id: job.id,
        recreate: choice.recreate,
        extraInstructions: choice.extraInstructions || '',
      }),
    });
    state.lastPrepJobId = job.id;
    if (data.cached) appendLog('Skipped compile — cached PDFs.');
    if (data.pack?.downloadFolderAbs) {
      appendLog(`Company folder: ${data.pack.downloadFolderAbs}`);
    }
    showPrep(data);
    // Always refresh project downloads/<Company>/ + open Explorer after prep
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
  } catch (err) {
    appendLog(`Prep failed: ${err.message}`, 'stderr');
  }
}

function showPrep(data) {
  els.sideTitle.textContent = 'Prep & CV';
  els.logView.hidden = true;
  els.prepView.hidden = false;
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
  els.prepView.innerHTML = `
    <h3>${escapeHtml(data.fit?.verdict || '')} · ${escapeHtml(pack.relativeDir || '')}</h3>
    <p>Source: <strong>${escapeHtml(pack.cvSource || 'local')}</strong>
      ${pack.cvContentSource ? `(${escapeHtml(pack.cvContentSource)})` : ''}
      ${pack.hasPdf ? ` · PDF ready (${escapeHtml(pack.pdfNote || '')})` : ` · ${escapeHtml(pack.pdfNote || 'no PDF')}`}
      ${escapeHtml(cachedNote)}</p>
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
    <p class="meta">PDFs go to <code>job-scout\\downloads\\&lt;Company&gt;\\</code> (not Windows Downloads). Files: <code>&lt;Your Name&gt; CV.pdf</code> + <code>&lt;Your Name&gt; CV ATS.pdf</code> (from profile.json).</p>
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
    els.prepView.hidden = true;
    els.logView.hidden = false;
    els.sideTitle.textContent = 'Run log';
  });
}

async function refreshJobs() {
  const data = await api(`/api/jobs?${queryString()}`);
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
  if (els.overleafPush && document.activeElement !== els.overleafPush) {
    els.overleafPush.checked = s.cv?.overleafPush !== false;
  }
  updatePlanHint(s);
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
  const data = await api('/api/tracker');
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

async function refreshDigest() {
  const data = await api('/api/digest');
  els.digestMeta.textContent = data.digest?.generatedAt
    ? `${data.count} new since previous fetch (${data.digest.previousFetchAt ? new Date(data.digest.previousFetchAt).toLocaleString() : 'first run'})`
    : 'Run a search to build a digest.';
  els.digestList.innerHTML = '';
  if (!data.newJobs?.length) {
    els.digestList.innerHTML = '<div class="empty"><p>No new postings vs the previous fetch.</p></div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const job of data.newJobs) frag.appendChild(renderJob(job));
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
      'Allow paid uses Apify and can cost money (often many actor runs).\n\n' +
        'JobSpy-first is on by default, with a paid-run cap — but free searches leave this unchecked.\n\n' +
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
        allowPaid ? 'allow-paid (JobSpy first, Apify capped)' : 'FREE JobSpy only',
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
  refreshJobs();
});
els.decisionFilter.addEventListener('change', () => {
  state.page = 1;
  refreshJobs();
});
els.fitFilter.addEventListener('change', () => {
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
    await refreshMarkets();
    await refreshStatus();
    if (!state.status?.setup?.needsSetup) await refreshJobs();
    // Keep Allow paid OFF by default — JobSpy is free. Token presence is not consent to spend.
  } catch (err) {
    appendLog(`Init failed: ${err.message}`, 'stderr');
    setChip('error', 'Error');
  }
})();
