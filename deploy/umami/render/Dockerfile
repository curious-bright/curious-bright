# Curious Bright — self-hosted Umami analytics for Render.
# Render builds this for the analytics service; set the service Root Directory
# to deploy/umami/render so it does NOT build the repo-root Django Dockerfile.
# Required env vars on the Render service:
#   DATABASE_URL  Render Postgres connection string (postgresql://user:pass@host:port/db)
#   APP_SECRET    random secret, e.g. openssl rand -hex 32
FROM ghcr.io/umami-software/umami:postgresql-latest

ENV DATABASE_TYPE=postgresql \
    DISABLE_TELEMETRY=1 \
    PORT=10000
