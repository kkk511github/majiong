import { defineConfig } from '@playwright/test';
import base from './playwright.cocos-release.config';

export default defineConfig({
  ...base,
  testMatch: [
    '**/table-motion-release.e2e.ts',
    '**/table-claim-controls.e2e.ts',
    '**/cocos-controls.e2e.ts',
    '**/cocos-app.e2e.ts',
    '**/score-debits.e2e.ts',
  ],
});
