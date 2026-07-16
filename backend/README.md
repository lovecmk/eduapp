# eduapp 백엔드 (Go Fiber + MongoDB)

현장 안전학습 앱(Expo)의 백엔드. 프런트엔드의 데이터 계약(`src/data/dto/*`,
`src/data/repositories/*`)과 1:1로 일치하는 REST API 를 제공한다.

## 위치 결정 — 왜 레포 안(`/backend`) 인가

프런트(Expo/RN)와 **한 저장소, 별도 Go 모듈**로 둔다(모노레포).
- 프런트 DTO 계약과 API 응답을 같은 PR에서 함께 바꿔 **드리프트를 막는다.**
- Go 모듈은 완전히 독립적이라(자체 `go.mod`), 언제든 이 디렉토리만 떼어
  별도 저장소/서버로 **이식**할 수 있다(아래 "이식성" 참고).

## 아키텍처 (포트–어댑터 / 클린 아키텍처)

```
handler(HTTP·Fiber) → service(유스케이스) → ports(인터페이스) ← mongo | memory (어댑터)
                                          └ domain(순수 모델, 인프라 무의존)
```

| 레이어 | 패키지 | 책임 |
|--------|--------|------|
| domain | `internal/domain` | 순수 비즈니스 모델(카드·유저·진행). 인프라 import 없음 |
| ports | `internal/ports` | 저장소 인터페이스. 서비스는 이것에만 의존 |
| service | `internal/service` | 3분 세션 패킹·난이도 규칙·통계·인증 등 유스케이스 |
| adapters | `internal/mongo`, `internal/memory` | ports 구현(교체 가능) |
| handler | `internal/handler` | HTTP ↔ DTO(snake_case) 변환 |
| infra | `internal/server`,`middleware`,`token`,`config`,`seed` | Fiber 조립·JWT·설정·시드 |

**이식성**: 서비스가 `ports` 인터페이스에만 의존하므로 저장소를 Mongo →
Postgres/메모리 등으로 바꿔도 서비스·핸들러 코드는 그대로다. 모든 외부 주소·비밀은
환경변수로만 주입된다(`internal/config`). 다른 호스트/클라우드로 옮길 때
`.env` 만 바꾸면 된다.

## 실행

```bash
# 1) DB까지 원클릭 (권장)
docker compose up --build          # API :8080, Mongo :27017

# 2) 로컬 Go + 로컬 Mongo
cp .env.example .env
go run ./cmd/server

# 3) DB 없이 스모크 테스트(인메모리)
STORE=memory go run ./cmd/server
```

부팅 시 `SEED_ON_START=true` 면 카드 61장과 데모 계정을 자동 주입한다.
데모 로그인: **id `demo` / pw `demo1234`**.

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
| GET | `/api/stats` | 학습 통계 |
| GET | `/api/community/live` | 커뮤니티 프레즌스 |

### 3분 학습 세션 규칙 (`GET /api/cards/today`)

난이도 3단계(EASY/MEDIUM/HARD) 카드에서 개인에게 **약 3분(180초) 분량**을 구성한다.
1. `mastered` 제외 → 2. 복습 예정(due) 카드를 오래된 순으로 우선 →
3. 신규 카드를 쉬운 난이도부터 → 4. 카드별 `study_seconds` 합이 목표(기본 180초)에
도달하면 정지(최소 1장 보장). 목표 시간은 `STUDY_SESSION_SEC` 로 조정한다.

## 테스트

```bash
go test ./...   # 인메모리 저장소로 라우팅·인증·세션·DTO 엔드투엔드 검증
```

## 프런트 연동

프런트 `.env` 에 API 주소를 지정하면 목업 대신 실서버를 쓴다:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
EXPO_PUBLIC_USE_MOCK_DATA=false
```
