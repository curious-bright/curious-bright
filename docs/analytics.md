# Analytics: comparison, recommendation and deployment

This document compares the four tools reviewed for Curious Bright, records the
recommendation, and explains how analytics is wired into the three browser
surfaces while keeping learner and organization data out of the analytics
pipeline.

> **Status:** Umami is implemented behind environment variables and the
> self-hosted deployment assets are in `deploy/umami/`. No analytics host or
> website ID has been provisioned yet. Analytics is completely disabled while
> `VITE_UMAMI_*` variables are empty. Production Resend/SMTP also needs to be
> confirmed before email-driven verification is considered fully live.

## 1. Recommendation

**Use self-hosted Umami (v3.2+) for launch.** Revisit Matomo or PostHog only when
the product needs a capability Umami cannot provide. The manual pageview mode
uses `data-auto-pageview="false"`, added in Umami v3.2.0.

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
- passwords, tokens, session identifiers or raw IP addresses as event properties.

The client integrations only send route paths and coarse product events. Page
titles and referrers are replaced with safe values. A path can still contain a
slug or ID on some routes; routes used by the trackers are static app paths. Do
not add per-user dimensions without a privacy review. Umami processes the
request IP transiently to derive a rotating, salted anonymous session identifier
and approximate location; raw IP addresses are not stored as analytics fields.

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
| `sign_up` | `method` | Registration completion |
| `email_verified` | `method` | Email-verification completion |
| `post_created` | `kind`, `visibility` (and optional subject category) | Publishing/upload funnel |
| `follow` | `source` | Social graph growth |
| `chat_started` | `has_first_message` | Messaging activation |
| `payment_success` | `plan` | Paid conversion |
| `organization_join_requested` | none | Completion of the join-request flow |

### Institutional portal (`../curious-bright-institutional`)

| Event | Properties | Purpose |
|---|---|---|
| `pageview` | static `path` | Portal entry pages |
| `portal_view` | `section` (`overview`, `members`, `billing`, …) | Which admin surface is used |
| `sign_up` | `method`, `portal` | Institutional owner registration |
| `email_verified` | `method` | Account email verification |
| `org_registered` | `org_type` | Onboarding completion |
| `verification_submitted` | `org_type`, `resubmission` | Verification funnel |
| `verification_email_resent` | none | Email-delivery friction |
| `verification_email_changed` | none | Official-email correction |
| `org_email_verified` | `method` (`link` or `code`) | Official-email confirmation |
| `org_approved` | `org_type` | Verified-organization outcome |
| `join_request_decision` | `decision` | Join-flow usage |
| `plan_checkout_started` | `plan`, `interval`, `currency` | Billing conversion |
| `payment_success` | `plan`, `portal` | Paid conversion |

All trackers are no-ops when `VITE_UMAMI_SCRIPT_URL` or
`VITE_UMAMI_WEBSITE_ID` is missing, and when Do Not Track or Global Privacy
Control is enabled. Pageviews are sent manually with query strings and hashes
removed; dynamic route segments (post IDs, usernames, invitation and email
tokens) are replaced with placeholders. Pageviews and events replace the page
title with that safe route path and blank the referrer, so dynamic page titles
and external search queries never reach Umami. No `identify()` call is made, no cookies are
required, and no session replay is enabled. Empty-environment no-op tests live
in `apps/web/scripts/` and
`../curious-bright-institutional/apps/institutional-web/scripts/`.

## 4. Self-hosting Umami

The production deployment files are in [`deploy/umami/`](../deploy/umami/):
Docker Compose, a separate PostgreSQL database, Cloudflare Tunnel/Caddy
options, backup/restore scripts and an operations checklist. Follow that README
rather than copying a Compose file from this document.

Summary:

- Hostname: `analytics.curiousbright.com.ng`.
- Umami binds to `127.0.0.1:3000` only; PostgreSQL has no published port.
- Put Cloudflare Tunnel (recommended) or Caddy in front for HTTPS.
- Use a separate Umami PostgreSQL database and volume; never point Umami at the
  Django database.
- Set `DISABLE_TELEMETRY=1`, keep automatic tracking off in the clients, and
  set a documented retention period in Umami.
- Back up with `deploy/umami/backup.sh`, copy backups off-site encrypted, and
  test `restore.sh` periodically.
- Create one website per surface (landing, member app, institutional portal)
  and put the website ID in the matching frontend build environment.
- Keep the dashboard restricted to platform staff. Organization admins do not
  receive access to platform analytics.

Do not expose PostgreSQL publicly. Pin the Umami image tag after validating an
upgrade instead of always using `latest`.

## 5. Frontend integration

The code is already present in all three apps and is intentionally tiny.

### Landing page

`apps/landing-page/src/lib/analytics.ts` loads the Umami script with automatic
pageviews disabled (`data-auto-pageview="false"`), and
`src/components/AnalyticsTracker.tsx` sends a sanitized pageview on route
changes. `src/pages/Pricing.tsx` sends `pricing_cta` with plan, interval and
currency.

### Member app

`apps/web/src/lib/analytics.ts` and
`apps/web/src/components/AnalyticsTracker.tsx` do the same, replacing dynamic
IDs and usernames with route placeholders. Product events are sent from the
auth, feed, messaging and payment flows listed above, plus
`organization_join_requested` in `src/pages/JoinOrganization.tsx`.

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
7. Enable Do Not Track or Global Privacy Control and confirm the Umami script is
   not requested.
8. Build once with both `VITE_UMAMI_*` values empty and confirm the analytics
   module no-ops (see the `test:analytics` scripts).
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
