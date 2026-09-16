import {defineConfig} from '@playwright/test';
import base from './playwright.config';
const {channel:_channel,...shared}=base.use!;
export default defineConfig({...base,use:shared,testMatch:['**/audio-resume.e2e.ts','**/audio-recovery.e2e.ts','**/music-scenes.e2e.ts','**/network-resume.e2e.ts'],projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}]});
