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
