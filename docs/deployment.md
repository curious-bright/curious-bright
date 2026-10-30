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
                                          ├─ Resend (verification/reset/org mail)
                                          └─ SMTP (moderation approval only)
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
- A verified Resend domain for registration verification, password reset,
  password-changed notices and organization verification/invitation/join-request
  email. SMTP remains only for moderation approval mail that still uses Django's
  `EMAIL_BACKEND`.
- A reverse proxy/load balancer that forwards WebSocket upgrades to the ASGI
  server.
- Uvicorn with WebSocket support (`uvicorn[standard]` in `requirements.txt`).
  Bare `uvicorn` logs "No supported WebSocket library detected" and returns
  404 for every `/ws/` handshake.

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

### 2.5 Email / Resend

Registration verification, password reset, password-changed notices and
organization verification/invitation/join-request email go through Resend's
HTTPS API. Moderation approval mail still uses Django's `EMAIL_BACKEND`; keep
that configured if moderation email is enabled.

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
RESEND_API_URL=https://api.resend.com/emails
RESEND_TIMEOUT_SECONDS=10
RESEND_MAX_ATTEMPTS=3
RESEND_RETRY_BASE_SECONDS=1
DEFAULT_FROM_EMAIL=noreply@curiousbright.com.ng
EMAIL_FROM_NAME=CuriousBright
SUPPORT_EMAIL=support@curiousbright.com.ng
EMAIL_REPLY_TO=support@curiousbright.com.ng
EMAIL_DELIVERY_ASYNC=true
EMAIL_DELIVERY_WAIT_SECONDS=8
EMAIL_VERIFICATION_CODE_TTL_SECONDS=600
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60
EMAIL_VERIFICATION_MAX_ATTEMPTS=5
EMAIL_VERIFICATION_EMAIL_HOURLY_LIMIT=5
EMAIL_VERIFICATION_IP_HOURLY_LIMIT=10
PASSWORD_RESET_TOKEN_TTL_SECONDS=1800
PASSWORD_RESET_COOLDOWN_SECONDS=60
PASSWORD_RESET_EMAIL_HOURLY_LIMIT=5
PASSWORD_RESET_IP_HOURLY_LIMIT=10

# Moderation approval mail still uses Django's mail backend.
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
EMAIL_USE_TLS=true
```

Do not set `EMAIL_PROVIDER=console` in production. The API key must be a
backend-only secret; never add it to a member/portal build, Cloudflare Pages
variables or `VITE_*`.

Resend domain/DNS setup:

1. Add `curiousbright.com.ng` to Resend and create a sending API key.
2. Add the **exact** MX/TXT/DKIM records Resend shows in Cloudflare as **DNS
   only** (gray cloud), not proxied.
3. Keep one SPF record per host; merge includes if one already exists.
4. Add a DMARC TXT record, starting at `p=none` with a reporting mailbox.
5. Wait for Resend to report the domain as verified, then send a test and check
   SPF/DKIM/DMARC in the headers.
6. Confirm both apps complete registration, verification, resend, change-email,
   forgot-password and reset flows. Reset links must open the app that requested
   them (`APP_FRONTEND_URL` or `ORG_FRONTEND_URL`).

Full checklist and local console instructions: [email.md](email.md). A known
delivery failure from the resend-code endpoint returns HTTP 503
`email_delivery_failed` and is shown in the app's alert; registration keeps the
unverified account so the user can retry.

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

### 2.7 Push notifications

```dotenv
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CLAIMS_EMAIL=mailto:notifications@curiousbright.com.ng
EXPO_PUSH_ACCESS_TOKEN=
```

- Web Push (the installed PWA) needs the VAPID pair — generate with
  `npx web-push generate-vapid-keys` and treat the private half like a
  password: environment only, never a commit, chat log or ticket.
- Native Android/iOS push needs `EXPO_PUSH_ACCESS_TOKEN` from the EAS project,
  plus the FCM server key uploaded to that project (`eas credentials`).
- Each half can stay blank: delivery is skipped with a log line instead of
  failing the request that triggered it.
- Verify the whole chain from a device: Settings → Send a test notification
  (`POST /api/push/test/`). `no_device` means the app never registered a
  token; `push_disabled` means the server has no credentials.

### 2.8 Start and check

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
- `/verify-email?email=...`
- `/forgot-password`
- `/reset-password?uid=...&token=...`
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

- Resend domain verified and SPF/DKIM/DMARC passing for
  `noreply@curiousbright.com.ng`; see [email.md](email.md).
- SMTP working for moderation mail, if enabled.
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
2. Register on the member app; confirm the verification email arrives, enter the
   six-digit code, and land signed in with a success alert. Confirm an
   unverified login returns the verification screen instead of a token.
3. Repeat registration on the institutional portal; verify the code and enter
   the portal. Use Forgot password from both apps and confirm each reset link
   opens the app that requested it.
4. Create a post/comment and receive a notification in a second session.
5. Join a study room; test LiveKit token issuance/video and whiteboard sync.
6. Open Messages, start a conversation from a profile, send/read/type/delete,
   then block and confirm new messages are rejected.
7. Open the portal; create an organization only from the portal origin.
8. Submit verification with a PDF; receive and confirm the official-email link;
   approve/reject in Django admin; confirm the portal banner changes.
9. As an unverified org, confirm invitations/student creation/join approval are
   blocked; after verification, confirm they work.
10. Create a student account and import a CSV as the verified org; confirm those
    accounts sign in without an email verification step.
11. Search organizations in the member app and confirm only verified orgs appear.
12. Start a Paystack checkout from both pricing and portal; confirm the portal
    `/billing/verify?reference=...` path and webhook both update the subscription.
13. Install the member PWA and verify offline shell, no private caching, dark
    mode persistence and mobile/tablet/desktop layouts.
14. Confirm Umami receives only coarse page/section events with no PII.
