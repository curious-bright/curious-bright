# Curious Bright Backend (Django)

Django 5.2 + DRF + SimpleJWT + PostgreSQL API. Replaces the retired Express backend.

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
must set `DATABASE_URL` (PostgreSQL) — see `render.yaml` and `Dockerfile`.

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
| `ADMIN_USERNAME` | first deploy | — | Bootstrap admin username (`ensure_admin`) |
| `ADMIN_EMAIL` | first deploy | — | Bootstrap admin email |
| `ADMIN_PASSWORD` | first deploy | — | Bootstrap admin password (min 8 chars enforced by Django) |

Fixed (not env-tunable): JWT access 30 min / refresh 7 days with rotation +
blacklisting; throttle rates `anon 200/min`, `user 600/min`, `auth 10/min`
(login endpoint); pagination page size 20.

## Admin bootstrap

- `venv/bin/python manage.py ensure_admin` — idempotent. **Fails loudly** with a
  `CommandError` if `ADMIN_USERNAME/EMAIL/PASSWORD` are missing. Creates a
  `is_staff` + `is_superuser` user (profile auto-created via `post_save` signal).
  Never resets the password of an existing admin (rotate it manually in Django
  admin or `changepassword`).
- Data migration `accounts/0002_bootstrap_admin` runs the same logic at deploy
  time but is **lenient**: if the env vars are missing it is a no-op, so builds
  don't break.

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
- **Legacy pages**: pre-existing pages (`/browse`, `/rooms`, …) still call
  retired Express endpoints; `apiFetch` returns `null` and they render their
  empty states instead of crashing.
