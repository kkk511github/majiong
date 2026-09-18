import sharp from 'sharp';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const sdk = process.env.ANDROID_HOME;
const sourceOnly = process.env.ICON_SOURCE_ONLY === '1';
const apk = process.env.MAHJONG_APK_PATH ?? 'android/app/build/outputs/apk/release/app-release.apk';
const checks=[];
for(const [density,scale] of Object.entries({mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4})){
 const path=`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`;
 const {info}=await sharp(path).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,108*scale);assert.equal(info.height,108*scale);assert.equal(info.channels,3);
 const actual=await sharp(path).extract({left:18*scale,top:18*scale,width:72*scale,height:72*scale}).raw().toBuffer();
 const expected=await sharp('public/brand-icon.png').resize(72*scale,72*scale,{fit:'cover'}).flatten({background:'#0A442E'}).removeAlpha().raw().toBuffer();
 assert(actual.equals(expected),`${density} central viewport must be filled by the artwork without padding`);
 for(const name of ['ic_launcher','ic_launcher_round']){
  const metadata=await sharp(`android/app/src/main/res/mipmap-${density}/${name}.png`).metadata();
  assert.equal(metadata.width,48*scale);assert.equal(metadata.height,48*scale);
 }
 checks.push({density,foregroundPixels:info.width,visibleViewportDp:72,opaqueForeground:true,viewportArtworkPixelsMatch:true,legacyPixels:48*scale});
}
if(!sourceOnly){
 assert(sdk,'Set ANDROID_HOME to the Android SDK or ICON_SOURCE_ONLY=1');
 const aapt=`${sdk}/build-tools/36.0.0/aapt2`;
 const resources=execFileSync(aapt,['dump','resources',apk],{encoding:'utf8'});
 for(const name of ['ic_launcher','ic_launcher_round']){
  const block=resources.split(new RegExp(`resource 0x[0-9a-f]+ mipmap/${name}\\n`))[1]?.split('\n    resource ')[0];
  assert(block,`Missing compiled ${name}`);
  const file=block.match(/\(anydpi-v33\) \(file\) (\S+) type=XML/)?.[1];assert(file);
  const dump=execFileSync(aapt,['dump','xmltree',apk,'--file',file],{encoding:'utf8'});
  assert(dump.includes('monochrome')&&dump.includes('background')&&dump.includes('foreground'));
 }
}
const manifest=await readFile('android/app/src/main/AndroidManifest.xml','utf8');
assert(manifest.includes('@mipmap/ic_launcher')&&manifest.includes('@mipmap/ic_launcher_round'));
await writeFile(process.env.MAHJONG_ICON_REPORT??'docs/android-icon-check.json',JSON.stringify({canvasDp:108,visibleViewportDp:72,fullViewportArtwork:true,compiledAndroid13Monochrome:!sourceOnly,checks},null,2)+'\n');
console.log('All five densities fill the adaptive viewport with artwork; foregrounds are opaque and legacy dimensions match.');
