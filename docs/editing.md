# Profile imports and document editing

Memory now has structured facts, preferences and saved-answer controls. Add work
and education entries without JSON; use Advanced JSON for uncommon structures.
Both edit the same draft. Preview shows before/after changes; confirmation is
bound to the current revision. The Saved answers tab also previews and confirms.
Unknown answers remain blank. First-run setup remains a structured form.

**Import resume content** accepts readable PDF/DOCX up to 8 MB. Text extraction is
local. It proposes the extracted content in `facts.background.importedResume` and
a contact email when uniquely detected. It does not infer jobs, dates or metrics.
Inspect reading order, uncertain extraction and conflicts; select each proposal to
put it into your draft, then Preview and Confirm. Confirmed source text becomes
candidate evidence; check every claim before saving. Scanned PDFs need separate
OCR. DOCX tables/images may need manual correction. This is separate from Word
formatting-profile import in Prepare.

In a job's preparation results select **Edit document**, choose the document and
format, then Load. Edit Markdown directly or ask Goose for a proposal. Removed
and added lines are displayed; accept or reject the proposal. Preview shows the
selected formatting in a sandboxed frame. **Render and review edited draft**
stages a new version, checks integrity/facts, renders and invokes the existing
Goose reviewer/repair workflow. A stale base cannot be applied. Failure preserves
the accepted version and complete draft; no old passing review applies to edits.
Stop review cancels the worker. No edit publishes to Overleaf.

The editor supports Markdown CVs, imported CV formats and cover letters. The
Current CV format backed by LaTeX uses the existing Overleaf preparation workflow;
it is not converted through a lossy Markdown editor.
