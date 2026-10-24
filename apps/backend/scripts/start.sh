#!/usr/bin/env bash
# Deploy/start script: migrate -> ensure_admin (optional) -> collectstatic -> ASGI server.
# Required env vars: DJANGO_SECRET_KEY, DATABASE_URL (PostgreSQL)
# Optional env vars: ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
#   (bootstrap a superuser on first deploy; if unset, create one manually
#    with: python manage.py createsuperuser)
# Optional env vars: REDIS_URL (required for >1 worker / cross-worker WebSockets)
set -euo pipefail
cd "$(dirname "$0")/.."   # always run from apps/backend

PORT="${PORT:-8000}"

python manage.py migrate --noinput
if [ -n "${ADMIN_USERNAME:-}" ] && [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  python manage.py ensure_admin
else
  echo "ADMIN_* not set — skipping admin bootstrap (create one with: python manage.py createsuperuser)"
fi
python manage.py collectstatic --noinput

if [ -n "${REDIS_URL:-}" ]; then
  WORKERS="${WEB_CONCURRENCY:-3}"
else
  WORKERS=1
  echo "REDIS_URL not set — running a single worker with the in-memory channel layer."
fi

exec uvicorn config.asgi:application \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers "${WORKERS}" \
  --proxy-headers \
  --forwarded-allow-ips="*" \
  --access-log \
  --log-config config/logging.json
