# PWA, responsive shell and appearance

The member app is installable as a Progressive Web App. The institutional
portal and marketing site are normal responsive sites; the PWA scope is only
`https://app.curiousbright.com.ng/`.

## 1. Manifest

`apps/web/public/manifest.webmanifest` defines:

- name/short name and description;
- `id` and `scope`: `/`;
- `start_url`: `/feed`;
- `display: standalone`, with `window-controls-overlay`/`minimal-ui` fallbacks;
- portrait orientation;
- paper/theme colors;
- 192×192 and 512×512 any-purpose icons;
- a 512×512 maskable icon;
- shortcuts to the feed, study rooms and research studio.

The required Android install criteria are present: HTTPS, a valid manifest,
192/512 icons, a service worker with a fetch handler and a start URL in scope.
iOS uses `apple-touch-icon`, `apple-mobile-web-app-capable` and the status-bar
metadata in `index.html`.

If icons change, regenerate all three PNGs from the same source, keep the
maskable icon's safe area (roughly the inner 80%), and bump the service worker
cache version.

## 2. Service worker

`apps/web/public/sw.js` is registered only in production builds (`main.tsx`),
so Vite development keeps hot reload.

Behavior:

- Pre-caches the app shell (`/`, `/index.html`, favicon, manifest, icons).
- Navigation requests use network-first, then the cached `index.html` offline.
- Same-origin static assets use cache-first with a background refresh.
- **Skips** `/api/`, `/ws/`, `/admin/` and all cross-origin requests. Private
  messages, feeds, live video and organization data are never written to the
  cache.
- On activation, deletes caches not matching `VERSION`.

`VERSION` is currently `curious-bright-v2` (bumped when push listeners were
added). Change it whenever the shell, routing fallback or cache policy changes;
otherwise installed clients may keep an old shell indefinitely.

Expected offline behavior: the shell and previously cached static assets load,
but API-backed pages show normal network errors. Offline write queuing is not
implemented. Do not claim full offline messaging/feed support.

## 2a. Web Push

`sw.js` also handles `push`, `notificationclick` and `pushsubscriptionchange`:

- The server sends `{title, body, href}` JSON; the worker shows a
  notification with the app icon/badge and stores `href` on the notification.
- A tap focuses an open app window and posts `{type:'navigate', href}` (the
  window performs the navigation itself, so React Router keeps state), or
  opens a new window at `href` when none exists.
- `pushsubscriptionchange` asks any open window to re-subscribe.

Client side (`apps/web/src/lib/push.ts`):

- Subscriptions are only created after the user grants `Notification`
  permission and holds a session token. The opt-in button lives on the
  Notifications page; returning granted-permission users are re-subscribed
  silently on login (`ensurePushSubscription`).
- The browser subscription (`endpoint`, `p256dh`, `auth`) is stored
  server-side against the VAPID public key from `GET /api/push/vapid-public-key/`.
- `disablePushNotifications()` unsubscribes and deletes the server row.

Backend: see `apps/backend/apps/push` (Web Push via `pywebpush`, VAPID keys in
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). Delivery is best-effort on background
threads; 404/410 responses prune the stored subscription. Generate keys with
`npx web-push generate-vapid-keys` and set them in the API environment.
Expired/expired-pruning caveat: iOS only delivers push to the **installed**
PWA (iOS 16.4+); desktop and Android Chrome work in normal tabs.

## 3. Responsive and dark UI

- Mobile (< 1024 px): sticky top bar, bottom tabs (Home, Search, Study Rooms,
  Messages, Profile), floating compose action and safe-area padding.
- Tablet: icon-only left rail, centered feed, no right suggestions panel.
- Desktop: full left navigation, centered feed and right suggestions rail.
- Messages is available in the desktop navigation and the mobile bottom bar with
  an unread badge.
- The light palette is unchanged. Dark mode uses `data-theme="dark"` tokens on
  `:root`, follows `prefers-color-scheme` by default, and stores an explicit
  System/Light/Dark choice in `localStorage` (`cb.theme`).
- An inline pre-paint script sets the theme before React hydrates to prevent a
  light flash. `ThemeContext` also updates `<meta name="theme-color">` to
  `#121216` in dark mode.
- Settings → Appearance exposes the three choices. System mode reacts live to OS
  changes and syncs across tabs via the `storage` event.
- Check WCAG AA contrast for every new color pair (4.5:1 for normal text, 3:1
  for large text/UI boundaries). The existing light tokens were not changed.

## 4. Deployment

### Static host/SPA fallback

The host must serve `index.html` for app routes such as `/feed`, `/profile/...`,
`/messages`, `/rooms/<id>`, otherwise deep links 404. Vercel has a rewrite for
the landing site; the member app and portal need equivalent SPA behavior. On
Cloudflare Pages/Wrangler, use `not_found_handling: "single-page-application"`
as the portal does.

### Headers

Service workers must be served from the origin root with JavaScript content
type. Prefer:

```text
/sw.js                 Cache-Control: no-cache
/manifest.webmanifest  Content-Type: application/manifest+json
```

Do not cache `sw.js` for a long time; the browser needs to discover updates.
Assets with content hashes can use immutable caching.

### HTTPS and scope

Installability requires HTTPS (except localhost). Keep the manifest and service
worker at the app origin. If the API is on `api.curiousbright.com.ng`, the
service worker intentionally ignores those requests; private data is not cached.

## 5. Verification checklist

Run a production build (`pnpm --filter web build`) and preview it over HTTPS or
localhost.

- [ ] Application tab shows the manifest parsed without errors.
- [ ] 192×192 and 512×512 icons load; maskable icon renders without clipping.
- [ ] Install prompt/Add to Home Screen appears on Android Chrome.
- [ ] Installed window opens standalone at `/feed` and keeps navigation inside
      the app.
- [ ] Service worker is activated; reload and navigate offline; the shell loads.
- [ ] After opting in, a DM from another account raises a notification while the
      tab is closed; tapping it opens `/messages/<id>`.
- [ ] Re-opening the app does not create a second
  `WebPushSubscription` row for the same endpoint.
- [ ] Private API responses are not present in Cache Storage.
- [ ] `/api/`, `/ws/` and admin requests are not intercepted/cached.
- [ ] Mobile: top bar + bottom tabs + compose do not overlap safe areas.
- [ ] Tablet: icon rail, centered feed, no right rail.
- [ ] Desktop: full nav, feed, right suggestions; Messages has unread badge.
- [ ] Light theme still matches the original palette.
- [ ] System dark mode follows OS; saving Light/Dark survives reload and other
      tabs; no light flash on first paint.
- [ ] Text/UI contrast passes WCAG AA in both themes.
- [ ] Lighthouse PWA/installability checks pass (or document any remaining
      non-blocking audit).
