# Iowa Plume Watch

**Independent weather-transport screening for the November 2026 lead-azide detonation planned at the Iowa Army Ammunition Plant near Middletown, Iowa.**

[**Open the live Iowa Plume Watch map**](https://iowaplumewatch.heylarri.com/). This is the project's public site. To run your own copy, see [Run locally](#run-locally).

> **This project is NOT a plume, fallout, lead-exposure, dose, contamination, or public-health safety model.** A modeled wind trajectory cannot establish that an area is contaminated or safe. Check Army/EPA/state guidance and measured environmental monitoring.

## Run locally

Install [Docker Desktop](https://docs.docker.com/get-started/get-docker/) or Docker Engine with the Compose v2 plugin, and make sure Docker is running. Clone the repo or [download and unzip the source](https://github.com/joshcramer/iowa-plume-watch/archive/refs/heads/main.zip). From the folder containing `docker-compose.yml`, run:

```sh
docker compose up --build -d
```

When the app is up, open **[http://127.0.0.1:8080/](http://127.0.0.1:8080/)**. The port is bound to loopback, not your LAN. **No `.env`, API keys, separate database, Node.js, or host NTNT install are required.** Compose builds a shared image with checksum-verified [ntnt 0.6.4](https://github.com/ntntlang/ntnt/releases/tag/v0.6.4) and creates a local SQLite volume. The image is Linux x86-64; on Apple Silicon or another ARM host, Docker needs `linux/amd64` emulation. The first build downloads dependencies, and map tiles come from OpenStreetMap.

- **Just want to view the bundled snapshot?** Start only the web app with `docker compose up --build --wait app` instead. If the worker is already running, use `docker compose stop worker` to stop background updates.
- **Check the install:** Open [`/ready`](http://127.0.0.1:8080/ready) for `{"status":"ready"}`. If it doesn't start, run `docker compose ps` and `docker compose logs --tail=100 app worker`.
- **Port 8080 already taken?** Put `PLUME_PORT=8081` in an optional `.env` in this folder, then rerun the startup command and open `http://127.0.0.1:8081/`. This is a Compose setting, not a secret.
- **Update or stop:** After pulling new code or downloading a new source ZIP, rerun the startup command to rebuild. Use `docker compose down` to stop without deleting data. `docker compose down --volumes` also deletes this copy's saved snapshots and job state; only use it for an intentional reset.

Plain `docker compose` loads `docker-compose.override.yml` for local access. Do not use `compose.heylarri.yml` locally; it connects the hosted copy to its ingress network. Coding agents should also read [AGENTS.md](AGENTS.md).

## Forecast and official status

The map opens on the date in the last reviewed Army notice. While the forecast is active, the date picker also lets you explore today through five days ahead (Central time), where winds are available. Changing the hypothetical date doesn't change the release time or the Army notice. Alternate dates show up to eight hours of local tracks. The 24- and 48-hour regional options remain available for the reviewed date only, where data support them. RRFS runs to 84 hours from model initialization; GFS and ECMWF reach farther, but longer lead times are more uncertain. The map doesn't fill missing winds or extend paths beyond their data.

The worker checks [Open-Meteo availability metadata](https://open-meteo.com/en/docs/model-updates) every 15 minutes around the scheduled scenario (seven days before through two days after, Chicago time). It downloads only newly available model data, with a 10-minute propagation buffer. The separate source-page fingerprint check runs every three hours. Requests serve local data, never call Open-Meteo, and never commit updates back to GitHub.

On a new volume, the application seeds the last verified snapshot from `seed/`. Failed forecast refreshes retain the last good version. Near-range inputs and extended tracks publish together under the same timestamp. Missing providers or levels are shown as unavailable, and truncated paths are not extrapolated. Each model has its own download timestamp. Publication metadata triggers the download but does not prove the exact model run used for every forecast hour. On the third Chicago calendar day after the scenario the worker stops requesting event forecasts and the map labels the data as archival. That is not confirmation that the operation took place.

Reviewed notices live in `seed/official-updates.json` (newest first) and populate the public update log and `/data/official-updates.json`. Larri’s read-only cron checks primary agency sources every two hours and drafts changes for review; it cannot publish. After verifying a notice, add a new entry with a unique `id`, publication date, review timestamp, agency, headline, summary and direct source URL. For a schedule change use `status: "scheduled"` with `scheduled_date` (`YYYY-MM-DD`) and an explicitly announced `scheduled_time`, or `null` if none was announced. For a postponement without a new date or a cancellation, set `status` and leave `scheduled_date` null. Leave `status` unset on non-schedule notices. Deploy the reviewed branch to publish the log entry. The date automatically drives the forecast request window and map labels; older paths are not shown for a new date. This is not an emergency-alert system.

## Tests

Node.js is only needed for the JavaScript tests, not to run the app. Use Node.js 22 as in [CI](.github/workflows/browser-smoke.yml):

```sh
node --test tests/*.test.mjs
```

Run the backend checks using the same image built by the quick start. These commands use disposable containers and never mount the running app's database (POSIX shell syntax):

```sh
docker run --rm --platform linux/amd64 --network none iowa-plume-watch:local ntnt validate .
docker run --rm --platform linux/amd64 --network none -v "$PWD/tests:/app/tests:ro" -e APP_DATABASE_PATH=/tmp/snapshots.db iowa-plume-watch:local ntnt run tests/snapshots.tnt
docker run --rm --platform linux/amd64 --network none -v "$PWD/tests:/app/tests:ro" iowa-plume-watch:local ntnt run tests/forecast-feed.tnt
docker run --rm --platform linux/amd64 --network none -v "$PWD/tests:/app/tests:ro" iowa-plume-watch:local ntnt run tests/updates.tnt
```

For a browser smoke test against a fresh app-only instance, run `npm install --no-save --package-lock=false playwright`, `npx playwright install chromium`, then `PLUME_SEED_SCENARIO=1 node tests/browser-smoke.mjs`. Set `APP_URL` if you chose a different port. The full test commands and build checks are in [CI](.github/workflows/browser-smoke.yml).

## Sources and methodology

See [METHODOLOGY.md](METHODOLOGY.md) for source endpoints, how the weather paths are calculated and what they cannot show. Official updates and monitoring come from the Army, EPA and Iowa state agencies; modeled wind is not a substitute for their guidance or measurements.

The map uses Leaflet and OpenStreetMap Standard tiles. Follow the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) and [Open-Meteo terms](https://open-meteo.com/en/terms), including attribution and non-commercial API limits. Code is MIT-licensed; data and third-party assets have their own terms.
