# PC에서 APK와 OTA 배포

기본 배포는 GitHub Actions를 실행하지 않는다. PC에서 APK를 빌드해 GitHub Release에
공개한 다음 같은 소스의 Android JavaScript/에셋을 Expo EAS Update에 직접 게시한다.
GitHub Actions의 월 실행 시간과 관계없이 가능하며, Expo의 MAU/전송량 한도는 별도다.
네이티브 의존성은 Expo SDK 52에 고정한다.

## 최초 PC 설정

Node와 Android 빌드 도구는 README의 PC 릴리스 설정을 따른다. Expo CLI가 없다면 설치하고,
PowerShell에서 브라우저로 기존 프로젝트 소유 계정 또는 배포 권한이 있는 계정에 로그인한다.

```powershell
npm.cmd install -g eas-cli
eas.cmd login --browser
eas.cmd whoami
eas.cmd account:usage raywon --json --non-interactive
```

현재 프로젝트는 `@raywon/new-app`, ID `e19dea99-7f73-41b8-83d6-d6b0b99fbe91`이다.
`eas init`으로 새 프로젝트를 만들지 않는다. 로그인은 Expo CLI의 표준 세션 저장소를 사용한다.
프로세스 환경의 `EXPO_TOKEN`도 지원하지만 저장소/로컬 설정/로그에 토큰을 기록하지 않는다.
스크립트는 전역 또는 프로젝트의 EAS CLI를 찾는다. 다른 설치 경로는 프로세스 환경
`LOCAL_RELEASE_EAS_CLI`에 `eas-cli/bin/run`의 절대 경로를 지정할 수 있다.

사내 인증서를 사용하는 PC는 무시된 `.release-config.local`에 `nodeExtraCaCerts`로
Windows에서 신뢰하는 공개 CA PEM 파일 경로를 지정한다. 빌드/OTA 자식 프로세스에만
`NODE_EXTRA_CA_CERTS`를 전달하며 TLS 검증이나 전역 Node 설정은 바꾸지 않는다.
이 설정이 있는 PC의 로그인은 `npm.cmd run expo:login`을 사용한다.

## 기본 배포

```powershell
npm.cmd run release -- --dry-run
npm.cmd run release
```

깨끗한 main에서 버전 3개 파일을 동기화하고 커밋한다. 타입/전체 테스트/릴리스 검사,
Expo prebuild/Gradle APK 빌드, 패키지/버전/기존 인증서/번들 검증을 통과한 뒤 main과
새 태그를 원자적으로 push하고 검증된 GitHub Release를 공개한다. 이어서 OTA를 게시한다.

OTA는 다음을 검사한다.

- APK와 동일한 운영 API, 버전, 빌드 번호, HEAD를 프로세스 환경으로 주입하며 `.env`를 읽지 않는다.
- `app.json`의 기존 프로젝트 URL, production 요청 헤더와 고정 `runtimeVersion`을 확인한다.
- `scripts/ota-runtime.json`의 기준과 의존성/lockfile/Expo 설정/네이티브 플러그인 해시를 비교한다.
- 공개된 APK의 출처/체크섬/원격 자산과 태그/최신 원격 main의 소스가 같은지 확인한다.
- production 채널은 일시 중지나 분할 없이 production 브랜치 하나에 연결되어 있어야 한다.
- Android 번들을 먼저 export하고 현재 커밋/운영 API/버전이 들어 있는지 확인한 뒤 업로드한다.
- 게시 후 업데이트를 다시 조회해 Android/커밋/런타임/브랜치/릴리스 메시지를 검증한다.
- 실제 앱과 같은 요청 헤더로 production OTA 서버를 조회해 게시한 업데이트 ID가 제공되는지 확인한다.

게시 결과는 git에서 제외된 `dist-release/<버전>/OTA-INFO.json`에 남긴다.
GitHub에 공개된 기존 자산이나 태그는 덮어쓰지 않는다. 기존 hosted 워크플로는 수동 대체 경로다.

## 실패 후 재개

APK 업로드 실패는 README의 `release:local -- <태그> --publish-only`로 재개한다.
APK는 공개됐지만 OTA만 실패했다면 같은 깨끗한 소스와 로컬 APK 산출물에서 실행한다.

```powershell
npm.cmd run release:ota -- vX.Y.Z-SHA --dry-run
npm.cmd run release:ota -- vX.Y.Z-SHA
```

OTA를 위해 버전을 다시 올리거나 태그를 재생성하지 않는다. 동일 릴리스가 이미 production의
최신 업데이트라면 기존 업데이트를 조회·검증하고 중복 게시하지 않는다. 예전 소스로
production을 되돌리지 않도록 현재 원격 main에 해당하는 릴리스만 게시할 수 있다.

## 사용자가 받는 방법

설치 APK에 OTA 서버/production 채널과 호환 `runtimeVersion`이 들어 있어야 한다.
현재 1.13.98 APK에는 이 설정이 들어 있다. 앱을 완전히 종료했다 다시 실행하면 업데이트를
확인·다운로드하고 다음 실행에 적용한다. 사용 중 새 업데이트를 받으면 "지금 업데이트" 안내로
재시작할 수 있다. 테스트 기기에서 실제 적용 여부를 확인한 결과와 서버 게시 검증은 구분한다.

## 네이티브 변경

JS/스타일/이미지만 바뀌면 같은 런타임으로 OTA를 보낼 수 있다. 네이티브 모듈, 의존성,
권한, Expo 플러그인, 앱 설정이 바뀌면 기존 APK에 OTA로 적용할 수 있다고 가정하지 않는다.

1. `app.json`의 고정 `runtimeVersion`을 새 값으로 올린다. 마케팅 버전과는 별개다.
2. `npm.cmd run release -- --apk-only`로 새 APK를 배포한다.
3. 새 APK의 네이티브 구성을 확인하고 `scripts/ota-runtime.json`에 새 런타임,
   `nativeRuntimeHash()`의 해시, 검증 APK 태그를 기록한다.
4. 변경을 커밋하고 다음 기본 릴리스부터 새 런타임의 OTA를 게시한다.

```powershell
node --input-type=module -e "import {nativeRuntimeHash} from './scripts/release-ota.mjs'; console.log(nativeRuntimeHash(process.cwd()));"
```

`runtimeVersion: { policy: 'appVersion' }`으로 바꾸면 매번 버전이 올라 기존 설치본과
OTA 런타임이 갈라지므로 현재 프로젝트에서는 고정 문자열 정책을 유지한다.

## 참고

- [Expo SDK 52 Updates 소스 문서](https://github.com/expo/expo/blob/sdk-52/docs/pages/versions/v52.0.0/sdk/updates.mdx)
- [EAS Update 배포](https://docs.expo.dev/eas-update/getting-started/)
- [Expo 사용량](https://docs.expo.dev/billing/usage-based-pricing/)
