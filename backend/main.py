import os
import uuid
import mimetypes
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Form, File, UploadFile, Header, Depends, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import (
    init_db, create_item, get_item_by_code, increment_views,
    delete_item_by_code, get_recent_items,
    get_admin_password, set_admin_password,
    create_admin_token, verify_admin_token, revoke_admin_token
)
from .services.qrcode_service import generate_qr_data_url, generate_qr_png_bytes
from .services.openlist_sync import sync_item_to_openlist, test_openlist_connection, list_openlist_mount_points
from .services.cleanup_worker import start_cleanup_loop

import asyncio

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = Path(__file__).resolve().parent.parent / "frontend"

@app.on_event("startup")
async def on_startup():
    init_db()
    asyncio.create_task(start_cleanup_loop())

def check_upload_auth(x_upload_password: Optional[str] = Header(None), password: Optional[str] = Form(None)):
    if not settings.UPLOAD_PASSWORD:
        return True
    provided = x_upload_password or password
    if provided != settings.UPLOAD_PASSWORD:
        raise HTTPException(status_code=403, detail="上传口令错误或未提供")
    return True

def require_admin(x_admin_token: Optional[str] = Header(None)):
    if not verify_admin_token(x_admin_token):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return True

# --- HTML Views ---

@app.get("/", response_class=HTMLResponse)
async def index_view():
    index_file = frontend_dir / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>QR-Relay 前端正在加载中...</h1>")
    return HTMLResponse(index_file.read_text(encoding="utf-8"))

@app.get("/s/{code}", response_class=HTMLResponse)
async def share_view(code: str):
    share_file = frontend_dir / "share.html"
    if not share_file.exists():
        return HTMLResponse("<h1>QR-Relay 页面加载失败</h1>")
    return HTMLResponse(share_file.read_text(encoding="utf-8"))

# --- Raw File & QR Endpoints ---

@app.get("/api/qrcode")
async def get_qrcode_image(data: str):
    """Dynamically output PNG QR code"""
    png_bytes = generate_qr_png_bytes(data)
    return Response(content=png_bytes, media_type="image/png")

@app.get("/raw/{code}")
async def raw_item_content(code: str):
    item = get_item_by_code(code)
    if not item:
        raise HTTPException(status_code=404, detail="提取码不存在或已过期销毁")

    increment_views(code)

    if item["type"] == "text":
        if item["burn_after_reading"]:
            delete_item_by_code(code)
        return Response(content=item["content"], media_type="text/plain; charset=utf-8")

    # File or Image
    local_filename = item["content"]
    file_path = settings.UPLOAD_DIR / local_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="物理文件已被清理或丢失")

    # If burn after reading, delete file and DB after reading
    if item["burn_after_reading"]:
        delete_item_by_code(code)
        # Note: we return FileResponse, then unlink file in background
        background = BackgroundTasks()
        def remove_file():
            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception:
                pass
        background.add_task(remove_file)
        return FileResponse(
            path=str(file_path),
            filename=item["title"] or local_filename,
            media_type=item["mime_type"] or "application/octet-stream",
            background=background
        )

    return FileResponse(
        path=str(file_path),
        filename=item["title"] or local_filename,
        media_type=item["mime_type"] or "application/octet-stream"
    )

# --- Admin Auth Endpoints ---

@app.post("/api/admin/login")
async def admin_login(password: str = Form(...)):
    current_pwd = get_admin_password()
    if password != current_pwd:
        raise HTTPException(status_code=401, detail="管理员密码错误")
    token = create_admin_token()
    return {"success": True, "token": token, "message": "管理员验证成功"}

@app.post("/api/admin/logout")
async def admin_logout(x_admin_token: Optional[str] = Header(None)):
    revoke_admin_token(x_admin_token)
    return {"success": True, "message": "已退出管理员模式"}

@app.get("/api/admin/status")
async def admin_status(x_admin_token: Optional[str] = Header(None)):
    return {"is_admin": verify_admin_token(x_admin_token)}

@app.post("/api/admin/change-password")
async def admin_change_password(
    old_password: str = Form(...),
    new_password: str = Form(...),
    admin_auth: bool = Depends(require_admin)
):
    current_pwd = get_admin_password()
    if old_password != current_pwd:
        raise HTTPException(status_code=400, detail="原密码不正确")
    new_password = new_password.strip()
    if len(new_password) < 4:
        raise HTTPException(status_code=400, detail="新密码长度不能少于4位")
    set_admin_password(new_password)
    return {"success": True, "message": "管理员密码修改成功，请牢记新密码！"}

# --- Public Config & OpenList Endpoints ---

@app.get("/api/config")
async def get_public_config(x_admin_token: Optional[str] = Header(None)):
    is_admin = verify_admin_token(x_admin_token)
    return {
        "app_name": settings.APP_NAME,
        "max_file_size_mb": settings.MAX_FILE_SIZE_MB,
        "require_password": bool(settings.UPLOAD_PASSWORD),
        "openlist_configured": bool(settings.OPENLIST_WEBDAV_URL),
        "openlist_backup_path": settings.OPENLIST_BACKUP_PATH if is_admin else None,
        "openlist_auto_sync": settings.OPENLIST_AUTO_SYNC,
        "is_admin": is_admin
    }

@app.post("/api/openlist/test")
async def test_openlist(admin_auth: bool = Depends(require_admin)):
    result = await test_openlist_connection()
    return result

@app.get("/api/openlist/mounts")
async def get_openlist_mounts(admin_auth: bool = Depends(require_admin)):
    mounts = await list_openlist_mount_points()
    return {
        "success": True, 
        "mounts": mounts, 
        "current_backup_path": settings.OPENLIST_BACKUP_PATH
    }

@app.post("/api/openlist/path")
async def set_openlist_path(path: str = Form(...), admin_auth: bool = Depends(require_admin)):
    path = path.strip()
    if not path.startswith("/"):
        path = f"/{path}"
    settings.OPENLIST_BACKUP_PATH = path
    return {
        "success": True, 
        "message": f"备份路径已更新为: {settings.OPENLIST_BACKUP_PATH}",
        "backup_path": settings.OPENLIST_BACKUP_PATH
    }

@app.post("/api/text")
async def create_text_relay(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    title: Optional[str] = Form(None),
    expire_seconds: Optional[int] = Form(86400), # Default 24 hours
    burn_after_reading: bool = Form(False),
    sync_to_openlist: bool = Form(True),
    custom_code: Optional[str] = Form(None),
    authorized: bool = Depends(check_upload_auth)
):
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="文本内容不能为空")

    expires_at = None
    if expire_seconds and expire_seconds > 0:
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expire_seconds)).isoformat()

    try:
        item = create_item(
            item_type="text",
            content=text,
            title=title or (text[:20] + "..." if len(text) > 20 else text),
            file_size=len(text.encode("utf-8")),
            mime_type="text/plain",
            expires_at=expires_at,
            burn_after_reading=burn_after_reading,
            sync_to_openlist=sync_to_openlist,
            custom_code=custom_code
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    share_url = f"{settings.BASE_URL.rstrip('/')}/s/{item['code']}"
    share_qr = generate_qr_data_url(share_url)
    
    # Direct QR code for text directly (useful for short text)
    direct_qr = None
    if len(text.encode("utf-8")) <= 1000:
        try:
            direct_qr = generate_qr_data_url(text)
        except Exception:
            direct_qr = None

    if sync_to_openlist and settings.OPENLIST_WEBDAV_URL:
        background_tasks.add_task(sync_item_to_openlist, item)

    return {
        "success": True,
        "code": item["code"],
        "title": item["title"],
        "share_url": share_url,
        "share_qr": share_qr,
        "direct_qr": direct_qr,
        "expires_at": item["expires_at"],
        "burn_after_reading": bool(item["burn_after_reading"]),
        "openlist_sync_status": item["openlist_sync_status"]
    }

@app.post("/api/upload")
async def upload_file_relay(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    expire_seconds: Optional[int] = Form(86400), # Default 24 hours
    burn_after_reading: bool = Form(False),
    sync_to_openlist: bool = Form(True),
    custom_code: Optional[str] = Form(None),
    authorized: bool = Depends(check_upload_auth)
):
    orig_filename = file.filename or "unknown_file"
    ext = Path(orig_filename).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = settings.UPLOAD_DIR / unique_name

    # Check and stream write
    total_bytes = 0
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    with open(dest_path, "wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024) # 1MB chunk
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                dest_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"文件大小超出限制 ({settings.MAX_FILE_SIZE_MB}MB)")
            buffer.write(chunk)

    mime_type, _ = mimetypes.guess_type(orig_filename)
    if not mime_type:
        mime_type = file.content_type or "application/octet-stream"

    item_type = "image" if mime_type.startswith("image/") else "file"

    expires_at = None
    if expire_seconds and expire_seconds > 0:
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expire_seconds)).isoformat()

    try:
        item = create_item(
            item_type=item_type,
            content=unique_name,
            title=title or orig_filename,
            file_size=total_bytes,
            mime_type=mime_type,
            expires_at=expires_at,
            burn_after_reading=burn_after_reading,
            sync_to_openlist=sync_to_openlist,
            custom_code=custom_code
        )
    except ValueError as e:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e))

    share_url = f"{settings.BASE_URL.rstrip('/')}/s/{item['code']}"
    share_qr = generate_qr_data_url(share_url)

    if sync_to_openlist and settings.OPENLIST_WEBDAV_URL:
        background_tasks.add_task(sync_item_to_openlist, item)

    return {
        "success": True,
        "code": item["code"],
        "title": item["title"],
        "type": item["type"],
        "file_size": total_bytes,
        "mime_type": mime_type,
        "share_url": share_url,
        "share_qr": share_qr,
        "expires_at": item["expires_at"],
        "burn_after_reading": bool(item["burn_after_reading"]),
        "openlist_sync_status": item["openlist_sync_status"]
    }

@app.get("/api/item/{code}")
async def get_item_info(code: str):
    item = get_item_by_code(code)
    if not item:
        raise HTTPException(status_code=404, detail="提取码不存在或已过期销毁")

    res = dict(item)
    res["raw_url"] = f"{settings.BASE_URL.rstrip('/')}/raw/{code}"
    res["share_url"] = f"{settings.BASE_URL.rstrip('/')}/s/{code}"
    res["share_qr"] = generate_qr_data_url(res["share_url"])

    if res["type"] == "text" and len(res["content"].encode("utf-8")) <= 1000:
        try:
            res["direct_qr"] = generate_qr_data_url(res["content"])
        except Exception:
            res["direct_qr"] = None
    else:
        res["direct_qr"] = None

    return res

@app.get("/api/items")
async def list_recent_items(
    codes: Optional[str] = None,
    limit: int = 200,
    x_admin_token: Optional[str] = Header(None)
):
    is_admin = verify_admin_token(x_admin_token)
    allowed = None
    if not is_admin:
        # Visitors can only view items they uploaded from their local browser
        allowed = [c.strip() for c in (codes or "").split(",") if c.strip()]

    items = get_recent_items(limit=limit, allowed_codes=allowed)
    res = []
    for it in items:
        item_dict = dict(it)
        item_dict["raw_url"] = f"{settings.BASE_URL.rstrip('/')}/raw/{it['code']}"
        item_dict["share_url"] = f"{settings.BASE_URL.rstrip('/')}/s/{it['code']}"
        res.append(item_dict)
    return res

@app.delete("/api/item/{code}")
async def delete_item(code: str, x_admin_token: Optional[str] = Header(None)):
    item = get_item_by_code(code)
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")

    if item["type"] in ["file", "image"]:
        file_path = settings.UPLOAD_DIR / item["content"]
        if file_path.exists():
            file_path.unlink(missing_ok=True)

    delete_item_by_code(code)
    return {"success": True, "message": f"条目 {code} 已删除"}

@app.post("/api/item/{code}/sync")
async def retry_sync(code: str, background_tasks: BackgroundTasks, admin_auth: bool = Depends(require_admin)):
    item = get_item_by_code(code)
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")

    if not settings.OPENLIST_WEBDAV_URL:
        raise HTTPException(status_code=400, detail="未配置 OPENLIST_WEBDAV_URL")

    background_tasks.add_task(sync_item_to_openlist, item)
    return {"success": True, "message": f"条目 {code} 正在后台重新同步至 OpenList"}
