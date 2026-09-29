export function mountAtsCheck() {
  const get = id => document.getElementById(id);
  const dialog = get('atsCheckDialog');
  get('openAtsCheck').addEventListener('click', () => dialog.showModal());
  get('closeAtsCheck').addEventListener('click', () => dialog.close());
  get('atsCheckForm').addEventListener('submit', async event => {
    event.preventDefault();
    const file = get('atsPdf').files[0];
    const status = get('atsCheckStatus');
    const results = get('atsCheckResults');
    results.replaceChildren();
    if (!file || file.size > 10 * 1024 * 1024) { status.textContent = 'Choose a PDF of up to 10 MB.'; return; }
    get('runAtsCheck').disabled = true;
    status.textContent = 'Checking the PDF text layer locally…';
    try {
      const pdf = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read the PDF.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/ats-check', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf, keywords: get('atsKeywords').value.split(',').map(word => word.trim()).filter(Boolean) }) });
      const report = await response.json();
      if (!response.ok) throw new Error(report.error || 'PDF check failed.');
      status.textContent = `${file.name} · ${report.pages} page(s) · ${report.status === 'clear' ? 'No text-readability problems detected' : report.status === 'problems' ? 'Text-readability problems found' : 'Review the observations below'}`;
      const paragraph = document.createElement('p'); paragraph.textContent = report.explanation; results.append(paragraph);
      for (const [heading, items] of [['Problems', report.problems], ['Observations', report.warnings], ['Keyword presence', report.keywords.map(item => `${item.keyword}: ${item.found ? 'found' : 'not found'}`)]]) {
        if (!items.length) continue;
        const title = document.createElement('h3'); title.textContent = heading;
        const list = document.createElement('ul');
        for (const item of items) { const li = document.createElement('li'); li.textContent = item; list.append(li); }
        results.append(title, list);
      }
      const detail = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Inspect extracted text and reading order';
      const pre = document.createElement('pre'); pre.textContent = report.text;
      detail.append(summary, pre); results.append(detail);
    } catch (error) { status.textContent = error.message; }
    finally { get('runAtsCheck').disabled = false; }
  });
}
