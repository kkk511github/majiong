import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export function normalizeNativeDependencyPaths(source){
  return source.replace(/node_modules\/\.pnpm\/[^/\s'"]+\/node_modules\/(@capacitor\/[^/\s'"]+)/g,'node_modules/$1');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  for(const name of ['android/capacitor.settings.gradle','ios/App/CapApp-SPM/Package.swift']){
    const path=resolve(root,name),before=await readFile(path,'utf8'),after=normalizeNativeDependencyPaths(before);
    if(before===after)continue;
    if(process.argv.includes('--check'))throw Error(`Non-portable native dependency path: ${name}`);
    await writeFile(path,after);console.log(`Normalized ${name}`);
  }
}
