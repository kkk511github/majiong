import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'draw-penalty.browser.ts',timeout:60000,workers:1,
  use:{baseURL:'http://127.0.0.1:5199'},
  projects:[
    {name:'chrome-phone',use:{browserName:'chromium',channel:'chrome',viewport:{width:844,height:390}}},
    {name:'webkit-phone',use:{browserName:'webkit',viewport:{width:844,height:390}}},
  ],
  outputDir:'../test-results/draw-penalty',
});
