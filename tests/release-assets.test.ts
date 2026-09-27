import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {previewOnlyAssets,prunePreviewAssets} from '../scripts/release-assets.mjs';
it('only prunes audited preview copies, keeps public source and dynamic assets, and refuses live references',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mahjong-assets-'));
 try{
  for(const dir of ['src','shared','cocos-table/assets/scripts','public','dist'])await mkdir(join(root,dir),{recursive:true});
  for(const file of previewOnlyAssets){await writeFile(join(root,'public',file),'source');await writeFile(join(root,'dist',file),'copy');}
  await writeFile(join(root,'dist','keep.png'),'live');
  await writeFile(join(root,'src','live.ts'),`const name='${previewOnlyAssets[0]}'`);
  await expect(prunePreviewAssets(join(root,'dist'),root)).rejects.toThrow('referenced');
  await writeFile(join(root,'src','live.ts'),'');
  expect((await prunePreviewAssets(join(root,'dist'),root)).savedBytes).toBe(4*previewOnlyAssets.length);
  expect(await readFile(join(root,'dist','keep.png'),'utf8')).toBe('live');
  expect(await readFile(join(root,'public',previewOnlyAssets[0]),'utf8')).toBe('source');
  await expect(prunePreviewAssets(join(root,'public'),root)).rejects.toThrow('source');
 }finally{await rm(root,{recursive:true,force:true});}
});
