# Curious Bright

A shared notebook where students teach students. Curious Bright is an open-source community learning platform for learners, researchers and educators — from secondary school to PhD, and for education NGOs worldwide.

Members publish questions, notes and papers, discuss explanations, follow each other, join live study rooms, and collaborate on research. Institutions manage their communities through a separate institutional portal.

> **A note on the name:** Curious Bright (`curiousbright.com.ng`) was originally a personal blog. The idea evolved into this platform instead.

## What is in this repository

| Surface | Stack | Location |
|---|---|---|
| REST + realtime API | Django 5.2, DRF, Channels, PostgreSQL/SQLite | `apps/backend` |
| Member web app | React 18, Vite, TypeScript, PWA | `apps/web` |
| Marketing site | React 18, Vite | `apps/landing-page` |
| Institutional portal | React 17, Vite | separate repository: `../curious-bright-institutional` |

The active product is the Django API plus the member web app. The Expo app, Socket.io gateway, WebRTC signaling service and legacy TypeScript packages are retained for history but are not part of the current deployment.

## Features

### Community
- Discover and Following feeds with keyboard-free mobile navigation and PWA install support.
- Questions, notes and PDF papers with subjects, levels, reviews and server-side search.
- Threaded comments, helpful votes, accepted answers, likes, mentions and notifications.
- Public / followers-only / room-only post visibility, enforced by the API and realtime sockets.
- Profiles with viewer-accurate post counts, follow state, follower/following lists and automatic badges.
- Edit, delete, undo and restore for posts/comments, with audit history and conflict detection (`expected_updated_at`).

### Study rooms and research
- Study rooms with membership, live chat, presence, typing indicators and room-only discussions.
- LiveKit video calls using short-lived server-issued tokens.
- Collaborative whiteboard with persistent snapshots, normalized coordinates and host-only clearing.
- Research studio with co-author invitations, revisions, revision preview/restore and collaborator badges.

### Institutions and billing
- Organization membership roles (owner/admin/moderator/teacher/student/member).
- Bulk email invitations, invitation links, domain auto-join and student account creation.
- CSV student import, member CSV export and existing-account linking.
- Organization stats, audit log, seat limits and deactivation.
- Paystack billing plans in NGN/USD, checkout, verification, signed webhooks and subscriptions.

### Account and platform
- JWT auth with refresh rotation/blacklisting, password change and rate limiting.
- Profile settings, avatar upload, data export and confirmed account deletion.
- One `{code, message}` error contract for every API error; one global alert in the web app.
- Admin dashboard (Unfold) for members, posts, reports, rooms, research and activity.
- Responsive paper-notebook design system, accessible modals, mobile member panel and offline app shell.

## Architecture

```text
apps/web (React) ───────────────┐
institutional portal (React) ───┤
                                ├── /api  ──> Django REST API
                                ├── /ws   ──> Django Channels (chat, feeds,
                                │             notifications, whiteboard)
                                └── /media ─> uploaded PDFs, avatars, logos

Django ──> PostgreSQL or SQLite
       ──> Redis channel layer (needed for multiple ASGI workers)
       ──> LiveKit (server-minted video tokens)
       ──> Paystack (checkout, verification, webhooks)
```

The backend is authoritative for visibility, roles and billing. The member web app and institutional portal never expose private data or decide permissions on their own.

For a deeper walkthrough of the data model, API, realtime rules, soft delete, frontend state and deployment, see **[AGENT.md](AGENT.md)**.

## Getting started

### Prerequisites
- Python 3.12+
- Node.js 18+ and pnpm
- Optional: Docker for PostgreSQL, Redis and LiveKit

### 1. Install JavaScript dependencies

```bash
pnpm install
```

### 2. Set up the backend

```bash
cd apps/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` as needed. With `DATABASE_URL` empty, local development uses SQLite automatically. PostgreSQL is required in production. The backend loads `.env` from `apps/backend` while still letting real process environment variables take precedence.

```bash
.venv/bin/python manage.py migrate

# Optional first-time admin; requires ADMIN_USERNAME/EMAIL/PASSWORD in .env
.venv/bin/python manage.py ensure_admin

.venv/bin/python manage.py runserver 0.0.0.0:8000
```

The API is at `http://127.0.0.1:8000`; health check at `/healthz/`. Full environment variables, endpoints and deployment notes: **[apps/backend/README.md](apps/backend/README.md)**.

### 3. Run the member web app

From the repository root:

```bash
pnpm dev
```

Open `http://localhost:3000`. To point at another API origin, copy `apps/web/.env.example` to `apps/web/.env` and set `VITE_API_URL`.

### 4. Run the institutional portal

The portal is a separate Git repository next to this one:

```bash
cd ../curious-bright-institutional
pnpm install
pnpm dev
```

Open `http://localhost:5174`. In development Vite proxies `/api` and `/media` to `http://localhost:8000`; no portal `.env` is required. For production, set `VITE_API_URL` (including the `/api` suffix) at build time and configure an SPA rewrite for `/invitations/*`.

### Optional: PostgreSQL and Redis

```bash
docker compose up -d
```

Set `DATABASE_URL` and `REDIS_URL` in `apps/backend/.env` when using the Compose services. Redis is required when running more than one ASGI worker; without it Channels uses an in-memory layer and the backend should run a single worker.

### Live video

Create a LiveKit project and set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. If these are unset, the room shows a friendly "video not configured" state instead of failing silently. The API secret never reaches the browser.

### Payments

Set `PAYSTACK_SECRET_KEY` (and optionally `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`). Point the Paystack webhook at:

```text
https://<api-host>/api/billing/webhook/paystack/
```

The webhook verifies the HMAC-SHA512 signature and is idempotent. USD checkout also requires USD to be enabled on the Paystack account.

## Tests and builds

```bash
# Backend (106 tests)
cd apps/backend
.venv/bin/python manage.py test

# Member web production build
cd ../..
pnpm --filter web build

# Institutional portal production build
cd ../curious-bright-institutional
pnpm --filter institutional-web build
```

Before shipping a change, also run:

```bash
cd apps/backend
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
```

## Deployment

The backend image is built from the root `Dockerfile` and started by `apps/backend/scripts/start.sh`, which runs migrations, optional admin bootstrap, `collectstatic`, then uvicorn on `${PORT:-8000}`.

Required secrets/services:
- `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL` (PostgreSQL)
- `REDIS_URL` for multiple workers and cross-worker WebSockets
- `LIVEKIT_*` and `PAYSTACK_*` when those features are enabled
- SMTP settings for real invitation emails (console email is the local default)

Health check: `GET /healthz/` → `200 {"status": "ok", "database": true}`.

> [!IMPORTANT]
> Uploaded PDFs, avatars and organization logos currently live on the container filesystem. Attach a persistent volume at `apps/backend/media` or move media to object storage before relying on uploads in production.

See **[apps/backend/README.md](apps/backend/README.md)** for deployment troubleshooting, including stale migration tables.

## Documentation

- **[AGENT.md](AGENT.md)** — architecture, API, permissions, realtime, soft delete, frontend and workflow details.
- **[apps/backend/README.md](apps/backend/README.md)** — backend setup, environment variables, endpoints and deployment.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — contribution guidance.

## License

This project is open-source software licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).
