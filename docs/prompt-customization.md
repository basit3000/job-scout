# Prompt customization

Keep your instructions in `prompts/local.json`. It is gitignored and blocked by the
privacy check, even if force-added. `prompts/example.json` is a neutral starting
point for other users. Setup creates the local copy only if it is missing. Existing
installations can copy the example manually; do not overwrite their local file.

Candidate facts and confirmed answers still belong in **Memory**. The local prompt
file configures writing and validation; it does not confirm experience, skills,
dates, numbers, titles or application answers. Master CVs remain documents.

## Settings

All fields are optional. Omitted fields use the built-in defaults below. The
example is documentation and a setup template, not a second runtime config.

| Group | Fields | Behavior |
| --- | --- | --- |
| `instructions` | `all`, `cv`, `letter`, `review`, `repair`, `coordinator` | Short free-text preferences. `all` applies to document workers and the coordinator; each worker also receives its relevant scope. Review and repair receive the relevant CV/letter preferences too. |
| `format` | `sectionOrder` | Empty by default: preserve the source labels and layout. A list requires those section labels in that order. |
| `format` | `cvMaxPages`, `letterMaxPages` | Maximum page counts, 1 by default, configurable from 1 to 10. Complete PDFs must fit; content is never cropped. |
| `format` | `letterSubjectPrefix`, `letterSignoff` | Empty by default: no mandatory wording. Set these to enforce your preferred subject prefix or closing. |
| `format` | `dropOptionalSections` | False by default. Allows automatic removal of supported optional CV sections or less relevant letter paragraphs while fitting. Final review still applies. |
| `style` | `filler`, `discouragedPhrases`, `weakOpeners` | Empty lists by default. Supplied words and phrases produce advisory findings. |
| `style` | `scrubFiller` | False by default. Enables automatic removal of explicitly listed filler. Memory's `allowFillerWhenUseful` exception prevents this cleanup. |
| `style` | `avoidDashes` | False by default. Requests dash avoidance and enables cover-letter punctuation cleanup. |
| `style` | `maxBulletChars`, `maxHeadlineChars`, `minLetterWords`, `maxLetterWords`, `maxSentenceWords` | Advisory targets. Zero disables a target. |

For example, a local file can contain only:

```json
{
  "instructions": { "cv": "Use a short profile paragraph when it adds relevant context." },
  "format": { "sectionOrder": ["Education", "Experience", "Skills"], "cvMaxPages": 2 }
}
```

Invalid keys, types or limits produce an error instead of silently ignoring the
configuration. Each document workflow takes one consistent settings snapshot.
Changes apply to later runs and invalidate the affected preparation cache.

## Instructions and checks

For writing style, the current task takes precedence over saved Memory preferences,
then local prompt wording, then shared guidance. Explicit `format` settings are
host validation requirements; edit them when changing the required layout or page
limit. Keep free-text instructions consistent with these settings.

Per-job headline, supported keyword, functional title and work-city choices remain
opt-in Memory features. Experience selection still requires a complete archived
bullet library. Generation does not update Memory or invent evidence.

The shared writer, reviewer and repair prompts state the task, evidence source,
outputs and validation boundaries. They do not prescribe four section names, a
particular seniority, a language background, a universal sign-off or word bans.
Factual checks, placeholder detection, final PDF validation and review still run.
Application filling leaves unsupported answers blank, including years of skill
experience; seniority is not evidence of a number of years.

The separate ATS button checks an uploaded PDF without these preferences, Memory
or Goose. Generated Overleaf PDF checks compare plain section headings with their
source. Neither check treats a specific section order as an ATS requirement.

The Markdown renderer preserves source section labels, order and content,
including optional summaries and custom sections such as publications.

Customization does not make the renderer a general template engine. Overleaf mode
still uses `main.tex` and `ats.tex`, and structural checks recognize the supported
LaTeX macros and Markdown headings. Inspect the rendered result after template
changes. Preserve confirmed facts and keep personal rules out of tracked skills.
