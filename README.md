# Chair Log

A private, offline Progressive Web App for an aesthetic injector to log her own book of business after each
appointment and turn it into a monthly summary: gross production, average ticket, retention, rebook rate and book
independence.

- **No patient identity is stored.** Clients are de-identified IDs like `CH-01`; input that looks like a name or
  phone number is rejected. There is no notes field.
- **Nothing leaves the device** unless she exports it (CSV, JSON backup, copy). No backend, analytics or
  third-party requests; fonts and charts are bundled; strict Content-Security-Policy.
- **Works offline** after the first visit, and installs to the home screen on iOS, Android and desktop.

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

## Layout

```
src/
  domain/      pure logic, fully unit-tested: types, validation, metrics, summary, csv, backup, pin, visitForm
  db/          Dexie (IndexedDB) schema, repository, sample data generator
  app/         App shell, routes, data context, toast, theme
  features/    log, history, summary, clients, settings, onboarding, lock
  pwa/         install prompt, update prompt, storage persistence, file export
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
