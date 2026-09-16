import sharp from 'sharp';
import { mkdir, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out=resolve(root,'cocos-table/art-source/ink');
await mkdir(out,{recursive:true});
// These are the project's own OFL brush outlines and deterministic pip/stem
// vectors. Rasterisation is an asset build step; no third-party sprite is used.
for(let kind=0;kind<42;kind++) {
 const raw=await readFile(resolve(root,`public/tiles/${kind}.svg`),'utf8');
 const source=Buffer.from(raw.replace('viewBox="0 0 64 88"',kind>=9&&kind<27?'viewBox="5 5 54 68"':'viewBox="4 3 56 74"'));
 await sharp(source).resize(256,352).png().toFile(resolve(out,`${kind}.png`));
}
console.log('Prepared 42 exact semantic ink textures');
// Production imagegen ink sheets override the older vector design. Only split,
// trim transparent padding and pack UV cells; preserve the generated artwork.
for(const [file,start,count] of [['wan-v1.png',0,9],['dots-v1.png',9,9],['bamboo-v2.png',18,9],['honors-v1.png',27,7],['flowers-v1.png',34,8]]) {
 const input=resolve(root,'cocos-table/art-source/imagegen',file);
 try{await access(input)}catch{continue}
 const metadata=await sharp(input).metadata(),iw=metadata.width,ih=metadata.height;
 for(let i=0;i<count;i++){
  const x=Math.round(i%3*iw/3),y=Math.round(Math.floor(i/3)*ih/3);
  const w=Math.round((i%3+1)*iw/3)-x,h=Math.round((Math.floor(i/3)+1)*ih/3)-y;
  const raw=await sharp(input).extract({left:x,top:y,width:w,height:h}).ensureAlpha().raw().toBuffer();
  let l=w,t=h,r=0,b=0;
  for(let py=0;py<h;py++)for(let px=0;px<w;px++)if(raw[(py*w+px)*4+3]>24){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);b=Math.max(b,py);}
  if(l>=r||t>=b)throw new Error('Missing ink in '+file+' cell '+i);
  await sharp(raw,{raw:{width:w,height:h,channels:4}}).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(244,336,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({top:8,bottom:8,left:6,right:6,background:{r:0,g:0,b:0,alpha:0}}).png().toFile(resolve(out,`${start+i}.png`));
 }
 console.log('Prepared imagegen',file);
}

// The eight bamboo is a separately reviewed W-over-M engraving. It supersedes
// the rejected narrow symbol on the original bamboo sheet, at every camera pose.
for(const [file,kind] of [['eight-bamboo-v3.png',25],['six-dots-v2.png',14],['two-dots-v2.png',10],['five-dots-v2.png',13],['nine-dots-v2.png',17]]) {
 const image=resolve(root,'cocos-table/art-source/imagegen',file);
 await sharp(image).trim({threshold:24}).resize(244,336,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({top:8,bottom:8,left:6,right:6,background:{r:0,g:0,b:0,alpha:0}}).png().toFile(resolve(out,`${kind}.png`));
}

// Reviewed v3 dots supersede the old one-off pips as one consistent family.
const { prepareDots } = await import('./prepare-dots-v3.mjs');
await prepareDots();
