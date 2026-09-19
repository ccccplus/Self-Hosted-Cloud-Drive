# AGENT RUNBOOK: Linux Server & Docker Production Rollout

> **Target Audience**: Autonomous AI Agents (e.g., Antigravity, Claude Code, Cursor, DevOps Bots)  
> **Task**: Deploy QR-Relay containerized via Docker Compose or natively via Systemd with Nginx reverse proxy without manual intervention.

---

## 1. System Pre-flight Checks

Execute non-interactive assertions on the target host:

```bash
# 1.1 Assert Root or Sudo Privilege
[ "$(id -u)" -eq 0 ] || sudo true || { echo "[FAIL] Sudo access required"; exit 1; }

# 1.2 Assert Docker Availability
if ! command -v docker >/dev/null 2>&1; then
  echo "[INFO] Installing Docker non-interactively..."
  curl -fsSL https://get.docker.com | bash -s docker
  systemctl enable --now docker
fi

# 1.3 Assert Docker Compose plugin availability
docker compose version >/dev/null 2>&1 || { echo "[FAIL] Docker compose plugin missing"; exit 1; }
```

---

## 2. Environment & Directory Synthesis

```bash
# 2.1 Set working directory
WORKDIR="/opt/qr-relay"
mkdir -p "$WORKDIR" && cd "$WORKDIR"

# 2.2 Synchronize repository code if not already present
if [ ! -f "docker-compose.yml" ]; then
  git clone https://github.com/ccccplus/Self-Hosted-Cloud-Drive.git .
fi

# 2.3 Ensure persistent storage directories exist with write access
mkdir -p data/uploads
chmod -R 777 data

# 2.4 Inject environment file
DOMAIN="${DEPLOY_DOMAIN:-localhost}"
cat << EOF > .env
PORT=8080
BASE_URL=http://${DOMAIN}:8080
MAX_FILE_SIZE_MB=100
AUTO_CLEANUP_INTERVAL_SECONDS=60
UPLOAD_PASSWORD=
OPENLIST_AUTO_SYNC=False
EOF
```

---

## 3. Container Orchestration Execution

```bash
# 3.1 Pull/Build and spawn containers in background
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# 3.2 Wait for container readiness (up to 15s)
TIMEOUT=15
while [ $TIMEOUT -gt 0 ]; do
  if docker compose ps | grep -q "Up"; then
    echo "[PASS] Container qr-relay is active"
    break
  fi
  sleep 1
  TIMEOUT=$((TIMEOUT - 1))
done

if [ $TIMEOUT -le 0 ]; then
  echo "[FAIL] Container startup timed out. Logs:"
  docker compose logs --tail=50
  exit 1
fi
```

---

## 4. Nginx Reverse Proxy Automated Injection (Optional for Domain)

If a public domain and Nginx are detected on the host:

```bash
if command -v nginx >/dev/null 2>&1 && [ "$DOMAIN" != "localhost" ]; then
  echo "[INFO] Injecting Nginx virtual host for $DOMAIN..."
  cat << EOF > "/etc/nginx/conf.d/qr-relay.conf"
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
  nginx -t && systemctl reload nginx
  echo "[PASS] Nginx configuration active"
fi
```

---

## 5. Automated Verification & Readiness Probes

Execute synthetic HTTP probes against the local endpoint:

```bash
# Probe 1: Healthcheck endpoint
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/health)
if [ "$STATUS_CODE" -ne 200 ]; then
  echo "[FAIL] /api/health returned HTTP $STATUS_CODE"
  docker compose logs --tail=30
  exit 1
fi
echo "[PASS] Probe 1: Local HTTP 200 on /api/health"

# Probe 2: Index page mobile readiness
INDEX_BODY=$(curl -s http://127.0.0.1:8080/)
if ! echo "$INDEX_BODY" | grep -q "tab-bottom-btn-text"; then
  echo "[FAIL] Mobile dock navigation missing from index page"
  exit 1
fi
echo "[PASS] Probe 2: Index HTML verified with mobile immersion dock"

# Probe 3: Programmatic creation and retrieval
CREATE_RESP=$(curl -s -X POST http://127.0.0.1:8080/api/text -F "text=ServerAgentProbeTest")
CODE=$(echo "$CREATE_RESP" | grep -o '"code":"[^"]*' | cut -d'"' -f4)
if [ -z "$CODE" ]; then
  echo "[FAIL] Failed to extract pickup code from response: $CREATE_RESP"
  exit 1
fi
echo "[PASS] Probe 3: Text item successfully created with pickup code: $CODE"

# Probe 4: Retrieve item
GET_RESP=$(curl -s http://127.0.0.1:8080/api/item/$CODE)
if ! echo "$GET_RESP" | grep -q "ServerAgentProbeTest"; then
  echo "[FAIL] Item content mismatch on code $CODE"
  exit 1
fi
echo "[PASS] Probe 4: Item verification passed"

# Probe 5: Delete test item
curl -s -X DELETE http://127.0.0.1:8080/api/item/$CODE >/dev/null
echo "[PASS] Probe 5: Test item cleaned up"

echo "========================================="
echo ">>> SERVER ROLLOUT COMPLETED: HEALTHY <<<"
echo "========================================="
```

---

## 6. Incident Triage & Decision Tree

| Failure Mode | Diagnosis Command | Remediation Step |
| :--- | :--- | :--- |
| Container status `Restarting` | `docker compose logs qr-relay` | Check for syntax error in `.env` or port 8080 conflict on host. |
| `Permission denied` on SQLite / uploads | `ls -ld data data/uploads` | Run `chmod -R 777 data`. |
| 502 Bad Gateway via Nginx | `curl -I http://127.0.0.1:8080/api/health` | If backend is up, verify SELinux/AppArmor: `setsebool -P httpd_can_network_connect 1`. |
| Upload fails above 1MB | `grep client_max_body_size /etc/nginx/conf.d/*.conf` | Ensure `client_max_body_size 100M;` is present in Nginx `server {}` block. |
