#!/usr/bin/env bash
# Restore a backup created by backup.sh. Stop Umami writes first.
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 path/to/umami-YYYYMMDDTHHMMSSZ.sql.gz" >&2
  exit 2
fi

cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

gzip -dc "$1" | docker compose exec -T umami-db \
  psql -U umami -d umami --set ON_ERROR_STOP=1
echo "Restore complete. Restart the Umami container and verify the dashboard."
