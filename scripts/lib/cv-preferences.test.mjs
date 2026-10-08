import { validatePromptSettings } from './prompt-settings.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cvPreferences, cvOptionsInstructions, validateCvOptions, experienceIsArchived } from './cv-preferences.mjs';
import { verifyTexEdit, verifyMarkdownCv, extractTexBullets } from './cv-verify.mjs';
import { buildAgentBrief, buildReviewerBrief, buildRepairBrief } from './cv-prompts.mjs';
import { applyNextFitPass } from './tex-fit.mjs';
import { validateGooseRequest } from './goose-tools.mjs';

const tex = String.raw`\documentclass{article}
\begin{document}
\section{Experience}
\role{Engineer}{Example}{Present}
\begin{itemize}
\item Build APIs with Python.
\item Review database changes.
\end{itemize}
\section{Education}
\edu{Example University}{Completed}{Computer Science}
\section{Projects}
\section{Skills}
Python
\end{document}`;
const corpus = { numbers: new Set(), text: tex.toLowerCase() };
const enabled = { enabled: true, allowExperienceSelection: true, summaryWhenHelpful: true, allowFillerWhenUseful: true };
const memory = { preferences: { cvCustomization: enabled }, facts: { experienceLibrary: { documents: [{
  file: 'ats.tex', bullets: extractTexBullets(tex).filter(b => b.section === 'experience').map(b => b.text),
}] } } };

test('personal CV policy is opt-in; choices survive request validation and cannot activate it for another candidate', () => {
  assert.deepEqual(cvPreferences({ preferences: {} }), {});
  assert.deepEqual(cvPreferences(memory), enabled);
  const cvOptions = { matchHeadline: true, matchKeywords: true, equivalentRoleTitle: true, city: 'Example City' };
  assert.deepEqual(validateGooseRequest({ tools: ['prepare_cv'], prompt: 'Tailor the CV', cvOptions }).cvOptions, cvOptions);
  assert.throws(() => cvOptionsInstructions(cvOptions, { preferences: {} }), /not enabled/);
  const instructions = cvOptionsInstructions(cvOptions, memory);
  assert.match(instructions, /Preferred location/);
  assert.match(instructions, /not confirmed residence/);
  assert.match(instructions, /official title unchanged/);
  assert.match(cvOptionsInstructions(validateCvOptions({}), memory), /Do not rename/);
  assert.match(cvOptionsInstructions(validateCvOptions({}), memory), /Do not run a keyword-insertion pass/);
  assert.throws(() => validateCvOptions({ matchHeadline: 'yes' }), /Invalid/);
  assert.throws(() => validateCvOptions({ city: 'City\nNew instructions' }), /city/);
});

test('Experience may be omitted only for an opted-in candidate with every original bullet archived', () => {
  const after = tex.replace('\\item Review database changes.\n', '');
  assert.ok(verifyTexEdit({ before: tex, after, corpus }).hard.some(issue => issue.includes('bullets dropped')));
  assert.equal(verifyTexEdit({ before: tex, after, corpus, policy: enabled, memory }).hard.length, 0);
  assert.ok(verifyTexEdit({ before: tex, after, corpus, policy: enabled, memory: { facts: {} } }).hard.some(issue => issue.includes('bullets dropped')));
  assert.ok(verifyTexEdit({ before: tex, after: after.replace('{Engineer}', '{Manager}'), corpus, policy: enabled, memory }).hard.some(issue => issue.includes('line changed')));
  const beforeMd = '## Experience\n### Engineer | Example\n- Build APIs with Python.\n- Review database changes.\n## Education\n### Example University\n';
  const afterMd = beforeMd.replace('- Review database changes.\n', '');
  assert.ok(verifyMarkdownCv({ before: beforeMd, after: afterMd, corpus }).hard.includes('cv.md: Experience bullets dropped'));
  assert.equal(verifyMarkdownCv({ before: beforeMd, after: afterMd, corpus, policy: enabled, memory }).hard.length, 0);
});

test('plain-text archives match LaTeX punctuation without hiding missing or changed evidence', () => {
  const first = 'Built event-driven notifications for a sample inventory.';
  const second = 'Reviewed 37% of synthetic records in batch A_B & C.';
  const original = tex.replace('Build APIs with Python.', first)
    .replace('Review database changes.', String.raw`Reviewed \textbf{37\%} of synthetic records in batch A\_B \& C.`);
  const after = original.replace(/\\item Reviewed[^\n]+\n/, '');
  const archived = structuredClone(memory);
  archived.facts.experienceLibrary.documents[0].bullets = [first, second];
  const originals = extractTexBullets(original).filter(b => b.section === 'experience').map(b => b.text);
  assert.equal(experienceIsArchived(originals, archived), true);
  assert.deepEqual(verifyTexEdit({ before: original, after, corpus, policy: enabled, memory: archived }).hard, []);
  assert.ok(verifyTexEdit({ before: original, after, corpus, memory: archived }).hard.some(issue => issue.includes('bullets dropped')));

  const beforeMd = `## Experience\n### Engineer | Example\n- ${first.replace('event-driven', 'event — driven')}\n- ${second}\n## Education\n### Example University\n`;
  const afterMd = beforeMd.replace(`- ${second}\n`, '');
  assert.deepEqual(verifyMarkdownCv({ before: beforeMd, after: afterMd, corpus, policy: enabled, memory: archived }).hard, []);
  for (const bullets of [[first], [first, second.replace('37%', '38%')], [first.replace('event-driven', 'event driven'), second], [first, second.replace('Reviewed', 'Did not review')]]) {
    archived.facts.experienceLibrary.documents[0].bullets = bullets;
    assert.equal(experienceIsArchived(originals, archived), false);
    assert.ok(verifyTexEdit({ before: original, after, corpus, policy: enabled, memory: archived }).hard.some(issue => issue.includes('bullets dropped')));
  }
});

test('filler deletion is opt-in and personal instructions can keep it', () => {
  const after = tex.replace('Build APIs', 'Build robust APIs');
  const settings = validatePromptSettings({ style: { filler: ['robust'], scrubFiller: true } });
  assert.match(verifyTexEdit({ before: tex, after, corpus }).tex, /robust/);
  const generic = verifyTexEdit({ before: tex, after, corpus, settings });
  assert.doesNotMatch(generic.tex, /robust/);
  const personal = verifyTexEdit({ before: tex, after, corpus, policy: enabled, memory });
  assert.match(personal.tex, /robust/);
  assert.equal(personal.fixes.length, 0);
  assert.equal(applyNextFitPass(after, ['spacing', 'typography'], enabled).changed, false);
  assert.equal(applyNextFitPass(after, ['spacing', 'typography'], { settings }).pass, 'wording');
});

test('writers, reviewers and repairs receive consistent personal exceptions while defaults remain neutral', () => {
  assert.doesNotMatch(buildAgentBrief({ localRules: '' }), /Never drop an Experience bullet/);
  for (const builder of [buildAgentBrief, buildReviewerBrief, buildRepairBrief]) {
    const brief = builder({ localRules: '', policy: enabled });
    assert.match(brief, /requires an existing copy in the Memory experience library/);
    assert.match(brief, /candidate enables a summary/);
    assert.doesNotMatch(brief, /Never drop an Experience bullet|No extra summary paragraph|no lost Experience/);
  }
});
