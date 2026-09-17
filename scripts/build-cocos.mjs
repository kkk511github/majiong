import { resourceDigest, sourceDigest } from './runtime-integrity.mjs';
import { cp, mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project=resolve(app,'cocos-table'),output=resolve(app,'public/cocos-table');
const runtime=resolve(project,'runtime'),archive=resolve(runtime,'web-mobile.tar.gz');
async function saveRuntime(source){
 await mkdir(runtime,{recursive:true});
 const packed=spawnSync('tar',['-czf',archive,'-C',output,'.'],{encoding:'utf8',env:{...process.env,COPYFILE_DISABLE:'1'}});
 if(packed.status!==0)throw new Error('Could not archive Cocos runtime: '+packed.stderr);
 await writeFile(resolve(runtime,'manifest.json'),JSON.stringify({source,sha256:createHash('sha256').update(await readFile(archive)).digest('hex'),creator:'3.8.8',output:await resourceDigest(output)}));
}
await cp(resolve(app,'shared/table-scene.ts'),resolve(project,'assets/scripts/table-scene.ts'));
await cp(resolve(app,'shared/tile-pose-metrics.ts'),resolve(project,'assets/scripts/tile-pose-metrics.ts'));
const fingerprint=()=>sourceDigest(project);
const source=await fingerprint();
// Linux deployment uses the verified web export of these exact Creator sources.
// Any source change invalidates it and requires an explicit Creator rebuild.
try {
 const manifest=JSON.parse(await readFile(resolve(runtime,'manifest.json'),'utf8'));
 if(manifest.source===source&&manifest.sha256===createHash('sha256').update(await readFile(archive)).digest('hex')){
  // A source stamp alone cannot prove the cached files are still intact.
  try {
   const current=await resourceDigest(output);
   if(manifest.output?.sha256===current.sha256){console.log('Cocos table: verified current production build');process.exit(0);}
  }catch{}
  await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
  const unpacked=spawnSync('tar',['-xzf',archive,'-C',output],{encoding:'utf8'});
  if(unpacked.status!==0)throw new Error(unpacked.stderr);
  const stamp=JSON.parse(await readFile(resolve(output,'build-manifest.json'),'utf8'));
  if(stamp.source!==source)throw new Error('Cocos archive source mismatch');
  await access(resolve(output,'index.html'));
  const restored=await resourceDigest(output);
  if(manifest.output && manifest.output.sha256!==restored.sha256)throw new Error('Cocos archive resource mismatch');
  // Upgrade an older verified archive without repacking or changing its bytes.
  if(!manifest.output)await writeFile(resolve(runtime,'manifest.json'),JSON.stringify({...manifest,output:restored}));
  console.log('Cocos table: verified portable runtime');process.exit(0);
 }
}catch(e){console.warn('Cocos runtime cache unavailable:',e.message);}
const choices=[process.env.COCOS_CREATOR,resolve(app,'../../work/cocos-tools/creator/CocosCreator.app/Contents/MacOS/CocosCreator'),'/Applications/CocosCreator.app/Contents/MacOS/CocosCreator'].filter(Boolean);
let executable;
for(const path of choices){try{await access(path);executable=path;break}catch{}}
if(!executable)throw new Error('Set COCOS_CREATOR to the Cocos Creator 3.8.8 executable to rebuild the shared iOS/Android table.');
const built=resolve(project,'build/web-mobile');await rm(built,{recursive:true,force:true});
const result=spawnSync(executable,['--project',project,'--build','platform=web-mobile;debug=false;buildPath=project://build;startScene=4d10b45c-7965-4b01-9596-0ab41bcdf002'],{encoding:'utf8',maxBuffer:16*1024*1024});
// Creator 3.8.8 reports a successful CLI build with exit code 36.
if(![0,36].includes(result.status))throw new Error(`Cocos build failed: ${result.error?.message||result.status}\n${(result.stdout+result.stderr).slice(-8000)}`);
await access(resolve(built,'index.html'));
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await cp(built,output,{recursive:true,filter:src=>!src.endsWith('.map')});
const completedSource=await fingerprint();
await writeFile(resolve(output,'build-manifest.json'),JSON.stringify({creator:'3.8.8',source:completedSource,debug:false}));
await saveRuntime(completedSource);
console.log('Cocos table: production web build copied for both native platforms');
