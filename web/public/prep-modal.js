import { selectedGooseTools, suggestedGoosePrompt, renderGooseTools } from './goose-prep.js';
import { selectedCvTemplates, renderCvTemplates, bindTemplateImport } from './cv-templates.js';

const $ = id => document.getElementById(id);

function syncPrepModalActions() {
  const preparesCv = selectedGooseTools().includes('prepare_cv');
  $('cvTemplates').hidden = !preparesCv;
  $('overleafPushOptions').hidden = $('gooseOptions').dataset.cvSource !== 'overleaf' || !preparesCv || !selectedCvTemplates().includes('default');
  if ($('overleafPushOptions').hidden) $('pushToOverleaf').checked = false;
  $('prepModalRecreate').textContent = preparesCv ? ($('prepModal').dataset.hasCv === 'true' ? 'Recreate CV' : 'Create CV') : 'Run Goose';
  $('prepModalRecreate').disabled = $('gooseOptions').dataset.ready !== 'true'
    || !selectedGooseTools().length || !$('goosePrompt').value.trim() || (preparesCv && (!selectedCvTemplates().length || selectedCvTemplates().length > 6));
}
export function openPrepModal(job, { api, preferCoverLetter = false }) {
  return new Promise(resolve => {
    let closed = false;
    $('cvTemplateChoices').replaceChildren();
    $('cvTemplateStatus').textContent = '';
    $('cvTemplateFile').value = ''; $('cvTemplateName').value = ''; $('cvTemplateImport').disabled = false;
    bindTemplateImport(api, syncPrepModalActions, () => closed);
    $('personalCvOptions').hidden = true;
    $('overleafPushOptions').hidden = true;
    $('pushToOverleaf').checked = false;
    $('gooseOptions').dataset.cvSource = '';
    $('prepModal').dataset.hasCv = String(Boolean(job.prepCached || job.tailoredPdf || job.tailoredCv));
    for (const id of ['cvMatchHeadline', 'cvMatchKeywords', 'cvEquivalentRole']) $(id).checked = false;
    $('cvPreferredCity').value = '';
    $('cvUseJobCity').onclick = () => { $('cvPreferredCity').value = String(job.location || '').split(',')[0].trim().slice(0, 100); };
    $('prepModalTitle').textContent = 'Prepare with Goose';
    $('prepModalHint').textContent = 'Choose tools and describe the work. Goose plans the steps and checks the results.';
    $('gooseOptions').dataset.ready = 'false';
    $('prepModal').hidden = false;
    const finish = value => {
      if (closed) return;
      closed = true;
      $('prepModalCancel').removeEventListener('click', cancel);
      $('prepModalRecreate').removeEventListener('click', run);
      $('gooseTools').removeEventListener('change', syncPrepModalActions);
      $('cvTemplateChoices').removeEventListener('change', syncPrepModalActions);
      $('goosePrompt').removeEventListener('input', syncPrepModalActions);
      $('gooseSuggestPrompt').removeEventListener('click', suggest);
      $('prepModal').removeEventListener('click', backdrop);
      document.removeEventListener('keydown', key);
      $('prepModal').hidden = true; resolve(value);
    };
    const cancel = () => finish(null);
    const run = () => finish({ tools: selectedGooseTools(), prompt: $('goosePrompt').value.trim(),
      ...(selectedGooseTools().includes('prepare_cv') ? { templateIds: selectedCvTemplates() } : {}),
      ...($('overleafPushOptions').hidden ? {} : { pushToOverleaf: $('pushToOverleaf').checked }),
      ...($('personalCvOptions').hidden ? {} : { cvOptions: { matchHeadline: $('cvMatchHeadline').checked,
        matchKeywords: $('cvMatchKeywords').checked, equivalentRoleTitle: $('cvEquivalentRole').checked,
        city: $('cvPreferredCity').value.trim() } }) });
    const suggest = () => { $('goosePrompt').value = suggestedGoosePrompt(selectedGooseTools()); syncPrepModalActions(); };
    const backdrop = event => { if (event.target === $('prepModal')) cancel(); };
    const key = event => { if (event.key === 'Escape') cancel(); };
    $('prepModalCancel').addEventListener('click', cancel);
    $('prepModalRecreate').addEventListener('click', run);
    $('gooseTools').addEventListener('change', syncPrepModalActions);
    $('cvTemplateChoices').addEventListener('change', syncPrepModalActions);
    $('goosePrompt').addEventListener('input', syncPrepModalActions);
    $('gooseSuggestPrompt').addEventListener('click', suggest);
    $('prepModal').addEventListener('click', backdrop);
    document.addEventListener('keydown', key);
    syncPrepModalActions();
    api('/api/goose').then(({ tools, status, cvSource, cvPreferences = {}, templates = [] }) => {
      if (closed) return;
      $('gooseOptions').dataset.cvSource = cvSource || 'local';
      renderCvTemplates(templates);
      $('personalCvOptions').hidden = !cvPreferences.enabled;
      $('personalCvPolicy').textContent = [
        cvPreferences.allowExperienceSelection ? 'Your complete Experience library stays in Memory; this CV may select relevant bullets.' : '',
        cvPreferences.summaryWhenHelpful ? 'A summary is optional when useful.' : '',
        cvPreferences.allowFillerWhenUseful ? 'Filler is avoided but allowed when it fits.' : '',
      ].filter(Boolean).join(' ');
      $('gooseTools').replaceChildren();
      renderGooseTools($('gooseTools'), tools);
      for (const input of $('gooseTools').querySelectorAll('input')) {
        if (input.value === 'prepare_cv') input.checked = !preferCoverLetter;
        if (input.value === 'prepare_letter') input.checked = Boolean(preferCoverLetter);
      }
      $('gooseStatus').textContent = status.detail;
      $('gooseOptions').dataset.ready = String(status.ok);
      suggest();
    }).catch(error => { if (!closed) $('gooseStatus').textContent = error.message; });
  });
}
