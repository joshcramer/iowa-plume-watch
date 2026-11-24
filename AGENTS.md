# Working on Iowa Plume Watch

## Start locally

Follow [README → Run locally](README.md#run-locally). From the repo root, with Docker Compose v2 running, use `docker compose up --build --wait app` for UI work against a fresh bundled snapshot. Open `http://127.0.0.1:8080/` and check `/ready`. Omit `app` when you need the background worker too. No `.env`, API keys, separate database, or host NTNT installation is needed. The optional `PLUME_PORT` setting changes the local browser port.

Use a local Compose project and its own volume. Never point tests at the hosted SQLite files or use `compose.heylarri.yml` for local work. `docker compose down` preserves data; do not remove volumes unless you intend to reset that copy.

## Where to work

- `server.tnt` checks that SQLite is ready; `routes/` serves the site and JSON. Use `ntnt db` for schema changes. Keep handlers small and do not call upstream feeds during a request.
- `views/`, `public/js/app.js`, and `public/css/styles.css` are the UI entry points. Use the shared layout and partials. Keep templates accessible and preserve the CSP: no inline executable scripts, inline styles, or inline event handlers. Only deliberately public assets belong in `public/`.
- `worker.tnt`, `jobs/`, and `lib/` handle background refreshes. Read the [jobs recipe](docs/recipes/jobs/RECIPE.md) before changing dispatch. A failed job must raise so the queue retries it; returning `Err` is not enough.
- `seed/` supplies bundled forecast and reviewed event data for local installs. The app and worker read events from the shared application SQLite database. Keep reviewed notices separate from modeled wind paths. Read [METHODOLOGY.md](METHODOLOGY.md) before changing map interpretation or copy.

## Add an event to the timeline

Verify the source, then follow [Database and event publishing](db/README.md). The checked-in event bundle is a reviewed import source, not the live reader. A backfilled entry keeps its original publication date. Dates in public headlines and summaries use MM/DD/YY.

## Verify changes

- Use the checksum-pinned NTNT runtime in `Dockerfile`, not an arbitrary host binary. See [README → Tests](README.md#tests) for the exact local commands and [.github/workflows/browser-smoke.yml](.github/workflows/browser-smoke.yml) for CI.
- Use disposable test data. Keep durable state in SQLite, use bound SQL parameters, and append SQL migrations through `ntnt db` in `db/migrations/`; never edit an already-applied migration. Keep runtime data and secrets out of Git and the public tree.
- For UI changes, run the browser smoke test at desktop and phone widths. `/health` confirms liveness; `/ready` confirms storage. Verify a cold image before release; local verification is not permission to deploy.
