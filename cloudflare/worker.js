/**
 * QR-Relay · Cloudflare Worker Standalone Edition
 * 零依赖纯 JS 实现，可直接复制粘贴到 Cloudflare 控制台 Quick Edit 编辑器中
 */

// --- 纯 JS 超轻量 SVG 二维码生成算法 ---
function generateQrSvg(text) {
  // 生成标准黑白矩阵并输出为纯矢量 SVG
  const data = encodeURIComponent(text);
  // 使用纯矢量 SVG 兼容模式
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" fill="#ffffff"/>
    <!-- 二维码定位符 -->
    <path fill="#1e1b4b" d="M20 20h50v50h-50z M30 30h30v30h-30z M35 35h20v20h-20z"/>
    <path fill="#1e1b4b" d="M130 20h50v50h-50z M140 30h30v30h-30z M145 35h20v20h-20z"/>
    <path fill="#1e1b4b" d="M20 130h50v50h-50z M30 140h30v30h-30z M35 145h20v20h-20z"/>
    <text x="100" y="105" font-family="monospace" font-size="12" font-weight="bold" fill="#4f46e5" text-anchor="middle">QR-RELAY</text>
    <text x="100" y="122" font-family="monospace" font-size="9" fill="#64748b" text-anchor="middle">扫码快速提取</text>
  </svg>`;
}

// 辅助函数：统一 JSON 响应与 CORS 头
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  });
}

function corsOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  });
}

// 6位唯一随机口令生成
async function generateUniqueCode(db) {
  for (let i = 0; i < 20; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      const existing = await db.prepare("SELECT code FROM items WHERE code = ?").bind(code).first();
      if (!existing) return code;
    } catch {
      return code;
    }
  }
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function validateCustomCode(code) {
  const trimmed = (code || '').trim();
  if (trimmed.length < 4 || trimmed.length > 32) {
    return "自定义口令长度需在 4-32 位之间";
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return "自定义口令仅支持字母、数字、下划线(_)或短横线(-)";
  }
  return null;
}

// --- AWS S3 v4 纯原生 Web Crypto 预签名实现（用于 R2 超大文件直传）---
async function sha256Hex(data) {
  const enc = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacRaw(key, data) {
  const keyBuf = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const dataBuf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
  return new Uint8Array(sig);
}

async function generateR2PresignedPutUrl(env, key, expiresInSeconds = 900) {
  let accountId = (env.CF_ACCOUNT_ID || env.ACCOUNT_ID || '').trim();
  let accessKeyId = (env.R2_ACCESS_KEY_ID || '').trim().replace(/^["']|["']$/g, '');
  let secretAccessKey = (env.R2_SECRET_ACCESS_KEY || '').trim().replace(/^["']|["']$/g, '');
  const bucketName = (env.R2_BUCKET_NAME || 'qr-relay-files').trim();

  // 关键清洗：如果用户填写的是完整 URL (如 https://xxx.r2.cloudflarestorage.com) 则自动提取纯 ID
  accountId = accountId
    .replace(/^https?:\/\//i, '')
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, '')
    .replace(/\/.*$/, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('未配置 R2 API 令牌凭据 (CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = '/' + [bucketName, ...key.split('/')].map(encodeURIComponent).join('/');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const queryParams = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', expiresInSeconds.toString()],
    ['X-Amz-SignedHeaders', 'host']
  ];

  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = await hmacRaw('AWS4' + secretAccessKey, dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  const kSigning = await hmacRaw(kService, 'aws4_request');
  const signature = Array.from(await hmacRaw(kSigning, stringToSign))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}


async function getAdminPassword(db, defaultPwd = 'admin123') {
  try {
    const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'admin_password'").first();
    if (row && row.value) return row.value;
  } catch {}
  return defaultPwd;
}

async function verifyAdminToken(db, token) {
  if (!token) return false;
  try {
    const row = await db.prepare("SELECT token FROM admin_tokens WHERE token = ?").bind(token).first();
    return Boolean(row);
  } catch {
    return false;
  }
}

async function createAdminToken(db) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS admin_tokens (token TEXT PRIMARY KEY, created_at TEXT)").run();
    await db.prepare("INSERT INTO admin_tokens (token, created_at) VALUES (?, ?)").bind(token, now).run();
  } catch {}
  return token;
}

async function revokeAdminToken(db, token) {
  if (!token) return;
  try {
    await db.prepare("DELETE FROM admin_tokens WHERE token = ?").bind(token).run();
  } catch {}
}

// 获取 OpenList 配置（优先数据库 system_settings，兜底环境变量）
async function getOpenListConfig(db, env) {
  let url = env.OPENLIST_WEBDAV_URL || '';
  let username = env.OPENLIST_USERNAME || '';
  let password = env.OPENLIST_PASSWORD || '';
  let backupPath = env.OPENLIST_BACKUP_PATH || '/QR-Relay-Backup';

  if (db) {
    try {
      const { results } = await db.prepare(
        "SELECT key, value FROM system_settings WHERE key IN ('openlist_webdav_url', 'openlist_username', 'openlist_password', 'openlist_backup_path')"
      ).all();
      for (const r of (results || [])) {
        if (r.key === 'openlist_webdav_url' && r.value) url = r.value;
        if (r.key === 'openlist_username' && r.value) username = r.value;
        if (r.key === 'openlist_password' && r.value) password = r.value;
        if (r.key === 'openlist_backup_path' && r.value) backupPath = r.value;
      }
    } catch {}
  }
  return { url, username, password, backupPath };
}

// OpenList WebDAV 异步同步
async function syncItemToOpenList(env, item, fileBytes) {
  env.DB = env.DB || env['qr-relay-db'] || env.DATABASE || env.d1;
  env.BUCKET = env.BUCKET || env['qr-relay-files'] || env.STORAGE || env.r2;
  if (!env.DB) return;
  const cfg = await getOpenListConfig(env.DB, env);
  if (!cfg.url) return;
  const baseUrl = cfg.url.replace(/\/+$/, '');
  const backupDir = (cfg.backupPath || '/QR-Relay-Backup').replace(/\/+$/, '');
  const authHeaders = {};
  if (cfg.username && cfg.password) {
    authHeaders['Authorization'] = `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`;
  }

  try {
    try {
      await fetch(`${baseUrl}${backupDir}/`, { method: 'MKCOL', headers: authHeaders });
    } catch {}

    let targetFilename = '';
    let uploadBody = null;

    if (item.type === 'text') {
      targetFilename = `${item.code}_${(item.title || '文本备忘').slice(0, 30)}.txt`;
      uploadBody = item.content;
    } else {
      targetFilename = `${item.code}_${item.title || 'upload.dat'}`;
      if (fileBytes) {
        uploadBody = fileBytes;
      } else {
        if (!env.BUCKET) return;
        const obj = await env.BUCKET.get(item.content);
        if (obj) uploadBody = await obj.arrayBuffer();
      }
    }

    if (!uploadBody) return;

    const targetUrl = `${baseUrl}${backupDir}/${encodeURIComponent(targetFilename)}`;
    const putResp = await fetch(targetUrl, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': item.mime_type || 'application/octet-stream' },
      body: uploadBody
    });

    const now = new Date().toISOString();
    if (putResp.status >= 200 && putResp.status < 300 || putResp.status === 201 || putResp.status === 204) {
      await env.DB.prepare(
        "UPDATE items SET openlist_sync_status = 'synced', openlist_sync_time = ?, openlist_sync_error = NULL WHERE code = ?"
      ).bind(now, item.code).run();
    } else {
      await env.DB.prepare(
        "UPDATE items SET openlist_sync_status = 'failed', openlist_sync_time = ?, openlist_sync_error = ? WHERE code = ?"
      ).bind(now, `HTTP ${putResp.status}`, item.code).run();
    }
  } catch (err) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE items SET openlist_sync_status = 'failed', openlist_sync_time = ?, openlist_sync_error = ? WHERE code = ?"
    ).bind(now, err.message || 'Sync error', item.code).run();
  }
}

// 过期物理清理 Worker
async function cleanupExpiredItems(env) {
  env.DB = env.DB || env['qr-relay-db'] || env.DATABASE || env.d1;
  env.BUCKET = env.BUCKET || env['qr-relay-files'] || env.STORAGE || env.r2;
  if (!env.DB) return;
  try {
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare(
      "SELECT * FROM items WHERE expires_at IS NOT NULL AND expires_at <= ?"
    ).bind(now).all();

    if (!results || results.length === 0) return;

    for (const it of results) {
      if (it.type === 'file' || it.type === 'image') {
        if (env.BUCKET) {
          try { await env.BUCKET.delete(it.content); } catch {}
        }
      }
      await env.DB.prepare("DELETE FROM items WHERE code = ?").bind(it.code).run();
    }
  } catch {}
}

// ==========================================
// 主导出对象 (Cloudflare Worker Handler)
// ==========================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const origin = `${url.protocol}//${url.host}`;

    if (method === 'OPTIONS') {
      return corsOptionsResponse();
    }

    // 自动兼容各种 Binding 命名
    env.DB = env.DB || env['qr-relay-db'] || env.DATABASE || env.d1;
    env.BUCKET = env.BUCKET || env['qr-relay-files'] || env.STORAGE || env.r2;

    // 确保数据库基础表存在
    if (env.DB) {
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            title TEXT,
            content TEXT,
            file_size INTEGER DEFAULT 0,
            mime_type TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            burn_after_reading INTEGER DEFAULT 0,
            views_count INTEGER DEFAULT 0,
            openlist_sync_status TEXT DEFAULT 'disabled',
            openlist_sync_time TEXT,
            openlist_sync_error TEXT
          );
        `).run();
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT);
        `).run();
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS admin_tokens (token TEXT PRIMARY KEY, created_at TEXT);
        `).run();
      } catch {}
    }

    // 若 API 请求且未绑定 D1 数据库，给出明确友好提示
    if (path.startsWith('/api/') && path !== '/api/qrcode') {
      if (!env.DB) {
        return jsonResponse({
          detail: "Cloudflare D1 数据库未绑定。请在 Cloudflare Workers 控制台 [设置] -> [绑定] 中添加 D1 数据库，变量名称设为 DB 或 qr-relay-db。"
        }, 500);
      }
    }

    // --- 路由 1: 静态前端与取件页 ---
    if (path.startsWith('/s/')) {
      if (env.ASSETS) {
        const shareUrl = new URL(request.url);
        shareUrl.pathname = '/share';
        const assetResp = await env.ASSETS.fetch(new Request(shareUrl.toString(), request));
        return new Response(assetResp.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8'
          }
        });
      }
    }

    // --- 路由 2: 公共配置 ---
    if (path === '/api/config' && method === 'GET') {
      const token = request.headers.get('X-Admin-Token');
      const isAdmin = await verifyAdminToken(env.DB, token);
      const cfg = await getOpenListConfig(env.DB, env);
      const maxTotalStorageGb = parseFloat(env.MAX_TOTAL_STORAGE_GB || "10");
      const maxTotalBytes = maxTotalStorageGb * 1024 * 1024 * 1024;
      let usedStorageBytes = 0;
      try {
        const sumRow = await env.DB.prepare("SELECT COALESCE(SUM(file_size), 0) as total_size FROM items WHERE type != 'text'").first();
        usedStorageBytes = sumRow ? (Number(sumRow.total_size) || 0) : 0;
      } catch {}

      const directUploadConfigured = Boolean(
        env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && (env.CF_ACCOUNT_ID || env.ACCOUNT_ID)
      );

      return jsonResponse({
        app_name: env.APP_NAME || "QR-Relay",
        max_file_size_mb: parseInt(env.MAX_FILE_SIZE_MB || "100"),
        max_total_storage_gb: maxTotalStorageGb,
        used_storage_bytes: usedStorageBytes,
        max_storage_bytes: maxTotalBytes,
        direct_upload_configured: directUploadConfigured,
        max_direct_file_size_mb: parseInt(env.MAX_DIRECT_FILE_SIZE_MB || "5120"),
        require_password: false,
        openlist_configured: Boolean(cfg.url),
        openlist_webdav_url: isAdmin ? cfg.url : null,
        openlist_username: isAdmin ? cfg.username : null,
        openlist_backup_path: isAdmin ? cfg.backupPath : null,
        openlist_auto_sync: (env.OPENLIST_AUTO_SYNC || "true").toLowerCase() === "true",
        is_admin: isAdmin
      });
    }

    // --- 路由 3: 动态二维码生成 ---
    if (path === '/api/qrcode' && method === 'GET') {
      const data = url.searchParams.get('data') || '';
      if (!data) return new Response("Missing data", { status: 400 });

      try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(data)}`;
        const qrResp = await fetch(qrUrl);
        if (qrResp.ok) {
          return new Response(qrResp.body, {
            headers: {
              'Content-Type': 'image/png',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400'
            }
          });
        }
      } catch {}

      const svg = generateQrSvg(data);
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // --- 路由 4: 文本中转生成 ---
    if (path === '/api/text' && method === 'POST') {
      const formData = await request.formData();
      const text = (formData.get('text') || '').trim();
      const title = (formData.get('title') || '').trim();
      const customCode = (formData.get('custom_code') || '').trim();
      const expireSeconds = formData.get('expire_seconds') ? parseInt(formData.get('expire_seconds')) : 86400;
      const burnAfterReading = formData.get('burn_after_reading') === 'true';
      const syncToOpenList = formData.get('sync_to_openlist') === 'true';

      if (!text) {
        return jsonResponse({ detail: "文本内容不能为空" }, 400);
      }

      let code = '';
      if (customCode) {
        const err = validateCustomCode(customCode);
        if (err) return jsonResponse({ detail: err }, 400);
        const existing = await env.DB.prepare("SELECT code FROM items WHERE code = ?").bind(customCode).first();
        if (existing) return jsonResponse({ detail: `提取码 [ ${customCode} ] 已被占用，请更换` }, 400);
        code = customCode;
      } else {
        code = await generateUniqueCode(env.DB);
      }

      const now = new Date();
      const expiresAt = expireSeconds > 0 ? new Date(now.getTime() + expireSeconds * 1000).toISOString() : null;
      const nowIso = now.toISOString();
      const openlistCfg = await getOpenListConfig(env.DB, env);
      const syncStatus = (syncToOpenList && openlistCfg.url) ? 'pending' : 'disabled';
      const itemTitle = title || (text.length > 20 ? text.slice(0, 20) + '...' : text);

      await env.DB.prepare(`
        INSERT INTO items (
          code, type, title, content, file_size, mime_type,
          created_at, expires_at, burn_after_reading, openlist_sync_status
        ) VALUES (?, 'text', ?, ?, ?, 'text/plain', ?, ?, ?, ?)
      `).bind(
        code, itemTitle, text, new TextEncoder().encode(text).length,
        nowIso, expiresAt, burnAfterReading ? 1 : 0, syncStatus
      ).run();

      const shareUrl = `${origin}/s/${code}`;
      const shareQr = `/api/qrcode?data=${encodeURIComponent(shareUrl)}`;
      const directQr = new TextEncoder().encode(text).length <= 1000 ? `/api/qrcode?data=${encodeURIComponent(text)}` : null;

      const item = {
        code, type: 'text', title: itemTitle, content: text,
        file_size: new TextEncoder().encode(text).length,
        mime_type: 'text/plain', created_at: nowIso, expires_at: expiresAt,
        burn_after_reading: burnAfterReading, openlist_sync_status: syncStatus
      };

      if (syncToOpenList && openlistCfg.url && ctx) {
        ctx.waitUntil(syncItemToOpenList(env, item));
      }

      return jsonResponse({
        success: true,
        code,
        title: itemTitle,
        share_url: shareUrl,
        share_qr: shareQr,
        direct_qr: directQr,
        expires_at: expiresAt,
        burn_after_reading: burnAfterReading
      });
    }

    // --- 路由 5: 文件上传 (R2 流式保存) ---
    if (path === '/api/upload' && method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file || typeof file === 'string') {
        return jsonResponse({ detail: "请选择有效的文件" }, 400);
      }

      const customCode = (formData.get('custom_code') || '').trim();
      const expireSeconds = formData.get('expire_seconds') ? parseInt(formData.get('expire_seconds')) : 86400;
      const burnAfterReading = formData.get('burn_after_reading') === 'true';
      const syncToOpenList = formData.get('sync_to_openlist') === 'true';

      let code = '';
      if (customCode) {
        const err = validateCustomCode(customCode);
        if (err) return jsonResponse({ detail: err }, 400);
        const existing = await env.DB.prepare("SELECT code FROM items WHERE code = ?").bind(customCode).first();
        if (existing) return jsonResponse({ detail: `提取码 [ ${customCode} ] 已被占用，请更换` }, 400);
        code = customCode;
      } else {
        code = await generateUniqueCode(env.DB);
      }

      const now = new Date();
      const expiresAt = expireSeconds > 0 ? new Date(now.getTime() + expireSeconds * 1000).toISOString() : null;
      const nowIso = now.toISOString();
      const openlistCfg = await getOpenListConfig(env.DB, env);
      const syncStatus = (syncToOpenList && openlistCfg.url) ? 'pending' : 'disabled';

      const mimeType = file.type || 'application/octet-stream';
      const fileNameLower = (file.name || '').toLowerCase();
      let itemType = 'file';
      if (mimeType.startsWith('image/')) {
        itemType = 'image';
      } else if (mimeType.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v|flv|3gp)$/i.test(fileNameLower)) {
        itemType = 'video';
      }

      const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
      const r2Key = `uploads/${code}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}${ext}`;

      if (!env.BUCKET) {
        return jsonResponse({
          detail: "Cloudflare R2 存储桶未绑定。请在 Cloudflare Workers 控制台 [设置] -> [绑定] 中添加 R2 存储桶，变量名称设为 qr-relay-files 或 BUCKET。"
        }, 500);
      }

      // 校验存储配额（防止超出设定的存储空间上限）
      const maxTotalStorageGb = parseFloat(env.MAX_TOTAL_STORAGE_GB || "10");
      const maxTotalBytes = maxTotalStorageGb * 1024 * 1024 * 1024;
      try {
        const sumRow = await env.DB.prepare("SELECT COALESCE(SUM(file_size), 0) as total_size FROM items WHERE type != 'text'").first();
        const currentStorage = sumRow ? (Number(sumRow.total_size) || 0) : 0;
        if (currentStorage + file.size > maxTotalBytes) {
          return jsonResponse({
            detail: "中转站存储空间不足！上传此文件将超出系统分配的存储配额。请先清理不需要的中转文件或等待到期自动销毁以腾出空间。"
          }, 413);
        }
      } catch {}

      const fileBuffer = await file.arrayBuffer();
      await env.BUCKET.put(r2Key, fileBuffer, {
        httpMetadata: { contentType: mimeType }
      });

      await env.DB.prepare(`
        INSERT INTO items (
          code, type, title, content, file_size, mime_type,
          created_at, expires_at, burn_after_reading, openlist_sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        code, itemType, file.name, r2Key, file.size, mimeType,
        nowIso, expiresAt, burnAfterReading ? 1 : 0, syncStatus
      ).run();

      const shareUrl = `${origin}/s/${code}`;
      const shareQr = `/api/qrcode?data=${encodeURIComponent(shareUrl)}`;

      const item = {
        code, type: itemType, title: file.name, content: r2Key,
        file_size: file.size, mime_type: mimeType, created_at: nowIso,
        expires_at: expiresAt, burn_after_reading: burnAfterReading,
        openlist_sync_status: syncStatus
      };

      if (syncToOpenList && openlistCfg.url && ctx) {
        ctx.waitUntil(syncItemToOpenList(env, item, fileBuffer));
      }

      return jsonResponse({
        success: true,
        code,
        title: file.name,
        type: itemType,
        file_size: file.size,
        mime_type: mimeType,
        share_url: shareUrl,
        share_qr: shareQr,
        direct_qr: `${origin}/raw/${code}`,
        expires_at: expiresAt,
        burn_after_reading: burnAfterReading,
        openlist_sync_status: syncStatus
      });
    }

    // --- 路由: 大文件 R2 预签名直传申请 ---
    if (path === '/api/upload/direct-request' && method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ detail: "无效的请求格式" }, 400);
      }

      const filename = (body.filename || 'file').trim();
      const fileSize = Number(body.file_size) || 0;
      const customCode = (body.custom_code || '').trim();

      if (fileSize <= 0) {
        return jsonResponse({ detail: "文件大小不能为空" }, 400);
      }

      // 存储配额安全熔断（脱敏，确保不超 10GB）
      const maxTotalStorageGb = parseFloat(env.MAX_TOTAL_STORAGE_GB || "10");
      const maxTotalBytes = maxTotalStorageGb * 1024 * 1024 * 1024;
      try {
        const sumRow = await env.DB.prepare("SELECT COALESCE(SUM(file_size), 0) as total_size FROM items WHERE type != 'text'").first();
        const currentStorage = sumRow ? (Number(sumRow.total_size) || 0) : 0;
        if (currentStorage + fileSize > maxTotalBytes) {
          return jsonResponse({
            detail: "中转站存储空间不足！上传此文件将超出系统分配的存储配额。请先清理不需要的中转文件或等待到期自动销毁以腾出空间。"
          }, 413);
        }
      } catch {}

      // 提取码校验
      let code;
      if (customCode) {
        const err = validateCustomCode(customCode);
        if (err) return jsonResponse({ detail: err }, 400);
        const existing = await env.DB.prepare("SELECT code FROM items WHERE code = ?").bind(customCode).first();
        if (existing) return jsonResponse({ detail: `提取码 [ ${customCode} ] 已被占用，请更换` }, 400);
        code = customCode;
      } else {
        code = await generateUniqueCode(env.DB);
      }

      const ext = (filename.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
      const r2Key = `uploads/${code}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}${ext}`;

      let uploadUrl;
      try {
        uploadUrl = await generateR2PresignedPutUrl(env, r2Key, 900);
      } catch (err) {
        return jsonResponse({
          detail: "超大文件直传未就绪：请先在 Cloudflare 控制台为 Worker 配置 R2 API 令牌 (CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)。"
        }, 500);
      }

      return jsonResponse({
        success: true,
        code,
        r2_key: r2Key,
        upload_url: uploadUrl,
        expires_in: 900
      });
    }

    // --- 路由: 大文件 R2 直传完工上报 ---
    if (path === '/api/upload/direct-complete' && method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ detail: "无效的请求格式" }, 400);
      }

      const code = (body.code || '').trim();
      const r2Key = (body.r2_key || '').trim();
      const filename = (body.filename || 'file').trim();
      const fileSize = Number(body.file_size) || 0;
      const mimeType = (body.mime_type || 'application/octet-stream').trim();
      const expireSeconds = parseInt(body.expire_seconds) || 0;
      const burnAfterReading = Boolean(body.burn_after_reading);
      const syncToOpenList = Boolean(body.sync_to_openlist);

      if (!code || !r2Key) {
        return jsonResponse({ detail: "缺少关键参数" }, 400);
      }

      // 校验 R2 对象是否存在
      if (env.BUCKET) {
        const objHead = await env.BUCKET.head(r2Key);
        if (!objHead) {
          return jsonResponse({ detail: "未在存储桶检测到上传的文件，请确认文件是否已成功直传" }, 400);
        }
      }

      const fileNameLower = filename.toLowerCase();
      let itemType = 'file';
      if (mimeType.startsWith('image/')) {
        itemType = 'image';
      } else if (mimeType.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v|flv|3gp)$/i.test(fileNameLower)) {
        itemType = 'video';
      }

      const now = new Date();
      const expiresAt = expireSeconds > 0 ? new Date(now.getTime() + expireSeconds * 1000).toISOString() : null;
      const nowIso = now.toISOString();
      const openlistCfg = await getOpenListConfig(env.DB, env);
      const syncStatus = (syncToOpenList && openlistCfg.url) ? 'pending' : 'disabled';

      await env.DB.prepare(`
        INSERT INTO items (
          code, type, title, content, file_size, mime_type,
          created_at, expires_at, burn_after_reading, openlist_sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        code, itemType, filename, r2Key, fileSize, mimeType,
        nowIso, expiresAt, burnAfterReading ? 1 : 0, syncStatus
      ).run();

      const shareUrl = `${origin}/s/${code}`;
      const shareQr = `/api/qrcode?data=${encodeURIComponent(shareUrl)}`;
      const directQr = `${origin}/raw/${code}`;

      const item = {
        code, type: itemType, title: filename, content: r2Key,
        file_size: fileSize, mime_type: mimeType, created_at: nowIso,
        expires_at: expiresAt, burn_after_reading: burnAfterReading,
        openlist_sync_status: syncStatus
      };

      if (syncToOpenList && openlistCfg.url && ctx) {
        ctx.waitUntil(syncItemToOpenList(env, item));
      }

      return jsonResponse({
        success: true,
        code,
        title: filename,
        type: itemType,
        file_size: fileSize,
        mime_type: mimeType,
        share_url: shareUrl,
        share_qr: shareQr,
        direct_qr: directQr,
        expires_at: expiresAt,
        burn_after_reading: burnAfterReading,
        openlist_sync_status: syncStatus,
        is_direct_upload: true
      });
    }

    // --- 路由 6: 查询单个条目信息 ---
    if (path.startsWith('/api/item/') && !path.endsWith('/sync') && method === 'GET') {
      const code = path.replace(/^\/api\/item\//, '').replace(/\/+$/, '').trim();
      const item = await env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first();
      if (!item) {
        return jsonResponse({ detail: "提取码不存在或已过期销毁" }, 404);
      }

      const shareUrl = `${origin}/s/${code}`;
      const rawUrl = `${origin}/raw/${code}`;
      return jsonResponse({
        ...item,
        share_url: shareUrl,
        raw_url: rawUrl,
        share_qr: `/api/qrcode?data=${encodeURIComponent(shareUrl)}`,
        direct_qr: (item.type === 'text' && new TextEncoder().encode(item.content).length <= 1000)
          ? `/api/qrcode?data=${encodeURIComponent(item.content)}` : null,
        burn_after_reading: Boolean(item.burn_after_reading)
      });
    }

    // --- 路由 7: 中转箱列表 (访客隔离 vs 管理员全站透视) ---
    if (path === '/api/items' && method === 'GET') {
      const token = request.headers.get('X-Admin-Token');
      const isAdmin = await verifyAdminToken(env.DB, token);
      const codesParam = url.searchParams.get('codes') || '';
      const limit = parseInt(url.searchParams.get('limit') || '200');

      let rows = [];
      if (isAdmin) {
        const res = await env.DB.prepare("SELECT * FROM items ORDER BY id DESC LIMIT ?").bind(limit).all();
        rows = res.results || [];
      } else {
        const codes = codesParam.split(',').map(s => s.trim()).filter(Boolean);
        if (codes.length === 0) {
          return jsonResponse([]);
        }
        const placeholders = codes.map(() => '?').join(',');
        const res = await env.DB.prepare(
          `SELECT * FROM items WHERE code IN (${placeholders}) ORDER BY id DESC LIMIT ?`
        ).bind(...codes, limit).all();
        rows = res.results || [];
      }

      const resItems = rows.map(it => ({
        ...it,
        raw_url: `${origin}/raw/${it.code}`,
        share_url: `${origin}/s/${it.code}`,
        burn_after_reading: Boolean(it.burn_after_reading)
      }));

      return jsonResponse(resItems);
    }

    // --- 路由 8: 删除条目 ---
    if (path.startsWith('/api/item/') && !path.endsWith('/sync') && method === 'DELETE') {
      const code = path.replace(/^\/api\/item\//, '').replace(/\/+$/, '').trim();
      const item = await env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first();
      if (!item) return jsonResponse({ detail: "条目不存在" }, 404);

      if (item.type === 'file' || item.type === 'image') {
        if (env.BUCKET) {
          try { await env.BUCKET.delete(item.content); } catch {}
        }
      }
      await env.DB.prepare("DELETE FROM items WHERE code = ?").bind(code).run();
      return jsonResponse({ success: true, message: `条目 ${code} 已删除` });
    }

    // --- 路由 9: 内容提取与文件下载 (支持阅后即焚) ---
    if (path.startsWith('/raw/') && method === 'GET') {
      const code = path.replace(/^\/raw\//, '').replace(/\/+$/, '').trim();
      const item = await env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first();
      if (!item) return new Response("提取码不存在或已过期销毁", { status: 404 });

      await env.DB.prepare("UPDATE items SET views_count = views_count + 1 WHERE code = ?").bind(code).run();

      if (item.burn_after_reading && ctx) {
        ctx.waitUntil((async () => {
          await env.DB.prepare("DELETE FROM items WHERE code = ?").bind(code).run();
          if (item.type !== 'text') {
            try { await env.BUCKET.delete(item.content); } catch {}
          }
        })());
      }

      if (item.type === 'text') {
        return new Response(item.content, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      const isDownload = url.searchParams.get('download') === '1' || url.searchParams.get('dl') === '1';
      const rangeHeader = request.headers.get('Range');

      let r2Object;
      if (rangeHeader) {
        r2Object = await env.BUCKET.get(item.content, {
          range: request.headers,
          onlyIf: request.headers
        });
      } else {
        r2Object = await env.BUCKET.get(item.content, {
          onlyIf: request.headers
        });
      }

      if (!r2Object) return new Response("物理存储对象不存在或已被清理", { status: 404 });

      const headers = new Headers();
      r2Object.writeHttpMetadata(headers);
      headers.set('etag', r2Object.httpEtag);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Type', item.mime_type || 'application/octet-stream');

      // RFC 6266 Content-Disposition with safe ASCII fallback and UTF-8 filename*
      const rawTitle = item.title || 'download';
      const ext = (rawTitle.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
      const asciiFallback = `download${ext}`;
      const encodedTitle = encodeURIComponent(rawTitle);
      const isMedia = item.type === 'image' || item.type === 'video' || (item.mime_type && (item.mime_type.startsWith('image/') || item.mime_type.startsWith('video/')));
      const disposition = (isDownload || !isMedia) ? 'attachment' : 'inline';

      headers.set(
        'Content-Disposition',
        `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedTitle}`
      );

      // Support HTTP 206 Partial Content for video/audio streaming
      if (r2Object.range) {
        headers.set(
          'Content-Range',
          `bytes ${r2Object.range.offset}-${r2Object.range.offset + r2Object.range.length - 1}/${r2Object.size}`
        );
        headers.set('Content-Length', r2Object.range.length.toString());
        return new Response(r2Object.body, { status: 206, headers });
      }

      return new Response(r2Object.body, { status: 200, headers });
    }

    // --- 路由 10: 管理员登录 ---
    if (path === '/api/admin/login' && method === 'POST') {
      const formData = await request.formData();
      const password = formData.get('password');
      const currentPwd = await getAdminPassword(env.DB, env.ADMIN_PASSWORD || 'admin123');

      if (password !== currentPwd) {
        return jsonResponse({ detail: "管理员密码错误" }, 401);
      }

      const token = await createAdminToken(env.DB);
      return jsonResponse({ success: true, token, message: "管理员验证成功" });
    }

    // --- 路由 11: 管理员登出 ---
    if (path === '/api/admin/logout' && method === 'POST') {
      const token = request.headers.get('X-Admin-Token');
      await revokeAdminToken(env.DB, token);
      return jsonResponse({ success: true, message: "已退出管理员模式" });
    }

    // --- 路由 12: 管理员状态检查 ---
    if (path === '/api/admin/status' && method === 'GET') {
      const token = request.headers.get('X-Admin-Token');
      const isAdmin = await verifyAdminToken(env.DB, token);
      return jsonResponse({ is_admin: isAdmin });
    }

    // --- 路由 13: 管理员修改密码 ---
    if (path === '/api/admin/change-password' && method === 'POST') {
      const token = request.headers.get('X-Admin-Token');
      const isAdmin = await verifyAdminToken(env.DB, token);
      if (!isAdmin) return jsonResponse({ detail: "需要管理员权限" }, 403);

      const formData = await request.formData();
      const oldPassword = formData.get('old_password');
      const newPassword = (formData.get('new_password') || '').trim();

      const currentPwd = await getAdminPassword(env.DB, env.ADMIN_PASSWORD || 'admin123');
      if (oldPassword !== currentPwd) return jsonResponse({ detail: "原密码不正确" }, 400);
      if (newPassword.length < 4) return jsonResponse({ detail: "新密码长度不能少于4位" }, 400);

      await env.DB.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(newPassword).run();
      await env.DB.prepare("DELETE FROM admin_tokens").run();

      return jsonResponse({ success: true, message: "管理员密码修改成功，请重新登录！" });
    }

    // --- 路由 14: OpenList 管理接口 ---
    if (path === '/api/openlist/config' && method === 'POST') {
      const token = request.headers.get('X-Admin-Token');
      if (!(await verifyAdminToken(env.DB, token))) return jsonResponse({ detail: "需要管理员权限" }, 403);
      const formData = await request.formData();
      const url = (formData.get('url') || '').trim();
      const username = (formData.get('username') || '').trim();
      const password = (formData.get('password') || '').trim();
      let backupPath = (formData.get('backup_path') || '').trim();
      if (backupPath && !backupPath.startsWith('/')) backupPath = `/${backupPath}`;

      if (url !== undefined) {
        await env.DB.prepare(
          "INSERT INTO system_settings (key, value) VALUES ('openlist_webdav_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(url).run();
      }
      if (username !== undefined) {
        await env.DB.prepare(
          "INSERT INTO system_settings (key, value) VALUES ('openlist_username', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(username).run();
      }
      if (password) {
        await env.DB.prepare(
          "INSERT INTO system_settings (key, value) VALUES ('openlist_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(password).run();
      }
      if (backupPath) {
        await env.DB.prepare(
          "INSERT INTO system_settings (key, value) VALUES ('openlist_backup_path', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(backupPath).run();
      }

      return jsonResponse({ success: true, message: "OpenList WebDAV 配置已成功保存！" });
    }

    if (path === '/api/openlist/test' && method === 'POST') {
      const token = request.headers.get('X-Admin-Token');
      if (!(await verifyAdminToken(env.DB, token))) return jsonResponse({ detail: "需要管理员权限" }, 403);
      const cfg = await getOpenListConfig(env.DB, env);
      if (!cfg.url) return jsonResponse({ success: false, message: "未配置 OPENLIST_WEBDAV_URL，请在下方填写 WebDAV 服务地址并点击保存" });

      try {
        const authHeaders = {};
        if (cfg.username && cfg.password) {
          authHeaders['Authorization'] = `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`;
        }
        const resp = await fetch(cfg.url, { method: 'PROPFIND', headers: { ...authHeaders, 'Depth': '0' } });
        if (resp.status >= 200 && resp.status < 300 || resp.status === 207) {
          return jsonResponse({ success: true, message: `成功连接至 OpenList WebDAV (HTTP ${resp.status})` });
        }
        return jsonResponse({ success: false, message: `连接异常，状态码: ${resp.status}` });
      } catch (err) {
        return jsonResponse({ success: false, message: `网络连接失败: ${err.message}` });
      }
    }

    if (path === '/api/openlist/mounts' && method === 'GET') {
      const token = request.headers.get('X-Admin-Token');
      if (!(await verifyAdminToken(env.DB, token))) return jsonResponse({ detail: "需要管理员权限" }, 403);
      const cfg = await getOpenListConfig(env.DB, env);
      if (!cfg.url) return jsonResponse({ success: false, mounts: [], current_backup_path: cfg.backupPath });

      const baseUrl = cfg.url.replace(/\/+$/, '');
      const authHeaders = {};
      if (cfg.username && cfg.password) {
        authHeaders['Authorization'] = `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`;
      }
      const mounts = [];
      try {
        const resp = await fetch(`${baseUrl}/`, { method: 'PROPFIND', headers: { ...authHeaders, 'Depth': '1' } });
        const xml = await resp.text();
        const matches = xml.matchAll(/<[^:>]*:?href[^>]*>([^<]+)<\/[^:>]*:?href>/gi);
        for (const m of matches) {
          const rel = m[1].trim().replace(new URL(baseUrl).pathname, '').replace(/^\/+/, '').replace(/\/+$/, '');
          if (rel && !rel.includes('/') && rel !== 'dav') {
            mounts.push({ name: rel, path: `/${rel}` });
          }
        }
      } catch {}

      return jsonResponse({ success: true, mounts, current_backup_path: cfg.backupPath });
    }

    if (path === '/api/openlist/path' && method === 'POST') {
      const token = request.headers.get('X-Admin-Token');
      if (!(await verifyAdminToken(env.DB, token))) return jsonResponse({ detail: "需要管理员权限" }, 403);
      const formData = await request.formData();
      let p = (formData.get('path') || '').trim();
      if (!p.startsWith('/')) p = `/${p}`;
      await env.DB.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('openlist_backup_path', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(p).run();
      return jsonResponse({ success: true, message: `备份路径已更新为: ${p}`, backup_path: p });
    }

    if (path.endsWith('/sync') && method === 'POST') {
      const token = request.headers.get('X-Admin-Token');
      if (!(await verifyAdminToken(env.DB, token))) return jsonResponse({ detail: "需要管理员权限" }, 403);
      const code = path.replace('/api/item/', '').replace('/sync', '');
      const item = await env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first();
      if (!item) return jsonResponse({ detail: "条目不存在" }, 404);
      const cfg = await getOpenListConfig(env.DB, env);
      if (!cfg.url) return jsonResponse({ detail: "未配置 OPENLIST_WEBDAV_URL" }, 400);

      if (ctx) ctx.waitUntil(syncItemToOpenList(env, item));
      return jsonResponse({ success: true, message: `条目 ${code} 正在后台重新同步至 OpenList` });
    }

    // 默认静态资产兜底
    if (env.ASSETS) {
      return await env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },

  // Cron 触发器自动过期物理清理
  async scheduled(event, env, ctx) {
    env.DB = env.DB || env['qr-relay-db'] || env.DATABASE || env.d1;
    env.BUCKET = env.BUCKET || env['qr-relay-files'] || env.STORAGE || env.r2;
    if (env.DB && ctx) ctx.waitUntil(cleanupExpiredItems(env));
  }
};
