# Connect Job Scout to Job Tracker

Restart Job Scout after updating, open **Tracker → Connect Job Tracker**, and enter
the HTTPS origin of your Job Tracker deployment (no path or trailing query).

1. Choose **Start pairing**. Open the approval link and sign in to Job Tracker.
2. Inspect the displayed code and approve that device. Grant notes, contact fields
   or salary only if you want them available in both directions.
3. Return to Job Scout and choose **I approved the code — finish pairing**.
4. Choose **Sync now** to send changed applications without selecting individual
   jobs. New records marked Applied, Interviewing, Offer, Accepted, Rejected or
   Closed are included; already linked records continue syncing after status changes.
5. Enable **Automatic sync**, choose 1, 5 or 15 minutes and save the settings.
   The timer runs in the local server while Job Scout is running, including when
   the browser page is closed. It cannot run while the computer is asleep or off.

For immediate uploads, enable **Sync when marked Applied** and save the settings.
When you mark an application Applied in Job Scout, it sends that application in
the background if the tracker is connected. This works independently of the timer
and does nothing when disconnected. Existing Applied records are not bulk-uploaded
by enabling this option; use Sync now for those. Saving notes on an already Applied
record does not trigger it. Conflicts still wait for review, and network errors
never undo the local save. Interrupted sends remain available for Sync now or the
timer to retry. The event sends to the online tracker even if timer sync is set to
Both ways; it does not import unrelated records.

The default direction is **Job Scout to online tracker**. **Both ways** also
imports online-only applications and online changes to linked records. Only
changes since the previous sync are transferred. Competing edits and possible
duplicates wait for review; the timer does not guess which version or identity
to keep. Imported changes are checkpointed and do not echo back as new uploads.

Pairing alone leaves both automatic options off. **Sync now** works without enabling the timer.
The dashboard shows waiting applications, linked records, recent per-record
status, last successful sync, next check and actionable errors. Offline changes
remain local and are picked up at the next check. Revocation stops automatic sync;
reconnecting requires enabling it again. Pausing the timer does not cancel a
transfer already in progress.

Automatic and one-click sync share only core application fields and status
history. Optional notes, contacts and salary remain in **Advanced transfers and
recovery**, together with selected-record import/export, identity linking and
snapshot recovery. Those advanced actions still use preview and confirmation.
A timer run skips records in an unexpired manual preview. Each cycle queues at
most 100 changed records; remaining changes are picked up on subsequent checks.
Manual previews expire after 15 minutes.

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
send local values or import cloud values. A successful reviewed resolution clears
the earlier issue for that application. Other records continue syncing normally.
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

The interface and timer follow the incremental sync and visible-conflict patterns
documented by [Joplin](https://joplinapp.org/help/dev/spec/sync/) and its
[open-source repository](https://github.com/laurent22/joplin). Job Scout retains
both sides of a conflict until the user explicitly chooses a version.

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
