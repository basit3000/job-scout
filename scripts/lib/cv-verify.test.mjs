import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTexPair,
  extractTexBullets,
  extractTexFacts,
  extractHeadline,
  newNumbers,
  numberTokens,
  texToProse,
  verifyLetter,
  verifyMarkdownCv,
  verifyTexEdit,
} from './cv-verify.mjs';

const ATS = String.raw`
\documentclass{article}
\newcommand{\role}[3]{{\textbf{#1}, #2\hfill #3\par}}
\newcommand{\edu}[3]{{\textbf{#1}\hfill #2\par}#3\\}
\begin{document}
  {\LARGE\bfseries Jane Doe}\\[2pt]
  Software Developer -- Python, Docker\\[2pt]
  Germany $\cdot$ \href{mailto:jane@example.com}{jane@example.com} $\cdot$ +49 170 1234567
\section*{Experience}
\role{Software Developer}{Acme GmbH, Berlin, DE}{05/2024 -- Present}
\begin{itemize}
  \item Maintain the FastAPI backend on PostgreSQL, shipped through Docker and Jenkins CI/CD.
  \item Review REST API contracts for the React front-end.
\end{itemize}
\section*{Education}
\edu{TU Berlin}{10/2022 -- Present}{M.Sc. Computer Science}
\section*{Projects}
\begin{itemize}
  \item \textbf{Tool} -- \mbox{\href{https://github.com/jane/tool}{github.com/jane/tool}} -- CLI in Go that syncs 82 repos.
\end{itemize}
\section*{Skills}
Python, Go, Docker
\end{document}
`;

const MAIN = String.raw`
\documentclass{moderncv}
\name{Jane}{Doe}
\title{Software Developer -- Python, Docker}
\begin{document}
\section{Experience}
\cventry{05/2024 -- Present}{Software Developer}{Acme GmbH}{Berlin, DE}{}{
\begin{itemize}
  \item Maintain the FastAPI backend on PostgreSQL, shipped through Docker and Jenkins CI/CD.
  \item Review REST API contracts for the React front-end.
\end{itemize}}
\section{Education}
\cventry{10/2022 -- Present}{M.Sc. Computer Science}{TU Berlin}{}{}{}
\section{Projects}
\cvitem{\href{https://github.com/jane/tool}{Tool}}{CLI in Go that syncs 82 repos.}
\section{Skills}
\cvitem{Stack}{Python, Go, Docker}
\end{document}
`;

const corpusFor = (...texts) => {
  const numbers = new Set();
  let text = '';
  for (const t of texts) {
    for (const n of numberTokens(t, { expand: true })) numbers.add(n);
    text += `\n${t.toLowerCase()}`;
  }
  return { numbers, text, names: 'acme gmbh\nsoftware developer' };
};

describe('cv-verify: parsing', () => {
  it('extracts role / edu / cventry facts', () => {
    const ats = extractTexFacts(ATS).map((f) => f.text);
    assert.ok(ats.some((t) => t.includes('acme gmbh, berlin, de') && t.includes('05/2024 - present')));
    assert.ok(ats.some((t) => t.includes('tu berlin')));
    const main = extractTexFacts(MAIN).map((f) => f.text);
    assert.ok(main.some((t) => t.includes('software developer | acme gmbh')));
  });

  it('extracts bullets with a comparable body for both layouts', () => {
    const ats = extractTexBullets(ATS);
    const main = extractTexBullets(MAIN);
    assert.equal(ats.filter((b) => b.section === 'experience').length, 2);
    const atsProj = ats.find((b) => b.section === 'projects');
    const mainProj = main.find((b) => b.section === 'projects');
    assert.equal(atsProj.body, mainProj.body);
    assert.equal(atsProj.label, 'tool');
  });

  it('reads the headline from both layouts and strips URLs from prose', () => {
    assert.equal(extractHeadline(ATS), extractHeadline(MAIN));
    assert.ok(!texToProse(ATS).includes('https://'));
    assert.ok(texToProse(ATS).includes('github.com/jane/tool'));
  });

  it('newNumbers licenses composites whose parts are known and flags claims', () => {
    const corpus = corpusFor('05/2024 2022 82 repos');
    assert.deepEqual(newNumbers('05/2024 and 82 repos', corpus), []);
    const fresh = newNumbers('served 10,000 users over 5 years', corpus);
    assert.ok(fresh.includes('10,000'));
    assert.ok(fresh.includes('5 years'));
  });
});

describe('cv-verify: tex gate', () => {
  it('passes an unchanged file and an honest rewrite', () => {
    const corpus = corpusFor(ATS, MAIN);
    const same = verifyTexEdit({ before: ATS, after: ATS, corpus, fileName: 'ats.tex' });
    assert.deepEqual(same.hard, []);
    assert.equal(same.changedBullets, 0);

    const honest = ATS.replace(
      'Review REST API contracts for the React front-end.',
      'Design REST API contracts for the React front-end and review PostgreSQL models.',
    );
    const r = verifyTexEdit({ before: ATS, after: honest, corpus, fileName: 'ats.tex' });
    assert.deepEqual(r.hard, []);
    assert.equal(r.changedBullets, 1);
  });

  it('reverts on changed employer, invented number, inflated headline, dropped bullet', () => {
    const corpus = corpusFor(ATS, MAIN);
    const bad = ATS
      .replace('Acme GmbH, Berlin, DE', 'Acme AG, Berlin, DE')
      .replace('Software Developer -- Python, Docker', 'Senior Software Developer -- Python, Docker')
      .replace('  \\item Review REST API contracts for the React front-end.\n', '')
      .replace('shipped through Docker', 'shipped to 40\\% more users through Docker');
    const r = verifyTexEdit({ before: ATS, after: bad, corpus, fileName: 'ats.tex' });
    const joined = r.hard.join('\n');
    assert.match(joined, /role line changed/);
    assert.match(joined, /headline claims a level/);
    assert.match(joined, /Experience bullets dropped from 2 to 1/);
    assert.match(joined, /40%/);
  });

  it('fails on broken LaTeX and wrong section order', () => {
    const corpus = corpusFor(ATS, MAIN);
    const broken = ATS.replace('\\section*{Skills}', '\\section*{Skills');
    assert.match(verifyTexEdit({ before: ATS, after: broken, corpus }).hard.join('\n'), /unbalanced braces/);
    const reordered = ATS
      .replace('\\section*{Education}', '\\section*{TMP}')
      .replace('\\section*{Projects}', '\\section*{Education}')
      .replace('\\section*{TMP}', '\\section*{Projects}');
    assert.match(verifyTexEdit({ before: ATS, after: reordered, corpus }).hard.join('\n'), /section order/);
  });

  it('scrubs filler from changed bullets and reports AI tells softly', () => {
    const corpus = corpusFor(ATS, MAIN);
    const puffed = ATS.replace(
      'Review REST API contracts for the React front-end.',
      'Successfully leveraged robust REST API contracts for the React front-end.',
    );
    const r = verifyTexEdit({ before: ATS, after: puffed, corpus, fileName: 'ats.tex' });
    assert.deepEqual(r.hard, []);
    assert.ok(r.tex.includes('Leveraged REST API contracts for the React front-end.'));
    assert.ok(r.fixes.some((f) => /Successfully/.test(f)));
    assert.ok(r.soft.some((s) => /ai-tell "leveraged"/i.test(s)));
  });

  it('flags inflation on a personal project as hard', () => {
    const corpus = corpusFor(ATS, MAIN);
    const inflated = ATS.replace('CLI in Go that syncs 82 repos.', 'Led a team of engineers on a CLI in Go that syncs 82 repos.');
    const r = verifyTexEdit({ before: ATS, after: inflated, corpus, fileName: 'ats.tex' });
    assert.match(r.hard.join('\n'), /inflation/);
  });

  it('compares main.tex and ats.tex by bullet body', () => {
    assert.deepEqual(compareTexPair(MAIN, ATS), []);
    const drift = MAIN.replace('Review REST API contracts', 'Write REST API contracts');
    const warnings = compareTexPair(drift, ATS);
    assert.equal(warnings.length, 2);
  });
});

describe('cv-verify: markdown + letter gates', () => {
  it('rejects a new employer heading and unsourced numbers in cv.md', () => {
    const before = '# Jane\n\n## Experience\n\n### Software Developer, Acme GmbH (2024–)\n\n- Built the API.\n\n## Education\n\n## Projects\n\n## Skills\n';
    const after = before.replace('### Software Developer, Acme GmbH (2024–)', '### Software Developer, Globex (2024–)').replace('Built the API.', 'Built the API for 3 million users.');
    const corpus = corpusFor(before);
    const r = verifyMarkdownCv({ before, after, corpus });
    assert.match(r.hard.join('\n'), /entry heading not on the original/);
    assert.match(r.hard.join('\n'), /3 million/);
    assert.deepEqual(verifyMarkdownCv({ before, after: before, corpus }).hard, []);
  });

  it('accepts a plain letter and rejects a generated-sounding one', () => {
    const corpus = corpusFor(ATS, MAIN);
    const good = [
      'Application for Software Developer',
      '',
      'Dear Hiring Team,',
      '',
      'I am a software developer at Acme GmbH, where I maintain a FastAPI backend on PostgreSQL that ships through Docker and Jenkins CI/CD. Your posting asks for exactly that stack, so this is a short letter.',
      '',
      'Outside work I wrote a CLI in Go that syncs 82 repos. The code is public and linked on my CV, together with the REST API contracts I review for the React front-end at work.',
      '',
      'I am based in Germany and can start after my notice period. If the role sounds like a match, I would be glad to talk it through on a call.',
      '',
      'Kind regards,',
      '',
      'Jane Doe',
    ].join('\n');
    const ok = verifyLetter({ letter: good, corpus, job: { company: 'Acme GmbH', title: 'Software Developer' } });
    assert.deepEqual(ok.hard, []);

    const bad = 'Dear Team,\n\nI am writing to apply! I bring 7 years of experience and a proven track record at Globex.\n\nBest regards,\nJane\n';
    const r = verifyLetter({ letter: bad, corpus, job: { company: 'Acme GmbH' } });
    const joined = r.hard.join('\n');
    assert.match(joined, /Application for/);
    assert.match(joined, /Kind regards/);
    assert.match(joined, /7 years/);
    assert.match(joined, /exclamation/);
    assert.ok(r.soft.some((s) => /proven track record/.test(s)));
    assert.ok(r.soft.some((s) => /Globex/.test(s)));
  });
});
