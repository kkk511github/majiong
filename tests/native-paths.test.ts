import {it,expect} from 'vitest';
// @ts-expect-error build helper is a Node ESM module
import {normalizeNativeDependencyPaths} from '../scripts/normalize-native-paths.mjs';
it('normalizes Gradle and SwiftPM generated pnpm paths without changing portable npm paths',()=>{
 const inputs=["../node_modules/.pnpm/@capacitor+android@8.5.2_@capacitor+core@8.5.2/node_modules/@capacitor/android/capacitor","../../../node_modules/.pnpm/@capacitor+app@8.1.1_@capacitor+core@8.5.2/node_modules/@capacitor/app"];
 expect(normalizeNativeDependencyPaths(inputs.join('\n'))).toBe('../node_modules/@capacitor/android/capacitor\n../../../node_modules/@capacitor/app');
 expect(normalizeNativeDependencyPaths('../../../node_modules/@capacitor/share')).toBe('../../../node_modules/@capacitor/share');
});
