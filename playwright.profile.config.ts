import {defineConfig} from '@playwright/test';
import base from './playwright.cocos-release.config';
export default defineConfig({...base,testMatch:['**/profile-avatar.e2e.ts','**/profile-layout.e2e.ts']});
