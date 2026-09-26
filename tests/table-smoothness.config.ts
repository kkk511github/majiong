import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'table-smoothness.browser.ts',timeout:60000,workers:1,
  use:{baseURL:'http://127.0.0.1:5199',viewport:{width:844,height:390}},
  projects:[{name:'chrome',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}],
  outputDir:'../test-results/table-smoothness'});
