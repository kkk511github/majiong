import {readdir,readFile,access,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {resourceDigest,sourceDigest} from './runtime-integrity.mjs';
import {previewOnlyAssets} from './release-assets.mjs';
const publicRoot=resolve('public'),builtRoot=resolve(process.argv[2]??'dist');
const required=['cocos-table/index.html','audio/mahjong-table.m4a','audio/mahjong-lobby.m4a','audio/nanjing-male.wav','audio/nanjing-female.wav'];
for(const folder of ['actions-jade-v2','actions-crystal-v3']){
 const actionArt=JSON.parse(await readFile(resolve(publicRoot,`ui/${folder}/manifest.json`),'utf8'));
 for(const item of actionArt.sprites){const name=`ui/${folder}/${item.file}`;required.push(name);if(createHash('sha256').update(await readFile(resolve(publicRoot,name))).digest('hex')!==item.sha256)throw Error('Action sprite checksum mismatch: '+name);}
}
for(const gender of ['male','female']){
 const pack=JSON.parse(await readFile(`src/nanjing-${gender}.json`,'utf8'));
 required.push(pack.file.replace(/^\//,''));
}
for(const file of required)await access(resolve(publicRoot,file));
const entries=await readdir(publicRoot,{recursive:true,withFileTypes:true});
const groups={};let checked=0;
for(const e of entries.filter(e=>e.isFile())){
 const path=resolve(e.parentPath,e.name),name=relative(publicRoot,path),data=await readFile(path);
 if(previewOnlyAssets.includes(name)){try{await access(resolve(builtRoot,name));throw Error('Preview asset was not excluded: '+name);}catch(error){if(error.code!=='ENOENT')throw error;}continue;}
 const built=await readFile(resolve(builtRoot,name));
 if(!data.equals(built))throw new Error('Web release asset differs from source: '+name);
 const group=name.split('/')[0];groups[group]??={files:0,bytes:0};groups[group].files++;groups[group].bytes+=data.length;checked++;
}
for(const name of ['table-scene.ts','tile-pose-metrics.ts','table-hand-motion.ts','action-presentation.ts','action-anchors.ts']){
 if(!(await readFile(resolve('shared',name))).equals(await readFile(resolve('cocos-table/assets/scripts',name))))throw new Error('Shared table source not synchronized: '+name);
}
const manifest=JSON.parse(await readFile('cocos-table/runtime/manifest.json','utf8'));
if(await sourceDigest(resolve('cocos-table'))!==manifest.source)throw new Error('Cocos source has changed; rebuild before release');
const runtime=await resourceDigest(resolve(publicRoot,'cocos-table'));
if(runtime.sha256!==manifest.output?.sha256)throw new Error('Cocos web resources do not match verified runtime manifest');
const archive=await readFile('cocos-table/runtime/web-mobile.tar.gz');
if(createHash('sha256').update(archive).digest('hex')!==manifest.sha256)throw new Error('Cocos archive checksum mismatch');
const report={at:new Date().toISOString(),kind:'web-build-public-assets',checked,groups,runtime,archiveBytes:archive.length,note:'Local stored sizes; not measured download, memory or launch timing.'};
await mkdir('docs/research',{recursive:true});
await writeFile('docs/research/web-assets-check.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
