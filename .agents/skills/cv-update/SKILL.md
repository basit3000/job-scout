---
name: cv-update
description: Refresh a staged master CV from new verified or candidate-confirmed evidence, producing a proposed update and change report. Use after new work, projects, qualifications, or factual corrections.
---

## Job Scout candidate memory

Follow the candidate-information rules in [AGENTS.md](../../../AGENTS.md).
Use the supplied memory snapshot for an active run; otherwise read
`state/memory.json`. If it is missing, complete setup or the one-time migration
before candidate work. Use `prompts/local.json` for local wording and format preferences; candidate facts stay in Memory.

Refresh the master CV for the candidate's general target roles. Use the supplied master snapshot, current evidence, newly gathered evidence, and candidate constraints. If the task is only to tailor a document to one posting, route it to the existing tailoring workflow instead.

Compare new evidence with what the master already states. Propose additions, corrections, or stronger wording that the sources support. Identify each proposal's source, evidence ID, confidence, and affected entry. Repository activity can support technical implementation claims; it cannot by itself establish employment dates, commercial impact, team leadership, or measured outcomes.

Keep missing facts as questions. Distinguish externally verified facts from candidate-confirmed facts and inferences. Do not promote an inference to fact or treat previously generated CV copy, reviewer advice, or agent memory as new evidence.

Write a change plan and draft only to the supplied staging location. Keep the current master intact during drafting. Preserve identity, employment, education, dates, and unrelated material unless the sources explicitly support the requested correction. When two LaTeX versions are supplied, update both with the same facts.

If rendering and validation tools are available, use them and inspect their actual results. Otherwise mark the draft `validation_pending`. A new role or corrected degree may require a master-update validator with an explicit supported-change list; do not weaken a tailoring validator globally to make the draft pass.

Return the proposed diff, supporting sources, remaining questions, and actual check results. Apply a validated master update only within the caller's authorization. Check that the master has not changed since the snapshot and retain a private backup. Job Scout detects changed master inputs and marks dependent packs outdated. The agent does not publish or push merely because it produced a draft.
