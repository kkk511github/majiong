import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const {channel:_channel,...use}=base.use!;
export default defineConfig({...base,use,testMatch:'**/network-recovery.soak.ts',outputDir:'test-results-network',timeout:180000,workers:2,
 projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}]});
