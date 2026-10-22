# AGENT.md — How Curious Bright Works

This file is the practical map for anyone (human or AI agent) changing Curious Bright. Read it before touching the backend, the web client, or the institutional portal.

## 1. What the product is

Curious Bright is a community learning platform. Members publish questions, notes and PDF papers, discuss them, follow each other, join study rooms with live chat/video/whiteboard, and collaborate on research documents. Institutions get a separate portal for member management, student onboarding, CSV import/export and Paystack billing.

There are two Git repositories:

| Repository | Purpose |
|---|---|
| `curious-bright` (this repository) | Django API, member-facing web app, marketing site, legacy packages |
| `../curious-bright-institutional` | Standalone React institutional portal. It uses the Django API, not the retired Express billing service. |

## 2. Architecture

```text
Member web app (React/Vite, :3000) ─┐
Institutional portal (React 17, :5174) ─┤
                                     ├── HTTP /api ──> Django + DRF (:8000)
                                     ├── WebSocket /ws ─> Django Channels
                                     │                    ├── chat + presence
                                     │                    ├── feed updates
                                     │                    ├── notifications
                                     │                    └── whiteboard
                                     └── /media ───────> uploaded PDFs/avatars/logos

Django ──> PostgreSQL (production) or SQLite (local fallback)
       ──> Redis channel layer (optional locally, required for multiple workers)
       ──> LiveKit (tokens minted by Django; media is peer-to-server)
       ──> Paystack (subscription checkout, verify + signed webhook)
       ──> SMTP or console email (invitations)
```

The backend is the source of truth for permissions, visibility, pricing, and account state. Never rely on a hidden frontend button for authorization.

## 3. Repository map

```text
apps/backend/
  config/                 Django settings, URLs, ASGI (JWT WebSocket auth)
  apps/accounts/          users, profiles, follows, account export/deletion
  apps/community/         posts, comments, likes, handy votes, notifications,
                          visibility rules, soft delete, feeds
  apps/gamification/      badges and automatic awards
  apps/research/          documents, revisions, co-author invitations
  apps/moderation/        reports, review queue, moderator applications
  apps/rooms/             study rooms, members, chat, LiveKit tokens,
                          whiteboard snapshot
  apps/organizations/     institutional memberships, invitations, CSV/students
  apps/billing/           plans, Paystack, subscriptions, webhooks
  apps/realtime/          Channels consumers, routing, broadcast helpers
  apps/core/              soft-delete base model, audit log, error envelope,
                          pagination, permissions, health/search views

apps/web/                 member-facing React app
  src/lib/api.ts          authenticated API wrapper and token refresh
  src/lib/realtime.ts     reconnecting WebSocket hook
  src/state/              auth, feed, notification and alert contexts
  src/pages/              route-level screens
  src/components/         shared UI (PostCard, Room video/whiteboard, modals…)
  src/index.css           design tokens + all paper-notebook styling
  public/                 PWA manifest, service worker, icons

apps/landing-page/        marketing site (separate Vite app)
apps/mobile/              legacy Expo app — not part of the current deploy
apps/realtime-gateway/    retired Socket.io gateway
apps/signaling-service/   retired WebRTC signaling service
packages/                 legacy shared TypeScript packages
```

The active stack is Django + the two React clients. Files under `apps/mobile`, `apps/realtime-gateway`, `apps/signaling-service` and most of `packages/` are retained for history and are not used by the deployed product.

## 4. Local setup

Prerequisites: Python 3.12+, Node 18+, pnpm.

```bash
# 1. JavaScript dependencies (main repo)
pnpm install

# 2. Backend
cd apps/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then edit values; .env is auto-loaded
.venv/bin/python manage.py migrate

# Optional: create the first admin. The env vars must be set in .env
# (or exported) before running this command.
.venv/bin/python manage.py ensure_admin

# 3. Run the API (from apps/backend)
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

Run the member web app from the repository root:

```bash
pnpm dev                 # equivalent to: pnpm --filter web dev
```

Run the institutional portal from the separate repository:

```bash
cd ../curious-bright-institutional
pnpm install
pnpm dev                 # http://localhost:5174, proxies /api to :8000
```

Local ports: API `8000`, member web `3000`, institutional portal `5174`.

`pnpm dev` in the main repo starts only the active member web app. Use `pnpm dev:all` only when deliberately working on the legacy workspace packages.

### Environment files

- Backend: `apps/backend/.env.example` → `.env`. `config/settings.py` calls `load_dotenv()`; existing process env vars win.
- Member web: `apps/web/.env.example` → `.env`.
- Institutional portal: `apps/institutional-web/.env.example` → `.env`.

Do not commit `.env`, real API keys, Paystack secrets, LiveKit secrets, or production passwords.

## 5. Authentication and API conventions

- Login accepts username **or** email at `POST /api/auth/token/`.
- Access tokens last 30 minutes; refresh tokens last 7 days with rotation/blacklisting.
- Browser clients send `Authorization: Bearer <access>`.
- The member client stores tokens in localStorage (`lb_access`, `lb_refresh`) and performs single-flight refresh on 401.
- The portal stores its session under `cb.institutional.session` and also refreshes in-flight.
- WebSocket authentication uses `?token=<access>` because browsers cannot set an Authorization header during the handshake. See `config/asgi.py`.
- Every REST error on `/api/` returns exactly `{ "code": "…", "message": "…" }`. Do not add a `detail` field to API errors; validation details are flattened into `message`.
- Request correlation is returned in the `X-Request-ID` response header.
- All endpoints use trailing slashes. List endpoints are paginated as `{count, next, previous, results}` unless documented otherwise.

Common error codes include `validation_error`, `unauthenticated`, `unauthorized`, `forbidden`, `not_found`, `throttled`, `conflict`, `restore_window_expired`, `seat_limit_reached`, `plan_not_purchasable`, `billing_not_configured`, `livekit_not_configured`, and `organization_owner`.

## 6. Permissions, roles and visibility

### Community content

Posts have `visibility` = `public`, `followers`, or `room_only`, plus a review state (`published`, `pending`, `rejected`).

Rules enforced in `apps/community/visibility.py`:

- Anonymous viewers see only published public posts.
- Followers-only posts are visible to the author, that author's followers, and moderators/staff.
- Room-only posts are visible only to room members (and moderators/staff).
- Pending/rejected PDF submissions are visible only to the author and moderators.
- Soft-deleted content is hidden from normal queries.

List endpoints, detail endpoints, and WebSocket groups all use the same visibility logic. If you add a new read path, use `visible_posts()` / `can_view_post()` rather than reimplementing filters.

Public serializers must never expose email. Author/user payloads use `PublicUserSerializer`; only `/api/auth/me/` and the signed-in profile return private fields.

### Moderation and organizations

- `is_staff` and `is_moderator` can moderate content.
- Organization roles: `owner` > `admin` > `moderator` > `teacher` > `student` > `member`.
- Owners can manage billing and deactivate an organization. Admins can manage lower-ranked members and invitations.
- Members/invitation seat counts include active members and pending invitations.
- Organization owners cannot delete their account until ownership is transferred or the organization is removed/deactivated. The API returns HTTP 409 with code `organization_owner`.

## 7. Soft delete, undo and audit

`apps/core/models.py` provides `SoftDeleteModel` with:

- `objects` — live rows only (default manager)
- `all_objects` — live + deleted rows
- `is_deleted`, `deleted_at`, `deleted_by`

Deleting a post/comment/room/research document marks it deleted. The UI offers an undo window (default **300 seconds**, `SOFT_DELETE_UNDO_SECONDS`) and shows a global undo notice. Restoring after the window returns HTTP 410 `restore_window_expired` unless the user is staff/moderator. Permanent cleanup uses `SOFT_DELETE_RETENTION_DAYS` (default 30 days) and `hard_delete()`.

Cascade behaviour matters:

- Deleting a room soft-deletes its room-only posts and hides chat/whiteboard.
- Restoring a room restores only posts deleted in that same cascade (not older deletions).
- Deleting a parent comment leaves a visible tombstone for its author and for moderators; other members see deleted top-level comments only if visible replies need the thread context.
- Every create/edit/delete/restore on supported content writes a `ContentAuditLog` entry with changed field names and values.
- Restoring a research revision creates a new revision; it does not mutate history.

## 8. Realtime features

Channels routes (`apps/realtime/routing.py`):

| Path | Purpose |
|---|---|
| `/ws/feed/` | public discover feed events |
| `/ws/posts/<id>/` | post-specific discussion events, visibility checked |
| `/ws/notifications/` | signed-in member notifications |
| `/ws/rooms/<room_id>/` | chat, typing, presence and room events |
| `/ws/rooms/<room_id>/whiteboard/` | collaborative whiteboard events |

Feed updates are published to visibility-aware groups (`feed.discover`, `feed.user.<id>`, `post.<id>`, `room.<id>`). Never broadcast private content to the discover group.

Room chat is persisted in the database and also broadcast. `POST /api/rooms/<id>/join/` must happen before reading messages, posting messages, minting video tokens, or opening the whiteboard.

Video uses LiveKit. The browser calls `POST /api/rooms/<id>/livekit-token/`; Django returns a short-lived token and the public WebSocket URL. Without LiveKit env vars the endpoint returns 503 `livekit_not_configured` and the UI shows a friendly setup message.

The whiteboard stores a bounded snapshot on `Room.whiteboard_data` in normalized `0..1000` coordinates. Complete strokes are persisted; in-progress drawing is relayed as ephemeral `whiteboard.draw` events. Clearing the board is host-only. The HTTP fallback is `GET/DELETE /api/rooms/<id>/whiteboard/`.

## 9. Key API surface

All paths below are prefixed by `/api/`.

- **Auth/account:** `auth/register/`, `auth/token/`, `auth/token/refresh/`, `auth/logout/`, `auth/me/`, `auth/change-password/`, `auth/export/`, `auth/delete-account/`
- **Profiles/follows:** `auth/profiles/<username>/`, `auth/profiles/<username>/follow/`, `auth/profiles/<username>/is-following/`, `auth/profiles/<username>/followers/`, `auth/profiles/<username>/following/`
- **Community:** `posts/`, `posts/<id>/`, `posts/<id>/like/`, `posts/<id>/solve/`, `posts/<id>/comments/`, `comments/<id>/`, `comments/<id>/helpful/`, `comments/<id>/accept/`, `posts/<id>/restore/`, `comments/<id>/restore/`, `posts/<id>/activity/`, `feed/discover/`, `feed/following/`, `notifications/`, `notifications/read-all/`
- **Moderation:** `posts/<id>/flag/`, `moderation/queue/`, `moderation/queue/<id>/approve/`, `moderation/queue/<id>/reject/`, `moderation/reports/`, `moderation/reports/<id>/resolve/`, `moderator-applications/`, `moderator-applications/me/`, `moderator-applications/<id>/approve|decline/`
- **Rooms:** `rooms/`, `rooms/<id>/`, `rooms/<id>/join/`, `rooms/<id>/members/`, `rooms/<id>/messages/`, `rooms/<id>/livekit-token/`, `rooms/<id>/whiteboard/`, `rooms/<id>/restore/`
- **Research:** `research/`, `research/<id>/`, `research/<id>/restore/`, `research/<id>/invite/`, `research/<id>/revisions/`, `research/<id>/revisions/<revision_id>/restore/`, `research/invitations/`, `research/invitations/<id>/respond/`
- **Organizations:** `organizations/`, `organizations/<slug>/`, `organizations/<slug>/members/`, `organizations/<slug>/members/invite/`, `organizations/<slug>/members/<id>/`, `organizations/<slug>/members/link/`, `organizations/<slug>/invitations/`, `organizations/<slug>/invitations/<id>/`, `organizations/<slug>/students/`, `organizations/<slug>/students/import/`, `organizations/<slug>/members.csv`, `organizations/students/template/`, `organizations/<slug>/stats/`, `organizations/<slug>/audit-logs/`, `organizations/invitations/me/`, `organizations/invitations/<uuid>/accept/`, `organizations/join-by-domain/`
- **Billing:** `billing/plans/`, `billing/checkout/`, `billing/payments/<reference>/`, `billing/payments/<reference>/verify/`, `billing/webhook/paystack/`, `organizations/<slug>/subscription/`, `organizations/<slug>/subscribe/`
- **Search/health:** `search/?q=`, `/healthz/`

### Visibility-aware post payloads

`POST /api/posts/` accepts `visibility`, optional `room`, optional `organization`, and optional multipart `attachment` (PDF ≤25 MB). PDF posts enter moderation as `pending`; plain-text notes publish immediately. Updates accept `expected_updated_at`; a stale timestamp returns 409 `conflict` so two editors cannot silently overwrite each other.

## 10. Data model quick reference

- `accounts.User` / `Profile` / `Follow`
- `community.Post` / `Comment` / `Like` / `HelpfulReaction` / `Equation` / `Notification`
- `rooms.Room` / `RoomMember` / `RoomMessage` (whiteboard snapshot lives on `Room`)
- `research.ResearchDocument` / `Collaboration` / `ResearchDocumentRevision`
- `organizations.Organization` / `OrganizationMembership` / `OrganizationInvitation` / `OrganizationAuditLog`
- `billing.PlanTier` / `Payment` / `OrganizationSubscription` / `WebhookEvent`
- `gamification.Badge` / `UserBadge`
- `moderation.Report` / `ModeratorApplication`
- `core.ContentAuditLog`

Plan prices are seeded in migrations. `billing.PlanTier` rows override the fallback `PLAN_DEFINITIONS`; `BILLING_PRO_NGN` / `BILLING_PRO_USD` are legacy compatibility knobs. Amounts are always stored in minor units (kobo/cents).

## 11. Frontend architecture

- React 18 + React Router 7 + Vite.
- `AuthContext` owns login/register/logout, profile updates, token state, and exposes `followStatus`.
- `FeedContext` owns discover/following feeds, optimistic likes/follows, post CRUD, soft delete and undo. It deduplicates in-flight loads and respects the current tab's visibility.
- `NotificationContext` polls notifications and handles read-all.
- `AlertHost` + `errorBus` show one global error message per failed API call. Pages do not duplicate error toasts.
- All HTTP goes through `src/lib/api.ts`: `apiFetch` (JSON/null), `apiVoid` (204 success = true), `apiDownload` (authenticated files). It normalizes `/api` paths, attaches JWT, refreshes once on 401, and surfaces `{code,message}`.
- `useRealtime` in `src/lib/realtime.ts` reconnects with exponential backoff and always calls the latest handler closure.
- Heavy tools are lazy-loaded: `Room.tsx` (LiveKit + whiteboard) and `Read.tsx` (react-pdf). Vite splits `livekit-client` and `react-pdf`/`pdfjs-dist` into separate chunks.
- `Settings.tsx` handles profile fields, password change, data export, and account deletion.
- `PostDetail.tsx` handles comments, replies, edit, delete/restore, moderation actions, activity history, and answer acceptance.

### Design system

The visual language is a warm paper notebook: cream background, coral primary, teal accent, mustard highlights, hand-drawn borders and soft shadows. Tokens live at the top of `src/index.css` (`--color-*`, `--space-*`, `--radius-*`, etc.). Compatibility aliases such as `glass-card` are deliberate; older pages still use them. Add new styles from the tokens and reuse existing classes (`.paper-panel`, `.btn`, `.badge-tag`, `.field`, `.room-*`) instead of introducing a second design system.

### PWA

`public/manifest.webmanifest` and `public/sw.js` provide an installable shell. The service worker caches the app shell and same-origin static assets, **never** `/api`, `/ws`, or `/admin` responses. It registers in production only. Any new static shell file added to the precache list must actually exist, or `cache.addAll` fails.

Profile usernames may contain dots. Vite's dev server normally treats dotted paths as files, so `vite.config.ts` rewrites HTML requests under `/profile/*` to `index.html`. Production hosting still needs an SPA fallback rewrite for `/profile/*` and the other client routes.

## 12. Institutional portal

The portal is a separate Vite app in `../curious-bright-institutional/apps/institutional-web`.

- It talks to the Django API via `src/lib/api.ts` (JWT Bearer, snake_case fields, typed responses).
- Development: `/api` and `/media` are proxied to `http://localhost:8000`; `VITE_API_URL` should stay blank.
- Production: set `VITE_API_URL` to the full API base including `/api` (for example `https://api.curiousbright.com.ng/api`). For a Cloudflare/static deployment, also provide an SPA fallback for `/invitations/*`.
- Views: organization overview/stats, members, invitations, student CSV import/creation/linking, billing plans and subscription checkout, organization settings/audit/deactivation.
- Invitation links use `${ORG_FRONTEND_URL}/invitations/<uuid>` from Django and land on the portal acceptance gate.
- It does **not** call the legacy Express billing app. Billing is `POST /api/organizations/<slug>/subscribe/` and Paystack verification happens in Django.

## 13. Tests and validation

Backend suite (currently 106 tests):

```bash
cd apps/backend
.venv/bin/python manage.py test
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
```

Builds:

```bash
cd /path/to/curious-bright
pnpm --filter web build

cd /path/to/curious-bright-institutional
pnpm --filter institutional-web build
```

The backend tests cover visibility, PII-safe serializers, editing/conflict handling, soft delete/undo, comments for authors/moderators, rooms, WebSockets, whiteboard persistence, research revisions, organization permissions/CSV/students, billing, profile counts, account deletion, and the error contract. Add a regression test when fixing a bug in one of these areas.

## 14. Deployment

- Backend image is built from the root `Dockerfile`; `apps/backend/scripts/start.sh` runs migrations, optional admin bootstrap, `collectstatic`, then uvicorn/ASGI.
- Required production services: PostgreSQL and Redis. Set `DATABASE_URL` and `REDIS_URL`.
- Required secrets: `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`; Paystack/LiveKit/SMTP values as needed.
- Run with more than one worker only when `REDIS_URL` is configured; otherwise WebSockets are in-process.
- WhiteNoise serves static files. Media currently uses the container filesystem and is served by Django; mount a persistent volume or move to object storage before relying on uploads.
- Paystack webhook target: `https://<api-host>/api/billing/webhook/paystack/`. The endpoint validates the HMAC-SHA512 signature and is idempotent.
- The institutional portal can be deployed to Cloudflare Pages/Workers or any static host, with `VITE_API_URL` set at build time and SPA rewrites configured.

## 15. Change workflow

1. Read the relevant backend view/serializer plus the frontend caller before changing either contract.
2. Keep authorization and visibility in the backend. Update frontend only to reflect what the API allows.
3. If you change a model, create a migration and run tests. Never edit an already-applied migration.
4. If you touch an API payload, update both the member client and the institutional portal where applicable.
5. Preserve the paper-notebook tokens and component classes; do not introduce a parallel styling system.
6. Add or adjust tests for permission boundaries, error shapes, cascade behavior, and realtime visibility.
7. Run the full backend suite and both client builds before committing.
8. Commit backend, member web, docs, and the separate institutional repo logically and separately.

## 16. Known limitations

- The legacy Expo app, Socket.io gateway, WebRTC signaling service, and legacy packages are not part of the active deploy.
- Media storage is local/container filesystem until an object-storage backend is added.
- The institutional portal has no automated frontend test suite yet; verify with `pnpm build` and a browser smoke test.
- Search is `icontains`-based and capped per section, not a dedicated search engine.
- Production SPA hosting must provide rewrites for dotted profile URLs and the other React routes.
