# Curious Bright — Mobile

Expo (SDK 57) client for the Curious Bright community notebook. It mirrors the
web app's design language — comment-corner cards, notebook grid texture,
highlighter title reveals, subject accent colors — and caches everything with
`@tanstack/react-query` persisted to AsyncStorage.

## Stack

- Expo Router (file-based routes, `Stack.Protected` auth gating)
- React Native 0.86 + Reanimated 4 (springs, page-turn entrances, corner-peel cards)
- `@tanstack/react-query` v5 + persist-client (offline cold start, 7-day cache)
- Ticket-authenticated WebSockets for live feed / post / notification events
- Django REST API at `apps/backend` (same contract as `apps/web`)

## Getting started

1. **Backend** — run Django locally (see `apps/backend/README`), typically on `:8000`.
2. **Env** — copy `.env.example` to `.env` and point it at your machine's LAN IP:

   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
   # EXPO_PUBLIC_WS_URL defaults to the API URL with ws:// swapped in
   ```

   Without `.env`, dev builds fall back to the Expo host IP, then
   `http://10.0.2.2:8000` on Android emulators and `127.0.0.1` elsewhere.
   Release/preview builds have no Metro host, so they default to
   `https://api.curiousbright.com.ng` — set `EXPO_PUBLIC_API_URL` in the EAS
   profile to target anything else.

   Google sign-in: set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` and register
   `https://app.curiousbright.com.ng/auth/google/mobile` as an **authorized
   redirect URI** on that OAuth client (Google only accepts https URIs; the
   web app relays the code back to the app via `curiousbright://auth/google`).
   The button hides itself while the env var is empty.

3. **Install & build** — Reanimated 4 worklets require a **dev client** (not Expo Go):

   ```
   pnpm install
   cd apps/mobile
   npx expo prebuild --no-install   # only after native config changes
   pnpm android                     # or: pnpm ios
   ```

   Then start the JS bundler:

   ```
   pnpm dev                         # expo start --lan
   ```

## Scripts

| Script         | What it does                          |
| -------------- | ------------------------------------- |
| `pnpm dev`     | Start Metro with LAN discovery        |
| `pnpm android` | Build + install the debug dev client  |
| `pnpm ios`     | Build + install the iOS dev client    |
| `pnpm typecheck` | `tsc --noEmit`                      |

## Layout

- `app/` — routes: auth screens, `(tabs)` shell (Feed / Browse / Chat / Rooms /
  You), `chat/[id]`, `room/[id]`, `inbox`, `post/[id]`, `profile/[username]`,
  `composer`, `search`, `submit`, `settings`, `legal/*`. `app/_layout.tsx` owns
  fonts, theme, query and auth providers.
- `src/components/ui/` — design-system primitives (`NotebookCard`, `HighlighterText`,
  `GridBackground`, chips, fields, states, undo-capable Toast).
- `src/hooks/` + `src/lib/feedCache.ts` — optimistic mutations expressed as
  react-query cache surgery (like, follow, delete-with-30s-undo, flag).
- `src/lib/queries.ts` — query key factory + fetchers (strict API calls only).
- `src/lib/api.ts` — token storage (SecureStore), single-flight refresh, WS tickets.
- `src/lib/realtime.ts` — `useRealtime` dotted-event WebSocket hook.
- `src/theme/` — palette tokens, fonts and the theme provider (system/light/dark).

## Notes

- Android debug builds allow cleartext HTTP to the LAN backend; release builds
  get `usesCleartextTraffic` via `plugins/withAndroidCleartext.js` (set the API
  URL to HTTPS for production instead when possible).
- Google sign-in uses authorization-code + PKCE (`src/lib/googleAuth.ts`,
  expo-auth-session `AuthRequest`); the browser lands on the web app's
  `/auth/google/mobile` relay (Google only accepts https redirect URIs), which
  reopens the app at `curiousbright://auth/google`, and `POST /api/auth/google/`
  exchanges the code.
- Push notifications (`src/lib/nativePush.ts`): on sign-in the app requests
  notification permission and registers the Expo push token via
  `POST /api/push/expo-tokens/`; sign-out deletes it. Android FCM is wired
  through `google-services.json` (`android.googleServicesFile` + the
  `expo-notifications` plugin with `assets/notification-icon.png`). Requires a
  dev-client rebuild after these native changes. For release builds, upload the
  FCM server key with `eas credentials`. Tapping a notification maps backend
  hrefs to routes (`/messages/<id>` → `/chat/<id>`, `/notifications` → `/inbox`).
  Settings → **Send a test notification** exercises the whole chain without a
  second account; it reports `no_device` if registration failed and
  `push_disabled` if the server has no push credentials.
- Signing out clears tokens, the persisted query cache and the offline session
  mirror (`cb.me` in AsyncStorage), which is what lets a cold start with no
  network still open on the cached notebook instead of the login screen.

## Update safety workflows

- `.github/workflows/mobile-ci.yml` runs on every push/PR touching `apps/mobile`
  (except native folders): `tsc --noEmit`, `expo config` validation,
  `expo-doctor` (informational) and a Metro `expo export` bundle smoke test.
- `expo-updates` is installed with a **static** `runtimeVersion` ("1.0.0" —
  policies like `appVersion` are unsupported while `android/`/`ios/` folders
  are checked in) and pinned EAS channels (`development` / `preview` /
  `production` in `eas.json`). OTA updates only reach builds with a matching
  runtime version, so a JS-only update can never break a native build that
  predates it.
- `.github/workflows/mobile-update.yml` (manual dispatch) re-runs typecheck +
  bundle, then publishes `eas update --channel <preview|production> --auto`
  with a staged rollout percentage (default 25%). Requires an `EXPO_TOKEN`
  repository secret (EAS account access token).
- When native code, app.json config or SDK versions change: bump BOTH
  `expo.version` and `expo.runtimeVersion` together (e.g. 1.0.0 → 1.1.0) and
  ship a new build BEFORE publishing updates to the new channel — old installs
  keep their current runtime.
