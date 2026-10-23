# 하루3분ON (eduapp)

> 목적: 모바일 개발·실서버 연결·릴리스 안내
> 기준 문서: `AGENTS.md`, `eas.json`, `docs/THREE_REPO_AUDIT.md`
> 작성자: codex
> 최종 갱신일: 2026-10-14

현장 안전학습 모바일 앱. Expo(React Native) + expo-router.

## 이 저장소에 있는 것

**모바일 앱만 있다.** 서버와 관리 콘솔은 KFPA 브릿지 플랫폼 안으로 옮겼다.

| 무엇 | 어디로 갔나 |
|---|---|
| Go 백엔드 (`backend/`) | KFPA 브릿지 저장소 `BE/daily3min/` — 브릿지 서버(kbwiki) 프로세스에 얹혀 돈다 |
| 관리 콘솔 (`admin/`, Vue) | mybrdg 운영관리 `FE/mybrdg/src/pages/Operations/Content-Setting/Daily3Min/` |

옮긴 이유는 회원 때문이다. 이 앱을 쓸 사람들은 이미 브릿지에 계정이 있고 등급도
있다. 서버를 따로 두면 같은 사람이 두 시스템에 두 번 존재하게 되고, 그때부터
"어느 쪽 비밀번호가 진짜인가 / 퇴사 처리했는데 왜 앱은 계속 열리는가" 가 영원히
따라다닌다. 그래서 서버를 브릿지 옆으로 옮기고 회원은 브릿지 것 하나만 본다.

API 는 모두 `/inner/api/v1` 아래에 있다(`/inner/api/v1/auth/login`,
`/inner/api/v1/progress` …). 리버스 프록시의 location 블록이 이 접두사를 브릿지
프로세스로 넘긴다 — 앱이 부르는 주소도 전부 이것 하나로 맞춰져 있다.

## 로그인

브릿지 계정으로 로그인한다. **사내 이메일 또는 브릿지 아이디** 둘 다 받는다 —
사람들이 외우고 있는 것은 대개 아이디가 아니라 자기 이메일이다.

앱 안에는 회원가입·비밀번호 찾기가 없다. 계정은 브릿지가
쥐고 있어 이 앱이 만들 수도 고칠 수도 없다.

## 시작하기

```bash
npm install
cp .env.example .env    # 서버 주소를 확인한다
npm start
```

`.env` 의 `EXPO_PUBLIC_API_BASE_URL` 이 서버를 가리킨다. 비어 있으면 연결 설정 오류다.
목업 모드와 `EXPO_PUBLIC_USE_MOCK_DATA`는 폐지했고 모든 저장소가 실서버 API를 사용한다.
시험 자료는 `src/__tests__/fixtures/`에 있으며 운영 코드에서 import하지 않는다.

```bash
npm run verify   # typecheck + jest
```

## 어느 서버를 보는가

주소는 두 개뿐이고, **그 값 하나가 네이티브 보안 설정까지 함께 정한다.**

| | 주소 | 누가 쓰나 |
|---|---|---|
| 운영 | `https://bridge.kfpa.or.kr` | **기본값.** 로컬 개발·EAS 프로필 전부 (DMZ1) |
| 테스트 | `http://test.inplat.org:8090` | 사내망에서만 닿는다. 어느 프로필도 기본으로 쓰지 않는다 |

테스트 주소는 사내망 밖에서 DNS 조차 풀리지 않아, 그대로 앱을 켜면 요청이 서버에
닿지 못하고 화면에는 "네트워크에 연결할 수 없어요" 만 뜬다(서버는 멀쩡한데 원인을
서버에서 찾게 되는 실패다). 사내망 안에서 확인할 때만 `.env` 를 손으로 바꿔 쓴다.

`/api`나 `/inner/api/v1`은 주소에 붙이지 않는다. 각 저장소의 요청 경로에 `/inner/api/v1`이 있다.

주소가 `http://` 면 `app.config.js` 가 **그 호스트 하나에 대해서만** 안드로이드
cleartext / iOS ATS 예외를 붙인다(`plugins/withInsecureApiHost.js`). 운영(https)
빌드에는 예외가 붙지 않는다.

이 장치가 필요한 이유: 안드로이드 9부터 앱의 평문 HTTP 는 기본 차단이라, Expo Go
에서 잘 되던 것이 **릴리스 APK 에서만** 조용히 실패한다. 화면에는 "네트워크에
연결할 수 없어요" 한 줄만 뜨고, 서버는 멀쩡하므로 원인을 서버에서 찾게 된다.
그렇다고 예외를 app.json 에 상수로 박으면 스토어에 올라가는 빌드까지 평문 통신을
허용한 채 나간다. 그래서 주소를 보고 그때만 붙인다 — 지우는 것을 잊을 자리가 없다.

빌드가 어느 서버를 보는지는 빌드 로그 첫 줄에 찍힌다:
`[app.config] API=https://bridge.kfpa.or.kr`

## 배포

**EAS 빌드** — 프로필이 주소를 정한다(`eas.json` 의 `env`). 시크릿 설정이 필요 없다.

```bash
eas build --profile production --platform android   # → https://bridge.kfpa.or.kr
eas build --profile preview --platform android      # → https://bridge.kfpa.or.kr (사내 배포용 APK)
```

**GitHub Actions APK** — `Build Android APK (Local)` 를 수동 실행하면 드롭다운에서
`production` / `test`를 고른다. 2026-10-16부터 태그 자동 실행은 끄고 수동 대체 경로로만 유지한다.

**로컬 확인** — 앱의 `개발자 모드 > 환경 설정` 화면에 지금 보는 주소와
`실서버(Live)`와 대상 서버가 표시된다. 서버 점검 버튼은 `GET /inner/api/v1/health`를
때려 응답 시간과 서버 버전을 보여준다.

기본 릴리스는 **PC에서 APK를 빌드하고 GitHub Release에 직접 게시**한다. 깨끗한 main에서
`npm run release`를 실행하면 `node scripts/bump-version.mjs`로 patch/빌드 번호를 올려
app.json·version.json·public/version.json을 맞추고 버전 커밋을 만든다. 타입·전체 회귀 시험 및
릴리스 검사를 통과한 다음 Expo SDK 52 prebuild와 Gradle wrapper로 APK를 만든다.
APK의 패키지·버전·versionCode·기존 인증서 일치를 검사한 뒤 `vX.Y.Z-<짧은 SHA>` 태그와
main을 원자적으로 push하고, APK·SHA256SUMS.txt·BUILD-INFO.json이 모두 업로드된 초안만 공개한다.
기존 테스트 APK와 동일하게 prerelease로 게시한다. GitHub 인증은 Git Credential Manager의 기존
인증 또는 프로세스 환경의 GH_TOKEN을 사용하며 Expo/EAS 계정은 필요하지 않다.

Android 원격 푸시는 `com.raywon.newapp`용 Firebase `google-services.json`과 Expo 프로젝트의
FCM V1 발송 자격 증명이 별도로 필요하다. Firebase 클라이언트 파일은 저장소 루트의 무시된
`google-services.json` 또는 빌드 프로세스의 `GOOGLE_SERVICES_JSON` 경로로 연결한다. 다른 패키지의
파일은 빌드 전에 거부한다. 파일이 없으면 빌드는 가능하지만 원격 푸시는 사용할 수 없으며,
앱 내 알림과 로컬 학습 리마인더는 별도다. 서비스 계정 비밀키를 앱에 넣거나 커밋하지 않는다.

필요 도구: Node, JDK 17 (React Native Gradle plugin의 고정 toolchain), Android SDK 35·build-tools 35.0.0·NDK 26.1.10909125·
CMake 3.22.1. Windows에서는 SDK CMake의 Ninja를 1.12 이상으로 준비한다. 기본 1.10.2는
Reanimated 생성 경로가 260자를 넘으면 mkdir 오류가 난다. 이 PC는 공식 Ninja 1.12.1을 사용한다.
SDK는 `ANDROID_HOME` 또는 Windows 기본 `%LOCALAPPDATA%/Android/Sdk`에서 찾는다.
이 PC의 기존 전역 Gradle을 사용하지 않고 android/gradlew를 사용한다. prebuild가 android/를 갱신하므로
네이티브 변경은 Expo config/plugin으로 관리한다. 의존성은 SDK 52에 고정한다.

기존 배포 APK의 `apksigner verify --print-certs`로 확인한 인증서 SHA-256을 git에서 제외되는
`.release-config.local`에 `{"androidCertificateSha256":"<64자리 SHA-256>"}`로 기록한다.
`LOCAL_RELEASE_ANDROID_CERT_SHA256` 환경 변수도 지원한다. 기존 디버그 서명은 유지하며 새 키를
만들지 않는다. 운영 API와 빌드 메타데이터를 프로세스 환경으로 고정하고 로컬 .env는 변경하지 않는다.
같은 로컬 설정에 `javaHome`을 지정하면 전역 JAVA_HOME 대신 해당 JDK를 이 빌드에서만 사용한다.
사내 CA가 필요한 Windows PC는 `useWindowsTrustStore: true`로 Windows ROOT 저장소를 사용한다.
TLS 검증을 끄거나 전역 Java 인증서를 수정하지 않는다.
Gradle은 Prefab의 비어 있지 않은 stderr를 CXX 오류로 해석하므로 빌드 자식 프로세스에서만
JAVA_TOOL_OPTIONS·_JAVA_OPTIONS·JDK_JAVA_OPTIONS를 제거한다. 메모리/인증서 옵션은 조용한
Gradle JVM 인수로 전달하며 사용자의 전역 환경 변수는 변경하지 않는다.
Windows의 배치/셸 따옴표 변형을 피하려고 동일한 GradleWrapperMain 진입점을 Java 인수 배열로 직접 실행한다.
이전 SHA가 들어간 Gradle 캐시를 재사용하지 않도록 릴리스마다 JS 번들을 다시 생성한다.
Expo SDK 52가 CI 모드에서 Metro 캐시 초기화를 무시하므로 네이티브 빌드 프로세스에서만 CI=0을
사용해 캐시를 비우고, 완성된 번들에 현재 커밋과 운영 API가 들어 있는지도 게시 전에 검사한다.

`npm run release -- --dry-run`은 버전·GitHub 사전 검사만 하고 변경을 원복한다.
이미 push된 현재 태그는 `npm run release:local -- vX.Y.Z-SHA`로 빌드·게시할 수 있다.
업로드 실패 후에는 같은 명령에 `--publish-only`를 붙여 기존 dist-release/<판>의 출처·체크섬을
검증하고 재개한다. `--prepare-only`는 빌드만 한다. 빌드 실패로 버전 커밋만 남으면 원인을 해결해
`npm run release -- --resume`으로 버전/빌드 번호를 다시 올리지 않고 검사·빌드·main+새 태그 push를 재개한다.
기존 버전/태그/공개 자산은 덮어쓰지 않는다.
APK·웹·OTA hosted 워크플로는 수동 실행만 가능하며 태그/main push는 빌드를 시작하지 않는다.
이번 전환은 APK Release 배포가 대상이며 EAS OTA와 Pages 호스팅은 별도 수동 경로로 유지한다.
웹 번들은 gh-pages 브랜치에 게시된다. 현재 비공개 저장소의 GitHub 요금제는 Pages 호스팅을 지원하지 않아 웹 주소는 제공되지 않는다. 호스팅을 사용하려면 지원 요금제에서 Pages Source를 gh-pages로 설정하거나 별도 웹 호스트로 배포해야 한다. 저장소 공개 전환은 하지 않는다.

## 서버를 손봐야 할 때

`BE/daily3min/README.md` 를 본다. 환경변수(`D3M_*`), 만들어야 할 DB,
회원·등급이 매핑되는 규칙, 그리고 이 백엔드를 다시 떼어 내는 방법이 거기 있다.

API 계약은 `docs/API_CONTRACT.md` 에 그대로 남아 있다 — 주소가 바뀌지 않았으므로
여전히 정본이다.

## 앱 내부를 손보기 전에

화면/라우터/비동기 처리 점검 결과와 재현 명령은
[docs/UI_AUDIT_2026-10-02.md](./docs/UI_AUDIT_2026-10-02.md)에 있다.
`npm run audit:ui`는 페이지·이벤트·화면 이동 목록을 생성하고,
`npm run test:ui -- dist`는 실서버 저장소를 사용하는 번들에 격리 HTTP 응답을 제공해
빈 데이터·로딩·오류·세션 만료·좁은 화면을 검사한다. 실제 서버에는 쓰지 않는다.

세 저장소의 계약 대조, DB 감사·정리, 백엔드 배포 순서는
[통합 점검 기록](docs/THREE_REPO_AUDIT.md)을 확인한다. 이전 플랫폼 이관 문서의
목업 폴백 설명은 현재 적용되지 않는다.

서버가 도는 조건(속도 제한·토큰 수명·반쯤 뜬 상태), 회원·등급 매핑, 실제로 등록된
경로 목록, 운영자가 재배포 없이 바꾸는 값(`/inner/api/v1/config`)과 콘솔 화면이 앱에 미치는
영향, 두 저장소에 걸쳐 **함께 고쳐야 하는 짝**(하루 출제 범위·출제 알고리즘·폴백
판단), 그리고 분리하면서 앱 안에 남은 뒷정리 목록이 있다.

## 학습·복습 기준 (2026-10-14)

기본 편성은 하루 신규 3장과 도래한 복습 최대 2장이다. `REVIEW`(다시 보기)는
KST 기준 3일 뒤부터 복습하며, `KNOWN`은 기존대로 복습 완료로 처리한다.
모바일 복습 탭은 하루 복습한 장수를 반영해 남은 2장 한도만 제시한다.
서버에서 명시한 사용자 지정 간격은 유지하고, 정책 응답이 없으면 기본 3일을 사용한다.
신규 3장 서버 편성은 짝이 되는 `daily3min` dev 변경을 운영에 반영해야 적용된다.
이미 확정된 당일 목록과 과거 학습 기록은 다시 쓰지 않는다.

완료 화면·홈·알림의 복습 진입은 하단 복습 탭을 사용한다. 이미지 확대는 공용
`ImageViewer`에서 단일 탭으로 닫고 핀치·팬은 닫기와 분리한다.
`npm run test:learning-ui -- dist`는 최신 웹 export에 격리 HTTP 응답을 제공해
연속 탭, 앞뒤 이미지 닫기, 3장 학습 완료와 복습 탭 전환을 재현한다.
운영 DB에 카드를 만들거나 수정하지 않는다.


## 카드 신고와 스튜디오 재검수 (2026-10-15)

학습 카드와 카드 상세의 기존 신고 진입점에서 사유·메모를 보냅니다.
신고 모달은 `POST /inner/api/v1/reports`의 durable 전송 결과를 기다립니다.
서버가 받으면 신고 접수 완료, 오프라인 큐에 저장하면 기기 저장·자동 재전송 안내를 표시합니다.
접수가 거절되면 성공으로 기록하지 않고 다시 시도할 수 있습니다.
기존 로컬 신고는 로그인 시 이전과 같이 backfill하되, 새 신고를 중복 전송하지 않습니다.

신고는 WindowApp 배포 관리함의 신고접수 필터로 연결됩니다. 관리자는 재검수를 요청해 배포를 취소하고,
한국화재보험협회 소속 직원에게 다시 배분합니다. 검수 완료 후에도 재배포는 관리자의 명시적 작업입니다.
이 흐름은 백엔드 dev 변경의 별도 서버 반영이 필요합니다.

## 카드 표시와 복습 선택 (2026-10-15)

홈과 통계의 `학습 완료 카드 N장`은 기존 서버 `total_learned`의 실제 의미에 맞춘 이름입니다.
`StatsService.Compute`가 현재 사용자에게 조회 가능한 카드 중 `MASTERED`인 카드 ID를 한 번씩 셉니다.
학습 일수, 전체 학습/복습 횟수, 평생 학습한 고유 카드 수가 아닙니다. 현재 정책에서
`알고 있었어요/이해했어요`(good/easy, KNOWN)를 선택하면 완료가 되고, 다시 보기(again/hard,
REVIEW)를 선택하면 완료 집계에서 빠질 수 있습니다. SRS 기준은 box ≥ 4이며 마지막 판정이
again/hard가 아니어야 합니다. 로딩 중 카드 목록으로 계산하는 대체 값도 동일한 완료 상태 기준입니다.

앞면 상황 설명과 질문은 경로별로 같은 크기·굵기·줄간격을 쓰며 긴 본문은 기존 카드 내부에서
스크롤합니다. 공통 뒷면은 해설(결론) → 상세설명(원리) → 화재·폭발 진행 프로세스 → 화재 3요소
순서로 보여주고, 없는 본문은 숨깁니다. 뒤에는 기존 개선 권고·키워드·출처·참고 순서를 유지합니다.
좋아요·저장·신고는 공통 `CardReactionBar`로 뒷면에 표시하고 기존 저장소/동기화 API를 사용합니다.
넘어가기 직전의 체감 난이도 모달에는 난이도 입력만 남습니다.

복습 상세의 체감 난이도는 기존 선택을 강조하는 읽기 전용 표시이며 수정·신규 투표를 할 수 없습니다.
해설 아래는 `현장 팁 → 처음 선택한 답변 → 체감 난이도` 순서이며, 각 섹션 제목에는 같은 모양의 아이콘 칩(`SectionTitle`)이 붙습니다.
`체감 난이도` 카드 안의 맨 위(난이도 항목 위)에 `다음에 한번 더 볼게요 / 안 볼게요` 두 항목을 표시하고,
최초 선택한 항목만 강조합니다. 두 항목 모두 클릭·변경할 수 없는 기록입니다.
두 답변 칸은 아이콘과 문구를 가로로 배치해 기본 글씨에서 약 44~53px 높이로 표시합니다.
큰 글씨에서는 문구에 맞춰 높이가 늘어나며, 최초 선택 강조와 읽기 전용 동작은 유지합니다.
별도의 답변 카드는 제거했으며, 복습 상세를 열거나 기록을 눌러도 SRS 일정·학습 횟수는 바뀌지 않습니다.
실제 학습 흐름의 자기평가와 Y/N 간격 정책은 유지합니다. 최초 선택은 기존
`srs-scheduler` 기기 저장소의 카드별 `firstGrade`/`firstReviewedAt`, 마지막 선택은
`lastGrade`/`lastReviewedAt`에 보존합니다. 서버 병합이 최신 일정으로
바뀌어도 기기의 최초 선택은 유지합니다. 과거 채점이 정확히 1회인 기록만 최초값으로 복원하며,
여러 번 학습한 옛 기록의 마지막 값을 최초라고 추측하지 않습니다. 일반 서버 SRS 응답에는
최초값이 없으므로 재설치·다른 기기·계정 데이터 초기화 후에는 확인 불가 안내가 나올 수 있습니다.
동일 계정 앱 재시작/재로그인에는 유지되며, 기존 계정 전환 초기화 규칙도 유지합니다.
이번 변경에는 백엔드 API/스키마 수정이 필요하지 않습니다.

`npm run test:card-ui -- <web-export>`는 격리 HTTP 응답으로 섹션 순서, 반응 API, 카드별 상태,
읽기 전용 난이도·카드 내부의 최초 선택 표시, 일정 불변, 재시작·서버 병합, 320/390px·라이트/다크·최대 글씨를 검사합니다.
스크린샷과 결과는 시스템 임시 폴더 `d3m-card-presentation`에 저장하며 운영 서버에 쓰지 않습니다.

화면 회귀 검사에서 확인한 웹 하단 탭의 선택 상태는 `aria-selected`도 명시적으로 전달해
네이티브 접근성 상태와 함께 유지합니다. Expo SDK 52 의존성 버전은 변경하지 않았습니다.

## 세 프로젝트 분류 계약 동기화 (2026-10-15)

앱의 분야 집계는 유지하면서 `taxonomy_category_cd/nm`으로 실제 전기·화기 등 기술 분류 경로를 표시합니다. 구형 API와도 호환하며 알 수 없는 값을 전기 위험으로 오인하지 않습니다. 기존 학습/복습 표시와 신고 흐름을 전체 재검증했습니다. 상세 검증과 백엔드 반영 조건은 [통합 기록](docs/THREE_REPO_AUDIT.md)에 있습니다.
