# AGENT RUNBOOK: Local Environment Deployment & Verification

> **Target Audience**: Autonomous AI Agents (e.g., Antigravity, Claude Code, Cursor, AutoGPT)  
> **Task**: Set up, configure, daemonize, and verify QR-Relay on a local host or sandbox environment without manual user interaction.

---

## 1. System Pre-flight Checks (Non-Interactive)

Execute the following assertion commands sequentially. If any command fails with a non-zero exit code, resolve the prerequisite before proceeding.

```bash
# 1.1 Assert Python 3.10+
python3 -c "import sys; assert sys.version_info >= (3, 10), f'Python 3.10+ required, found {sys.version}'"

# 1.2 Detect port 8080 collision
lsof -i :8080 || echo "PORT_8080_FREE"
```

If port 8080 is occupied and can be reclaimed:
```bash
lsof -ti :8080 | xargs kill -9 2>/dev/null || true
```

---

## 2. Dependency & Filesystem Bootstrapping

```bash
# 2.1 Navigate to project root
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# 2.2 Create virtualenv if not present
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

# 2.3 Install Python dependencies deterministically
./.venv/bin/pip install --upgrade pip -q
./.venv/bin/pip install -r requirements.txt -q

# 2.4 Ensure runtime data directories exist
mkdir -p data/uploads
```

---

## 3. Configuration Synthesis (.env)

Write the following canonical configuration to `.env`. Do NOT prompt for interactive input.

```bash
cat << 'EOF' > .env
PORT=8080
BASE_URL=http://127.0.0.1:8080
MAX_FILE_SIZE_MB=100
AUTO_CLEANUP_INTERVAL_SECONDS=60
UPLOAD_PASSWORD=
OPENLIST_AUTO_SYNC=False
EOF
```

---

## 4. Daemon Execution

Launch the FastAPI application in the background and record the PID:

```bash
# Stop any stale uvicorn instance
pkill -f "uvicorn backend.main:app" 2>/dev/null || true

# Start server daemon
nohup ./.venv/bin/python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8080 > server.log 2>&1 &
SERVER_PID=$!
echo "Server spawned with PID: $SERVER_PID"
sleep 2
```

---

## 5. Healthcheck & Functional Verification Probes

Run the verification probe script to validate readiness:

```bash
./.venv/bin/python3 - << 'EOF'
import sys, time
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

# Probe 1: Healthcheck
r_health = client.get("/api/health")
assert r_health.status_code == 200, f"Healthcheck failed: {r_health.status_code}"
assert r_health.json().get("status") == "ok", f"Unexpected health status: {r_health.json()}"
print("[PASS] Probe 1: /api/health returned status: ok")

# Probe 2: Index HTML & Mobile Dock UI
r_index = client.get("/")
assert r_index.status_code == 200, f"Root route failed: {r_index.status_code}"
assert "tab-bottom-btn-text" in r_index.text, "Missing mobile dock bar component"
assert "viewport-fit=cover" in r_index.text, "Missing mobile viewport-fit configuration"
print("[PASS] Probe 2: / index.html rendered with valid mobile dock")

# Probe 3: Text relay creation
r_text = client.post("/api/text", data={"text": "Agent Self-Test String", "burn_after_reading": False})
assert r_text.status_code == 200, f"Text creation failed: {r_text.status_code}"
item = r_text.json()
code = item.get("code")
assert len(code) == 6 and code.isdigit(), f"Invalid pickup code format: {code}"
print(f"[PASS] Probe 3: Item created with code: {code}")

# Probe 4: Pickup item retrieval
r_item = client.get(f"/api/item/{code}")
assert r_item.status_code == 200
assert r_item.json().get("content") == "Agent Self-Test String"
print(f"[PASS] Probe 4: Item #{code} content validated")

# Probe 5: Clean up test item
r_del = client.delete(f"/api/item/{code}")
assert r_del.status_code == 200
print("[PASS] Probe 5: Test item cleaned up successfully")

print("\n>>> ALL LOCAL DEPLOYMENT PROBES PASSED <<<")
EOF
```

---

## 6. Failure Recovery & Remediation Tree

| Failure Symptom | Root Cause | Remediation Action |
| :--- | :--- | :--- |
| `ConnectionRefusedError: [Errno 61]` | Uvicorn failed to start | Inspect `cat server.log`; check if SQLite DB path `data/relay.db` is writable. |
| `Address already in use` | Zombie process holding 8080 | Execute `lsof -ti :8080 \| xargs kill -9`. |
| `ModuleNotFoundError` | Virtualenv missing packages | Re-run `./.venv/bin/pip install -r requirements.txt`. |
| `PermissionError: [Errno 13]` | `data/uploads` not writable | Run `chmod -R 755 data`. |
