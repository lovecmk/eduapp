# eduapp 백엔드 — 자주 쓰는 작업을 한 줄 명령으로. (작업시간 단축용)
#
#   make help          # 명령 목록
#   make run           # 로컬 개발(무 DB, STORE=memory) — go run
#   make test          # 단위 테스트
#   make test-pg       # 실제 Postgres 대상 통합 스모크(DATABASE_URL_TEST 필요)
#   make secret        # JWT_SECRET 용 랜덤 키 생성
#   make up-test       # 도커: 테스트 스택(무 DB) 기동
#   make up            # 도커: 운영 스택(Postgres+API+Caddy) 백그라운드 기동
#   make up-web        # 도커: 올인원(웹앱+API) — Caddy 가 dist 정적 제공 + /api 프록시
#   make down          # 도커: 스택 중지
#   make logs          # 도커: 로그 팔로우
#   make backup        # 운영 DB 백업(./backups)
#   make psql          # 운영 DB 콘솔
#   make fmt vet       # 정적 점검

.DEFAULT_GOAL := help
COMPOSE ?= docker compose

.PHONY: help run test test-pg secret up-test up up-web down logs backup psql fmt vet build

help:
	@grep -E '^#   make ' $(MAKEFILE_LIST) | sed 's/^#   /  /'

run:
	STORE=memory JWT_SECRET=dev-secret go run ./cmd/server

build:
	CGO_ENABLED=0 go build -o ./bin/server ./cmd/server

test:
	go test ./...

test-pg:
	@test -n "$$DATABASE_URL_TEST" || { echo "DATABASE_URL_TEST 를 설정하세요 (예: postgres://eduapp@localhost:5432/eduapp?sslmode=disable)"; exit 1; }
	go test ./internal/postgres/ -run TestPostgresAdapterSmoke -v

secret:
	@sh ./scripts/gen-secret.sh

up-test:
	$(COMPOSE) --profile test up --build

up:
	$(COMPOSE) --profile prod up -d --build

# 올인원(웹앱+API): 먼저 레포 루트에서 웹을 빌드해 dist 를 만들어 둔다(backend/DEPLOY-KVM.md).
up-web:
	CADDYFILE=Caddyfile.web $(COMPOSE) --profile prod up -d --build

down:
	$(COMPOSE) --profile prod --profile test down

logs:
	$(COMPOSE) --profile prod logs -f

backup:
	@sh ./scripts/backup.sh

psql:
	$(COMPOSE) --profile prod exec postgres psql -U $${POSTGRES_USER:-eduapp} -d $${POSTGRES_DB:-eduapp}

fmt:
	gofmt -w .

vet:
	go vet ./...
