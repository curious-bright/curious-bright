# Self-hosted Umami analytics

Umami is the traffic and product-analytics layer for Curious Bright. It is
**not** the administrator reporting tool. Django admin analytics is generated
from the platform's own PostgreSQL database and never reads Umami data.

## Boundary between the two analytics systems

| Concern | Umami (`analytics.curiousbright.com.ng`) | Django admin analytics |
| --- | --- | --- |
| Data source | Cookieless browser pageviews and coarse product events | Local platform PostgreSQL tables |
| Audience | Product/ops team | Staff with `core.view_analytics` |
| Content | Sanitized page path, browser/OS, approximate country, event name and small non-PII properties | Organisation counts, verification funnel, active members, posts, rooms, reports, video minutes, CSV exports |
| Never included | Names, emails, message bodies, search queries, document contents, payment references | Message bodies, private document contents, free-text member content |
| Retention | Configured in Umami; keep only aggregate traffic history | Queried live/aggregated from the platform database |

Umami is self-hosted and cookieless. It does not set advertising cookies or
track members across other sites. It derives a rotating, salted anonymous
session identifier from the request IP address and user-agent to count visits;
raw IP addresses are not stored as analytics fields. The frontends suppress page
titles and referrers, and honour `Do Not Track` and `Global Privacy Control`;
when either is enabled the script is not loaded and no events are sent. The
build also no-ops when `VITE_UMAMI_SCRIPT_URL` or `VITE_UMAMI_WEBSITE_ID` is
empty.

## 1. Prerequisites

- A Linux host with Docker Engine and the Compose plugin.
- A Cloudflare-managed DNS zone for `curiousbright.com.ng`.
- At least 1 GB RAM and a small persistent disk for the database.
- No inbound database port. This Compose file publishes Umami only on
  `127.0.0.1:3000`; use Cloudflare Tunnel (recommended) or Caddy.

## 2. Configure

```bash
cd deploy/umami
cp .env.example .env
# Generate strong values:
openssl rand -hex 32      # POSTGRES_PASSWORD (hex avoids URL-encoding issues)
openssl rand -hex 32      # APP_SECRET
chmod 600 .env
```

Set `POSTGRES_PASSWORD` and `APP_SECRET` in `.env`. Keep `.env` out of git and
out of backups that are not encrypted.

## 3. Start

```bash
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:3000/api/heartbeat
```

Open the dashboard through your chosen HTTPS route, create the first admin
account immediately, then add a website for each frontend:

- `curiousbright.com.ng` (landing page)
- `app.curiousbright.com.ng` (main web app)
- `org.curiousbright.com.ng` (institutional portal)

Copy each website ID into the matching frontend build environment. The script
URL is the same self-hosted instance, for example:

```dotenv
VITE_UMAMI_SCRIPT_URL=https://analytics.curiousbright.com.ng/script.js
VITE_UMAMI_WEBSITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Rebuild and redeploy the frontends after changing build-time environment
variables. If either variable is blank, the integration is completely inert.
The frontends send sanitized SPA pageviews themselves using
`data-auto-pageview="false"`, which requires Umami **v3.2.0 or newer**; the
Compose file tracks the current PostgreSQL image.

## 4. HTTPS and Cloudflare

### Option A — Cloudflare Tunnel (recommended)

1. Create a tunnel in the Cloudflare Zero Trust dashboard.
2. Add a public hostname `analytics.curiousbright.com.ng` pointing to
   `http://umami:3000`.
3. Put the tunnel token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
4. Run `docker compose --profile tunnel up -d`.
5. Set the DNS record to the tunnel and SSL/TLS mode to **Full (strict)**.

No inbound ports need to be opened. The container port remains bound to
localhost only.

### Option B — Caddy with a Cloudflare Origin certificate

1. Create a Cloudflare Origin CA certificate for
   `analytics.curiousbright.com.ng` and place the certificate/key where Caddy can
   read them. Adjust `Caddyfile` to use `tls /path/cert.pem /path/key.pem`.
2. Create a proxied DNS `A`/`AAAA` record for the host.
3. Set Cloudflare SSL/TLS to **Full (strict)**.
4. Run `docker compose --profile caddy up -d` and allow inbound 80/443.

Do not use Cloudflare **Flexible** SSL. Do not expose PostgreSQL publicly.

## 5. Cloudflare cache and firewall notes

- Bypass cache for `/api/collect` and `/api/heartbeat`.
- Do not cache the dashboard or authenticated API responses.
- Keep a WAF rule allowing normal browser traffic to `/script.js` and
  `/api/collect`; block obvious bots if desired.
- The host firewall should allow only 80/443 (or no inbound ports when using a
  tunnel). PostgreSQL must never be published.

## 6. Backups

`backup.sh` performs a compressed logical `pg_dump` and deletes local copies
older than `UMAMI_BACKUP_RETENTION_DAYS` (default 14). Run it nightly:

```cron
15 2 * * * /opt/curiousbright/deploy/umami/backup.sh >> /var/log/umami-backup.log 2>&1
```

Copy backups to encrypted off-site storage (for example, a private R2 bucket
with object lock). Test a restore periodically:

```bash
docker compose stop umami
./restore.sh backups/umami-20261025T021500Z.sql.gz
docker compose start umami
```

Backups include `--clean --if-exists`, so a restore replaces Umami tables in the
stopped database. The platform's Django database is backed up separately. Do
not mix the two databases or restore one into the other.

## 7. Upgrades and operations

```bash
docker compose pull
docker compose up -d
docker image prune -f
```

- Pin the Umami image tag in production once you have validated an upgrade.
- Monitor `/api/heartbeat`, disk usage, and backup success.
- Set a sensible data-retention period in Umami's website settings.
- Keep `DISABLE_TELEMETRY=1`.
- Review dashboard users quarterly and remove departed staff.
- Never add message content, names, email addresses, search terms, document
  contents, or payment references to event properties.

## 8. Privacy checks before launch

- Confirm the tracker script loads only from
  `https://analytics.curiousbright.com.ng/script.js`.
- Confirm `data-do-not-track="true"` is present on the injected script.
- Confirm DNT/GPC prevents the script from loading in a browser.
- Confirm the Privacy Policy links to this page and describes Umami and the
  Django admin analytics boundary.
- Confirm the legal entity, address and DPO placeholders in the policies have
  been replaced and reviewed by counsel.
