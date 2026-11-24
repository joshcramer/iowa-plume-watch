#!/bin/sh
# Only used by local Compose and disposable tests. Hosted releases use
# separately reviewed exact-plan approvals and never call this script.
set -eu
umask 077
if [ "${1:-}" != local ]; then
  printf '%s\n' 'Usage: sh db/local-init.sh local' >&2
  exit 2
fi
case "${APP_DATABASE_PATH-/app/data/app.db}" in
  ''|:memory:) exit 2 ;;
esac
APP_DATABASE_FILE=$(realpath -m "${APP_DATABASE_PATH-/app/data/app.db}")
work=$(mktemp -d /tmp/plume-migration.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
APP_REPLAY_FILE="$work/replay.db"
export APP_DATABASE_FILE APP_REPLAY_FILE NTNT_SECRETS_PROVIDER=env NTNT_ENV=development
mkdir -p -- "$(dirname -- "$APP_DATABASE_FILE")"
if [ ! -e "$APP_DATABASE_FILE" ]; then touch "$APP_DATABASE_FILE"; fi
touch "$APP_REPLAY_FILE"
apply_local() {
  digest=$(PLUME_DB_REPORT="$1" PLUME_DB_FIELD=digest ntnt run db/report-value.tnt)
  APP_MIGRATION_APPROVAL="$digest" ntnt db migrate --manifest db/ntnt.toml --target local --plan "$1"
}
if ! ntnt db plan --manifest db/ntnt.toml --target local --out "$work/apply.json" --json > "$work/report.json"; then
  code=$(PLUME_DB_REPORT="$work/report.json" PLUME_DB_FIELD=diagnostic ntnt run db/report-value.tnt)
  if [ "$code" != DB_UNRECOGNIZED_HISTORY ]; then
    cat "$work/report.json" >&2
    exit 1
  fi
  ntnt db plan --manifest db/ntnt.toml --target local --adopt-through 0001 --out "$work/baseline.json"
  apply_local "$work/baseline.json"
  ntnt db plan --manifest db/ntnt.toml --target local --out "$work/after-adoption.json"
  apply_local "$work/after-adoption.json"
else
  apply_local "$work/apply.json"
fi
if ! ntnt db verify --manifest db/ntnt.toml --target local --json > "$work/verify.json"; then
  cat "$work/verify.json" >&2
  exit 1
fi
ntnt run db/import-events.tnt
