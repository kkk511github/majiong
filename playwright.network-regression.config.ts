import {defineConfig} from '@playwright/test';
import base from './playwright.config';
const {channel,...use}=base.use!;
export default defineConfig({...base,use,testMatch:'network-resume.e2e.ts',projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}]});
