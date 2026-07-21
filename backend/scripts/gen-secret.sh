#!/usr/bin/env sh
# JWT_SECRET 용 안전한 랜덤 키(32바이트, hex 64자)를 생성한다.
# 사용:  ./scripts/gen-secret.sh            # 값만 출력
#        ./scripts/gen-secret.sh >> .env   # .env 에 추가(직접 KEY= 앞에 붙여 편집)
set -eu

if command -v openssl >/dev/null 2>&1; then
	openssl rand -hex 32
elif [ -r /dev/urandom ]; then
	head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
	echo
else
	echo "openssl 도 /dev/urandom 도 없어 키를 만들 수 없습니다" >&2
	exit 1
fi
