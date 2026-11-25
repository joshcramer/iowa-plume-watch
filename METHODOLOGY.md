# Technical methodology and limitations

## Scientific scope

The site keeps EPA monitoring results and **independent horizontal wind transport** in separate map tabs. Wind paths are idealized parcel trajectories, not a validated plume or lead-deposition model. They do not depict exposure, contamination, probability, plume width or lead mass.

A true hazard assessment requires independently verified source-term parameters and an appropriate 3-D dispersion/deposition model such as HYSPLIT driven by complete meteorological fields and evaluated against air/soil measurements. This project does **not** run HYSPLIT; reference: [NOAA READY](https://www.ready.noaa.gov/HYSPLIT_traj.php).

## EPA air monitoring

The sampling tab reads the public Xact feature layer used by the [EPA Region 7 dashboard](https://experience.arcgis.com/experience/1ddcf8b9d8314971b00dac8893ae9cd6). It displays the newest published reading per station from the 120 most recent records, using the source's measurement time (shown in Central time) and preserving reported precision. A reported zero is shown as zero; missing values or unrecognized units are not converted to zero. The source does not attach a validation flag to these records. It may update or revise values. On a failed refresh, any previous readings keep their original measurement times.

The map marks readings at or above the dashboard’s **32 µg/m³ short-term screening level (DOE PAC-1)** in red. That comparison is not a safety, regulatory, or individual exposure determination. A lower reading is not an all-clear. The source provides points, not a measured boundary; the map does not interpolate concentrations, characterize areas between stations, or combine air readings with soil or laboratory samples.

The optional monitoring-locations overlay uses the EPA dashboard’s separate location layer. It contains station IDs and instrument types, not measurements. The optional 5-, 10-, and 20-mile rings are distances from the detonation-site marker, not contamination contours, sampling coverage, or advisory zones.

## Forecast data

The collector requests valid hourly forecast times for Nov. 25–26, 2026 in the America/Chicago time zone from weather models surfaced through Open-Meteo. Each model is a separate source; the site does not merge different model winds into one trajectory. It samples **81 forecast points on a 9×9 latitude/longitude grid** around Middletown, and retains those point forecasts and their reported valid times in JSON. It does not claim these are the native numerical model grid nodes.

| Model | Endpoint | Requested levels |
|---|---|---|
| NOAA GFS | `https://api.open-meteo.com/v1/gfs?models=ncep_gfs_global...` | 10 m, 80 m, 925 hPa, 850 hPa |
| NOAA RRFS CONUS, if supported | `https://api.open-meteo.com/v1/gfs?models=ncep_rrfs_conus...` | 10 m, 80 m, 925 hPa, 850 hPa |
| ECMWF IFS 0.25° | `https://api.open-meteo.com/v1/ecmwf?models=ecmwf_ifs025...` | 10 m, 925 hPa, 850 hPa |

Pressure is NOT height. Atmospheric 925 and 850 hPa pressure surfaces vary in elevation with weather, and are often roughly 0.8 km and 1.5 km above mean sea level, respectively. Ground at the plant is already elevated above sea level. A trajectory fixed at 850 hPa is not the 3-D trajectory of a plume that starts on the ground and rises through the atmosphere.

`fetched_at_utc` records *download time*, not an independently validated model-run initialization time. Valid-times reported by the API are preserved in each point's time array. Open-Meteo availability metadata triggers a refresh only for the model that has a newly published run. The metadata is a scheduling signal, not an attestation of the input run for each hour. Unchanged models retain their own timestamps and matched tracks. The last confirmed snapshot is retained on the deployment’s data volume; runtime refreshes are not Git commits.

## Wind vectors and motion

Meteorological direction θ indicates *where wind comes from* (clockwise degrees from true north). Speed S has units km/h. Convert to horizontal transport components:

\[
u=-S\sin(\theta),\qquad v=-S\cos(\theta)
\]

Here u is the eastward and v the northward speed. Perform **bilinear** geographic interpolation in the sampled point rectangle, and **linear time** interpolation of wind components (not angles, which wrap around 360°). The integrator uses the midpoint/RK2 formula with a 0.25-hour step:

\[
\mathbf{x}_{n+1}=\mathbf{x}_{n}+\Delta t\,\mathbf{V}\left(\mathbf{x}_n + \frac{\Delta t}{2}\mathbf{V}(\mathbf{x}_n,t_n),\ t_n+\frac{\Delta t}{2}\right)
\]

The point is advanced on a local tangent-plane approximation: one degree latitude ~111.195 km, one degree longitude ~111.195 km × cos(latitude). This is a small-region approximation; users must not extrapolate it globally. Integration stops when winds leave the sampled grid or forecast-time span.

The wind tab opens at about **9:00 a.m. CST on 11/25/26**, the approximate detonation time [reported by KWQC](https://www.kwqc.com/2026/11/25/what-know-about-us-armys-lead-azide-detonation-how-watch/). Other start times can be selected as hypothetical scenarios. Starting the model at the reported hour does not turn the paths into observations.

## Wind model spread on the map

The shaded band compares the available **10 m wind tracks** for one hypothetical start date and time. It connects the model positions at successive 15-minute steps, up to eight hours or the first missing step among the contributing paths. At least two models with differing tracks are required. The colored lines still show the selected model’s paths at the selected wind levels. The 24- and 48-hour views do not extend the band beyond the local comparison window.

This is a comparison of deterministic forecasts, not a calibrated hurricane-style confidence interval. Shading does not imply any concentration, deposition, or chance of exposure, and areas outside the shading are not necessarily safe.

## How updates and statuses work

A separate NTNT worker attempts updates every three hours. The website serves its local snapshot without waiting on upstream providers. **Failed model calls are omitted**; if all calls fail the site continues showing the previous snapshot, marked stale when its downloaded age exceeds nine hours. This is a forecast *refresh interval*, not real-time sensing or guaranteed update frequency.

Government web pages are checked for *changed visible text*, a heuristic that can be fooled by page layout changes or by substantive updates embedded in PDF files or images. Changes must be **manually reviewed**; the source watcher never declares an all-clear or reports measured contamination. The event schedule comes from reviewed notices in the application SQLite database and must be changed with a direct authoritative link.

## Critical unknowns

- **Release term:** the actual quantity, particle-size distribution and distribution of lead species by size, initial temperature/velocity, blast height, and control/containment effectiveness.
- **Vertical evolution:** unknown initial plume rise, buoyancy, shear and mixed-layer interaction, downward motion and turbulence.
- **Deposition:** gravitational settling, wet scavenging, impaction, resuspension and environmental retention have not been modeled.
- **Meteorological uncertainty:** coarse point-grid interpolation, deterministic models, cycle-to-cycle drift and missing mesoscale features.
- **Observational validation:** EPA air measurements are displayed separately and are not used to fit or validate the wind trajectories.
- **Official map updates:** the forecast model is not a substitute for the Army's updated dispersion/deposition maps released closer to the event.

The presence or absence of a modeled wind path near a location cannot prove exposure or safety. Always consult official agencies and post-event measurements for action decisions.

## Reproducibility

Review the native worker and collectors under `jobs/` and `lib/`, client map code in `public/js/`, and the tests referenced in the README. The browser requests map tiles, the public EPA layer from ArcGIS, and same-origin forecast and status JSON.

## Regional trajectories: 24 and 48 hours

The short-range sample grid covers only the Iowa region and November 25–26. The regional module `lib/forecast_feed.tnt` and `lib/forecast_tracks.tnt` separately queries Open-Meteo's model-specific GFS and ECMWF APIs over November 25–27, on a 2°×2° lattice roughly spanning 27–51° N and 105–69° W. It integrates constant-level air-parcel paths in 15-minute steps and uses a local-grid vector when available; after that it uses bilinear spatial interpolation and hourly temporal interpolation of **u/v** wind components over the coarse regional lattice. The coarse grid is used only during the scheduled refresh, and is not shipped with the website. Output tracks include their provenance, timestamps, incomplete-path reasons and exact last modeled hour. The browser requires matching near/extended forecast snapshot timestamps, rather than combining unrelated collection cycles. A 48-hour calculation is *not* validation of source-term release height, lead particle transport, dispersion or health impact, and cannot establish contamination or safety. RRFS's shorter forecast horizon and the limited near-site domain are honored with path truncation rather than extrapolation.
