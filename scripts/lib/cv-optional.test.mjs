import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyJobAwareOptionalDrops,
  applyNextOptionalSpaceDrop,
  dropCourseLines,
  dropSpokenLanguages,
  ensureOptionalLines,
  languagesNeeded,
} from './cv-optional.mjs';

const ATS = String.raw`
\section*{Experience}
\role{Developer}{Acme}{2024}
\begin{itemize}
  \item Built FastAPI APIs.
\end{itemize}
\section*{Education}
\edu{TU Example}{2022 -- Present}{M.Sc.}
Courses: Advanced Database Systems, Deep Learning
\section*{Skills}
\textbf{Tech stack:} Python, Docker\\
\textbf{Languages:} English C2, German A2.2\\
\textbf{Certificates:} Learning Docker
\end{document}
`;

describe('optional CV lines', () => {
  it('never strips Experience when dropping languages or courses', () => {
    const noLang = dropSpokenLanguages(ATS);
    assert.match(noLang, /Built FastAPI APIs/);
    assert.doesNotMatch(noLang, /English C2/);
    const noCourses = dropCourseLines(ATS);
    assert.match(noCourses, /Built FastAPI APIs/);
    assert.doesNotMatch(noCourses, /Courses:/);
  });

  it('drops the spoken-languages line when German is not required', () => {
    const r = applyJobAwareOptionalDrops(ATS, {
      title: 'Backend Engineer',
      description: 'Python FastAPI. English is enough.',
    });
    assert.equal(languagesNeeded({ title: 'Backend Engineer', description: 'Python FastAPI.' }), false);
    assert.match(r.tex, /Built FastAPI APIs/);
    assert.doesNotMatch(r.tex, /German A2/);
    assert.ok(r.actions.some((a) => /spoken-languages/.test(a)));
  });

  it('keeps the spoken-languages line when German is required', () => {
    const r = applyJobAwareOptionalDrops(ATS, {
      title: 'Softwareentwickler',
      description: 'Deutschkenntnisse C1 sind erforderlich. FastAPI.',
    });
    assert.match(r.tex, /German A2/);
  });

  it('keeps a course line that matches the posting', () => {
    const r = applyJobAwareOptionalDrops(ATS, {
      title: 'Data Engineer',
      description: 'You will design database schemas and SQL pipelines.',
    });
    assert.match(r.tex, /Advanced Database Systems/);
  });

  it('space drop hits courses before Experience', () => {
    const r = applyNextOptionalSpaceDrop(ATS, []);
    assert.equal(r.pass, 'courses');
    assert.match(r.tex, /Built FastAPI APIs/);
    assert.doesNotMatch(r.tex, /Courses:/);
  });

  it('restores overlay extras onto a stripped Education block', () => {
    const extras = {
      courses: [{ match: 'TU Example', line: 'Courses: Advanced Database Systems, Deep Learning' }],
      languages: 'English C2, German A2.2',
      certificates: 'Learning Docker',
    };
    const stripped = dropCourseLines(dropSpokenLanguages(ATS));
    const r = ensureOptionalLines(stripped, extras);
    assert.ok(r.changed);
    assert.match(r.tex, /Courses: Advanced Database Systems/);
    assert.match(r.tex, /Languages:/);
  });
});
