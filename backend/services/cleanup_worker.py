import asyncio
import logging
from ..config import settings
from ..database import get_expired_items, delete_item_by_code

logger = logging.getLogger("cleanup_worker")

async def cleanup_expired_items():
    """
    Check and remove expired items from local storage and database.
    """
    try:
        expired_items = get_expired_items()
        if not expired_items:
            return

        for item in expired_items:
            code = item["code"]
            item_type = item["type"]
            logger.info(f"正在清理过期条目: [{code}] 类型: {item_type}")

            if item_type in ["file", "image"]:
                filename = item["content"]
                file_path = settings.UPLOAD_DIR / filename
                try:
                    if file_path.exists():
                        file_path.unlink()
                except Exception as e:
                    logger.error(f"删除物理文件失败 {file_path}: {e}")

            delete_item_by_code(code)
            logger.info(f"过期条目 [{code}] 已从本地物理清理完成")
    except Exception as e:
        logger.error(f"清理守护线程异常: {e}")

async def start_cleanup_loop():
    """
    Periodic background loop for TTL cleanup.
    """
    while True:
        await asyncio.sleep(settings.AUTO_CLEANUP_INTERVAL_SECONDS)
        await cleanup_expired_items()
