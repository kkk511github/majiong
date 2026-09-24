import {readdir,readFile,stat,access} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const walk=async(dir)=>{const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]))).flat();};
const digest=async(path)=>createHash('sha256').update(await readFile(path)).digest('hex');
const output=resolve(root,'public/cocos-table'),files=await walk(output),counts=new Map();
for(const file of files){const hash=await digest(file);counts.set(hash,(counts.get(hash)||0)+1);}
const source=[...(await walk(resolve(root,'cocos-table/art-source/ink'))).filter(p=>p.endsWith('.png')),resolve(root,'cocos-table/art-source/imagegen/reference-table-v1/table-background.png')];
for(const file of source)if(counts.get(await digest(file))!==1)throw Error(`Expected one packaged copy: ${file}`);
for(const old of ['face-source','art/table3d-background.png']){
  const exists=await access(resolve(output,old)).then(()=>true,()=>false);
  if(exists)throw Error(`Obsolete duplicate resource route: ${old}`);
}
const bytes=(await Promise.all(files.map(async f=>(await stat(f)).size))).reduce((n,b)=>n+b,0);
console.log(JSON.stringify({imagesChecked:source.length,copiesPerImage:1,outputBytes:bytes},null,2));
