"""HTTP regressions for the unified Jinling release link.

Run with Python 3.11/3.12.  All packages, rows and HTTP requests are confined to
a temporary directory and a random loopback port.  Metadata parsers are mocked
because this suite tests publication/storage, not Android/Apple binary formats.
"""

import base64
import concurrent.futures
import hashlib
import http.client
import importlib
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import urlparse
import zipfile


PACKAGE = "com.jinling.mahjong"
SLUG = "jinling-mahjong"
ORIGIN = "https://releases.example.test"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/"
    "ScLbtAAAAABJRU5ErkJggg=="
)


def package_bytes(platform="android", version="1.0.0", package=PACKAGE, **extra):
    payload_size = extra.pop("payload_size", 0)
    metadata = {
        "name": "金陵麻将" if package == PACKAGE else "普通应用",
        "version": version,
        "version_code": version.replace(".", ""),
        "package": package,
        "platform": platform,
        "icon_found": True,
        "parse_warning": "",
        "minimum_os_version": "13.0" if platform == "ios" else "",
        "ios_distribution": "ad_hoc" if platform == "ios" else "",
        "provisioning_expires_at": "2099-01-01T00:00:00+00:00" if platform == "ios" else "",
        "ios_signed": platform == "ios",
        **extra,
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("AndroidManifest.xml", "test-only manifest")
        archive.writestr("Payload/Jinling.app/Info.plist", "test-only plist")
        archive.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False))
        if payload_size:
            archive.writestr("assets/inert-test-data.bin", b"x" * payload_size)
    return out.getvalue()


class UnifiedReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="jinling-release-test-")
        cls.data = Path(cls.temp.name)
        cls.environment = patch.dict(os.environ, {
            "DATA_DIR": cls.temp.name,
            "PUBLIC_BASE_URL": ORIGIN,
        })
        cls.environment.start()
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
        cls.server = importlib.import_module("server")

        class QuietHandler(cls.server.Handler):
            def log_message(self, *args):
                pass

        cls.httpd = cls.server.ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        cls.environment.stop()
        cls.temp.cleanup()

    def setUp(self):
        # Discover auxiliary tables so alias/product rows cannot cross tests.
        with self.server.db() as connection:
            tables = [row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )]
            for table in tables:
                connection.execute('DELETE FROM "' + table.replace('"', '""') + '"')
            self.token = secrets.token_hex(24)
            self.csrf = secrets.token_hex(24)
            connection.execute("INSERT INTO sessions VALUES(?,?,?)",
                               (self.token, self.csrf, time.time() + 600))
        for folder in self.data.iterdir():
            if folder.is_dir():
                shutil.rmtree(folder)
                folder.mkdir()
        self.parse_barrier = None
        self.apk_patch = patch.object(self.server, "parse_apk", side_effect=self.parse_fixture)
        self.ipa_patch = patch.object(self.server, "parse_ipa", side_effect=self.parse_fixture)
        self.apk_patch.start()
        self.ipa_patch.start()
        self.addCleanup(self.apk_patch.stop)
        self.addCleanup(self.ipa_patch.stop)

    def test_public_update_api_cors_is_exact_and_management_stays_private(self):
        app = self.install(version="0.7.25", version_code="62")
        self.publish(app)
        path = "/api/products/" + SLUG
        for origin in ("capacitor://localhost", "https://localhost", "http://localhost", "https://212.189.31.46"):
            status, headers, body = self.request("GET", path, headers={"Origin": origin})
            self.assertEqual(status, 200)
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), origin)
            self.assertNotIn("Access-Control-Allow-Credentials", headers)
            variant = json.loads(body)["variants"][0]
            self.assertEqual(variant["version_code"], "62")
            self.assertEqual(variant["sha256"], app["sha256"])
            self.assertEqual(variant["size"], app["size"])
        for path_to_test, origin in ((path, "https://evil.example"), ("/api/admin/apps", "https://localhost"), ("/api/session", "capacitor://localhost")):
            _, headers, _ = self.request("GET", path_to_test, headers={"Origin": origin})
            self.assertNotIn("Access-Control-Allow-Origin", headers)
        status, headers, _ = self.request("OPTIONS", path, headers={"Origin": "capacitor://localhost", "Access-Control-Request-Method": "GET"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Methods"], "GET, OPTIONS")
        for method, route in (("POST", path), ("GET", "/api/admin/apps")):
            status, _, _ = self.request("OPTIONS", route, headers={"Origin": "https://localhost", "Access-Control-Request-Method": method})
            self.assertEqual(status, 403)

    def parse_fixture(self, source, icon):
        with zipfile.ZipFile(source) as archive:
            metadata = json.loads(archive.read("metadata.json"))
        Path(icon).write_bytes(PNG)
        if metadata.pop("fail_parse", False):
            raise ValueError("fixture metadata is invalid")
        if metadata.pop("wait_at_barrier", False):
            self.parse_barrier.wait(timeout=10)
        return metadata

    def request(self, method, path, body=None, *, headers=None, auth=False, csrf=True):
        request_headers = dict(headers or {})
        if auth:
            request_headers["Cookie"] = "apk_session=" + self.token
            if csrf:
                request_headers["X-CSRF-Token"] = self.csrf
        if isinstance(body, dict):
            body = json.dumps(body).encode()
            request_headers["Content-Type"] = "application/json"
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=20)
        try:
            connection.request(method, path, body=body, headers=request_headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def upload(self, platform="android", version="1.0.0", package=PACKAGE,
               *, content=None, auth=True, csrf=True, **extra):
        if content is None:
            content = package_bytes(platform, version, package, **extra)
        boundary = "jinling-test-" + secrets.token_hex(16)
        suffix = "ipa" if platform == "ios" else "apk"
        body = (
            ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; "
             "filename=\"release." + suffix + "\"\r\n"
             "Content-Type: application/octet-stream\r\n\r\n").encode()
            + content + ("\r\n--" + boundary + "--\r\n").encode()
        )
        status, headers, raw = self.request("POST", "/api/upload", body,
            headers={"Content-Type": "multipart/form-data; boundary=" + boundary},
            auth=auth, csrf=csrf)
        try:
            result = json.loads(raw)
        except ValueError:
            self.fail(f"Upload returned non-JSON ({status}): {raw[:200]!r}")
        return status, result

    def install(self, platform="android", version="1.0.0", package=PACKAGE, **extra):
        status, result = self.upload(platform, version, package, **extra)
        self.assertEqual(status, 201, result)
        self.assertIn("replaced", result)
        return result

    def publish(self, app, enabled=True):
        status, _, body = self.request("POST", "/api/publish", {
            "id": app["id"], "published": enabled,
        }, auth=True)
        self.assertEqual(status, 200, body)

    def product(self):
        status, _, raw = self.request("GET", "/api/products/" + SLUG)
        self.assertEqual(status, 200, raw)
        return json.loads(raw)

    def rows(self, package=PACKAGE, platform=None):
        query = "SELECT * FROM apps WHERE package=?"
        params = [package]
        if platform:
            query += " AND platform=?"
            params.append(platform)
        with self.server.db() as connection:
            return [dict(row) for row in connection.execute(query, params)]

    def files(self):
        return {str(path.relative_to(self.data)): path.read_bytes()
                for folder in self.data.iterdir() if folder.is_dir()
                for path in folder.rglob("*") if path.is_file()}

    def download(self, app, headers=None, method="GET"):
        suffix = ".ipa" if app["platform"] == "ios" else ".apk"
        return self.request(method, "/download/" + app["id"] + suffix, headers=headers)

    def seed_legacy(self, platform, version, *, published=True, created=1):
        ident = secrets.token_hex(12)
        suffix = ".ipa" if platform == "ios" else ".apk"
        content = package_bytes(platform, version)
        filename = ident + suffix
        (self.data / "packages" / filename).write_bytes(content)
        (self.data / "icons" / (ident + ".png")).write_bytes(PNG)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            metadata = json.loads(archive.read("metadata.json"))
        row = {
            key: metadata[key] for key in (
                "name", "version", "version_code", "package", "platform",
                "parse_warning", "minimum_os_version", "ios_distribution",
                "provisioning_expires_at", "ios_signed",
            )
        }
        row.update(id=ident, filename=filename, size=len(content),
                   sha256=hashlib.sha256(content).hexdigest(), published=int(published),
                   downloads=0, created=created, icon_url="/icons/" + ident + ".png",
                   description="已有介绍", notes="已有更新说明", category="其他", unlisted=1)
        with self.server.db() as connection:
            columns = ",".join(row)
            placeholders = ",".join("?" for _ in row)
            connection.execute(f"INSERT INTO apps({columns}) VALUES({placeholders})", tuple(row.values()))
        return row, content

    def test_one_link_returns_both_published_platforms(self):
        android = self.install("android")
        ios = self.install("ios")
        self.publish(android)
        self.publish(ios)
        product = self.product()
        self.assertEqual(product["slug"], SLUG)
        self.assertEqual(product["name"], "金陵麻将")
        self.assertEqual(product["share_url"], ORIGIN + "/app/" + SLUG)
        self.assertEqual({item["platform"] for item in product["variants"]}, {"android", "ios"})
        for app in product["variants"]:
            self.assertEqual(app["share_url"], product["share_url"])
            self.assertEqual(self.download(app)[0], 200)
            if app["platform"] == "ios":
                self.assertTrue(app["install_url"].startswith("itms-services://"))
                status, _, raw = self.request("GET", "/manifest/" + app["id"] + ".plist")
                self.assertEqual(status, 200, raw)
                self.assertIn(PACKAGE.encode(), raw)
        status, headers, raw = self.request("GET", "/app/" + SLUG)
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"<html", raw.lower())

    def test_same_platform_replaces_bytes_and_keeps_id_and_other_platform(self):
        old_bytes = package_bytes("android", "1.0.0")
        new_bytes = package_bytes("android", "2.0.0")
        android = self.install(content=old_bytes)
        ios = self.install("ios")
        self.publish(android)
        self.publish(ios)
        old_ios = self.download(ios)[2]
        old_row = self.rows(platform="android")[0]
        status, replacement = self.upload("android", content=new_bytes)
        self.assertEqual(status, 201, replacement)
        self.assertTrue(replacement["replaced"])
        self.assertEqual(replacement["id"], android["id"])
        self.assertEqual(replacement["share_url"], ORIGIN + "/app/" + SLUG)
        self.assertEqual(replacement["published"], 1)
        self.assertEqual(self.download(android)[2], new_bytes)
        self.assertEqual(self.download(ios)[2], old_ios)
        rows = self.rows(platform="android")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["sha256"], hashlib.sha256(new_bytes).hexdigest())
        old_path = self.data / "packages" / old_row["filename"]
        if old_row["filename"] != rows[0]["filename"]:
            self.assertFalse(old_path.exists(), "Superseded package must be removed")
        if old_row["icon_url"] != rows[0]["icon_url"]:
            old_icon = self.data / urlparse(old_row["icon_url"]).path.lstrip("/")
            self.assertFalse(old_icon.exists(), "Superseded icon must be removed")
        self.assertNotIn(old_bytes, self.files().values())
        self.assertEqual(len(list((self.data / "packages").glob("*.apk"))), 1)
        self.assertEqual(len(list((self.data / "packages").glob("*.ipa"))), 1)
        self.assertEqual(len(list((self.data / "icons").glob("*.png"))), 2)

    def test_metadata_failure_preserves_current_packages_and_removes_staging(self):
        android, ios = self.install(), self.install("ios")
        self.publish(android)
        self.publish(ios)
        old_files, old_rows = self.files(), self.rows()
        for platform in ("android", "ios"):
            status, result = self.upload(platform, "9.0.0", fail_parse=True)
            self.assertEqual(status, 400, result)
            self.assertEqual(self.files(), old_files)
            self.assertEqual(self.rows(), old_rows)
        self.assertEqual(len(self.product()["variants"]), 2)

    def test_invalid_archive_does_not_replace_current(self):
        current = self.install()
        self.publish(current)
        before = self.files()
        status, body = self.upload(content=b"not a ZIP package")
        self.assertEqual(status, 400, body)
        self.assertEqual(self.files(), before)
        self.assertEqual(self.rows()[0]["version"], "1.0.0")

    def test_storage_failure_removes_upload_staging_and_preserves_current(self):
        current = self.install()
        self.publish(current)
        old_files, old_rows = self.files(), self.rows()
        with patch.object(self.server, "install_release", side_effect=ValueError("injected write failure")):
            status, _ = self.upload(version="9.0.0")
        self.assertIn(status, (400, 500))
        self.assertEqual(self.files(), old_files)
        self.assertEqual(self.rows(), old_rows)

    def test_database_rejection_rolls_back_promoted_package_and_icon(self):
        android, ios = self.install(), self.install("ios")
        self.publish(android)
        self.publish(ios)
        old_files, old_rows = self.files(), self.rows()
        with self.server.db() as connection:
            connection.execute("""
                CREATE TRIGGER reject_fixture_release BEFORE UPDATE OF version ON apps
                WHEN NEW.version='9.0.0'
                BEGIN SELECT RAISE(ABORT, 'fixture transaction rejection'); END
            """)
        try:
            status, _ = self.upload(version="9.0.0")
            self.assertEqual(status, 500)
        finally:
            with self.server.db() as connection:
                connection.execute("DROP TRIGGER reject_fixture_release")
        self.assertEqual(self.files(), old_files)
        self.assertEqual(self.rows(), old_rows)
        self.assertEqual(len(self.product()["variants"]), 2)

    def test_parallel_uploads_leave_one_current_release(self):
        self.parse_barrier = threading.Barrier(4)
        versions = [f"2.0.{index}" for index in range(4)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda version: self.upload(
                version=version, wait_at_barrier=True), versions))
        for status, result in results:
            self.assertEqual(status, 201, result)
        self.assertEqual(len({result["id"] for _, result in results}), 1)
        self.assertEqual(sum(bool(result["replaced"]) for _, result in results), 3)
        rows = self.rows(platform="android")
        self.assertEqual(len(rows), 1)
        packages = list((self.data / "packages").glob("*.apk"))
        self.assertEqual(len(packages), 1)
        self.assertEqual(hashlib.sha256(packages[0].read_bytes()).hexdigest(), rows[0]["sha256"])
        with zipfile.ZipFile(packages[0]) as archive:
            metadata = json.loads(archive.read("metadata.json"))
        self.assertEqual(rows[0]["version"], metadata["version"])

    def test_legacy_links_follow_consolidated_current_release(self):
        # Simulate a database from before the partial uniqueness migration.
        with self.server.db() as connection:
            connection.execute("DROP INDEX IF EXISTS one_jinling_platform")
        old_android, old_bytes = self.seed_legacy("android", "1.0.0", created=30)
        new_android, expected_android = self.seed_legacy("android", "2.0.0", created=10)
        draft_android, _ = self.seed_legacy("android", "9.0.0", published=False, created=40)
        old_ios, _ = self.seed_legacy("ios", "1.0.0", created=30)
        new_ios, expected_ios = self.seed_legacy("ios", "2.0.0", created=10)
        result = self.server.consolidate_jinling()
        self.assertGreaterEqual(result["removed"], 3)
        rows = self.rows()
        self.assertEqual(len(rows), 2)
        self.assertEqual({row["version"] for row in rows}, {"2.0.0"})
        self.assertNotIn(old_bytes, self.files().values())
        self.assertEqual(len(list((self.data / "packages").glob("*.apk"))), 1)
        self.assertEqual(len(list((self.data / "packages").glob("*.ipa"))), 1)
        for legacy in (old_android, new_android, draft_android, old_ios, new_ios):
            status, _, raw = self.request("GET", "/api/apps/" + legacy["id"])
            self.assertEqual(status, 200, raw)
            current = json.loads(raw)
            self.assertEqual(current["version"], "2.0.0")
            self.assertEqual(current["share_url"], ORIGIN + "/app/" + SLUG)
            status, headers, _ = self.request("GET", "/app/" + legacy["id"])
            self.assertEqual(status, 302)
            self.assertEqual(urlparse(headers["Location"]).path, "/app/" + SLUG)
            expected = expected_ios if legacy["platform"] == "ios" else expected_android
            self.assertEqual(self.download(legacy)[2], expected)
            if legacy["platform"] == "ios":
                self.assertEqual(self.request("GET", "/manifest/" + legacy["id"] + ".plist")[0], 200)
        stable_ids = {row["platform"]: row["id"] for row in rows}
        self.install(version="3.0.0")
        self.server.consolidate_jinling()
        self.assertEqual({row["platform"]: row["id"] for row in self.rows()}, stable_ids)
        status, _, raw = self.request("GET", "/api/apps/" + old_android["id"])
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["version"], "3.0.0")
        self.publish({"id": stable_ids["android"]}, False)
        self.assertEqual(self.request("GET", "/api/apps/" + old_android["id"])[0], 404)
        self.assertEqual(self.download(old_android)[0], 404)
        status, _, raw = self.request("POST", "/api/delete", {
            "id": stable_ids["ios"], "confirm_name": "金陵麻将",
        }, auth=True)
        self.assertEqual(status, 200, raw)
        self.assertEqual(self.request("GET", "/api/apps/" + old_ios["id"])[0], 404)
        self.assertEqual(self.download(old_ios)[0], 404)
        self.assertEqual(self.request("GET", "/manifest/" + old_ios["id"] + ".plist")[0], 404)

    def test_replacement_preserves_visibility_and_admin_copy(self):
        current = self.install()
        status, _, raw = self.request("POST", "/api/update", {
            "id": current["id"], "name": "金陵麻将",
            "description": "保留应用介绍", "notes": "保留更新说明", "category": "其他",
            "published": True, "unlisted": True,
        }, auth=True)
        self.assertEqual(status, 200, raw)
        replacement = self.install(version="2.0.0")
        row = self.rows()[0]
        self.assertEqual(replacement["id"], current["id"])
        self.assertEqual(row["published"], 1)
        self.assertEqual(row["unlisted"], 1)
        self.assertEqual(row["description"], "保留应用介绍")
        self.assertEqual(row["notes"], "保留更新说明")
        self.assertEqual(row["category"], "其他")
        self.assertEqual(len(self.product()["variants"]), 1)
        status, _, raw = self.request("GET", "/api/apps")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw), [])

    def test_unpublished_platforms_are_excluded(self):
        android, ios = self.install(), self.install("ios")
        self.publish(android)
        self.publish(ios)
        self.publish(android, False)
        self.assertEqual([row["platform"] for row in self.product()["variants"]], ["ios"])
        self.assertEqual(self.download(android)[0], 404)
        self.assertEqual(self.request("GET", "/api/apps/" + android["id"])[0], 404)

    def test_generic_app_still_creates_separate_drafts(self):
        package = "com.example.other"
        first = self.install(package=package)
        second = self.install(version="2.0.0", package=package)
        self.assertNotEqual(first["id"], second["id"])
        self.assertFalse(first["replaced"])
        self.assertFalse(second["replaced"])
        self.assertEqual(first["published"], 0)
        self.assertEqual(second["published"], 0)
        self.assertEqual(len(self.rows(package)), 2)
        self.assertEqual(self.download(first)[0], 404)
        self.publish(first)
        status, _, raw = self.request("GET", "/api/apps/" + first["id"])
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["share_url"], ORIGIN + "/app/" + first["id"])

    def test_auth_and_csrf_are_still_required(self):
        before = self.files()
        self.assertEqual(self.upload(auth=False)[0], 401)
        self.assertEqual(self.upload(csrf=False)[0], 403)
        self.assertEqual(self.rows(), [])
        self.assertEqual(self.files(), before)

    def test_admin_delete_only_removes_selected_platform(self):
        android, ios = self.install(), self.install("ios")
        self.publish(android)
        self.publish(ios)
        ios_content = self.download(ios)[2]
        status, _, raw = self.request("POST", "/api/delete", {
            "id": android["id"], "confirm_name": android["name"],
        }, auth=True)
        self.assertEqual(status, 200, raw)
        self.assertEqual(self.download(android)[0], 404)
        self.assertEqual(self.download(ios)[2], ios_content)
        self.assertEqual([row["platform"] for row in self.product()["variants"]], ["ios"])
        self.assertEqual(len(list((self.data / "packages").glob("*.apk"))), 0)

    def test_if_range_prevents_resuming_old_bytes_into_new_release(self):
        original_bytes = package_bytes(version="1.0.0")
        replacement_bytes = package_bytes(version="2.0.0")
        current = self.install(content=original_bytes)
        self.publish(current)
        status, original_headers, raw = self.download(current)
        self.assertEqual(status, 200)
        self.assertEqual(raw, original_bytes)
        original_etag = original_headers.get("ETag", "")
        self.assertTrue(original_etag.startswith('"') and original_etag.endswith('"'))
        status, headers, raw = self.download(current, {"Range": "bytes=10-29", "If-Range": original_etag})
        self.assertEqual(status, 206)
        self.assertEqual(raw, original_bytes[10:30])
        self.assertEqual(headers["Content-Range"], f"bytes 10-29/{len(original_bytes)}")
        self.install(content=replacement_bytes)
        status, replacement_headers, raw = self.download(current, {"Range": "bytes=10-29", "If-Range": original_etag})
        self.assertEqual(status, 200, "An outdated If-Range must restart the full download")
        self.assertEqual(raw, replacement_bytes)
        self.assertNotIn("Content-Range", replacement_headers)
        replacement_etag = replacement_headers["ETag"]
        self.assertNotEqual(replacement_etag, original_etag)
        status, headers, raw = self.download(current, {"Range": "bytes=-15", "If-Range": replacement_etag})
        self.assertEqual(status, 206)
        self.assertEqual(raw, replacement_bytes[-15:])
        self.assertEqual(headers["ETag"], replacement_etag)
        status, headers, raw = self.download(current, method="HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(raw, b"")
        self.assertEqual(int(headers["Content-Length"]), len(replacement_bytes))
        self.assertEqual(headers["ETag"], replacement_etag)
        status, headers, _ = self.download(current, {"Range": "bytes=9999999-"})
        self.assertEqual(status, 416)
        self.assertEqual(headers["Content-Range"], f"bytes */{len(replacement_bytes)}")

    def test_download_already_in_flight_finishes_with_its_original_bytes(self):
        old_bytes = package_bytes(version="1.0.0", payload_size=8 * 1024 * 1024)
        new_bytes = package_bytes(version="2.0.0")
        current = self.install(content=old_bytes)
        self.publish(current)
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=20)
        try:
            connection.request("GET", "/download/" + current["id"] + ".apk")
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            prefix = response.read(128)
            # Replacement removes the old path while this response still owns
            # its already-open file descriptor.  Its body must stay coherent.
            self.install(content=new_bytes)
            self.assertEqual(prefix + response.read(), old_bytes)
        finally:
            connection.close()
        self.assertEqual(self.download(current)[2], new_bytes)
        self.assertNotIn(old_bytes, self.files().values())


if __name__ == "__main__":
    unittest.main(verbosity=2)
