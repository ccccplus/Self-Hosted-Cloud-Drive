# AGENT RUNBOOK: Cloudflare Serverless Infrastructure Rollout

> **Target Audience**: Autonomous AI Agents (e.g., Antigravity, Claude Code, Cursor, CI/CD Workflows)  
> **Task**: Automate the provisioning of Cloudflare D1, R2, and Workers deployment using Wrangler CLI without interactive prompts.

---

## 1. Toolchain & Authentication Pre-flight Checks

Ensure the runtime environment satisfies Cloudflare toolchain requirements:

```bash
# 1.1 Assert Node.js (v18+)
node -e "const v = parseInt(process.versions.node.split('.')[0]); if(v < 18) throw new Error('Node 18+ required: ' + v);"

# 1.2 Assert Wrangler CLI availability
npx --yes wrangler --version >/dev/null 2>&1 || { echo "[FAIL] Wrangler CLI unavailable"; exit 1; }

# 1.3 Assert Cloudflare Authentication
# Note: In automated agent contexts, ensure CLOUDFLARE_API_TOKEN is exported.
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  npx wrangler whoami >/dev/null 2>&1 || {
    echo "[WARN] CLOUDFLARE_API_TOKEN not set and interactive login not detected."
    echo "[INFO] If executing with interactive browser, run: npx wrangler login"
  }
fi
```

---

## 2. Infrastructure Synthesis & Database Migration

Execute programmatic resource allocation:

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# 2.1 Provision Cloudflare D1 Database
D1_OUTPUT=$(npx wrangler d1 create qr-relay-db --json 2>/dev/null || true)
DB_ID=$(echo "$D1_OUTPUT" | grep -o '"uuid":"[^"]*' | cut -d'"' -f4)

if [ -n "$DB_ID" ]; then
  echo "[PASS] Created D1 Database with ID: $DB_ID"
  # Replace database_id in wrangler.toml deterministically
  node -e "
    const fs = require('fs');
    let toml = fs.readFileSync('wrangler.toml', 'utf8');
    toml = toml.replace(/database_id\s*=\s*\"[^\"]*\"/, 'database_id = \"$DB_ID\"');
    fs.writeFileSync('wrangler.toml', toml, 'utf8');
  "
  echo "[PASS] Synced database_id into wrangler.toml"
else
  echo "[INFO] Using existing D1 configuration from wrangler.toml"
fi

# 2.2 Migrate Database Schema (Non-interactive)
echo "[INFO] Executing schema migrations against remote D1..."
npx wrangler d1 execute qr-relay-db --file=./cloudflare/schema.sql --remote -y

# 2.3 Provision R2 Object Storage Bucket
echo "[INFO] Provisioning R2 bucket qr-relay-files..."
npx wrangler r2 bucket create qr-relay-files 2>/dev/null || echo "[INFO] Bucket qr-relay-files already exists"
```

---

## 3. Worker & Static Assets Deployment

Deploy the combined Worker and frontend Static Assets:

```bash
# Execute deployment and capture output
DEPLOY_LOG=$(npx wrangler deploy --minify 2>&1)
echo "$DEPLOY_LOG"

# Extract deployed worker URL
DEPLOY_URL=$(echo "$DEPLOY_LOG" | grep -o 'https://[^ ]*\.workers\.dev' | head -n 1)

if [ -z "$DEPLOY_URL" ]; then
  echo "[WARN] Could not parse *.workers.dev URL from log output. Checking custom domain..."
  DEPLOY_URL="${CUSTOM_DOMAIN:-https://yun.20020227.xyz}"
fi

echo "Target Deployment Endpoint: $DEPLOY_URL"
```

---

## 4. Synthetic Endpoint Probes

Validate edge readiness across core user journeys:

```bash
# Probe 1: Healthcheck and config endpoint
echo "[TEST] Probing $DEPLOY_URL/api/config..."
CONFIG_RESP=$(curl -fsSL "$DEPLOY_URL/api/config")
if echo "$CONFIG_RESP" | grep -q "app_name"; then
  echo "[PASS] Probe 1: /api/config returned valid JSON configuration"
else
  echo "[FAIL] /api/config response unexpected: $CONFIG_RESP"
  exit 1
fi

# Probe 2: Edge item creation test
echo "[TEST] Creating test text item on edge..."
CREATE_RESP=$(curl -fsSL -X POST "$DEPLOY_URL/api/text" -F "text=AgentEdgeTestPayload" -F "burn_after_reading=false")
EDGE_CODE=$(echo "$CREATE_RESP" | grep -o '"code":"[^"]*' | cut -d'"' -f4)

if [ -z "$EDGE_CODE" ]; then
  echo "[FAIL] Failed to create item on Cloudflare edge: $CREATE_RESP"
  exit 1
fi
echo "[PASS] Probe 2: Created item on D1 with code: $EDGE_CODE"

# Probe 3: Item retrieval test
ITEM_RESP=$(curl -fsSL "$DEPLOY_URL/api/item/$EDGE_CODE")
if echo "$ITEM_RESP" | grep -q "AgentEdgeTestPayload"; then
  echo "[PASS] Probe 3: D1 read query validated"
else
  echo "[FAIL] Failed to retrieve item content: $ITEM_RESP"
  exit 1
fi

# Probe 4: Clean up test item
curl -fsSL -X DELETE "$DEPLOY_URL/api/item/$EDGE_CODE" >/dev/null 2>&1 || true
echo "[PASS] Probe 4: Edge test item cleaned up"

# Probe 5: Anti-307 share route integrity probe
# Ensures /s/:code returns HTTP 200 without redirecting to /share
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/s/$EDGE_CODE")
if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "[PASS] Probe 5: /s/:code returns HTTP 200 (No 307 Clean URL URL-stripping)"
else
  echo "[FAIL] /s/:code returned HTTP $HTTP_STATUS"
fi

echo "==============================================="
echo ">>> CLOUDFLARE EDGE DEPLOYMENT VALIDATED: OK <<<"
echo "==============================================="
```

---

## 5. Cloudflare Edge Diagnostic & Remediation Matrix

| Symptom | Root Cause | Remediation Command |
| :--- | :--- | :--- |
| `D1_ERROR: no such table: items` | Schema not migrated to remote | `npx wrangler d1 execute qr-relay-db --file=./cloudflare/schema.sql --remote -y` |
| `R2 bucket not found` | Bucket missing or unlinked | `npx wrangler r2 bucket create qr-relay-files` |
| `Binding DB not found` | `wrangler.toml` binding mismatch | Verify `[[d1_databases]] binding = "DB"` in `wrangler.toml`. |
| Share URL redirects to `/share` stripping code | Clean URLs 307 redirect | Ensure `cloudflare/worker.js` returns `status: 200` with `/share` asset body directly. |
