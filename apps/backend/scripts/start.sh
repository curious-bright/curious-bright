#!/usr/bin/env bash
# Deploy/start script: migrate -> ensure_admin -> collectstatic -> gunicorn.
# Required env vars: DJANGO_SECRET_KEY, DATABASE_URL (PostgreSQL),
#                    ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
set -euo pipefail
cd "$(dirname "$0")/.."   # always run from apps/backend

PORT="${PORT:-8000}"

python manage.py migrate --noinput
python manage.py ensure_admin
python manage.py collectstatic --noinput

exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT}" \
  --workers "${GUNICORN_WORKERS:-3}" \
  --access-logfile - \
  --error-logfile -
