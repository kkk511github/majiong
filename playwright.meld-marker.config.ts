import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/meld-marker.e2e.ts',workers:1,timeout:45000,
 use:{baseURL:'http://127.0.0.1:5181',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}],
 webServer:{command:'vite --host 127.0.0.1 --port 5181',url:'http://127.0.0.1:5181/cocos-table/index.html',reuseExistingServer:false}});
