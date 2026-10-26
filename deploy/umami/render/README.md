# Umami on Render

This folder exists because Render builds one Dockerfile per service. Point the
analytics web service's **Root Directory** at `deploy/umami/render`; otherwise
Render builds the repo-root Dockerfile (the Django API) and the deploy fails.

## Service settings

| Setting | Value |
| --- | --- |
| Root Directory | `deploy/umami/render` |
| Runtime | Docker |
| Health check path | `/api/heartbeat` |
| Instance type | Free is fine to start |

## Required environment variables

- `DATABASE_URL` — connection string of a Render Postgres instance, using the
  `postgresql://` scheme. Create the database first and link it (or paste the
  internal URL).
- `APP_SECRET` — any long random value (`openssl rand -hex 32`).

Umami runs its own migrations on boot. No build or pre-deploy command is
needed.

## Caveats on the free tier

- Free web services sleep after inactivity. The dashboard wakes on visit, but
  events posted while cold may be dropped during the ~30–60 s spin-up.
- Free Postgres instances expire after 30 days; expiring deletes all analytics
  data. Use a paid instance if the data must persist.
- The service URL is `*.onrender.com`. To serve the tracker from
  `analytics.curiousbright.com.ng`, add a custom domain (paid Render tier).

## After the first deploy

1. Open the service URL and create the Umami admin account immediately — the
   first visitor to the setup screen wins.
2. In Settings → Websites, add `curiousbright.com.ng`,
   `app.curiousbright.com.ng` and `org.curiousbright.com.ng`; copy each
   Website ID.
3. Set per-frontend env vars and redeploy the frontends:
   - `VITE_UMAMI_SCRIPT_URL=https://<service-url>/script.js`
   - `VITE_UMAMI_WEBSITE_ID=<id of that site>`
   Tracking stays inert while these are empty (covered by
   `scripts/analytics-noop.test.mjs` in each app).
