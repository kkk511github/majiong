import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const { channel, ...use } = base.use!;
const output = `docs/audit/20261003-0025/after-fix/${process.env.MAHJONG_STABILITY_RUN ?? 'final'}`;
export default defineConfig({ ...base, use,
  testMatch: ['clock.e2e.ts', 'network-resume.e2e.ts', 'cocos-controls.e2e.ts', 'stability-layout.e2e.ts', 'stability-auth.e2e.ts'],
  outputDir: `${output}/browser-results`,
  reporter: [['list'], ['json', { outputFile: `${output}/browser.json` }]],
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
});
