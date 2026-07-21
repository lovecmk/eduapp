#!/usr/bin/env sh
# PostgreSQL 논리 백업(운영 프로파일). 이식·재해복구의 핵심 — "이식이 쉽다"는
# 약속은 백업이 실제로 존재할 때만 참이 된다.
#
# 사용:
#   ./scripts/backup.sh                 # ./backups/eduapp-YYYYmmdd-HHMMSS.sql.gz 생성
#   BACKUP_DIR=/data/backups ./scripts/backup.sh
#
# 나이틀리 자동화(호스트 crontab 예):
#   15 3 * * * cd /opt/eduapp/backend && ./scripts/backup.sh >> /var/log/eduapp-backup.log 2>&1
#
# 새 호스트로 복원:
#   gunzip -c eduapp-XXXX.sql.gz | docker compose --profile prod exec -T postgres \
#     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
PG_USER="${POSTGRES_USER:-eduapp}"
PG_DB="${POSTGRES_DB:-eduapp}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/eduapp-$STAMP.sql.gz"

echo "[backup] pg_dump → $OUT"
docker compose --profile prod exec -T postgres \
	pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists | gzip -9 >"$OUT"

echo "[backup] 완료: $(du -h "$OUT" | cut -f1)"

# 오래된 백업 정리(기본 14일).
find "$BACKUP_DIR" -name 'eduapp-*.sql.gz' -type f -mtime "+$RETAIN_DAYS" -print -delete || true
