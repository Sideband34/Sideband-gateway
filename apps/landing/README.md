# Sideband landing site

Static Next.js site for Sideband (product overview, provider docs, device matrix, safety/FAQ).
It ships as a static export (`out/`) with no server logic, no analytics and no secrets.

```
npm ci
npm run lint && npm run typecheck && npm test && npm run build   # same as CI
npx serve out   # or any static file server
```

## Download section and store badges

Sideband is **not** listed on the App Store or Google Play. By default the download section shows:

- **Android:** "Download for Android", linking straight to
  `https://github.com/Sideband34/Sideband-mobile/releases/latest/download/sideband-android.apk`
  (the fixed asset name that repo's release workflow publishes on every `v*` tag), plus
  "All releases", the SHA-256 file and a short "How to install an APK" help.
- **iOS:** a "coming soon" state with no link.

Official store badges render only when a real listing exists and these build-time variables are set:

| Variable | Accepted value |
|---|---|
| `NEXT_PUBLIC_APP_STORE_URL` | `https://apps.apple.com/...` |
| `NEXT_PUBLIC_PLAY_STORE_URL` | `https://play.google.com/...` |

URLs on any other host or scheme are ignored. When a variable is set, the official artwork must be
added from the vendor (not recreated) under their brand terms, or the build fails:

- `public/badges/app-store.svg` — [Apple marketing guidelines](https://developer.apple.com/app-store/marketing/guidelines/)
- `public/badges/google-play.png` — [Google Play badge guidelines](https://play.google.com/intl/en_us/badges/)

`tests/home.test.tsx` asserts that no store link renders without these variables.

## Design notes

- Colours come from `brand/tokens.json`; the logo is `brand/icon.svg`, copied unchanged to `public/icon.svg`.
- Light and dark themes follow the OS setting; the header toggle stores an override in `localStorage`.
- Entrance reveals and the hero animation are disabled under `prefers-reduced-motion`; content is
  fully visible without JavaScript.
- Fonts (Plus Jakarta Sans, IBM Plex Mono) are self-hosted via Fontsource, so the site makes no
  third-party requests.
