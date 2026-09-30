# 백엔드가 만들어야 할 것 — 앱은 이미 연결돼 있다

작성 2026-09-30 · 앱 브랜치 `claude/check-f6z222`

이 문서의 모든 항목은 **앱 쪽 구현이 끝나 있다.** 서버가 라우트를 등록하고 배포하면
앱은 재배포 없이 붙는다. 서버 쪽 작업 목록이자, "배포하면 앱에서 무엇이 바뀌는가"의 설명서다.

---

## 0. 앱이 라우트를 어떻게 다루는가 (전 항목 공통)

| 서버 응답 | 앱 동작 |
|---|---|
| **404 · 501** (라우트 없음) | 그 기능만 **이 기기 안에서** 돈다. 화면에 "지금은 이 기기에만 저장돼요" 같은 안내가 뜬다. **5분마다** 서버를 다시 확인한다 |
| 0 · 502 · 503 · 504 (못 닿음) | 같은 폴백. **1분** 뒤 다시 확인 |
| 2xx | 서버 데이터를 쓰고 안내가 사라진다 |
| 그 밖의 4xx·5xx | 폴백하지 않는다. 오류를 사용자에게 그대로 보인다 |

- 규칙은 `src/data/repositories/_fallback.ts`. 지금 어떤 기능이 폴백 중인지는
  **앱 › 설정 › 개발자 모드 › 연결 상태**에 라벨별로 보인다(배포 확인에 쓰면 된다).
- **배포 전에 기기에 쌓인 것은 앱이 자동으로 올린다**(`src/data/sync/localBackfill.ts`).
  로그인할 때와 앱이 다시 앞으로 나올 때(10분 간격) 폴백으로 감싸지 않은 실서버 저장소로
  한 건씩 올리고, 올린 것만 기기에서 지운다. 그래서 아래 쓰기 경로는 **과거 시각의 글이
  한꺼번에 들어오는 것**을 받아들일 수 있어야 한다(created_at 은 서버가 받은 시각으로 두면 된다).
- 공통 형식은 [API_CONTRACT.md](./API_CONTRACT.md)의 규칙을 따른다: `/inner/api/v1` 접두사,
  Bearer 토큰, snake_case 응답, ISO 8601 날짜, `Idempotency-Key` 헤더가 있는 쓰기는
  **(사용자, 키)로 24시간 한 번만 반영**.
- 쓰기 중 "상태 설정"(좋아요·리액션·투표)은 **토글이 아니라 원하는 상태**를 보낸다.
  오프라인 큐가 재전송해도 결과가 같아야 하기 때문이다.
- 작성자 이름(`author_nm`)은 **닉네임**이다. 본명은 커뮤니티 응답에 싣지 않는다.

---

## 1. 우선순위 요약

| 순위 | 기능 | 경로 | 앱 폴백 라벨 | 지금 앱에서 보이는 모습 |
|---|---|---|---|---|
| **P0** | 고객센터 문의 | `POST /support/inquiries` | (폴백 없음) | "문의 창구가 아직 열리지 않았어요" — **법적 고지가 1차 문의 창구로 안내하는 창** |
| P1 | 진영 저장 + 대항전 집계 | `GET·POST /me/faction` · `community/live` 의 `building.*.factions` | `faction` | 대항전 자리에 "집계 준비 중" |
| P1 | 계정 설정 동기화 | `GET·POST /settings` | `settings` | 기기를 바꾸면 관심 분야·알림·**마케팅 동의**가 초기값 |
| P1 | 질문 & 답변 | `/qna/*` | `qna` | 질문이 이 기기에만 남음 |
| P2 | 자랑 피드 | `/feed/*` | `feed` | 트로피룸 피드에 내 카드만 |
| P2 | 현장 팁 | `/cards/:id/tips` · `/tips/:id/*` | `tips` | "지금은 이 기기에만 저장돼요" |
| P2 | 체감 난이도 | `/cards/:id/difficulty` | `difficulty-poll` | 분포 대신 "준비 중" |
| P2 | 알림 숨김 | `POST /notifications/dismiss` | (404 무시) | 지운 알림이 다른 기기에서는 보임 |
| P2 | 성취 알림 생성 | (서버 작업) | — | 알림함의 '성취' 종류가 비어 있음 |
| P3 | 사용자 검색·공개 프로필 | `GET /users/search` · `/users/:id/public` | `user-directory` | 목업 사용자 목록 |
| P3 | 날씨 | `GET /weather/current` | `weather` | 늘 '맑음' |
| P3 | 관심 분야를 출제에 반영 | `daily_plan.go` + 앱 `dailyPlan.ts` **동시** | — | 관심 분야가 아무 데도 쓰이지 않음 |

---

## 2. 고객센터 문의 — P0

명세: [API_CONTRACT §6-5](./API_CONTRACT.md#6-5-고객센터-문의-innerapiv1supportinquiries-️-서버-미구현).

```jsonc
// POST /inner/api/v1/support/inquiries
{ "category": "학습 오류", "email": "won@kfpa.or.kr", "message": "…",
  "app_version": "1.13.47", "build_number": 95, "platform": "android" }
// → 201 { "id": "Q-20260930-0042" }
```
- 앱은 2xx 에만 "접수되었어요"와 접수 번호를 보인다. 오프라인 큐에 태우지 않는다.
- 운영 콘솔(mybrdg)에서 목록·답변 상태를 볼 수 있어야 한다 — 신고 처리 화면 옆이 자연스럽다.
- 개인정보: 이메일·본문은 개인정보 처리방침의 수집 항목에 이미 들어 있는지 확인할 것.

## 3. 진영 — P1

### 3-1. 내 진영 저장
```jsonc
// GET  /inner/api/v1/me/faction → { "faction_cd": "frost" | "flame" | "volt" | null }
// POST /inner/api/v1/me/faction   { "faction_cd": "flame" }   (Idempotency-Key: faction:<id>)
```
- 앱(`useFactionSync`): 로그인 때 GET — 서버 값이 있으면 **서버가 정본**(기기에 덮어씀),
  없고 기기에만 있으면 POST. 진영을 바꾸면 POST.
- 진영 변경 제한(예: 월 1회)이 필요하면 서버가 409 + `message` 로 막으면 된다(앱은 문장을 그대로 보인다).

### 3-2. 대항전 집계 — `GET /inner/api/v1/community/live` 확장
```jsonc
"building": {
  "floor_size": 20000,
  "current": { "month": "2026-09", "label": "9월", "problems": 312000, "floors": 15, "winner": "",
               "factions": [ { "faction_cd": "flame", "problems": 121000 },
                             { "faction_cd": "frost", "problems": 104000 },
                             { "faction_cd": "volt",  "problems":  87000 } ] },
  "history": [ { "...": "같은 모양, 지난 달들" } ]
}
```
- 진영별 문제 수 = 그 달 `learning/complete`(또는 채점)를 **그 사용자의 진영**으로 합한 것.
- 앱은 층수를 `problems / floor_size` 로 계산하고, 층수 → 문제 수 순으로 정렬한다.
- `factions` 가 없으면 앱은 진영 순위를 **그리지 않는다**(예전에는 고정 비율 35/34/31%에 난수를
  섞어 지어냈다). `winner` 는 지금처럼 서버가 정한다.

## 4. 계정 설정 · 질문 & 답변 — P1

이미 명세가 있다. 앱 구현·폴백·백필까지 끝나 있다.
- 계정 설정: [API_CONTRACT §13](./API_CONTRACT.md) — `GET/POST /inner/api/v1/settings`.
  라우트가 생기면 기기 값이 서버로 올라간다(서버에 기록이 없으면 `200 {}` 로 답할 것).
- 질문 & 답변: [API_CONTRACT §12](./API_CONTRACT.md) — `/inner/api/v1/qna/*`.
  배포 전에 기기에 남은 **내 질문(+내 답변)** 은 앱이 `POST /qna` · `POST /qna/:id/answers` 로 옮긴다.

## 5. 자랑 피드 — P2

성취 카드는 **스냅샷(JSON)** 으로만 오간다. 이미지는 올리지 않는다 — 앱이 스냅샷으로 카드를
다시 그린다(`WrappedShareCard`). 파일 업로드·저장소가 필요 없다.

```jsonc
// GET /inner/api/v1/feed → 최신순, 최근 30일, 최대 50건
[{ "id": 7, "author_nm": "박현장",
   "snapshot": { /* AchievementSnapshot — 앱 utils/achievement.ts 그대로 */ },
   "aspect": 0.8,
   "reactions": { "clap": 3, "fire": 1, "up": 0 },
   "my_reactions": ["clap"], "mine_yn": false,
   "created_at": "2026-09-30T00:00:00.000Z" }]

// POST /inner/api/v1/feed   { "snapshot": { … }, "aspect": 0.8 }  → 위 글 하나(201)
// POST /inner/api/v1/feed/:id/reactions   { "kind": "clap"|"fire"|"up", "on": true }
//      (Idempotency-Key: feed-react:<id>:<kind>:<on>)
```
- 스냅샷은 사용자가 만든 값이다. 서버는 **숫자 범위만 절삭**하고(음수·과대값) 문자열 길이를 제한할 것.
  제목·레벨 문구를 서버가 다시 계산할 필요는 없다(자기 성취를 자랑하는 기능이다).
- 트로피룸의 '내가 올린 카드'도 이 목록의 `mine_yn` 글을 쓴다.
- 신고·숨김이 필요해지면 신고(`/reports`)와 같은 방식으로 콘솔에 붙인다.

## 6. 현장 팁 — P2

```jsonc
// GET    /inner/api/v1/cards/:cardId/tips
[{ "id": 12, "card_id": "lc001", "author_nm": "김점검", "body_txt": "측정 전 잔류전하 방전!",
   "like_cnt": 4, "liked_yn": false, "mine_yn": false, "created_at": "…" }]
// POST   /inner/api/v1/cards/:cardId/tips      { "body": "…" }  → 팁 하나(201) · 140자 이내
// POST   /inner/api/v1/tips/:id/like           { "liked": true } (Idempotency-Key: tip-like:<id>:<liked>)
// DELETE /inner/api/v1/tips/:id                 내 팁만(남의 팁이면 403)
```
- 정렬은 앱이 한다(공감 많은 순 → 최근 순). 서버는 최신순이면 된다.
- 운영 콘솔에서 팁을 숨길 수 있어야 한다(현장 노하우가 틀릴 수 있다 — 안전 교육 앱이다).

## 7. 체감 난이도 — P2

```jsonc
// GET  /inner/api/v1/cards/:cardId/difficulty → { "easy": 4, "normal": 10, "hard": 2, "mine": "normal" | null }
// POST /inner/api/v1/cards/:cardId/difficulty   { "vote": "easy"|"normal"|"hard" }
//      (Idempotency-Key: diff:<cardId>:<vote>) — 다시 투표하면 바뀐다(사람당 한 표)
```
- 학습 화면(넘기기 직전 질문)과 카드 상세가 같은 경로로 보낸다.
- 이 값은 **출제 난이도 보정**에 쓸 수 있다(`daily_plan.go`). 문제 원본의 난이도와 체감이 크게
  어긋나는 카드는 콘솔에 표시해 검수 대상으로 올리면 좋다.

## 8. 알림 — P2

### 8-1. 숨김
```jsonc
// POST /inner/api/v1/notifications/dismiss   { "ids": ["n1", "n2"] }   (Idempotency-Key: notif-dismiss:<ids>)
```
- 그 사용자의 `GET /notifications` 에서 제외한다. 404 인 동안 앱은 기기에서만 걸러 낸다.
- 배포 후 첫 실행에서 앱이 그동안 지운 id 를 한꺼번에(최대 300개) 보낸다.

### 8-2. 성취 알림 생성 (서버 작업)
알림함에는 '성취' 종류가 있고 사용자가 켜고 끌 수 있는데, **그 알림을 만드는 주체가 없다**
(지금 알림을 만드는 것은 콘솔의 공지 발송뿐이다). 앱이 기대하는 기준:
- 연속 학습 **5일**(평일 기준 — 주말 제외) 달성 시
- 누적 학습 카드 **50장 단위**(50·100·150…) 달성 시

`type_cd: "ACHIEVEMENT"` 로 `notifications` 에 넣고, 푸시 토큰이 있으면 푸시도 보낸다
(`push/register` 는 이미 동작한다). 같은 달성은 한 번만.

알림함의 '성취 알림 끄기 / 공지 알림 끄기'는 지금 **이 기기 화면에서만** 숨긴다
(`notificationStore.mutedTypes`). 푸시까지 막으려면 이 선택을 계정 설정에 실어 서버가
보내기 전에 걸러야 한다 — 서버 푸시를 켜는 시점에 계정 설정 계약(§13)에 `muted_types` 를 더하자.

## 9. 사용자 검색 · 공개 프로필 — P3

```jsonc
// GET /inner/api/v1/users/search?q=닉네임   → [{ "id": "…", "nickname": "…", "org": "…" }]
// GET /inner/api/v1/users/:id/public       → 공개 범위 적용 프로필 또는 null
{ "id": "…", "nickname": "…", "org": "…", "job_title": "…", "bio": "…",
  "progress": { "total_learned": 120, "mastery_pct": 40 },   // 공개 안 함이면 빼고 보낸다
  "streak_days": 12, "emblems": [{ "label": "전기 안전", "emoji": "⚡", "level": 2 }],
  "collection_count": 37 }
```
- 공개 범위는 계정 설정(`profile_visibility`)을 따른다. **꺼진 항목은 필드째 빼고** 보낸다
  (앱은 없는 필드를 '비공개'로 그린다).

## 10. 날씨 — P3

```jsonc
// GET /inner/api/v1/weather/current → { "condition": "clear"|"clouds"|"rain"|"snow"|"thunderstorm"|"mist",
//                                        "temperature_c": 21.5, "wind_speed_ms": 3.2, "observed_at": "…" }
```
- OpenWeather 원본을 그대로 프록시해도 앱이 정규화한다(`WeatherRepository`). 위치는 사업장 기준이면 충분하다.
- API 키는 서버에만 둔다(앱 번들에 넣지 않는다).

## 11. 관심 분야를 출제에 반영 — P3 (앱·서버 동시 작업)

관심 분야(설비·시설 12종)는 계정 설정으로 저장·동기화되지만 **어디서도 쓰이지 않는다.**
카드 대분류와 대응표가 없기 때문이다. 제안하는 대응(서버 문제 분류 코드 기준):

| 관심 분야 | 서버 분류 |
|---|---|
| 전기시설 | ELEC, BATTERY |
| 위험물시설 · 가스시설 | HAZMAT |
| 공정설비 | PROCESS |
| 피난시설 | EGRESS |
| 제연시설 | SPREAD |
| 소화설비 · 경보설비 · 화기시설 · 연소시설 | FIRE |
| 안전관리 · 기타설비 | ETC |

⚠️ 오늘의 출제 규칙은 **서버(`daily_plan.go`)와 앱(`src/domain/dailyPlan.ts`, 오프라인용)에
같은 내용으로** 있다(ARCHITECTURE.md). 한쪽만 바꾸면 온라인·오프라인에서 다른 문제가 나간다.
그래서 앱은 이 부분을 혼자 바꾸지 않았다 — 서버 쪽 방식(예: 신규 카드 선택 시 관심 분류 가중치)이
정해지면 두 파일을 한 번에 고친다.

---

## 12. 정리 후보 (서버와 함께 결정)

| 항목 | 상태 |
|---|---|
| 계정 설정의 `review_alerts` · `weekly_report` · `in_app` · `email` | 앱에 UI·소비처가 없다. 주고받기만 한다. 쓸 계획이 없으면 계약에서 빼자 |
| 도감 동기화의 `redeemed_codes` | 이벤트 쿠폰을 앱에서 걷어 냈다(코드 표가 번들에 노출). 이미 교환한 기록 보존용으로만 주고받는다 |
| `flex_prompt_yn` | 학습 완료 자랑 CTA 가 꺼져 있어 설정 스위치를 뗐다. 값은 계속 동기화된다 |

## 13. 배포 후 확인 순서

1. 앱 › 설정 › 개발자 모드 › **연결 상태**에서 해당 라벨이 사라졌는지 본다(최대 5분, 앱을 다시 열면 즉시).
2. 배포 전에 기기에 남긴 글·팁·질문이 서버 목록에 올라왔는지 본다(로그인 또는 앱 복귀 때 옮겨진다).
3. 다른 기기로 같은 계정에 로그인해 같은 내용이 보이는지 본다.
