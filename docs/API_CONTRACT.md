# 백엔드 API 계약서 (Frontend ↔ Backend Contract)

이 앱(Expo/React Native)이 **실서버 모드**(`EXPO_PUBLIC_USE_MOCK_DATA=false`)에서
호출하는 엔드포인트 전체 명세다. 백엔드는 이 문서대로 구현하면 프론트 수정 없이 붙는다.

## 공통 규칙

| 항목 | 규칙 |
|---|---|
| Base URL | `EXPO_PUBLIC_API_BASE_URL` (끝에 `/` 금지 — 경로가 `//api/...` 로 중복됨) |
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
