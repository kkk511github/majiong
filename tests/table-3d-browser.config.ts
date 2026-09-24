import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch:'table-3d.browser.ts', timeout:90000, workers:1,
  use:{ baseURL:'http://127.0.0.1:5199', channel:'chrome', viewport:{width:1440,height:800}, screenshot:'only-on-failure' },
  outputDir:'../test-results/3d-preview',
});
