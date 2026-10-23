# AGENT.md — How Curious Bright Works

This file is the practical map for anyone (human or AI agent) changing Curious Bright. Read it before touching the backend, the web client, or the institutional portal.

## 1. What the product is

Curious Bright is a community learning platform. Members publish questions, notes and PDF papers, discuss them, follow each other, message privately, join study rooms with live chat/video/whiteboard, and collaborate on research documents. Institutions get a separate portal for verification, member management, student onboarding, CSV import/export and Paystack billing.

There are two Git repositories:

| Repository | Purpose |
|---|---|
| `curious-bright` (this repository) | Django API, member-facing web app, marketing site, legacy mobile client and its packages |
| `../curious-bright-institutional` | Standalone React institutional portal. It uses the Django API. |

## 2. Architecture

```text
Member web app (React/Vite, :3000) ─┐
Institutional portal (React 17, :5174) ─┤
Landing page (public, pricing) ──────┤
                                     ├── HTTP /api ──> Django + DRF (:8000)
                                     ├── WebSocket /ws ─> Django Channels
                                     │                    ├── room chat + presence
                                     │                    ├── private messages
                                     │                    ├── feed updates
                                     │                    ├── notifications
                                     │                    └── whiteboard
                                     ├── /media ───────> public PDFs/avatars/logos
                                     └── private media ─> verification documents
                                                          (authenticated downloads only)

Django ──> PostgreSQL (production) or SQLite (local fallback)
       ──> Redis channel layer (optional locally, required for multiple workers)
       ──> LiveKit (tokens minted by Django; media is peer-to-server)
       ──> Paystack (subscription checkout, verify + signed webhook)
       ──> SMTP or console email (verification, invitations, join requests)
       ──> Umami (optional; disabled until VITE_UMAMI_* is configured)
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
  apps/organizations/     institutional verification, memberships, invitations,
                          join requests, CSV/students
  apps/billing/           plans, Paystack, subscriptions, webhooks
  apps/messaging/         one-to-one conversations, messages, blocks, reports
  apps/realtime/          Channels consumers, routing, broadcast helpers
  apps/core/              soft-delete base model, audit log, error envelope,
                          pagination, permissions, health/search views

apps/web/                 member-facing React app
  src/lib/api.ts          authenticated API wrapper and token refresh
  src/lib/realtime.ts     reconnecting WebSocket hook
  src/lib/analytics.ts    optional Umami tracker (no-op unless configured)
  src/state/              auth, feed, notification, alert, theme and messaging
                          contexts
  src/pages/              route-level screens
  src/components/         shared UI (PostCard, Room video/whiteboard, modals…)
  src/index.css           design tokens (light + dark) and all styling
  public/                 PWA manifest, service worker, icons

apps/landing-page/        public marketing site and /pricing (separate Vite app)
docs/                     deployment, verification, messaging, PWA and analytics
apps/mobile/              legacy Expo app — not part of the current deploy
packages/ui-kit/          shared design tokens used by the member and landing apps
packages/                 supporting TypeScript packages for the legacy mobile client
```

The active stack is Django + the two React clients. `apps/mobile` and the packages it uses are retained for history and are not used by the deployed product.

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
- Landing page: `apps/landing-page/.env.example` → `.env`.
- Institutional portal: `../curious-bright-institutional/apps/institutional-web/.env.example` → `.env`.

Do not commit `.env`, real API keys, Paystack secrets, LiveKit secrets, analytics credentials, or production passwords.

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

Common error codes include `validation_error`, `unauthenticated`, `unauthorized`, `forbidden`, `not_found`, `throttled`, `conflict`, `restore_window_expired`, `seat_limit_reached`, `plan_not_purchasable`, `billing_not_configured`, `livekit_not_configured`, `already_verified`, `organization_not_verified` and `organization_owner`.

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
- Organization verification status is `unverified`, `pending`, `verified` or `rejected`. Only verified organizations can invite/link members, create student accounts, use domain auto-join or approve join requests. Existing memberships stay active during re-verification.
- Creating an organization is restricted to the portal origin (`ORG_REGISTRATION_ALLOWED_ORIGINS`) and/or `X-Client-App: institutional`. This is a UX guard; authorization still comes from the authenticated user.
- Only verified organizations appear in member-app join search and may receive join requests. A verified organization that changes its email domain drops back to `unverified` and must be reviewed again.
- Platform staff review verification in Django admin and must record a note on rejection. Verification documents live in private storage and are available only to org admins and staff.

### Private messaging

- Conversations are one-to-one only. All reads are participant-scoped and return 404 to outsiders; platform staff cannot browse conversations through normal APIs, and organization admins have no access at all.
- `Profile.message_privacy` (`anyone`, `follows`, `nobody`) applies only to starting a conversation. Existing conversations stay open.
- Blocking is directional but prevents new messages in both directions; history remains. Deleting your own message is a delete-for-everyone tombstone, not a per-user hide.
- Message reports are handled by platform moderators in Django admin. Never expose message content, participants or reports through analytics or application logs.

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
| `/ws/messages/` | per-user unread totals and conversation-list updates |
| `/ws/conversations/<id>/` | participant-only typing and read receipts |

Feed updates are published to visibility-aware groups (`feed.discover`, `feed.user.<id>`, `post.<id>`, `room.<id>`). Never broadcast private content to the discover group.

Room chat is persisted in the database and also broadcast. `POST /api/rooms/<id>/join/` must happen before reading messages, posting messages, minting video tokens, or opening the whiteboard.

Video uses LiveKit. The browser calls `POST /api/rooms/<id>/livekit-token/`; Django returns a short-lived token and the public WebSocket URL. The backend reads exactly `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, accepts `https://` URLs by normalising them to `wss://`, and exposes only the public URL/status at `GET /api/livekit/config/`. Without valid config the token endpoint returns 503 `livekit_not_configured` and the member app shows a global setup alert instead of failing silently.

The whiteboard stores a bounded snapshot on `Room.whiteboard_data` in normalized `0..1000` coordinates. Complete strokes are persisted; in-progress drawing is relayed as ephemeral `whiteboard.draw` events. Clearing the board is host-only. The HTTP fallback is `GET/DELETE /api/rooms/<id>/whiteboard/`.

Private messages are REST for history/sending and WebSockets for live delivery. `/ws/messages/` updates the unread badge and conversation list; `/ws/conversations/<id>/` is participant-only and carries typing and read events. Messages sent while offline are not replayed by the socket, so clients refetch history on reconnect.

## 9. Key API surface

All paths below are prefixed by `/api/`.

- **Auth/account:** `auth/register/`, `auth/token/`, `auth/token/refresh/`, `auth/logout/`, `auth/me/`, `auth/change-password/`, `auth/export/`, `auth/delete-account/`
- **Profiles/follows:** `auth/profiles/<username>/`, `auth/profiles/<username>/follow/`, `auth/profiles/<username>/is-following/`, `auth/profiles/<username>/followers/`, `auth/profiles/<username>/following/`
- **Community:** `posts/`, `posts/<id>/`, `posts/<id>/like/`, `posts/<id>/solve/`, `posts/<id>/comments/`, `comments/<id>/`, `comments/<id>/helpful/`, `comments/<id>/accept/`, `posts/<id>/restore/`, `comments/<id>/restore/`, `posts/<id>/activity/`, `feed/discover/`, `feed/following/`, `notifications/`, `notifications/read-all/`
- **Moderation:** `posts/<id>/flag/`, `moderation/queue/`, `moderation/queue/<id>/approve/`, `moderation/queue/<id>/reject/`, `moderation/reports/`, `moderation/reports/<id>/resolve/`, `moderator-applications/`, `moderator-applications/me/`, `moderator-applications/<id>/approve|decline/`
- **Rooms:** `rooms/`, `rooms/<id>/`, `rooms/<id>/join/`, `rooms/<id>/members/`, `rooms/<id>/messages/`, `rooms/<id>/livekit-token/`, `rooms/<id>/whiteboard/`, `rooms/<id>/restore/`, `livekit/config/`
- **Research:** `research/`, `research/<id>/`, `research/<id>/restore/`, `research/<id>/invite/`, `research/<id>/revisions/`, `research/<id>/revisions/<revision_id>/restore/`, `research/invitations/`, `research/invitations/<id>/respond/`
- **Organizations:** `organizations/`, `organizations/<slug>/`, `organizations/<slug>/members/`, `organizations/<slug>/members/invite/`, `organizations/<slug>/members/<id>/`, `organizations/<slug>/members/link/`, `organizations/<slug>/invitations/`, `organizations/<slug>/invitations/<id>/`, `organizations/<slug>/students/`, `organizations/<slug>/students/import/`, `organizations/<slug>/members.csv`, `organizations/students/template/`, `organizations/<slug>/stats/`, `organizations/<slug>/audit-logs/`, `organizations/invitations/me/`, `organizations/invitations/<uuid>/accept/`, `organizations/join-by-domain/`, `organizations/search/?q=`
- **Verification/join requests:** `organizations/<slug>/verification/`, `organizations/<slug>/verification/resend/`, `organizations/<slug>/verification/document/`, `organizations/verification/email/<uuid>/`, `organizations/<slug>/join-requests/`, `organizations/join-requests/me/`, `organizations/join-requests/<id>/withdraw/`, `organizations/<slug>/join-requests/<id>/decision/`
- **Private messaging:** `messages/conversations/`, `messages/conversations/<id>/`, `messages/conversations/<id>/messages/`, `messages/conversations/<id>/read/`, `messages/<id>/`, `messages/<id>/report/`, `messages/unread/`, `messages/blocks/`, `messages/blocks/<username>/`
- **Billing:** `billing/plans/`, `billing/checkout/`, `billing/payments/<reference>/`, `billing/payments/<reference>/verify/`, `billing/webhook/paystack/`, `organizations/<slug>/subscription/`, `organizations/<slug>/subscribe/`
- **Search/health:** `search/?q=`, `/healthz/`

### Visibility-aware post payloads

`POST /api/posts/` accepts `visibility`, optional `room`, optional `organization`, and optional multipart `attachment` (PDF ≤25 MB). PDF posts enter moderation as `pending`; plain-text notes publish immediately. Updates accept `expected_updated_at`; a stale timestamp returns 409 `conflict` so two editors cannot silently overwrite each other.

## 10. Data model quick reference

- `accounts.User` / `Profile` / `Follow`
- `community.Post` / `Comment` / `Like` / `HelpfulReaction` / `Equation` / `Notification`
- `rooms.Room` / `RoomMember` / `RoomMessage` (whiteboard snapshot lives on `Room`)
- `messaging.Conversation` / `ConversationParticipant` / `Message` / `UserBlock` / `MessageReport`
- `research.ResearchDocument` / `Collaboration` / `ResearchDocumentRevision`
- `organizations.Organization` / `OrganizationMembership` / `OrganizationInvitation` / `OrganizationAuditLog` / `OrganizationVerification` / `OrganizationVerificationEvent` / `OrganizationJoinRequest`
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
- `ThemeContext` resolves System/Light/Dark, writes `data-theme` and `color-scheme`, syncs across tabs and is seeded pre-paint by an inline script to avoid a flash.
- `MessagingContext` owns conversations, active thread, unread counts and the `/ws/messages/` badge socket. `Messages.tsx` adds the participant socket for typing/read events.
- `AlertHost` + `errorBus` show one global error message per failed API call. Pages do not duplicate error toasts.
- All HTTP goes through `src/lib/api.ts`: `apiFetch` (JSON/null), `apiVoid` (204 success = true), `apiDownload` (authenticated files). It normalizes `/api` paths, attaches JWT, refreshes once on 401, and surfaces `{code,message}`.
- `useRealtime` in `src/lib/realtime.ts` reconnects with exponential backoff and always calls the latest handler closure.
- Heavy tools are lazy-loaded: `Room.tsx` (LiveKit + whiteboard) and `Read.tsx` (react-pdf). Vite splits `livekit-client` and `react-pdf`/`pdfjs-dist` into separate chunks.
- `Settings.tsx` handles profile fields, message privacy, appearance, password change, data export, and account deletion.
- `PostDetail.tsx` handles comments, replies, edit, delete/restore, moderation actions, activity history, and answer acceptance.
- `JoinOrganization.tsx` searches verified organizations, sends/withdraws requests and shows the learner's request status. Starting a conversation is available from profiles and room member lists.
- `LiveKitAlert.tsx` checks `GET /api/livekit/config/` and shows one global warning when video is not configured.

### Analytics

`src/lib/analytics.ts` loads Umami only when `VITE_UMAMI_SCRIPT_URL` and `VITE_UMAMI_WEBSITE_ID` are set; otherwise every call is a no-op. Pageviews are sent manually without query strings. Product events are coarse labels only (for example `organization_join_requested`). Never add message content, names, emails, search queries, document data, payment references or organization identifiers. See `docs/analytics.md`.

### Design system

The visual language is a warm paper notebook: cream background, coral primary, teal accent, mustard highlights, hand-drawn borders and soft shadows. Tokens live at the top of `src/index.css` (`--color-*`, `--space-*`, `--radius-*`, etc.). The light palette is the original palette and must not drift. Dark mode is implemented with `html[data-theme="dark"]` token overrides; new components must use tokens so both themes keep WCAG AA contrast. Compatibility aliases such as `glass-card` are deliberate; older pages still use them. Add new styles from the tokens and reuse existing classes (`.paper-panel`, `.btn`, `.badge-tag`, `.field`, `.room-*`) instead of introducing a second design system.

### Responsive shell

- Mobile (< 1024 px): sticky top bar, bottom tabs (Home, Search, Rooms, Messages, Profile), floating compose button and safe-area padding.
- Tablet: icon-only left rail, centered feed, no right suggestions panel.
- Desktop: full left nav, centered feed, right suggestions rail.
- Messages appears in desktop navigation and the mobile bottom bar, with an unread badge.

### PWA

`public/manifest.webmanifest` and `public/sw.js` provide an installable shell. The manifest starts at `/feed` and declares 192/512/maskable icons. The service worker caches the app shell and same-origin static assets, **never** `/api`, `/ws`, `/admin` or cross-origin responses. It registers in production only. Any new static shell file added to the precache list must actually exist, or `cache.addAll` fails. Bump the service-worker cache version when the shell changes.

Profile usernames may contain dots. Vite's dev server normally treats dotted paths as files, so `vite.config.ts` rewrites HTML requests under `/profile/*` to `index.html`. Production hosting still needs an SPA fallback rewrite for `/profile/*` and the other client routes.

## 12. Institutional portal

The portal is a separate Vite app in `../curious-bright-institutional/apps/institutional-web`.

- It talks to the Django API via `src/lib/api.ts` (JWT Bearer, snake_case fields, typed responses). Every request also sends `X-Client-App: institutional`.
- Development: `/api` and `/media` are proxied to `http://localhost:8000`; `VITE_API_URL` should stay blank.
- Production: set `VITE_API_URL` to the full API base including `/api` (for example `https://api.curiousbright.com.ng/api`). For a Cloudflare/static deployment, also provide an SPA fallback for `/invitations/*`, `/verification/email/*` and `/billing/verify`.
- Views: organization overview/stats, members, invitations, student CSV import/creation/linking, join-request review, verification, billing plans and subscription checkout, organization settings/audit/deactivation.
- A persistent verification banner and modal show status/reviewer notes, allow document download/resubmission and resend the official-email confirmation. Student/invite/link controls are disabled until verified, and the API enforces the same rule.
- Invitation links use `${ORG_FRONTEND_URL}/invitations/<uuid>` from Django and land on the portal acceptance gate.
- Billing is `POST /api/organizations/<slug>/subscribe/` and Paystack verification happens in Django. The callback lands on `/billing/verify?reference=...`, which calls the authenticated Django verification endpoint.
- The landing page's `/pricing` CTAs pass `plan`, `interval` and `currency` to the portal; the portal opens the filtered billing view. Pricing lives only on the public landing page.
- It loads Umami only when both `VITE_UMAMI_*` variables are set and sends only coarse section/event labels.

## 13. Tests and validation

Backend suite (currently 136 tests):

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
pnpm --filter landing-page build

cd /path/to/curious-bright-institutional
pnpm --filter institutional-web build
```

The backend tests cover visibility, PII-safe serializers, editing/conflict handling, soft delete/undo, comments for authors/moderators, rooms, WebSockets, whiteboard persistence, research revisions, organization permissions/CSV/students, verification and join-request security, private messaging and conversation privacy, billing, profile counts, account deletion, and the error contract. Add a regression test when fixing a bug in one of these areas.

## 14. Deployment

- Backend image is built from the root `Dockerfile`; `apps/backend/scripts/start.sh` runs migrations, optional admin bootstrap, `collectstatic`, then uvicorn/ASGI.
- Required production services: PostgreSQL and Redis. Set `DATABASE_URL` and `REDIS_URL`.
- Required secrets/config: `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`, `WS_ALLOWED_ORIGINS`, `ORG_REGISTRATION_ALLOWED_ORIGINS`, `PRIVATE_MEDIA_ROOT`, plus Paystack/LiveKit/SMTP values as needed.
- Run with more than one worker only when `REDIS_URL` is configured; otherwise WebSockets are in-process.
- WhiteNoise serves static files. Public media uses the container filesystem and is served by Django; mount a persistent volume or move to object storage before relying on uploads.
- Verification documents use a **separate private volume** at `PRIVATE_MEDIA_ROOT`; never expose it through `/media/`, nginx/Caddy static roots or a public CDN.
- Paystack callback: `https://org.curiousbright.com.ng/billing/verify`. Paystack webhook: `https://<api-host>/api/billing/webhook/paystack/`. The endpoint validates the HMAC-SHA512 signature and is idempotent.
- LiveKit requires the exact `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. `GET /api/livekit/config/` is the public status endpoint; the global alert covers misconfiguration.
- The institutional portal can be deployed to Cloudflare Pages/Workers or any static host, with `VITE_API_URL` ending in `/api` and SPA rewrites for invitation, email-confirmation and billing-verification routes.
- The member app must be served with SPA rewrites and a non-long-cached `/sw.js`; see `docs/pwa.md`.
- Analytics is optional and disabled until `VITE_UMAMI_SCRIPT_URL` and `VITE_UMAMI_WEBSITE_ID` are set at build time. See `docs/analytics.md`.
- Operational details: `docs/deployment.md`, `docs/verification.md`, `docs/messaging.md`, `docs/pwa.md`, `docs/analytics.md`.

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

- The legacy Expo app and the packages used only by it are not part of the active deploy. They must not be deleted without the cleanup approval process in the project instructions.
- Public and verification media use local/container filesystems until object storage is added; verification media must stay private.
- The institutional portal and member/landing apps have no automated frontend test suite yet; verify with production builds and browser smoke tests.
- Search is `icontains`-based and capped per section, not a dedicated search engine.
- Production SPA hosting must provide rewrites for dotted profile URLs, invitation/email-confirmation links and the other React routes.
- Analytics remains disabled until an Umami host and website IDs are provisioned and the tool choice is explicitly confirmed.
- Production SMTP delivery must be confirmed before treating verification/join-email flows as production-ready.
