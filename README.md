# Iowa Plume Watch

**Independent weather-transport screening for the November 2026 lead-azide detonation planned at the Iowa Army Ammunition Plant near Middletown, Iowa.**

> **This project is NOT a plume, fallout, lead-exposure, dose, contamination, or public-health safety model.** A modeled wind trajectory cannot establish that an area is contaminated or safe. Check Army/EPA/state guidance and measured environmental monitoring.

## Run locally

```sh
docker compose build
docker compose up -d
```

The web service and worker use the same checksum-pinned NTNT image, with a named SQLite volume. No API keys are required. The worker fetches public weather data and checks source pages at three-hour intervals. Requests serve local data, never call Open-Meteo, and never commit updates back to GitHub.

Use `docker compose exec app curl -fsS http://localhost:8080/ready` to check storage. To access the site from a local browser, add a development Compose override binding the app port to `127.0.0.1` only. The `compose.heylarri.yml` overlay connects the preview app to the existing host ingress without publishing a port.

## Forecast and official status

On a new volume, the application seeds the last verified snapshot from `seed/`. Failed forecast refreshes retain the last good version. Near-range inputs and extended tracks publish together under the same timestamp. Missing providers or levels are shown as unavailable, and truncated paths are not extrapolated. A timestamp tells you when data were fetched, not when a weather model ran. After Nov. 27 CST the worker stops requesting event forecasts and the map labels the data as archival. That is not confirmation that the operation took place.

Official status is maintained separately in `seed/official-status.json`. Change it only after reviewing a direct official source and release a new image. The automated source watch only detects changes in page text; it does not classify advisories or declare an all-clear. It is not an emergency-alert system.

## Tests

```sh
ntnt validate .
ntnt run tests/forecast-feed.tnt
ntnt run tests/snapshots.tnt
node --test tests/*.test.mjs
```

The SQLite regression requires `APP_DATABASE_PATH` to identify a fresh file in a disposable directory. Run these checks with NTNT 0.6.4. Run `APP_URL=http://127.0.0.1:8080 node tests/browser-smoke.mjs` with Chromium and Playwright installed and a running app.

## Sources and methodology

See [METHODOLOGY.md](METHODOLOGY.md) for source endpoints, how the weather paths are calculated and what they cannot show. Official updates and monitoring come from the Army, EPA and Iowa state agencies; modeled wind is not a substitute for their guidance or measurements.

The map uses Leaflet and OpenStreetMap Standard tiles. Follow the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) and [Open-Meteo terms](https://open-meteo.com/en/terms), including attribution and non-commercial API limits. Code is MIT-licensed; data and third-party assets have their own terms.
