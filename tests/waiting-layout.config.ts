import {defineConfig} from '@playwright/test';
import base from './production-table-3d.config';
export default defineConfig({...base,testMatch:'waiting-layout.browser.ts',outputDir:'../test-results/waiting-layout'});
