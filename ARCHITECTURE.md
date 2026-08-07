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
│  │  ├─ packRules.ts     # 카드팩 획득 규칙 정의 + 평가 엔진(보상액의 단일 출처)
│  │  └─ collectibles/    # 안전 카드 도감 500종(분야별 catalog.*.ts) + 뽑기 확률표
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
| 안전 카드 도감 | app/collection-book.tsx | data/collectibles(500종)·domain/packDraw(뽑기) | store/collectionStore(카운터) + hooks/useCollectionSync(서버) |
| 관리 콘솔 | app/admin.tsx | mockUserDb·packRules·collectibles | settings·authoredCards |
| 닉네임·중복확인 | app/(auth)/signup, components/auth/AvailabilityField | AuthRepository.isUsernameTaken/isNicknameTaken, mockUserDb | authStore |
| 내 정보 수정 | app/edit-profile.tsx | AuthRepository.updateProfile, mockUserDb.updateUser | authStore.updateProfile |
| QR 명함 | app/qr-card.tsx | utils/qrcode(순수 TS 인코더)·components/ui/QRCode(svg) | authStore·settings |
| 가챠 코드 교환 | app/redeem.tsx | data/gachaCodes | collectionStore.redeemCode/redeemedCodes |
| 설정 전역 검색 | app/settings.tsx, components/settings/SettingsSearch·SettingsFocus | constants/settingsIndex(색인), utils/koreanSearch(초성)·settingsSearch(정렬) | settings.recentSettingIds |
| 약관·법적 고지 | app/legal.tsx | constants/legal(약관·처리방침·접근권한·오픈소스) | settings.notifications.marketing |
| 신고 처리 워크플로 | admin/views/ReportsView | backend: domain.ReportStatus·AdminService.ReviewReport | — |
| 운영 설정·점검 모드 | admin/views/SettingsView | backend: SettingsService(+`/api/config`), middleware.Maintenance | — |
| 공지 센터(대상·이력) | admin/views/AnnouncementsView | backend: domain.Announcement·AdminService.Announce | — |
| 하루 학습 상한(서버 권위) | hooks/useDailyQuota | backend: LearningService(`/api/learning/*`), domain/models/LearningQuota(합침 규칙) | store/dailyLearningStore |
| **오늘의 출제(사람마다·날마다 3~5문제)** | hooks/useDailyAssignment, app/(tabs)/cards·index | domain/dailyPlan(규칙) · data/repositories/DailyAssignmentRepository(`/api/learning/today`) | — |
| 운영 공지 배너·점검 안내 | components/ui/NoticeBanner((tabs)/_layout) | data/repositories/ServiceConfigRepository(`/api/config`) | — |

## 오늘의 출제 — 사람마다, 날마다

이 앱의 약속은 **"매일 3~5문제"** 다. 그 편성을 서버가 정하고, 앱은 받은 것을
보여 준다. 규칙은 두 곳에 같은 내용으로 있다.

| | 파일 | 언제 쓰나 |
|---|---|---|
| 서버 | `backend/internal/service/daily_plan.go` | 평상시(권위) |
| 앱 | `src/domain/dailyPlan.ts` | 서버에 닿지 못할 때 |

두 벌인 이유는 오프라인 때문이다. 이 앱은 지하·철골 구조물에서 쓰여 서버에 닿지
못하는 날이 흔한데, 그때 "오늘의 학습이 없습니다"를 띄우면 그날 학습은 그냥
없던 일이 된다. 대신 **같은 규칙**을 써서 온라인이든 아니든 같은 사람이 같은 날
같은 문제를 본다.

> ⚠️ 한쪽만 고치면 온라인·오프라인에서 서로 다른 문제가 나간다. 규칙을 바꿀 때는
> 반드시 두 파일을 함께 고칠 것. 양쪽 다 검사가 붙어 있다.

규칙: ① 그 사람의 기록으로 오늘의 난이도를 정하고 → ② 난이도가 출제 수를 정하고
(쉬움 5 · 보통 4 · 어려움 3) → ③ 복습 도래 카드를 먼저 채우고 → ④ `(사람, 날짜)`
시드로 섞는다. ④가 핵심이다 — 무작위를 쓰면 앱을 다시 열 때마다 문제가 바뀌어
학습이 아니라 뽑기가 된다.

편성은 그날 처음 물어본 순간 **저장해 얼려 둔다**. 관리자가 낮에 문제를 추가·삭제해도
오전에 받은 목록이 오후에 달라지지 않는다. 자세한 내용은 `backend/README.md`.

**선택 엔진은 하나뿐이다.** 예전에는 세 곳이 각자 골랐다 — 서버의 3분 세션 패킹,
앱 목업의 같은 규칙 복제, 그리고 화면(`cards.tsx`)의 즉석 filter/slice. 앱은 앞의
둘을 부르지 않고 세 번째로 골랐으므로 앞의 둘은 죽은 코드였다. 지금은
`daily_plan.go`(+오프라인용 `dailyPlan.ts`) 한 규칙만 남았고, 구형 경로
`/api/cards/today` 도 그 편성을 구형 형식으로 돌려준다 — 이미 배포된 앱이
그 경로를 부르고 있어 지울 수 없기 때문이다.

## 안전 카드 도감 — 확률과 보상

도감은 **500종**(분야 5개 × 100종, 등급 229/166/80/25)이다. 규모가 커지면
"뽑아도 새 카드가 안 나온다"는 쿠폰 수집가 문제가 실제로 생기므로, 뽑기는
`src/domain/packDraw.ts` 한 곳에 순수 함수로 모아 두고 세 겹으로 설계한다.

| 장치 | 상수 | 하는 일 |
|---|---|---|
| 등급 확률 | `DRAW_WEIGHTS` (0.56/0.30/0.11/0.03) | 팩을 여는 순간의 두근거림 |
| 미보유 가중 | `NEW_CARD_WEIGHT = 3` | 안 가진 카드를 3배 자주 뽑아 수집이 끝나게 |
| 천장 | `PITY_EPIC = 10`, `PITY_LEGENDARY_SOFT = 35`, `PITY_LEGENDARY_HARD = 60` | 운이 나빠도 정해진 팩 안에 상위 등급 보장 |
| 중복 구제 | `SHARD_REWARD` / `SHARD_PRICE` | 중복을 조각으로 바꿔 원하는 카드와 교환 |

이 수치로 시뮬레이션하면 100팩에 65%·전설 12종, 400팩에 사실상 완성이다.
하루 1.8팩(무료팩 1 + 학습 적립) 기준으로 대략 7개월짜리 사다리다.

**난수는 인자로 받는다.** 예전 `drawOne()` 은 `Math.random()` 을 직접 불러서
확률을 검사할 방법이 아예 없었다. 지금은 `Rng` 를 주입받으므로 시드를 고정해
수백 팩을 돌려보는 테스트가 가능하다(`__tests__/packDraw.test.ts`).

**확률표는 '적어두는 것'이 아니라 '재는 것'이다.** 실제로 이 작업에서
버그를 하나 잡았다 — 천장 보정이 상위 등급만 담은 부분 가중치를 넘기는
바람에 합계가 `NaN` 이 되어 **보정이 걸릴 때마다 무조건 다이아몬드**가
나왔다(전설 실측 5.4% vs 표기 3%). 팩당 보장은 통과했으므로 다른
테스트로는 보이지 않았다. 그래서 바닥 규칙까지 계산에 넣은 기대 분포와
실측을 맞춰 보는 테스트를 따로 둔다.

**보상액의 출처는 `evaluatePackRules` 하나다.** 예전에는 화면이
`claimRule(id, packs, times)` 로 줄 팩 수를 직접 지정했고 스토어는 그대로
더했다 — 화면이 틀리거나 버튼이 두 번 눌리면 그만큼 더 생겼다. 지금 화면은
`claimRule(id, ctx)` 로 "이 규칙을 받겠다"고만 말하고, 스토어가 현재 상태로
다시 계산해 지급한다. 반복 규칙에는 전부 `maxTimes` 상한이 있다(테스트가 잠근다).

**적립 단위는 '장'이다.** 세션이 아니라 학습한 카드 수로 센다 — 일일 무료팩의
조건(`DAILY_PACK_MIN_STUDY`)과 팩 적립(`STUDY_PER_PACK`)이 같은 단위여야
"하루 한 번 학습하는 사람이 조건을 영영 못 채우는" 일이 안 생긴다.

**도감은 서버에 남는다.** 500종 수집·카드팩·조각은 몇 달치 학습의 결과물인데
지금까지 기기 로컬에만 있었다 — 앱을 지우면 통째로 사라졌다. 지금은
`GET /api/collection` 과 `POST /api/collection/sync` 로 서버가 보관한다
(`useCollectionSync` 가 진입 시 한 번, 이후 값이 바뀌고 4초 잠잠하면 보낸다).

저장하는 것이 **잔액이 아니라 누적 카운터**인 점이 이 설계의 핵심이다.
`packs_earned`/`packs_opened` 처럼 줄어들지 않는 두 값만 주고받고 잔액은
뺄셈으로 만든다 — 잔액을 그대로 동기화하면 두 기기가 각자 벌고 각자 열었을 때
나중에 붙은 쪽이 상대의 기록을 통째로 덮어쓴다. 모든 값이 단조 증가라 병합이
필드별 최댓값 하나로 끝나고, 순서가 뒤바뀌거나 같은 요청이 두 번 와도 결과가
같다. 병합 규칙은 `domain/models/Collection.ts` 와 `service/collection_service.go`
양쪽에 **같은 모양**으로 있고 각각 테스트가 잠근다.

뽑기 자체는 기기에서 돈다. 서버가 뽑아 주는 편이 안전하지만 오프라인에서 팩을
못 여는 앱이 되므로, 서버는 판정하지 않고 보관·절삭만 한다(자세한 이유와 한계는
`docs/API_CONTRACT.md` 3-1).

**수집가 뱃지는 수집률로 매긴다**(`domain/collectorRank.ts`). 예전엔 '보유한
최고 등급 카드'였는데, 천장이 60팩 안에 다이아몬드를 보장하므로 한 달만
쓰면 전원이 최고 뱃지를 단다 — 아무것도 알려주지 않는 지표다. 지금은
25%/50%/80% 구간으로 오른다. 프로필의 '대표 카드'는 이와 **따로** 계산한다
(뱃지 등급으로 카드를 고르면 엉뚱한 카드가 대표가 된다).

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
3. `data/auth/mockUserDb`, `data/packRules`(규칙 테이블), 출석/컬렉션 로컬 저장을
   서버 API + 관리 콘솔(admin) CRUD 로 대체.

### 앱이 부르는 경로 ↔ 서버 (전수)

앱의 저장소가 부르는 경로와 서버 라우트는 **주기적으로 맞춰 봐야 한다.** 한쪽만
바뀌면 목업 모드에서는 아무 증상이 없고 실서버로 전환하는 순간 드러나기 때문이다.

| 상태 | 경로 | 비고 |
|---|---|---|
| ✅ 구현 | auth(login·register·refresh·logout·me·username/nickname-available) | |
| ✅ 구현 | cards · stats · community/live · push/register · telegram/alert | |
| ✅ 구현 | progress(+grade·attendance) · engagement(+like·bookmark) · reports(+mine) · notifications | 쓰기는 전부 멱등키 |
| ✅ 구현 | `learning/today` · `learning/quota` · `learning/complete` | 오늘의 편성(3~5문제)과 그 진도 |
| ✅ 구현 | `GET /api/config`(무인증) | 점검 안내·공지 배너·상한 |
| ⛔️ 열지 않음 | `auth/social` | 이름·이메일만으로 세션을 내주는 계약 — 비밀번호를 묻지 않는 인증이 된다 |
| ⛔️ 열지 않음 | `auth/reset-password` | 아이디+이메일만으로 계정 탈취가 가능해진다. 메일 인증이 선행되어야 한다 |
| ⛔️ 열지 않음 | `auth/email/request-code`·`verify-code` | 지금 배포에 메일 발송 경로가 없다 |
| 🕓 미구현 | `weather/current` | 보조 기능 — `withMockFallback` 이 목업으로 떨어뜨린다 |
| 🕓 미구현 | `users/search`·`users/:id/public` | 위와 같음(사용자 디렉터리) |

**⛔️ 세 가지는 '아직 안 만든 것'이 아니라 '이대로는 만들면 안 되는 것'이다.**
목업의 계약을 그대로 서버로 옮기면 인증 우회가 된다. 그래서 실서버 저장소는 없는
경로를 호출하는 대신 **정직하게 501 로 끊고**(`AuthRepository`), 로그인 화면의
간편 로그인 버튼은 목업 모드에서만 보인다 — 누를 때마다 실패하는 버튼을 띄워 두면
사용자는 앱이 고장났다고 여긴다.

> ⚠️ 앱이 서버로 **되돌려 보내는 값**에 주의할 것. `UserDTO.id` 는 number 라
> 서버가 문자열 id 를 축약해 내보내는데(`service.PublicUserID`), 그 값이 돌아오는
> 경로가 하나 있다 — 닉네임 중복 검사의 `exclude`. 서버가 진짜 id 하고만 비교하면
> 본인이 본인과 충돌해, 닉네임을 바꾸지 않는 한 프로필을 저장할 수 없다.
> 판정은 `service.SameUser` 한 곳에 모여 있다.

### 상수의 짝

| 앱 | 서버 | 어긋나면 |
|---|---|---|
| `constants/learning.ts` `DAILY_MIN_CARDS`·`DAILY_MAX_CARDS` | `domain.DefaultDailyMinCards`·`DefaultDailyMaxCards` | 서버에 닿은 기기와 목업으로 떨어진 기기가 서로 다른 분량으로 돈다 |
| `domain/srs.ts` `MASTERED_BOX` | `service.masteredBoxLevel` | 앱은 '숙달'로 보는 카드를 서버는 후보로 여겨 또 내보낸다 |
| `src/domain/dailyPlan.ts` | `service/daily_plan.go` | 온라인과 오프라인에서 **서로 다른 문제**가 나간다 |
| `utils/dateKey.ts` | `service.DayKey` | 학습 이력·출석이 달력의 다른 칸에 찍힌다(month 0-based) |

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
