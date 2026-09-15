import sharp from 'sharp';
import {readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const input=resolve(process.argv[2]);
const resources=resolve(app,'cocos-table/assets/resources');
await mkdir(resolve(resources,'tiles'),{recursive:true});
const poses=JSON.parse(await readFile(resolve(input,'poses.json'),'utf8'));
const catalog={};
for(const [name,pose]of Object.entries(poses)){
 if(/-(near|far)$/.test(name)||/^top-(left|right)$/.test(name)){await rm(resolve(resources,'tiles',name+'.png'),{force:true});await rm(resolve(resources,'tiles',name+'.png.meta'),{force:true});continue;}
 const source=resolve(input,pose.file),frames=[];
 let maxW=0,maxH=0;
 for(let k=0;k<pose.kinds;k++){
  const raw=await sharp(source).extract({left:k%pose.columns*pose.cell,top:Math.floor(k/pose.columns)*pose.cell,width:pose.cell,height:pose.cell}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let l=pose.cell,t=pose.cell,r=0,b=0;
  for(let y=0;y<pose.cell;y++)for(let x=0;x<pose.cell;x++)if(raw.data[(y*pose.cell+x)*4+3]>8){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
  const rect=pose.crop||{left:l,top:t,width:r-l+1,height:b-t+1};
  const image=await sharp(raw.data,{raw:{width:pose.cell,height:pose.cell,channels:4}}).extract(rect).png().toBuffer();
  frames.push({image,w:rect.width,h:rect.height});maxW=Math.max(maxW,rect.width+4);maxH=Math.max(maxH,rect.height+4);
 }
 const width=pose.columns*maxW,height=pose.rows*maxH;
 const rects=frames.map((f,k)=>({x:k%pose.columns*maxW+2,y:Math.floor(k/pose.columns)*maxH+2,w:f.w,h:f.h}));
 await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames.map((f,k)=>({input:f.image,left:rects[k].x,top:rects[k].y}))).png().toFile(resolve(resources,'tiles',name+'.png'));
 catalog[name]={rects,width,height,projection:{shear:pose.shear||0,eye:pose.eye,rotation:pose.rotation}};
}
await writeFile(resolve(resources,'tile-atlas.json'),JSON.stringify(catalog));
await copyFile(resolve(app,'shared/table-scene.ts'),resolve(app,'cocos-table/assets/scripts/table-scene.ts'));
await mkdir(resolve(resources,'art'),{recursive:true});
await copyFile(resolve(app,'public/art/table-reference-v3.png'),resolve(resources,'art/table.png'));
await copyFile(resolve(app,'public/avatars.png'),resolve(resources,'art/avatars.png'));
for(const name of ['pung','kong','concealed-kong','upgrade-kong','hu','self-draw'])await copyFile(resolve(app,`public/art/effects/${name}-gold-v1.png`),resolve(resources,`art/${name}.png`));
await copyFile(resolve(app,'public/art/effects/discard-pointer-gold-v1.png'),resolve(resources,'art/pointer.png'));
console.log('Packed',Object.keys(catalog).length,'Cocos pose atlases');
