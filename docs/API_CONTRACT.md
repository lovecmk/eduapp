# 백엔드 API 계약서 (Frontend ↔ Backend Contract)

> **서버가 아직 만들지 않은 경로와 우선순위는 [BACKEND_TODO.md](./BACKEND_TODO.md)에 모았다.**
> 거기 있는 경로는 앱 구현이 끝나 있고, 배포하면 앱 재배포 없이 붙는다.

이 앱(Expo/React Native)이 **실서버 모드**(`EXPO_PUBLIC_USE_MOCK_DATA=false`)에서
호출하는 엔드포인트 전체 명세다. 백엔드는 이 문서대로 구현하면 프론트 수정 없이 붙는다.

## 공통 규칙

| 항목 | 규칙 |
|---|---|
| Base URL | `EXPO_PUBLIC_API_BASE_URL` (끝에 `/` 금지 — 경로가 `//inner/api/v1/...` 로 중복됨) |
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

> **부분 배포 폴백**: `weather` / `learning-quota` / `daily-assignment` / `service-config` /
> `user-directory` / `qna` / `settings` 는 404·501·502·503·504 응답 시 클라이언트가 조용히
> 목업으로 폴백한다(앱이 안 깨짐). 반면 `auth` / `cards` / `stats` / `community` 와
> 사용자 데이터 동기화(`progress` / `engagement` / `reports` / `notifications` / `collection`)는
> 폴백하지 않고 에러가 그대로 드러난다 — 목업이 실데이터를 위장하면 안 되기 때문이다.
>
> 폴백 사유는 구분된다: **404·501 은 영구 래치**(다음 배포 전까지 다시 묻지 않음),
> **0·502·503·504 는 60초 뒤 자동 재확인**. 강등된 기능은 앱의
> `개발자 모드 > 환경 설정 > 기능별 연결 상태`에 그대로 표시된다.

---

## 1. 인증 (`/inner/api/v1/auth`)

### `POST /inner/api/v1/auth/login`
```jsonc
// req
{ "id": "hong", "password": "safe1234" }
// res 200
{ "access_token": "...", "refresh_token": "...", "user": { /* UserDTO */ } }
```

### `POST /inner/api/v1/auth/social`
```jsonc
// req  { "name": "원진섭", "email": "won@example.com" }
// res 200 — login 과 동일
```

### `POST /inner/api/v1/auth/register`
```jsonc
// req
{ "username": "hong", "password": "safe1234", "name": "홍길동",
  "nickname": "현장왕", "email": "hong@example.com", "org": "안전관리본부" }
// res 200 — login 과 동일 / 409 — 아이디·닉네임 중복
```

### `POST /inner/api/v1/auth/refresh` ⚠️ 중요
```jsonc
// req  { "refresh_token": "..." }
// res 200
{ "access_token": "...", "refresh_token": "..." }  // 회전 시 새 refresh_token 필수 반환
```
- **토큰 회전(rotation)을 쓴다면 응답에 새 `refresh_token` 을 반드시 포함**할 것.
  클라이언트는 반환된 값을 저장하며, 없으면 기존 토큰을 유지한다.
- 클라이언트는 동시 401 이 여러 개여도 refresh 를 **1회만** 호출한다(single-flight).

### `POST /inner/api/v1/auth/logout`
```jsonc
// req {} · res 200 — 서버는 refresh 토큰을 폐기할 것
```

### `GET /inner/api/v1/auth/me` / `PATCH /inner/api/v1/auth/me`
```jsonc
// GET  res 200 — UserDTO
// PATCH req { "name"?, "nickname"?, "email"?, "org"?, "jobTitle"? } → res 200 UserDTO
```

### `POST /inner/api/v1/auth/reset-password`
```jsonc
// req { "username": "hong", "email": "hong@example.com", "newPassword": "safe1234" }
// res 200 (본문 무관)
```

### `GET /inner/api/v1/auth/username-available?username=...`
### `GET /inner/api/v1/auth/nickname-available?nickname=...&exclude=<userId>`
```jsonc
// res 200 { "taken": true }
```

### `POST /inner/api/v1/auth/email/request-code` 🔐
```jsonc
// req { "email": "hong@example.com" }
// res 200 {}   ← 코드를 응답에 절대 포함하지 말 것(포함 시 인증 우회 가능)
```
- 코드는 **서버가 생성해 이메일로만** 전달한다.
- 권장: 6자리 숫자, TTL 5분, 검증 시도 5회 초과 시 무효화, 1회용, 발송 rate limit.

### `POST /inner/api/v1/auth/email/verify-code` 🔐
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

## 2. 학습 카드 (`/inner/api/v1/cards`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/inner/api/v1/cards` | 전체 카드 — `CardDTO[]` |
| GET | `/inner/api/v1/cards/today?limit=&mode=` | 오늘의 학습 세션 — `CardDTO[]` |
| PATCH | `/inner/api/v1/cards/:id` | `{ "status_cd": "NEW"\|"LEARNING"\|"MASTERED" }` → `CardDTO` |
| POST | `/inner/api/v1/cards` | 카드 등록 → `CardDTO` |

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

### `GET /inner/api/v1/stats` → `StatsDTO`
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

### `GET /inner/api/v1/config` → 서비스 운영 상태 (무인증)
```jsonc
{ "maintenance_yn": false, "maintenance_msg": "", "signup_enabled": true,
  "daily_min_cards": 3, "daily_max_cards": 5, "daily_new_limit": 5,
  "notice_txt": "", "notice_level": "INFO", "version": "1.2.3" }
```
- **인증을 요구하지 말 것** — 점검 중이라 로그인조차 못 하는 사람에게도 사유는 닿아야 한다.
- `notice_level` 은 `INFO`/`WARN`/`DANGER`. 모르는 값은 앱이 `INFO` 로 낮춰 해석한다.

### `GET /inner/api/v1/learning/today` → 오늘의 학습 편성
```jsonc
{ "day": "2026-8-14", "difficulty_cd": "EASY", "target_count": 4, "done_count": 1,
  "cards": [ { /* CardDTO */ "kind": "NEW" /* NEW | REVIEW */, "done": false } ] }
```
- 날짜 키는 앱의 `dateKey()` 형식(`YYYY-M-D`)과 같아야 한다.

### `GET /inner/api/v1/community/live` → 커뮤니티 스냅샷
### `GET /inner/api/v1/users/search?q=` → 공개 프로필 요약 배열
### `GET /inner/api/v1/users/:id/public` → 공개 프로필(공개 범위 적용) 또는 `null`
### `GET /inner/api/v1/weather/current` → 현재 날씨(홈 배경 앰비언트용)
### `GET /inner/api/v1/learning/quota` → `{ "limit": 3, "used": 1, "resets_at": "..." }`
### `POST /inner/api/v1/learning/complete` → `{ "count": 1 }`
### `POST /inner/api/v1/push/register` → 푸시 토큰 등록
### `GET /inner/api/v1/collection` → 내 안전 카드 도감
### `POST /inner/api/v1/collection/sync` → 기기 상태를 병합하고 **병합 결과**를 돌려줌
### `GET /api/admin/users/:id/collection` → 운영자용 도감 조회(읽기 전용)

---

## 3-1. 안전 카드 도감 동기화 ✅

```jsonc
// POST /inner/api/v1/collection/sync — req
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

`claimed_rules` 의 키는 **열린 집합**이다 — 획득 규칙 id(`study-50` 등) 외에 옥상 보물상자 수령 기록
`bld:<YYYY-MM>:<층>`(값 1)이 들어온다. 서버는 키를 검증하지 말고 키별 최댓값으로 합칠 것
(같은 상자를 다른 기기에서 다시 열지 못하게 하는 장치다. 상자 규칙: `src/domain/buildingCrates.ts`).
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

## 4. 헬스체크 `GET /inner/api/v1/health` ✅

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
POST /inner/api/v1/progress/attendance
Idempotency-Key: attendance:2026-7-25
```
- 처음 받은 키 → 정상 처리 후 키를 (최소 24시간) 보관
- 이미 처리한 키 → **다시 반영하지 말고 200 으로 응답**(409 아님 — 재전송은 정상 흐름)
- 키 보관 실패보다 중복 반영이 더 위험하다(출석 2회, 신고 중복 접수 등)

### 6-1. 학습 진행 `/inner/api/v1/progress`

앱에서 가장 중요한 데이터(복습 일정·학습 이력·출석).

```jsonc
// GET /inner/api/v1/progress → 200
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
// POST /inner/api/v1/progress/grade   (Idempotency-Key: grade:<cardId>:<lastReviewedAt>)
{ "card_id": "c-001", "grade": "good", "box": 2, "ease": 2.56,
  "due_at": "2026-08-01T00:00:00.000Z", "reps": 3, "lapses": 1 }
// → 200 (본문 무관)

// POST /inner/api/v1/progress/attendance   (Idempotency-Key: attendance:<dayKey>)
{ "day": "2026-7-25" }
// → 200. 하루 1회만 유효 — 같은 날 재요청은 조용히 200.
```

### 6-2. 카드 반응 `/inner/api/v1/engagement`

```jsonc
// GET /inner/api/v1/engagement → 200
{ "liked_ids": ["c-001"], "bookmarked_ids": ["c-002", "c-003"] }

// POST /inner/api/v1/engagement/like      (Idempotency-Key: like:<cardId>:<liked>)
{ "card_id": "c-001", "liked": true }
// POST /inner/api/v1/engagement/bookmark  (Idempotency-Key: bookmark:<cardId>:<bookmarked>)
{ "card_id": "c-002", "bookmarked": false }
```
- **토글이 아니라 '원하는 상태'를 보낸다.** 재전송돼도 결과가 같아야 하기 때문이다.

### 6-3. 카드 신고 `/inner/api/v1/reports`

```jsonc
// POST /inner/api/v1/reports   (Idempotency-Key: report:<cardId>:<reason>)
{ "card_id": "c-001",
  "reason": "wrong_answer",   // wrong_question | wrong_answer | typo | outdated | etc
  "detail": "KEC 개정으로 기준이 바뀌었습니다" }   // 선택, 300자 이내(클라이언트에서 정제)
// → 200

// GET /inner/api/v1/reports/mine → 200
{ "card_ids": ["c-001"] }
```
- 신고는 운영자 확인이 필요한 데이터다. 접수 후 운영 콘솔에서 볼 수 있어야 한다.

### 6-4. 알림 `/inner/api/v1/notifications`

```jsonc
// GET /inner/api/v1/notifications → 200 (최신순 배열)
[{ "id": "n1", "type_cd": "SYSTEM",       // NEW | REMIND | ACHIEVEMENT | SYSTEM
   "title_txt": "업데이트 안내", "desc_txt": "복습 알고리즘이 개선되었어요",
   "created_at": "2026-07-25T08:00:00.000Z", "read_yn": false, "category_nm": "공지" }]

// POST /inner/api/v1/notifications/:id/read   (Idempotency-Key: notif-read:<id>)
// POST /inner/api/v1/notifications/read-all   (Idempotency-Key: notif-read-all:<date>)
// POST /inner/api/v1/push/register            (Idempotency-Key: push:<token>)
{ "token": "ExponentPushToken[...]", "platform": "ios" }
```
- 목록이 배열이 아니면 클라이언트는 빈 목록으로 처리한다(화면은 깨지지 않음).
- **알림 삭제 API 는 없다.** 앱의 '이 알림 삭제'·'전체 삭제'는 지운 id 를 기기에 기억해 두고
  목록을 받을 때 걸러 낸다(`notificationStore.dismissedIds`). 기기를 바꾸면 다시 보인다 —
  기기 간에 맞추려면 `DELETE /inner/api/v1/notifications/:id`(또는 숨김 플래그)가 필요하다.

### 6-5. 고객센터 문의 `/inner/api/v1/support/inquiries` ⚠️ 서버 미구현

앱의 [설정 › 지원 › 고객센터 문의]는 이 경로로 보낸다. 법적 고지가 이 창을 **1차 문의
창구**로 안내하므로(`constants/legal.ts` LEGAL_META.contactChannel) 서버에 반드시 있어야 한다.

```jsonc
// POST /inner/api/v1/support/inquiries   (인증 필요)
{ "category": "학습 오류",          // 학습 오류 | 계정 문제 | 멤버십 등급 | 기능 제안 | 기타
  "email": "won@kfpa.or.kr",        // 답변받을 주소(사용자가 고칠 수 있다)
  "message": "…",                   // 10~1000자, 클라이언트에서 정제
  "app_version": "1.13.47", "build_number": 95, "platform": "android" }
// → 201 { "id": "Q-20260930-0042" }  // 접수 번호 — 앱이 완료 화면에 그대로 보인다
```
- 앱은 **2xx 를 받았을 때만** "접수되었어요"라고 말한다. 예전에는 전송 없이 0.9초 뒤
  접수 완료를 띄웠다 — 문의가 전부 사라지고 있었다.
- 라우트가 없으면(404/501) 앱은 "창구가 아직 열리지 않았어요"라고 안내하고 적은 내용을 지우지 않는다.
- 오프라인 큐에 태우지 않는다(보냈다는 확인을 사람이 기다리는 행위라서). 연결이 없으면 다시 보내게 한다.
- 운영 콘솔에서 목록·답변 상태를 볼 수 있어야 한다(신고 처리 워크플로와 같은 자리가 자연스럽다).

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

Go 백엔드에 **구현 완료**된 관리 API. 프런트(Vue 3)는 이 저장소를 떠나 mybrdg
운영관리 안으로 들어갔다 —
`FE/mybrdg/src/pages/Operations/Content-Setting/Daily3Min/`
(`/operations/content/daily3min`). 주소·응답 형식은 그대로다.

### 접근 제어

모든 `/api/admin/*` 은 두 관문을 통과해야 한다.

1. 신원 확인 — 유효한 액세스 토큰(`Authorization: Bearer`) **또는** mybrdg 세션
   쿠키(`access_token_mybrdg`). 콘솔이 mybrdg 안의 한 페이지라, 거기서 이미 한
   로그인을 다시 요구하지 않는다(없으면 `401`).
2. `RequireAdmin` — 저장소에서 사용자를 조회해 `role_cd == "ADMIN"` 이고 계정이 활성인지 확인(아니면 `403`)

> **역할을 JWT 에 담지 않는 이유**: 토큰에 박으면 권한을 회수해도 만료(액세스 15분,
> 리프레시 30일)까지 관리자로 통한다. 관리 권한은 즉시 회수돼야 하므로 매 요청 조회한다.
> 관리 API 는 호출량이 적어 이 비용이 문제되지 않는다.

KFPA 브릿지에 붙은 지금, 역할·계정 상태의 출처는 브릿지 회원(`cyber_user`)이다 —
`admin == true` 또는 `level == "1"` 이면 관리자. 자체 회원 모드
(`D3M_USE_BRIDGE_ACCOUNTS=false`)에서는 `users.role_cd` 를 본다.
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
| GET | `/inner/api/v1/progress` | 복원용 전체 스냅샷 `{cards, history, attendance, updated_at}` |
| POST | `/inner/api/v1/progress/grade` | 카드 채점 보고 |
| POST | `/inner/api/v1/progress/attendance` | 출석 도장 |
| GET | `/inner/api/v1/engagement` | `{liked_ids, bookmarked_ids}` |
| POST | `/inner/api/v1/engagement/like` | `{card_id, liked}` — 토글이 아니라 **설정** |
| POST | `/inner/api/v1/engagement/bookmark` | `{card_id, bookmarked}` |
| POST | `/inner/api/v1/reports` | 문제 신고 접수 (201) |
| GET | `/inner/api/v1/reports/mine` | 내가 신고한 카드 id |
| GET | `/inner/api/v1/notifications` | 알림 배열 |
| POST | `/inner/api/v1/notifications/read-all` | 전체 읽음 |
| POST | `/inner/api/v1/notifications/:id/read` | 하나 읽음 |
| POST | `/inner/api/v1/support/inquiries` | 고객센터 문의 접수 (201, **서버 미구현** — §6-5) |
| POST | `/inner/api/v1/notifications/dismiss` | 알림 숨김 `{ids}` (**서버 미구현** — BACKEND_TODO §8) |
| GET·POST | `/inner/api/v1/me/faction` | 내 진영 (**서버 미구현** — BACKEND_TODO §3) |
| GET·POST | `/inner/api/v1/feed` · `POST /feed/:id/reactions` | 자랑 피드 (**서버 미구현** — BACKEND_TODO §5) |
| GET·POST | `/inner/api/v1/cards/:id/tips` · `POST /tips/:id/like` · `DELETE /tips/:id` | 현장 팁 (**서버 미구현** — BACKEND_TODO §6) |
| GET·POST | `/inner/api/v1/cards/:id/difficulty` | 체감 난이도 (**서버 미구현** — BACKEND_TODO §7) |

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

### 콘텐츠 등록은 관리자만 (`POST /inner/api/v1/cards` → 403)

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

`/inner/api/v1/auth/*` 는 IP 당 분당 20회. 아이디 존재 확인(`username-available`,
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

알림 테이블은 있는데 **그것을 만드는 주체가 없었다.** 앱은 `/inner/api/v1/notifications` 를
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

---

## 12. 질문 & 답변 `/inner/api/v1/qna` 🆕 (미구현 — location 블록 생성 전)

커뮤니티에서 사용자가 실제로 **참여**하는 유일한 기능인데, 지금까지 앱 안에만
있었다(기기 로컬 zustand 스토어 + 시드 7건). 내가 올린 질문은 남에게 보이지
않고 남의 질문은 가짜였다 — 화면만 커뮤니티였다.

앱은 이미 이 계약대로 호출한다. 라우트가 열리면 **앱을 다시 배포하지 않아도**
첫 요청부터 실서버를 쓴다(그전까지는 목업 폴백 + 개발자 화면에 강등 표시).

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/inner/api/v1/qna?limit=30` | 최신 질문 목록 |
| GET | `/inner/api/v1/qna/:id` | 질문 상세(답변 본문 포함) |
| POST | `/inner/api/v1/qna` | 질문 등록 → 생성된 질문 |
| POST | `/inner/api/v1/qna/:id/answers` | 답변 등록 → 생성된 답변 |
| POST | `/inner/api/v1/qna/:id/like` | 질문 공감 `{ liked }` |
| POST | `/inner/api/v1/qna/:qid/answers/:aid/like` | 답변 공감 `{ liked }` |

```jsonc
// QuestionDTO
{
  "id": "q_01",
  "author_nm": "이안전",          // 비면 앱이 '익명'으로 표기
  "category_nm": "전기 위험",     // 선택
  "title_txt": "분전반 단자 발열…",
  "body_txt": "…",
  "like_cnt": 5, "liked_yn": false, "mine_yn": false,
  "answer_cnt": 3,                // ⚠️ 목록에서도 정확해야 한다
  "my_answer_cnt": 1,             // 내가 단 답변 수('내 기여' 한 줄)
  "solved_yn": true,              // 채택된 답변 존재 여부
  "created_at": "2026-08-14T00:00:00.000Z",
  "answers": [ /* AnswerDTO — 상세에서만 */ ]
}

// AnswerDTO
{ "id": "a_01", "author_nm": "한전기", "body_txt": "…",
  "like_cnt": 8, "liked_yn": false, "mine_yn": false, "accepted_yn": true,
  "created_at": "2026-08-14T00:00:00.000Z" }
```

### 목록에 카운터를 반드시 실어야 하는 이유

목록 응답에 답변 본문까지 담으면 질문 30건에 답변 수백 개가 딸려 와 지하에서
열리지 않는다. 그래서 목록은 본문 없이 내려보내되 **개수는 서버가 세어 준다.**
`answer_cnt` 가 없으면 앱은 answers 배열(비어 있음)로 세게 되고, 목록의 모든
질문이 '답변 0'으로 보인다 — 답변을 기다리는 질문 추천 기능이 통째로 오작동한다.

### 목록 응답 형태

배열(`[…]`) 또는 `{ "items": [...] }` 둘 다 받는다. 페이지네이션을 붙일 계획이면
`items` 형태를 쓰고 나중에 `next_cursor` 를 추가하는 편이 안전하다.

### 공감은 토글이 아니라 '원하는 상태'

`{ "liked": true }` 를 두 번 받아도 결과는 한 번과 같아야 한다. 오프라인 큐가
재전송하기 때문이다(`Idempotency-Key: qna-like:<qid>:<liked>`).

### 등록은 큐에 넣지 않는다

질문·답변 등록만 `postDurable` 이 아니라 일반 POST 다. 서버가 부여한 id 를 받아야
상세 화면으로 이동할 수 있고, 큐에 넣어 나중에 보내면 사용자는 "올렸는데 없다"를
먼저 보게 된다. 실패는 화면에 그대로 노출되고 작성 내용은 모달에 남는다.

### 서버가 지켜야 할 것

- 본문 정제는 앱에서도 하지만(제어문자·제로폭 제거, 제목 80자·본문 1000자) **서버가 재검증**한다.
- `mine_yn` · `liked_yn` 은 요청자 기준으로 계산한다(캐시를 공유하지 말 것).
- 삭제된 질문은 `GET /inner/api/v1/qna/:id` 에서 `404` 또는 `null` — 앱은 "질문을 찾을 수 없어요"를 띄운다.

---

## 13. 계정 설정 `/inner/api/v1/settings` 🆕 (미구현 — location 블록 생성 전)

기기가 아니라 **사람을 따라가야 하는 설정**을 서버가 보관한다. 지금까지 전부
`AsyncStorage` 에만 있어서, 기기를 바꾸면 관심 분야·하루 목표·공개 범위·한 줄
소개가 초기값으로 돌아갔다. 특히 **마케팅 정보 수신 동의처럼 법적 의미가 있는
선택이 기기와 함께 사라졌다.**

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/inner/api/v1/settings` | 내 계정 설정. 기록이 없으면 `200 {}` |
| POST | `/inner/api/v1/settings` | 전체 덮어쓰기 (`Idempotency-Key: settings:<updated_at>`) |

```jsonc
{
  "notifications": {
    "enabled_yn": true, "daily_reminder_time": "09:00",
    "review_alerts_yn": true, "weekly_report_yn": true,
    "in_app_yn": true, "email_yn": false, "marketing_yn": false
  },
  "daily_target": 7,
  "shuffle_yn": true,
  "prioritize_weak_yn": false,
  "interests": ["전기시설", "위험물시설"],
  "bio_txt": "현장 점검 8년차",
  "flex_prompt_yn": true,
  "achievement_badge_yn": true,
  "collection_enabled_yn": false,
  "visibility": {
    "searchable_yn": true, "show_progress_yn": true, "show_streak_yn": true,
    "show_emblems_yn": true, "show_collection_yn": false
  },
  "updated_at": "2026-08-14T00:00:00.000Z"
}
```

### 기록이 없으면 `200 {}` — `404` 가 아니다

`404` 는 앱에게 "라우트가 없다"는 뜻이라, 그 기능이 **영구 래치로 목업에 갇힌다**
(다음 앱 실행 전까지 다시 묻지 않는다). 설정을 한 번도 저장하지 않은 신규 계정에는
빈 객체를 주면 된다. 앱은 그것을 "서버에 기록 없음"으로 읽고 기기 값을 올린다.

### 없는 필드를 기본값으로 채워 보내지 말 것 ⚠️

가장 위험한 실수다. 서버가 알림 항목 하나만 알고 있는 배포에서 나머지를 `false` 로
채워 내려보내면, 사용자가 켜 둔 알림이 **로그인 한 번으로 조용히 전부 꺼진다.**
모르는 값은 **필드 자체를 생략**한다 — 앱은 생략된 필드에 기기 값을 남긴다.

### 병합은 시각 기준 마지막 쓰기 우선

도감(단조 증가 카운터)과 달리 껐다 켰다 하는 값이라 필드별 최댓값 병합이 성립하지
않는다. 앱은 사용자가 마지막으로 손댄 시각을 들고 다니며 서버 `updated_at` 과 비교한다.

| 상황 | 앱 동작 |
|---|---|
| 서버에 기록 없음 | 기기 값을 올린다 |
| 기기에서 한 번도 안 바꿈 | 서버 값을 받는다 |
| 서버 `updated_at` 이 더 나중 | 서버 값을 받는다 |
| 기기 쪽이 더 나중 | 기기 값을 올린다 |
| 내용이 같음 | 아무것도 하지 않는다 |

### 동기화하지 않는 설정

테마·글자 크기·고대비·배경 앰비언트·화면 켜둠·생체인증·햅틱·프로필 이미지는
**기기 전용**이라 이 엔드포인트에 담기지 않는다. 사무실 웹에서 바꾼 다크 테마가
조도가 다른 현장 태블릿까지 어둡게 만들면 친절이 아니라 방해다.

### 값 범위(서버도 같은 규칙으로 절삭할 것)

| 필드 | 규칙 |
|---|---|
| `daily_target` | 1~50 (밖의 값은 잘라서 저장 — 거절하면 나머지 설정까지 잃는다) |
| `bio_txt` | 100자 |
| `daily_reminder_time` | `HH:MM` 24시간. 형식이 틀리면 무시 |
| `interests` | 앱의 관심 분야 목록에 있는 값만(모르는 값은 버린다) |
