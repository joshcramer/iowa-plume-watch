# Iowa Plume Watch

**Independent weather-transport screening for the November 2026 lead-azide detonation planned at the Iowa Army Ammunition Plant near Middletown, Iowa.**

> **This project is NOT a plume, fallout, lead-exposure, dose, contamination, or public-health safety model.** A modeled wind trajectory cannot establish that an area is contaminated or safe. Check Army/EPA/state guidance and measured environmental monitoring.

## View and deploy

Live site after GitHub Pages is enabled: **https://joshcramer.github.io/iowa-plume-watch/**

The initial package includes the **Nov. 23 static reference images** and a forecast placeholder. Its live forecast lines will appear **only after GitHub Actions successfully downloads and validates numerical weather-model data**. Do not interpret missing forecast lines as a favorable forecast.

### Publish from your `joshcramer/iowa-plume-watch` repository

1. Add this project's files to the root of the repository's `main` branch and push. Do not nest them under another `iowa-plume-watch` folder.
2. On GitHub, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Go to **Actions → Update forecast and publish Pages → Run workflow**; the workflow also runs on every push to `main` and every three hours via cron. Make sure repository Actions are enabled.
4. If the automatic data commit reports `403`, go to **Settings → Actions → General → Workflow permissions** and permit read and write permissions, subject to your repository's policy; then rerun. The workflow requests `contents: write`, `pages: write`, and `id-token: write`.
5. Verify **Actions** logs and the site's “Forecast updated” timestamp. Until a provider succeeds, the page explicitly says the live forecast is pending.

GitHub Pages URL: **https://joshcramer.github.io/iowa-plume-watch/**. Custom domain is optional. No API keys or paid server are required for initial non-commercial usage; review provider licences before commercial use.

> GitHub Actions cron runs are best effort, may be delayed, and are not emergency-alert infrastructure. This scheduled workflow refreshes forecast inputs approximately every three hours. The browser checks for published forecast and source-watch changes every five minutes while open, and again when a tab becomes visible; this is not second-by-second streaming or a guaranteed emergency-alert service.

## Local development

Requires Python 3.12+ and Node 22+ for tests (runtime website is plain HTML/JS).

```bash
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python scripts/build_forecast.py  # downloads real forecasts: network required
python scripts/watch_official_sources.py
python -m http.server 8000
```

Open http://localhost:8000. Opening `index.html` directly as a `file://` URL cannot load JSON because of browser origin restrictions.

## Sources and reliability

| Information | Primary source | What it actually measures |
|---|---|---|
| NOAA GFS modeled winds | [Open-Meteo GFS & RRFS API](https://open-meteo.com/en/docs/gfs-api) | Forecast wind speed/direction |
| NOAA RRFS (optional) | [Open-Meteo GFS & RRFS API](https://open-meteo.com/en/docs/gfs-api) | Regional forecast wind fields, if exposed by the current provider API |
| ECMWF IFS 0.25° open-data | [Open-Meteo ECMWF API](https://open-meteo.com/en/docs/ecmwf-api) | Independent forecast winds at surface and pressure levels |
| Planned detonation schedule and maps | [U.S. Army installation advisories](https://www.army.mil/asc#org-iowa-army-ammunition-plant) | Official announcements and official *modeled* plume information |
| Environmental response and sampling | [EPA Region 7](https://response.epa.gov/site/site_profile.aspx?site_id=17211) | Official reports; not assumed to include results until published |
| Public-health guidance | [Iowa HHS](https://hhs.iowa.gov/health-prevention/environmental-health/lead-exposure-surveillance) | Recommendations and updates |
| Emergency management | [Iowa HSEM](https://homelandsecurity.iowa.gov/iowa-army-munitions-disposition-resources) | State response notices |

As of the November 22 official Army statement, the operation was scheduled for **Wednesday, November 25, 2026**, with no exact time announced ([Army source](https://www.army.mil/article/296990)). The page stores this independently **manual** editorial fact in `data/official-status.json`; it is intentionally **not automatically reclassified** by wind forecasts or HTML page changes.

Automated `scripts/watch_official_sources.py` checks a few official pages for changes in visible text. It only reports *unreviewed changes* and last-checked times. Website layout/template changes can trigger it, and lack of a change does not mean no development occurred. Status changes, all-clears, confirmed contamination, and agency advisories require a human to review and update `data/official-status.json` with a source.

## Model architecture

See [METHODOLOGY.md](METHODOLOGY.md) for details and failure modes.

- **Collector:** `scripts/build_forecast.py` requests a 9×9 grid of forecast-point time series around Middletown, in batches of nine coordinates, from the provider-specific APIs. It requests forecast valid times November 25–26 in America/Chicago. NOAA has 10 m, 80 m, 925 hPa and 850 hPa levels; ECMWF IFS 0.25° offers 10 m, 925 hPa and 850 hPa (no assumed 80 m ECMWF field).
- **Data store:** `data/forecast.json` retains model IDs, individual source sample positions, hourly wind speed/direction, model name, retrieval timestamp and errors for unavailable providers. A model must validate before publication. If *all* requests fail, the previous snapshot remains, with an explicit age/stale warning.
- **Browser:** `assets/js/trajectory.js` calculates *u,v* wind vectors, bilinear spatial interpolation, linear temporal interpolation, and 15-minute midpoint/RK2 forward trajectories at fixed nominal wind levels. Browser computes paths dynamically for release times at 9 a.m., noon or 3 p.m., and up to eight hours of movement.
- **Display:** `assets/js/app.js` draws trajectories with Leaflet. A modeled line is the path of a point of air, not a plume footprint. The route polyline is approximate, not a navigable road trace. Geometric proximity to the route is **not** a probability or safety estimate.
- **Archives:** `assets/images/nov23-*.png` are previously generated, explicitly labeled **non-live** graphics and include illustration assumptions. They are not updated by Actions.
- **Publish:** `.github/workflows/update-and-deploy.yml` runs tests, downloads weather data, checks for unreviewed official-source page changes, commits updated JSON, then deploys GitHub Pages. The workflow stops requesting event forecasts after November 26; it retains the last good forecast as an archival snapshot, not an observed history.

**Known limitations:** no vertical transport, explosion/plume rise, particle-size distribution, dispersion, deposition, dose, wet scavenging, terrain-enhanced flow, observational assimilation, chemical source strength, or probabilistic uncertainty. Spatial sampling is much coarser than native NOAA/ECMWF grids, and the run time of the underlying forecast cycle is not verified by the collector (timestamp means time downloaded). See full methodology.

## Maintenance after November 26

This is an event-specific page. When the event is completed or canceled, update `data/official-status.json` from a confirmed official source. The collector intentionally preserves the forecast snapshot after the event rather than portraying future weather as relevant to a past event. Disable or reduce the cron schedule if ongoing page-change checks are no longer useful.

## License & attribution

Code is MIT licensed (see [LICENSE](LICENSE)); source data and external imagery remain subject to their respective providers' terms. The Leaflet map uses key-free OpenStreetMap Standard tiles, with attribution. Open-Meteo, NOAA and ECMWF are not affiliated with or endorsing the project. See [Open-Meteo licence and terms](https://open-meteo.com/en/terms).

## Map basemap: no API key

Leaflet uses the public OpenStreetMap Standard raster tiles at `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, **not CARTO**. No basemap API key is needed. CSS darkens only map tiles to preserve the site's theme; forecast lines retain their original colors.

OpenStreetMap tiles are donation-funded and best-effort, not an unlimited production CDN. Follow the [OSM Foundation tile usage policy](https://operations.osmfoundation.org/policies/tiles/): preserve visible attribution and browser referrers, honor browser caching, and do not prefetch or bulk-download tiles. If traffic grows materially, move to a licensed tile provider or self-host tiles. Map tiles and weather-model data are independent services.

### Forecast path rendering

The forecast trajectory lines are drawn as an HTML SVG overlay above the Leaflet map, using Leaflet solely to project geographic coordinates to screen pixels. This avoids Leaflet Canvas stacking and platform-specific renderer issues; the overlay redraws on map pan, zoom, resizing, and forecast selection. The SVG contains only air-parcel centerlines, **not** a hazardous plume footprint, concentration field, or deposition prediction.

The map's SVG also draws the approximate Cedar Rapids airport–Davenport route, plant marker, airport and destination labels, plus a geographic reference grid. They remain visible even if public OSM raster tiles fail to load. Only the map illustration is resilient; missing tiles do not say anything about actual contamination.

### Time markers and interactive timeline

The map labels elapsed time after a **hypothetical, instantaneous release**. Small dots mark each forecast hour; legible labels mark +2h, +4h, +6h, etc. A collision-avoidance pass may hide labels that overlap, but it retains their dots. The scrubber highlights the portion of each fixed-level air-parcel trajectory reached by its selected elapsed time, with a CST wall-clock label computed from the selected hypothetical detonation time. The playback control advances 15 modeled minutes at each step. Faded segments show what the model predicts *later*, not a smoke front, a spreading plume, or a measured environmental hazard. Trajectories stop when wind data are unavailable.
