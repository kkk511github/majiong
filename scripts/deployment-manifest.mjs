import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export function verifyDeploymentManifest(root,release){
 const base=resolve(root),manifest=JSON.parse(readFileSync(resolve(base,'release-manifest.json'),'utf8'));
 if(manifest.release!==release||!Array.isArray(manifest.source)||!manifest.source.length)throw Error('Runtime release manifest mismatch');
 for(const item of manifest.source){
  if(typeof item.path!=='string'||!(/^(server|shared|scripts)\//.test(item.path)||['package.json','package-lock.json'].includes(item.path))||item.path.split('/').includes('..'))throw Error('Invalid source manifest path');
  const file=resolve(base,item.path);if(!lstatSync(file).isFile())throw Error('Invalid runtime source file');
  if(createHash('sha256').update(readFileSync(file)).digest('hex')!==item.sha256)throw Error('Runtime source differs from immutable release: '+item.path);
 }
 return manifest.release;
}
