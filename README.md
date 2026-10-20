# Curious Bright

## Overview
**Curious Bright** is an open-source academic repository and collaboration platform for learners, researchers, and educators — from high school to PhD candidates, and educational NGOs worldwide. Members publish papers and notes, exchange explanations, take part in community peer review, and collaborate in study rooms and shared research documents.

By pairing open-access publishing with a discussion-first community, Curious Bright gives every learner a common room for intellectual exploration: share a paper, ask a question, explain an answer, and build research together.

> [!NOTE]
> **A Note on the Name:**
> Curious Bright (`curiousbright.com.ng`) was originally reserved for a personal blog for posting intellectual and thought pieces. The idea evolved into this platform instead.

---

## System Architecture

The active product is a **Django REST API** (`apps/backend`) with two React/Vite clients (`apps/web`, `apps/landing-page`). The repository is still a PNPM workspace so legacy TypeScript packages remain buildable while they are retired:

```text
curious-bright/
├── apps/
│   ├── backend/             # Django REST API (Python) — see apps/backend/README.md
│   ├── landing-page/        # Marketing site (React + Vite)
│   ├── web/                 # React + Vite web client
│   ├── mobile/              # Legacy Expo app (not deployed)
│   ├── realtime-gateway/    # Legacy Socket.io gateway (not deployed)
│   └── signaling-service/   # Legacy WebRTC signaling (not deployed)
└── packages/                # Legacy shared TS packages (realtime-contracts, types,
                             # ui-kit, validation, whiteboard-engine, Prisma database)
```

---

## Tech Stack & Infrastructure

- **Backend API:** Django 5.2 + Django REST Framework + SimpleJWT (`apps/backend`)
- **Database & ORM:** PostgreSQL with Django migrations (SQLite fallback for local dev)
- **Web & Marketing:** React 18 + Vite; the web client uses hand-written CSS utilities
- **Deployment:** Northflank (Docker image + managed PostgreSQL addon)
- **Legacy (not part of the current deploy):** Turborepo/PNPM tooling, Prisma, Socket.io,
  Yjs whiteboard engine, LiveKit video, React Native/Expo

---

## Key Features

- **Community Knowledge Feed:** Posts, threaded comments, LaTeX equations, likes, “this helped me”, follows, mentions and notifications — a knowledge-sharing community for students, teachers and researchers (not math-only).
- **Open Library & Review Queue:** Upload PDF papers (≤25 MB) or publish plain notes; PDF submissions enter a moderator review queue before they are publicly listed. Browse papers and notes with subject/level filters and server-side search.
- **Community Moderation:** Members report posts, moderators resolve reports, and members can apply to join the review team. Roles are exposed as `is_moderator` / `can_moderate`.
- **Study Rooms & Global Search:** Create or join study rooms with live message polling, and search across papers, notes, rooms and co-authors.
- **Gamification Badges:** Automatic `Teacher`, `Solver` and `Collaborator` badges awarded on the platform’s core actions, shown on profiles.
- **Research Collaboration:** Invite co-authors to research documents, edit live with revision history; editing co-authors earn the Collaborator badge.
- **Centralized Error Handling:** Every API error returns `{code, message, details}`; the web client surfaces it through a single global alert and one API wrapper (auto token refresh, no alert storms).
- **Cross-Platform Access:** Responsive web portal and landing page; the legacy Expo app is not part of the current deployment.

---

## Getting Started & Development Setup

### Prerequisites
- Node.js (v18+) and `pnpm` (`npm i -g pnpm`)
- Python 3.12+
- Docker & Docker Compose (optional — only for a local PostgreSQL)

### 1. Database (optional)
SQLite is the default for local development. To use PostgreSQL instead:
```bash
docker compose up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/curiousbright
```

### 2. Install Monorepo Dependencies
```bash
pnpm install
```

### 3. Backend: Migrate & Bootstrap Admin
```bash
cd apps/backend
python -m venv venv && venv/bin/pip install -r requirements.txt
ADMIN_USERNAME=admin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<strong-password> \
  venv/bin/python manage.py migrate
ADMIN_USERNAME=admin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<strong-password> \
  venv/bin/python manage.py ensure_admin
```
(Alternatively skip the `ADMIN_*` vars and run `venv/bin/python manage.py createsuperuser`.)
With no `DATABASE_URL` the backend uses local SQLite. Full environment variable
list, API endpoints, error contract and edge-case notes: **[apps/backend/README.md](apps/backend/README.md)**
(`.env.example` alongside it).

### 4. Launch Development Workspace
Run all apps in parallel using Turborepo:
```bash
pnpm run dev
```
Backend-only commands: `pnpm run backend:migrate`, `pnpm run backend:admin`,
`pnpm run backend:dev`.

---

## Deployment (Northflank)

The backend ships as a Docker image built from the repository root (`Dockerfile`);
its entrypoint (`apps/backend/scripts/start.sh`) runs migrations, creates the admin
if needed, then starts gunicorn on `$PORT`.

1. **Create the service** from this repository, build using the root `Dockerfile`,
   and expose port `8000` (or use the platform-provided `PORT`).
2. **Add a PostgreSQL addon** and link it to the service. Northflank injects its
   connection string; expose it to Django as `DATABASE_URL`.
3. **Set secrets:** `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
   `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`. `ADMIN_USERNAME` /
   `ADMIN_EMAIL` / `ADMIN_PASSWORD` are **optional** (bootstrapping only) —
   without them `start.sh` skips `ensure_admin` and you create the superuser
   yourself from the server shell: `python manage.py createsuperuser`.
4. **Deploy.** The logs should show each migration applying, then
   `collectstatic`, then gunicorn binding to the port. Health-check with
   `GET /healthz/` (returns `200 {"status": "ok", "database": true}`) and
   `GET /api/posts/`.

The admin at `https://api.curiousbright.com.ng/admin/` opens with a
**username + password login** and an analytics overview: member/post/report/
application/room/document/badge counts, plus recent activity panels (posts
awaiting review, open reports, pending moderator applications, newest members)
and the standard Recent actions sidebar.

> [!IMPORTANT]
> If a deploy ever fails with `relation "accounts_user" does not exist` while
> applying `accounts.0002_bootstrap_admin`, the addon holds stale
> `django_migrations` rows from a partial deploy. For a fresh environment, reset
> the addon schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) and
> redeploy. See [apps/backend/README.md](apps/backend/README.md) for details.

Uploaded PDFs are written to the container filesystem, so they do not survive a
redeploy. Attach a persistent volume at `apps/backend/media` or move media to
object storage before relying on paper uploads in production.

---

## License

This project is open-source software licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).




