# Expo SDK 52 project

This app is pinned to **Expo SDK 52**. Read the exact versioned docs at
https://docs.expo.dev/versions/v52.0.0/ before writing any code.

## Dependency rules (do NOT break these)

- Every Expo/React Native package must stay on its **SDK 52** version. Do **not**
  bump `expo`, `expo-router`, `react`, or `react-native` to a newer SDK
  individually — the SDK versions are interlocked and a mismatch breaks the
  Metro/CLI startup (e.g. `Cannot find module 'expo-router/internal/routing'`).
- Anchors for SDK 52: `expo ~52.0.x`, `expo-router ~4.0.x`,
  `@expo/metro-runtime ~4.0.x`, `react 18.3.1`, `react-native 0.76.9`.
- To change any Expo dependency version, use `npx expo install <pkg>` (never a
  bare `npm install <pkg>@latest`), then run `npx expo-doctor` and commit the
  updated `package-lock.json`.
- To upgrade the whole SDK deliberately, run `npx expo install --fix` after
  bumping `expo`, then verify with `npx expo-doctor`.

## Fresh clone on another machine

```
npm ci          # installs the exact, committed lockfile — reproducible
npm run web     # or: npx expo start --web --offline
```

`package-lock.json` is committed and authoritative. Always use `npm ci` on a
fresh clone so the locked SDK 52 versions are installed exactly; a loose
`npm install` can drift versions.
