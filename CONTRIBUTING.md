# Contributing to Curious Bright

Thank you for helping build a more generous learning community. Contributions are welcome from developers, researchers, students and educators.

## Before you start

- Search existing issues before opening a new one.
- For larger changes, open an issue first so the API contract, permissions and UI direction can be agreed.
- Never commit secrets, `.env` files, API keys or production credentials.

## Development setup

```bash
# JavaScript workspace (member web + landing page)
pnpm install

# Django API
cd apps/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 0.0.0.0:8000

# Member web app
cd ../..
pnpm --filter web dev
```

Optional infrastructure (PostgreSQL, Redis, LiveKit) can be started with `docker compose up -d`. Update `apps/backend/.env` with `DATABASE_URL` / `REDIS_URL` if you use it.

The institutional portal lives in the separate `curious-bright-institutional` repository. It uses the same Django API.

## What to work on

Active surfaces:

- `apps/backend` — Django REST API, Channels, PostgreSQL/SQLite, Paystack, LiveKit.
- `apps/web` — member-facing React/Vite app.
- `apps/landing-page` — marketing site.

`apps/mobile` is a retained legacy Expo client and is not part of the current deploy. Avoid adding new features there unless the issue explicitly targets it. `packages/ui-kit` remains active for the member and landing apps; the other package workspaces support the legacy mobile client.

## Coding standards

### Backend

- Keep authorization and visibility in Django/DRF; never rely on the client to hide private data.
- Use `visible_posts()` / `can_view_post()` for post reads and visibility-aware realtime groups for events.
- Public serializers must not expose email or other private account fields.
- Return the standard `{code, message}` error envelope. Do not add `detail` to API errors.
- If you change a model, add a migration and run the test suite. Never edit an applied migration.
- Add regression tests for permissions, visibility, cascade behaviour, billing state and error shapes.

### Frontend

- Go through `src/lib/api.ts` for HTTP; use `apiFetch`, `apiVoid` or `apiDownload` so auth refresh and global alerts behave consistently.
- Preserve the paper-notebook design tokens and shared component classes in `src/index.css`. Do not introduce a separate design system.
- Keep the backend as the source of truth for follow/like/visibility state; optimistic UI must roll back on failure.
- Heavy routes (video room and PDF reader) should remain lazy-loaded.
- Verify mobile layouts, keyboard navigation and modal focus behaviour.

## Validation

```bash
# Backend
cd apps/backend
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test

# Member web
pnpm --filter web build

# Institutional portal (separate repo)
cd ../curious-bright-institutional
pnpm --filter institutional-web build
```

No change is ready to merge if the backend suite or either build fails. For UI changes, include a short manual smoke test in the PR description.

## Pull requests

1. Link the issue and describe the user-visible change.
2. Explain any API/schema changes and any migration.
3. Include validation output (`Tests`, `Build`).
4. Keep commits logical and focused; do not mix unrelated refactors with a bug fix.
5. Update documentation when setup, environment variables, API contracts or deployment behaviour changes.

## Contributor License Agreement

First-time contributors must sign the Contributor License Agreement before a pull request can be merged. The CLA assistant will prompt you on your first PR.

## Questions

Open an issue with the `question` label or start a discussion. For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
