# Using the workspace

The workspace navigation lists every main page. On desktop it stays beside the
content; on smaller screens it becomes a page grid with a floating **Pages** button
to return to it. Browser Back and Forward restore the selected page, and page
links such as `/#discovery` open directly.

| Page | What to do there |
| --- | --- |
| Find jobs | Search, filter and shortlist opportunities. |
| New matches | Review new results and create selected CVs. |
| Ready to apply | Review prepared documents and open application tools. |
| Tracker | Manage saved applications, stages, contacts and follow-ups. |
| Discovery | Schedule searches, review notifications and find related roles. |
| Memory | Edit profile and experience, writing preferences or application answers; preview and confirm changes. |
| Saved answers | Review reusable form answers and confirm updates. |
| Job sources | Choose and save boards for future searches. |
| Tools | Find ATS checks, resume import, document tools and connections. |

In Memory, edit the structured fields and choose **Save changes** in the sticky
action bar. A review dialog shows the current and proposed values; choose
**Confirm and save** to apply them, or **Back to editing** to keep working.
The bar shows whether edits are unsaved. **Discard edits** restores the saved
version after confirmation. Resume import and advanced JSON controls are below
the main fields. A failed save retains the draft for a fresh review and retry.

**Online tracker** is available in the header, navigation and Tools. It opens the
connection dashboard with one-click sync, optional timed checks and immediate
sync when marking an application Applied. Selected-record transfers and recovery
are under Advanced. See [connection setup](job-tracker-connection.md).

Job lists have matching controls above and below the results: numbered pages,
Previous/Next, items per page and a page jump. Switching workspace pages preserves
unsaved Memory, answer and source drafts within the current browser session.
Save changes before reloading or leaving the app.

The interface and settings load independently of the job archive. Archive parsing
and ranking run on a separate worker so they cannot block navigation or static
assets. Find jobs and New matches return only the requested page (10 by default,
50 maximum), and inspect document folders only for those jobs. Opening a posting
loads its full description separately. Exact fit sorting still indexes the archive
in the background; Ready checks prepared candidates to retain accurate freshness
and counts. Page results reuse document checks until the index expires or changes.

## Design references and verification

The navigation and overview were informed by these official product guides:

- [Teal dashboard guide](https://help.tealhq.com/en/articles/9524944-exploring-the-dashboard): a visible application overview and stage controls.
- [Huntr Job Tracker help](https://help.huntr.co/en/collections/10297189-job-tracker): recognizable destinations for jobs, activities, contacts and documents.
- [Careerflow Job Tracker](https://www.careerflow.ai/job-tracker): keeping job-search information accessible in one workspace.

Run `npm run test:workspace` for fictional-data browser coverage of all nine pages,
navigation history, keyboard controls, pagination, draft retention, save
confirmation, empty states and the connection entry point. The test captures
1440px desktop, 390px mobile and 768px tablet layouts, including dark mode, under
ignored `.workspace/ux-audit/`. It mocks API requests and blocks external traffic.
