# Working on Iowa Plume Watch

## Start locally

Follow [README → Run locally](README.md#run-locally). From the repo root, with Docker Compose v2 running, use `docker compose up --build --wait app` for UI work against a fresh bundled snapshot. Open `http://127.0.0.1:8080/` and check `/ready`. Omit `app` when you need the background worker too. No `.env`, API keys, separate database, or host NTNT installation is needed. The optional `PLUME_PORT` setting changes the local browser port.

Use a local Compose project and its own volume. Never point tests at the hosted SQLite files or use `compose.heylarri.yml` for local work. `docker compose down` preserves data; do not remove volumes unless you intend to reset that copy.

## Where to work

- `server.tnt` registers routes and initializes SQLite; `routes/` serves the site and JSON. Keep handlers small and do not call upstream feeds during a request.
- `views/`, `public/js/app.js`, and `public/css/styles.css` are the UI entry points. Use the shared layout and partials. Keep templates accessible and preserve the CSP: no inline executable scripts, inline styles, or inline event handlers. Only deliberately public assets belong in `public/`.
- `worker.tnt`, `jobs/`, and `lib/` handle background refreshes. Read the [jobs recipe](docs/recipes/jobs/RECIPE.md) before changing dispatch. A failed job must raise so the queue retries it; returning `Err` is not enough.
- `seed/` provides initial local data. `seed/official-updates.json` is a human-reviewed log, not an automatic result of the source watcher. Keep structured dates in ISO format and dates in public-facing headline and summary copy in MM/DD/YY. Preserve the distinction between reviewed notices and modeled wind paths. Read [METHODOLOGY.md](METHODOLOGY.md) before changing map interpretation or copy.

## Add an event to the timeline

Add one entry to `seed/official-updates.json` with a unique `id`, the source's `published_date` (`YYYY-MM-DD`), `agency`, `headline`, `summary`, and a direct `source_url`. Keep the file newest first, including the best-supported order within a day. The site displays the six newest entries for the current view, then reveals older ones in groups of six. A backfilled entry belongs on its original publication date, not the date it was added to the log.

Set `notable: true` for a turning point (for example, a schedule announcement, a change of plans, a court decision, or a public statement that changes what is known). Use `notable: false` for supporting developments that belong only in **All events**. This flag never changes the schedule. Set `status` or change schedule fields only for a reviewed notice that actually changes the authoritative schedule. Verify the source and publish the log edit separately from automated checks; those checks never add public entries.

## Verify changes

- Use the checksum-pinned NTNT runtime in `Dockerfile`, not an arbitrary host binary. See [README → Tests](README.md#tests) for the exact local commands and [.github/workflows/browser-smoke.yml](.github/workflows/browser-smoke.yml) for CI.
- Use disposable test data. Keep durable state in SQLite, use bound SQL parameters, and append migrations through `lib/migrations.tnt`; never edit an already-applied migration. Keep runtime data and secrets out of Git and the public tree.
- For UI changes, run the browser smoke test at desktop and phone widths. `/health` confirms liveness; `/ready` confirms storage. Verify a cold image before release; local verification is not permission to deploy.
