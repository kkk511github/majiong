/** Assemble fixed-origin offline renders without re-centring individual glyphs. */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const poses=JSON.parse(await readFile(resolve(root,'poses.json'),'utf8'));
const selected=process.argv[3]?.split(',');
const names=Object.keys(poses).filter(n=>poses[n].individual&&(!selected||selected.includes(n)));
const records=new Map();let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
let reference,maskDifferences=0;
for(const name of names){
 const pose=poses[name],tiles=[];
 for(let k=0;k<pose.kinds;k++){
  const input=resolve(root,`${name}-${k}.png`),{data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const mask=Buffer.alloc(info.width*info.height);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const a=data[(y*info.width+x)*4+3];mask[y*info.width+x]=a>128?1:0;
   if(a>8){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
  }
  if(reference)for(let i=0;i<mask.length;i++)maskDifferences+=mask[i]!==reference[i]?1:0;
  else reference=mask;
  tiles.push({input,left:k%pose.columns*pose.cell,top:Math.floor(k/pose.columns)*pose.cell});
 }
 records.set(name,tiles);
}
if(maskDifferences)throw Error(`Side bodies differ by ${maskDifferences} silhouette pixels`);
const crop={left:l,top:t,width:r-l+1,height:b-t+1};
for(const name of names){
 const pose=poses[name];pose.crop=crop;
 await sharp({create:{width:pose.columns*pose.cell,height:pose.rows*pose.cell,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(records.get(name)).png().toFile(resolve(root,pose.file));
}
await writeFile(resolve(root,'poses.json'),JSON.stringify(poses,null,2));
await writeFile(resolve(root,selected?`silhouette-${names.join('_')}.json`:'silhouette-check.json'),JSON.stringify({names,crop,maskDifferences,tiles:names.reduce((n,p)=>n+poses[p].kinds,0)},null,2));
console.log(JSON.stringify({crop,maskDifferences,tiles:names.reduce((n,p)=>n+poses[p].kinds,0)}));
