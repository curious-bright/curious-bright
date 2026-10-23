# Analytics: comparison, recommendation and deployment

This document compares the four tools reviewed for Curious Bright, records the
recommendation, and explains how analytics is wired into the three browser
surfaces while keeping learner and organization data out of the analytics
pipeline.

> **Status:** Umami is implemented behind environment variables but no analytics
> host or website ID has been provisioned yet. Analytics is completely disabled
> while `VITE_UMAMI_*` variables are empty. Production SMTP also needs to be
> confirmed before email-driven verification is considered fully live.

## 1. Recommendation

**Use self-hosted Umami (v3.x) for launch.** Revisit Matomo or PostHog only when
the product needs a capability Umami cannot provide.

Why Umami fits Curious Bright:

- **Privacy by default.** Cookieless tracking, no personal profiles required,
  no session replay by default and no ad-tech data sharing. This matches the
  decision not to send message content, search queries, emails, names, payment
  references or document data to analytics.
- **Enough product analytics.** Umami v3 includes custom events, goals,
  funnels, journeys, retention, segments, UTM reporting and a REST API. That
  covers the questions we actually need at launch: which surfaces are used,
  where onboarding drops off, and whether pricing/verification CTAs convert.
- **Small operational footprint.** One Node.js service plus PostgreSQL. It fits
  the existing Django/PostgreSQL operations model and can run on a $5–$15/month
  VPS for a long time. No ClickHouse, Kafka or multi-service cluster.
- **Low compliance burden.** Self-hosting keeps event data in infrastructure we
  control, which makes GDPR and Nigeria's NDPR easier to document. Umami can be
  configured to avoid cookies entirely. Consent-banner requirements still
  depend on the final configuration and legal review; cookieless analytics is
  not a blanket exemption from every ePrivacy/NDPR obligation.
- **No feature gating for self-hosted analytics.** Funnels, journeys and
  retention are available in the open-source edition. Session replay and
  heatmaps are newer features (v3.1/v3.2); we do **not** need to enable them.

The trade-offs are acceptable: Umami is less deep than PostHog for
experimentation and warehouse-style analysis, has fewer enterprise governance
features than Matomo, and self-hosting makes us responsible for backups,
upgrades and retention. Those are manageable at the current scale.

### What we deliberately do not track

Never send any of the following to analytics:

- message bodies, private chat metadata, conversation IDs, participant IDs;
- names, usernames, email addresses, phone numbers, student IDs;
- organization legal names, verification documents or reviewer notes;
- search queries, post content, comments or uploaded document names;
- payment references, card details, Paystack payloads or invoice data;
- passwords, tokens, session identifiers or raw IP addresses.

The client integrations only send route paths and coarse product events. A path
can still contain a slug or ID on some routes; routes used by the trackers are
static app paths. Do not add per-user dimensions without a privacy review.

## 2. Comparison

The table reflects publicly documented capabilities and list prices at the time
of writing (2026). Hosting prices change; verify them before purchase.

| | **Umami** | **Plausible** | **Matomo** | **PostHog** |
|---|---|---|---|---|
| Licence / self-host | MIT; full v3.x self-host, no event limits | AGPLv3 Community Edition; ClickHouse + PostgreSQL + app | GPLv3 core; full self-host, premium plugins/bundles paid | MIT source, but self-hosting is explicitly not recommended; complex stack |
| Small self-host footprint | ~1–2 vCPU, 1–2 GB RAM + PostgreSQL; a $5–$15 VPS is realistic | ~2 vCPU, 4 GB RAM + ClickHouse + PostgreSQL; $15–$40 VPS realistically | ~2 vCPU, 2–4 GB RAM + PHP + MySQL/MariaDB; $10–$30 VPS | 4 vCPU, 16 GB RAM, 30 GB+ disk for the documented minimum; realistically much more |
| Managed cloud pricing | Free Hobby: 100K events/mo, 1 site, 6-month retention. Pro $20/mo: 1M events, 20 sites. Business $200/mo | Cloud from roughly $9–$19/mo depending on pageviews/sites (annual pricing varies) | Cloud from roughly $26–$29/mo for 50K hits; on-premise premium bundles from ~€230–€275/mo | Usage-based; free 1M product events, 5K replays and 1M flag requests/mo; paid beyond that |
| Cookieless | Yes by default | Yes by default | Configurable; requires disabling cookies and reviewing settings | Possible with persistence/cookieless configuration, but not the default posture and easy to misconfigure |
| GDPR / NDPR fit | Strong when self-hosted; cookieless, no personal data by default | Strong; EU-hosted cloud or self-host, cookieless | Strong data-sovereignty story; built-in GDPR tooling, but more configuration and vendor modules | Strong compliance tooling but much broader data collection; requires careful config, DPAs and retention rules |
| Funnels | Yes (v3.x) | Yes (goals/funnels; fewer product-analytics features) | Yes; some funnel/flow capabilities tied to Cloud or premium bundles | Best-in-class, flexible funnels |
| Retention / cohorts | Yes (v3.x); sufficient cohort reporting | Limited native retention/cohort analysis | Yes; cohorts, segments, users flow, custom reports | Best-in-class retention, cohorts and path analysis |
| Other strengths | Lightweight, clean UI, goals, journeys, UTM, REST API | Very polished simple web analytics, lightweight reports | Deep web analytics, heatmaps/session recording/reporting via paid modules, tag manager, audit features | Session replay, feature flags, experiments, surveys, error tracking, warehouse, SQL |
| Main weakness | Smaller ecosystem than Matomo/PostHog; advanced governance less mature | Product analytics and retention shallower than PostHog; self-host needs ClickHouse | Heavier UI and ops; important features are commercial add-ons | Overkill for launch; privacy/session-replay risk; self-host is operationally heavy |
| Best fit here | **Recommended** | Good alternative if ClickHouse is already operated | Future option for a larger institution/research compliance team | Future option once experiments/feature flags/replay are genuinely needed |

### Why not the others now?

- **Plausible** is an excellent simple web-analytics product. Its community
  edition now needs ClickHouse as well as PostgreSQL, which is more operational
  surface than Umami for the same launch-stage questions. Cloud pricing is
  attractive but sends data to a third party.
- **Matomo** is the most complete self-hosted web-analytics suite, but the
  capabilities that make it attractive (funnels, heatmaps, session recording)
  are partly commercial bundles, and the PHP/MySQL stack adds a separate
  maintenance path. Reconsider if the institution market demands formal
  audit/reporting features.
- **PostHog** is the strongest product-analytics platform, but it is a platform,
  not a small analytics tool. Self-hosting is explicitly discouraged by the
  vendor, the minimum footprint is large, and session replay/autocapture makes
  accidental PII collection more likely. The free cloud tier is generous, but
  data leaves our infrastructure and the privacy review burden is higher.

## 3. Event and privacy model

### Landing page (`apps/landing-page`)

| Event | Properties | Purpose |
|---|---|---|
| `pageview` | static `path` | Page and pricing-page traffic |
| `pricing_cta` | `plan`, `interval`, `currency`, optional `source` | Which plan/toggle leads to the portal |

### Member app (`apps/web`)

| Event | Properties | Purpose |
|---|---|---|
| `pageview` | static `path` | Route-level usage |
| `organization_join_requested` | none | Completion of the join-request flow |

### Institutional portal (`../curious-bright-institutional`)

| Event | Properties | Purpose |
|---|---|---|
| `pageview` | static `path` | Portal entry pages |
| `portal_view` | `section` (`overview`, `members`, `billing`, …) | Which admin surface is used |
| `organization_created` | `org_type` | Onboarding completion |
| `verification_submitted` | `org_type`, `resubmission` | Verification funnel |
| `verification_email_resent` | none | Email-delivery friction |
| `join_request_decision` | `decision` | Join-flow usage |
| `plan_checkout_started` | `plan`, `interval`, `currency` | Billing conversion |

All trackers are no-ops when `VITE_UMAMI_SCRIPT_URL` or
`VITE_UMAMI_WEBSITE_ID` is missing. Pageviews are sent manually with query
strings removed. No `identify()` call is made, no cookies are required, and no
session replay is enabled.

## 4. Self-hosting Umami

### 4.1 DNS and server

Use a dedicated hostname such as `analytics.curiousbright.com.ng`. A small
Linux VPS with 1–2 vCPU and 1–2 GB RAM is sufficient for launch traffic. Keep
PostgreSQL on the same private network or use a managed database.

### 4.2 Docker Compose

Create a private deployment directory on the analytics host (do not commit the
real `.env`):

```yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_TYPE: postgresql
      DATABASE_URL: postgresql://umami:${POSTGRES_PASSWORD}@db:5432/umami
      APP_SECRET: ${APP_SECRET}
      DISABLE_TELEMETRY: "1"
    ports:
      - "127.0.0.1:3000:3000"

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - umami-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U umami -d umami"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  umami-db:
```

`.env`:

```dotenv
POSTGRES_PASSWORD=replace-with-a-long-random-password
APP_SECRET=replace-with-a-long-random-secret
```

Start with `docker compose up -d`. Put Caddy, Nginx or Cloudflare Tunnel in
front of `127.0.0.1:3000` and terminate TLS at the proxy. Example Caddy site:

```caddyfile
analytics.curiousbright.com.ng {
  reverse_proxy 127.0.0.1:3000
}
```

Do not expose PostgreSQL publicly. Back up the `umami-db` volume and test a
restore. Pin image tags after validating an upgrade instead of always using
`latest`.

### 4.3 Configure the websites

1. Sign in to Umami and change the default admin password.
2. Create three websites:
   - `Curious Bright` — `https://curiousbright.com.ng`
   - `Curious Bright App` — `https://app.curiousbright.com.ng`
   - `Curious Bright Institutional` — `https://org.curiousbright.com.ng`
3. Copy each website ID.
4. The tracker URL is usually `https://analytics.curiousbright.com.ng/script.js`.
   If ad-blocking becomes a problem, configure `TRACKER_SCRIPT_NAME` on the
   server and use that custom script path in the matching frontend.
5. Keep automatic tracking **off**: the clients set `data-auto-track="false"`
   and send explicit `pageview` events after route changes.

### 4.4 Retention and access

- Set a retention policy appropriate to the privacy notice (for example 12
  months), and document it. Umami self-hosted does not automatically expire
  everything for you.
- Restrict the analytics host/admin to staff; use a password manager and TLS.
- Do not grant organization admins access to platform analytics.
- Export only aggregate reports. Do not join analytics events to learner
  accounts or organization records.
- Add the analytics host to the privacy policy and, if required by counsel, the
  cookie/consent notice. Cookieless tracking still needs an appropriate legal
  basis and transparency.

## 5. Frontend integration

The code is already present in all three apps and is intentionally tiny.

### Landing page

`apps/landing-page/src/lib/analytics.ts` loads the Umami script, and
`src/components/AnalyticsTracker.tsx` sends a pageview on route changes.
`src/pages/Pricing.tsx` sends `pricing_cta` with plan, interval and currency.

### Member app

`apps/web/src/lib/analytics.ts` and
`apps/web/src/components/AnalyticsTracker.tsx` do the same. The only product
event currently sent is `organization_join_requested` in
`src/pages/JoinOrganization.tsx`.

### Institutional portal

`../curious-bright-institutional/apps/institutional-web/src/lib/analytics.ts`
initializes the tracker, and `src/App.tsx` sends `pageview` plus section-level
events. The portal has no router, so it tracks the initial page and state
changes explicitly. For verification/billing flows it sends only plan/type/
decision labels — never organization names or payment references.

### Build variables

Each app reads its own build-time variables:

```dotenv
VITE_UMAMI_SCRIPT_URL=https://analytics.curiousbright.com.ng/script.js
VITE_UMAMI_WEBSITE_ID=<website-id>
```

Set them in the hosting provider's build environment (Vercel, Cloudflare Pages
or the portal's Cloudflare build). If they are changed, rebuild and redeploy.
Because the variables are `VITE_*`, they are embedded in the public bundle;
the website ID and script URL are not secrets, but never put an API key here.

### Verification checklist

1. Open each app in a private window with the tracker enabled.
2. Confirm requests go to the analytics origin and that no cookie is set.
3. Confirm pageviews appear in the correct Umami website.
4. Click a pricing CTA and verify only plan/interval/currency appear.
5. Complete a join request and verify no username/email appears in the event.
6. Check the browser network panel for accidental message/search/email data.
7. Disable the two env vars in a preview build and confirm analytics is a no-op.

## 6. Decision log

- **Chosen:** self-hosted Umami v3.x.
- **Fallback if self-hosting is not approved:** Umami Cloud Pro (about
  $20/month at launch volume) keeps the same event contract and avoids running
  another database.
- **Revisit when:** we need experimentation/feature flags, deep cohort analysis,
  warehouse joins or audited enterprise reporting. At that point evaluate
  PostHog Cloud with a strict PII review, or Matomo with premium bundles.
- **Not approved yet:** session replay, heatmaps, advertising pixels, user
  identification, cross-site tracking and server-side payload logging.
