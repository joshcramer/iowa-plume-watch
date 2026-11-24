#!/bin/sh
# Host-side release job. Cloudflare credentials never enter either container.
set -eu
umask 077
STATE=${PLUME_TRAFFIC_STATE:-"$HOME/.local/state/iowa-plume-watch-stats"}
cd -- "$(dirname -- "$0")/.."
export PLUME_TRAFFIC_CREDENTIALS=${PLUME_TRAFFIC_CREDENTIALS:-"$HOME/.config/cloudflare/heylarri_credentials"}
export NTNT_MAX_RESPONSE_SIZE=262144
# Never pipe a failed, partial provider result to the importer.
batch=$("$STATE/ntnt" run ops/collect-traffic.tnt)
printf '%s\n' "$batch" | docker exec -i iowa-plume-watch-preview-worker-1 ntnt run db/import-traffic.tnt
