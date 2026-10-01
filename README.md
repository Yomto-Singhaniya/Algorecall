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

## Import and export

The Question bank can import and export a JSON array. Each item includes the
revision-sheet columns (`Question Name`, `Date Solved`, `+3 Days`, `+7 Days`,
`+15 Days`, `+30 Days`, `+60 Days`, `+120 Days`, `Status`, and `Due Today?`)
plus topic, difficulty, URL, notes, record ID, and revision completion metadata
so postponed dates and completed stages survive a round trip. Dropping a JSON
export onto the app imports it as well.

All question data remains in this browser's IndexedDB database. Clearing site
storage removes the local question bank, so export a backup before doing so.
