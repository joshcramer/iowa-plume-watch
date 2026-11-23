# Iowa Plume Watch

**Independent weather-transport screening for the November 2026 lead-azide detonation planned at the Iowa Army Ammunition Plant near Middletown, Iowa.**

[**Open the live Iowa Plume Watch map**](https://iowaplumewatch.heylarri.com/). This is the project's public site. To run your own copy, see [Run locally](#run-locally).

> **This project is NOT a plume, fallout, lead-exposure, dose, contamination, or public-health safety model.** A modeled wind trajectory cannot establish that an area is contaminated or safe. Check Army/EPA/state guidance and measured environmental monitoring.

## Run locally

```sh
docker compose build
docker compose up -d
```

The web service and worker use the same checksum-pinned NTNT image, with a named SQLite volume. No API keys are required. The worker checks [Open-Meteo availability metadata](https://open-meteo.com/en/docs/model-updates) every 15 minutes around the scheduled scenario (seven days before through two days after, Chicago time). It downloads only newly available model data, with a 10-minute propagation buffer. The separate source-page fingerprint check runs every three hours. Requests serve local data, never call Open-Meteo, and never commit updates back to GitHub.

Use `docker compose exec app curl -fsS http://localhost:8080/ready` to check storage. To access the site from a local browser, add a development Compose override binding the app port to `127.0.0.1` only. The `compose.heylarri.yml` overlay is for the hosted site and isn't needed locally.

## Forecast and official status

On a new volume, the application seeds the last verified snapshot from `seed/`. Failed forecast refreshes retain the last good version. Near-range inputs and extended tracks publish together under the same timestamp. Missing providers or levels are shown as unavailable, and truncated paths are not extrapolated. Each model has its own download timestamp. Publication metadata triggers the download but does not prove the exact model run used for every forecast hour. On the third Chicago calendar day after the scenario the worker stops requesting event forecasts and the map labels the data as archival. That is not confirmation that the operation took place.

Reviewed notices live in `seed/official-updates.json` (newest first) and populate the public update log and `/data/official-updates.json`. Larri’s read-only cron checks primary agency sources every two hours and drafts changes for review; it cannot publish. After verifying a notice, add a new entry with a unique `id`, publication date, review timestamp, agency, headline, summary and direct source URL. For a schedule change use `status: "scheduled"` with `scheduled_date` (`YYYY-MM-DD`) and an explicitly announced `scheduled_time`, or `null` if none was announced. For a postponement without a new date or a cancellation, set `status` and leave `scheduled_date` null. Leave `status` unset on non-schedule notices. Deploy the reviewed branch to publish the log entry. The date automatically drives the forecast request window and map labels; older paths are not shown for a new date. This is not an emergency-alert system.

## Tests

```sh
ntnt validate .
ntnt run tests/forecast-feed.tnt
ntnt run tests/snapshots.tnt
ntnt run tests/updates.tnt
node --test tests/*.test.mjs
```

The SQLite regression requires `APP_DATABASE_PATH` to identify a fresh file in a disposable directory. Run these checks with NTNT 0.6.4. Run `APP_URL=http://127.0.0.1:8080 node tests/browser-smoke.mjs` with Chromium and Playwright installed and a running app.

## Sources and methodology

See [METHODOLOGY.md](METHODOLOGY.md) for source endpoints, how the weather paths are calculated and what they cannot show. Official updates and monitoring come from the Army, EPA and Iowa state agencies; modeled wind is not a substitute for their guidance or measurements.

The map uses Leaflet and OpenStreetMap Standard tiles. Follow the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) and [Open-Meteo terms](https://open-meteo.com/en/terms), including attribution and non-commercial API limits. Code is MIT-licensed; data and third-party assets have their own terms.
