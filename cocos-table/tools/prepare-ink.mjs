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
// Wan, dots and bamboo use a reviewed fixed-grid importer below so their per-tile
// scale and placement survive the source-sheet round trip exactly.
for(const [file,start,count] of [['honors-v1.png',27,7],['flowers-v1.png',34,8]]) {
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

const suitGrid={left:32,top:60,width:320,height:472,columns:3,rows:3};
const target={width:512,height:755};
function cleanTransparentPixels(data) {
 for(let i=0;i<data.length;i+=4) {
  const alpha=data[i+3];
  if(alpha<=8) data[i]=data[i+1]=data[i+2]=data[i+3]=0;
  else if(alpha>=250) data[i+3]=255;
 }
}

// The approved replacement sheets deliberately include transparent padding.
// Their 320 x 472 cells map almost exactly 1.6x to the shared 512 x 755 UV.
// Keep the reviewed cell centre, but enlarge the motifs so they fill the jade
// face at gameplay size.  The mixed honor/season sheet is not in kind order,
// so its explicit semantic map is intentionally kept alongside the filename.
const fixedGridSheets=[
 {file:'honors-seasons-v2.png',kinds:[36,35,30,27,37,34,33,31,32],artScale:1.20}, // 秋夏北 / 東冬春 / 白中發
 {file:'south-west-botanicals-v2.png',kinds:[40,41,28,29,38,39],artScale:1.20}, // 竹菊南 / 西梅兰
 {file:'wan-v2.png',kinds:[0,1,2,3,4,5,6,7,8],artScale:1.20},
 {file:'dots-v1.png',kinds:[9,10,11,12,13,14,15,16,17],artScale:1.28},
 {file:'bamboo-v2.png',kinds:[18,19,20,21,22,23,24,25,26],artScale:1.20},
];
for(const {file,kinds,artScale} of fixedGridSheets) {
 const input=resolve(root,'cocos-table/art-source/imagegen',file);
 const metadata=await sharp(input).metadata();
 const expectedWidth=suitGrid.left*2+suitGrid.width*suitGrid.columns;
 const expectedHeight=suitGrid.top*2+suitGrid.height*suitGrid.rows;
 if(metadata.width!==expectedWidth||metadata.height!==expectedHeight)
  throw new Error(`Unexpected fixed-grid sheet dimensions: ${file} (${metadata.width}x${metadata.height})`);
 for(let i=0;i<kinds.length;i++) {
  const left=suitGrid.left+i%suitGrid.columns*suitGrid.width;
  const top=suitGrid.top+Math.floor(i/suitGrid.columns)*suitGrid.height;
  const cell=await sharp(input).extract({left,top,width:suitGrid.width,height:suitGrid.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  cleanTransparentPixels(cell.data);
  const enlarged={width:Math.round(target.width*artScale),height:Math.round(target.height*artScale)};
  const resized=await sharp(cell.data,{raw:cell.info})
   .resize(enlarged.width,enlarged.height,{fit:'fill',kernel:sharp.kernel.lanczos3})
   .extract({
    left:Math.floor((enlarged.width-target.width)/2),
    top:Math.floor((enlarged.height-target.height)/2),
    width:target.width,
    height:target.height,
   })
   .raw().toBuffer({resolveWithObject:true});
  cleanTransparentPixels(resized.data);
  await sharp(resized.data,{raw:resized.info}).png({compressionLevel:9,adaptiveFiltering:true}).toFile(resolve(out,`${kinds[i]}.png`));
 }
 console.log('Prepared fixed-grid HD sheet',file);
}
