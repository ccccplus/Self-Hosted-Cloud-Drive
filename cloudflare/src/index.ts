import { Hono } from 'hono';
import { cors } from 'hono/cors';
import QRCode from 'qrcode';

// ==========================================
// Cloudflare Environment & Bindings
// ==========================================
export interface Bindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  APP_NAME?: string;
  MAX_FILE_SIZE_MB?: string;
  ADMIN_PASSWORD?: string;
  OPENLIST_WEBDAV_URL?: string;
  OPENLIST_USERNAME?: string;
  OPENLIST_PASSWORD?: string;
  OPENLIST_BACKUP_PATH?: string;
  OPENLIST_AUTO_SYNC?: string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// ==========================================
// Helper Functions
// ==========================================

// 6-digit random code generation with collision check
async function generateUniqueCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await db.prepare("SELECT code FROM items WHERE code = ?").bind(code).first();
    if (!existing) return code;
  }
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function validateCustomCode(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length < 4 || trimmed.length > 32) {
    return "自定义口令长度需在 4-32 位之间";
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return "自定义口令仅支持字母、数字、下划线(_)或短横线(-)";
  }
  return null;
}

async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
  } catch {
    return '';
  }
}

async function getAdminPassword(db: D1Database, defaultPwd = 'admin123'): Promise<string> {
  try {
    const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'admin_password'").first<{ value: string }>();
    if (row && row.value) return row.value;
  } catch {}
  return defaultPwd;
}

async function verifyAdminToken(db: D1Database, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const row = await db.prepare("SELECT token FROM admin_tokens WHERE token = ?").bind(token).first();
    return Boolean(row);
  } catch {
    return false;
  }
}

async function createAdminToken(db: D1Database): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO admin_tokens (token, created_at) VALUES (?, ?)").bind(token, now).run();
  return token;
}

async function revokeAdminToken(db: D1Database, token: string | null | undefined): Promise<void> {
  if (!token) return;
  try {
    await db.prepare("DELETE FROM admin_tokens WHERE token = ?").bind(token).run();
  } catch {}
}

function getBaseUrl(c: any): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// OpenList Helpers
function getOpenListHeaders(env: Bindings): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.OPENLIST_USERNAME && env.OPENLIST_PASSWORD) {
    const creds = btoa(`${env.OPENLIST_USERNAME}:${env.OPENLIST_PASSWORD}`);
    headers['Authorization'] = `Basic ${creds}`;
  }
  return headers;
}

async function syncItemToOpenList(env: Bindings, item: any, fileBytes?: ArrayBuffer): Promise<void> {
  if (!env.OPENLIST_WEBDAV_URL) return;
  const baseUrl = env.OPENLIST_WEBDAV_URL.replace(/\/+$/, '');
  const backupDir = (env.OPENLIST_BACKUP_PATH || '/QR-Relay-Backup').replace(/\/+$/, '');
  const authHeaders = getOpenListHeaders(env);

  try {
    // 1. Ensure backup directory exists (MKCOL)
    try {
      await fetch(`${baseUrl}${backupDir}/`, {
        method: 'MKCOL',
        headers: authHeaders
      });
    } catch {}

    // 2. Upload file via PUT
    let targetFilename = '';
    let uploadBody: any = null;

    if (item.type === 'text') {
      targetFilename = `${item.code}_${(item.title || '文本备忘').slice(0, 30)}.txt`;
      uploadBody = item.content;
    } else {
      targetFilename = `${item.code}_${item.title || 'upload.dat'}`;
      if (fileBytes) {
        uploadBody = fileBytes;
      } else {
        const obj = await env.BUCKET.get(item.content);
        if (!obj) throw new Error("R2 物理文件不存在");
        uploadBody = await obj.arrayBuffer();
      }
    }

    const targetUrl = `${baseUrl}${backupDir}/${encodeURIComponent(targetFilename)}`;
    const putResp = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'Content-Type': item.mime_type || 'application/octet-stream'
      },
      body: uploadBody
    });

    const now = new Date().toISOString();
    if (putResp.status >= 200 && putResp.status < 300 || putResp.status === 201 || putResp.status === 204) {
      await env.DB.prepare(
        "UPDATE items SET openlist_sync_status = 'synced', openlist_sync_time = ?, openlist_sync_error = NULL WHERE code = ?"
      ).bind(now, item.code).run();
    } else {
      const errText = `HTTP ${putResp.status}`;
      await env.DB.prepare(
        "UPDATE items SET openlist_sync_status = 'failed', openlist_sync_time = ?, openlist_sync_error = ? WHERE code = ?"
      ).bind(now, errText, item.code).run();
    }
  } catch (err: any) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE items SET openlist_sync_status = 'failed', openlist_sync_time = ?, openlist_sync_error = ? WHERE code = ?"
    ).bind(now, err.message || 'Sync error', item.code).run();
  }
}

// Cleanup Expired Items
async function cleanupExpiredItems(env: Bindings): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare(
      "SELECT * FROM items WHERE expires_at IS NOT NULL AND expires_at <= ?"
    ).bind(now).all();

    if (!results || results.length === 0) return;

    for (const it of results) {
      if (it.type === 'file' || it.type === 'image') {
        try {
          await env.BUCKET.delete(it.content as string);
        } catch {}
      }
      await env.DB.prepare("DELETE FROM items WHERE code = ?").bind(it.code).run();
    }
  } catch {}
}

// ==========================================
// Application Routes
// ==========================================

// --- Static Pages Proxy ---
app.get('/s/:code', async (c) => {
  if (c.env.ASSETS) {
    const url = new URL(c.req.url);
    url.pathname = '/share.html';
    return await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }
  return c.text('Share page asset not found', 404);
});

// --- Public Config ---
app.get('/api/config', async (c) => {
  const token = c.req.header('X-Admin-Token');
  const isAdmin = await verifyAdminToken(c.env.DB, token);

  return c.json({
    app_name: c.env.APP_NAME || "QR-Relay",
    max_file_size_mb: parseInt(c.env.MAX_FILE_SIZE_MB || "100"),
    require_password: false,
    openlist_configured: Boolean(c.env.OPENLIST_WEBDAV_URL),
    openlist_backup_path: isAdmin ? (c.env.OPENLIST_BACKUP_PATH || "/QR-Relay-Backup") : null,
    openlist_auto_sync: (c.env.OPENLIST_AUTO_SYNC || "true").toLowerCase() === "true",
    is_admin: isAdmin
  });
});

// --- Dynamic QR Code Image ---
app.get('/api/qrcode', async (c) => {
  const data = c.req.query('data') || '';
  if (!data) return c.text('Missing data', 400);

  const pngBuffer = await QRCode.toBuffer(data, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M'
  });

  return new Response(pngBuffer, {
    headers: { 'Content-Type': 'image/png' }
  });
});

// --- Submit Text ---
app.post('/api/text', async (c) => {
  const formData = await c.req.formData();
  const text = (formData.get('text') as string || '').trim();
  const title = (formData.get('title') as string || '').trim();
  const customCode = (formData.get('custom_code') as string || '').trim();
  const expireSeconds = formData.get('expire_seconds') ? parseInt(formData.get('expire_seconds') as string) : 86400;
  const burnAfterReading = formData.get('burn_after_reading') === 'true';
  const syncToOpenList = formData.get('sync_to_openlist') === 'true';

  if (!text) {
    return c.json({ detail: "文本内容不能为空" }, 400);
  }

  let code = '';
  if (customCode) {
    const err = validateCustomCode(customCode);
    if (err) return c.json({ detail: err }, 400);
    const existing = await c.env.DB.prepare("SELECT code FROM items WHERE code = ?").bind(customCode).first();
    if (existing) return c.json({ detail: `提取码 [ ${customCode} ] 已被占用，请更换` }, 400);
    code = customCode;
  } else {
    code = await generateUniqueCode(c.env.DB);
  }

  const now = new Date();
  const expiresAt = expireSeconds > 0 ? new Date(now.getTime() + expireSeconds * 1000).toISOString() : null;
  const nowIso = now.toISOString();
  const syncStatus = (syncToOpenList && c.env.OPENLIST_WEBDAV_URL) ? 'pending' : 'disabled';
  const itemTitle = title || (text.length > 20 ? text.slice(0, 20) + '...' : text);

  await c.env.DB.prepare(`
    INSERT INTO items (
      code, type, title, content, file_size, mime_type,
      created_at, expires_at, burn_after_reading, openlist_sync_status
    ) VALUES (?, 'text', ?, ?, ?, 'text/plain', ?, ?, ?, ?)
  `).bind(
    code, itemTitle, text, new TextEncoder().encode(text).length,
    nowIso, expiresAt, burnAfterReading ? 1 : 0, syncStatus
  ).run();

  const baseUrl = getBaseUrl(c);
  const shareUrl = `${baseUrl}/s/${code}`;
  const shareQr = await generateQrDataUrl(shareUrl);
  const directQr = new TextEncoder().encode(text).length <= 1000 ? await generateQrDataUrl(text) : null;

  const item = {
    code, type: 'text', title: itemTitle, content: text,
    file_size: new TextEncoder().encode(text).length,
    mime_type: 'text/plain', created_at: nowIso, expires_at: expiresAt,
    burn_after_reading: burnAfterReading, openlist_sync_status: syncStatus
  };

  if (syncToOpenList && c.env.OPENLIST_WEBDAV_URL) {
    c.executionCtx.waitUntil(syncItemToOpenList(c.env, item));
  }

  return c.json({
    success: true,
    code,
    title: itemTitle,
    share_url: shareUrl,
    share_qr: shareQr,
    direct_qr: directQr,
    expires_at: expiresAt,
    burn_after_reading: burnAfterReading
  });
});

// --- Upload File ---
app.post('/api/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return c.json({ detail: "请选择有效的文件" }, 400);
  }

  const customCode = (formData.get('custom_code') as string || '').trim();
  const expireSeconds = formData.get('expire_seconds') ? parseInt(formData.get('expire_seconds') as string) : 86400;
  const burnAfterReading = formData.get('burn_after_reading') === 'true';
  const syncToOpenList = formData.get('sync_to_openlist') === 'true';

  let code = '';
  if (customCode) {
    const err = validateCustomCode(customCode);
    if (err) return c.json({ detail: err }, 400);
    const existing = await c.env.DB.prepare("SELECT code FROM items WHERE code = ?").bind(customCode).first();
    if (existing) return c.json({ detail: `提取码 [ ${customCode} ] 已被占用，请更换` }, 400);
    code = customCode;
  } else {
    code = await generateUniqueCode(c.env.DB);
  }

  const now = new Date();
  const expiresAt = expireSeconds > 0 ? new Date(now.getTime() + expireSeconds * 1000).toISOString() : null;
  const nowIso = now.toISOString();
  const syncStatus = (syncToOpenList && c.env.OPENLIST_WEBDAV_URL) ? 'pending' : 'disabled';

  const mimeType = file.type || 'application/octet-stream';
  const itemType = mimeType.startsWith('image/') ? 'image' : 'file';
  const r2Key = `uploads/${code}_${file.name}`;

  // Stream directly to Cloudflare R2
  const fileBuffer = await file.arrayBuffer();
  await c.env.BUCKET.put(r2Key, fileBuffer, {
    httpMetadata: {
      contentType: mimeType
    }
  });

  await c.env.DB.prepare(`
    INSERT INTO items (
      code, type, title, content, file_size, mime_type,
      created_at, expires_at, burn_after_reading, openlist_sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    code, itemType, file.name, r2Key, file.size, mimeType,
    nowIso, expiresAt, burnAfterReading ? 1 : 0, syncStatus
  ).run();

  const baseUrl = getBaseUrl(c);
  const shareUrl = `${baseUrl}/s/${code}`;
  const shareQr = await generateQrDataUrl(shareUrl);

  const item = {
    code, type: itemType, title: file.name, content: r2Key,
    file_size: file.size, mime_type: mimeType, created_at: nowIso,
    expires_at: expiresAt, burn_after_reading: burnAfterReading,
    openlist_sync_status: syncStatus
  };

  if (syncToOpenList && c.env.OPENLIST_WEBDAV_URL) {
    c.executionCtx.waitUntil(syncItemToOpenList(c.env, item, fileBuffer));
  }

  return c.json({
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
});

// --- Get Item Info ---
app.get('/api/item/:code', async (c) => {
  const code = c.req.param('code');
  const item = await c.env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first<any>();

  if (!item) {
    return c.json({ detail: "提取码不存在或已过期销毁" }, 404);
  }

  const baseUrl = getBaseUrl(c);
  const shareUrl = `${baseUrl}/s/${code}`;
  const rawUrl = `${baseUrl}/raw/${code}`;
  const shareQr = await generateQrDataUrl(shareUrl);
  const directQr = (item.type === 'text' && new TextEncoder().encode(item.content).length <= 1000)
    ? await generateQrDataUrl(item.content)
    : null;

  return c.json({
    ...item,
    share_url: shareUrl,
    raw_url: rawUrl,
    share_qr: shareQr,
    direct_qr: directQr,
    burn_after_reading: Boolean(item.burn_after_reading)
  });
});

// --- List Recent Items (Visitor Isolation vs Admin Penetration) ---
app.get('/api/items', async (c) => {
  const token = c.req.header('X-Admin-Token');
  const isAdmin = await verifyAdminToken(c.env.DB, token);
  const codesParam = c.req.query('codes') || '';
  const limit = parseInt(c.req.query('limit') || '200');

  let rows: any[] = [];
  if (isAdmin) {
    const res = await c.env.DB.prepare("SELECT * FROM items ORDER BY id DESC LIMIT ?").bind(limit).all();
    rows = res.results || [];
  } else {
    const codes = codesParam.split(',').map(s => s.trim()).filter(Boolean);
    if (codes.length === 0) {
      return c.json([]);
    }
    const placeholders = codes.map(() => '?').join(',');
    const res = await c.env.DB.prepare(
      `SELECT * FROM items WHERE code IN (${placeholders}) ORDER BY id DESC LIMIT ?`
    ).bind(...codes, limit).all();
    rows = res.results || [];
  }

  const baseUrl = getBaseUrl(c);
  const resItems = rows.map(it => ({
    ...it,
    raw_url: `${baseUrl}/raw/${it.code}`,
    share_url: `${baseUrl}/s/${it.code}`,
    burn_after_reading: Boolean(it.burn_after_reading)
  }));

  return c.json(resItems);
});

// --- Delete Item ---
app.delete('/api/item/:code', async (c) => {
  const code = c.req.param('code');
  const item = await c.env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first<any>();

  if (!item) {
    return c.json({ detail: "条目不存在" }, 404);
  }

  if (item.type === 'file' || item.type === 'image') {
    try {
      await c.env.BUCKET.delete(item.content);
    } catch {}
  }

  await c.env.DB.prepare("DELETE FROM items WHERE code = ?").bind(code).run();
  return c.json({ success: true, message: `条目 ${code} 已删除` });
});

// --- Raw Download / View Content ---
app.get('/raw/:code', async (c) => {
  const code = c.req.param('code');
  const item = await c.env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first<any>();

  if (!item) {
    return c.text("提取码不存在或已过期销毁", 404);
  }

  // Increment view count
  await c.env.DB.prepare("UPDATE items SET views_count = views_count + 1 WHERE code = ?").bind(code).run();

  // If Burn After Reading: Delete after response completes
  if (item.burn_after_reading) {
    c.executionCtx.waitUntil((async () => {
      await c.env.DB.prepare("DELETE FROM items WHERE code = ?").bind(code).run();
      if (item.type !== 'text') {
        try {
          await c.env.BUCKET.delete(item.content);
        } catch {}
      }
    })());
  }

  if (item.type === 'text') {
    return new Response(item.content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }

  // File or Image from Cloudflare R2
  const r2Object = await c.env.BUCKET.get(item.content);
  if (!r2Object) {
    return c.text("物理存储对象不存在或已被清理", 404);
  }

  const headers = new Headers();
  r2Object.writeHttpMetadata(headers);
  headers.set('etag', r2Object.httpEtag);
  headers.set('Content-Type', item.mime_type || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(item.title || 'download')}"`);

  return new Response(r2Object.body, { headers });
});

// --- Admin Authentication Endpoints ---

app.post('/api/admin/login', async (c) => {
  const formData = await c.req.formData();
  const password = formData.get('password') as string;
  const currentPwd = await getAdminPassword(c.env.DB, c.env.ADMIN_PASSWORD || 'admin123');

  if (password !== currentPwd) {
    return c.json({ detail: "管理员密码错误" }, 401);
  }

  const token = await createAdminToken(c.env.DB);
  return c.json({ success: true, token, message: "管理员验证成功" });
});

app.post('/api/admin/logout', async (c) => {
  const token = c.req.header('X-Admin-Token');
  await revokeAdminToken(c.env.DB, token);
  return c.json({ success: true, message: "已退出管理员模式" });
});

app.get('/api/admin/status', async (c) => {
  const token = c.req.header('X-Admin-Token');
  const isAdmin = await verifyAdminToken(c.env.DB, token);
  return c.json({ is_admin: isAdmin });
});

app.post('/api/admin/change-password', async (c) => {
  const token = c.req.header('X-Admin-Token');
  const isAdmin = await verifyAdminToken(c.env.DB, token);
  if (!isAdmin) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }

  const formData = await c.req.formData();
  const oldPassword = formData.get('old_password') as string;
  const newPassword = (formData.get('new_password') as string || '').trim();

  const currentPwd = await getAdminPassword(c.env.DB, c.env.ADMIN_PASSWORD || 'admin123');
  if (oldPassword !== currentPwd) {
    return c.json({ detail: "原密码不正确" }, 400);
  }
  if (newPassword.length < 4) {
    return c.json({ detail: "新密码长度不能少于4位" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO system_settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(newPassword).run();

  // Invalidate all existing admin tokens
  await c.env.DB.prepare("DELETE FROM admin_tokens").run();

  return c.json({ success: true, message: "管理员密码修改成功，请重新登录！" });
});

// --- OpenList Admin Operations ---

app.post('/api/openlist/test', async (c) => {
  const token = c.req.header('X-Admin-Token');
  if (!(await verifyAdminToken(c.env.DB, token))) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }

  if (!c.env.OPENLIST_WEBDAV_URL) {
    return c.json({ success: false, message: "未配置 OPENLIST_WEBDAV_URL 环境变量" });
  }

  try {
    const headers = getOpenListHeaders(c.env);
    headers['Depth'] = '0';
    const resp = await fetch(c.env.OPENLIST_WEBDAV_URL, {
      method: 'PROPFIND',
      headers
    });
    if (resp.status >= 200 && resp.status < 300 || resp.status === 207) {
      return c.json({ success: true, message: `成功连接至 OpenList WebDAV (HTTP ${resp.status})` });
    }
    return c.json({ success: false, message: `连接异常，服务器响应状态码: ${resp.status}` });
  } catch (err: any) {
    return c.json({ success: false, message: `网络连接失败: ${err.message}` });
  }
});

app.get('/api/openlist/mounts', async (c) => {
  const token = c.req.header('X-Admin-Token');
  if (!(await verifyAdminToken(c.env.DB, token))) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }

  if (!c.env.OPENLIST_WEBDAV_URL) {
    return c.json({ success: false, mounts: [], current_backup_path: c.env.OPENLIST_BACKUP_PATH || "/QR-Relay-Backup" });
  }

  const baseUrl = c.env.OPENLIST_WEBDAV_URL.replace(/\/+$/, '');
  const authHeaders = getOpenListHeaders(c.env);
  const mounts: { name: string; path: string }[] = [];

  try {
    const resp = await fetch(`${baseUrl}/`, {
      method: 'PROPFIND',
      headers: { ...authHeaders, 'Depth': '1' }
    });
    const xml = await resp.text();
    const hrefMatches = xml.matchAll(/<[^:>]*:?href[^>]*>([^<]+)<\/[^:>]*:?href>/gi);
    for (const m of hrefMatches) {
      const p = m[1].trim();
      const relative = p.replace(new URL(baseUrl).pathname, '').replace(/^\/+/, '').replace(/\/+$/, '');
      if (relative && !relative.includes('/') && relative !== 'dav') {
        mounts.push({ name: relative, path: `/${relative}` });
      }
    }
  } catch {}

  return c.json({
    success: true,
    mounts,
    current_backup_path: c.env.OPENLIST_BACKUP_PATH || "/QR-Relay-Backup"
  });
});

app.post('/api/openlist/path', async (c) => {
  const token = c.req.header('X-Admin-Token');
  if (!(await verifyAdminToken(c.env.DB, token))) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }

  const formData = await c.req.formData();
  let path = (formData.get('path') as string || '').trim();
  if (!path.startsWith('/')) path = `/${path}`;

  await c.env.DB.prepare(
    "INSERT INTO system_settings (key, value) VALUES ('openlist_backup_path', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(path).run();

  return c.json({ success: true, message: `备份路径已更新为: ${path}`, backup_path: path });
});

app.post('/api/item/:code/sync', async (c) => {
  const token = c.req.header('X-Admin-Token');
  if (!(await verifyAdminToken(c.env.DB, token))) {
    return c.json({ detail: "需要管理员权限" }, 403);
  }

  const code = c.req.param('code');
  const item = await c.env.DB.prepare("SELECT * FROM items WHERE code = ?").bind(code).first<any>();
  if (!item) return c.json({ detail: "条目不存在" }, 404);

  if (!c.env.OPENLIST_WEBDAV_URL) {
    return c.json({ detail: "未配置 OPENLIST_WEBDAV_URL" }, 400);
  }

  c.executionCtx.waitUntil(syncItemToOpenList(c.env, item));
  return c.json({ success: true, message: `条目 ${code} 正在后台重新同步至 OpenList` });
});

// ==========================================
// Cloudflare Worker Default Export
// ==========================================
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupExpiredItems(env));
  }
};
