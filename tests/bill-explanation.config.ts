import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'bill-explanation.browser.ts',workers:1,timeout:60000,
 use:{baseURL:'http://127.0.0.1:5199',viewport:{width:1000,height:700}},
 projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}],
 webServer:{command:'npx vite --host 127.0.0.1 --port 5199 --strictPort',url:'http://127.0.0.1:5199',reuseExistingServer:!process.env.CI},
 outputDir:'../test-results/bill-explanation'});
