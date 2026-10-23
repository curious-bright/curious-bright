# Deployment guide

This guide covers the Django API, member web app, marketing site and the
separate institutional portal. It assumes the public surfaces are:

- `https://curiousbright.com.ng` — marketing site (Vercel or any static host)
- `https://app.curiousbright.com.ng` — member PWA
- `https://org.curiousbright.com.ng` — institutional portal (Cloudflare/Wrangler)
- `https://api.curiousbright.com.ng` — Django API/ASGI

Adjust the hostnames consistently in DNS, env vars, CORS/CSRF and OAuth/billing
callbacks.

## 1. Architecture summary

```text
landing ─── public pricing/API fetch ──┐
member app ── REST + WebSockets ───────┼──> Django API (ASGI)
portal ───── REST + WebSockets ────────┘
                                          │
                                          ├─ PostgreSQL
                                          ├─ Redis (Channels)
                                          ├─ LiveKit (video)
                                          ├─ Paystack (billing)
                                          └─ SMTP (verification/invites)
```

The backend is authoritative for verification, roles, visibility, billing and
private messaging. A hidden button is never the security boundary.

## 2. Backend deployment

### 2.1 Required services

- PostgreSQL in production. SQLite is local-only.
- Redis when running more than one ASGI worker, because Channels uses it for
  rooms, notifications and private messages.
- A persistent volume for `apps/backend/media` (avatars, PDFs, logos) and a
  **separate private persistent volume** for `PRIVATE_MEDIA_ROOT`
  (verification documents).
- SMTP for invitations, verification, join-request and billing emails.
- A reverse proxy/load balancer that forwards WebSocket upgrades to the ASGI
  server.

### 2.2 Core environment

```dotenv
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=api.curiousbright.com.ng,localhost
DATABASE_URL=postgres://...
REDIS_URL=redis://...
CSRF_TRUSTED_ORIGINS=https://app.curiousbright.com.ng,https://org.curiousbright.com.ng,https://curiousbright.com.ng
CORS_ALLOWED_ORIGINS=https://app.curiousbright.com.ng,https://org.curiousbright.com.ng,https://curiousbright.com.ng
APP_FRONTEND_URL=https://app.curiousbright.com.ng
ORG_FRONTEND_URL=https://org.curiousbright.com.ng
LANDING_FRONTEND_URL=https://curiousbright.com.ng
PRIVATE_MEDIA_ROOT=/data/private_media
```

`config/settings.py` appends the three frontend origins plus `www` variants to
CORS automatically, and derives `WS_ALLOWED_ORIGINS` from the resulting CORS
list. Set these explicitly in production so a typo in one URL is visible:

```dotenv
WS_ALLOWED_ORIGINS=https://app.curiousbright.com.ng,https://org.curiousbright.com.ng,https://curiousbright.com.ng
ORG_REGISTRATION_ALLOWED_ORIGINS=https://org.curiousbright.com.ng
```

`ORG_REGISTRATION_ALLOWED_ORIGINS` is the origin allow-list for creating an
organization. The portal also sends `X-Client-App: institutional`. This is a UX
guard so the member app cannot accidentally create institutions; API
authorization still controls every action.

### 2.3 LiveKit

The backend reads these exact names:

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_TOKEN_TTL_SECONDS=7200
```

Requirements:

- `LIVEKIT_URL` must be the public LiveKit WebSocket URL. The backend normalises
  a bare host/`https://` URL to `wss://` where possible, but production should
  use the exact `wss://` value from LiveKit.
- The API secret is server-only. Never expose it through `VITE_*`.
- The backend mints short-lived tokens with room identity, participant name,
  avatar metadata and the appropriate room-join grant.
- `GET /api/livekit/config/` exposes only the public URL/config status to the
  browser. If the three variables are missing/invalid, room token requests
  return `503 livekit_not_configured` and the member app shows a global
  “video is not configured” alert instead of failing silently.
- Add the app origins to the LiveKit project's allowed origins if required by
  the project configuration.

Do not put `LIVEKIT_API_SECRET` in the member or portal bundle, Cloudflare
Pages variables, or analytics.

### 2.4 Billing

```dotenv
PAYSTACK_PUBLIC_KEY=...
PAYSTACK_SECRET_KEY=...
PAYSTACK_WEBHOOK_SECRET=...
PAYSTACK_API_BASE=https://api.paystack.co
BILLING_CALLBACK_URL=https://org.curiousbright.com.ng/billing/verify
```

The default callback is now the institutional portal's `/billing/verify`
route. The portal reads `reference` (or `trxref`) and calls
`POST /api/billing/payments/<reference>/verify/`, which requires the signed-in
organization user and verifies with Paystack. The route must fall back to the
SPA on the portal host.

Point the Paystack webhook at:

```text
https://api.curiousbright.com.ng/api/billing/webhook/paystack/
```

The webhook verifies the HMAC-SHA512 signature, is idempotent and is the
authoritative fallback if the browser never returns. USD checkout requires USD
enabled on the Paystack account.

### 2.5 Email / SMTP

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
EMAIL_USE_TLS=true
DEFAULT_FROM_EMAIL=no-reply@curiousbright.com.ng
```

Configure SPF, DKIM and DMARC before launch. Verification, invitation and
join-request emails are essential; console email is a local development
fallback only. A `sent: false` response from the resend endpoint means the
message could not be delivered and should be surfaced to the organization
admin.

### 2.6 Private media

```dotenv
PRIVATE_MEDIA_ROOT=/data/private_media
```

- Verification documents are written with Django private file storage, never
  under `MEDIA_ROOT`.
- The only download path is the authenticated
  `organizations/<slug>/verification/document/` endpoint, restricted to org
  admins/owners and platform staff.
- Do **not** add `private_media` to nginx/Caddy static roots, object-storage
  public buckets or a CDN cache.
- Back up both media volumes; losing verification documents blocks reviews.
- If moving to object storage, keep the private bucket and signed/streamed
  access. Do not rewrite the URL to a public object URL.

### 2.7 Start and check

The Docker entrypoint runs migrations, optional admin bootstrap,
`collectstatic`, then uvicorn/ASGI. Before or after deploy:

```bash
apps/backend/.venv/bin/python apps/backend/manage.py check
apps/backend/.venv/bin/python apps/backend/manage.py makemigrations --check --dry-run
curl -fsS https://api.curiousbright.com.ng/healthz/
```

Health response: `{"status":"ok","database":true}`.

## 3. Member web app

Build-time variables (`apps/web/.env`):

```dotenv
VITE_API_URL=https://api.curiousbright.com.ng
VITE_WS_URL=wss://api.curiousbright.com.ng
VITE_REALTIME_URL=https://api.curiousbright.com.ng
VITE_SIGNALING_URL=https://api.curiousbright.com.ng
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
VITE_ORG_URL=https://org.curiousbright.com.ng
VITE_UMAMI_SCRIPT_URL=https://analytics.curiousbright.com.ng/script.js
VITE_UMAMI_WEBSITE_ID=<id>
```

Build:

```bash
pnpm --filter web build
```

Deploy `apps/web/dist` to a static host with SPA fallback for `/feed`,
`/profile/*`, `/messages`, `/rooms/*`, `/research/*`, `/settings/*` and the
other React Router paths. The host must not cache `/sw.js`; see
[`docs/pwa.md`](pwa.md).

## 4. Marketing site and public pricing

`apps/landing-page` builds to static assets:

```dotenv
VITE_API_URL=https://api.curiousbright.com.ng
VITE_ORG_URL=https://org.curiousbright.com.ng
VITE_UMAMI_SCRIPT_URL=...
VITE_UMAMI_WEBSITE_ID=...
```

The `/pricing` page fetches
`/api/billing/plans/?currency=NGN|USD&interval=month|year`, shows only NGO,
Research Institute and University tiers, and sends plan CTAs to the portal with
`?plan=...&interval=...&currency=...`. The portal pre-selects the billing
section and highlights the requested plan. Keep the Vercel SPA rewrite so
`/pricing` deep links work.

The landing page is public and does not need JWT auth. It must remain in the
API CORS allow-list (`LANDING_FRONTEND_URL`).

## 5. Institutional portal (separate repository)

The portal is deployed from `../curious-bright-institutional` with
Cloudflare/Wrangler. `wrangler.jsonc` serves `apps/institutional-web/dist` with
`not_found_handling: "single-page-application"`, which is required for:

- `/invitations/<uuid>`
- `/verification/email/<uuid>`
- `/billing/verify?reference=...`

Build env (Cloudflare project settings or the local `.env.production`):

```dotenv
VITE_API_URL=https://api.curiousbright.com.ng/api
VITE_UMAMI_SCRIPT_URL=...
VITE_UMAMI_WEBSITE_ID=...
```

Build/deploy:

```bash
pnpm install
pnpm build:web
wrangler deploy
```

The portal sends `X-Client-App: institutional` on every request. It uses the
Django API. Ensure the portal origin is
in `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`,
`WS_ALLOWED_ORIGINS` and `ORG_REGISTRATION_ALLOWED_ORIGINS`.

## 6. Private messaging

See [`docs/messaging.md`](messaging.md). Minimum production requirements:

- Redis channel layer and at least one ASGI worker (prefer 2+ with Redis).
- WebSocket upgrade support at `/ws/`.
- `WS_ALLOWED_ORIGINS` includes every deployed client origin.
- The service worker never caches private API responses.
- Database backups include messaging tables; message bodies are private data.
- No analytics/logging of message content or participant identifiers.

Smoke test with two accounts: send, receive, typing, read receipt, unread badge,
delete tombstone, block/unblock, report, and a non-participant 404/4403.

## 7. Organization verification and join requests

See [`docs/verification.md`](verification.md). Minimum production requirements:

- SMTP working and DNS authenticated.
- `PRIVATE_MEDIA_ROOT` on a private persistent volume.
- `ORG_REGISTRATION_ALLOWED_ORIGINS` includes the portal.
- Platform staff know the review workflow in Django admin.
- Only verified organizations are returned by `/api/organizations/search/`.
- Student creation, invites, account linking and join approval are all blocked
  server-side when unverified.
- Changing a verified organization's domain returns it to unverified.

## 8. Analytics

See [`docs/analytics.md`](analytics.md). Analytics is optional and no-ops when
the `VITE_UMAMI_*` variables are empty. Deploy Umami separately, create website
IDs, and set the build variables for each surface. Never send PII, message data
or payment references.

## 9. Post-deploy smoke test

Run these against production-ish infrastructure:

1. `GET /healthz/` returns ok and database true.
2. Register/sign in on the member app; profile refresh works after a reload.
3. Create a post/comment and receive a notification in a second session.
4. Join a study room; test LiveKit token issuance/video and whiteboard sync.
5. Open Messages, start a conversation from a profile, send/read/type/delete,
   then block and confirm new messages are rejected.
6. Open the portal; create an organization only from the portal origin.
7. Submit verification with a PDF; receive and confirm the official-email link;
   approve/reject in Django admin; confirm the portal banner changes.
8. As an unverified org, confirm invitations/student creation/join approval are
   blocked; after verification, confirm they work.
9. Search organizations in the member app and confirm only verified orgs appear.
10. Start a Paystack checkout from both pricing and portal; confirm the portal
    `/billing/verify?reference=...` path and webhook both update the subscription.
11. Install the member PWA and verify offline shell, no private caching, dark
    mode persistence and mobile/tablet/desktop layouts.
12. Confirm Umami receives only coarse page/section events with no PII.
