---
name: cv-tailor
description: Tailor a staged CV to a job using candidate evidence, local preferences, and Job Scout's Goose review workflow.
---

Read the repository's [candidate and workflow rules](../../../AGENTS.md).
Use the current Memory snapshot for facts and the supplied master CV for document
structure. Treat the posting as requirements, not candidate evidence.

Use the staged prompt settings, saved Memory preferences and current task. Outside
a staged workflow, read `prompts/local.json` when present. Local prompts control
wording and format, not candidate facts.
See [customization](../../../docs/prompt-customization.md).

Map relevant requirements to supported experience. Edit the specified draft,
preserving employment identities, dates and qualifications. Keep multiple CV
versions factually consistent. Report missing evidence as questions.

Use the candidate's section labels, language, page limit and style preferences.
The supplied template is an example, not a required layout. See
[writing guidance](references/writing-rules.md) for shared principles.

In Job Scout, Goose writes and reviews; the host renders, checks, repairs once
when needed, and promotes accepted documents. Preserve complete drafts on failure.
Report only checks actually performed. Publish to Overleaf through the host's
explicit per-job push option after review; see [Overleaf](references/overleaf.md).

Return changes, supporting evidence, remaining gaps and validation results.
