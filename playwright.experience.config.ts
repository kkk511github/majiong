import {defineConfig} from '@playwright/test';
import base from './playwright.cocos-release.config';
export default defineConfig({...base,testMatch:['**/experience-ui.e2e.ts']});
