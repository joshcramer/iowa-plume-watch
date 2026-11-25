#!/bin/sh
set -eu
report=$(curl --silent --show-error --max-time 10 --fail "${APP_URL:-http://127.0.0.1:8080}/stats")
printf '%s' "$report" | grep -q 'Site traffic'
printf '%s' "$report" | grep -q 'data-traffic-report'
printf '%s' "$report" | grep -q 'Cloudflare'
if [ "${TRAFFIC_EXPECT_PATHS:-0}" = 1 ]; then
  printf '%s' "$report" | grep -q 'Page views by URL'
  printf '%s' "$report" | grep -q '<path class="traffic-plot-line" d="M'
  printf '%s' "$report" | grep -q '<code>/stats</code>'
  printf '%s' "$report" | grep -q 'Daily counts by URL'
fi
if printf '%s' "$report" | grep -Eq '/assets/js/(app\.js|event-timeline\.js|vendor/leaflet\.js)'; then
  printf '%s\n' 'Map scripts must not load on /stats' >&2
  exit 1
fi
