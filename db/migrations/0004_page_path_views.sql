-- NULL means the day predates path collection, not zero page views.
ALTER TABLE site_traffic_daily ADD COLUMN path_views TEXT;
