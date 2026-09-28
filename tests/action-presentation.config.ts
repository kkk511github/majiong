import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:['action-presentation.browser.ts','debit-jade.browser.ts','action-crystal.browser.ts','action-crowded-layout.browser.ts'],workers:1,timeout:60000,
 use:{baseURL:'http://127.0.0.1:5199',viewport:{width:1280,height:590},video:'on',screenshot:'only-on-failure',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}],
 webServer:{command:'npx vite --host 127.0.0.1 --port 5199 --strictPort',cwd:resolve('.'),url:'http://127.0.0.1:5199',reuseExistingServer:!process.env.CI},
 outputDir:'../test-results/action-jade-v2'});
