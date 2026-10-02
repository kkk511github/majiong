"""Run independently: test modules each own the imported server's data dir."""
import json
import os
from unittest.mock import patch
import unittest
from test_management_releases import ManagementReleaseTests


class SuperSignTests(ManagementReleaseTests):
    def test_disable_super_sign_blocks_unsigned_current_and_restores_enterprise(self):
        android = self.seed_current('android')
        with patch.dict(os.environ, {'IOS_SIGNING_URL': 'https://sign.example.test:8443'}):
            draft = self.draft('ios', ios_signed=False, ios_distribution='', provisioning_expires_at='')
            self.assertEqual(self.publish_draft(draft)[0], 200)
        with patch.dict(os.environ, {'IOS_SIGNING_URL': ''}):
            ios = next(dict(r) for r in self.server.releases.variants() if r['platform'] == 'ios')
            public = self.server.app_response(ios)
            self.assertEqual(public['installation_method'], 'signed_ipa')
            self.assertNotIn('signing_url', public)
            self.assertEqual(public['install_url'], '')
            self.assertEqual(self.request('GET', '/manifest/' + ios['id'] + '.plist')[0], 409)
            self.assertEqual(self.upload_release('ios', version='2.0.0', ios_signed=False)[0], 400)
            signed = self.draft('ios', version='2.0.0', version_code='201', ios_distribution='enterprise')
            status, _, result = self.publish_draft(signed)
            self.assertEqual(status, 200, result)
            current = next(dict(r) for r in self.server.releases.variants() if r['platform'] == 'ios')
            public = self.server.app_response(current)
            self.assertEqual(current['id'], ios['id'])
            self.assertNotIn('signing_url', public)
            self.assertTrue(public['install_url'].startswith('itms-services://?'))
            self.assertIn('信任企业开发者', public['installation_note'])
            self.assertEqual(self.request('GET', '/manifest/' + ios['id'] + '.plist')[0], 200)
            self.assertEqual(next(r for r in self.server.releases.variants() if r['platform'] == 'android')['sha256'], android['sha256'])

    def test_unsigned_publish_uses_bridge_and_never_raw_manifest(self):
        android = self.seed_current('android')
        with patch.dict(os.environ, {'IOS_SIGNING_URL': 'https://sign.example.test:8443'}):
            draft = self.draft('ios', ios_signed=False, ios_distribution='', provisioning_expires_at='')
            status, _, result = self.publish_draft(draft)
            self.assertEqual(status, 200, result)
            variants = self.server.releases.variants()
            ios = next(dict(r) for r in variants if r['platform'] == 'ios')
            public = self.server.app_response(ios)
            self.assertEqual(public['signing_url'], 'https://sign.example.test:8443/hub/' + ios['id'])
            self.assertTrue(public['install_url'].startswith('itms-services://?'))
            self.assertEqual(public['installation_method'], 'super_sign')
            self.assertEqual(self.request('GET', '/manifest/' + ios['id'] + '.plist')[0], 409)
            self.assertEqual(next(r for r in variants if r['platform'] == 'android')['sha256'], android['sha256'])


if __name__ == '__main__':
    suite = unittest.TestSuite([SuperSignTests(name) for name in (
        'test_unsigned_publish_uses_bridge_and_never_raw_manifest',
        'test_disable_super_sign_blocks_unsigned_current_and_restores_enterprise',
    )])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
