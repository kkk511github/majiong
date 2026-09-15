import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const names=['pung','kong','concealed-kong','upgrade-kong','hu','self-draw'];
const source=resolve(app,'cocos-table/art-source/spine'),dest=resolve(app,'cocos-table/assets/resources/art');
await mkdir(source,{recursive:true});await mkdir(dest,{recursive:true});
const cells=await Promise.all(names.map(async(name,i)=>({input:await sharp(resolve(app,`public/art/effects/${name}-gold-v1.png`)).trim().resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer(),left:i%3*512,top:Math.floor(i/3)*512})));
await sharp({create:{width:1536,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(cells).png().toFile(resolve(dest,'action-fx.png'));
let atlas='action-fx.png\nsize: 1536,1024\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n';
const skeletons={};
for(const [i,name] of names.entries()) {
 atlas+=`${name}\n  rotate: false\n  xy: ${i%3*512},${Math.floor(i/3)*512}\n  size: 512,512\n  orig: 512,512\n  offset: 0,0\n  index: -1\n`;
 const data={skeleton:{hash:'jinling-own-'+name+'-v1',spine:'3.8.99',x:-140,y:-140,width:280,height:280},bones:[{name:'root'},{name:'burst',parent:'root'}],slots:[{name:'ink',bone:'burst',attachment:name}],skins:[{name:'default',attachments:{ink:{[name]:{type:'region',path:name,width:280,height:280}}}}],animations:{activate:{bones:{burst:{scale:[{time:0,x:.25,y:.25},{time:.16,x:1.16,y:1.16},{time:.3,x:1,y:1},{time:.84,x:1,y:1},{time:1.08,x:1.07,y:1.07}],rotate:[{time:0,angle:-7},{time:.16,angle:2},{time:.3,angle:0}]}},slots:{ink:{color:[{time:0,color:'ffffff00'},{time:.08,color:'ffffffff'},{time:.82,color:'ffffffff'},{time:1.08,color:'ffffff00'}]}}}}};
 skeletons[name]=data;await writeFile(resolve(source,name+'.json'),JSON.stringify(data));
}
await writeFile(resolve(source,'action-fx.atlas'),atlas);
await writeFile(resolve(dest,'action-fx-data.json'),JSON.stringify({atlas,skeletons}));
console.log('Packed six original action effects for the Spine 3.8 runtime');
