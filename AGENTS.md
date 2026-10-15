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

## Card learning and release checks

Card reactions belong on the back face (`CardReactionBar`), not in `CardDifficultyAsk`.
Keep the immutable first decision separate from the latest SRS grade, and preserve it when
merging newer server schedules. Never infer the first decision from a multi-review last grade.
Review detail is read-only for difficulty and self-check. Below the back face the order is
field tips (`CardTips`) → first answer → difficulty: both disabled self-check options sit at the top of
the difficulty card, above the difficulty options, and highlight only the immutable first decision, never the latest grade.
Never grade or vote from that screen. Actual learning flow retains its SRS scheduling.
`total_learned` currently counts MASTERED cards, so UI labels must describe current completion,
not lifetime learning attempts. Run `npm run test:card-ui -- <web-export>` for these flows.

Follow README release rules: bump with `node scripts/bump-version.mjs`, commit the three version
files, tag `vX.Y.Z-<short SHA>`, and atomically push main plus that new tag. Do not push main alone.

Preserve the API canonical taxonomy_category_cd/nm separately from the four learning aggregate areas. CategoryTrail uses the canonical name when available; old servers retain aggregate fallback. Never guess unknown codes as electrical hazards. Do not reapply the retired project-taxonomy overwrite SQL.
