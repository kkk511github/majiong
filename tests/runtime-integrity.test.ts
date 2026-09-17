import {it,expect} from 'vitest';
import {mkdtemp,writeFile,mkdir,rm,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resourceDigest} from '../scripts/runtime-integrity.mjs';
it('runtime integrity detects changed bytes, missing files and renamed paths',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runtime-integrity-'));
 try{
  await mkdir(join(dir,'assets'));await writeFile(join(dir,'index.html'),'table');await writeFile(join(dir,'assets','tile.png'),'image');
  const original=await resourceDigest(dir);expect(original.files).toBe(2);expect(original.bytes).toBe(10);
  expect(await resourceDigest(dir)).toEqual(original);
  await writeFile(join(dir,'assets','tile.png'),'other');expect((await resourceDigest(dir)).sha256).not.toBe(original.sha256);
  await writeFile(join(dir,'assets','tile.png'),'image');expect(await resourceDigest(dir)).toEqual(original);
  await rename(join(dir,'assets','tile.png'),join(dir,'assets','new.png'));expect((await resourceDigest(dir)).sha256).not.toBe(original.sha256);
  await rm(join(dir,'assets','new.png'));expect((await resourceDigest(dir)).files).toBe(1);
  await symlink(join(dir,'index.html'),join(dir,'alias'));await expect(resourceDigest(dir)).rejects.toThrow('symlinks');
 }finally{await rm(dir,{recursive:true,force:true});}
});
