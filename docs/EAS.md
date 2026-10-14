# EAS Build & EAS Update — 모바일 앱 자동 업데이트

네이티브(iOS/Android) 앱 사용자가 **무선(OTA) 자동 업데이트**를 받도록 구성한
구조와, 처음 한 번 해야 하는 설정을 정리한다.

- **EAS Update** = 이미 설치된 앱에 JS/에셋 번들을 재심사 없이 즉시 배포(OTA).
- **EAS Build** = 스토어에 올릴 네이티브 바이너리(APK/IPA) 컴파일. 네이티브
  코드/의존성/런타임이 바뀔 때만 필요.

이 저장소에 이미 포함된 것:

| 파일 | 역할 |
| --- | --- |
| `app.json` → `updates`, `runtimeVersion`, `expo-updates` 플러그인 | 앱이 OTA 서버를 바라보게 함 |
| `eas.json` | 빌드 프로필(development·preview·production) + 채널 |
| `.github/workflows/eas-update.yml` | `vX.Y.Z-<short SHA>` 릴리스 태그 푸시 시 OTA 자동 게시 |
| `.github/workflows/eas-build.yml` | 네이티브 빌드(수동 실행) |
| `src/data/update/NativeUpdateService.ts` | 앱 내부에서 `expo-updates` 로 확인/다운로드/재시작 |
| `src/hooks/useAppUpdate.ts` | 웹=version.json / 네이티브=EAS Update 자동 분기 |

---

## 자동 업데이트 동작 방식

1. 검증된 JS/에셋 변경을 main과 릴리스 태그로 함께 푸시하면 `eas-update.yml` 이
   `eas update --branch production` 으로 새 번들을 게시한다.
2. 사용자의 설치된 앱은 `app.json` 의 `checkAutomatically: ON_LOAD` 에 따라
   **콜드 스타트마다 자동으로** 새 번들을 확인·다운로드하고, 다음 실행에 적용한다.
3. 앱 사용 중이라면 `useAppUpdate` 훅이 세션 도중에도 확인해, 내려받은 업데이트가
   있으면 `UpdatePrompt` 로 "재시작하여 적용"을 안내한다(강제 아님).

네이티브 코드/의존성/`runtimeVersion` 이 바뀐 경우에는 OTA 로 못 내보내므로
`eas-build.yml` 로 새 바이너리를 만들어 스토어에 다시 올려야 한다.

---

## 최초 설정 (사용자 1회)

> Expo 계정과 토큰은 **직접** 설정한다. 아래 플레이스홀더만 실제 값으로 바꾸면 된다.

### 1) EXPO_TOKEN 시크릿 추가
- https://expo.dev → Account → **Access Tokens** 에서 personal access token 생성
- GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**
  - Name: `EXPO_TOKEN`
  - Value: 발급받은 토큰

### 2) EAS 프로젝트 연결
로컬(또는 어디서든 Expo 로그인 상태)에서 저장소 루트에서:

```bash
npm i -g eas-cli          # 또는 npx eas-cli
eas login
eas init                  # EAS 프로젝트 생성 → projectId 발급
eas update:configure      # updates.url / runtimeVersion 자동 구성
```

`app.json` 에는 projectId/updates.url 이 비어 있고, 위 두 명령이 자동으로 채운다:

| app.json 필드 | 채우는 명령 |
| --- | --- |
| `extra.eas.projectId` | `eas init` 이 발급한 UUID 를 기록 |
| `updates.url` (`https://u.expo.dev/<projectId>`) | `eas update:configure` 가 구성 |

`owner`(및 expo-updates 플러그인 `username`)는 이미 Expo 계정 username 으로
설정돼 있어야 하며, `eas init` 은 로그인된 계정이 이 `owner` 와 일치해야 한다.

### 3) 채널 ↔ 브랜치 연결 (기본값이면 자동)
`eas.json` 의 production 프로필은 `channel: production` 이다. OTA 게시는
`--branch production` 으로 나가므로, production 채널이 production 브랜치를
가리키게 한다(이름이 같으면 첫 게시 시 자동 연결):

```bash
eas channel:view production   # 연결 확인(없으면 첫 update 시 생성됨)
```

> ⚠️ **로컬 APK 빌드(`build-apk.yml`)는 채널을 `eas.json` 에서 못 읽는다.**
> `eas build`(클라우드)만 `eas.json` 의 `channel` 을 네이티브에 구워 넣는다.
> 이 앱의 실제 안드로이드 APK 는 `expo prebuild` + `gradlew` 로 만드는 **로컬
> 빌드**라 `eas.json` 을 거치지 않으므로, 채널이 안 박히면 설치본이 어느 브랜치를
> 볼지 몰라 `checkForUpdateAsync` 가 항상 `isAvailable:false` 를 반환한다(=OTA
> 영영 안 옴). 그래서 채널을 `app.json` 의 `updates.requestHeaders` 로 직접
> 명시한다:
>
> ```json
> "updates": {
>   "url": "https://u.expo.dev/<projectId>",
>   "requestHeaders": { "expo-channel-name": "production" }
> }
> ```
>
> 이 헤더가 AndroidManifest 에 구워져, prebuild 로 만든 APK 도 production 브랜치의
> OTA 를 정상 수신한다. **이 값을 넣은 뒤 APK 를 다시 빌드·설치해야** 기존 설치본에
> 반영된다(이미 깔린 구버전 APK 에는 소급 적용 불가).

### 4) 최초 네이티브 빌드
OTA 는 "이미 설치된 빌드"에만 적용되므로, 먼저 production 빌드가 한 번은 있어야 한다.

```bash
eas build --profile production --platform all
```

또는 GitHub → **Actions → EAS Build (Native) → Run workflow** 에서 실행.

---

## 이후 운영

- **JS/에셋만 변경** → patch/빌드 번호를 올리고 main과 릴리스 태그를 함께 푸시한다. `eas-update.yml`이 APK/Web과 동일한 태그 버전을 검증해 OTA를 게시한다.
  (수동: Actions → **EAS Update (OTA)** → Run workflow → 브랜치 선택)
- **네이티브 변경**(새 네이티브 모듈, `app.json` 권한, `runtimeVersion` 등)
  → `eas-build.yml` 로 새 빌드 후 스토어 제출. 그 다음부터 다시 OTA.

### runtimeVersion 정책
현재 **고정 문자열** `"runtimeVersion": "1.11.0"` 이다. OTA 는 **같은 런타임
버전**의 설치본에만 적용된다.

> ⚠️ **`{ "policy": "appVersion" }` 을 쓰면 안 된다.** 이 앱의 `version` 은 웹
> PWA 배포 카운터로서 릴리스마다 계속 올라간다(1.5 → … → 1.11). `appVersion`
> 정책은 런타임 버전을 이 `version` 에 묶으므로, `version` 을 올린 뒤
> `eas update` 를 게시하면 업데이트가 **아무 설치본과도 매칭되지 않아** 사용자가
> 영영 받지 못한다. 게다가 `eas.json` 의 `appVersionSource: "remote"` 와 겹치면
> 빌드가 구운 런타임과 `eas update` 가 계산한 런타임이 서로 어긋난다.

그래서 런타임 버전을 마케팅 `version` 과 **분리**해 고정 문자열로 못박는다.

- **JS/에셋만 바뀔 때**(대부분의 OTA): `runtimeVersion` 은 **그대로 둔다**.
  `version` 은 얼마든지 올려도 OTA 매칭에 영향이 없다.
- **네이티브가 바뀌어 재빌드**할 때만: 새 바이너리를 스토어에 올리는 것에 맞춰
  `runtimeVersion` 을 새 값으로 올린다(예: `"1.12.0"`). 이때부터 그 런타임의
  OTA 가 나간다. **반드시 스토어 빌드와 `runtimeVersion` 값을 함께 올려야** 한다.

> 현재 값 `"1.11.0"` 은 expo-updates 가 처음 도입된(=OTA 가능한 최초 네이티브
> 빌드) 버전에 맞춘 것이다. 실제 스토어 배포본의 런타임과 다르면
> `eas update:list` / `eas channel:view production` 로 확인해 값을 맞춰야 한다.

---

## 참고
- EAS Update: https://docs.expo.dev/eas-update/introduction/
- GitHub Action(`expo/expo-github-action`): https://github.com/expo/expo-github-action
- 이 앱은 Expo SDK 52 에 고정(`expo-updates ~0.27.5`). 버전 변경 시
  `npx expo install expo-updates` 를 사용한다(AGENTS.md 규칙).
