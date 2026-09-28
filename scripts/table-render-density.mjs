import {createHash} from 'node:crypto';
import {readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';

// Creator 3.8.8's web screen adapter hard-caps DPR at 2. On a DPR-3 phone,
// the browser therefore stretches the entire framebuffer by another 1.5x.
// Use physical pixels on phones, bounded to 4MP for large tablets/desktops.
export function tableRenderDensity(dpr,width,height){
 const native=Number.isFinite(dpr)&&dpr>0?dpr:1;
 const area=Number.isFinite(width*height)&&width>0&&height>0?width*height:1;
 return Math.min(native,3,Math.max(1,Math.sqrt(4000000/area)));
}

// Deliberately recognize only the audited 3.8.8 adapter. An engine upgrade
// must fail the build for review, never silently ship the soft 2x fallback.
const adapterGetter=/key:"devicePixelRatio",get:function\(\)\{var (\w+);return Math\.min\(null!==\(\1=window\.devicePixelRatio\)&&void 0!==\1\?\1:1,2\)\}/g;
export function patchScreenDensity(source){
 const matches=[...source.matchAll(adapterGetter)];
 if(matches.length!==1)throw Error(`Expected one Creator 3.8.8 web DPR adapter, found ${matches.length}`);
 return source.replace(adapterGetter,()=>`key:"devicePixelRatio",get:function(){return (${tableRenderDensity.toString()})(window.devicePixelRatio,window.innerWidth,window.innerHeight)}`);
}

export async function applyTableRenderDensity(output){
 const engineDir=resolve(output,'cocos-js');
 const files=(await readdir(engineDir)).filter(name=>name.endsWith('.js'));
 const candidates=[];
 for(const name of files){
  const source=await readFile(resolve(engineDir,name),'utf8');
  if([...source.matchAll(adapterGetter)].length)candidates.push({name,source});
 }
 if(candidates.length!==1)throw Error(`Expected one web screen adapter bundle, found ${candidates.length}`);
 const {name,source}=candidates[0],patched=patchScreenDensity(source);
 // Change the filename too: immutable CDN/WebView caches must not retain an
 // older engine under a URL with new bytes. Repoint all generated text refs.
 const hash=createHash('sha256').update(patched).digest('hex').slice(0,12);
 const next=name.replace(/\.js$/,`-density-${hash}.js`);
 await writeFile(resolve(engineDir,name),patched);
 await rename(resolve(engineDir,name),resolve(engineDir,next));
 const entries=await readdir(output,{recursive:true,withFileTypes:true});
 for(const file of entries.filter(e=>e.isFile()&&/\.(?:js|json|html)$/.test(e.name))){
  const path=resolve(file.parentPath,file.name),text=await readFile(path,'utf8');
  if(text.includes(basename(name)))await writeFile(path,text.replaceAll(name,next));
 }
}
