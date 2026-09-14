import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base, testMatch:'**/*.soak.ts', outputDir:'test-results-soak', timeout:720000, workers:1});
