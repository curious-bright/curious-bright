# Curious Bright — Django API (apps/backend)
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies
COPY apps/backend/requirements.txt ./apps/backend/requirements.txt
RUN pip install --no-cache-dir -r apps/backend/requirements.txt

# Application code
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend

# Static files are collected at runtime by scripts/start.sh (needs SECRET_KEY);
# migrate + ensure_admin also run at container start so admin exists on every deploy.
EXPOSE 8000

ENTRYPOINT ["bash", "scripts/start.sh"]
