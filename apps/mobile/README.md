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

- `app/` — routes: auth screens, `(tabs)` shell (Feed / Browse / Inbox / You),
  `post/[id]`, `profile/[username]`, `composer`, `search`, `submit`, `settings`,
  `legal/*`. `app/_layout.tsx` owns fonts, theme, query and auth providers.
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
- Google sign-in is intentionally not wired yet (needs a registered
  `curiousbright://` redirect URI on the backend first).
- Signing out clears tokens and the entire persisted query cache.
