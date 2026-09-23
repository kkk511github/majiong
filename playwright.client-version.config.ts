import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const { channel: _channel, ...use } = base.use!;
export default defineConfig({
  ...base, use, testMatch: '**/client-version.browser.ts',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'tsx tests/account-ui-server.ts', url: 'http://127.0.0.1:5178',
    reuseExistingServer: false, timeout: 30000,
    env: { MIN_CLIENT_VERSION: '9.0.0' },
  },
});
