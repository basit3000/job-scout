import test from 'node:test';
import assert from 'node:assert/strict';
import { cvPreferences, cvOptionsInstructions, validateCvOptions } from './cv-preferences.mjs';
import { verifyTexEdit, verifyMarkdownCv, extractTexBullets } from './cv-verify.mjs';
import { buildAgentBrief, buildReviewerBrief, buildRepairBrief } from './cv-agent.mjs';
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

test('optional filler survives validation and fitting only with the personal preference', () => {
  const after = tex.replace('Build APIs', 'Build robust APIs');
  const generic = verifyTexEdit({ before: tex, after, corpus });
  assert.doesNotMatch(generic.tex, /robust/);
  const personal = verifyTexEdit({ before: tex, after, corpus, policy: enabled, memory });
  assert.match(personal.tex, /robust/);
  assert.equal(personal.fixes.length, 0);
  assert.equal(applyNextFitPass(after, ['spacing', 'typography'], enabled).changed, false);
  assert.equal(applyNextFitPass(after, ['spacing', 'typography']).pass, 'wording');
});

test('writers, reviewers and repairs receive consistent personal exceptions while defaults stay strict', () => {
  assert.match(buildAgentBrief({ localRules: '' }), /Never drop an Experience bullet/);
  for (const builder of [buildAgentBrief, buildReviewerBrief, buildRepairBrief]) {
    const brief = builder({ localRules: '', policy: enabled });
    assert.match(brief, /complete original Experience bullet library/);
    assert.match(brief, /summary before Experience is optional/);
    assert.doesNotMatch(brief, /Never drop an Experience bullet|No extra summary paragraph|no lost Experience/);
  }
});
