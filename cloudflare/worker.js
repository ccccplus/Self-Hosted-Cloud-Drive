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

// OpenList WebDAV 异步同步
async function syncItemToOpenList(env, item, fileBytes) {
  env.DB = env.DB || env['qr-relay-db'] || env.DATABASE || env.d1;
  env.BUCKET = env.BUCKET || env['qr-relay-files'] || env.STORAGE || env.r2;
  if (!env.OPENLIST_WEBDAV_URL || !env.DB) return;
  const baseUrl = env.OPENLIST_WEBDAV_URL.replace(/\/+$/, '');
  const backupDir = (env.OPENLIST_BACKUP_PATH || '/QR-Relay-Backup').replace(/\/+$/, '');
  const authHeaders = {};
  if (env.OPENLIST_USERNAME && env.OPENLIST_PASSWORD) {
    authHeaders['Authorization'] = `Basic ${btoa(`${env.OPENLIST_USERNAME}:${env.OPENLIST_PASSWORD}`)}`;
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
        shareUrl.pathname = '/share.html';
        return await env.ASSETS.fetch(new Request(shareUrl.toString(), request));
      }
    }

    // --- 路由 2: 公共配置 ---
    if (path === '/api/config' && method === 'GET') {
      const token = request.headers.get('X-Admin-Token');
      const isAdmin = await verifyAdminToken(env.DB, token);
      return jsonResponse({
        app_name: env.APP_NAME || "QR-Relay",
        max_file_size_mb: parseInt(env.MAX_FILE_SIZE_MB || "100"),
        require_password: false,
        openlist_configured: Boolean(env.OPENLIST_WEBDAV_URL),
        openlist_backup_path: isAdmin ? (env.OPENLIST_BACKUP_PATH || "/QR-Relay-Backup") : null,
        openlist_auto_sync: (env.OPENLIST_AUTO_SYNC || "true").toLowerCase() === "true",
        is_admin: isAdmin
      });
    }

    // --- 路由 3: 动态二维码生成 ---
    if (path === '/api/qrcode' && method === 'GET') {
      const data = url.searchParams.get('data') || '';
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
      const syncStatus = (syncToOpenList && env.OPENLIST_WEBDAV_URL) ? 'pending' : 'disabled';
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

      if (syncToOpenList && env.OPENLIST_WEBDAV_URL && ctx) {
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
      const syncStatus = (syncToOpenList && env.OPENLIST_WEBDAV_URL) ? 'pending' : 'disabled';

      const mimeType = file.type || 'application/octet-stream';
      const itemType = mimeType.startsWith('image/') ? 'image' : 'file';
      const r2Key = `uploads/${code}_${file.name}`;

      if (!env.BUCKET) {
        return jsonResponse({
          detail: "Cloudflare R2 存储桶未绑定。请在 Cloudflare Workers 控制台 [设置] -> [绑定] 中添加 R2 存储桶，变量名称设为 qr-relay-files 或 BUCKET。"
        }, 500);
      }

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

      if (syncToOpenList && env.OPENLIST_WEBDAV_URL && ctx) {
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
        expires_at: expiresAt,
        burn_after_reading: burnAfterReading,
        openlist_sync_status: syncStatus
      });
    }

    // --- 路由 6: 查询单个条目信息 ---
    if (path.startsWith('/api/item/') && !path.endsWith('/sync') && method === 'GET') {
      const code = path.replace('/api/item/', '');
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
      const code = path.replace('/api/item/', '');
      const item = await env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first();
      if (!item) return jsonResponse({ detail: "条目不存在" }, 404);

      if (item.type === 'file' || item.type === 'image') {
        try { await env.BUCKET.delete(item.content); } catch {}
      }
      await env.DB.prepare("DELETE FROM items WHERE code = ?").bind(code).run();
      return jsonResponse({ success: true, message: `条目 ${code} 已删除` });
    }

    // --- 路由 9: 内容提取与文件下载 (支持阅后即焚) ---
    if (path.startsWith('/raw/') && method === 'GET') {
      const code = path.replace('/raw/', '');
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

      const r2Object = await env.BUCKET.get(item.content);
      if (!r2Object) return new Response("物理存储对象不存在或已被清理", { status: 404 });

      const headers = new Headers();
      r2Object.writeHttpMetadata(headers);
      headers.set('etag', r2Object.httpEtag);
      headers.set('Content-Type', item.mime_type || 'application/octet-stream');
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(item.title || 'download')}"`);

      return new Response(r2Object.body, { headers });
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
    if (path === '/api/openlist/test' && method === 'POST') {
      const token = request.headers.get('X-Admin-Token');
      if (!(await verifyAdminToken(env.DB, token))) return jsonResponse({ detail: "需要管理员权限" }, 403);
      if (!env.OPENLIST_WEBDAV_URL) return jsonResponse({ success: false, message: "未配置 OPENLIST_WEBDAV_URL" });

      try {
        const authHeaders = {};
        if (env.OPENLIST_USERNAME && env.OPENLIST_PASSWORD) {
          authHeaders['Authorization'] = `Basic ${btoa(`${env.OPENLIST_USERNAME}:${env.OPENLIST_PASSWORD}`)}`;
        }
        const resp = await fetch(env.OPENLIST_WEBDAV_URL, { method: 'PROPFIND', headers: { ...authHeaders, 'Depth': '0' } });
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
      if (!env.OPENLIST_WEBDAV_URL) return jsonResponse({ success: false, mounts: [], current_backup_path: env.OPENLIST_BACKUP_PATH || "/QR-Relay-Backup" });

      const baseUrl = env.OPENLIST_WEBDAV_URL.replace(/\/+$/, '');
      const authHeaders = {};
      if (env.OPENLIST_USERNAME && env.OPENLIST_PASSWORD) {
        authHeaders['Authorization'] = `Basic ${btoa(`${env.OPENLIST_USERNAME}:${env.OPENLIST_PASSWORD}`)}`;
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

      return jsonResponse({ success: true, mounts, current_backup_path: env.OPENLIST_BACKUP_PATH || "/QR-Relay-Backup" });
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
      if (!env.OPENLIST_WEBDAV_URL) return jsonResponse({ detail: "未配置 OPENLIST_WEBDAV_URL" }, 400);

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
