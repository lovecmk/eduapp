# 아키텍처 & 폴더 구조

현장학습(KFPA Field Safety Learning) — Expo SDK 52 / React Native / expo-router.

> **중요:** `app/` 디렉터리는 expo-router의 **파일 기반 라우팅**이라 폴더 구조가 곧 URL이다.
> 라우트 파일은 임의로 이동하면 화면 경로가 깨진다. 아래 레이어 구분은 **논리적 계층**이며,
> 물리적 위치는 라우팅 규칙(app/*)과 소스 계층(src/*)을 따른다.

## 최상위 레이어

```
eduapp/
├─ app/            # ── FRONT (화면/라우트) ── expo-router
│  ├─ (auth)/      #   로그인·회원가입·비밀번호 재설정
│  ├─ (tabs)/      #   홈·학습·복습·커뮤니티·MY·통계
│  ├─ profile.tsx  #   내 프로필(바이오·성취 뱃지)
│  ├─ pack-rules.tsx   # 카드팩 획득 조건(설정에서만 진입)
│  ├─ collection-book.tsx / collection/[type].tsx  # 카드 컬렉션
│  ├─ admin.tsx    #   ── ADMIN (관리 콘솔, 웹 우선) ──
│  └─ ...          #   share·trophy·settings·support·notifications 등
│
├─ src/
│  ├─ domain/      # ── BACK-END 추상화 (서버 무관) ──
│  │  ├─ models/          # User, LearningCard, StudyStats, CardDraft ...
│  │  └─ repositories/    # I*Repository 인터페이스(계약)
│  ├─ data/        # ── DATA 계층 (mock ↔ real 전환) ──
│  │  ├─ repositories/    # *.ts(HTTP) + *.mock.ts, index.ts 에서 env로 스위칭
│  │  ├─ auth/            # mockUserDb(회원 레지스트리), BiometricAuth
│  │  ├─ network/         # ApiClient, env(빌드 환경변수 단일 소스)
│  │  ├─ storage/         # secureStorage(네이티브 SecureStore ↔ 웹 localStorage)
│  │  ├─ dto/ · mappers/  # 서버 DTO ↔ 도메인 매핑
│  │  ├─ packRules.ts     # 카드팩 획득 규칙 정의 + 평가 엔진
│  │  └─ collectibles.ts  # 수집 카드 카탈로그
│  ├─ store/       # zustand 상태(persist) — auth·settings·attendance·collection ...
│  ├─ hooks/       # react-query 래핑(useCards·useStats·useReview ...)
│  ├─ components/  # 재사용 UI (ui/ · home/ · community/ · attendance/ · collection/ ...)
│  ├─ theme/       # ThemeProvider·tokens·응답형 유틸
│  ├─ constants/   # routes·categories·changelog
│  └─ utils/       # dateKey·emblems·rarity·achievement ...
```

## 프론트 ↔ 백엔드 경계

- 화면(app/*)은 **hooks**나 **store**만 호출하고, 직접 `fetch` 하지 않는다.
- store/hooks 는 `src/data/repositories/index.ts` 의 싱글턴 리포지토리를 사용한다.
- 리포지토리는 `env.useMockData` 로 **Mock(로컬)** ↔ **API 서버** 를 이 파일 한 곳에서 전환한다.
  실서버가 준비되면 `EXPO_PUBLIC_API_BASE_URL` 설정만으로 붙는다.
- 따라서 "백엔드 구축" = ① 도메인 모델/계약(interface) ② mock 구현 ③ store/hook 배선
  을 갖춰 두는 것이며, 실제 HTTP 구현체(`*Repository.ts`)만 나중에 채우면 된다.
- **부분 배포용 우아한 폴백**: 실서버 모드라도 *보조 기능*(날씨·하루 쿼터·사용자
  디렉터리)의 엔드포인트가 아직 서버에 없으면(404/501/5xx/네트워크 단절)
  `data/repositories/_fallback.ts` 의 `withMockFallback` 이 그 기능만 조용히 목업으로
  떨어뜨린다. 한 번 미배포로 판단되면 이후 호출은 곧바로 목업으로 가고, 엔드포인트가
  준비되면 자동으로 실서버를 쓴다. 핵심 기능(auth/card/stats/community)은 폴백하지
  않는다 — 에러가 사용자에게 정직하게 드러나야 하기 때문.

## 이번에 추가된 시스템

| 시스템 | FRONT | DATA / BACK | STORE |
|---|---|---|---|
| 인증(회원가입·로그인·비번찾기) | app/(auth)/* | data/repositories/AuthRepository(.mock), data/auth/mockUserDb | store/authStore |
| 출석 도장 | components/attendance/AttendanceStampCard | (순수 로직) | store/attendanceStore |
| 캘린더 고도화 | components/community/LearningCalendar | srs·attendance 파생 | store/srsStore·attendanceStore |
| 카드팩 획득 조건 | app/pack-rules.tsx | data/packRules(규칙+평가) | store/collectionStore(claimedRules) |
| 관리 콘솔 | app/admin.tsx | mockUserDb·packRules·collectibles | settings·authoredCards |
| 닉네임·중복확인 | app/(auth)/signup, components/auth/AvailabilityField | AuthRepository.isUsernameTaken/isNicknameTaken, mockUserDb | authStore |
| 내 정보 수정 | app/edit-profile.tsx | AuthRepository.updateProfile, mockUserDb.updateUser | authStore.updateProfile |
| QR 명함 | app/qr-card.tsx | utils/qrcode(순수 TS 인코더)·components/ui/QRCode(svg) | authStore·settings |
| 가챠 코드 교환 | app/redeem.tsx | data/gachaCodes | collectionStore.redeemCode/redeemedCodes |
| 설정 전역 검색 | app/settings.tsx, components/settings/SettingsSearch·SettingsFocus | constants/settingsIndex(색인), utils/koreanSearch(초성)·settingsSearch(정렬) | settings.recentSettingIds |
| 약관·법적 고지 | app/legal.tsx | constants/legal(약관·처리방침·접근권한·오픈소스) | settings.notifications.marketing |

## 설정 화면 규칙

- **depth 는 2단계까지**: 설정 본문 → 상세 화면 1단계. 토글·선택은 전부 본문에서 끝낸다.
- **모든 항목은 색인에 등록**한다(`src/constants/settingsIndex.ts`). 화면의 `anchorId` 와 색인 `id` 가
  같아야 검색 결과에서 그 자리로 스크롤·하이라이트된다.
- 다른 화면의 항목은 `?focus=<id>` 로 이동한다. 그 화면은 `SettingsFocusProvider` +
  `FocusAnchor` 로 앵커를 노출해야 한다(현재: settings·privacy·legal).
- 법적 고지는 항상 **설정 최하단**의 `/legal` 한 화면에 모은다(약관·처리방침·접근권한·수신동의·
  오픈소스·저작권·운영주체). 문구는 `src/constants/legal.ts` 에서만 고친다.

## 접근 게이트(설정)

- **카드 수집·카드팩** 시스템은 회의 확정 전까지 기본 **꺼짐**(`settings.collectionEnabled`).
  설정 → "카드 수집 (베타)" 에서만 켜고, 컬렉션/카드팩 조건 화면으로 진입한다.
- **관리 콘솔**은 설정 → 지원 및 정보 → "관리 콘솔" 로 진입(웹 우선).

## 실서버 전환 체크리스트

1. `EXPO_PUBLIC_API_BASE_URL`(+ `EXPO_PUBLIC_USE_MOCK_DATA=false`) 설정.
2. `src/data/repositories/*Repository.ts` 의 엔드포인트 구현 확정.
   auth 엔드포인트는 Go 백엔드에 구현 완료:
   `POST /api/auth/login|register`, `GET /api/auth/username-available|nickname-available`,
   `GET/PATCH /api/auth/me`. (비밀번호 재설정 `reset-password` 는 미구현.)
3. `data/auth/mockUserDb`, `data/packRules`(규칙 테이블), 출석/컬렉션 로컬 저장을
   서버 API + 관리 콘솔(admin) CRUD 로 대체.

## 서버 배포 & 이식 (backend/)

Go 백엔드는 **포트-어댑터** 구조라 저장소를 `STORE` 환경변수로 고른다
(`postgres` 운영 · `memory` 무DB 테스트 · `mongo` 레거시). 호스트가 사내든 외부
Ubuntu 든 **같은 명령**으로 돌고 설정만 `.env` 로 다르다.

- **테스트로 올려보기**: `cd backend && make up-test` — DB 0대·무설정(재시작 시 리셋).
- **본격 운영**: `.env` 채우고 `make up` — PostgreSQL(볼륨 영속) + Caddy 자동 HTTPS.
- **이식**: `.env` 복사 + `make backup` 덤프를 새 호스트에서 복원. 규모가 커지면
  DB 만 관리형(RDS·Cloud SQL·Supabase·Neon)으로 분리, API 컨테이너는 그대로.

자세한 절차·보안 체크리스트·마이그레이션 전략은 **`backend/README.md`** 참고.

- **Ubuntu KVM/VM 배포**: 우분투 호스트의 KVM 게스트(VM) 한 대에 올리는 절차는
  **`backend/DEPLOY-KVM.md`**. 포트-어댑터+Compose 구조라 VM 이든 물리서버든 같은
  명령(`make up`)으로 돌고, VM 특성상 추가로 필요한 것은 **네트워크(브리지/NAT 포워딩)**
  와 **부팅 자동기동(systemd: `backend/deploy/eduapp.service`)** 정도다. 웹앱까지 한 VM
  에서 제공하려면 웹을 빌드(`npx expo export --platform web`)한 뒤 `make up-web` 로
  Caddy(`Caddyfile.web`)가 `dist` 를 정적 제공하고 `/api/*` 만 백엔드로 프록시한다.
