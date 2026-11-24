# Database and event publishing

The app and worker share **one application SQLite file** (`APP_DATABASE_PATH`, `/app/data/app.db` in Compose). Forecast and source snapshots stay where they are. `official_events` is another table in that same file. NTNT's internal job-queue store is unchanged.

## Local use

Normal `docker compose up --build -d` provisions the local volume, including existing local installs with the original weather schema, and imports any missing events from `seed/official-updates.json`. No credentials or second app database are needed. The local bootstrap only adopts a matching legacy schema with the expected `001_snapshots` marker. A disposable replay file lives in a temporary directory and is not an app store. Unexpected schema drift stops startup; don't delete the volume to make the check pass.

## Hosted adoption and rollout

The default image and hosted Compose files **do not apply migrations on startup**. For the first rollout, pin the release image, confirm the existing data volume and `APP_DATABASE_PATH`, and take a SQLite online backup (or stop all writers and take a consistent backup). Rehearse the exact pinned migration and restore on a separate copy. Do not point the local bootstrap at the hosted database.

1. Use the `db/ntnt.toml` manifest in a one-off operator process. Set the `APP_DATABASE_FILE` connection slot to the existing file, not a new or empty path. Give `APP_REPLAY_FILE` a separate, disposable scratch file through the operator's approved secret provider. Do not commit paths, grants, backup files, or plans.
2. For the legacy hosted schema, run `ntnt db plan --manifest db/ntnt.toml --target hosted --adopt-through 0001 --out baseline-plan.json`. Review the file identity, catalog and legacy check. After approving the exact digest via `APP_MIGRATION_APPROVAL`, run `ntnt db migrate --manifest db/ntnt.toml --target hosted --plan baseline-plan.json`. This records the original schema without replaying its SQL.
3. Generate a **fresh** `ntnt db plan --manifest db/ntnt.toml --target hosted --out events-plan.json`. Review and approve its separate digest, apply it with `ntnt db migrate --manifest db/ntnt.toml --target hosted --plan events-plan.json`, then run `ntnt db verify --manifest db/ntnt.toml --target hosted`. Preserve the original weather and source rows; don't replace the database from the bundled snapshot.
4. Run `ntnt run db/import-events.tnt` against the **same** `APP_DATABASE_PATH`. Verify every imported record and the reviewed schedule against the published log before deploying the app and worker on the same release. Test `/ready`, the map, `/data/official-updates.json` and `/data/official-status.json`. An older image can still read the unchanged forecast tables; don't drop or restore the live database merely to roll back the image. After new DB-only events are published, check that a rollback image would not silently omit them.

## Publish a reviewed event

Add a unique `id`, publication date (`YYYY-MM-DD`), `agency`, `headline`, `summary`, direct `https` source URL and `notable` boolean to the reviewed JSON bundle. Use MM/DD/YY for dates in prose. `notable: true` marks a turning point; `false` remains in **All events**. Leave `status` unset unless an authoritative notice changes the schedule. For `scheduled`, include the announced date and a time only if the source gives one; for `postponed` without a new date or `cancelled`, leave the date and time null. Within a bundle, list same-day entries newest first. Newly imported same-day entries are treated as newer than rows already stored that day.

Run `ntnt run db/import-events.tnt` as an authorized one-off against the selected app file. It reads the bundled JSON by default, or a reviewed JSON bundle named by `APP_EVENT_IMPORT_PATH`. The transaction adds only new IDs; importing the same file again does not duplicate rows, overwrite corrections, or delete history. Existing-entry corrections require a separate reviewed update. Check the live JSON endpoints after publishing. Never add content to an already-applied schema migration.
