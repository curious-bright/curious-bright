# Curious Bright Backend (Django)

Django 5.2 + Django REST Framework + SimpleJWT + Channels + PostgreSQL, with a Unfold-powered admin. This is the authoritative API for the member web app and the institutional portal; the old Express backend is retired.

## Quick start (local, SQLite)

```bash
cd apps/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env                 # optional but recommended
.venv/bin/python manage.py migrate

# First admin — set ADMIN_USERNAME/ADMIN_EMAIL/ADMIN_PASSWORD in .env first.
.venv/bin/python manage.py ensure_admin

.venv/bin/python manage.py runserver 0.0.0.0:8000
```

`config/settings.py` loads `apps/backend/.env` automatically. Environment variables already present in the process take precedence. With `DATABASE_URL` empty, SQLite (`db.sqlite3`) is used automatically. Production must use PostgreSQL.

Run `manage.py check` and `manage.py makemigrations --check --dry-run` before shipping schema changes.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | **prod yes** | insecure dev fallback | Django secret; use a long random value in production |
| `DJANGO_DEBUG` | no | `true` | `true/1/yes/on`; production must be `false` |
| `DJANGO_ALLOWED_HOSTS` | **prod yes** | `localhost,127.0.0.1` | Comma-separated hostnames |
| `CSRF_TRUSTED_ORIGINS` | **prod yes** | local web origins | Comma-separated origins for CSRF |
| `DATABASE_URL` | **prod yes** | empty → SQLite | `postgres://user:pass@host:5432/db` |
| `USE_SQLITE` | no | `false` | Force SQLite locally |
| `CORS_ALLOWED_ORIGINS` | **prod yes** | local web/portal origins | Browser origins allowed to call the API and open WebSockets |
| `WS_ALLOWED_ORIGINS` | prod recommended | derived from CORS | Explicit WebSocket origin allow-list |
| `ORG_REGISTRATION_ALLOWED_ORIGINS` | prod yes | portal + localhost | Origins allowed to create an organization; the portal also sends `X-Client-App` |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | — | Bootstrap superuser for `ensure_admin`; never commit real values |
| `REDIS_URL` | prod recommended | — | Channels Redis layer; required for multiple ASGI workers |
| `LIVEKIT_URL` | video | — | Exact public LiveKit WebSocket URL (`wss://…`) |
| `LIVEKIT_API_KEY` | video | — | LiveKit API key |
| `LIVEKIT_API_SECRET` | video | — | Server-only LiveKit secret |
| `LIVEKIT_TOKEN_TTL_SECONDS` | no | `7200` | Video token lifetime |
| `EMAIL_BACKEND` | no | console | Django backend for moderation approval mail |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` / `EMAIL_USE_TLS` | no | — / 587 / — / — / true | SMTP credentials for `EMAIL_BACKEND` |
| `EMAIL_PROVIDER` | prod yes | `console` in DEBUG, `resend` otherwise | Account, organization and verification delivery: `console`, `django` or `resend` |
| `RESEND_API_KEY` | with Resend | — | Server-only Resend API key; never expose to a frontend |
| `RESEND_API_URL` | no | `https://api.resend.com/emails` | Resend API endpoint override |
| `RESEND_TIMEOUT_SECONDS` / `RESEND_MAX_ATTEMPTS` / `RESEND_RETRY_BASE_SECONDS` | no | 10 / 3 / 1 | HTTPS timeout, attempt count and exponential backoff |
| `DEFAULT_FROM_EMAIL` | no | `noreply@curiousbright.com.ng` | Sender address for all transactional mail |
| `EMAIL_FROM_NAME` | no | `CuriousBright` | Display name in the From header |
| `SUPPORT_EMAIL` / `EMAIL_REPLY_TO` | no | `support@curiousbright.com.ng` | Footer contact and Reply-To |
| `EMAIL_DELIVERY_ASYNC` / `EMAIL_DELIVERY_WAIT_SECONDS` | no | true in prod, false in DEBUG / 8 | Background delivery and resend-endpoint wait |
| `EMAIL_VERIFICATION_*` | no | 600 / 60 / 5 / 5 / 10 | Code TTL, resend cooldown, max attempts, email and IP hourly limits |
| `PASSWORD_RESET_*` | no | 1800 / 60 / 5 / 10 | Reset token TTL, cooldown, email and IP hourly limits |
| `ORG_FRONTEND_URL` | no | `https://org.curiousbright.com.ng` | Portal base; verification email links and default billing callback |
| `APP_FRONTEND_URL` | no | `https://app.curiousbright.com.ng` | Member app URL |
| `LANDING_FRONTEND_URL` | no | `https://curiousbright.com.ng` | Public pricing site, added to CORS |
| `PRIVATE_MEDIA_ROOT` | **prod yes** | `apps/backend/private_media` | Private verification-document storage; never serve as `/media/` |
| `BILLING_CALLBACK_URL` | no | `${ORG_FRONTEND_URL}/billing/verify` | Paystack return URL handled by the portal |
| `PAYSTACK_PUBLIC_KEY` | billing | — | Public key |
| `PAYSTACK_SECRET_KEY` | billing | — | Server key and default webhook signature secret |
| `PAYSTACK_WEBHOOK_SECRET` | no | falls back to secret key | Separate webhook secret |
| `PAYSTACK_API_BASE` | no | `https://api.paystack.co` | Test/sandbox override |
| `BILLING_PRO_NGN` | no | `500000` | Legacy pro fallback in kobo |
| `BILLING_PRO_USD` | no | `1200` | Legacy pro fallback in cents |
| `SOFT_DELETE_UNDO_SECONDS` | no | `300` | Client undo/restore window |
| `SOFT_DELETE_RETENTION_DAYS` | no | `30` | Purge horizon |

Fixed behaviour: JWT access 30 minutes / refresh 7 days with rotation and blacklisting; throttles `anon 200/min`, `user 600/min`, `auth 10/min`, plus scoped `verify_email 20/min`, `resend_code 6/min`, `change_email 6/min` and `password_reset 6/min`; page size 20.

Transactional verification and reset mail uses `EMAIL_PROVIDER` and Resend in production; only hashes of codes/tokens are stored. See [docs/email.md](../../docs/email.md) for Resend setup, the Cloudflare DNS checklist, local console-email testing and pre-launch checks. The Resend key is read only from `RESEND_API_KEY` and must never be committed or exposed to a frontend.

Billing plan prices are seeded through `billing.PlanTier` migrations. `PLAN_DEFINITIONS` in `apps/billing/plans.py` is the fallback, not the production source of truth.

## Admin bootstrap

- `.venv/bin/python manage.py ensure_admin` is idempotent. Run directly, it fails loudly if `ADMIN_USERNAME`, `ADMIN_EMAIL` or `ADMIN_PASSWORD` are missing. It creates an `is_staff` + `is_superuser` user. The profile is created by a signal.
- It never resets an existing admin's password. Rotate passwords with Django admin or `manage.py changepassword`.
- `scripts/start.sh` calls it only when all three `ADMIN_*` variables are set; otherwise it logs a skip and continues.
- Data migration `accounts/0002_bootstrap_admin` applies the same bootstrap leniently, so a deploy without admin variables still succeeds.
- Admin dashboard: `/admin/` uses Django Unfold (username + password) with member/post/report/room/research/badge metrics, activity chart, review-status and subject charts, top contributors and recent activity.

## API overview

All REST paths below are prefixed with `/api/`. Unless noted, endpoints expect trailing slashes and list responses are paginated as `{count, next, previous, results}`.

### Authentication and account

- `POST auth/register/` — creates an unverified account; returns no JWT
- `POST auth/verify-email/` — six-digit code; returns JWT + user on success
- `POST auth/resend-code/` — 60-second cooldown and hourly email/IP limits
- `POST auth/change-email/` — current password + new email; sends a fresh code
- `POST auth/password-reset/` — always the same response; single-use 30-minute link
- `POST auth/password-reset/confirm/` — sets a new password and emails a change notice
- `POST auth/token/` — username **or** email; unverified accounts get `403 email_unverified`
- `POST auth/token/refresh/` — rotation + blacklisting
- `POST auth/logout/`
- `GET/PATCH auth/me/` — includes `is_email_verified`
- `POST auth/change-password/` — also sends a password-changed notice
- `GET auth/export/` — JSON download of account data
- `POST auth/delete-account/` — requires password + `"delete my account"`; blocked for organization owners (409 `organization_owner`)

### Profiles and follows

- `GET auth/profiles/<username>/` — public profile; never exposes email; post count reflects what the viewer may see
- `POST/DELETE auth/profiles/<username>/follow/`
- `GET auth/profiles/<username>/is-following/`
- `GET auth/profiles/<username>/followers/`
- `GET auth/profiles/<username>/following/`

### Community

- `GET/POST posts/`
- `GET/PATCH/DELETE posts/<id>/`
- `POST posts/<id>/restore/`
- `POST/DELETE posts/<id>/like/`
- `POST posts/<id>/solve/`
- `GET posts/<id>/activity/` — moderation/audit activity
- `GET/POST posts/<id>/comments/`
- `GET/PATCH/DELETE comments/<id>/`
- `POST comments/<id>/restore/`
- `POST/DELETE comments/<id>/helpful/`
- `POST comments/<id>/accept/`
- `GET feed/discover/`
- `GET feed/following/`
- `GET notifications/?unread=true`
- `POST notifications/read-all/`

Post filters include `subject`, `level`, `kind`, `search`, `author`, `status`, and `attachment` (`only`/`none`). `POST posts/` accepts JSON or multipart with `attachment` (PDF ≤ 25 MB). PDFs enter `pending` review; plain notes publish immediately. Updates accept `expected_updated_at`; stale updates return 409 `conflict`.

Visibility options are `public`, `followers`, and `room_only` (requires `room`). See `apps/community/visibility.py` — the same rules power HTTP and WebSocket access.

### Moderation

- `POST posts/<id>/flag/`
- `GET moderation/queue/`
- `POST moderation/queue/<id>/approve/`
- `POST moderation/queue/<id>/reject/`
- `GET moderation/reports/`
- `POST moderation/reports/<id>/resolve/`
- `GET/POST moderator-applications/`
- `GET moderator-applications/me/`
- `POST moderator-applications/<id>/approve/` or `/decline/`

### Rooms, live video and whiteboard

- `GET/POST rooms/`
- `GET/PATCH/DELETE rooms/<id>/`
- `POST rooms/<id>/restore/`
- `POST/DELETE rooms/<id>/join/`
- `GET rooms/<id>/members/`
- `GET/POST rooms/<id>/messages/` — `?after=<id>` returns newer messages
- `POST rooms/<id>/livekit-token/` — 503 `livekit_not_configured` when env is missing
- `GET livekit/config/` — public, secret-free configuration status for the global alert
- `GET/DELETE rooms/<id>/whiteboard/` — snapshot and host-only clear

Join a room before reading/sending messages, minting a video token or opening the whiteboard. Room hosts and organization admins/owners can edit or delete rooms.

### Research

- `GET/POST research/`
- `GET/PATCH/DELETE research/<id>/`
- `POST research/<id>/restore/`
- `POST research/<id>/invite/`
- `GET research/<id>/revisions/`
- `POST research/<id>/revisions/<revision_id>/restore/`
- `GET research/invitations/`
- `POST research/invitations/<id>/respond/`

Saving a document creates a revision; restoring a revision creates a new revision rather than rewriting history.

### Organizations and students

- `GET/POST organizations/`
- `GET/PATCH/DELETE organizations/<slug>/`
- `GET organizations/<slug>/members/`
- `POST organizations/<slug>/members/invite/`
- `PATCH/DELETE organizations/<slug>/members/<id>/`
- `POST organizations/<slug>/members/link/`
- `GET organizations/<slug>/invitations/`
- `DELETE organizations/<slug>/invitations/<id>/`
- `POST organizations/<slug>/students/`
- `POST organizations/<slug>/students/import/`
- `GET organizations/<slug>/members.csv`
- `GET organizations/students/template/`
- `GET organizations/<slug>/stats/`
- `GET organizations/<slug>/audit-logs/`
- `GET organizations/invitations/me/`
- `POST organizations/invitations/<uuid>/accept/`
- `POST organizations/join-by-domain/`
- `GET/POST organizations/<slug>/verification/` — read or submit verification (admins)
- `POST organizations/<slug>/verification/resend/` — resend official-email confirmation
- `POST organizations/verification/email/<uuid:token>/` — public, single-use email confirmation
- `GET organizations/<slug>/verification/document/` — private document download (org admins or staff)
- `GET organizations/search/?q=` — verified organizations only
- `GET/POST organizations/<slug>/join-requests/` — admin list or learner create
- `GET organizations/join-requests/me/` — learner's requests
- `POST organizations/join-requests/<id>/withdraw/`
- `POST organizations/<slug>/join-requests/<id>/decision/` — approve/reject with optional note

Roles are `owner > admin > moderator > teacher > student > member`. Owners manage billing and deactivation; admins manage lower roles. Pending invitations and active members count against the seat limit. New accounts auto-accept matching invitations and can auto-join an organization with `auto_join_domain`.

Public sign-ups (member app and institutional admin self-signup) must verify their email. Student accounts created directly by an organization admin, including CSV imports, are trusted and marked verified automatically; they receive a temporary password instead of a verification code. Existing accounts were marked verified by migration when this feature shipped.

Organization creation is restricted to `ORG_REGISTRATION_ALLOWED_ORIGINS` (and/or `X-Client-App: institutional`). Verification statuses are `unverified`, `email_pending`, `pending_review`, `verified`, `rejected` and `suspended`. Submission moves an organization to `email_pending`; confirming the official email (single-use 24-hour link or 15-minute code) moves it to `pending_review`; approval is blocked until confirmation. Requesting more information keeps `pending_review` with an info-request flag; rejection and suspension require a note. Only verified organizations can create students, invite/link members, join by domain or approve join requests; existing memberships stay active during re-verification. A verified organization that changes its domain returns to unverified. Verification documents use `PRIVATE_MEDIA_ROOT`, PDF/JPEG/PNG signature validation and a 10 MB limit; admin review uses five-minute signed links. Every transition is audited. See [docs/verification.md](../../docs/verification.md).

### Private messaging

- `GET/POST messages/conversations/`
- `GET messages/conversations/<id>/`
- `GET/POST messages/conversations/<id>/messages/`
- `POST messages/conversations/<id>/read/`
- `DELETE messages/<id>/` — own message tombstone
- `POST messages/<id>/report/`
- `GET messages/unread/`
- `GET messages/blocks/` and `POST/DELETE messages/blocks/<username>/`

Conversations are strictly one-to-one. Reads are participant-scoped and return 404 to outsiders; organization admins and moderators cannot read them. `Profile.message_privacy` controls new conversations (`anyone`, `follows`, `nobody`); existing conversations continue unless either user blocks the other. See [docs/messaging.md](../../docs/messaging.md).

### Billing

- `GET billing/plans/?currency=NGN|USD&interval=month|year` — currency can also be inferred from `CF-IPCountry` / `X-Country-Code`
- `POST billing/checkout/` — `{organization, plan_code, currency, interval}`
- `GET billing/payments/<reference>/`
- `POST billing/payments/<reference>/verify/`
- `POST billing/webhook/paystack/` — HMAC-SHA512 signature required, idempotent
- `GET organizations/<slug>/subscription/`
- `POST organizations/<slug>/subscribe/` — portal-compatible checkout

Amounts are stored in minor units (kobo/cents). USD checkout requires USD enabled on Paystack. A missing or invalid provider configuration returns `billing_not_configured` / `payment_provider_error` rather than a 500.

### Search and health

- `GET search/?q=` — public, capped results across posts, rooms and users
- `GET healthz/` or `/` — `{"status": "ok", "database": true}`

## Realtime (Channels / ASGI)

WebSocket URL prefix: `/ws/`. Authenticate with `?token=<access>`.

- `/ws/feed/` — discover feed updates
- `/ws/posts/<id>/` — post discussion updates after a visibility check
- `/ws/notifications/` — signed-in notifications
- `/ws/rooms/<room_id>/` — chat, typing and presence for members
- `/ws/rooms/<room_id>/whiteboard/` — strokes, live draw relay, undo and host clear
- `/ws/messages/` — per-user unread/conversation-list updates
- `/ws/conversations/<conversation_id>/` — participant-only typing and read receipts

Feed events are published only to groups appropriate to their visibility (`feed.discover`, `feed.user.<id>`, `post.<id>`, `room.<id>`). Private content must never reach the discover group. Room and whiteboard sockets reject non-members during connection.

Redis is required for multiple ASGI workers. Without `REDIS_URL`, the in-memory layer works only inside a single process.

## Error contract

Every `/api/` error returns exactly:

```json
{ "code": "validation_error", "message": "Human readable message." }
```

Validation errors are flattened into the message; there is no separate `details` field. Unhandled API exceptions and HTML 404s are converted by middleware. Each response also carries `X-Request-ID` for tracing.

Common codes: `validation_error`, `bad_request`, `unauthenticated`, `unauthorized`, `forbidden`, `not_found`, `method_not_allowed`, `unsupported_media_type`, `throttled`, `conflict`, `restore_window_expired`, `confirmation_required`, `invalid_password`, `invalid_signature`, `seat_limit_reached`, `plan_not_purchasable`, `billing_not_configured`, `payment_provider_error`, `livekit_not_configured`, `organization_owner`, `no_organization`, `internal_error`.

## Soft delete and audit

Posts, comments, rooms and research documents extend `SoftDeleteModel`:

- Normal querysets hide deleted rows; `all_objects` includes them.
- Deletes set `is_deleted`, `deleted_at`, `deleted_by` and write a `ContentAuditLog` entry.
- The client shows an undo notice; restore endpoints allow undo within `SOFT_DELETE_UNDO_SECONDS` (410 `restore_window_expired` afterwards, except staff/moderators).
- Deleting a room cascades to room-only posts; restoring the room restores only posts deleted in that same cascade.
- Comment tombstones keep thread structure: authors and moderators see all their tombstones; other members do not see deleted top-level comments unless visible replies depend on them.
- Permanent purge is controlled by `SOFT_DELETE_RETENTION_DAYS` and `hard_delete()`.

## Tests

```bash
cd apps/backend
.venv/bin/python manage.py test
```

Current suite: **200 tests**. It covers the error contract, visibility, PII-safe serializers, comment tombstones, edit conflicts, soft delete/undo, rooms, LiveKit error paths, video-session duration tracking, whiteboard persistence, WebSocket permissions, private messaging and conversation privacy, research revisions, organization roles/CSV/students, verification/join-request security, policy consent, staff analytics permissions, billing, viewer-accurate profile counts, and organization-owner deletion guards.

## Deployment (Northflank / Docker)

- Build the repository root `Dockerfile`; the entrypoint is `apps/backend/scripts/start.sh`.
- The image starts with `migrate --noinput`, optional `ensure_admin`, `collectstatic --noinput`, then uvicorn (ASGI) on `${PORT:-8000}`. With `REDIS_URL`, it uses 3 workers by default; otherwise one worker and the in-memory channel layer.
- Link a PostgreSQL addon and expose its URL as `DATABASE_URL`. Keep `DJANGO_DEBUG=false`.
- Required secrets: `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`. `ADMIN_*` are optional.
- For multi-worker realtime, link Redis and set `REDIS_URL`.
- For video, set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- For billing, set `PAYSTACK_SECRET_KEY`; point the Paystack webhook at `https://<api-host>/api/billing/webhook/paystack/` and the return URL at `https://org.curiousbright.com.ng/billing/verify`.
- Media is served from the container filesystem (even with debug off). Attach a persistent volume at `apps/backend/media` or switch to object storage.
- Verification documents use a separate private storage root (`PRIVATE_MEDIA_ROOT`). Attach a second persistent private volume; never expose it through the public media proxy/CDN.
- Set `WS_ALLOWED_ORIGINS` and `ORG_REGISTRATION_ALLOWED_ORIGINS` explicitly in production.
- Verify a deploy with `GET /healthz/`, then `GET /api/posts/`.

### Stale database migration troubleshooting

`relation "accounts_user" does not exist` while applying `accounts.0002_bootstrap_admin` means `django_migrations` recorded the initial migration but the table was never created (partial deploy). For a fresh environment, reset the schema and redeploy:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

Do not delete migration rows selectively; other apps may be similarly inconsistent.
