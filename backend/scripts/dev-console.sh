#!/bin/sh
#
# 백엔드 + 관리 콘솔을 한 번에 띄운다.
#
# ── 왜 이 스크립트가 있는가 ────────────────────────────────────────────────
# 관리 콘솔을 보려면 네 가지가 순서대로 맞아야 한다:
#   ① 백엔드가 뜬다  ② 관리자 계정이 있다  ③ 볼 데이터가 있다  ④ 콘솔이 뜬다
# 터미널 세 개를 열어 순서를 지키는 일은 매번 하기에 번거롭고, 한 단계라도
# 빠뜨리면 화면에는 "로그인 실패" 나 "기록이 아직 없습니다" 만 남는다.
# 그때 원인은 화면에 안 나오고 서버 로그에 있다.
#
# 여기서는 넷을 한 줄로 묶고, **다음 단계로 넘어가기 전에 앞 단계가 실제로
# 됐는지 확인한다.** 확인 없이 이어 붙이면 결국 같은 문제가 조용히 반복된다.
#
# 실행:  cd backend && make console
# 종료:  Ctrl+C  (백엔드까지 함께 내려간다 — 유령 프로세스가 포트를 잡고 있으면
#                다음 실행이 이유 없이 실패한다)

set -eu

API_PORT="${PORT:-8080}"
WEB_PORT="${WEB_PORT:-5173}"
ADMIN_ID="${ADMIN_ID:-admin}"
ADMIN_PW="${ADMIN_PW:-admin1234!}"
BASE="http://localhost:${API_PORT}"

BACKEND_DIR=$(cd "$(dirname "$0")/.." && pwd)
ADMIN_DIR=$(cd "$BACKEND_DIR/../admin" && pwd)
LOG="${TMPDIR:-/tmp}/eduapp-backend.log"
BIN="${TMPDIR:-/tmp}/eduapp-dev-server"

say() { printf '\033[36m▸\033[0m %s\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v go >/dev/null 2>&1 || die "go 가 없습니다. https://go.dev/dl 에서 설치하세요."
command -v node >/dev/null 2>&1 || die "node 가 없습니다. https://nodejs.org 에서 설치하세요(20 이상)."

# 이미 쓰고 있는 포트에 또 띄우면 '떴는데 옛 서버가 응답하는' 상태가 된다 —
# 코드를 고쳐도 화면이 안 바뀌어서 원인을 찾는 데 한참 걸린다.
if curl -fsS "$BASE/api/health" >/dev/null 2>&1; then
  die "$API_PORT 포트에 이미 무언가 떠 있습니다. 그것을 끄거나 PORT=8081 로 실행하세요."
fi

# ── 종료 정리 ──────────────────────────────────────────────────────────────
BACKEND_PID=""
cleanup() {
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    # 끝나기를 기다린다. 기다리지 않고 나가면 포트가 아직 잡혀 있는 상태로
    # 프롬프트가 돌아오고, 바로 다시 실행하면 이유 없이 실패한다.
    i=0
    while kill -0 "$BACKEND_PID" 2>/dev/null && [ "$i" -lt 20 ]; do
      i=$((i + 1)); sleep 0.2
    done
    kill -9 "$BACKEND_PID" 2>/dev/null || true
  fi
  printf '\n'
  say "백엔드까지 정리했습니다."
}
trap cleanup EXIT INT TERM

# ── ① 백엔드 ───────────────────────────────────────────────────────────────
cd "$BACKEND_DIR"

# `go run` 을 쓰지 않는다. go run 은 컴파일한 바이너리를 **자식 프로세스**로 띄우므로,
# go run 의 PID 를 죽여도 실제 서버는 살아남아 포트를 잡고 있는다. 그러면 다음
# 실행이 "이미 떠 있습니다" 로 막히고, 원인이 화면에 안 보인다.
# 먼저 빌드해서 우리가 직접 띄우면 PID 가 곧 서버가 된다.
say "백엔드 빌드 중… 첫 실행은 30초쯤 걸립니다."
if ! go build -o "$BIN" ./cmd/server 2>"$LOG"; then
  echo "--- 빌드 오류 ---" >&2
  cat "$LOG" >&2
  die "백엔드 빌드 실패."
fi

say "백엔드 시작(메모리 저장소 — DB 불필요)…"
STORE=memory \
JWT_SECRET=dev-secret \
SEED_ON_START=true \
PORT="$API_PORT" \
ADMIN_LOGIN_ID="$ADMIN_ID" \
ADMIN_PASSWORD="$ADMIN_PW" \
  "$BIN" >"$LOG" 2>&1 &
BACKEND_PID=$!

# 뜰 때까지 기다린다. 고정 시간(sleep 30)으로 두면 느린 컴퓨터에서 실패하고
# 빠른 컴퓨터에서는 괜히 기다린다.
i=0
until curl -fsS "$BASE/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 180 ]; then
    echo "--- 백엔드 로그 ---" >&2
    tail -30 "$LOG" >&2
    die "백엔드가 뜨지 않았습니다(위 로그 확인)."
  fi
  kill -0 "$BACKEND_PID" 2>/dev/null || {
    echo "--- 백엔드 로그 ---" >&2
    tail -30 "$LOG" >&2
    die "백엔드가 죽었습니다(위 로그 확인)."
  }
  sleep 1
done
say "백엔드 준비됨 — $BASE (로그: $LOG)"

# ── ② 관리자 계정 확인 ─────────────────────────────────────────────────────
# 실제로 로그인해 본다. 로그에 '생성했습니다'가 찍혔다고 로그인이 되는 것은
# 아니다(비밀번호 정책 위반 등으로 계정이 안 만들어질 수 있다).
if ! curl -fsS -X POST "$BASE/api/auth/login" \
     -H 'Content-Type: application/json' \
     -d "{\"id\":\"$ADMIN_ID\",\"password\":\"$ADMIN_PW\"}" >/dev/null 2>&1; then
  echo "--- 백엔드 로그 ---" >&2
  tail -20 "$LOG" >&2
  die "관리자 로그인이 안 됩니다. 비밀번호는 공백 제외 8자 이상이어야 합니다."
fi
say "관리자 계정 확인됨 — $ADMIN_ID / $ADMIN_PW"

# ── ③ 볼 데이터 ────────────────────────────────────────────────────────────
# 없으면 콘솔이 정직하게 "기록이 아직 없습니다"만 보여 준다. 비교 대상이
# 있어야 '다른 직원보다 못함' 같은 판정과 그림이 나온다.
say "데모 학습 기록 심는 중…"
ADMIN_ID="$ADMIN_ID" ADMIN_PW="$ADMIN_PW" BASE="$BASE" \
  node "$BACKEND_DIR/scripts/demo-data.mjs" || die "데모 데이터 심기 실패."

# ── ④ 관리 콘솔 ────────────────────────────────────────────────────────────
cd "$ADMIN_DIR"
if [ ! -d node_modules ]; then
  say "관리 콘솔 의존성 설치 중(처음 한 번만, 1~2분)…"
  npm install --no-audit --no-fund
fi

printf '\n'
printf '\033[32m  관리 콘솔  http://localhost:%s/admin/\033[0m\n' "$WEB_PORT"
printf '  로그인      %s / %s\n' "$ADMIN_ID" "$ADMIN_PW"
printf '  끄기        Ctrl+C (백엔드까지 함께 내려갑니다)\n\n'

# exec 을 쓰지 않는다. exec 은 이 셸을 npm 으로 **대체**하므로 위에서 걸어 둔
# trap 이 사라진다. 그러면 Ctrl+C 로 콘솔은 죽지만 백엔드가 살아남아, 다음
# 실행이 "포트에 이미 무언가 떠 있습니다" 로 막힌다 — 이 스크립트가 막으려던
# 바로 그 상태다. 자식으로 두면 Ctrl+C 가 프로세스 그룹 전체에 닿고,
# 이 셸이 살아 있으므로 trap 이 백엔드까지 정리한다.
ADMIN_API_TARGET="$BASE" npm run dev -- --port "$WEB_PORT"
