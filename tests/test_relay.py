import asyncio
import os
import sys
import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.config import settings
from backend.database import (
    init_db, create_item, get_item_by_code, increment_views,
    delete_item_by_code, get_recent_items, get_expired_items,
    update_sync_status, generate_pickup_code
)
from backend.services.cleanup_worker import cleanup_expired_items

class TestQRRelayCore(unittest.TestCase):

    def setUp(self):
        settings.DB_PATH = BASE_DIR / "data" / "test_relay.db"
        if settings.DB_PATH.exists():
            settings.DB_PATH.unlink()
        init_db()

    def tearDown(self):
        if settings.DB_PATH.exists():
            settings.DB_PATH.unlink()

    def test_config_defaults(self):
        self.assertEqual(settings.APP_NAME, "QR-Relay")
        self.assertEqual(settings.PORT, 8080)
        self.assertEqual(settings.OPENLIST_BACKUP_PATH, "/QR-Relay-Backup")

    def test_pickup_code_generation(self):
        codes = set()
        for i in range(30):
            item = create_item(
                item_type="text",
                content=f"Item {i}",
                sync_to_openlist=False
            )
            # Default pickup code must strictly be 6 digits
            self.assertEqual(len(item["code"]), 6)
            self.assertTrue(item["code"].isdigit())
            codes.add(item["code"])
        # With items in the database, all generated codes must be strictly distinct
        self.assertEqual(len(codes), 30)

    def test_custom_pickup_code(self):
        item = create_item(
            item_type="text",
            content="Custom Code Content",
            custom_code="666888",
            sync_to_openlist=False
        )
        self.assertEqual(item["code"], "666888")

        # Duplicate custom code must raise ValueError
        with self.assertRaises(ValueError):
            create_item(
                item_type="text",
                content="Another content with same code",
                custom_code="666888",
                sync_to_openlist=False
            )

    def test_create_and_fetch_text_item(self):
        item = create_item(
            item_type="text",
            content="测试文本内容：WiFi密码 12345678",
            title="WiFi备忘",
            file_size=36,
            expires_at=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            burn_after_reading=False,
            sync_to_openlist=False
        )
        self.assertIsNotNone(item)
        self.assertIn("code", item)
        self.assertEqual(item["type"], "text")
        self.assertEqual(item["title"], "WiFi备忘")

        fetched = get_item_by_code(item["code"])
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["content"], "测试文本内容：WiFi密码 12345678")

    def test_increment_views_and_delete(self):
        item = create_item(
            item_type="text",
            content="View count test",
            sync_to_openlist=False
        )
        code = item["code"]
        self.assertEqual(increment_views(code), 1)
        self.assertEqual(increment_views(code), 2)

        self.assertTrue(delete_item_by_code(code))
        self.assertIsNone(get_item_by_code(code))

    def test_physical_file_ttl_cleanup(self):
        # 1. Create a dummy upload file on disk
        test_filename = "test_upload_to_expire.dat"
        test_file_path = settings.UPLOAD_DIR / test_filename
        with open(test_file_path, "wb") as f:
            f.write(b"Temp dummy file data for testing")
        self.assertTrue(test_file_path.exists())

        # 2. Register item with past expiration
        past_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        item = create_item(
            item_type="file",
            content=test_filename,
            title="test_file.dat",
            file_size=32,
            expires_at=past_time,
            sync_to_openlist=False
        )
        code = item["code"]

        # 3. Check that it is detected as expired
        expired = get_expired_items()
        self.assertTrue(any(it["code"] == code for it in expired))

        # 4. Trigger cleanup worker
        asyncio.run(cleanup_expired_items())

        # 5. Verify physical file is unlinked and DB row is deleted
        self.assertFalse(test_file_path.exists(), "物理过期文件应该被从磁盘删除")
        self.assertIsNone(get_item_by_code(code), "数据库记录应该被删除")

    def test_openlist_sync_state_transitions(self):
        item = create_item(
            item_type="text",
            content="OpenList Sync Test",
            sync_to_openlist=True
        )
        code = item["code"]
        # When OPENLIST_WEBDAV_URL is empty, status defaults to disabled
        self.assertEqual(item["openlist_sync_status"], "disabled")

        # Simulate update to synced
        update_sync_status(code, "synced")
        fetched = get_item_by_code(code)
        self.assertEqual(fetched["openlist_sync_status"], "synced")
        self.assertIsNotNone(fetched["openlist_sync_time"])

        # Simulate update to failed
        update_sync_status(code, "failed", "Connection timeout to OpenList")
        fetched = get_item_by_code(code)
        self.assertEqual(fetched["openlist_sync_status"], "failed")
        self.assertEqual(fetched["openlist_sync_error"], "Connection timeout to OpenList")

    def test_burn_after_reading(self):
        item = create_item(
            item_type="text",
            content="Top Secret Token: xyz-12345",
            burn_after_reading=True,
            sync_to_openlist=False
        )
        code = item["code"]
        fetched = get_item_by_code(code)
        self.assertEqual(fetched["burn_after_reading"], 1)

    def test_recent_items_order_and_limit(self):
        for i in range(5):
            create_item(
                item_type="text",
                content=f"History note {i}",
                title=f"Note {i}",
                sync_to_openlist=False
            )
        recents = get_recent_items(limit=3)
        self.assertEqual(len(recents), 3)
        # Verify descending order (latest first)
        self.assertGreater(recents[0]["id"], recents[1]["id"])

    def test_visitor_items_filtering(self):
        it1 = create_item(item_type="text", content="User 1 Note", sync_to_openlist=False)
        it2 = create_item(item_type="text", content="User 2 Note", sync_to_openlist=False)

        # Visitor with empty codes sees nothing
        self.assertEqual(get_recent_items(allowed_codes=[]), [])

        # Visitor with only it1's code sees only it1
        filtered = get_recent_items(allowed_codes=[it1["code"]])
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["code"], it1["code"])

        # Admin (allowed_codes=None) sees all
        all_items = get_recent_items(allowed_codes=None)
        codes = [it["code"] for it in all_items]
        self.assertIn(it1["code"], codes)
        self.assertIn(it2["code"], codes)

    def test_admin_api_endpoints(self):
        from fastapi.testclient import TestClient
        from backend.main import app

        client = TestClient(app)

        # 1. Non-admin accessing OpenList test -> 403
        r = client.post('/api/openlist/test')
        self.assertEqual(r.status_code, 403)

        # 2. Wrong admin password -> 401
        r = client.post('/api/admin/login', data={'password': 'wrongpassword'})
        self.assertEqual(r.status_code, 401)

        # 3. Correct admin password -> 200 & returns token
        r = client.post('/api/admin/login', data={'password': 'admin123'})
        self.assertEqual(r.status_code, 200)
        token = r.json()['token']
        self.assertTrue(bool(token))

        # 4. Admin status with token -> is_admin=True
        r = client.get('/api/admin/status', headers={'X-Admin-Token': token})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['is_admin'])

        # 5. OpenList test with admin token -> 200
        r = client.post('/api/openlist/test', headers={'X-Admin-Token': token})
        self.assertEqual(r.status_code, 200)

        # 6. Change admin password
        r = client.post(
            '/api/admin/change-password',
            headers={'X-Admin-Token': token},
            data={'old_password': 'admin123', 'new_password': 'test_admin_pass'}
        )
        self.assertEqual(r.status_code, 200)

        # 7. Old password no longer works
        r = client.post('/api/admin/login', data={'password': 'admin123'})
        self.assertEqual(r.status_code, 401)

        # 8. New password works
        r = client.post('/api/admin/login', data={'password': 'test_admin_pass'})
        self.assertEqual(r.status_code, 200)
        new_token = r.json()['token']

        # Reset password back to admin123
        client.post(
            '/api/admin/change-password',
            headers={'X-Admin-Token': new_token},
            data={'old_password': 'test_admin_pass', 'new_password': 'admin123'}
        )

if __name__ == "__main__":
    unittest.main()

