#!/usr/bin/env bash
# Deploy/start script: migrate -> ensure_admin (optional) -> collectstatic -> gunicorn.
# Required env vars: DJANGO_SECRET_KEY, DATABASE_URL (PostgreSQL)
# Optional env vars: ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
#   (bootstrap a superuser on first deploy; if unset, create one manually
#    with: python manage.py createsuperuser)
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

exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT}" \
  --workers "${GUNICORN_WORKERS:-3}" \
  --access-logfile - \
  --error-logfile -
