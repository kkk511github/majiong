import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import base from './playwright.config';
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from './src/legal-copy';

// Each run owns its database under this worktree; never use ../../work or
// a caller-provided deployment database in the destructive fixture seeder.
const run = process.env.MAHJONG_RELEASE_RISK_RUN ?? randomUUID();
if (!/^[a-zA-Z0-9-]{1,80}$/.test(run)) throw Error('Invalid release-risk run ID');
process.env.MAHJONG_RELEASE_RISK_RUN = run;
const output = resolve('test-results-release-risk', run);
process.env.MAHJONG_E2E_DATABASE = resolve(output, 'accounts.sqlite');
const uiPort = Number(process.env.MAHJONG_RELEASE_RISK_UI_PORT ?? 5197);
const apiPort = Number(process.env.MAHJONG_RELEASE_RISK_API_PORT ?? 8797);
if (![uiPort, apiPort].every(port => Number.isInteger(port) && port >= 1024 && port <= 65535) || uiPort === apiPort)
  throw Error('Invalid release-risk test ports');
process.env.MAHJONG_E2E_UI_PORT = String(uiPort);
process.env.MAHJONG_E2E_API_PORT = String(apiPort);
const baseURL = `http://127.0.0.1:${uiPort}`;
const { channel: _channel, ...sharedUse } = base.use ?? {};
export default defineConfig({
  ...base,
  testMatch: ['external-records.e2e.ts', 'records-workspace.e2e.ts', 'records-input.e2e.ts',
    'clock.e2e.ts', 'network-resume.e2e.ts', 'cocos-controls.e2e.ts', 'stability-layout.e2e.ts', 'stability-auth.e2e.ts',
    'cocos-app.e2e.ts', 'win-hints.e2e.ts', 'table-smoothness.browser.ts', 'table-motion-release.e2e.ts'],
  outputDir: resolve(output, 'browser'),
  reporter: [['list'], ['json', { outputFile: resolve(output, 'browser.json') }]],
  use: { ...sharedUse, baseURL, storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [
    { name: LEGAL_STORAGE_KEY, value: JSON.stringify({ version: LEGAL_VERSION, acceptedAt: '2026-10-03T00:00:00Z' }) },
  ] }] } },
  webServer: { command: 'tsx tests/account-ui-server.ts', url: baseURL, reuseExistingServer: false, timeout: 30000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } }],
});
