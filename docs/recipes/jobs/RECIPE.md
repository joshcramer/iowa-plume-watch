# Jobs recipe contract

Exact inventory/compatibility: recipe.json. Install using INSTALLATION-CONTRACT.md
with CATALOG_RECIPE=jobs. Adds durable background work to the default single-host
template: one shared queue configuration, web-side job registration, and a
separate `worker.tnt` process.

- `lib/jobs_config.tnt`: `configure_jobs()` points `std/jobs` at a SQLite queue
  file (`APP_JOBS_DATABASE_PATH`, default `data/jobs.db`) on the project volume.
- `lib/jobs_startup.tnt` (startup import): configures the queue and registers
  `jobs/` in the web process so startup dispatchers can enqueue by name.
- `worker.tnt`: run with **`ntnt run worker.tnt`**, as a second compose service
  using the same image, data volume and secrets, `read_only`, no ports:

  ```yaml
  worker:
    image: ${APP_IMAGE:-larri-site-template:local}
    command: ["ntnt", "run", "worker.tnt"]
    restart: unless-stopped
    environment: { NTNT_ENV: production, APP_DATABASE_PATH: /app/data/app.db }
    volumes: [app-data:/app/data]
    read_only: true
    tmpfs: ["/tmp:rw,noexec,nosuid,size=16m,uid=10001,gid=10001,mode=1770"]
    security_opt: ["no-new-privileges:true"]
    cap_drop: [ALL]
    networks: [app-net]
  ```
  Add `COPY worker.tnt jobs/ ...` to the Dockerfile and `!worker.tnt`, `!jobs/**`
  to `.dockerignore`; the installer does not edit build files.

## The pattern (verified on official NTNT 0.5.6; applies to 0.5.6+ until a release note says otherwise)

Requests never call `enqueue`. They write a canonical row in a pending state.
A dispatcher registered with `schedule()` from a startup import (web process)
enqueues pending rows by ID and marks them enqueued only when `enqueue` returned
a job-ID string; the worker runs the job; the job's helper re-checks state and
records completion. Reasons:

- `enqueue` inside an HTTP handler with `NTNT_WORKERS>1` returns `()` on
  non-primary interpreters and creates no job. Startup code runs on the primary.
- `ntnt worker <file>` does not fire module-level `schedule()`; `ntnt run` does.
- `perform` returning `Err(...)` is recorded `completed`. Raise (`unwrap`).
- `jobs("dir")` resolves relative to the calling file.

Single host only: a SQLite queue is not shared across machines. For several
hosts use a Valkey 7.2+ store with durable, non-evicting persistence. Job
arguments are small IDs, never secrets or whole records.
