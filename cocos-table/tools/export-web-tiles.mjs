// Share the same baked faces with React's help, listening and result screens.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=resolve(root,'cocos-table/assets/resources');
const atlas=JSON.parse(await readFile(resolve(source,'tile-atlas.json'),'utf8'));
const out=resolve(root,'public/tiles/vivid');await mkdir(out,{recursive:true});
for(const pose of ['own','back-top']) await copyFile(resolve(source,`tiles/${pose}.png`),resolve(out,`${pose}.png`));
const frames=pose=>atlas[pose].rects.map(r=>({file:`../vivid/${pose}`,rect:[r.x,r.y,r.w,r.h],sheet:[atlas[pose].width,atlas[pose].height]}));
await writeFile(resolve(root,'src/tile-vivid.json'),JSON.stringify({faces:frames('own'),back:frames('back-top')[0]}));
console.log('Exported 42 shared vivid faces and tile back');
