import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from './playwright.config';
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from './src/legal-copy';

process.env.MAHJONG_E2E_DATABASE = resolve('.tmp/replay-input-e2e.sqlite');
process.env.MAHJONG_E2E_API_PORT = '8793';
process.env.MAHJONG_E2E_UI_PORT = '5193';
const origin = 'http://127.0.0.1:5193';
const { channel: _channel, ...use } = base.use!;
export default defineConfig({
  ...base,
  testMatch: ['**/replay-readiness.e2e.ts', '**/records-input.e2e.ts', '**/replay.e2e.ts', '**/replay-motion.e2e.ts', '**/table-motion-release.e2e.ts'],
  outputDir: './test-results/replay-input',
  use: { ...use, baseURL: origin, storageState: { cookies: [], origins: [{ origin,
    localStorage: [{ name: LEGAL_STORAGE_KEY, value: JSON.stringify({ version: LEGAL_VERSION, acceptedAt: new Date().toISOString() }) }],
  }] } },
  webServer: { command: 'tsx tests/account-ui-server.ts', url: origin, reuseExistingServer: false, timeout: 30000 },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
