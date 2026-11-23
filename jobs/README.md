# Jobs

One job family per file. Keep `perform` thin: call a `lib/` helper and raise
(`unwrap`) on failure. Args are small IDs, never secrets or whole records.
Requests never enqueue directly; they write a pending row that a startup
dispatcher enqueues. See docs/recipes/jobs/RECIPE.md.
