import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDeploymentManifest} from '../scripts/deployment-manifest.mjs';
it('a runtime cannot relabel modified code as the old immutable release',()=>{
 const root=mkdtempSync(join(tmpdir(),'mahjong-manifest-'));
 try{mkdirSync(join(root,'server'));writeFileSync(join(root,'server/a.ts'),'old');
 const source=[{path:'server/a.ts',sha256:createHash('sha256').update('old').digest('hex')}];writeFileSync(join(root,'release-manifest.json'),JSON.stringify({release:'r1',source}));
 expect(verifyDeploymentManifest(root,'r1')).toBe('r1');expect(()=>verifyDeploymentManifest(root,'r2')).toThrow('mismatch');
 writeFileSync(join(root,'server/a.ts'),'new');expect(()=>verifyDeploymentManifest(root,'r1')).toThrow('differs');
 }finally{rmSync(root,{recursive:true,force:true});}
});
