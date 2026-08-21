# 백엔드 API 계약서 (Frontend ↔ Backend Contract)

이 앱(Expo/React Native)이 **실서버 모드**(`EXPO_PUBLIC_USE_MOCK_DATA=false`)에서
호출하는 엔드포인트 전체 명세다. 백엔드는 이 문서대로 구현하면 프론트 수정 없이 붙는다.

## 공통 규칙

| 항목 | 규칙 |
|---|---|
| Base URL | `EXPO_PUBLIC_API_BASE_URL` (끝에 `/` 금지 — 경로가 `//api/...` 로 중복됨) |
| 경로 접두사 | 게이트웨이 로케이션 블록은 **`/inner/api/v1`**. 아래 표기의 `/api/...` 는 서버 내부 표준 경로이며 **둘 다 같은 핸들러**로 간다(백엔드 `middleware.APIPrefix`) |
| 요청 본문 | `application/json` |
| 필드 표기 | **응답은 snake_case** (프론트 Mapper 가 camelCase 도메인 모델로 변환) |
| 인증 | `Authorization: Bearer <access_token>` |
| 날짜 | **ISO 8601 문자열** (`2026-01-15T09:30:00.000Z`). Unix timestamp 금지 |
| 타임아웃 | 클라이언트 기본 10초 (`EXPO_PUBLIC_API_TIMEOUT_MS`) |

### 에러 응답 규격

모든 4xx/5xx 는 아래 형태로 통일한다. `message` 는 **사용자에게 그대로 노출**되므로
한국어 사용자 친화 문구로 작성한다(내부 스택/SQL 노출 금지).

```json
{ "message": "이미 사용 중인 아이디입니다" }
```

| 상태 | 사용처 | 클라이언트 동작 |
|---|---|---|
| 400 | 유효성 위반 | `message` 를 폼 에러로 표시 |
| 401 | 토큰 만료/무효 | refresh 1회 시도 → 실패 시 로그아웃 |
| 403 | 권한 없음 | 에러 표시 |
| 404 | 리소스 없음 | 보조 기능은 목업 폴백(아래 참고) |
| 409 | 중복(아이디/닉네임) | `message` 표시 |
| 5xx | 서버 오류 | 에러 표시 |

> **부분 배포 폴백**: `weather` / `learning-quota` / `user-directory` 3개 보조 기능은
> 404·501·502·503·504 응답 시 클라이언트가 조용히 목업으로 폴백한다(앱이 안 깨짐).
> 반면 `auth` / `cards` / `stats` / `community` 는 폴백하지 않고 에러가 그대로 드러난다.

---

## 1. 인증 (`/api/auth`)

### `POST /api/auth/login`
```jsonc
// req
{ "id": "hong", "password": "safe1234" }
// res 200
{ "access_token": "...", "refresh_token": "...", "user": { /* UserDTO */ } }
```

### `POST /api/auth/social`
```jsonc
// req  { "name": "원진섭", "email": "won@example.com" }
// res 200 — login 과 동일
```

### `POST /api/auth/register`
```jsonc
// req
{ "username": "hong", "password": "safe1234", "name": "홍길동",
  "nickname": "현장왕", "email": "hong@example.com", "org": "안전관리본부" }
// res 200 — login 과 동일 / 409 — 아이디·닉네임 중복
```

### `POST /api/auth/refresh` ⚠️ 중요
```jsonc
// req  { "refresh_token": "..." }
// res 200
{ "access_token": "...", "refresh_token": "..." }  // 회전 시 새 refresh_token 필수 반환
```
- **토큰 회전(rotation)을 쓴다면 응답에 새 `refresh_token` 을 반드시 포함**할 것.
  클라이언트는 반환된 값을 저장하며, 없으면 기존 토큰을 유지한다.
- 클라이언트는 동시 401 이 여러 개여도 refresh 를 **1회만** 호출한다(single-flight).

### `POST /api/auth/logout`
```jsonc
// req {} · res 200 — 서버는 refresh 토큰을 폐기할 것
```

### `GET /api/auth/me` / `PATCH /api/auth/me`
```jsonc
// GET  res 200 — UserDTO
// PATCH req { "name"?, "nickname"?, "email"?, "org"?, "jobTitle"? } → res 200 UserDTO
```

### `POST /api/auth/reset-password`
```jsonc
// req { "username": "hong", "email": "hong@example.com", "newPassword": "safe1234" }
// res 200 (본문 무관)
```

### `GET /api/auth/username-available?username=...`
### `GET /api/auth/nickname-available?nickname=...&exclude=<userId>`
```jsonc
// res 200 { "taken": true }
```

### `POST /api/auth/email/request-code` 🔐
```jsonc
// req { "email": "hong@example.com" }
// res 200 {}   ← 코드를 응답에 절대 포함하지 말 것(포함 시 인증 우회 가능)
```
- 코드는 **서버가 생성해 이메일로만** 전달한다.
- 권장: 6자리 숫자, TTL 5분, 검증 시도 5회 초과 시 무효화, 1회용, 발송 rate limit.

### `POST /api/auth/email/verify-code` 🔐
```jsonc
// req { "email": "hong@example.com", "code": "123456" }
// res 200 { "verified": true }   ← 비교는 반드시 서버에서
```

### 입력 검증 규칙 (프론트와 **동일하게** 서버에서도 검증할 것)

`src/domain/validation/auth.ts` 가 프론트의 단일 소스다. 서버는 같은 규칙을 재검증한다
(클라이언트 검증은 UX용일 뿐, 신뢰 경계는 서버).

| 필드 | 규칙 |
|---|---|
| username | 2~20자, `[a-zA-Z0-9가-힣_]` |
| nickname | 2~12자, `[a-zA-Z0-9가-힣_]` |
| email | `x@y.z` 형식, 최대 254자 |
| password | **최소 8자, 최대 72자, 영문+숫자 각 1자 이상** |
| name | 1~30자 |

> 비밀번호는 **bcrypt/argon2 해시**로만 저장한다(평문·단순 해시 금지).

---

## 2. 학습 카드 (`/api/cards`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/cards` | 전체 카드 — `CardDTO[]` |
| GET | `/api/cards/today?limit=&mode=` | 오늘의 학습 세션 — `CardDTO[]` |
| PATCH | `/api/cards/:id` | `{ "status_cd": "NEW"\|"LEARNING"\|"MASTERED" }` → `CardDTO` |
| POST | `/api/cards` | 카드 등록 → `CardDTO` |

**CardDTO** (주요 필드)
```jsonc
{
  "id": "c-001",
  "category_cd": "ELEC",           // ELEC | PROCESS | HAZMAT | FIELD
  "sub_category_nm": "배선설비",
  "topic_nm": "전기화재 기본",
  "keywords": ["분전반"],
  "title_txt": "분전반 주변 가연물",
  "study_seconds": 40,
  "situation_txt": "...", "question_txt": "...",
  "principle_txt": "...", "process_txt": "...", "fire_triangle_txt": "...",
  "conclusion_txt": "...", "source_txt": "...",
  "image_url": null, "answer_image_url": null,
  "status_cd": "NEW",              // NEW | LEARNING | MASTERED
  "difficulty_cd": "MEDIUM",       // EASY | MEDIUM | HARD
  "card_type_cd": "EXPLANATION",   // EXPLANATION | OX | CHOICE
  "choices": ["O", "X"], "answer_index": 0,
  "due_at": null                   // ISO 문자열 또는 null
}
```
- 알 수 없는 `category_cd`/`status_cd` 는 클라이언트가 기본값으로 폴백하지만,
  **enum 값은 위 목록을 벗어나지 않게** 할 것.
- `due_at` 은 유효 ISO 또는 `null` 만 허용(파싱 불가 문자열은 `null` 처리됨).

---

## 3. 통계 · 커뮤니티 · 기타

### `GET /api/stats` → `StatsDTO`
```jsonc
{
  "streak_days": 5, "best_streak": 12, "total_learned": 130, "total_cards": 300,
  "accuracy_rate": 82,          // 0~100 (클라이언트가 0~1 로 정규화)
  "due_today": 4,
  "weekly": [{ "label": "월", "count": 3 }],
  "category_breakdown": [{ "category": "전기 위험", "total": 10, "mastered": 4, "accuracy": 70 }],
  "rankings": [{ "rank": 1, "nickname": "현장왕", "score": 999 }],
  "insights": { /* 선택 — 구버전 호환 위해 없어도 됨 */ }
}
```

### `GET /api/community/live` → 커뮤니티 스냅샷
### `GET /api/users/search?q=` → 공개 프로필 요약 배열
### `GET /api/users/:id/public` → 공개 프로필(공개 범위 적용) 또는 `null`
### `GET /api/weather/current` → 현재 날씨(홈 배경 앰비언트용)
### `GET /api/learning/quota` → `{ "limit": 3, "used": 1, "resets_at": "..." }`
### `POST /api/learning/complete` → `{ "count": 1 }`
### `POST /api/push/register` → 푸시 토큰 등록
### `GET /api/collection` → 내 안전 카드 도감
### `POST /api/collection/sync` → 기기 상태를 병합하고 **병합 결과**를 돌려줌
### `GET /api/admin/users/:id/collection` → 운영자용 도감 조회(읽기 전용)

---

## 3-1. 안전 카드 도감 동기화 ✅

```jsonc
// POST /api/collection/sync — req
{
  "owned": { "safety-helmet": 2, "elb": 1 },  // 카드 id → 보유 장수
  "packs_earned": 12, "packs_opened": 9,      // 잔액이 아니라 누적 카운터
  "shards_earned": 340, "shards_spent": 90,
  "study_total": 210,
  "claimed_rules": { "study-50": 3 },
  "redeemed_codes": ["WELCOME"],
  "last_daily_pack": "2026-08-07",
  "since_epic": 4, "since_legendary": 22      // 상위 등급 천장 진행도
}

// res 200 — 병합된 상태. 앱은 이 응답을 그대로 자기 상태로 삼는다.
{
  "owned": { ... }, "packs_earned": 12, "packs_opened": 9, ...,
  "pack_balance": 3, "shard_balance": 250, "unique_count": 137  // 서버가 계산
}
```

### 잔액이 아니라 누적 카운터를 주고받는다

카드팩과 조각은 늘기도 줄기도 하는 **잔액**이다. 잔액을 그대로 동기화하면
오프라인 앱에서 반드시 깨진다:

```
기기A(오프라인): 팩 5개를 벌어 3개를 연다 → 잔액 2
기기B(온라인)  : 팩 1개를 연다            → 잔액 4
→ 나중에 붙은 쪽이 이기면 상대의 적립이나 개봉이 통째로 사라진다.
```

그래서 `packs_earned`/`packs_opened` 처럼 **줄어들지 않는 두 값**만 주고받고,
잔액은 뺄셈으로 만든다. 모든 필드가 단조 증가라 병합이 필드별 최댓값 하나로
끝난다 — 순서가 뒤바뀌어 도착해도, 같은 요청이 두 번 와도 결과가 같다.

`redeemed_codes` 는 합집합(한 기기에서만 쓴 코드도 재사용 불가),
`last_daily_pack` 은 더 나중 날(기기를 옮겨 같은 날 두 번 받는 것 방지),
천장은 **더 큰 값**(기기를 바꿔 천장을 초기화하지 못하게)으로 합친다.

### 뽑기는 서버가 하지 않는다

이 앱은 지하·철골 구조물 안에서 쓰인다 — 연결 없음이 일상이다. 서버가 팩을
뽑아 주는 설계가 더 안전하지만, 오프라인에서 팩을 못 여는 앱이 되어 기능
자체가 죽는다. 그래서 개봉은 기기에서 돌고(`src/domain/packDraw.ts`) 서버는
결과를 보관·병합한다. 서버는 말이 되는 범위로 자르기만 한다(장수·카운터 상한,
id 길이, 항목 수). 이 구조에서 완전한 위·변조 방지는 불가능하며, 그 사실을
숨기지 않는다.

### 이상한 값은 거절이 아니라 절삭이다

오프라인 큐가 며칠 뒤에 보내는 요청까지 400 으로 떨구면 그 기간의 기록이
통째로 사라진다. 범위를 벗어난 값은 깎아서 받아들이고 정상 범위의 기록은 살린다.

---

## 4. 헬스체크 `GET /api/health` ✅

```jsonc
// res 200 — 인증 없이 응답할 것
{ "status": "ok", "version": "1.2.3" }
```
- 앱의 **개발자 모드 > 환경 설정 > 서버 상태 점검**에서 호출한다(응답 지연시간 표시).
- 로드밸런서/컨테이너 오케스트레이터의 liveness probe 로도 사용 가능.
- DB 등 의존성까지 확인하려면 `status` 를 `ok`/`degraded` 로 구분해 반환한다
  (클라이언트는 `status === 'ok'` 만 정상으로 간주).

---

## 5. 보안 체크리스트 (백엔드 필수)

- [ ] **CORS**: 웹 빌드 도메인만 허용(`*` 금지), `Authorization` 헤더 허용
- [ ] **비밀번호**: bcrypt/argon2 해시, 평문 로그 금지
- [ ] **인증코드**: 서버 생성·서버 비교, TTL·시도제한·rate limit
- [ ] **Injection**: ORM 파라미터 바인딩 사용. Mongo 사용 시 `$` 연산자 주입 차단
      (사용자 입력을 쿼리 객체에 그대로 넣지 말 것)
- [ ] **Rate limit**: 로그인·인증코드 발송·비밀번호 재설정에 IP/계정 단위 제한
- [ ] **보안 헤더**: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
      `X-Frame-Options: DENY`, `Content-Security-Policy`
- [ ] **에러 메시지**: 스택·쿼리·내부 경로 비노출
- [ ] **토큰 수명**: access 짧게(15~60분) + refresh 회전, 로그아웃 시 서버측 폐기
- [ ] **로그**: 토큰·비밀번호·인증코드는 로그에 남기지 않는다

---

## 6. 사용자 데이터 동기화 (신규)

앱이 로컬에만 갖고 있던 데이터를 서버가 보관하도록 하는 엔드포인트다.
**기기를 바꾸거나 앱을 재설치해도 학습 기록이 유지되려면 이 그룹이 필수다.**

### 공통 — 멱등성(Idempotency) ⚠️ 중요

이 그룹의 모든 쓰기(POST)는 `Idempotency-Key` 헤더를 함께 보낸다.
클라이언트는 네트워크가 끊기면 요청을 큐에 쌓아 **나중에 자동 재전송**하기 때문에,
**서버는 같은 키의 요청을 한 번만 반영해야 한다.**

```
POST /api/progress/attendance
Idempotency-Key: attendance:2026-7-25
```
- 처음 받은 키 → 정상 처리 후 키를 (최소 24시간) 보관
- 이미 처리한 키 → **다시 반영하지 말고 200 으로 응답**(409 아님 — 재전송은 정상 흐름)
- 키 보관 실패보다 중복 반영이 더 위험하다(출석 2회, 신고 중복 접수 등)

### 6-1. 학습 진행 `/api/progress`

앱에서 가장 중요한 데이터(복습 일정·학습 이력·출석).

```jsonc
// GET /api/progress → 200
{
  "cards": {                       // 카드 id → SRS 상태
    "c-001": {
      "box": 2,                    // Leitner 단계 0~5
      "ease": 2.5,                 // 쉬움 계수(1.3~2.8) — 없으면 2.5 로 간주
      "due_at": "2026-08-01T00:00:00.000Z",
      "reps": 3, "lapses": 1,
      "last_grade": "good",        // again | hard | good | easy
      "last_reviewed_at": "2026-07-25T09:00:00.000Z"
    }
  },
  "history": { "2026-7-25": ["c-001", "c-002"] },  // 날짜키 → 그날 학습한 카드
  "attendance": { "2026-7-25": "2026-07-25T00:10:00.000Z" },
  "updated_at": "2026-07-25T09:00:00.000Z"
}
```
- 날짜 키 형식은 **`YYYY-M-D`(월·일 zero-padding 없음)** — 앱의 `dateKey()` 와 일치해야 한다.
- `due_at`/`last_reviewed_at` 이 파싱 불가하면 클라이언트가 현재 시각으로 폴백한다.

```jsonc
// POST /api/progress/grade   (Idempotency-Key: grade:<cardId>:<lastReviewedAt>)
{ "card_id": "c-001", "grade": "good", "box": 2, "ease": 2.56,
  "due_at": "2026-08-01T00:00:00.000Z", "reps": 3, "lapses": 1 }
// → 200 (본문 무관)

// POST /api/progress/attendance   (Idempotency-Key: attendance:<dayKey>)
{ "day": "2026-7-25" }
// → 200. 하루 1회만 유효 — 같은 날 재요청은 조용히 200.
```

### 6-2. 카드 반응 `/api/engagement`

```jsonc
// GET /api/engagement → 200
{ "liked_ids": ["c-001"], "bookmarked_ids": ["c-002", "c-003"] }

// POST /api/engagement/like      (Idempotency-Key: like:<cardId>:<liked>)
{ "card_id": "c-001", "liked": true }
// POST /api/engagement/bookmark  (Idempotency-Key: bookmark:<cardId>:<bookmarked>)
{ "card_id": "c-002", "bookmarked": false }
```
- **토글이 아니라 '원하는 상태'를 보낸다.** 재전송돼도 결과가 같아야 하기 때문이다.

### 6-3. 카드 신고 `/api/reports`

```jsonc
// POST /api/reports   (Idempotency-Key: report:<cardId>:<reason>)
{ "card_id": "c-001",
  "reason": "wrong_answer",   // wrong_question | wrong_answer | typo | outdated | etc
  "detail": "KEC 개정으로 기준이 바뀌었습니다" }   // 선택, 300자 이내(클라이언트에서 정제)
// → 200

// GET /api/reports/mine → 200
{ "card_ids": ["c-001"] }
```
- 신고는 운영자 확인이 필요한 데이터다. 접수 후 운영 콘솔에서 볼 수 있어야 한다.

### 6-4. 알림 `/api/notifications`

```jsonc
// GET /api/notifications → 200 (최신순 배열)
[{ "id": "n1", "type_cd": "SYSTEM",       // NEW | REMIND | ACHIEVEMENT | SYSTEM
   "title_txt": "업데이트 안내", "desc_txt": "복습 알고리즘이 개선되었어요",
   "created_at": "2026-07-25T08:00:00.000Z", "read_yn": false, "category_nm": "공지" }]

// POST /api/notifications/:id/read   (Idempotency-Key: notif-read:<id>)
// POST /api/notifications/read-all   (Idempotency-Key: notif-read-all:<date>)
// POST /api/push/register            (Idempotency-Key: push:<token>)
{ "token": "ExponentPushToken[...]", "platform": "ios" }
```
- 목록이 배열이 아니면 클라이언트는 빈 목록으로 처리한다(화면은 깨지지 않음).

---

## 7. 클라이언트 예외처리 동작 (백엔드가 알아야 할 것)

서버 응답에 따라 앱이 어떻게 반응하는지 — 상태 코드를 정확히 골라야 하는 이유다.

| 응답 | 앱 동작 |
|---|---|
| `0`(연결 실패)·`5xx`·`429` | **재시도 대상.** GET 은 지수 백오프로 2회 더 시도(0.4s→0.8s). 쓰기는 오프라인 큐에 적재 후 앱 복귀 시 자동 재전송 |
| `400`/`422` | 재시도하지 않음. `message` 를 폼 오류로 그대로 노출 → **사용자가 고칠 수 있는 한국어 문구**로 보낼 것 |
| `401` | refresh 1회 시도(동시 요청이 여러 개여도 refresh 는 1회) → 실패 시 로그아웃 |
| `403`/`404`/`409` | 재시도하지 않고 `message` 노출 |

- 응답에 `message` 가 없으면 앱이 종류별 기본 문구로 대체하므로, **내부 스택·SQL 을 message 에 넣지 말 것.**
- 오프라인 큐는 항목당 최대 5회 재시도 후 폐기하며, 큐 길이는 100건으로 제한한다.
- 재시도 가능한 실패가 반복되면 순서 보존을 위해 큐 전송을 그 자리에서 멈춘다(뒤 항목을 건너뛰지 않음).

---

## 8. 관리 콘솔 API (`/api/admin`) — Vue 웹 콘솔 전용

Go 백엔드에 **구현 완료**된 관리 API. 프런트는 `admin/`(Vue 3)이다.

### 접근 제어

모든 `/api/admin/*` 은 두 관문을 통과해야 한다.

1. `RequireAuth` — 유효한 액세스 토큰(없으면 `401`)
2. `RequireAdmin` — 저장소에서 사용자를 조회해 `role_cd == "ADMIN"` 이고 계정이 활성인지 확인(아니면 `403`)

> **역할을 JWT 에 담지 않는 이유**: 토큰에 박으면 권한을 회수해도 만료(액세스 15분,
> 리프레시 30일)까지 관리자로 통한다. 관리 권한은 즉시 회수돼야 하므로 매 요청 조회한다.
> 관리 API 는 호출량이 적어 이 비용이 문제되지 않는다.

`users` 테이블에 `role_cd TEXT NOT NULL DEFAULT 'USER'` 가 추가됐다(기존 행은 마이그레이션에서 `'USER'`).
빈 문자열·알 수 없는 값은 모두 `USER` 로 해석한다 — **권한은 명시적으로 부여된 것만 인정한다.**

### 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/admin/dashboard` | 사용자·콘텐츠·학습·지표·서비스 상태를 한 번에 |
| `GET` | `/api/admin/status` | 저장소 왕복까지 확인한 서비스 상태 |
| `GET` | `/api/admin/metrics` | 실시간 지표 단발 조회 |
| `GET` | `/api/admin/stream` | 실시간 지표 **SSE**(2초 주기, 20초 하트비트) |
| `GET` | `/api/admin/users` | `?search=&role=&status=&membership=&offset=&limit=` |
| `GET` | `/api/admin/users/:id` | 상세 + 학습 진행 |
| `PATCH` | `/api/admin/users/:id/role` | `{ "role_cd": "USER" \| "ADMIN" }` |
| `PATCH` | `/api/admin/users/:id/status` | `{ "status_cd": "A" \| "I" \| "D" }` |
| `GET` | `/api/admin/cards` | `?search=&category=&type=&offset=&limit=` — 카드별 학습 현황 포함 |
| `POST` | `/api/admin/cards` | 문제 생성(`201`). **ID 는 서버가 정한다** |
| `GET` | `/api/admin/cards/:id` | 문제 조회 |
| `PUT` | `/api/admin/cards/:id` | 문제 수정. 경로의 ID 가 우선(body 의 `id` 로 다른 카드를 덮어쓸 수 없다) |
| `DELETE` | `/api/admin/cards/:id` | 문제 + 딸린 진행 기록 삭제(`204`) |
| `GET` | `/api/admin/audit` | `?limit=` 최근 관리 이력 |
| `GET` | `/api/admin/insight` | 데이터 분석 전체(60초 캐시) |
| `POST` | `/api/admin/insight/refresh` | 캐시를 버리고 다시 계산 |
| `GET` | `/api/admin/insight/learner/:id` | 학습자 한 명의 코칭 진단 + 근거를 단 교육 처방 |

카드 본문 형식은 `domain.Card`(2장 CardDTO 와 같은 snake_case)를 그대로 쓴다 —
앱의 카드 시드 JSON 을 복붙해 등록할 수 있다.

### 잠금 방지 규칙 (`409 Conflict`)

관리 콘솔에서 스스로 잠기는 두 경로를 서버가 원천 차단한다.

| 상황 | 응답 |
|---|---|
| 자기 자신의 권한·상태 변경 | `409` "자기 자신의 권한·상태는 변경할 수 없습니다" |
| 마지막 **활성** 관리자의 강등·정지 | `409` "마지막 관리자의 권한은 해제할 수 없습니다" |

정지된 관리자는 로그인할 수 없으므로 관리자 머릿수에 넣지 않는다 —
넣으면 "관리자는 2명인데 아무도 못 들어오는" 상태가 만들어진다.

### 감사 로그

**변경만** 기록한다(조회는 남기지 않는다 — 노이즈에 진짜 변경이 묻힌다).
값이 실제로 바뀌지 않은 요청도 기록하지 않는다.

```
action: user.role_change | user.status_change | card.create | card.update | card.delete
```

기록 실패가 이미 성공한 변경을 되돌리지는 않는다(그러면 "실패 응답 + 변경 반영"이라는
더 나쁜 상태가 된다). 대신 서버 로그에 반드시 남긴다.

### 실시간 지표 스트림

```
GET /api/admin/stream
Authorization: Bearer <access-token>
Accept: text/event-stream
```

```
event: metrics
data: {"uptime_seconds":420,"total_requests":35,"error_rate":0,"active_users":2,
       "traffic":[{"minute":"02:04","requests":11,"errors":0,"avg_ms":27}],
       "top_paths":[...],"recent":[...]}

: ping        ← 20초마다. 조용한 연결을 끊는 프록시 대비
```

- **리버스 프록시는 이 응답을 버퍼링하면 안 된다.** Caddy `flush_interval -1`,
  nginx `proxy_buffering off`. 서버는 `X-Accel-Buffering: no` 도 함께 보낸다.
- 지표는 **프로세스 로컬**이다. 서버를 여러 대로 늘리면 인스턴스별 수치만 보이고,
  재시작하면 초기화된다. 모든 자료구조에 상한이 있어(시계열 60분, 최근 요청 100건,
  지연 표본 512개, 활성 사용자 1만) 관측이 서버를 죽이지 않는다.

### 서버가 절대 내보내지 않는 것

- `password_hash` — 관리 DTO(`AdminUser`)에 해당 필드가 **아예 없다**(구조로 차단).
- JWT 시크릿·DB 비밀번호·봇 토큰 — `ServiceStatus` 는 저장소 종류와 연결 성공 여부만 담는다.

### 관리자 계정 부트스트랩

`ADMIN_LOGIN_ID` / `ADMIN_PASSWORD` 환경변수로만 만든다. 기본 비밀번호는 코드에 없다.
계정이 이미 있으면 비밀번호는 건드리지 않고 권한만 승격한다(재시작마다 비밀번호가
되돌아가면 오히려 위험하다). 둘 다 비고 관리자도 없으면 부팅 로그로 안내만 한다.

---

## 9. 개인 학습 동기화 (앱 ↔ 서버)

> 이 절의 엔드포인트는 앱과 이 문서에는 오래 전부터 있었지만 **서버에는 없었다.**
> 앱이 목업으로 도는 동안에는 드러나지 않다가, 실서버로 전환하는 순간 출석·학습등급·
> 신고·알림 읽음이 전부 404 로 실패하게 되어 있었다. (404 는 재시도 대상이 아니라
> 오프라인 큐에도 담기지 않고 그대로 사라진다.) 지금은 모두 구현되어 있다.

모두 **인증 필요**. 저장소 3종(memory/postgres/mongo) 모두에서 동작한다.

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/api/progress` | 복원용 전체 스냅샷 `{cards, history, attendance, updated_at}` |
| POST | `/api/progress/grade` | 카드 채점 보고 |
| POST | `/api/progress/attendance` | 출석 도장 |
| GET | `/api/engagement` | `{liked_ids, bookmarked_ids}` |
| POST | `/api/engagement/like` | `{card_id, liked}` — 토글이 아니라 **설정** |
| POST | `/api/engagement/bookmark` | `{card_id, bookmarked}` |
| POST | `/api/reports` | 문제 신고 접수 (201) |
| GET | `/api/reports/mine` | 내가 신고한 카드 id |
| GET | `/api/notifications` | 알림 배열 |
| POST | `/api/notifications/read-all` | 전체 읽음 |
| POST | `/api/notifications/:id/read` | 하나 읽음 |

### 멱등성 — 이제 서버가 실제로 지킨다

`Idempotency-Key` 헤더가 있는 쓰기는 **(사용자, 키)** 로 24시간 기억된다. 같은 조합이
다시 오면 핸들러를 부르지 않고 저장된 응답을 그대로 돌려주며 `Idempotency-Replayed: true`
를 붙인다.

- 키에 **사용자를 섞는다.** 섞지 않으면 `attendance:2026-7-27` 처럼 쉽게 겹치는 키로
  남의 응답을 받아 볼 수 있다.
- **성공(2xx)만 기억한다.** 4xx/5xx 를 기억하면 일시적 실패가 영구히 굳는다.
- 헤더가 없으면 아무 일도 하지 않는다 — 이 헤더는 "재전송될 수 있다"는 클라이언트의
  선언이고, 선언하지 않은 요청까지 서버가 기억할 이유는 없다.

미들웨어와 별개로, 저장소에도 같은 규칙이 제약으로 들어가 있다. 출석은 `(user, day)`,
신고는 `(user, card, reason)` 이 유일하다. 미들웨어는 응답을 아껴 주고, 제약은
동시 요청까지 막는다 — 둘 다 필요하다.

### 존재하지 않는 카드는 거부한다 (404)

채점·반응·신고 모두 카드 존재를 확인한다. 받아 두면 어떤 카드였는지 알 수 없는 기록이
남아 통계가 영원히 어긋난다(카드를 지울 때 진행 기록을 함께 지우는 것과 같은 이유).

---

## 10. 동시성·권한에 관한 계약

### 콘텐츠 등록은 관리자만 (`POST /api/cards` → 403)

이 라우트는 문제 등록이 앱 안의 도구이던 시절에 만들어져, 로그인만 하면 누구나 호출할
수 있었다. 그렇게 들어간 카드는 검증도 감사 기록도 없이 전 사용자에게 배포된다.
지금은 `RequireAdmin` 이 걸려 있고, 앱은 `user.role_cd` 로 등록 화면을 미리 감춘다 —
**화면을 감추는 것은 친절이지 권한이 아니다. 차단은 언제나 서버가 한다.**

### 아이디·닉네임 유일성은 저장소가 보장한다 (409)

"중복인가 확인 → 만든다" 사이에는 틈이 있어 동시 가입을 막지 못한다. 세 저장소 모두에
유일성 제약이 있고(mongo 는 인덱스가 아예 없었다), 제약 위반은 `ports.ErrConflict` 로
번역되어 **409** 로 나간다. 500 이 아니다.

### 문제 수정은 낙관적 동시성 (409)

`PUT /api/admin/cards/:id` 에 `updated_at`(내가 화면에서 본 시각)을 함께 보내면,
그 사이 다른 관리자가 먼저 고친 경우 서버가 거부한다. 보내지 않으면 검사하지 않는다
(기존 클라이언트 호환). 이 검사가 없으면 나중 저장이 앞의 수정을 통째로 덮어쓰고,
감사 로그에는 '수정' 두 건만 남아 무엇이 사라졌는지 알 수 없다.

### 비밀번호 정책

공백 제외 8자 이상, 72바이트 이하. 72바이트는 bcrypt 의 물리적 한계이며, 넘으면
**400** 으로 답한다(예전에는 라이브러리 오류가 그대로 500 으로 샜다).

### 무인증 경로의 속도 제한 (429)

`/api/auth/*` 는 IP 당 분당 20회. 아이디 존재 확인(`username-available`,
`nickname-available`)도 같은 제한에 묶인다 — 열어 두면 공격자가 유효한 아이디 목록을
먼저 만든 뒤 그 목록만 집중해서 두드릴 수 있다.

### 기동 거부

영속 저장소(`STORE != memory`)에서 `JWT_SECRET` 이 기본값이면 서버는 **뜨지 않는다.**
그 값은 저장소에 공개돼 있어, 그대로 뜬 서버는 누구나 원하는 사용자의 토큰을 위조할 수
있다(관리자 ID 로 서명하면 전체 사용자 데이터가 열린다). 예전에는 경고만 찍고 떴는데,
로그의 경고는 아무도 읽지 않는다.

---

## 11. 관리 콘솔 — 신고 · 공지

### `GET /api/admin/reports?limit=`

접수된 문제 신고. 서버가 **카드 제목·분류·신고자 이름을 붙여서** 준다.

id 만 주면 관리자는 "card_42 를 u_7f3a 가 신고했다"를 읽고 무슨 문제인지 확인하려고
다시 검색해야 한다. 서버가 이미 아는 정보를 붙이면 그 왕복이 사라진다.
카드가 이미 삭제됐으면 `card_missing: true` 로 알린다 — 이 표시가 없으면
관리자는 사라진 카드를 계속 찾아다닌다.

콘솔은 **같은 카드에 몰린 신고를 묶어 건수가 많은 순으로** 보여 준다.
한 문제에 신고가 여러 건이면 그쪽이 더 급하다.

### `POST /api/admin/notifications`

```json
{ "title_txt": "...", "desc_txt": "...", "type_cd": "SYSTEM", "user_id": "(비면 전체)" }
```

알림 테이블은 있는데 **그것을 만드는 주체가 없었다.** 앱은 `/api/notifications` 를
부르지만 언제나 빈 배열만 받았다 — 기능이 반쪽이었던 셈이다.

- 전체 발송은 **활성 계정만** 대상으로 한다. 들어올 수 없는 사람에게 보내 봐야
  읽히지 않고 저장소만 채운다.
- 한 번에 5,000명까지. 넘으면 **조용히 일부만 보내지 않고** 400 으로 거부한다.
- 제목 60자, 내용 500자. 종류는 `NEW`/`REMIND`/`ACHIEVEMENT`/`SYSTEM`.
- 되돌릴 수 없는 행위이므로 감사 로그(`notification.send`)에 대상 수까지 남긴다.

응답은 `{"sent": N}` — 전체 발송은 결과를 확인할 방법이 이것뿐이다.

### 대시보드

`content.reports` 에 신고 건수가 실린다. 콘솔은 이 숫자를 타일이 아니라
**누르면 신고 화면으로 가는 줄**로 그린다. 신고는 '현황'이 아니라 '처리할 일'이고,
0이면 줄 자체를 감춘다 — 할 일이 없을 때의 빈 줄은 소음이다.


---

## 분석 API — `GET /api/admin/insight`

관리 대시보드가 **현황**(몇 명·몇 장)을 보여 준다면, 이쪽은 **판단**을 준다.
"지금 무엇을 해야 하는가"까지 서버에서 끝내고 내려보낸다.

### 왜 한 번에 다 주는가

화면이 여러 지표를 나란히 놓고 비교하는데, 조각마다 따로 받으면 서로 다른 시점의
값이 한 화면에 섞인다("이탈은 방금, 활동은 1분 전"). 비교를 위한 화면에서
시점이 다른 값은 그냥 틀린 값이다.

전체 스캔이라 비싸므로 서버가 60초 캐시한다. 고친 것을 바로 확인하려면 `refresh`.

### 응답 구조

| 필드 | 뜻 |
|---|---|
| `coverage` | **이 분석을 믿어도 되는가.** 표본 수와 한 줄 판정(`verdict`), `trustworthy` |
| `headlines` | 지금 할 일. `severity`(critical/warn/info/good) · `metric` · `link` |
| `calibration` | 선언 난이도 vs 실제 실패율이 어긋난 문제 |
| `categories` | 분야별 실패율·숙달률·신고, 전체 평균 대비 배수(`ratio`) |
| `orgs` | 조직별 도입률·습관·평균 학습량 |
| `churn` | 이탈 등급 분포 + 되돌릴 가치가 큰 학습자 명단 |
| `funnel` | 가입 → 첫 학습 → 3일 이상 → 습관 |
| `retention` | 가입 주차별 잔존(0주차 = 가입한 그 주) |
| `activity` / `anomalies` | 최근 30일 일별 활성 학습자 + 평소와 다른 날 |
| `dead_content` | 아무도 만나지 못한 문제 |

### 설계에서 지킨 것

**표본이 모자라면 판정하지 않는다.** 카드 난이도는 학습자 5명 이상이 푼 것만 본다 —
세 사람이 푼 카드의 실패율은 우연이다. `coverage.trustworthy` 가 `false` 면
화면은 수치를 참고용으로 표시해야 한다.

**이상 탐지는 중앙값과 MAD 를 쓴다.** 평균·표준편차는 이상치 하나에 휘둘린다.
접속자 100명이던 기간에 하루 0명(장애)과 하루 400명(공지 발송)이 함께 있으면,
400 이 표준편차를 부풀려 **0명인 날이 평범해 보인다.** 장애를 놓치는 이상
탐지기는 있으나 마나다.

**되돌릴 가치 순으로 정렬한다.** 이탈 명단은 '위험한 사람'이 아니라 '아까운 사람'
순이다. 한 장 하고 만 사람보다 300장을 쌓다 멈춘 사람을 되돌리는 편이 값어치 있다.

### 저장소 요구사항

`ports.InsightRepository`(카드별·사용자별 집계 + (사용자, 날짜) 활동 쌍)를 구현한
저장소에서만 열린다. memory·postgres·mongo 모두 구현되어 있으며, 집계는 전부
저장소 안에서(SQL `GROUP BY` / Mongo `$group`) 끝낸다. 지원하지 않는 저장소면
라우트를 **아예 등록하지 않는다** — 없는 기능을 열어 두고 500 을 돌려주면
화면은 '고장'으로 보인다.

### 날짜 키 주의

학습 이력·출석의 날짜 키는 앱이 정한 `YYYY-M-D` 이고 **month 가 0-based** 다
(7월 = 6). 서버가 Go 의 `time.Month`(1부터)를 그대로 쓰면 한 달 밀린 키가
저장되어, 앱 달력에서 다음 달 칸에 찍힌다. 정의는 `service.DayKey` 하나뿐이니
날짜 키를 다룰 때는 반드시 그것을 쓴다.


---

## 학습자 코칭 진단 — `GET /api/admin/insight/learner/:id`

전체 분석이 "무엇이 문제인가"에 답한다면, 이쪽은 **"이 사람에게 무엇을 가르쳐야
하는가"** 에 답한다. 교육 담당자가 개인 면담·보충 교육을 준비할 때 쓴다.

### 이 API 의 핵심은 오답 목록이 아니라 '또래 비교'다

틀린 문제만 뽑아 주면 쓸모가 없다. 두 가지가 섞여 있기 때문이다.

| 상황 | 뜻 | 해야 할 일 |
|---|---|---|
| 다들 틀리는 문제를 이 사람도 틀림 | 이 사람의 약점이 **아니다** | 문제·교육 자료를 고친다 |
| 다들 맞히는데 이 사람만 틀림 | 이 사람의 약점이 **맞다** | 이 사람을 가르친다 |

구분하지 않으면 담당자는 어려운 문제 순서대로 코칭하게 되는데, 그건 대부분
헛수고다. 그래서 오답마다 `signal` 을 준다.

- `personal` — 또래보다 25%p 이상 더 틀린다 → **여기에 코칭 시간을 쓴다**
- `shared` — 또래도 50% 이상 틀린다 → 개인이 아니라 콘텐츠 문제
- `unknown` — 비교할 또래가 5명 미만 → **판단하지 않는다**

목록은 `personal` 을 맨 위로 정렬한다. 정렬이 뒤집히면 코칭 순서가 뒤집힌다.

### 오답에 정답과 해설을 함께 싣는다

`question` · `answer` · `explain` 이 응답에 들어 있다. 제목만 주면 담당자가
그 문제를 다시 찾아 열어야 하고, 그 수고 때문에 결국 코칭을 안 하게 된다.
선택형은 정답 보기를, 설명형은 결론을 `answer` 로 준다.

### 또래 기준은 '이 사람이 푼 문제'로만 만든다

전체 평균과 비교하면 쉬운 문제만 푼 사람이 늘 우수해 보인다. `summary` 의
`peer_lapse_rate` · `peer_mastery_rate` 는 이 사람이 실제로 푼 카드들의
전체 집계로 계산한다.

### 응답 구조

| 필드 | 뜻 |
|---|---|
| `verdict` | 결론 — 개인 약점 → 약한 분야 → 콘텐츠 문제 → 학습 끊김 순 |
| `summary` | 실패율·숙달률·학습일·경과일. **모든 수치에 또래 값이 나란히** |
| `weakness` | 분야별 본인 vs 또래(`weak`/`shared`/`ok`) |
| `missed` | 오답 최대 30건. 문제·정답·해설·`signal` 포함 |
| `rhythm` | 최근 30일 이 사람의 학습일(1/0) |
| `prescriptions` | **교육 처방** — 무엇을 가르칠지와 그 근거. 점수 내림차순, 최대 6건 |
| `needs` | 처방을 한 줄로 압축(목록 화면용). 없으면 `"지금 배정할 교육 없음"` |

## 교육 처방 — 근거 없는 처방은 내지 않는다

진단은 "무엇이 약한가"까지만 답한다. 거기서 멈추면 교육은 시작되지 않는다.
담당자가 실제로 움직이려면 세 가지가 **한 덩어리로** 붙어 있어야 한다:

1. 무엇을 (`title` · `target` · `cards`)
2. **왜 이 사람인가** (`why` · `evidence`)
3. 무엇이 달라지는가 (`expect`)

②가 빠지면 처방은 지시가 된다. 안전교육에서 지시는 거부되거나, 더 나쁘게는
형식적으로 소화된다. "왜 나만 이걸 또 들어야 하느냐"에 답할 수 없는 교육은
시간만 쓴다. **그래서 근거가 모자라면 처방 자체를 내지 않는다** —
빈칸이 틀린 처방보다 낫다.

### 근거(`evidence`) 한 줄의 구성

| 필드 | 뜻 |
|---|---|
| `fact` | 무엇을 관측했나 |
| `observed` | 이 사람의 값 |
| `compared` | 무엇과 견줬나 — 없을 수 있다(비교가 성립하지 않는 관측) |
| `sample` | 그 비교의 표본 |
| `rule` | 어떤 기준선을 넘었기에 처방이 됐나 |
| `source` | 어느 기록에서 나온 수치인가 |
| `strength` | `strong` / `moderate` / `weak` — 표본과 비교 대상이 받쳐 주는 정도 |

다섯 조각이 함께 있어야 담당자가 **반박할 수 있다**. 반박할 수 없는 추천은
결국 아무도 따르지 않는다.

`confidence` 는 근거들의 세기를 접은 값이다 — 강한 근거 **둘 이상**이라야
`high` 다. 하나는 우연일 수 있고, 서로 다른 각도의 관측이 같은 결론을 가리킬
때 비로소 우연이 아니라고 말할 수 있다.

### 처방의 종류(`kind`)와 갈림길

| kind | 언제 | 누구의 일인가 |
|---|---|---|
| `onboarding` | 학습 기록이 0건 | 진입 안내 — 내용 교육은 아직 근거가 없다 |
| `engagement` | 7일(위험 21일) 이상 학습 없음 | 복귀 접촉 — 오지 않으면 무엇도 전달되지 않는다 |
| `category` | 한 분야에서만 또래보다 25%p 이상 더 틀림 | **사람**을 가르친다 |
| `cards` | 분야로 묶이지 않는 낱장 개인 약점 | **사람**을 가르친다 |
| `retention` | 숙달률이 또래보다 15%p 이상 낮음 | 학습 방법 |
| `content` | 또래도 50% 이상 틀리는 문제 | **자료**를 고친다 (개인 교육 대상 아님) |

마지막 줄이 이 API 의 존재 이유다. 사람을 가르칠 일과 자료를 고칠 일을 섞으면,
담당자는 같은 설명을 사람 수만큼 반복하게 된다.

### 처방끼리 겹치지 않게 한다

- 분야 처방이 이미 데려간 문제는 낱장 코칭(`cards`)에서 뺀다. 겹치면 같은 여섯
  장이 두 처방에 나란히 뜨고 소요 시간도 두 번 더해져, 담당자는 한 가지 일을
  두 배 분량으로 읽는다.
- 약한 분야가 잡혀 있으면 `retention` 을 내지 않는다. 이 처방의 근거는 "내용은
  아는데 복습 시점을 놓친다"인데, 숙달률이 낮은 이유가 그 분야를 계속 틀려서라면
  그 주장은 사실이 아니다.

### 표본이 모자라면 처방하지 않는다

분야 처방은 그 분야에서 **문제 3장·시도 6회 이상**이라야 나온다. 세 번 풀어 본
분야의 실패율은 그날 컨디션이지 실력이 아니고, 한두 장으로 "이 분야가 약하다"고
말하면 그 분야 전체를 오해하게 된다.

### 캐시하지 않는다

전체 분석과 달리 한 사람만 보므로 가볍고, 담당자가 이 화면을 여는 시점은 대개
"방금 무슨 일이 있었나"를 확인할 때다. 그때 1분 전 값을 보여 주면 확인하러 온
목적 자체가 사라진다.
