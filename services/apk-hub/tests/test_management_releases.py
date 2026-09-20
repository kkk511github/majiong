"""Private drafts and confirmed releases; synthetic files and loopback HTTP only."""
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import http.client
import io
import json
import os
import plistlib
import secrets
import socket
import threading
import unittest
from unittest.mock import patch
import zipfile

import test_unified_release as fixtures


BASE = '/internal/control/releases'


class ManagementReleaseTests(unittest.TestCase):
    request = fixtures.UnifiedReleaseTests.request
    parse_fixture = fixtures.UnifiedReleaseTests.parse_fixture
    upload = fixtures.UnifiedReleaseTests.upload
    install = fixtures.UnifiedReleaseTests.install
    publish = fixtures.UnifiedReleaseTests.publish
    product = fixtures.UnifiedReleaseTests.product
    rows = fixtures.UnifiedReleaseTests.rows
    files = fixtures.UnifiedReleaseTests.files
    download = fixtures.UnifiedReleaseTests.download

    @classmethod
    def setUpClass(cls):
        fixtures.UnifiedReleaseTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        fixtures.UnifiedReleaseTests.tearDownClass.__func__(cls)

    def setUp(self):
        fixtures.UnifiedReleaseTests.setUp(self)
        self.secret = secrets.token_urlsafe(48)
        self.secret_path = self.data / 'management-test-secret'
        self.secret_path.write_text(self.secret + '\n')
        environment = patch.dict(os.environ, {'MANAGEMENT_API_TOKEN_FILE': str(self.secret_path)})
        environment.start()
        self.addCleanup(environment.stop)

    def managed(self, method, route='', body=None, *, headers=None, actor='control-admin', token=True):
        supplied = {'X-Management-Actor': actor}
        if token:
            supplied['X-Management-Token'] = self.secret
        supplied.update(headers or {})
        status, response_headers, raw = self.request(method, BASE + route, body, headers=supplied)
        return status, response_headers, json.loads(raw)

    def upload_release(self, platform='android', *, content=None, version='2.0.0', filename=None, notes='修复问题', headers=None, **extra):
        content = fixtures.package_bytes(platform, version, **extra) if content is None else content
        filename = filename or ('release.ipa' if platform == 'ios' else 'release.apk')
        boundary = 'management-test-' + secrets.token_hex(12)
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\n{notes}\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
        return self.managed('POST', '/upload?platform=' + platform, body,
                            headers={'Content-Type':'multipart/form-data; boundary=' + boundary, **(headers or {})})

    def seed_current(self, platform='android', **extra):
        with patch.dict(os.environ, {'MANAGEMENT_API_TOKEN_FILE': ''}):
            app = self.install(platform, **extra)
            self.publish(app)
        return app

    def draft(self, platform='android', **extra):
        status, _, result = self.upload_release(platform, **extra)
        self.assertIn(status, (200, 201), result)
        self.assertIn('draft', result)
        self.assertEqual(result['draft']['stage'], 'draft')
        return result['draft']

    def publish_draft(self, draft, **overrides):
        return self.managed('POST', '/' + draft['id'] + '/publish', {
            'sha256': draft['sha256'], 'build': draft['build'], **overrides,
        })

    def draft_row(self, ident):
        with self.server.db() as c:
            return dict(c.execute('SELECT * FROM management_release_drafts WHERE id=?', (ident,)).fetchone())

    def test_private_token_actor_disabled_routes_and_rotation(self):
        with patch.dict(os.environ, {'MANAGEMENT_API_TOKEN_FILE': ''}):
            self.assertEqual(self.managed('GET')[0], 404)
        with patch.dict(os.environ, {'MANAGEMENT_API_TOKEN_FILE': str(self.data / 'missing-token')}):
            self.assertEqual(self.managed('GET')[2]['code'], 'MANAGEMENT_DISABLED')
        self.assertEqual(self.managed('GET', token=False)[0], 401)
        self.assertEqual(self.managed('GET', headers={'X-Management-Token':'wrong'})[0], 401)
        self.assertEqual(self.request('GET', BASE, auth=True)[0], 401)
        self.assertEqual(self.managed('GET', actor='../admin')[0], 403)
        self.assertEqual(self.managed('GET', actor='')[0], 403)
        status, headers, result = self.managed('GET', headers={'Origin':'https://evil.invalid'})
        self.assertEqual(status, 200)
        self.assertEqual(result, {'current':[], 'drafts':[], 'history':[]})
        self.assertNotIn('Access-Control-Allow-Origin', headers)
        self.assertNotIn(self.secret, json.dumps(result))
        self.secret_path.write_text('new-' + self.secret)
        self.assertEqual(self.managed('GET')[0], 401)
        self.secret = 'new-' + self.secret
        self.assertEqual(self.managed('GET')[0], 200)

    def test_upload_only_creates_private_draft_and_current_changes_only_after_confirmation(self):
        current = self.seed_current()
        old_bytes = self.download(current)[2]
        content = fixtures.package_bytes(version='2.0.0')
        entered, proceed = threading.Event(), threading.Event()

        def blocked_parser(source, icon):
            entered.set()
            self.assertTrue(proceed.wait(10))
            return self.parse_fixture(source, icon)

        with patch.object(self.server, 'parse_apk', side_effect=blocked_parser), concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(self.upload_release, content=content)
            self.assertTrue(entered.wait(10))
            try:
                self.assertEqual(self.download(current)[2], old_bytes)
                self.assertEqual(self.managed('GET')[2]['drafts'], [])
                private_path = next((self.data / '.incoming').glob('*.apk'))
                self.assertEqual(self.request('GET', '/.incoming/' + private_path.name)[0], 404)
            finally:
                proceed.set()
            status, _, result = future.result(timeout=10)
        self.assertEqual(status, 201, result)
        release = result['draft']
        self.assertEqual(release['stage'], 'draft')
        self.assertEqual(release['sha256'], hashlib.sha256(content).hexdigest())
        self.assertEqual(release['size'], len(content))
        self.assertEqual(release['build'], '200')
        self.assertEqual(release['packageId'], fixtures.PACKAGE)
        self.assertFalse(release['validation']['installationVerificationRequired'])
        self.assertEqual(self.download(current)[2], old_bytes)
        self.assertEqual(release['downloadUrl'], '')
        self.assertEqual(len(self.managed('GET')[2]['drafts']), 1)
        self.assertEqual(list((self.data / '.incoming').iterdir()), [])
        path = self.data / '.staged' / self.draft_row(release['id'])['filename']
        self.assertTrue(path.exists())
        self.assertEqual(self.request('GET', '/.staged/' + path.name)[0], 404)
        self.assertEqual(self.publish_draft(release)[0], 200)
        self.assertEqual(self.download(current)[2], content)
        self.assertFalse(path.exists())

    def test_publication_preserves_other_platform_fixed_link_and_metadata_only_history(self):
        android, ios = self.seed_current(), self.seed_current('ios')
        old_android, ios_bytes = self.download(android)[2], self.download(ios)[2]
        content = fixtures.package_bytes(version='2.0.0')
        draft = self.draft(content=content)
        status, _, result = self.publish_draft(draft)
        self.assertEqual(status, 200, result)
        release = result['release']
        self.assertEqual(release['id'], android['id'])
        self.assertEqual(release['publishedBy'], 'control-admin')
        self.assertEqual(release['productUrl'], fixtures.ORIGIN + '/app/' + fixtures.SLUG)
        self.assertEqual(self.download(android)[2], content)
        self.assertEqual(self.download(ios)[2], ios_bytes)
        self.assertNotIn(old_android, self.files().values())
        listing = self.managed('GET')[2]
        self.assertEqual(listing['drafts'], [])
        self.assertEqual({event['stage'] for event in listing['history']}, {'staged','published','superseded'})
        self.assertNotIn(self.secret, json.dumps(listing))
        self.assertNotIn(str(self.data), json.dumps(listing))
        self.assertNotIn('实机安装后', json.dumps(listing, ensure_ascii=False))

    def test_parallel_identical_uploads_and_publish_requests_are_idempotent(self):
        self.seed_current()
        content = fixtures.package_bytes(version='2.0.0')
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(lambda _: self.upload_release(content=content), range(4)))
        self.assertEqual(sorted(status for status, _, _ in responses), [200,200,200,201])
        self.assertEqual(sum(bool(result.get('alreadyStaged')) for _, _, result in responses), 3)
        self.assertEqual(len({result['draft']['id'] for _, _, result in responses}), 1)
        self.assertEqual(self.rows(platform='android')[0]['version'], '1.0.0')
        draft = responses[0][2]['draft']
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            publications = list(pool.map(lambda _: self.publish_draft(draft), range(4)))
        self.assertTrue(all(status == 200 for status, _, _ in publications), publications)
        self.assertEqual(sum(bool(result.get('alreadyPublished')) for _, _, result in publications), 3)
        listing = self.managed('GET')[2]
        self.assertEqual(sum(event['stage'] == 'published' for event in listing['history']), 1)
        self.assertEqual(sum(event['stage'] == 'staged' for event in listing['history']), 1)
        self.assertEqual(len(self.rows(platform='android')), 1)
        self.assertEqual(len(list((self.data / 'packages').glob('*.apk'))), 1)
        before = self.managed('GET')[2]['history']
        self.assertEqual(self.upload_release(content=content, notes='duplicate retry')[0], 200)
        self.assertEqual(self.managed('GET')[2]['history'], before)
        self.assertEqual(list((self.data / '.incoming').iterdir()), [])

    def test_version_race_rechecks_latest_current_build_and_rejects_late_downgrade(self):
        current = self.seed_current()
        stale = self.draft(version='2.0.0')
        entered, proceed = threading.Event(), threading.Event()

        def ordered_parser(source, icon):
            metadata = self.parse_fixture(source, icon)
            if metadata['version'] == '2.0.0':
                entered.set()
                self.assertTrue(proceed.wait(10))
            return metadata

        with patch.object(self.server, 'parse_apk', side_effect=ordered_parser), concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            lower = pool.submit(self.upload_release, version='2.0.0')
            self.assertTrue(entered.wait(10))
            try:
                newer = self.draft(version='3.0.0')
                self.assertEqual(self.publish_draft(newer)[0], 200)
                expected = self.download(current)[2]
            finally:
                proceed.set()
            status, _, result = lower.result(timeout=10)
        self.assertEqual(status, 409)
        self.assertEqual(result['code'], 'BUILD_DOWNGRADE')
        self.assertEqual(self.download(current)[2], expected)
        self.assertEqual(self.publish_draft(stale, confirmSameBuild=True)[2]['code'], 'BUILD_DOWNGRADE')
        self.assertEqual(self.upload_release(version='1.0.0')[2]['code'], 'BUILD_DOWNGRADE')
        self.assertEqual(list((self.data / '.incoming').iterdir()), [])

    def test_same_build_repair_requires_confirmation_and_warns_no_ota_without_manual_install_claim(self):
        current = self.seed_current()
        content = fixtures.package_bytes(version='1.0.0', repair='different signed bytes')
        draft = self.draft(content=content)
        validation = draft['validation']
        self.assertTrue(validation['sameBuild'])
        self.assertTrue(validation['requiresSameBuildConfirmation'])
        self.assertFalse(validation['installationVerificationRequired'])
        self.assertIn('不会触发', ''.join(validation['warnings']))
        self.assertEqual(self.publish_draft(draft)[2]['code'], 'SAME_BUILD_CONFIRMATION_REQUIRED')
        self.assertEqual(self.rows(platform='android')[0]['sha256'], current['sha256'])
        self.assertEqual(self.publish_draft(draft, confirmSameBuild=True)[0], 200)
        self.assertEqual(self.download(current)[2], content)
        self.assertTrue(self.managed('GET')[2]['current'][0]['validation']['sameBuild'])

    def test_exact_confirmation_and_persistent_restart_keep_drafts_separate_and_record_real_actor(self):
        current = self.seed_current()
        draft = self.draft()
        self.assertRegex(draft['id'], r'^[a-f0-9]{24}$')
        for override, code in [({'sha256':'0' * 64}, 'DRAFT_MISMATCH'), ({'build':'999'}, 'DRAFT_MISMATCH'),
                               ({'build':200}, 'INVALID_CONFIRMATION'), ({'confirmSameBuild':'true'}, 'INVALID_CONFIRMATION')]:
            with self.subTest(override=override):
                self.assertEqual(self.publish_draft(draft, **override)[2]['code'], code)
                self.assertEqual(self.rows(platform='android')[0]['sha256'], current['sha256'])
        restarted = self.server.ManagementReleases(self.server.ReleaseStore(self.data, self.server.db),
                                                   self.server.app_response, self.server.ios_install_status)
        with patch.object(self.server, 'management_releases', restarted):
            listing = self.managed('GET')[2]
            self.assertEqual([row['id'] for row in listing['drafts']], [draft['id']])
            self.assertEqual(listing['current'][0]['sha256'], current['sha256'])
            status, _, result = self.managed('POST', '/' + draft['id'] + '/publish',
                {'sha256':draft['sha256'], 'build':draft['build']}, actor='control-publisher')
            self.assertEqual(status, 200, result)
            self.assertEqual(result['release']['createdBy'], 'control-admin')
            self.assertEqual(result['release']['publishedBy'], 'control-publisher')
            self.assertEqual(self.managed('GET')[2]['drafts'], [])
            self.assertTrue(self.publish_draft(draft)[2]['alreadyPublished'])

    def test_discard_is_scoped_idempotent_and_corrupt_paths_cannot_escape_private_storage(self):
        current = self.seed_current()
        first, second = self.draft(), self.draft(version='3.0.0')
        first_file = self.data / '.staged' / self.draft_row(first['id'])['filename']
        second_file = self.data / '.staged' / self.draft_row(second['id'])['filename']
        sentinel = self.data / 'outside.apk'
        sentinel.write_bytes(b'must survive')
        with self.server.db() as c:
            c.execute('UPDATE management_release_drafts SET filename=? WHERE id=?', ('../outside.apk', first['id']))
        self.assertEqual(self.publish_draft(first)[2]['code'], 'PACKAGE_CHANGED')
        self.assertEqual(self.rows(platform='android')[0]['sha256'], current['sha256'])
        self.assertEqual(self.managed('POST', '/' + first['id'] + '/discard', {})[0], 200)
        self.assertFalse(first_file.exists())
        self.assertTrue(second_file.exists())
        self.assertEqual(sentinel.read_bytes(), b'must survive')
        self.assertEqual(self.managed('POST', '/' + first['id'] + '/discard', {})[0], 200)
        self.assertEqual(sum(event['stage'] == 'discarded' for event in self.managed('GET')[2]['history']), 1)
        self.assertEqual(self.publish_draft(second)[0], 200)
        self.assertFalse(second_file.exists())
        self.assertEqual(self.managed('POST', '/' + second['id'] + '/discard', {})[0], 409)

    def test_incomplete_publish_json_never_publishes_or_consumes_the_draft(self):
        current = self.seed_current()
        draft = self.draft()
        payload = json.dumps({'sha256':draft['sha256'], 'build':draft['build']}).encode()
        headers = (f'POST {BASE}/{draft["id"]}/publish HTTP/1.1\r\nHost: localhost\r\n'
                   f'Content-Type: application/json\r\nContent-Length: {len(payload) + 8}\r\n'
                   f'X-Management-Token: {self.secret}\r\nX-Management-Actor: control-admin\r\nConnection: close\r\n\r\n').encode()
        with socket.create_connection(('127.0.0.1', self.httpd.server_port), timeout=5) as client:
            client.sendall(headers + payload)
            client.settimeout(0.2)
            with self.assertRaises(socket.timeout):
                client.recv(1)
            self.assertEqual(self.rows(platform='android')[0]['sha256'], current['sha256'])
            client.settimeout(5)
            client.shutdown(socket.SHUT_WR)
            response = http.client.HTTPResponse(client)
            response.begin()
            result = json.loads(response.read())
            self.assertEqual(response.status, 400, result)
            self.assertEqual(result['code'], 'INCOMPLETE_UPLOAD')
        self.assertEqual(self.draft_row(draft['id'])['status'], 'draft')
        self.assertEqual(self.rows(platform='android')[0]['sha256'], current['sha256'])

    def test_hash_recheck_catches_file_change_during_promotion_and_preserves_current(self):
        current = self.seed_current()
        old = self.download(current)[2]
        draft = self.draft()
        original = self.server.management_releases._promote

        def changed(source, relative, promoted):
            if relative.endswith('.apk'):
                with open(source, 'ab') as target:
                    target.write(b'changed after initial validation')
            return original(source, relative, promoted)

        with patch.object(self.server.management_releases, '_promote', side_effect=changed):
            status, _, result = self.publish_draft(draft)
        self.assertEqual(status, 409, result)
        self.assertEqual(result['code'], 'PACKAGE_CHANGED')
        self.assertEqual(self.download(current)[2], old)
        self.assertEqual(len(list((self.data / 'packages').glob('*.apk'))), 1)
        self.assertEqual(self.draft_row(draft['id'])['status'], 'draft')

    def test_database_and_storage_failures_preserve_old_package_and_private_draft_for_retry(self):
        self.seed_current()
        draft = self.draft()
        before_files, before_apps = self.files(), self.rows()
        with patch('management_releases.os.link', side_effect=OSError('injected storage failure')):
            self.assertEqual(self.publish_draft(draft)[0], 500)
        self.assertEqual(self.files(), before_files)
        self.assertEqual(self.rows(), before_apps)
        with self.server.db() as c:
            c.execute("CREATE TRIGGER reject_management_fixture BEFORE UPDATE OF version ON apps WHEN NEW.version='2.0.0' BEGIN SELECT RAISE(ABORT,'test write rejection'); END")
        try:
            self.assertEqual(self.publish_draft(draft)[0], 500)
        finally:
            with self.server.db() as c:
                c.execute('DROP TRIGGER reject_management_fixture')
        self.assertEqual(self.files(), before_files)
        self.assertEqual(self.rows(), before_apps)
        self.assertEqual(list((self.data / '.incoming').iterdir()), [])
        self.assertEqual(self.publish_draft(draft)[0], 200)

    def test_wrong_package_platform_corruption_paths_and_notes_leave_no_files(self):
        self.seed_current()
        before = self.files()
        corrupt = bytearray(fixtures.package_bytes())
        corrupt[corrupt.index(b'test-only manifest')] ^= 1
        malicious = io.BytesIO(fixtures.package_bytes())
        with zipfile.ZipFile(malicious, 'a') as archive:
            archive.writestr('../outside.txt', 'do not extract')
        cases = [({'package':'com.example.other'}, 'WRONG_PACKAGE'),
                 ({'content':b'broken ZIP'}, 'INVALID_PACKAGE'),
                 ({'content':bytes(corrupt)}, 'INVALID_PACKAGE'),
                 ({'content':malicious.getvalue()}, 'INVALID_PACKAGE'),
                 ({'filename':'../../outside.apk'}, 'PLATFORM_MISMATCH'),
                 ({'filename':'release.ipa'}, 'PLATFORM_MISMATCH'),
                 ({'notes':'a' * 501}, 'INVALID_NOTES'),
                 ({'version_code':''}, 'INVALID_BUILD')]
        for kwargs, code in cases:
            with self.subTest(kwargs=list(kwargs)):
                status, _, result = self.upload_release(**kwargs)
                self.assertEqual(status, 400, result)
                self.assertEqual(result['code'], code)
                self.assertEqual(self.files(), before)
        with patch.object(self.server, 'parse_apk', return_value={'platform':'ios'}):
            self.assertEqual(self.upload_release()[2]['code'], 'PLATFORM_MISMATCH')
        self.assertEqual(self.managed('POST', '/../../outside/publish', {})[0], 404)

    def test_upload_limits_and_unauthenticated_upload_do_not_leave_files(self):
        self.seed_current()
        before = self.files()
        with patch.object(self.server, 'MAX', 128):
            self.assertEqual(self.upload_release()[0], 413)
        status, _, result = self.managed('POST', '/upload?platform=android', b'', headers={
            'Content-Type':'multipart/form-data; boundary=x', 'Content-Length':str(self.server.MAX + 65537)})
        self.assertEqual(status, 413)
        self.assertEqual(result['code'], 'PACKAGE_TOO_LARGE')
        self.assertEqual(self.upload_release(headers={'X-Management-Token':'bad'})[0], 401)
        self.assertEqual(self.files(), before)

    def epilogue_upload(self, complete):
        current = self.seed_current()
        original_sha = current['sha256']
        content = fixtures.package_bytes(version='2.0.0')
        boundary, epilogue = 'test-complete-body-boundary', b'withheld-until-final-gateway-auth'
        multipart = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="release.apk"\r\n'
                     'Content-Type: application/octet-stream\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
        headers = (f'POST {BASE}/upload?platform=android HTTP/1.1\r\nHost: localhost\r\n'
                   f'Content-Type: multipart/form-data; boundary={boundary}\r\n'
                   f'Content-Length: {len(multipart) + len(epilogue)}\r\n'
                   f'X-Management-Token: {self.secret}\r\nX-Management-Actor: control-admin\r\nConnection: close\r\n\r\n').encode()
        reading = threading.Event()
        original_reader = self.server.Handler.complete_control_form

        def observed_reader(handler, size):
            reading.set()
            return original_reader(handler, size)

        calls = self.server.parse_apk.call_count
        with patch.object(self.server.Handler, 'complete_control_form', new=observed_reader):
            with socket.create_connection(('127.0.0.1', self.httpd.server_port), timeout=5) as client:
                client.sendall(headers + multipart)
                self.assertTrue(reading.wait(5))
                client.settimeout(0.2)
                with self.assertRaises(socket.timeout):
                    client.recv(1)
                self.assertEqual(self.server.parse_apk.call_count, calls, 'Must not parse/publish at the early closing boundary')
                self.assertEqual(self.rows(platform='android')[0]['sha256'], original_sha)
                self.assertEqual(self.managed('GET')[2]['history'], [])
                client.settimeout(5)
                if complete:
                    client.sendall(epilogue)
                else:
                    client.shutdown(socket.SHUT_WR)
                response = http.client.HTTPResponse(client)
                response.begin()
                payload = json.loads(response.read())
                self.assertEqual(response.status, 201 if complete else 400, payload)
                if not complete:
                    self.assertEqual(payload['code'], 'INCOMPLETE_UPLOAD')
        self.assertEqual(self.rows(platform='android')[0]['sha256'], original_sha)
        self.assertEqual(len(self.managed('GET')[2]['drafts']), 1 if complete else 0)
        if complete:
            self.assertEqual(payload['draft']['sha256'], hashlib.sha256(content).hexdigest())
        self.assertEqual(list((self.data / '.incoming').iterdir()), [])

    def test_multipart_closing_boundary_cannot_publish_before_declared_epilogue_arrives(self):
        self.epilogue_upload(complete=True)

    def test_eof_after_multipart_boundary_but_before_declared_body_end_rejects_publication(self):
        self.epilogue_upload(complete=False)

    def test_ios_unsigned_expired_and_store_profiles_block_without_changing_current(self):
        current = self.seed_current('ios')
        old = self.download(current)[2]
        for metadata in [{'ios_signed':False}, {'provisioning_expires_at':'2000-01-01T00:00:00Z'},
                         {'ios_distribution':'app_store'}, {'provisioning_expires_at':''}]:
            with self.subTest(metadata=metadata):
                status, _, result = self.upload_release('ios', **metadata)
                self.assertEqual(status, 400, result)
                self.assertEqual(result['code'], 'PACKAGE_NOT_INSTALLABLE')
                self.assertEqual(self.download(current)[2], old)

        class FutureDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2100,1,1,tzinfo=timezone.utc)

        draft = self.draft('ios')
        with patch.object(self.server, 'datetime', FutureDateTime):
            self.assertEqual(self.upload_release('ios')[2]['code'], 'PACKAGE_NOT_INSTALLABLE')
            self.assertEqual(self.publish_draft(draft)[2]['code'], 'PACKAGE_NOT_INSTALLABLE')
        self.assertEqual(self.download(current)[2], old)
        status, _, result = self.publish_draft(draft)
        self.assertEqual(status, 200, result)
        self.assertTrue(result['release']['signingMetadataPresent'])
        self.assertIn('已登记', result['release']['installationNote'])
        self.assertIn('不保证设备', ''.join(result['release']['validation']['warnings']))
        self.assertFalse(result['release']['validation']['installationVerificationRequired'])

    def test_real_ipa_parser_reads_metadata_without_signing_or_changing_package_bytes(self):
        import ipa_metadata
        info = {'CFBundlePackageType':'APPL','CFBundleIdentifier':fixtures.PACKAGE,'CFBundleExecutable':'Jinling',
                'CFBundleSupportedPlatforms':['iPhoneOS'],'CFBundleShortVersionString':'0.7.31','CFBundleVersion':'68',
                'CFBundleDisplayName':'金陵麻将','MinimumOSVersion':'15.0'}
        payload = io.BytesIO()
        with zipfile.ZipFile(payload,'w') as archive:
            archive.writestr('Payload/Jinling.app/Info.plist', plistlib.dumps(info))
            archive.writestr('Payload/Jinling.app/Jinling', b'inert test executable')
            archive.writestr('Payload/Jinling.app/embedded.mobileprovision', b'inert test CMS profile')
            archive.writestr('Payload/Jinling.app/_CodeSignature/CodeResources', plistlib.dumps({'files':{}}))
        profile = {'UUID':'test-profile','TeamIdentifier':['TESTTEAM'],'ExpirationDate':datetime(2099,1,1),
                   'Entitlements':{'application-identifier':'TESTTEAM.' + fixtures.PACKAGE},'ProvisionsAllDevices':True}
        content = payload.getvalue()
        with patch.object(self.server,'parse_ipa',wraps=ipa_metadata.parse_ipa), patch.object(ipa_metadata,'_decode_profile',return_value=profile):
            status, _, result = self.upload_release('ios', content=content)
        self.assertEqual(status, 201, result)
        release = result['draft']
        self.assertEqual((release['version'],release['build'],release['minimumOsVersion'],release['distribution']), ('0.7.31','68','15.0','enterprise'))
        self.assertEqual(release['sha256'], hashlib.sha256(content).hexdigest())
        self.assertEqual(self.rows(platform='ios'), [])
        self.assertEqual(self.publish_draft(release)[0], 200)
        published = self.rows(platform='ios')[0]
        self.assertEqual((self.data/'packages'/published['filename']).read_bytes(), content)

    def test_management_switch_blocks_legacy_jinling_writes_but_not_generic_apps(self):
        current = self.seed_current()
        old = self.download(current)[2]
        self.assertEqual(self.upload(version='2.0.0')[1]['code'], 'MANAGED_RELEASE_REQUIRED')
        for route, payload in [('/api/publish',{'id':current['id'],'published':False}),
                               ('/api/delete',{'id':current['id'],'confirm_name':current['name']}),
                               ('/api/visibility',{'id':current['id'],'unlisted':False}),
                               ('/api/update',{'id':current['id'],'name':'金陵麻将','published':False})]:
            status, _, raw = self.request('POST',route,payload,auth=True)
            self.assertEqual(status,409,raw)
            self.assertEqual(json.loads(raw)['code'],'MANAGED_RELEASE_REQUIRED')
        self.assertEqual(self.download(current)[2],old)
        self.assertEqual(self.product()['share_url'],fixtures.ORIGIN+'/app/'+fixtures.SLUG)
        generic = self.install(package='com.example.other')
        self.publish(generic)
        self.assertEqual(self.download(generic)[0],200)
        self.assertEqual(self.request('POST','/api/delete',{'id':generic['id'],'confirm_name':generic['name']},auth=True)[0],200)
        with patch.dict(os.environ,{'MANAGEMENT_API_TOKEN_FILE':str(self.data/'missing-secret')}):
            self.assertEqual(self.upload(version='2.0.0')[0],409)
        with patch.dict(os.environ,{'MANAGEMENT_API_TOKEN_FILE':''}):
            self.assertEqual(self.upload(version='2.0.0')[0],201)


if __name__ == '__main__':
    unittest.main(verbosity=2)
