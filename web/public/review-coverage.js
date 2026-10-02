const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function renderRequirementCoverage(rows = []) {
  if (!rows.length) return '';
  return `<details class="requirement-coverage"><summary>Requirements and supporting evidence (${rows.length})</summary>
    <p>This reviews document accuracy and coverage. Gaps can remain even when the document passes.</p>
    <div class="requirement-coverage-scroll"><table>
      <caption>Posting requirements compared with Memory and the final document</caption>
      <thead><tr><th scope="col">Requirement</th><th scope="col">Priority</th><th scope="col">Status</th><th scope="col">Candidate evidence</th><th scope="col">Document evidence</th></tr></thead>
      <tbody>${rows.map(row => `<tr>${['requirement', 'priority', 'status', 'evidence', 'document'].map(key => `<td>${escape(row[key])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></details>`;
}
