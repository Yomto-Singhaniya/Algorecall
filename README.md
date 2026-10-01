# AlgoRecall

AlgoRecall is a local-first DSA spaced-repetition tracker. It schedules reviews for
3, 7, 15, 30, 60, and 120 days after a problem is solved and stores the question
bank in IndexedDB on the current device.

## Run locally

1. Install Node.js 18.17 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the local URL printed by Next.js.
4. Use `npm run typecheck` and `npm run lint` to validate changes; `npm run build`
   creates the production build.

Browser notifications require permission and a secure origin (localhost qualifies).
The app requests permission only after the user selects **Reminders** and checks for
due work when opened and periodically while it remains open; no remote push service
or account is involved.

## Practice history, streaks, and email

Practice history can be backfilled or edited by date; adding a solved question for a
past date also creates its normal revision plan from that solve date. A streak freeze
can repair one recent missed day when available. Streak trophies, practice logs,
settings, and questions are stored in IndexedDB on this device. AlgoAnalyst uses
transparent local schedule-based heuristics rather than a remote AI model.

Email digests are sent only when requested from the open app. Scheduled delivery
while the app is closed would require account-backed server storage, which this
local-first app does not use. To enable on-demand sending, configure these server
environment variables:

```env
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=AlgoRecall <verified-sender@example.com>
ALLOWED_REMINDER_EMAIL=you@example.com
```

The configured recipient is allow-listed by the API. The question list is sent to
Resend only after you enable email digests and choose **Send digest**. A reminder
time is saved as a preference, but does not schedule background delivery.

## Import and export

The Question bank imports legacy JSON arrays and exports a versioned full backup.
The backup includes the revision-sheet columns (`Question Name`, `Date Solved`,
`+3 Days`, `+7 Days`, `+15 Days`, `+30 Days`, `+60 Days`, `+120 Days`, `Status`,
and `Due Today?`), question metadata, practice logs, streak trophies, and settings.
Revision completion and postponed dates survive a round trip. Dropping a JSON
backup onto the app imports it as well.

Question and practice data remains in this browser's IndexedDB database. Clearing
site storage removes the local tracker, so export a backup before doing so. Email
digests send only the due-question details required to deliver the message.
