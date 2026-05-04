# Ritual Flow

Ritual Flow is a lightweight browser app for recurring rituals, daily checklists, and short-horizon planning. It runs as a static site and stores data locally by default, with optional Google Drive sync for signed-in users.

## What The App Does

- Tracks recurring rituals by weekday
- Lets individual ritual items either inherit ritual days or use their own weekday schedule
- Lets users check off ritual items for the current day
- Separates recurring rituals from one-off plans
- Supports CSV import/export for ritual definitions
  `item_days` is optional on import and included on export for item-level schedules.
- Persists data locally in the browser
- Optionally syncs app data to the signed-in user's Google Drive `appDataFolder`
  Daily progress syncs automatically, while ritual and plan changes are backed up manually with `Sync now`.

## File Layout

- [index.html](/home/parul/code/scheduling/index.html)
  Defines the app shell and all UI regions.
- [styles.css](/home/parul/code/scheduling/styles.css)
  Styling, layout, and responsive behavior.
- [app-core.js](/home/parul/code/scheduling/app-core.js)
  Pure helper logic that is safe to test without the DOM.
- [app-sync.js](/home/parul/code/scheduling/app-sync.js)
  Low-level Google Identity Services and Drive API integration.
- [app-google-sync-ui.js](/home/parul/code/scheduling/app-google-sync-ui.js)
  UI-facing sync controller that bridges app state, Google auth, and Drive updates.
- [app.js](/home/parul/code/scheduling/app.js)
  Main application behavior for screens, rituals, plans, local persistence, and rendering.
- [tests/test_app_core.py](/home/parul/code/scheduling/tests/test_app_core.py)
  Tests for pure state and CSV helpers.

## State Boundaries

The app intentionally splits persistence into two layers:

- Syncable state:
  `rituals`, `plans`, `completions`, `todayView`, `plansView`, `themePreference`, and `screen`
- Device-local state:
  `expandedRitualIds`, `isFormOpen`, `draftItems`, `draftDays`, and `lastViewedDate`

This split keeps cross-device sync focused on actual user data while avoiding noisy UI-only state from bouncing between devices.

Drive sync is also intentionally split:

- Structure sync:
  `rituals`, `plans`, and view preferences are backed up manually through `Sync now`
- Progress sync:
  `completions` sync automatically when a Google session is active

## Sync Architecture

There are three layers involved in sync:

1. `app.js`
   Owns the app state, local persistence, and render cycle.
2. `app-google-sync-ui.js`
   Owns sign-in state, sync status messaging, manual structure backup flow, automatic progress sync, and button behavior.
3. `app-sync.js`
   Owns Google OAuth token handling and Drive file reads/writes.

That separation is intentional:

- UI changes should mostly live in `app.js`
- Google/Drive API changes should mostly live in `app-sync.js`
- Sync workflow changes should mostly live in `app-google-sync-ui.js`

Signed-in sessions still do an initial Drive check for daily progress on restore, but ritual and plan backups remain user-initiated through `Sync now`.

## Development

Run the app locally from a web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Testing

Install dev dependencies in the repo virtualenv if needed:

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
```

Run tests:

```bash
.venv/bin/python -m pytest -q
```

Optional syntax checks:

```bash
node --check app.js
node --check app-sync.js
node --check app-google-sync-ui.js
```

## Google Drive Setup Notes

- The Google OAuth client ID is intentionally public and compiled into the frontend build.
- The app uses `drive.appdata`, which stores data in the user's hidden app-data area rather than broad Drive access.
- The authorized JavaScript origin for GitHub Pages should be:
  `https://guptaparul08.github.io`
  not the full `/scheduling/` path.

## Deployment Notes

Local scripts are loaded with version query params in `index.html` so GitHub Pages clients pick up new JS files more reliably after deploys. If behavior ever looks stale after a push, hard-refresh the page.
