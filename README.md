# 하루3분ON (eduapp)

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

앱 안에는 회원가입·비밀번호 찾기가 없다(목업 모드에서만 보인다). 계정은 브릿지가
쥐고 있어 이 앱이 만들 수도 고칠 수도 없다.

## 시작하기

```bash
npm install
cp .env.example .env    # 서버 주소를 확인한다
npm start
```

`.env` 의 `EXPO_PUBLIC_API_BASE_URL` 이 서버를 가리킨다. 비워 두면 목업으로 돌아
서버 없이도 화면을 볼 수 있다(`EXPO_PUBLIC_USE_MOCK_DATA` 로 명시할 수도 있다).

```bash
npm run verify   # typecheck + jest
```

## 어느 서버를 보는가

주소는 두 개뿐이고, **그 값 하나가 네이티브 보안 설정까지 함께 정한다.**

| | 주소 | 누가 쓰나 |
|---|---|---|
| 운영 | `https://bridge.kfpa.or.kr` | **기본값.** 로컬 개발·EAS 프로필 전부 (DMZ1) |
| 테스트 | `http://test.inplat.org:8090` | 사내망에서만 닿는다. 어느 프로필도 기본으로 쓰지 않는다 |
| 목업 | (빈 값) | 서버 없이 화면만 |

테스트 주소는 사내망 밖에서 DNS 조차 풀리지 않아, 그대로 앱을 켜면 요청이 서버에
닿지 못하고 화면에는 "네트워크에 연결할 수 없어요" 만 뜬다(서버는 멀쩡한데 원인을
서버에서 찾게 되는 실패다). 사내망 안에서 확인할 때만 `.env` 를 손으로 바꿔 쓴다.

`/api` 는 붙이지 않는다 — ApiClient 가 모든 요청에 알아서 붙인다.

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
`production` / `test` / `mock` 을 고른다. main 푸시로 자동 실행되면 `production` 이다.

**로컬 확인** — 앱의 `개발자 모드 > 환경 설정` 화면에 지금 보는 주소와
`실서버(Live)/목업(Mock)` 이 그대로 표시된다. 서버 점검 버튼은 `GET /inner/api/v1/health` 를
때려 응답 시간과 서버 버전을 보여준다.

> 목업으로 배포되는 사고를 막는 장치가 둘 있다. 워크플로가 주소를 스스로 정하고
> (예전에는 시크릿이 비면 조용히 목업 APK 가 나갔다), 주소가 있는데 목업 모드면
> `env.ts` 가 경고 로그를 남긴다.

## 서버를 손봐야 할 때

`BE/daily3min/README.md` 를 본다. 환경변수(`D3M_*`), 만들어야 할 DB,
회원·등급이 매핑되는 규칙, 그리고 이 백엔드를 다시 떼어 내는 방법이 거기 있다.

API 계약은 `docs/API_CONTRACT.md` 에 그대로 남아 있다 — 주소가 바뀌지 않았으므로
여전히 정본이다.

## 앱 내부를 손보기 전에

화면/라우터/비동기 처리 점검 결과와 재현 명령은
[docs/UI_AUDIT_2026-10-02.md](./docs/UI_AUDIT_2026-10-02.md)에 있다.
`npm run audit:ui`는 페이지·이벤트·화면 이동 목록을 생성하고,
`npm run test:ui -- <목업 웹 번들 경로>`는 격리된 브라우저 검사를 실행한다.

서버와 콘솔은 **다른 사설 저장소**에 있어 여기서 열어 볼 수 없다. 그래서 앱을
고치는 데 필요한 저쪽 내용을 옮겨 적어 두었다 —
**[docs/PLATFORM_SPLIT.md](./docs/PLATFORM_SPLIT.md)**.

서버가 도는 조건(속도 제한·토큰 수명·반쯤 뜬 상태), 회원·등급 매핑, 실제로 등록된
경로 목록, 운영자가 재배포 없이 바꾸는 값(`/inner/api/v1/config`)과 콘솔 화면이 앱에 미치는
영향, 두 저장소에 걸쳐 **함께 고쳐야 하는 짝**(하루 출제 범위·출제 알고리즘·폴백
판단), 그리고 분리하면서 앱 안에 남은 뒷정리 목록이 있다.
