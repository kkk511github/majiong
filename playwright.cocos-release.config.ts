import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const {channel: _channel, ...sharedUse} = base.use ?? {};
export default defineConfig({
  ...base,
  use: sharedUse,
  testMatch:['**/win-hints.e2e.ts','**/cocos-app.e2e.ts','**/cocos-controls.e2e.ts','**/replay.e2e.ts','**/voice.e2e.ts','**/music-scenes.e2e.ts','**/network-resume.e2e.ts'],
  projects:[
    {name:'chromium',use:{...sharedUse,browserName:'chromium',channel:'chrome'}},
    {name:'webkit',use:{...sharedUse,browserName:'webkit'}},
  ],
});
