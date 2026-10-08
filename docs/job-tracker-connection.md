# Connect Job Scout to Job Tracker

Restart Job Scout after updating, open **Tracker → Connect Job Tracker**, and enter
the HTTPS origin of your Job Tracker deployment (no path or trailing query).

1. Choose **Start pairing**. Open the approval link and sign in to Job Tracker.
2. Inspect the displayed code and approve that device. Grant notes, contact fields
   or salary only if you want them available in both directions.
3. Return to Job Scout and choose **I approved the code — finish pairing**.
4. Select local applications and optional fields, then **Preview sending selected**.
   Review the before/after values and confirm the transfer.
5. **Download cloud changes** refreshes the local preview cache. Select cloud
   records, preview their import and confirm to apply them to your local tracker.

Transfers are manual. Pairing and downloading do not enroll every local application
in automatic synchronization. An import never sends a new local mutation back to
the server. Subsequent edits require another selection, preview and confirmation.
At most 100 records can be selected in one preview, which expires after 15 minutes.

**Link existing applications** maps one selected cloud record to one selected
local record without changing either record's fields. Use this for duplicates
that already exist on both sides. Identity is never inferred from titles, company
names or URLs. Importing an unmapped online record creates a new local manual ID
and explicitly records its mapping with the cloud API.

Only application fields are shared. The adapter reads the local decision store;
it does not read candidate Memory, saved answers, CVs, letters, attachments, prep
files, secrets, search settings or the fetched job archive. Importing preserves
local-only fields and attachments and does not invoke Sheets, Goose, email or
application submission. Optional fields need both a pairing grant and selection
for the specific transfer. Unknown application dates remain unknown.

The online tracker has shorter limits for several fields. Validation errors name
the field; nothing is silently truncated. Remote notes over 10,000 characters also
need editing or an import with Notes unselected to fit the local tracker.
Status history has persistent source IDs. If old local events were rewritten or
reordered, review the history and uncheck **Include new local status history** to
send current fields only. This does not rewrite or discard your original history.

## Conflicts and interrupted transfers

The connection page shows rejected transfers and competing versions. Download
current cloud changes, compare both versions in a new preview, then explicitly
send local values or import cloud values. Dismiss the old issue after review.
Mappings and deleted cloud versions are retained. Deleted cloud applications
cannot be revived by sending a local record. Importing a deletion marks the local
record and clears follow-up; it keeps the local record and all documents.

Confirmed outgoing writes are saved before sending and retry with the same
mutation ID. Use **Retry confirmed transfers** after a network interruption.
Imports use a durable recovery journal and a marker written atomically with each
local record. Resume an interrupted import, or cancel its remaining work and make
a fresh preview. Already completed records and mappings remain intact. If a local
edit happened in the meantime, recovery refuses to overwrite it.

**Reload cloud snapshot** recovers an expired feed cursor without deleting pending
work or mappings. Revoked credentials require pairing again. Previously queued
writes become review issues on reconnection instead of being sent automatically.
Reconnect to the same account; old mappings remain protected if the account differs.

Installation identity, credentials, selected previews, queue, history ledger,
cloud cache and recovery journal are stored only in ignored
`state/private/tracker.json`. Never publish this file. One tracker origin is pinned
to this state file. If moving services, stop the app, preserve the entire private
state securely, then move it out of the active path before pairing the new service.
Do not delete this state to fix ordinary network errors. A crashed process can
leave `tracker.json.lock`: verify no process is using this connection before
removing that specific lock file. Use one running Job Scout server per workspace.

## Local development

For a Python tracker running directly on `127.0.0.1:5000`, set
`ALLOW_INSECURE_LOCAL_API=true` in the tracker and
`ALLOW_INSECURE_LOCAL_TRACKER=true` in Job Scout, then restart both. Use
`http://127.0.0.1:5000` as the service URL. The development exception allows numeric
loopback only; `http://localhost`, remote HTTP and redirects are refused. Production
uses HTTPS. Job Scout's loopback/Host/Origin/JSON boundary stays unchanged; no CORS
settings, inbound ports or tunnels are required.

## Verification

```text
node --test scripts/lib/cloud-tracker.test.mjs
node --test scripts/ui/cloud-tracker.test.mjs
npm test
npm run privacy
```

In a neighboring Job Tracker checkout, run its
`tests/test_job_scout_adapter.py` with pytest. Set `JOB_SCOUT_ROOT` if this repository
is elsewhere. The test uses migrated temporary storage and a disposable fictional
account, approves browser pairing, simulates lost acknowledgments, exercises
conflicts/imports/mappings/deletions and verifies revocation. It never connects your
real account. Live HTTPS deployment and PostgreSQL operation remain deployment
checks; the automated adapter integration test uses loopback HTTP and SQLite.
