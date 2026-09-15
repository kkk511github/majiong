import sharp from 'sharp';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const sdk = process.env.ANDROID_HOME;
assert(sdk, 'Set ANDROID_HOME to the Android SDK');
const apk = 'android/app/build/outputs/apk/debug/app-debug.apk';
const checks=[];
for(const [density,scale] of Object.entries({mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4})){
 const path=`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`;
 const {data,info}=await sharp(path).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,108*scale);assert.equal(info.height,108*scale);assert.equal(info.channels,4);
 let minX=info.width,minY=info.height,maxX=0,maxY=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>1){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 for(const [x,y] of [[minX,minY],[minX,maxY],[maxX,minY],[maxX,maxY]])assert(Math.hypot((x+0.5)/scale-54,(y+0.5)/scale-54)<33,'Subject escapes 66 dp safe circle');
 assert.equal(data[3],0);
 checks.push({density,foregroundPixels:info.width,boundsDp:[minX/scale,minY/scale,(maxX+1)/scale,(maxY+1)/scale]});
}
for(const name of ['ic_launcher','ic_launcher_round']){
 const file=`res/mipmap-anydpi-v33/${name}.xml`;
 const dump=execFileSync(`${sdk}/build-tools/36.0.0/aapt`,['dump','xmltree',apk,file],{encoding:'utf8'});
 assert(dump.includes('monochrome')&&dump.includes('background')&&dump.includes('foreground'));
}
const unused=await readFile('android/app/src/main/AndroidManifest.xml','utf8');
assert(unused.includes('@mipmap/ic_launcher')&&unused.includes('@mipmap/ic_launcher_round'));
await writeFile('docs/android-icon-check.json',JSON.stringify({safeCircleDp:66,canvasDp:108,compiledAndroid13Monochrome:true,checks},null,2)+'\n');
console.log('All density foregrounds fit the 66 dp safe circle; both compiled adaptive icons include Android 13 monochrome.');
