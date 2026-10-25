#!/usr/bin/env bash
# Nightly logical backup of the Umami PostgreSQL database.
# Install with a cron entry such as:
#   15 2 * * * /opt/curiousbright/deploy/umami/backup.sh >> /var/log/umami-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

BACKUP_DIR="${UMAMI_BACKUP_DIR:-./backups}"
RETENTION_DAYS="${UMAMI_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

docker compose exec -T umami-db \
  pg_dump -U umami -d umami --no-owner --no-privileges --clean --if-exists \
  | gzip -9 > "$BACKUP_DIR/umami-$STAMP.sql.gz"

# Keep a small local window; copy these files to encrypted off-site storage too.
find "$BACKUP_DIR" -type f -name 'umami-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Umami backup written: $BACKUP_DIR/umami-$STAMP.sql.gz"
