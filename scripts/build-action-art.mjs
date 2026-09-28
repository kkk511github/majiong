// Asset packaging only: preserve the generated alpha and normalize sprite
// padding/resolution. No generated letter is substituted with a system font.
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),out=new URL('public/ui/actions-jade-v2/',root);
await mkdir(out,{recursive:true});
const manifest=[];
for(const name of ['pung','kong','hu','pass','plate']){
 const input=new URL(`art-source/actions-jade-v2/${name}.png`,root),meta=await sharp(input.pathname).metadata();
 if(!meta.hasAlpha)throw Error('Sprite needs real alpha: '+name);
 const png=await sharp(input.pathname).trim().resize(name==='plate'?256:320,name==='plate'?256:320,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 await writeFile(new URL(`${name}.png`,out),png);
 const stats=await sharp(png).stats();if(stats.channels[3]?.min!==0)throw Error('Transparency lost: '+name);
 manifest.push({name,file:`${name}.png`,width:name==='plate'?256:320,height:name==='plate'?256:320,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex'),alpha:true});
}
await writeFile(new URL('manifest.json',out),JSON.stringify({version:'jade-v2',origin:'OpenAI built-in image_gen; original generated art',sprites:manifest},null,2)+'\n');
console.log(JSON.stringify(manifest.map(({name,bytes,alpha})=>({name,bytes,alpha}))));
const crystalOut=new URL('public/ui/actions-crystal-v3/',root);
await mkdir(crystalOut,{recursive:true});
const crystalSprites=[];
for(const name of ['plate','fire-ring']){
 const crystal=await sharp(new URL(`art-source/actions-crystal-v3/${name}.png`,root).pathname).trim().resize(256,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 if((await sharp(crystal).stats()).channels[3]?.min!==0)throw Error('Crystal sprite transparency lost: '+name);
 await writeFile(new URL(`${name}.png`,crystalOut),crystal);
 crystalSprites.push({name,file:`${name}.png`,width:256,height:256,bytes:crystal.length,sha256:createHash('sha256').update(crystal).digest('hex'),alpha:true});
}
await writeFile(new URL('manifest.json',crystalOut),JSON.stringify({version:'crystal-v3',origin:'OpenAI built-in image_gen; original generated art',sprites:crystalSprites},null,2)+'\n');
