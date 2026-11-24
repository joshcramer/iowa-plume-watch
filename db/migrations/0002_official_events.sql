CREATE TABLE official_events (
    id TEXT PRIMARY KEY NOT NULL,
    published_date TEXT NOT NULL,
    reviewed_at_utc TEXT,
    agency TEXT NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    source_url TEXT NOT NULL,
    status TEXT,
    scheduled_date TEXT,
    scheduled_time TEXT,
    notable INTEGER NOT NULL CHECK (notable IN (0, 1)),
    editorial_order INTEGER NOT NULL
);

CREATE INDEX official_events_order_idx ON official_events(published_date DESC, editorial_order, id);
