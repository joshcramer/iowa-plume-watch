# Application engineering conventions

This is a native NTNT application. Read README.md and the installed recipe guides before changing behavior. Verify APIs on the project's pinned runtime; do not infer capabilities from a host CLI's version label.

## Structure

- Render public HTML through `lib/layout.tnt.render_page` and `views/layout.html`. Keep the shared header, nav, footer and flash partials; never paste a document shell into each route. A distinct area such as admin may have one documented shared layout of its own.
- Keep route handlers small. Put reusable behavior in named native helpers and presentation in templates/partials. Double braces escape data; raw fragments must be trusted rendered markup, never visitor-controlled HTML.
- Use `public/css/styles.css` and `public/js/site.js` as the external asset entrypoints. No inline styles, inline executable scripts, or `on*` event-handler attributes in application templates. Use semantic classes, accessible controls and JavaScript event listeners. Keep the restrictive CSP; do not add unsafe-inline to avoid organizing code.
- Preserve progressive enhancement, keyboard access, visible focus and reduced-motion behavior. Original/design assets stay outside the public tree; only intentionally public optimized assets belong under `public/`.
- Follow `design/README.md` for revision and lab source locations. Review tooling and routes require deliberate staging activation; noindex is not access control.

## Storage

- SQLite is available by default. Use it for durable application records without waiting for someone to ask for a database. Do not invent JSON-file stores or filesystem substitutes for relational records. Genuine uploads/assets remain files, with database metadata where useful.
- Use `lib/database.tnt` helpers and bound SQL parameters. Each helper owns a finite connection; separate helper calls do not share a transaction. A transactional feature must explicitly own one native handle, commit/rollback and close on every path.
- Add ordered native migrations by appending to `migration_plan()` in `lib/migrations.tnt`. Never modify an already applied migration or run schema changes from request handlers. Preserve existing records and test replay plus failure rollback on disposable databases.
- Keep persistent data in the project-scoped writable volume, outside the public tree and Git. Keep the application filesystem otherwise read-only. PostgreSQL is an explicit relational upgrade; Valkey complements storage rather than replacing durable records.

## Optional capabilities and security

- Install only selected recipes from the pinned `larimonious/larri-site-recipes` catalog. Read their implementation/security contracts and retain provenance receipts and installed guidance. Never copy the unused catalog into the application or fetch executable updates at runtime.
- Authentication/account provisioning is opt-in independently of SQLite. Use native auth/password/session/challenge/TOTP/CSRF primitives; do not implement parallel cryptography or a second auth system. Protect authenticated areas centrally in middleware, with explicit staged-login exceptions and resource-specific checks where needed.
- `routes()` autoloads middleware. Do not explicitly import a top-level `use_middleware` registration twice. Security middleware must fail startup on load/configuration errors, not be silently skipped.
- Credentials belong to the project's established OpenBao/Secrets UI and in-stack renderer, never defaults, source, `.env`, build arguments, URLs or logs. Preserve project isolation and authoritative authorization.

## Verification and release

Run relevant native validation, regression and intent checks; verify nonzero assertions and actual behavior. Test database writes only on disposable stores. Exercise the cold non-root/read-only release artifact with its real data volume before promoting the exact image. Keep a usable prior image and appropriate data backup. Production changes require their existing approval; recipe updates do not grant blanket deployment authority.

## Configuration, work and forms

- Read non-secret settings through `lib/config.tnt` (`required_env`, `optional_env`); do not scatter `get_env` calls. `.env` is loaded only outside production. Declare secrets in `ntnt.toml [secrets.*]` and read them with `std/secrets`.
- Slow or retryable work (email, provider calls, syncs) never runs in a request. The request writes a pending row; a `worker.tnt` process started with `ntnt run` dispatches pending rows with `schedule()` and runs `jobs/` via `work_jobs()`. Jobs raise on failure; returning `Err` is recorded as completed.
- Validate input with a `std/validate` schema at the route boundary. Public write forms save first, notify through a job, and use a self-hosted ALTCHA challenge plus edge rate limits.
- `tests/architecture.tnt` guards structure: keep `server.tnt` composition-only, database access in `lib/`, and modules under 400 lines.
- `/health` is liveness; `/ready` confirms storage. Full guidance: the `ntnt-architecture` skill.
