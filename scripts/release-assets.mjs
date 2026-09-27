import {readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
// Explicitly audited design-preview files. Keep source/public and dev previews
// intact; never apply heuristic deletion to dynamic tile/audio/3D resources.
export const previewOnlyAssets=['tile-catalog.html','tile-material-study.html','tile-study-carved.png','qinhuai-table-v1.png'];
export async function prunePreviewAssets(output,project=process.cwd()){
 const root=resolve(output),source=resolve(project);
 if(!root.startsWith(source+'/')||root===resolve(source,'public'))throw Error('Refusing to prune source assets or external directories');
 const code=[];
 for(const folder of ['src','shared','cocos-table/assets/scripts']){
  const base=resolve(source,folder),entries=await readdir(base,{recursive:true,withFileTypes:true});
  for(const e of entries)if(e.isFile()&&/\.(?:tsx?|css|json)$/.test(e.name))code.push({path:relative(source,resolve(e.parentPath,e.name)),text:await readFile(resolve(e.parentPath,e.name),'utf8')});
 }
 const removed=[];
 for(const name of previewOnlyAssets){
  const reference=code.find(file=>file.text.includes(name));if(reference)throw Error(`Preview exclusion is referenced by production code: ${name} in ${reference.path}`);
  const path=resolve(root,name);let info;try{info=await stat(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!info.isFile())throw Error('Expected an individual preview file: '+name);
  await rm(path);removed.push({path:name,bytes:info.size});
 }
 const report={kind:'preview-only-asset-pruning',removed,savedBytes:removed.reduce((n,f)=>n+f.bytes,0)};
 await writeFile(resolve(root,'asset-pruning.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
