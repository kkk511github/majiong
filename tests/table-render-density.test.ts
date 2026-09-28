import {describe,it,expect} from 'vitest';
import {tableRenderDensity,patchScreenDensity,applyTableRenderDensity} from '../scripts/table-render-density.mjs';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const adapter='key:"devicePixelRatio",get:function(){var t;return Math.min(null!==(t=window.devicePixelRatio)&&void 0!==t?t:1,2)}';
describe('phone native rendering density',()=>{
 it('keeps 1x/2x screens unchanged and renders typical 3x phones natively',()=>{
  for(const density of [1,1.5,2,3])expect(tableRenderDensity(density,844,390)).toBe(density);
  expect(tableRenderDensity(3,956,440)).toBe(3);
 });
 it('bounds large-screen rendering cost and rejects invalid pixel ratios',()=>{
  for(const [w,h]of [[1280,800],[2048,1536],[2560,1440]])expect(w*h*tableRenderDensity(4,w,h)**2).toBeLessThanOrEqual(4000001);
  expect(tableRenderDensity(NaN,844,390)).toBe(1);
  expect(tableRenderDensity(0,844,390)).toBe(1);
  expect(tableRenderDensity(3,0,0)).toBe(3);
 });
 it('patches only the audited adapter and fails closed on engine changes',()=>{
  const patched=patchScreenDensity(adapter);
  expect(patched).toContain('tableRenderDensity');expect(patched).not.toContain('t:1,2)');
  const getter=new Function('window',`return ({${patched}}).get();`);
  expect(getter({devicePixelRatio:3,innerWidth:844,innerHeight:390})).toBe(3);
  expect(()=>patchScreenDensity(adapter+adapter)).toThrow('found 2');
  expect(()=>patchScreenDensity('changed engine')).toThrow('found 0');
 });
 it('cache-busts the patched engine and rewrites generated imports',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'table-density-'));
  try{
   await mkdir(join(dir,'cocos-js'));
   await writeFile(join(dir,'cocos-js','engine-old.js'),`const engine={${adapter}};`);
   await writeFile(join(dir,'index.html'),'<script src="./cocos-js/engine-old.js"></script>');
   await writeFile(join(dir,'import-map.json'),'{"cc":"./cocos-js/engine-old.js"}');
   await applyTableRenderDensity(dir);
   const [engine]=await readdir(join(dir,'cocos-js'));
   expect(engine).toMatch(/^engine-old-density-[a-f0-9]{12}\.js$/);
   expect(await readFile(join(dir,'index.html'),'utf8')).toContain(engine);
   expect(await readFile(join(dir,'import-map.json'),'utf8')).toContain(engine);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
