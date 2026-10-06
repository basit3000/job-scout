# Interview preparation and email drafts

In preparation results choose **Interview / email** and select the reviewed CV
format. Interview preparation reads the posting, one confirmed Memory snapshot,
and text extracted from the selected current reviewed CV. Goose proposes likely
questions, knowledge gaps and employer questions. Experience examples cite Memory
paths and display the exact supported quotation alongside a suggested preparation
question; they are not invented STAR stories. Deterministic fit gaps also appear.
Saved preparation lives in that format's local preparation pack. Changed facts,
posting or documents require regeneration; stale/unreviewed PDFs are blocked.

Load an application email draft and optionally attach the reviewed letter. Recipient
starts blank. Edit recipient, subject and body, then **Preview selected versions**.
Inspect attachment hashes and check the review box. Any edit clears that approval.
**Export .eml** downloads an unsent MIME draft containing the selected PDF bytes.
Freshness and passing reviews are checked again at export. Nothing is sent.

Optional Gmail integration uses the official
[draft creation endpoint](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create).
Configure a user-authorized OAuth access token with `gmail.compose` scope in ignored
`.env` as `JOB_SCOUT_GMAIL_ACCESS_TOKEN`, then restart. Job Scout does not implement
OAuth registration or refresh; replace expired tokens through your configured OAuth
client. **Create Gmail draft** is a separate explicit action after preview/review.
No send endpoint exists. An uncertain creation attempt is retained and cannot be
automatically retried for the same draft version. Inspect Gmail Drafts first.

Tests use injected HTTP mocks and fictional attachments. No live Gmail, interview
model run or real application is exercised during automated validation.
