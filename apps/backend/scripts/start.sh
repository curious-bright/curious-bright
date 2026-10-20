#!/usr/bin/env bash
# Deploy/start script: migrate -> ensure_admin -> serve.
# Required env vars: DJANGO_SECRET_KEY, DATABASE_URL (PostgreSQL),
#                    ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
set -euo pipefail
cd "$(dirname "$0")/.."   # always run from apps/backend

python manage.py migrate --noinput
python manage.py ensure_admin

if [ -n "${PORT:-}" ]; then
  exec gunicorn config.wsgi:application --bind 0.0.0.0:"$PORT" --workers "${GUNICORN_WORKERS:-3}" --access-logfile - --error-logfile -
else
  exec python manage.py runserver 0.0.0.0:8000
fi
