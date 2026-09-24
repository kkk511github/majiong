import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'production-table-3d.browser.ts',timeout:60000,workers:1,use:{baseURL:'http://127.0.0.1:5199',browserName:'chromium',channel:'chrome',viewport:{width:1280,height:590}},outputDir:'../test-results/production-table-3d'});
