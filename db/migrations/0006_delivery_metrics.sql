-- NULL means the delivery metrics were not collected for this day.
ALTER TABLE site_traffic_daily ADD COLUMN delivery_metrics TEXT;
