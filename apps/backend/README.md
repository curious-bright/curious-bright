# Curious Bright Backend (Django)

Django 5.2 + DRF + SimpleJWT + PostgreSQL API with a Unfold-powered admin.
Replaces the retired Express backend.

## Quick start (local, SQLite)

```bash
cd apps/backend
python3.14 -m venv venv            # already prepared in this repo
venv/bin/pip install -r requirements.txt
venv/bin/python manage.py migrate
ADMIN_USERNAME=learnadmin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Str0ng!DevPass99' \
  venv/bin/python manage.py ensure_admin
venv/bin/python manage.py runserver 8765
```

With `DATABASE_URL` unset, SQLite (`db.sqlite3`) is used automatically. Production
must set `DATABASE_URL` (PostgreSQL) — see [Deployment](#deployment-northflank).

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | **prod yes** | dev fallback (insecure) | Django secret; set a long random value in production |
| `DJANGO_DEBUG` | no | `true` | `true/1/yes/on` enables debug; production must be `false` |
| `DJANGO_ALLOWED_HOSTS` | **prod yes** | `localhost,127.0.0.1` | Comma-separated hostnames |
| `CSRF_TRUSTED_ORIGINS` | **prod yes** | `http://localhost:5173,...` | Comma-separated origins for CSRF |
| `DATABASE_URL` | **prod yes** | — | `postgres://user:pass@host:5432/db`; unset → SQLite |
| `USE_SQLITE` | no | `false` | Force SQLite even if `DATABASE_URL` set (local only) |
| `CORS_ALLOWED_ORIGINS` | no | `http://localhost:5173,...` | Comma-separated browser origins |
| `ADMIN_USERNAME` | no (optional) | — | Bootstrap superuser username; `start.sh` skips `ensure_admin` when unset |
| `ADMIN_EMAIL` | no (optional) | — | Bootstrap superuser email |
| `ADMIN_PASSWORD` | no (optional) | — | Bootstrap superuser password (min 8 chars enforced by Django) |

Fixed (not env-tunable): JWT access 30 min / refresh 7 days with rotation +
blacklisting; throttle rates `anon 200/min`, `user 600/min`, `auth 10/min`
(login endpoint); pagination page size 20.

## Admin bootstrap

- `venv/bin/python manage.py ensure_admin` — idempotent. Run directly it
  **fails loudly** with a `CommandError` if `ADMIN_USERNAME/EMAIL/PASSWORD` are
  missing. Creates a `is_staff` + `is_superuser` user (profile auto-created via
  `post_save` signal). Never resets the password of an existing admin (rotate it
  manually in Django admin or `changepassword`).
- `start.sh` only calls it when all three `ADMIN_*` vars are set; otherwise it
  logs a skip message and the deploy continues. Create the superuser yourself
  from the server shell instead: `python manage.py createsuperuser`.
- **Admin dashboard:** `/admin/` logs in with username + password and runs on
  the Django Unfold theme (light/dark, branded navigation). It shows metric
  cards — member, post, open-report, pending-application, room, comment,
  research-document and badge counts — a 14-day activity chart, review-status
  donut, subject mix, top contributors, and recent-activity panels (posts
  awaiting review, open reports, pending moderator applications, newest
  members).
- Data migration `accounts/0002_bootstrap_admin` runs the same logic at deploy
  time but is **lenient**: if the env vars are missing it is a no-op, so builds
  don't break.

## Deployment (Northflank)

- **Image:** built from the repository root `Dockerfile`. The entrypoint is
  `apps/backend/scripts/start.sh`, which runs `migrate --noinput`,
  `ensure_admin` (only when `ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`
  are all set), `collectstatic --noinput`, then gunicorn on `${PORT:-8000}`.
- **Database:** link a Northflank PostgreSQL addon to the service and expose its
  connection string as `DATABASE_URL`. Keep `DJANGO_DEBUG=false`.
- **Required secrets:** `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
  `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`. `ADMIN_*` are optional —
  drop them and run `python manage.py createsuperuser` in the platform shell.
- **First boot:** expect one `Applying …` line per migration, then
  `collectstatic`, then gunicorn startup. Verify with `GET /healthz/`
  (`200 {"status": "ok", "database": true}`). `render.yaml` is a legacy template and is not used by Northflank.
- **Troubleshooting stale databases:** `relation "accounts_user" does not exist`
  during `accounts.0002_bootstrap_admin` means `django_migrations` records
  `accounts.0001_initial` while the table was never created (partial deploy).
  Confirm with `\dt` and `SELECT * FROM django_migrations WHERE app='accounts';`.
  For a fresh environment, reset the schema and redeploy:

  ```sql
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  ```

  Do not delete migration rows selectively — other apps may be recorded without
  their tables too.
- **Media files:** `MEDIA_ROOT` is inside the container, so uploaded PDFs are
  lost on redeploy. Mount a persistent volume at `apps/backend/media` (or switch
  to object storage) for durable uploads.

## API overview (all JSON, trailing slashes)

- Auth: `POST /api/auth/register/`, `POST /api/auth/token/` (username **or**
  email), `POST /api/auth/token/refresh/`, `POST /api/auth/logout/` (blacklists),
  `GET/PATCH /api/auth/me/`
- Profiles: `GET /api/profiles/<username>/`, `PATCH /api/profiles/me/`,
  `POST/DELETE /api/profiles/<username>/follow/`
- Community: `GET/POST /api/posts/`, `GET/DELETE /api/posts/<id>/`,
  `GET /api/feed/?tab=following|discover`, `GET/POST /api/posts/<id>/equations/`,
  `GET/POST /api/posts/<id>/comments/`, `POST /api/comments/<id>/replies/`,
  `POST/DELETE /api/posts/<id>/like/`, `POST/DELETE /api/comments/<id>/helpful/`,
  `POST /api/posts/<id>/accept-answer/`, `POST /api/posts/<id>/solve/`,
  `GET /api/notifications/?unread=true`, `POST /api/notifications/read/`
  - Post filters: `subject`, `level`, `kind`, `search`, `author`, `status`
    (`published|pending|rejected`), `attachment` (`only` = papers with a PDF,
    `none` = plain notes). All list endpoints are paginated:
    `{count, next, previous, results}` (`page_size=20`).
  - Papers: `POST /api/posts/` accepts multipart `attachment` (PDF, ≤25 MB) →
    saved as `pending` (needs moderator approval) with `attachment_url` in the
    response; posts without an attachment publish immediately.
- Moderation: `POST /api/posts/<id>/flag/` (body `{reason}`, one report per
  user per post), `GET /api/moderation/queue/` (pending posts),
  `POST /api/moderation/queue/<id>/approve|reject/`,
  `GET /api/moderation/reports/` (unresolved),
  `POST /api/moderation/reports/<id>/resolve/`,
  `GET/POST /api/moderator-applications/` (motivation ≥80 chars, non-empty
  `subjects`), `GET /api/moderator-applications/me/` (404 = none yet),
  `POST /api/moderator-applications/<id>/approve|decline/` (staff only;
  approve grants `is_moderator`). Queue/reports require `is_moderator` or
  staff; `/api/auth/me/` exposes `is_moderator` and `can_moderate`.
- Rooms: `GET/POST /api/rooms/`, `GET /api/rooms/<id>/`, `POST/DELETE
  /api/rooms/<id>/join/`, `GET /api/rooms/<id>/members/`,
  `GET/POST /api/rooms/<id>/messages/` (`?after=<id>` for incremental
  polling; first load returns the latest 100 in chronological order).
- Search: `GET /api/search/?q=` → `{posts, rooms, users}` (max 10 each,
  public; empty query returns empty lists).
- Gamification: badges appear on profile responses; awarded automatically
  (`award_badge`) — Teacher (helpful/accepted comment), Solver (accepted answer
  / question solved), Collaborator (co-authored revision)
- Research: `GET/POST /api/documents/`, `GET/PATCH /api/documents/<id>/`,
  `POST /api/documents/<id>/invite/`, `GET /api/invitations/`,
  `POST /api/invitations/<id>/accept|decline/`, `POST /api/documents/<id>/edit/`
  (creates a revision → Collaborator badge)

## Error contract

Every error (4xx/5xx on `/api/…`) returns:

```json
{ "code": "validation_error", "message": "Human readable.", "details": { "field": ["…"] } }
```

Codes: `validation_error`, `unauthorized`, `unauthenticated`, `not_found`,
`forbidden`, `throttled`, `internal_error`. The frontend `lib/api.ts` maps these
to global alerts; 401 triggers a single-flight token refresh, then a global
alert if refresh fails.

## Edge cases handled (and worth knowing)

- **Duplicate badges**: `award_badge` uses `get_or_create` — awarding the same
  badge twice is a no-op (no duplicates, no error).
- **Self-follow / duplicate follow**: blocked server-side with 400
  `validation_error`; unfollowing someone you don't follow → 404 `not_found`.
- **Optimistic UI rollback**: frontend like/follow toggles roll back the local
  state if the API call returns `null`/fails, and re-sync from server counts.
- **Permission errors**: modifying someone else's post/comment → 403 `forbidden`;
  unauthenticated writes → 401 `unauthenticated` (shape verified).
- **Login rate limit**: 10/min per scope → 429 `throttled` with the same error
  shape.
- **Refresh reuse**: rotated/blacklisted refresh tokens → 401; frontend logs out
  and shows one global alert (no alert storms — single-flight refresh).
- **Mentions**: `@username` in posts/comments creates notifications only for
  mentioned users who exist; self-mentions are skipped.
- **Admin password rotation**: `ensure_admin` never overwrites an existing
  admin's password — rotate manually (Django admin → users → password, or
  `manage.py changepassword`).
- **SQLite fallback**: convenient locally, but production must set
  `DATABASE_URL`; `start.sh` runs migrations + `ensure_admin` before gunicorn.
- **Attachment review gate**: posts with a PDF are created as `pending` and are
  hidden from everyone except their author and moderators (`404` for others)
  until approved. Rejecting keeps them hidden permanently (the author is
  notified either way).
- **Reports**: a user cannot report their own post or report the same post
  twice (400 `validation_error`); resolving an already-resolved report is
  idempotent. Reports surface post title/author so the queue renders without
  extra fetches.
- **Moderator applications**: one application per user (`400` on duplicates);
  `/me/` returns `404 not_found` when there is none (the UI treats that as
  "not applied yet"); approving sets `is_moderator` and unlocks the queue.
- **Room polling**: clients poll `?after=<last id>` every few seconds and
  dedupe by message id; the first fetch returns the latest 100 messages in
  chronological order, so reconnects never replay history.
- **Search**: public, case-insensitive `icontains` across post titles/bodies,
  room names/descriptions, and usernames; results are capped per section.
- **HTML caching / dev media**: uploaded PDFs are served from `/media/` only
  when `DEBUG=true`; production should serve them via the reverse proxy or
  object storage.
