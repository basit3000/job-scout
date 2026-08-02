import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { api } from './api.js';

const emptyForm = {
  name: '',
  targetRole: '',
  skills: '',
  titles: '',
  currentLocation: '',
  openToRemote: true,
};

function fitClass(fit) {
  if (fit === 'Strong') return 'strong';
  if (fit === 'Worth a shot') return 'worth';
  if (fit === 'Stretch') return 'stretch';
  return 'weak';
}

export default function App() {
  const [markets, setMarkets] = useState([]);
  const [market, setMarket] = useState('AE');
  const [form, setForm] = useState(emptyForm);
  const [cvPaste, setCvPaste] = useState('');
  const [cvInfo, setCvInfo] = useState(null);
  const [shortlist, setShortlist] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, s] = await Promise.all([api.markets(), api.state()]);
        if (cancelled) return;
        setMarkets(m.markets || []);
        setMarket(s.market || m.market || 'AE');
        if (s.profile) {
          setForm({
            name: s.profile.name || '',
            targetRole: s.profile.targetRole || '',
            skills: (s.profile.skills || []).join(', '),
            titles: (s.profile.titles || []).join(', '),
            currentLocation: s.profile.currentLocation || '',
            openToRemote: s.profile.openToRemote ?? true,
          });
        }
        if (s.hasCv) {
          setCvInfo({ chars: s.cvChars, preview: s.cvPreview });
          if (s.cvPreview) setCvPaste(s.cvPreview);
        }
        if (s.shortlist?.jobs?.length) setShortlist(s.shortlist);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const marketLabel = useMemo(
    () => markets.find((m) => m.id === market)?.name || market,
    [markets, market],
  );

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCvFile(file) {
    if (!file) return;
    setError('');
    setBusy(true);
    setStatus('Uploading CV…');
    try {
      const res = await api.uploadCvFile(file);
      setCvInfo({ chars: res.chars, preview: res.preview, savedAs: res.savedAs });
      setCvPaste(res.preview || '');
      setStatus('CV saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCvPasteSave() {
    setError('');
    setBusy(true);
    setStatus('Saving CV text…');
    try {
      const res = await api.uploadCvText(cvPaste);
      setCvInfo({ chars: res.chars, preview: res.preview, savedAs: res.savedAs });
      setStatus('CV saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runScout() {
    setError('');
    setBusy(true);
    setStatus('Scoring your market and ranking matches…');
    try {
      if (cvPaste.trim().length > 40 && (!cvInfo || cvPaste !== cvInfo.preview)) {
        await api.uploadCvText(cvPaste);
      }

      const payload = {
        market,
        name: form.name.trim(),
        targetRole: form.targetRole.trim(),
        currentLocation: form.currentLocation.trim(),
        openToRemote: form.openToRemote,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        titles: form.titles.split(',').map((s) => s.trim()).filter(Boolean),
        limit: 20,
      };

      const res = await api.scout(payload);
      startTransition(() => setShortlist(res));
      setStatus(`Found ${res.summary?.total ?? 0} ranked roles in ${res.marketName || marketLabel}`);
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function applyTo(job) {
    window.open(job.url, '_blank', 'noopener,noreferrer');
    try {
      await api.decision(job.id, 'applied', 'Opened posting from UI');
    } catch {
      /* non-blocking */
    }
  }

  async function skip(job) {
    try {
      await api.decision(job.id, 'skipped', 'Skipped from UI');
      setShortlist((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          jobs: prev.jobs.filter((j) => j.id !== job.id),
          summary: {
            ...prev.summary,
            total: Math.max(0, (prev.summary?.total ?? 1) - 1),
          },
        };
      });
    } catch (err) {
      setError(err.message);
    }
  }

  const jobs = shortlist?.jobs || [];

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-sky" aria-hidden="true" />
        <p className="brand">
          Job <span>Scout</span>
        </p>
        <div className="hero-copy">
          <h2>Upload your CV. Get the roles that actually fit.</h2>
          <p>
            We pull live postings for your country, rank them against your evidence,
            and show a short blurb for each — then you apply in one click.
          </p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Upload CV
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => document.getElementById('setup')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Set market & role
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.md,.txt,.tex,.markdown,text/plain,application/pdf"
            hidden
            onChange={(e) => handleCvFile(e.target.files?.[0])}
          />
        </div>
      </header>

      <section className="panel" id="setup">
        <h3>Your search</h3>
        <p className="lede">
          Nothing is submitted to employers for you. Apply opens their posting in a new tab.
        </p>

        <div
          className={`dropzone ${dragOver ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleCvFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
        >
          <strong>{cvInfo ? 'CV ready — drop another to replace' : 'Drop CV here'}</strong>
          <p>PDF, Markdown, or plain text. Or paste below.</p>
        </div>

        <div className="grid" style={{ marginTop: '0.9rem' }}>
          <label className="field">
            <span>Or paste CV text</span>
            <textarea
              value={cvPaste}
              onChange={(e) => setCvPaste(e.target.value)}
              placeholder="Paste your CV…"
              onClick={(e) => e.stopPropagation()}
            />
          </label>
          {cvPaste.trim().length > 40 && (
            <div>
              <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={handleCvPasteSave}>
                Save pasted CV
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-2" style={{ marginTop: '1rem' }}>
          <label className="field">
            <span>Your name</span>
            <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Alex Rivera" />
          </label>
          <label className="field">
            <span>Target role</span>
            <input
              value={form.targetRole}
              onChange={(e) => updateField('targetRole', e.target.value)}
              placeholder="Staff Nurse / Accountant / Product Designer"
            />
          </label>
          <label className="field">
            <span>Country / market</span>
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Where you are now</span>
            <input
              value={form.currentLocation}
              onChange={(e) => updateField('currentLocation', e.target.value)}
              placeholder="City, country"
            />
          </label>
          <label className="field">
            <span>Core skills (comma-separated)</span>
            <input
              value={form.skills}
              onChange={(e) => updateField('skills', e.target.value)}
              placeholder="ER nursing, triage, ACLS"
            />
          </label>
          <label className="field">
            <span>Extra title queries (optional)</span>
            <input
              value={form.titles}
              onChange={(e) => updateField('titles', e.target.value)}
              placeholder="Registered Nurse, ER Nurse"
            />
          </label>
        </div>

        <label className="field" style={{ marginTop: '0.85rem', gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={form.openToRemote}
            onChange={(e) => updateField('openToRemote', e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span>Open to remote roles in this market</span>
        </label>

        <div className="status-row">
          <span className={`chip ${cvInfo ? 'ok' : 'warn'}`}>
            {cvInfo ? `CV · ${cvInfo.chars} chars` : 'CV missing'}
          </span>
          <span className={`chip ${form.name && form.targetRole ? 'ok' : 'warn'}`}>
            {form.name && form.targetRole ? 'Profile ready' : 'Name & role needed'}
          </span>
          <span className="chip">{marketLabel}</span>
        </div>

        <div className="hero-actions" style={{ marginTop: '1.1rem' }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={runScout}>
            {busy ? 'Finding matches…' : 'Find relevant jobs'}
          </button>
        </div>
        {busy && (
          <div className="loading-bar" aria-hidden="true">
            <i />
          </div>
        )}
        {status && !error && <p className="hint">{status}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {jobs.length > 0 && (
        <section ref={resultsRef}>
          <div className="results-head">
            <div>
              <h2>Most relevant</h2>
              <p>
                {shortlist.marketName || marketLabel}
                {shortlist.targetRole ? ` · ${shortlist.targetRole}` : ''}
                {' · '}ranked against your CV
              </p>
            </div>
            <div className="stats">
              <span className="chip ok">Strong {shortlist.summary?.counts?.Strong ?? 0}</span>
              <span className="chip">Worth a shot {shortlist.summary?.counts?.['Worth a shot'] ?? 0}</span>
              <span className="chip warn">Stretch {shortlist.summary?.counts?.Stretch ?? 0}</span>
            </div>
          </div>

          <div className="job-list">
            {jobs.map((job, index) => (
              <article
                className="job"
                key={job.id}
                style={{ animationDelay: `${Math.min(index, 8) * 0.05}s` }}
              >
                <div className="job-top">
                  <div>
                    <h3>{job.title}</h3>
                    <div className="company">{job.company}</div>
                  </div>
                  <span className={`fit ${fitClass(job.fit)}`}>
                    {job.fit} · {job.score}
                  </span>
                </div>
                <p className="blurb">{job.blurb}</p>
                <div className="meta">
                  <span>{job.location || 'Location n/a'}</span>
                  <span>{job.board} via {job.via}</span>
                  {job.ageDays != null && <span>{job.ageDays}d ago</span>}
                  {job.salary && <span>{job.salary}</span>}
                </div>
                {job.why?.length > 0 && (
                  <ul className="why">
                    {job.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <div className="job-actions">
                  <button type="button" className="btn btn-apply btn-small" onClick={() => applyTo(job)}>
                    Apply
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => skip(job)}>
                    Skip
                  </button>
                  <a className="btn btn-ghost btn-small" href={job.url} target="_blank" rel="noreferrer">
                    View posting
                  </a>
                </div>
              </article>
            ))}
          </div>
          <p className="footer-note">
            Apply opens the employer site — you complete the application yourself.
            Skipped roles stay out of the next run.
          </p>
        </section>
      )}
    </div>
  );
}
