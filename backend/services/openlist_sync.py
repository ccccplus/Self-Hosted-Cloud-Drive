import os
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Tuple
import httpx
from ..config import settings
from ..database import update_sync_status

import urllib.parse

async def ensure_webdav_directory(client: httpx.AsyncClient, base_url: str, relative_path: str):
    """
    Ensure directories exist on WebDAV server by sending MKCOL for each segment.
    """
    parts = [p for p in relative_path.strip("/").split("/") if p]
    current_path = ""
    for part in parts:
        quoted_part = urllib.parse.quote(part)
        current_path += f"/{quoted_part}"
        mkcol_url = f"{base_url.rstrip('/')}{current_path}"
        try:
            resp = await client.request("MKCOL", mkcol_url)
            # 201 Created is success, 405 Method Not Allowed / 301 / 409 usually means already exists or handled
        except Exception:
            pass

async def sync_item_to_openlist(item: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Syncs a text note or uploaded file to OpenList via WebDAV.
    """
    if not settings.OPENLIST_WEBDAV_URL:
        update_sync_status(item["code"], "disabled", "OpenList WebDAV 未配置")
        return False, "OpenList WebDAV 未配置"

    auth = None
    if settings.OPENLIST_USERNAME and settings.OPENLIST_PASSWORD:
        auth = (settings.OPENLIST_USERNAME, settings.OPENLIST_PASSWORD)

    base_dav_url = settings.OPENLIST_WEBDAV_URL.rstrip("/")
    month_folder = datetime.now().strftime("%Y-%m")
    target_dir = f"{settings.OPENLIST_BACKUP_PATH.rstrip('/')}/{month_folder}"
    
    code = item["code"]
    item_type = item["type"]
    title = item.get("title") or "note"

    try:
        async with httpx.AsyncClient(auth=auth, timeout=60.0, verify=False) as client:
            # 1. Ensure backup directory exists
            await ensure_webdav_directory(client, base_dav_url, target_dir)

            # 2. Prepare payload
            if item_type == "text":
                filename = f"{code}_{title}.txt"
                if not filename.endswith(".txt") and not filename.endswith(".md"):
                    filename += ".txt"
                
                header = (
                    f"==================================================\n"
                    f"QR-Relay 文本备份 [提取码: {code}]\n"
                    f"创建时间: {item.get('created_at')}\n"
                    f"标题: {item.get('title') or '无标题'}\n"
                    f"==================================================\n\n"
                )
                file_bytes = (header + (item.get("content") or "")).encode("utf-8")
                headers = {"Content-Type": "text/plain; charset=utf-8"}
                encoded_dir = "/".join(urllib.parse.quote(p) for p in target_dir.strip("/").split("/") if p)
                encoded_file = urllib.parse.quote(filename)
                upload_url = f"{base_dav_url}/{encoded_dir}/{encoded_file}"
                resp = await client.put(upload_url, content=file_bytes, headers=headers)
                resp.raise_for_status()

            else:
                # File or Image
                local_filename = item["content"]
                local_path = settings.UPLOAD_DIR / local_filename
                if not local_path.exists():
                    raise FileNotFoundError(f"本地文件不存在: {local_filename}")

                clean_title = (item.get("title") or local_filename).replace("/", "_")
                filename = f"{code}_{clean_title}"
                encoded_dir = "/".join(urllib.parse.quote(p) for p in target_dir.strip("/").split("/") if p)
                encoded_file = urllib.parse.quote(filename)
                upload_url = f"{base_dav_url}/{encoded_dir}/{encoded_file}"

                # Stream upload
                with open(local_path, "rb") as f:
                    file_content = f.read()

                headers = {"Content-Type": item.get("mime_type") or "application/octet-stream"}
                resp = await client.put(upload_url, content=file_content, headers=headers)
                resp.raise_for_status()

        update_sync_status(code, "synced")
        return True, "同步成功"

    except Exception as e:
        err_msg = str(e)
        update_sync_status(code, "failed", err_msg)
        return False, err_msg

async def test_openlist_connection() -> Dict[str, Any]:
    """
    Test connectivity and credentials for OpenList WebDAV.
    """
    if not settings.OPENLIST_WEBDAV_URL:
        return {"success": False, "message": "未配置 OPENLIST_WEBDAV_URL"}

    auth = None
    if settings.OPENLIST_USERNAME and settings.OPENLIST_PASSWORD:
        auth = (settings.OPENLIST_USERNAME, settings.OPENLIST_PASSWORD)

    base_url = settings.OPENLIST_WEBDAV_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(auth=auth, timeout=10.0, verify=False) as client:
            resp = await client.request("PROPFIND", base_url, headers={"Depth": "0"})
            if resp.status_code in [200, 207, 301, 302]:
                return {"success": True, "message": f"连接成功 (HTTP {resp.status_code})"}
            # Sometimes GET works if PROPFIND is restricted
            get_resp = await client.get(base_url)
            if get_resp.status_code in [200, 401, 403, 405]:
                if get_resp.status_code in [401, 403]:
                    return {"success": False, "message": f"认证失败，请检查账号密码 (HTTP {get_resp.status_code})"}
                return {"success": True, "message": f"服务可达 (HTTP {get_resp.status_code})"}
            return {"success": False, "message": f"WebDAV 返回状态码异常: {resp.status_code}"}
    except Exception as e:
        return {"success": False, "message": f"连接异常: {str(e)}"}

async def list_openlist_mount_points():
    """
    List all mounted root folders (cloud drives) in OpenList via WebDAV PROPFIND (Depth: 1).
    """
    import xml.etree.ElementTree as ET
    if not settings.OPENLIST_WEBDAV_URL:
        return []

    auth = None
    if settings.OPENLIST_USERNAME and settings.OPENLIST_PASSWORD:
        auth = (settings.OPENLIST_USERNAME, settings.OPENLIST_PASSWORD)

    base_url = settings.OPENLIST_WEBDAV_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(auth=auth, timeout=10.0, verify=False) as client:
            resp = await client.request("PROPFIND", base_url + "/", headers={"Depth": "1"})
            if resp.status_code not in [200, 207]:
                return []

            root = ET.fromstring(resp.text)
            mounts = []
            dav_path = urllib.parse.urlparse(base_url).path.rstrip("/")
            for response in root.findall("{DAV:}response"):
                href_el = response.find("{DAV:}href")
                if href_el is not None and href_el.text:
                    href = urllib.parse.unquote(href_el.text.rstrip("/"))
                    if href.startswith(dav_path):
                        sub = href[len(dav_path):].strip("/")
                        if sub and "/" not in sub:
                            mounts.append({"name": sub, "path": f"/{sub}"})
            return mounts
    except Exception:
        return []
