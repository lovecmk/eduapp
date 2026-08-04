# eduapp 백엔드 (Go Fiber + PostgreSQL)

현장 안전학습 앱(Expo)의 백엔드. 프런트엔드의 데이터 계약(`src/data/dto/*`,
`src/data/repositories/*`)과 1:1로 일치하는 REST API 를 제공한다.

## 위치 결정 — 왜 레포 안(`/backend`) 인가

프런트(Expo/RN)와 **한 저장소, 별도 Go 모듈**로 둔다(모노레포).
- 프런트 DTO 계약과 API 응답을 같은 PR에서 함께 바꿔 **드리프트를 막는다.**
- Go 모듈은 완전히 독립적이라(자체 `go.mod`), 언제든 이 디렉토리만 떼어
  별도 저장소/서버로 **이식**할 수 있다(아래 "이식성" 참고).

## 아키텍처 (포트–어댑터 / 클린 아키텍처)

```
handler(HTTP·Fiber) → service(유스케이스) → ports(인터페이스) ← postgres | memory | mongo (어댑터)
                                          └ domain(순수 모델, 인프라 무의존)
```

| 레이어 | 패키지 | 책임 |
|--------|--------|------|
| domain | `internal/domain` | 순수 비즈니스 모델(카드·유저·진행). 인프라 import 없음 |
| ports | `internal/ports` | 저장소 인터페이스. 서비스는 이것에만 의존 |
| service | `internal/service` | 3분 세션 패킹·난이도 규칙·통계·인증 등 유스케이스 |
| adapters | `internal/postgres`, `internal/memory`, `internal/mongo` | ports 구현(`STORE` 로 교체) |
| handler | `internal/handler` | HTTP ↔ DTO(snake_case) 변환 |
| infra | `internal/server`,`middleware`,`token`,`config`,`seed` | Fiber 조립·JWT·설정·시드 |

**이식성**: 서비스가 `ports` 인터페이스에만 의존하므로 저장소를 `STORE` 값
(`postgres`/`memory`/`mongo`)만으로 바꿔도 서비스·핸들러 코드는 그대로다.
모든 외부 주소·비밀은 환경변수로만 주입된다(`internal/config`). 다른
호스트/클라우드로 옮길 때 `.env` 교체 + DB 덤프 복원이면 끝이다(아래 "배포 & 이식").

## 실행

`make help` 로 전체 명령을 볼 수 있다. 자주 쓰는 것:

```bash
# 1) 로컬 개발 — DB 없이 즉시 (STORE=memory, 재시작 시 초기화)
make run                 # == STORE=memory go run ./cmd/server

# 2) 도커: 테스트 스택(무 DB) 원클릭 — "테스트로 올려보기"
make up-test             # docker compose --profile test up --build → API :8080

# 3) 도커: 운영 스택(Postgres 영속 + 자동 HTTPS)
cp .env.example .env     # JWT_SECRET(make secret)·POSTGRES_PASSWORD·DOMAIN 채우기
make up                  # docker compose --profile prod up -d → Caddy→API→Postgres
```

부팅 시 `SEED_ON_START=true` 면 카드 61장과 데모 계정을 자동 주입한다.
데모 로그인: **id `demo` / pw `demo1234`**.
`STORE=postgres` 는 접속 후 임베드 스키마(`internal/postgres/schema.sql`)를
멱등 적용하므로 빈 DB 에 바로 붙여도 된다.

## 배포 & 이식

호스트가 아직 미정이어도(사내/외부 Ubuntu 무관) **같은 명령**으로 돈다 —
설정만 `.env` 로 다르다. 단계별 전략:

| 단계 | 저장소 | 명령 | 특징 |
|------|--------|------|------|
| 테스트로 올려보기 | `memory` | `make up-test` | DB 0대·무설정. 재시작 시 리셋(데모에 이상적) |
| 본격 운영(API 전용) | `postgres` | `make up` | Postgres 볼륨 영속 + Caddy 자동 HTTPS |
| 올인원(웹앱+API) | `postgres` | `make up-web` | 위 + Caddy 가 `dist`(Expo 웹) 정적 제공 + `/api` 프록시 |

> **Ubuntu KVM/VM 한 대에 올리는 실전 절차**(VM 생성·네트워크·부팅 자동기동 포함)는
> **[`DEPLOY-KVM.md`](./DEPLOY-KVM.md)** 참고. 올인원 배포에 필요한 웹 빌드 방법도 거기 있다.

**보안(외부 노출 대비, 내부 배포에도 권장)**
- `make secret` 로 `JWT_SECRET` 생성해 `.env` 에 넣는다. 기본 취약값으로 운영
  스토어를 켜면 부팅 로그가 경고한다.
- `POSTGRES_PASSWORD` 를 강한 값으로. 도메인 확정 후 `CORS_ORIGINS` 를 앱
  오리진으로 좁힌다.
- `DOMAIN=api.example.com` 을 주면 Caddy 가 Let's Encrypt 인증서를 자동 발급.
  비우면 `:80` 평문(사내망용).

**백업 & 다른 호스트로 이식**
```bash
make backup                        # ./backups/eduapp-YYYYmmdd-HHMMSS.sql.gz
# (권장) 호스트 crontab 에 나이틀리 등록 — scripts/backup.sh 주석 참고

# 새 호스트: 코드 clone → .env 복사 → make up → 덤프 복원
gunzip -c eduapp-XXXX.sql.gz | docker compose --profile prod exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
Postgres 는 관리형(RDS·Cloud SQL·Supabase·Neon)으로 옮겨도 `DATABASE_URL` 만
바꾸면 되므로, 규모가 커지면 DB 를 외부로 분리하고 API 컨테이너는 그대로 둔다.

## 스키마 진화(마이그레이션)

현재는 `internal/postgres/schema.sql` 을 부팅 시 멱등 적용한다(`CREATE ... IF NOT
EXISTS`) — 신규 배포에 충분하다. 컬럼 변경/데이터 이관이 필요해지면
`goose`/`golang-migrate` 로 버전 관리 마이그레이션을 도입한다(포트-어댑터 구조라
서비스 코드 영향 없음).

## API

모두 `application/json`. 헬스체크 외에는 `Authorization: Bearer <access>` 필요.

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health`, `/api/health` | 무인증. `{status,version,store,uptime_seconds}` |
| GET | `/api/config` | 무인증. 점검 모드·공지 배너·하루 상한 등 앱이 부팅 때 읽는 공개 설정 |
| POST | `/api/auth/login` | `{id,password}` → `{access_token,refresh_token,user}` |
| POST | `/api/auth/refresh` | `{refresh_token}` → `{access_token}` |
| POST | `/api/auth/logout` | 스테이트리스(200) |
| GET | `/api/auth/me` | 현재 사용자 |
| GET | `/api/cards` | 전체 카드(개인 진행 상태 포함) |
| GET | `/api/cards/today` | **3분 세션**. `?difficulty=EASY\|MEDIUM\|HARD`, `?minutes=3` |
| PATCH | `/api/cards/:id` | `{status_cd:NEW\|LEARNING\|MASTERED}` |
| GET | `/api/stats` | 학습 통계(+파생 `insights`) |
| GET | `/api/learning/quota` | 오늘 남은 신규 학습 수 `{limit,used,remaining,resets_at}` |
| POST | `/api/learning/complete` | `{count}` — 새로 배운 수 보고(멱등키 필수) |
| GET | `/api/community/live` | 커뮤니티 프레즌스(+`leaderboard`/`my_rank`) |
| POST | `/api/push/register` | `{token,platform}` — 기기 Expo 푸시 토큰 등록 |
| POST | `/api/telegram/alert` | `{version:"1"\|"2"\|"3"}` — 3버전 알림 브로드캐스트(앱발) |
| POST | `/api/telegram/webhook` | 텔레그램 웹훅 수신(무인증, secret 헤더 검증) |

### 관리 API (`/api/admin/*`)

전부 **RequireAuth → RequireAdmin** 두 겹 뒤에 있다. 그룹에 걸어 두므로 나중에
추가되는 라우트도 자동으로 보호된다 — 라우트를 하나씩 감싸는 방식은 새 엔드포인트에서
빠뜨리기 쉽다. `Admin`/`Users` 의존성이 하나라도 비면 라우트를 **아예 등록하지 않아**,
배선 실수로 무방비 관리 API 가 열리는 일이 없다.

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/admin/dashboard` | 첫 화면 집계 한 번에(+`ops` 운영 설정) |
| GET | `/api/admin/status`·`/metrics`·`/stream` | 서비스 상태 · 지표 · 실시간(SSE) |
| GET/PATCH | `/api/admin/users…` | 목록·상세·권한·상태 |
| GET/POST/PUT/DELETE | `/api/admin/cards…` | 문제 CRUD(낙관적 동시성) |
| GET | `/api/admin/reports` | `?status=OPEN\|DOING\|RESOLVED\|REJECTED`, `?card_id=` |
| PATCH | `/api/admin/reports/:id` | `{status_cd,resolution_txt}` — 신고 처리 |
| GET/POST | `/api/admin/announcements` | 발송 이력 · 공지 발송 |
| GET | `/api/admin/announcements/audience` | `?audience_cd=&audience_value=` 대상 규모 미리보기 |
| GET | `/api/admin/orgs` | 존재하는 소속 조직 목록(대상 고르기용) |
| GET/PUT | `/api/admin/settings` | 운영 설정 조회·변경 |
| GET | `/api/admin/audit` | 관리 행위 이력 |
| GET/POST | `/api/admin/insight…` | 분석(저장소가 집계 읽기를 지원할 때만 등록) |

### 신고 처리 단계

신고는 접수만 되고 **끝나지 않았다**. 상태가 없으니 목록은 접수된 순간부터 영원히
같은 모습이고, 대시보드의 '신고 N건'은 처리해도 줄지 않는다. 줄지 않는 경고는 며칠이면
아무도 보지 않는 경고가 된다.

`OPEN`(접수) → `DOING`(확인 중) → `RESOLVED`(처리 완료) / `REJECTED`(반려).
빈 값은 `OPEN` 으로 읽는다(상태가 없던 시절의 데이터 호환) — 판독은 언제나
"아직 손이 필요하다" 쪽으로 안전하게 기운다. **반려에는 사유가 필수**다.
근거 없는 반려는 같은 신고가 다시 올라왔을 때 앞사람의 판단을 되짚을 수 없게 만든다.

대시보드가 세는 것은 `OPEN + DOING` 이고, 그 숫자는 저장소가 `GROUP BY` 로 센다 —
목록을 세면 상한(100건)에 걸린 순간 500건이 100건으로 보인다.

### 운영 설정 (`ops_settings`)

재배포 없이 지금 당장 바꿔야 하는 값들이다. 환경변수로 두면 바꾸는 데 재기동이
필요하고, 재기동은 현장에서 학습 중인 사용자의 세션을 끊는다. 게다가 **누가 언제
바꿨는지가 남지 않는다**(감사 기록은 저장소를 거치는 변경에만 붙는다).

| 값 | 효과 |
|---|---|
| `maintenance_yn` + `maintenance_msg` | 일반 사용자의 모든 요청을 **503** 으로 막는다 |
| `signup_enabled` | 회원가입만 막는다(기존 사용자는 그대로) |
| `daily_new_limit` | 하루 신규 학습 상한(`/api/learning/quota` 가 읽는다) |
| `notice_txt` + `notice_level` | 앱 상단 공지 배너 |

**변경은 보낸 필드만 반영한다.** `PUT /api/admin/settings` 의 본문은 전부 포인터라
"보내지 않음"과 "false 로 바꿈"이 구분된다 — 값 타입이면 공지 문구 하나를 고치는
요청에 나머지가 `false`/`0` 으로 실려, 문구를 바꾸는 순간 점검 모드가 꺼진다.

읽기는 **5초 TTL 캐시**를 거친다. 점검 모드는 모든 요청이 확인해야 하는데 매번
저장소를 왕복하면 설정 하나 때문에 전체 API 의 지연이 늘고, 저장소가 흔들릴 때
서비스가 함께 흔들린다. 조회에 실패하면 **마지막으로 알던 값**을 쓴다(fail-open) —
설정은 서비스의 전제 조건이 아니라 조절 손잡이다.

#### 점검 모드가 통과시키는 것

라우팅 **앞**에 서 있어서 새로 추가되는 경로도 기본으로 막힌다. 예외는 네 가지뿐이고
전부 `middleware.Maintenance` 한 곳에 모여 있다.

- **관리자** — 토큰을 직접 파싱해 확인한다. 이 예외가 없으면 점검 모드를 켠 순간
  그것을 끌 방법이 사라진다.
- `/api/auth/*` — 관리자가 로그인해서 들어와야 한다.
- `/api/admin*` — 관리 API 자체가 `RequireAdmin` 으로 막혀 있으므로 여는 것이 안전하다.
- `/health`, `/api/health`, `/api/config` — 점검 중임을 **알리는** 경로다.
  이것까지 막으면 앱은 "왜 안 되는지"를 표시하지 못하고 그냥 고장난 것처럼 보인다.

### 공지 — 대상 지정과 발송 이력

공지는 되돌릴 수 없다. 그래서 두 가지를 갖춘다.

- **보내기 전** — `GET /api/admin/announcements/audience` 가 몇 명에게 가는지 센다.
  세는 코드가 실제 발송 대상을 고르는 코드와 같아야 "미리보기 12명, 실제 40명" 같은
  어긋남이 생기지 않는다(그래서 화면이 아니라 서버가 센다).
- **보낸 뒤** — `announcements` 테이블에 무엇을·언제·누구에게·몇 명에게 보냈는지 남는다.
  감사 로그에도 한 줄이 남지만 그쪽은 관리 행위 전체가 섞이는 흐름이라 공지만
  훑어보기 어렵고 대상·수신자 수 같은 구조를 잃는다.

대상은 `ALL`(활성 전원) · `ROLE` · `MEMBERSHIP` · `ORG` · `USER` 다. 조직은 **완전 일치**로
거른다 — 부분 일치면 "영업1팀" 선택이 "영업1팀지원"까지 잡아 엉뚱한 사람에게 간다.
정지·삭제된 계정은 대상에서 빠지고(들어올 수 없는 사람에게 보내 봐야 저장소만 채운다),
`notifyMaxRecipients`(5000명)를 넘으면 **조용히 일부만 보내지 않고** 거절한다.

`push_yn` 을 켜면 앱 안 알림과 함께 기기 푸시로도 나간다. 기본이 꺼짐인 것은
의도적이다 — 앱 안 알림은 사용자가 열 때 보지만 푸시는 자는 사람도 깨운다.
푸시 발송이 실패해도 공지는 되돌리지 않는다. 여기서 오류를 던지면 관리자는 실패로
알고 다시 보내고, 그러면 앱 안에는 같은 공지가 두 번 쌓인다.

### 하루 학습 상한

`/api/learning/quota` 와 `/api/learning/complete` 는 앱이 오래 전부터 부르던 경로인데
서버에는 없었다. 앱의 저장소는 404 를 만나면 '아직 배포되지 않음'으로 판단해 목업으로
떨어지므로, 상한은 기기 로컬 값으로만 돌아갔다 — 앱을 지우면 초기화되고, 같은 사람이
태블릿과 휴대폰으로 각각 상한을 채울 수 있었으며, **관리자가 콘솔에서 상한을 바꿔도
아무 일도 일어나지 않았다.**

보고는 '설정'이 아니라 **더하기**다. 오프라인 큐가 여러 건을 모아 두었다가 한꺼번에
보내는 일이 흔해서, 마지막 보고로 덮어쓰면 그 사이의 학습이 사라진다. 중복 전송은
멱등 미들웨어가 막는다. 상한을 넘겼다고 기록을 **거부하지는 않는다** — 앱은 이미
학습을 마친 뒤에 보고하고(사용자에게는 끝난 일이다), 거절하면 그 기록만 사라져
화면과 서버가 어긋난다. 상한은 '다음 학습을 열어 줄지'를 정하는 값이지 기록을
버리는 규칙이 아니다.

### 헬스체크 두 경로

같은 응답을 `/health` 와 `/api/health` 두 곳에 낸다. 앞은 로드밸런서·Docker
healthcheck 의 관례적 경로이고, 뒤는 **앱이 부르는 경로**다 — 앱은 API 주소 하나만
알고 모든 요청에 `/api` 접두사를 붙이므로, 이 경로가 없으면 개발자 화면의 서버
점검이 배포가 멀쩡해도 404 로 실패한다. `version` 은 `APP_VERSION` 환경변수로
주입한다(미설정 시 `dev`) — "지금 붙은 서버가 어느 빌드인가"를 앱에서 확인할 수 있다.

### 계정 상태(A/I/D) 집행

관리 콘솔의 **정지(I)·삭제(D)** 는 저장만으로는 아무 효과가 없다. 세 길목에서 막는다.

| 길목 | 동작 |
|------|------|
| `POST /api/auth/login` | 비밀번호가 맞아도 **403** — 재로그인 불가 |
| `POST /api/auth/refresh` | **403** — 세션 연장 불가 |
| `GET /api/auth/me` | **403** — 앱 부팅 시 세션 복구 불가 |
| `/api/*` (인증 필요 전체) | **403** — 살아 있는 액세스 토큰도 통과 못 함 |

마지막 줄이 `middleware.AccountGate` 다. 액세스 토큰은 스테이트리스라 발급된 것을
회수할 수 없어서, 갱신만 막으면 정지된 사람이 토큰 만료(`ACCESS_TTL`, 기본 15분)까지
학습을 계속한다. 그렇다고 요청마다 저장소를 왕복하면 학습 화면처럼 호출이 잦은 경로가
느려진다. 그래서 계정 상태만 **15초 TTL 로 캐시**해 두고 본다 — 조회 비용은 거의 그대로,
반영 지연은 분에서 초로 줄어든다.

정지 반영이 늦어지는 최대 시간 = `accountCacheTTL`(15초). 저장소 조회가 실패하면
**통과시킨다**(fail-open) — DB 가 잠깐 흔들렸다고 로그인한 사용자 전원을 쫓아내는 쪽이
정지 반영이 몇 초 늦는 것보다 훨씬 나쁘다.

### 원격 푸시(Expo Push) — "실제 모바일 알림"

앱이 `/api/push/register` 로 기기 토큰을 등록하면, 서버·텔레그램 명령이
`PushService.Broadcast` 로 **등록된 모든 기기에 동시에** 알림을 보낸다.
발송은 Expo Push 게이트웨이(`EXPO_PUSH_URL`, 기본 `exp.host`)를 100건씩 나눠
호출하고, 무효(`DeviceNotRegistered`) 토큰은 자동 정리한다. 등록 기기가 0대면
네트워크 호출 없이 즉시 반환한다.

### 텔레그램 제어 (추후 API 키 주입)

`TELEGRAM_BOT_TOKEN` 을 채우면 부팅 시 자동으로 long-polling 이 시작된다.
토큰이 비어 있으면 텔레그램 연동은 **완전 비활성**(다른 기능에 영향 없음).

봇 명령:

| 명령 | 동작 |
|------|------|
| `/alert1` `/alert2` `/alert3` | 3가지 알림 버전 중 하나를 전체 기기로 발송 |
| `/alert 1 2 3` | 여러 버전을 순서대로 발송 |
| `/alertall` | 3가지 알림을 모두 발송 |
| `/status` | 현재 알림 수신 기기 수 확인 |
| `/help`, `/start` | 사용 가능한 명령 안내 |

`TELEGRAM_ALLOWED_CHATS`(콤마 구분 chat_id) 로 명령 실행을 허용할 채팅을
제한할 수 있다(비우면 전체 허용). 웹훅 방식을 쓰려면 `TELEGRAM_POLL=false` 로
두고 `/api/telegram/webhook` 에 텔레그램 `setWebhook` 을 연결한다.

### 3분 학습 세션 규칙 (`GET /api/cards/today`)

난이도 3단계(EASY/MEDIUM/HARD) 카드에서 개인에게 **약 3분(180초) 분량**을 구성한다.
1. `mastered` 제외 → 2. 복습 예정(due) 카드를 오래된 순으로 우선 →
3. 신규 카드를 쉬운 난이도부터 → 4. 카드별 `study_seconds` 합이 목표(기본 180초)에
도달하면 정지(최소 1장 보장). 목표 시간은 `STUDY_SESSION_SEC` 로 조정한다.

## 테스트

```bash
make test       # == go test ./...  인메모리 저장소로 라우팅·인증·세션·DTO 검증

# 실제 Postgres 대상 통합 스모크(저장소 왕복·업서트·text[]·nullable 검증)
DATABASE_URL_TEST=postgres://eduapp@localhost:5432/eduapp?sslmode=disable make test-pg
```

`internal/postgres/smoke_test.go` 는 `DATABASE_URL_TEST` 가 없으면 자동 스킵되므로
일반 CI/무DB 환경에서도 안전하다.

## 프런트 연동

프런트 `.env` 에 API 주소를 지정하면 목업 대신 실서버를 쓴다:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
EXPO_PUBLIC_USE_MOCK_DATA=false
```
