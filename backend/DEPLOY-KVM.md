# Ubuntu KVM/VM 배포 가이드

우분투 호스트 위의 **KVM 게스트(VM)** 한 대에 eduapp 을 올리는 실전 절차.
백엔드는 이미 **포트-어댑터 + Docker Compose** 구조라 VM 이든 물리 서버든 **같은 명령**으로 돈다
(설정만 `.env` 로 다르다). 그래서 "KVM 이라서" 새로 필요한 것은 대부분 **VM 을 만들고 네트워크를
여는 일**과 **부팅 자동기동(systemd)** 뿐이다. 아래는 그 전부다.

> 요약 3줄:
> 1) VM 만들고 80/443(또는 8080) 포워딩 → 2) `docker` 설치 → 3) 레포 clone 후
> `cd backend && cp .env.example .env`(값 채우고) → **API만**이면 `make up`,
> **웹+API 올인원**이면 `make up-web`. 부팅 자동기동은 `deploy/eduapp.service` 등록.

---

## 0. 두 가지 배포 형태

| 형태 | 명령 | Caddy | 언제 |
|------|------|-------|------|
| **API 전용** | `make up` | `Caddyfile`(→ api 프록시) | 앱 스토어/EAS 로 배포한 모바일 앱만 붙일 때 |
| **올인원(웹+API)** | `make up-web` | `Caddyfile.web`(dist 정적 + `/api` 프록시) | 브라우저로도 접속(웹앱)까지 한 VM 에서 끝낼 때 |

둘 다 Postgres(영속 볼륨) + API + Caddy(자동 HTTPS) 구성은 동일하다.

---

## 1. KVM 게스트(VM) 준비

호스트(우분투)에서 VM 을 만든다. 가장 빠른 길은 `cloud-init` 이 붙는 `virt-install`:

```bash
# 호스트에 virtualization 도구
sudo apt update && sudo apt install -y virtinst libvirt-daemon-system cloud-image-utils

# 우분투 24.04 cloud 이미지로 게스트 생성(2 vCPU / 4GB / 30GB 예시)
virt-install \
  --name eduapp \
  --memory 4096 --vcpus 2 \
  --disk size=30 \
  --os-variant ubuntu24.04 \
  --cloud-init user-data=./user-data.yaml \
  --network bridge=br0 \
  --graphics none --import
```

**네트워크(중요)** — 외부에서 접속하려면 게스트가 IP 를 받아야 한다.
- **브리지(br0)**: 게스트가 LAN 에서 직접 IP 를 받는다(가장 단순, 권장).
- **NAT(default)**: 호스트가 게스트를 가린다 → 호스트에서 **포트 포워딩** 필요:
  ```bash
  # 호스트 공인/사설 IP 의 80,443 을 게스트로 넘김(게스트 IP 예: 192.168.122.50)
  sudo iptables -t nat -A PREROUTING -p tcp --dport 80  -j DNAT --to-destination 192.168.122.50:80
  sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination 192.168.122.50:443
  sudo iptables -A FORWARD -p tcp -d 192.168.122.50 --dport 80  -j ACCEPT
  sudo iptables -A FORWARD -p tcp -d 192.168.122.50 --dport 443 -j ACCEPT
  # 영속화: iptables-persistent 또는 nftables 로 저장
  ```

VM 안에서 방화벽을 쓰면 포트를 연다: `sudo ufw allow 80,443/tcp`.

---

## 2. VM 안: Docker 설치

```bash
# Docker Engine + compose 플러그인(공식 편의 스크립트)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker   # sudo 없이 docker 사용
docker compose version                            # v2 확인
```

---

## 3. 코드 배치 & 설정

```bash
sudo mkdir -p /opt/eduapp && sudo chown $USER /opt/eduapp
git clone <REPO_URL> /opt/eduapp
cd /opt/eduapp/backend
cp .env.example .env
```

`.env` 에서 **반드시** 채울 값:

```ini
DOMAIN=eduapp.example.com          # 도메인이 있으면 Caddy 가 Let's Encrypt 자동 HTTPS
ACME_EMAIL=you@example.com         # 인증서 만료 알림(선택)
JWT_SECRET=<make secret 로 생성>    # 아래 명령으로 랜덤 생성
POSTGRES_PASSWORD=<강한 비밀번호>
CORS_ORIGINS=https://eduapp.example.com   # 오리진 확정 후 좁힐 것
```

```bash
make secret   # JWT_SECRET 용 랜덤 키 출력 → .env 에 붙여넣기
```

> 도메인이 없다면 `DOMAIN=` 을 비워 둔다 → Caddy 가 `:80` 평문으로 뜬다(사내망/IP 접속용).
> 이 경우 브라우저·앱은 `http://<VM-IP>` 로 붙는다.

---

## 4-A. API 전용으로 올리기

```bash
make up          # Postgres + API + Caddy(프록시)
make logs        # 기동 로그 확인
curl -fsS http://localhost/health || curl -fsS http://localhost:8080/health
```

모바일 앱(EAS 빌드)의 `.env`:
```
EXPO_PUBLIC_API_BASE_URL=https://eduapp.example.com   # 끝 슬래시 없이
EXPO_PUBLIC_USE_MOCK_DATA=false
```

## 4-B. 웹+API 올인원으로 올리기

브라우저로도 접속하려면 **먼저 레포 루트에서 웹을 빌드**해 `dist/` 를 만든다.
웹 빌드에는 API 주소가 정적으로 구워지므로, **같은 오리진**을 준다(Caddy 가 `/api/*` 를 백엔드로 넘긴다):

```bash
cd /opt/eduapp
# 노드 20+ 필요. 도메인이 있으면 https://도메인, 없으면 http://<VM-IP>
EXPO_PUBLIC_API_BASE_URL=https://eduapp.example.com \
EXPO_PUBLIC_USE_MOCK_DATA=false \
  npx expo export --platform web        # → /opt/eduapp/dist 생성

cd backend
make up-web      # Caddy 가 dist 를 정적 제공 + /api,/health 는 API 로 프록시
```

이제 `https://eduapp.example.com` 은 웹앱, `https://eduapp.example.com/api/...` 는 백엔드다.
웹을 새로 빌드하면(`expo export`) `dist` 가 갱신되고, Caddy 는 볼륨 마운트라 재빌드 없이 바로 반영된다.

---

## 5. 부팅 자동기동(systemd) — VM 필수

VM 은 재부팅되면 스택이 꺼진 채 남을 수 있다. `deploy/eduapp.service` 로 자동기동을 건다:

```bash
sudo cp /opt/eduapp/backend/deploy/eduapp.service /etc/systemd/system/eduapp.service
# 레포를 /opt/eduapp 가 아닌 곳에 뒀다면 유닛의 WorkingDirectory 를 수정.
# 올인원으로 자동기동하려면 유닛의 ExecStart 를 `make up-web` 으로 바꾸거나
#   [Service] 에 Environment=CADDYFILE=Caddyfile.web 를 추가.
sudo systemctl daemon-reload
sudo systemctl enable --now eduapp
systemctl status eduapp
```

---

## 6. 운영 유지

```bash
make logs      # 로그 팔로우
make backup    # DB 백업 → backend/backups/*.sql.gz (crontab 나이틀리 권장)
make psql      # DB 콘솔
make down      # 중지
```

**백업 crontab 예시(나이틀리 03:10):**
```bash
( crontab -l 2>/dev/null; echo "10 3 * * * cd /opt/eduapp/backend && make backup" ) | crontab -
```

**업데이트 배포:**
```bash
cd /opt/eduapp && git pull
cd backend && make up          # (올인원이면 먼저 웹 재빌드 후 make up-web)
```

---

## 7. 리소스 가이드(작은 VM 기준)

| 항목 | 최소 | 여유 |
|------|------|------|
| vCPU | 1 | 2 |
| RAM | 1 GB(memory 스토어) / 2 GB(postgres) | 4 GB |
| 디스크 | 10 GB | 30 GB(백업·DB 성장 고려) |

DB 부하가 커지면 Postgres 를 관리형(RDS·Cloud SQL·Supabase·Neon)으로 분리하고
`DATABASE_URL` 만 바꾸면 된다 — API 컨테이너는 그대로다(포트-어댑터 구조).

---

## 8. 문제 해결

| 증상 | 원인/조치 |
|------|-----------|
| 외부에서 접속 불가 | VM 네트워크(브리지/NAT 포워딩), 호스트/게스트 방화벽(80·443) 확인 |
| HTTPS 인증서 실패 | 80·443 이 공인망에서 게스트까지 도달해야 Let's Encrypt 발급 가능. DNS A 레코드가 실제 접속 IP 를 가리키는지 확인 |
| 부팅 후 안 뜸 | `systemctl status eduapp` / `docker compose --profile prod ps`, docker 데몬 활성화(`systemctl enable docker`) |
| 웹은 열리는데 로그인 안 됨 | 웹 빌드의 `EXPO_PUBLIC_API_BASE_URL` 이 실제 접속 오리진과 다름 → 같은 오리진으로 재빌드 |
| DB 비밀번호 경고 로그 | `.env` 의 기본 취약값 사용 중 → 강한 값으로 교체 후 재기동 |
