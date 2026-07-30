# eduapp 백엔드 — 자주 쓰는 작업을 한 줄 명령으로. (작업시간 단축용)
#
#   make help          # 명령 목록
#   make dev           # 관리 콘솔까지 볼 때 — 무 DB + 관리자 계정 자동 생성
#   make demo-data     # 데모 학습 기록 심기(콘솔 화면 확인용, 서버가 떠 있어야 함)
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

.PHONY: help run dev demo-data test test-pg secret up-test up up-web down logs backup psql fmt vet build

# 관리자 아이디·비밀번호는 덮어쓸 수 있다: make dev ADMIN_PW='...'
ADMIN_ID ?= admin
ADMIN_PW ?= admin1234!

help:
	@grep -E '^#   make ' $(MAKEFILE_LIST) | sed 's/^#   /  /'

run:
	STORE=memory JWT_SECRET=dev-secret go run ./cmd/server

# make run 과 다른 점은 하나다: **관리자 계정을 만들어 준다.**
# 이것이 없으면 서버는 뜨지만 관리 콘솔에 로그인할 계정이 없어서
# "아이디 또는 비밀번호가 올바르지 않습니다"만 보게 된다.
dev:
	@echo "관리 콘솔 로그인: $(ADMIN_ID) / $(ADMIN_PW)"
	@echo "콘솔은 다른 터미널에서: cd ../admin && npm install && npm run dev"
	STORE=memory JWT_SECRET=dev-secret SEED_ON_START=true \
		ADMIN_LOGIN_ID=$(ADMIN_ID) ADMIN_PASSWORD='$(ADMIN_PW)' \
		go run ./cmd/server

# 데모 학습 기록 — 갓 띄운 서버는 기록이 없어서 관리 콘솔의 그림이 비어 있다.
# 비교 대상이 있어야 '다른 직원보다 못함' 같은 판정이 나온다.
demo-data:
	ADMIN_ID=$(ADMIN_ID) ADMIN_PW='$(ADMIN_PW)' node ./scripts/demo-data.mjs

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
