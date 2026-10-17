# Aurelle

Aurelle (formerly Chair Log) is a private, offline Progressive Web App for an aesthetic injector to log her own book of business after each
appointment, and to see it two ways:

- **Insights**, for her: what to focus on (rule-based suggestions from the last 90 days), monthly goals, the
  month/YTD review, client loyalty cohorts, the rebook pipeline, busy patterns, and growth and mix trends.
- **Employer value**, for interviews: only the three things clinic directors ask for (active client volume,
  retention and rebook rate, revenue production), each marked as logged, estimated or missing.

Months she didn't log visit by visit can be entered as **monthly totals** (typed in or uploaded as CSV); they show
as estimates.

- **No patient identity is stored.** Clients are de-identified IDs like `CH-01`; input that looks like a name or
  phone number is rejected. There is no notes field.
- **Local unless she signs in.** Without signing in, nothing leaves the device unless she exports it. Signing in
  with Google (optional) syncs the de-identified log, monthly totals, goals and price lists to the project's
  Supabase database, where row-level security limits it to the people she adds. No analytics or other
  third-party requests; fonts and charts are bundled; the Content-Security-Policy allows only that one
  Supabase origin.
- **Works offline** after the first visit, signed in or not; edits made offline sync when the device is back
  online. Installs to the home screen on iOS, Android and desktop.

Live app: https://harjo02-creator.github.io/chair-log/

## Develop

```sh
npm install
npm run dev          # http://localhost:5173/chair-log/
npm test             # unit tests (metrics, validation, CSV, backup, database)
npm run test:e2e     # Playwright: logging flow, offline, accessibility (phone + desktop)
npm run lint
npm run build        # production build with service worker, in dist/
```

Pushing to `main` runs lint and all tests, then deploys `dist/` to GitHub Pages
(`.github/workflows/deploy.yml`). To host somewhere else at the site root, build with `BASE=/ npm run build`.

## Sync setup (one time)

Sync is off in any build without these two settings, and the app stays local-only.

1. **Supabase:** create a project at supabase.com. In the SQL editor, paste and run the contents of
   `supabase/migrations/001_init.sql`, then `002_grants.sql`. From Project Settings > API, copy the Project URL and the anon key.
2. **Google sign-in:** in Google Cloud Console, create an OAuth client (Web application) with the authorized
   redirect URI `https://<project>.supabase.co/auth/v1/callback`. In Supabase, go to Authentication >
   Providers > Google, turn it on, and paste the client ID and secret. Under Authentication > URL
   Configuration, set the Site URL to `https://harjo02-creator.github.io/chair-log/` and add
   `http://localhost:5173/chair-log/` and `http://localhost:4173/chair-log/` as redirect URLs.
3. **GitHub:** under Settings > Secrets and variables > Actions > Variables, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. The next push to `main` builds with sync. For local development, copy
   `.env.example` to `.env.local` and fill in the same two values.
4. **People:** the first person to sign in gets a new shared log. They add the other person's Google email in
   Settings > Sync across devices; that person then signs in and joins the same log.

How it works: each device keeps its full copy in IndexedDB and works offline. `src/sync/engine.ts` pushes
unsynced records and deletions, then pulls what changed on the server. When two devices edit the same record,
the later edit wins; the SQL trigger enforces the same rule on the server.

## Layout

```
src/
  domain/      pure logic, fully unit-tested: types, validation, metrics, summary, csv, backup, pin, visitForm,
               monthRecords, monthly, insights, value
  db/          Dexie (IndexedDB) schema, repository, sample data generator
  app/         App shell, routes, data context, toast, theme
  features/    log, history, insights, value, months, summary (shared charts + report), clients, settings,
               onboarding, lock
  pwa/         install prompt, update prompt, storage persistence, file export
  sync/        sync engine (tested with an in-memory server), Supabase adapter, background controller
supabase/      database schema, access rules and conflict trigger
tests/
  unit/        Vitest
  e2e/         Playwright
  fixtures/    hand-calculated September 2026 month
```

## Decisions beyond the spec

- **Book independence** counts self-sourced + referral; the tile shows both parts.
- **Retention** defaults to the selected month, with a toggle for a rolling window (3, 6 or 12 months in Settings).
- **Added from the suggestions:** quick entry ("Same as last time"), next-free Client ID helper, PIN app lock,
  year-to-date and custom-range summaries with a printable Book of Business page, and a due-for-rebook list.
- **App lock** hides the app behind a PIN (stored only as a PBKDF2 hash). It does not encrypt the database. A
  forgotten PIN can only be cleared by erasing the device's data and restoring a backup.
- **Hash routes** (`#/log`, `#/summary`, …) so the app works on GitHub Pages without server rewrites.
- **Retail add-on** must be a catalog item (also on CSV import), so the field can't carry free text.
- **CSV import** keeps the sheet's ticket gross for single-product rows by backing out the price per unit; rows
  with several products use catalog prices and are flagged.
- The original HTML prototype is kept as `chair-log.html` for reference; it is not part of the build.
