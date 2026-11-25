CREATE TABLE site_traffic_daily (
    host TEXT NOT NULL,
    utc_day TEXT NOT NULL,
    collected_at INTEGER NOT NULL,
    requests INTEGER NOT NULL CHECK (requests >= 0),
    bytes INTEGER NOT NULL CHECK (bytes >= 0),
    visits INTEGER NOT NULL CHECK (visits >= 0),
    views INTEGER NOT NULL CHECK (views >= 0),
    crawler_views INTEGER NOT NULL CHECK (crawler_views >= 0),
    PRIMARY KEY (host, utc_day)
);
