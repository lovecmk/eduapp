# 배포 & 자동 업데이트 구조

이 앱은 **웹(PWA)** 을 GitHub Pages 로 배포한다. `main` 에 푸시하면 GitHub
Actions 가 자동으로 빌드·배포하고, 실행 중인 사용자에게 "새 버전이 나왔어요"
알림을 띄워 최신 코드로 갱신하게 한다.

## EAS Update 가 필요한가? EAS Build 가 필요한가? → 둘 다 필요 없음

| 도구 | 무엇을 하나 | 언제 필요 |
| --- | --- | --- |
| **EAS Build** | iOS/Android **네이티브 바이너리(APK/IPA)** 컴파일 | 앱스토어·플레이스토어에 네이티브 앱을 낼 때 |
| **EAS Update** | 이미 설치된 **네이티브 앱**에 JS 번들 OTA 푸시 | 스토어 앱의 JS를 재심사 없이 갱신할 때 |
| **현재 방식(웹 PWA)** | `expo export --platform web` → GitHub Pages | 웹으로 배포·접속할 때 (지금 이 앱) |

웹 배포는 그 자체가 OTA 채널이다. 새 번들을 Pages 에 올리는 순간이 곧
업데이트 배포이며, 아래 `version.json` 폴링이 EAS Update 와 동일한 역할
(사용자에게 새 버전 알림 + 적용)을 웹에서 수행한다. 따라서 **웹 타깃에는
EAS 가 전혀 필요 없다.**

> 나중에 스토어용 **네이티브 앱**을 실제로 배포하기로 하면, 그때
> `eas.json` 을 추가하고 `EAS_PROJECT_ID` 를 설정한 뒤 EAS Build(최초 1회)
> + EAS Update(이후 OTA)를 붙이면 된다. 클라이언트 코드는 이미 네이티브에서
> `Platform.OS !== 'web'` 일 때 폴링을 건너뛰도록 되어 있어 그대로 공존 가능.

## 자동 배포 파이프라인 (`.github/workflows/deploy.yml`)

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
