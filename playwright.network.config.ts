import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const {channel:_channel,...use}=base.use!;
// The shared account fixture rotates the sole table-creator username. Keep
// browsers serial so one cannot revoke another scenario's creation rights.
export default defineConfig({...base,use,testMatch:'**/network-recovery.soak.ts',outputDir:'test-results-network',timeout:360000,workers:1,
 projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}]});
