import {defineConfig} from '@playwright/test';
import base from './action-authority.config';
export default defineConfig({...base,testMatch:['table-action-theme.e2e.ts','table-claim-controls.e2e.ts','score-debits.e2e.ts'],outputDir:'../test-results/action-existing-regression'});
