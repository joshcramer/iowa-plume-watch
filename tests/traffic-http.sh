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
if [ "${TRAFFIC_EXPECT_AUDIENCE:-0}" = 1 ]; then
  printf '%s' "$report" | grep -q 'Geography and devices'
  printf '%s' "$report" | grep -q 'United States'
  printf '%s' "$report" | grep -q 'Mobile'
  printf '%s' "$report" | grep -q 'traffic-audience-grid'
fi
if [ "${TRAFFIC_EXPECT_DELIVERY:-0}" = 1 ]; then
  printf '%s' "$report" | grep -q 'Cache and server performance'
  printf '%s' "$report" | grep -q 'Cache hits'
  printf '%s' "$report" | grep -q 'Server responses'
  printf '%s' "$report" | grep -q 'HTTP 5xx'
  printf '%s' "$report" | grep -q 'Server p95'
  printf '%s' "$report" | grep -q 'traffic-delivery-grid'
fi
if [ "${TRAFFIC_EXPECT_INSIGHTS:-0}" = 1 ]; then
  for label in 'Top entry pages' 'Priority route health' 'Largest transfers' 'Browser families' 'Known crawlers' 'traffic-insight-evidence'; do
    printf '%s' "$report" | grep -q "$label" || { printf 'Missing stats insight: %s\n' "$label" >&2; exit 1; }
  done
fi
if printf '%s' "$report" | grep -Eq '/assets/js/(app\.js|event-timeline\.js|vendor/leaflet\.js|.*beacon)|cloudflareinsights\.com/beacon'; then
  printf '%s\n' 'Map scripts must not load on /stats' >&2
  exit 1
fi
