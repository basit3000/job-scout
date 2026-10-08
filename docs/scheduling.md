# Scheduled discovery and notifications

Open **Discovery** in the workspace navigation, choose one market, a daily local time and an IANA timezone,
then Enable. Pause/resume/remove and last/next status are shown there. Schedules are
stored in ignored `state/discovery.json`. Job Scout must remain running: there is no
OS service or execution while the computer/server is off.

The server checks every 30 seconds. Missed runs coalesce to at most one catch-up
per schedule, then the next future occurrence. A run interrupted by restart is
reported and moved to its next occurrence, never automatically replayed. DST gaps
skip the nonexistent local time; a repeated hour runs once. Searches do not overlap
with the active UI search or preparation. Paid scraping is off unless the schedule's
Allow paid checkbox explicitly authorizes it; the existing token requirement remains.
Identical schedule configurations update the existing schedule. Simultaneously due
schedules for the same market coalesce into one search. Run one Job Scout server;
the scheduler does not coordinate independent server or CLI processes.

In-app notifications cover new meaningful matches, due follow-ups and failed or
interrupted scheduled searches. Existing jobs at first initialization establish a
baseline. Seen job/follow-up keys persist, so unchanged results do not repeatedly
alert. Read notifications remain available (the most recent 500 are retained).

Optional external alerts use an HTTPS JSON webhook. Put its URL in ignored `.env`
as `JOB_SCOUT_NOTIFICATION_WEBHOOK`, restart, and explicitly enable the consent
checkbox in Discovery. Only generic kind/message payloads are sent; no CVs,
candidate facts or employer names. Delivery attempts are recorded before sending;
uncertain deliveries are not retried. Failure disables the integration and creates
an in-app alert. No external alerts are enabled or sent by tests.
