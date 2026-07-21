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
| 본격 운영 | `postgres` | `make up` | Postgres 볼륨 영속 + Caddy 자동 HTTPS |

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

모두 `application/json`. `/health` 외에는 `Authorization: Bearer <access>` 필요.

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | `{id,password}` → `{access_token,refresh_token,user}` |
| POST | `/api/auth/refresh` | `{refresh_token}` → `{access_token}` |
| POST | `/api/auth/logout` | 스테이트리스(200) |
| GET | `/api/auth/me` | 현재 사용자 |
| GET | `/api/cards` | 전체 카드(개인 진행 상태 포함) |
| GET | `/api/cards/today` | **3분 세션**. `?difficulty=EASY\|MEDIUM\|HARD`, `?minutes=3` |
| PATCH | `/api/cards/:id` | `{status_cd:NEW\|LEARNING\|MASTERED}` |
| GET | `/api/stats` | 학습 통계(+파생 `insights`) |
| GET | `/api/community/live` | 커뮤니티 프레즌스(+`leaderboard`/`my_rank`) |
| POST | `/api/push/register` | `{token,platform}` — 기기 Expo 푸시 토큰 등록 |
| POST | `/api/telegram/alert` | `{version:"1"\|"2"\|"3"}` — 3버전 알림 브로드캐스트(앱발) |
| POST | `/api/telegram/webhook` | 텔레그램 웹훅 수신(무인증, secret 헤더 검증) |

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
