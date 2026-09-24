// Isolated local experiment. Never replaces the shipped Cocos runtime.
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root = process.cwd();
const source = resolve(root, 'cocos-table');
const project = resolve(root, 'output/cocos-table-3d-preview');
await mkdir(project, { recursive: true });
for (const name of ['assets', 'settings', 'package.json', 'tsconfig.json'])
  await cp(resolve(source, name), resolve(project, name), { recursive: true });
const enginePath = resolve(project, 'settings/v2/packages/engine.json');
const engine = JSON.parse(await readFile(enginePath, 'utf8'));
const config = engine.modules.configs.defaultConfig;
config.cache['3d']._value = true;
config.includeModules = [...new Set([...config.includeModules, '3d'])];
await writeFile(enginePath, JSON.stringify(engine, null, 2));
const creator = process.env.COCOS_CREATOR || resolve(root, '../../work/cocos-tools/creator/CocosCreator.app/Contents/MacOS/CocosCreator');
await writeFile(resolve(project, 'assets/resources/preview-standard.mtl'), JSON.stringify({
  __type__: 'cc.Material', _name: 'preview-standard', _objFlags: 0, _native: '',
  _effectAsset: { __uuid__: 'c8f66d17-351a-48da-a12c-0212d28575c4' },
  _techIdx: 0, _defines: [{ USE_ALBEDO_MAP: true }], _states: [{}], _props: [{}],
}));
const status = await new Promise((done, reject) => {
  const child = spawn(creator, ['--project', project, '--build', 'platform=web-mobile;debug=true;buildPath=project://build;startScene=4d10b45c-7965-4b01-9596-0ab41bcdf002'], { stdio: 'inherit' });
  child.on('error', reject); child.on('close', done);
});
if (![0, 36].includes(status)) throw Error(`Creator preview build failed: ${status}`);
await access(resolve(project, 'build/web-mobile/index.html'));
await cp(resolve(source, 'art-source/ink'), resolve(project, 'build/web-mobile/face-source'), { recursive: true });
console.log('Local-only Cocos 3D preview runtime ready. Production runtime unchanged.');
