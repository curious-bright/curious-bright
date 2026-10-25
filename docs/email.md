# Transactional email: verification and password reset

Curious Bright sends registration verification codes and password-reset links
through [Resend](https://resend.com) over its HTTPS API. The backend renders
branded HTML plus a plain-text fallback, stores only hashes of codes/tokens, and
never logs a code, reset token or API key.

Organization invitations, join requests and verification/decision mail use the
same Resend dispatcher as registration email. Moderation approval mail still
uses Django's `EMAIL_BACKEND`. The transactional flows use `EMAIL_PROVIDER`:

| `EMAIL_PROVIDER` | Behaviour | Use |
|---|---|---|
| `console` | Django console backend prints the message to the terminal | Local development |
| `django` | Uses the configured `EMAIL_BACKEND` (SMTP, locmem, etc.) | Tests or an SMTP fallback |
| `resend` | Posts to `https://api.resend.com/emails` | Production |

In local development (`DJANGO_DEBUG=true`) the default is `console`. In
production the default is `resend`. Set it explicitly in every deployment so
the choice is visible.

## Environment

Required in production:

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
DEFAULT_FROM_EMAIL=noreply@curiousbright.com.ng
EMAIL_FROM_NAME=CuriousBright
SUPPORT_EMAIL=support@curiousbright.com.ng
EMAIL_REPLY_TO=support@curiousbright.com.ng
```

Optional delivery and abuse controls (defaults shown):

```dotenv
RESEND_API_URL=https://api.resend.com/emails
RESEND_TIMEOUT_SECONDS=10
RESEND_MAX_ATTEMPTS=3
RESEND_RETRY_BASE_SECONDS=1
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
```

The Resend key is read **only** from `RESEND_API_KEY`. Never put it in a
`VITE_*` variable, the browser bundles, Cloudflare Pages variables, source
control or logs. The local `apps/backend/.env` is git-ignored.

## Resend setup

1. Create the Resend account/project and add the sending domain
   `curiousbright.com.ng`.
2. Copy the exact DNS records Resend shows for that domain into Cloudflare.
   Record names/values can change by region; do not copy values from another
   project.
3. Wait until Resend marks the domain **Verified**.
4. Create an API key with sending permission. Store it as
   `RESEND_API_KEY` in the backend's secret manager (and in the local
   `apps/backend/.env` only for development).
5. Send a Resend test message, then exercise a real registration and password
   reset from both apps.
6. Check the Resend dashboard for delivered/bounced events and configure a
   webhook later if bounce handling is required.

### Sender identity

- Address: `noreply@curiousbright.com.ng`
- Display name: `CuriousBright`
- Reply-To: `support@curiousbright.com.ng`
- Do not use `no-reply@` or a personal mailbox.

### Cloudflare DNS checklist

Add the records Resend generates. A typical domain setup includes the following
shapes; use the exact values from the Resend dashboard.

| Type | Name | Value / notes | Cloudflare proxy |
|---|---|---|---|
| MX | `send` | The feedback/return-path host Resend shows, priority `10` | **DNS only** (gray cloud) |
| TXT | `send` | SPF return-path record (`v=spf1 include:amazonses.com ~all` or the value Resend shows) | **DNS only** |
| TXT | `resend._domainkey` | DKIM public key exactly as Resend shows (one long TXT value) | **DNS only** |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@curiousbright.com.ng` (start at `p=none`, tighten later) | **DNS only** |

Checklist:

- [ ] Domain in Resend is exactly `curiousbright.com.ng` (not a subdomain),
      because the From address uses the root domain.
- [ ] MX/TXT records are **DNS only**, not proxied by Cloudflare.
- [ ] The DKIM TXT value is one record, not split into chunks.
- [ ] There is only one SPF TXT record for the relevant host. If an SPF record
      already exists, merge the includes instead of adding a second SPF record.
- [ ] No trailing dot/whitespace mistakes in TXT values.
- [ ] Resend shows the domain as verified.
- [ ] A test email passes SPF, DKIM and DMARC (check the message headers).
- [ ] DMARC starts at `p=none` with a reporting address; move to
      `p=quarantine` only after monitoring.
- [ ] Resend bounce/complaint monitoring has an owner.

## Local development with console email

Use the console backend so no real mail leaves the machine:

```dotenv
DJANGO_DEBUG=true
EMAIL_PROVIDER=console
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_DELIVERY_ASYNC=false
DEFAULT_FROM_EMAIL=noreply@curiousbright.com.ng
```

Then run:

```bash
cd apps/backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

Register in the member app or institutional portal. The six-digit code appears
in the terminal output of the backend. Password-reset links are also printed
there and point at the requesting app:

- Member app: `APP_FRONTEND_URL` (default `http://localhost:5173` when set
  locally).
- Institutional portal: `ORG_FRONTEND_URL` (default
  `http://localhost:5174` when set locally), selected from the allowed
  `Origin`/`X-Client-App: institutional` request.

The code expires after 10 minutes. Requesting a new code invalidates the old
one. If a local Resend key is present, keep `EMAIL_PROVIDER=console` so it is
not used accidentally.

The automated tests use Django's locmem backend and never call Resend. To run
the auth/email suite:

```bash
cd apps/backend
.venv/bin/python manage.py test apps.accounts.tests_email_auth
```

## Delivery behaviour

- Registration creates the account first, then dispatches the code in a
  background thread in production. A delivery failure does **not** delete the
  account; the user can resend or correct their email.
- The resend-code endpoint waits briefly (`EMAIL_DELIVERY_WAIT_SECONDS`) for the
  background result. A known Resend failure returns HTTP 503
  `email_delivery_failed`, which both frontends show in their global alert.
- Resend requests retry on network errors, `408`, `425`, `429` and `5xx` with
  exponential backoff. Non-retryable responses fail immediately.
- Logs include only the email kind/template name, optional user id, provider and
  error class; never the code, reset link/token, recipient body or API key.
- Password reset always returns the same response whether or not the address
  exists. The link is single-use, expires after 30 minutes and is stored only as
  a SHA-256 hash.
- Password-changed notices are sent after both a successful reset and a
  signed-in password change.

## Production verification

Before launch, confirm:

- [ ] `EMAIL_PROVIDER=resend` and a valid `RESEND_API_KEY` are set only in the
      backend environment.
- [ ] `DEFAULT_FROM_EMAIL=noreply@curiousbright.com.ng` and
      `EMAIL_FROM_NAME=CuriousBright`.
- [ ] The Resend domain is verified and DNS/SPF/DKIM/DMARC pass.
- [ ] Registration sends a code; wrong code, expiry, reuse and five-attempt
      lockout behave correctly.
- [ ] Resend cooldown is 60 seconds and the UI counts down.
- [ ] Unverified login returns `403 email_unverified` and both apps route to the
      verification screen.
- [ ] Change email requires the current password, invalidates old codes and
      sends a fresh one.
- [ ] Password reset works from the member app and the institutional portal,
      and the link opens the same app that requested it.
- [ ] Reusing or waiting out a reset link is rejected.
- [ ] Org-created student accounts (single add and CSV import) can sign in
      without verification.
- [ ] Backend logs and Git history contain no code, token or API key.
