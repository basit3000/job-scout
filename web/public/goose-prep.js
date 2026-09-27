export function selectedGooseTools(root = document) {
  return [...root.querySelectorAll('#gooseTools input:checked')].map((input) => input.value);
}

export function suggestedGoosePrompt(tools) {
  const steps = [];
  if (tools.includes('inspect_job')) steps.push('Read this job and identify its requirements.');
  if (tools.includes('inspect_cv')) steps.push('Read my CV and evidence.');
  if (tools.includes('keyword_gaps')) steps.push('Explain supported matches and missing requirements.');
  if (tools.includes('prepare_cv')) steps.push('Prepare a tailored CV using only supported facts, then check and review it.');
  if (tools.includes('prepare_letter')) steps.push('Prepare and review a concise cover letter using my current CV.');
  if (tools.includes('inspect_reviews')) steps.push('Read the review findings and explain any unresolved issues.');
  return [...steps, 'Summarize what you did and anything you need me to clarify.'].join(' ');
}

export function renderGooseTools(container, tools) {
  const defaults = ['inspect_job', 'inspect_cv', 'keyword_gaps', 'prepare_cv', 'inspect_reviews'];
  for (const tool of tools) {
    const label = document.createElement('label');
    label.className = 'goose-tool';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = tool.name; input.checked = defaults.includes(tool.name);
    const description = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = tool.label;
    const detail = document.createElement('small'); detail.textContent = tool.description;
    description.append(title, detail); label.append(input, description); container.append(label);
  }
}
