# Local access, identity and application reliability

The HTTP server binds to `127.0.0.1`. Host must be localhost/loopback with the
server's port, Origin must exactly match the app, browser cross-origin requests
are rejected, and mutations require JSON. This covers personal reads, streams,
downloads and mutations. Local CLI clients can use JSON requests without Origin.
Do not reverse-proxy this private app onto a public network.

Copy pack / the embedded bookmarklet explicitly transfers that selected pack to
the page where you invoke it. There is no wildcard-CORS candidate API. Delete a
saved bookmarklet when no longer needed: it contains the selected candidate data.

Vacancy URLs retain unknown and identifying query parameters; only known tracking
parameters are removed. Native source IDs and employer requisitions take priority.
Locations and requisitions distinguish otherwise identical titles. Cross-board
merges require matching employer/title/location plus a common requisition or
substantial identical description. Provenance and merged IDs are retained; an
existing archive ID wins. Existing archive rows are not consolidated on upgrade,
so no migration is required. Previously lost distinctions cannot be reconstructed
without original sources or a private backup.

## Application support matrix

| Portal | Implemented | Browser fixture | Live dry run | Submission verified |
| --- | --- | --- | --- | --- |
| LinkedIn Easy Apply | Steps, native controls, uploads, login pause, explicit submission | Passed | No | No |
| Greenhouse | Steps, native controls, uploads, manual submit | Passed | No | No |
| Lever | Steps, native controls, uploads, manual submit | Passed | No | No |
| Ashby | Steps, native controls, uploads, manual submit | Passed | No | No |
| Other detected hosts | Existing copy pack / bookmarklet assistance | Field mapping tests only | No | No |

These are representative offline form contracts, not copies of every live portal.
Custom required controls pause for manual attention. Host recognition is not proof
of functioning portal support. All four adapters are experimental and live-unverified.

Fill starts a dry run. Use **Dry run / resume** after login or manual corrections
in the same window; **Stop fill** prevents subsequent actions. Unknown required
answers remain blank. Review the form and selected documents, check the review
box, then explicitly select **Submit LinkedIn application** if desired. Other
boards remain on-screen for manual submission. No credentials are stored in source;
the browser profile and durable sessions remain in ignored local directories.

The host persists `submitting` before the click. Missing positive confirmation,
click errors and restart during submission produce `submission_unknown` and block
automatic retry. Inspect the portal manually; Job Scout never clears that lock or
resubmits automatically. Restart during filling pauses; it does not resume clicks.
Freshness and document bytes are checked before advancing and before submitting.
Resuming with changed documents or answers opens a fresh form; unchanged runs keep
manual corrections in the existing browser window. Concurrent aliases of the same
vacancy URL cannot both run.
Existing `state/auto-apply.json` ledgers and tracker application states are read as
duplicate-submission guards only. They are not rewritten or used as candidate
evidence. A historical submission attempt stays guarded even if its final state
was recorded as failed.

## Repeatable authorized live validation

1. Run `node --test scripts/lib/application-*.test.mjs` offline first.
2. Obtain explicit authorization for a named posting URL and a dry run. Use a
   test employer sandbox where available; filling/uploads may transmit data.
3. Supply a configured browser login, confirmed Memory answers, and a current
   passing CV/letter in the selected format. Start Fill in dry-run mode.
4. Inspect each step: required text/select/radio controls, uploads, login pause,
   unsupported questions, cancellation and resume. Verify no submit was clicked.
5. Record portal, date, URL privately and redact personal data from bug reports.
6. Submission verification is separate and requires explicit per-application
   authorization. Inspect positive confirmation and ensure a second attempt is blocked.

Missing for all live checks: authorized posting URLs, authorized logged-in sessions,
selected current reviewed documents, and (for submission) per-application consent.
