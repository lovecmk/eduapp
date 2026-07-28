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
  디렉터리)의 엔드포인트에 닿지 못하면 `data/repositories/_fallback.ts` 의
  `withMockFallback` 이 그 기능만 조용히 목업으로 떨어뜨린다. 핵심 기능
  (auth/card/stats/community)은 폴백하지 않는다 — 에러가 사용자에게 정직하게 드러나야 한다.

  실패의 **성격을 구분**하는 것이 중요하다. 이 앱은 지하에서 쓰여 순간 단절이 일상이라,
  '연결 없음'을 '미배포'와 같게 취급하면 터널을 한 번 지나는 것만으로 앱을 끌 때까지
  가짜 데이터에 갇힌다(관리자가 하루 상한을 바꿔도 반영되지 않는다).

  | 응답 | 판단 | 동작 |
  |---|---|---|
  | 404 · 501 | 라우트가 없다(영구) | 앱 세션 동안 래치 — 다시 묻지 않는다 |
  | 0 · 502 · 503 · 504 | 지금 못 닿았다(일시) | `TRANSIENT_RETRY_MS` 동안만 목업, 이후 자동 재확인 |
  | 그 외 | 진짜 오류 | 삼키지 않고 그대로 던진다 |

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

## 오프라인 동작 보장 (현장 앱의 전제)

이 앱은 지하·철골 구조물 안에서 쓰인다 — **연결 없음이 예외가 아니라 일상**이다.
그래서 네트워크 계층은 "닿지 못함"과 "서버가 거절함"을 끝까지 구분한다.

| 상황 | 동작 |
|---|---|
| 오프라인으로 앱 실행 | `AuthRepository.restore` 가 **재시도 없이 한 번만** 물어보고(스플래시를 붙잡지 않음), 실패하면 `secureStorage` 의 프로필 캐시로 세션을 이어 간다 |
| 서버가 세션을 거절(401/403) | 캐시로 되살리지 않고 토큰·캐시를 지운 뒤 로그인 화면으로 — 정지된 계정이 오프라인에서 계속 쓰이면 안 된다 |
| 오프라인 중 쓰기(출석·채점·신고) | `ApiClient.postDurable` 이 오프라인 큐에 넣고 낙관적 성공 처리. 멱등키로 중복 반영을 막는다 |
| 연결 복귀 | `OfflineBanner`(NetInfo) · `useAppResume`(포그라운드) · 다음 쓰기 성공, 세 계기로 큐를 흘려보낸다 |

큐(`data/network/offlineQueue`)는 **유실 방지가 존재 이유**라 동시 접근을 직렬화한다.
최초 디스크 로드는 single-flight 로 공유하고(로드 중 들어온 쓰기를 덮어쓰지 않음),
전송 완료 항목은 맨 앞을 자르는 대신 **id 로 지운다**(전송을 기다리는 사이 로그아웃·
새 쓰기가 끼어들어도 남의 기록을 지우지 않음).

### 큐의 주인 (공용 기기 대응)

현장 태블릿은 여러 명이 돌려 쓴다. 항목마다 **만든 사람(userId)** 을 붙이고, flush 는
현재 로그인한 사람의 것만 보낸다. 남의 항목은 지우지 않고 건너뛴다 — 본인이 다시
로그인하면 그때 정상 전송되고, 영영 안 돌아와도 `MAX_QUEUE` 상한에 밀려 빠진다.
주인은 `authStore` 가 세션이 바뀔 때마다 `setQueueOwner` 로 알려준다.
이게 없으면 A 가 오프라인에서 찍은 출석이 B 의 토큰으로 전송된다.

### 로컬에 남는 데이터의 주인 (store/sessionScope)

큐만 주인을 갖는 것으로는 부족하다. **zustand persist 키는 전부 기기 단위 전역**이고
로그아웃은 토큰만 지우므로, 주인 개념이 없으면 B 가 A 의 복습 스케줄(`srs-scheduler`)·
출석(`attendance`)·하루 학습 상한(`daily-learning`)·도감(`collection`)을 그대로 물려받는다.
실서버 모드에서는 그 로컬 진행도가 **B 의 토큰으로 서버에 동기화**되어 안전교육 이력이
엉뚱한 사람에게 붙는다.

`store/sessionScope.ts` 가 세션 주인을 디스크에 기록하고, `authStore.bindSession` 이
모든 세션 전환(login·socialLogin·register·restore·logout)에서 이를 적용한다.

- **로그아웃 시점에는 지우지 않는다.** 개인 기기에서 같은 사람이 다시 들어오는 경우가
  훨씬 흔하고, 그때마다 복습 스케줄을 날리면 안전장치가 아니라 데이터 파괴다.
  큐와 같은 모델 — '지우기'가 아니라 '주인 표시'. 대신 서버 응답 캐시(react-query)는 비운다.
- **주인이 바뀐 채로 로그인**하면(계정 전환·세션 만료 후 재로그인·강제종료 후 재실행)
  `USER_SCOPED_PERSIST_KEYS` 를 메모리·디스크에서 함께 비운다.
- **주인을 읽지 못하면 지운다(fail-closed).** 같은 사람임을 증명할 수 없는 상태에서는
  오귀속된 교육 이력보다 로컬 캐시 손실이 낫다.
- 기기 설정(`app-settings`·`app-moments`)은 사람이 바뀌어도 유지한다.

> ⚠️ 사용자 데이터를 담는 persist 스토어를 새로 만들면 `USER_SCOPED_PERSIST_KEYS` 에 추가할 것.

react-query 클라이언트가 `data/network/queryClient.ts` 에 있는 이유도 같다 — 화면 안의
지역 상수로 두면 캐시를 비우는 책임이 로그아웃 경로마다 흩어져 하나씩 빠진다.

## 계정 상태(A/I/D)

관리 콘솔의 정지(I)·삭제(D)는 **로그인·토큰 갱신·세션 복구**에 더해, 인증이 필요한
**모든 API** 에서 403 으로 집행된다. 마지막 것은 서버의 `AccountGate` 가 계정 상태를
15초 TTL 로 캐시해 확인한다 — 매 요청 저장소를 왕복하지 않으면서도 정지가 초 단위로
반영된다. 자세한 내용은 `backend/README.md`.

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
