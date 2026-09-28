import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
import {LEGAL_STORAGE_KEY,LEGAL_VERSION} from '../src/legal-copy';
process.env.MAHJONG_E2E_DATABASE=resolve('.tmp/action-authority.sqlite');
process.env.MAHJONG_E2E_API_PORT='8797';process.env.MAHJONG_E2E_UI_PORT='5207';
export default defineConfig({testDir:'.',testMatch:'action-authority.browser.ts',workers:1,timeout:60000,
 use:{baseURL:'http://127.0.0.1:5207',viewport:{width:844,height:390},video:'on',trace:'retain-on-failure',storageState:{cookies:[],origins:[{origin:'http://127.0.0.1:5207',localStorage:[{name:LEGAL_STORAGE_KEY,value:JSON.stringify({version:LEGAL_VERSION,acceptedAt:'2026-09-27T00:00:00Z'})}]}]}},
 projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}],
 webServer:{command:'npx tsx tests/account-ui-server.ts',cwd:resolve('.'),url:'http://127.0.0.1:5207',reuseExistingServer:false,timeout:30000},outputDir:'../test-results/action-authority'});
