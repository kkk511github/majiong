import {defineConfig} from 'vitest/config';

// Pure helper tests also import Cocos scripts. They must not require Creator's
// ignored/generated temp/tsconfig.cocos.json on CI or the production build host.
export default defineConfig({test:{include:['tests/**/*.test.ts'],testTimeout:15000},esbuild:{tsconfigRaw:JSON.stringify({compilerOptions:{target:'ES2022',jsx:'react-jsx'}})}});
