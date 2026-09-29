# CV and resume formats

Open a job's **Prepare** dialog and select **Prepare CV**. The **CV / resume
formats** selector is available to every user, independently of personal CV
options in Memory. Choose one format or up to six formats for separate results.
When several formats are available, no choice is preselected. Batch Prep has the
same selector.

**Current CV format** uses the configured local or Overleaf source. Use **Add a
Word template** to upload a `.docx` (up to 8 MB), name the format, set a page limit,
and extract its formatting. The preview uses fictional sample content. Inspect it
before generating documents. Each result goes through Goose writing, factual
validation, rendering, review and repair. Previously accepted versions survive
failed replacements. Generation stops if a selected version needs attention.

Imports extract page dimensions, margins, font, type sizes, color, heading case,
rules, paragraph spacing, bullet indents and recognized section order. The host
applies these rules to HTML/PDF outputs. Complex tables become a single reading
column; floating objects and pictures are not reproduced. This is a formatting
profile, not a pixel-identical Word document or a DOCX output template. Fonts must
be installed locally; otherwise the browser uses Arial. Imported formats keep
their typography when a draft overflows rather than silently shrinking it.

The original file and `formatting-rules.md` are retained in ignored
`cv/templates/<id>/`. Formatting configuration is stored in ignored
`prompts/local.json` under `templates`. No sample names, dates, qualifications or
claims are copied into candidate Memory. You can edit the formatting profile in
that file; measurements are validated before use. Existing prompt settings are
preserved when importing.

Each format has an independent pack under `.workspace/prep/<job>/templates/<id>/`
and an independent subfolder in the job's downloads directory. Current CV format
keeps its existing paths. Results show a link for each selected version. The
first selected successful format is the job's primary CV for subsequent letter
generation and application attachments. All selected versions remain available
for manual download. A request to push to Overleaf applies only to **Current CV
format**, which must be selected explicitly.

`GET /api/cv-templates` lists profiles. `POST /api/cv-templates` accepts `name`,
`filename`, `base64` and optional `maxPages`. `POST /api/prep` and
`POST /api/prep/batch` accept `templateIds`, an array of one to six IDs. Omitting
this field is accepted only when Current CV format is the sole choice. Artifact
URLs use `?template=<id>` to address a particular version.
