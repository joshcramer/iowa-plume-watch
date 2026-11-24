-- Exact catalog of the legacy application database. Adopt it on existing installs;
-- apply it only to an empty database. The old ledger marker keeps rollback safe.
CREATE TABLE schema_migrations (version TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE weather_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), forecast TEXT NOT NULL, extended TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE source_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);
CREATE TABLE job_attempts (name TEXT PRIMARY KEY, attempted_at INTEGER NOT NULL);
INSERT INTO schema_migrations(version) VALUES ('001_snapshots');
