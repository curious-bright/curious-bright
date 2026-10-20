# Curious Bright

## Overview
**Curious Bright** is an open-source academic repository and real-time collaboration platform designed for learners, researchers, and educators spanning from High School to PhD candidates, as well as educational NGOs worldwide. The platform empowers students and academic communities to publish research, exchange discoveries, participate in peer review, and engage in real-time academic discussion through integrated communication tools.

By bridging the gap between open-access publication and real-time interactive learning, Curious Bright creates a global digital common room for intellectual exploration. Users can seamlessly conduct live research sessions, co-author documents, collaborate on interactive digital whiteboards, and hold high-definition video conferences all within a unified, open workspace.

> [!NOTE]
> **A Note on the Name:**
> Curious Bright (`curiousbright.com.ng`) was originally reserved for a personal blog for posting intellectual and thought pieces. The idea evolved into this platform instead.

---

## System Architecture

Curious Bright is architected as a high-performance TypeScript monorepo managed with **Turborepo** and **PNPM Workspaces**:

```text
curious-bright/
├── apps/
│   ├── backend/             # Django REST API (Python) — see apps/backend/README.md
│   ├── landing-page/        # Marketing site (React + Vite + Tailwind)
│   ├── mobile/              # React Native + Expo Mobile Application
│   ├── realtime-gateway/    # Socket.io & Redis State Synchronization
│   ├── signaling-service/   # WebRTC Signaling Service
│   └── web/                 # React + Vite Web Client
├── packages/
│   ├── database/            # PostgreSQL & Prisma ORM Schema & Client
│   ├── realtime-contracts/  # Shared Realtime Gateway Event Specs
│   ├── types/               # Shared TypeScript Type Definitions
│   ├── ui-kit/              # Shared UI Component Library
│   ├── validation/          # Shared Zod Data Validation Schemas
│   └── whiteboard-engine/   # Yjs CRDT Real-time Whiteboard Engine
```

---

## Tech Stack & Infrastructure

- **Monorepo Build Tooling:** [Turborepo](https://turbo.build/) & [PNPM Workspaces](https://pnpm.io/)
- **Backend API:** Django 5.2 + Django REST Framework + SimpleJWT (`apps/backend`)
- **Database & ORM:** PostgreSQL with Django Migrations (SQLite fallback for local dev)
- **Web Application:** React 18 & Vite
- **Mobile Application:** React Native with Expo
- **Real-Time Gateway:** Socket.io paired with Redis for pub/sub messaging and state sync
- **Collaborative Canvas:** [Yjs](https://yjs.dev/) CRDT framework for real-time shared whiteboards
- **Video & Audio Infrastructure:** [LiveKit](https://livekit.io/) WebRTC server infrastructure
- **Object Storage:** S3-compatible object storage (MinIO for local development)

---

## Key Features

- **Community Knowledge Feed:** Posts, threaded comments, LaTeX equations, likes, “this helped me”, follows, mentions and notifications — a knowledge-sharing community for students, teachers and researchers (not math-only).
- **Gamification Badges:** Automatic `Teacher`, `Solver` and `Collaborator` badges awarded on the platform’s core actions, shown on profiles.
- **Research Collaboration:** Invite co-authors to research documents, edit live with revision history; editing co-authors earn the Collaborator badge.
- **Centralized Error Handling:** Every API error returns `{code, message, details}`; the web client surfaces it through a single global alert and one API wrapper (auto token refresh, no alert storms).
- **Open Academic Publishing & Peer Review:** Publish academic articles, research papers, and preprints across various disciplines with built-in community peer-review tools.
- **Real-Time Interactive Whiteboard:** Collaborative canvas using CRDTs (`Yjs` + `whiteboard-engine`) enabling low-latency concurrent drawing and document annotation.
- **High-Definition Video Conferencing:** Integrated LiveKit WebRTC conferencing for live research meetings, virtual classrooms, and study groups.
- **Cross-Platform Access:** Responsive web portal, landing page and mobile app (Expo) ensuring seamless participation anywhere.

---

## Getting Started & Development Setup

### Prerequisites
- Node.js (v18+)
- `pnpm` (`npm i -g pnpm`)
- Python 3.12+
- Docker & Docker Compose

### 1. Start Infrastructure Dependencies
Launch PostgreSQL (and other services used by the legacy realtime stack):
```bash
docker compose up -d
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

## License

This project is open-source software licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).




