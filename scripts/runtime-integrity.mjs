import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
/** Hash paths and bytes, so a missing, renamed or modified resource invalidates the cache. */
export async function resourceDigest(root){
 const entries=await readdir(root,{recursive:true,withFileTypes:true});
 if(entries.some(e=>e.isSymbolicLink()))throw new Error('Runtime resources must not contain symlinks');
 const files=entries.filter(e=>e.isFile()).map(e=>resolve(e.parentPath,e.name)).sort((a,b)=>relative(root,a).localeCompare(relative(root,b),'en'));
 const hash=createHash('sha256');let bytes=0;
 for(const path of files){
  const content=await readFile(path),name=relative(root,path).replaceAll('\\','/');
  hash.update(name+'\0'+content.length+'\0');hash.update(content);bytes+=content.length;
 }
 return {sha256:hash.digest('hex'),files:files.length,bytes};
}

export async function sourceDigest(project){
 const hash=createHash('sha256');
 for(const folder of ['assets','settings']) {
  const base=resolve(project,folder),files=await readdir(base,{recursive:true,withFileTypes:true});
  for(const file of files.filter(f=>f.isFile()).sort((a,b)=>(a.parentPath+a.name).localeCompare(b.parentPath+b.name))){
   const path=resolve(file.parentPath,file.name);hash.update(relative(project,path));hash.update(await readFile(path));
  }
 }
 return hash.digest('hex');
}
