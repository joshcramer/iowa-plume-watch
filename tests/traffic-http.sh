#!/bin/sh
set -eu
report=$(curl --silent --show-error --max-time 10 --fail "${APP_URL:-http://127.0.0.1:8080}/stats")
printf '%s' "$report" | grep -q 'Site traffic'
printf '%s' "$report" | grep -q 'data-traffic-report'
printf '%s' "$report" | grep -q 'Cloudflare'
