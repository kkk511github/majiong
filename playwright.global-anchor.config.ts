import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'global-anchor.e2e.ts',workers:1,timeout:45000,
 outputDir:'test-results-global-anchor',use:{baseURL:'http://127.0.0.1:5180',viewport:{width:1440,height:960},screenshot:'only-on-failure',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}],
 webServer:{command:'vite --host 127.0.0.1 --port 5180',url:'http://127.0.0.1:5180',reuseExistingServer:true}});
