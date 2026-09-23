import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const { channel: _channel, ...use } = base.use!;
export default defineConfig({
  ...base, use, testMatch: '**/table-invitations.e2e.ts',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
