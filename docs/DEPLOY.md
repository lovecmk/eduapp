# 배포 & 자동 업데이트 구조

이 앱은 **웹(PWA)** 을 GitHub Pages 로 배포한다. `main` 에 푸시하면 GitHub
Actions 가 자동으로 빌드·배포하고, 실행 중인 사용자에게 "새 버전이 나왔어요"
알림을 띄워 최신 코드로 갱신하게 한다.

## 두 개의 배포 타깃 — 웹(PWA)과 네이티브(iOS/Android)

| 도구 | 무엇을 하나 | 이 앱에서 |
| --- | --- | --- |
| **웹 PWA** | `expo export --platform web` → GitHub Pages | `deploy.yml` 이 담당(아래) |
| **EAS Build** | iOS/Android **네이티브 바이너리(APK/IPA)** 컴파일 | `eas-build.yml`(수동) + `eas.json` |
| **EAS Update** | 설치된 **네이티브 앱**에 JS 번들 OTA 푸시 | `eas-update.yml`(main 푸시) |

- **웹 타깃**은 배포 그 자체가 OTA 채널이다. 새 번들을 Pages 에 올리는 순간이 곧
  업데이트이며, `version.json` 폴링이 사용자에게 새 버전 알림 + 적용을 수행한다.
- **네이티브 타깃**은 스토어 심사를 거치는 바이너리다. 순수 JS/에셋 변경은 재심사
  없이 **EAS Update(OTA)** 로 즉시 내보내고, 네이티브 코드/의존성/런타임이 바뀌면
  **EAS Build** 로 새 바이너리를 만든다.

클라이언트의 `useAppUpdate` 훅은 플랫폼을 자동 분기한다 — 웹은 `version.json`,
네이티브는 `expo-updates`(EAS Update). 두 경로가 같은 `UpdatePrompt` UI 를 공유한다.

> **네이티브 자동 업데이트 최초 설정(사용자 1회)**: `EXPO_TOKEN` Secret 추가 →
> `eas init` → app.json 의 `EAS_PROJECT_ID_PLACEHOLDER`/`EXPO_ACCOUNT_USERNAME_PLACEHOLDER`
> 치환. 전체 절차는 **[docs/EAS.md](./EAS.md)** 참고.

## 자동 배포 파이프라인 (`.github/workflows/deploy.yml`)

웹·자동 APK·OTA는 같은 원본 커밋에서 `scripts/bump-version.mjs`로 다음 버전을 계산한다.
버전 기록을 main에 push하는 곳은 웹 배포뿐이며 `[skip ci]`로 중복 빌드를 막는다.
APK·OTA도 `EXPO_PUBLIC_BUILD_NUMBER`, 앱 버전, 커밋, 빌드 시각을 번들에 넣는다.
APK의 Android versionCode/iOS buildNumber는 이 빌드 번호를 따른다.
OTA는 운영 API 주소와 목업 비활성 설정을 명시한다.

`main` 푸시 또는 수동 실행(`workflow_dispatch`) 시:

1. Secrets → `.env` 주입 (없으면 목업 폴백값)
2. `scripts/bump-version.mjs` 로 `buildNumber` +1, `version.json` 갱신
3. 빌드 메타데이터(`EXPO_PUBLIC_BUILD_NUMBER` 등)를 `.env` 에 덧붙여 번들에 구움
4. `npx expo export --platform web` → `dist/` (여기에 `version.json` 이 함께 복사됨)
5. `dist/` 를 GitHub Pages 로 배포
6. 갱신된 `version.json` 을 레포지토리에 자동 커밋(`[skip ci]`)

## 사용자에게 업데이트를 알리는 구조

- **번들에 구워진 버전** — 빌드 시 `EXPO_PUBLIC_BUILD_NUMBER` 가 번들에 인라인됨
  (`src/data/network/env.ts` → `env.build.buildNumber`).
- **원격 매니페스트** — `dist/version.json` 이 사이트 루트에 배포됨.
- **감지** — `src/hooks/useAppUpdate.ts` 가 부팅 4초 후 1회 + 5분 주기 +
  탭 재포커스 시 `version.json` 을 캐시 우회로 조회해, 원격 `buildNumber` 가
  더 크면 새 배포로 판정(`UpdateService.isUpdateAvailable`).
- **알림 & 적용** — `src/components/ui/UpdatePrompt.tsx` 모달로 안내하고,
  "지금 업데이트" 시 ServiceWorker/CacheStorage 를 비운 뒤 캐시 버스팅
  쿼리로 하드 리로드해 최신 코드를 로드(`UpdateService.applyUpdate`).

## 배포 트리거하기

```
git push origin main    # main 푸시 = 자동 빌드·배포·버전업
```

버전 표기(`app.json` 의 `expo.version`)를 올리면 다음 빌드의 매니페스트
`version` 과 업데이트 모달에 그대로 반영된다. `buildNumber` 는 CI 가 자동
증가시키므로 수동으로 만질 필요 없다.
