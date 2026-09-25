import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
const [apkName,reportName]=process.argv.slice(2);if(!apkName||!reportName)throw Error('Usage: verify-android-assets.mjs app.apk report.json');
const apk=resolve(apkName),root=resolve('dist'),sha=b=>createHash('sha256').update(b).digest('hex');
const zip=path=>execFileSync('unzip',['-p',apk,path],{maxBuffer:96*1024*1024});
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const files=walk(root),resources=[];
for(const file of files){const path=relative(root,file).split('\\').join('/'),bytes=readFileSync(file);if(!bytes.equals(zip('assets/public/'+path)))throw Error('Asset mismatch '+path);resources.push({path,bytes:bytes.length,sha256:sha(bytes)});}
const config=JSON.parse(zip('assets/capacitor.config.json'));
if(config.appId!=='com.jinling.mahjong'||config.server||config.android?.webContentsDebuggingEnabled)throw Error('Not a production Android config');
const entries=execFileSync('unzip',['-Z1',apk],{encoding:'utf8',maxBuffer:16*1024*1024}).split('\n');
for(const name of entries)if(/\.(?:map|p12|pfx|keystore|jks|key)$|(^|\/)\.env(?:\.|$)|assets\/public\/tests\//.test(name))throw Error('Private/debug file '+name);
const report={at:new Date().toISOString(),version:JSON.parse(readFileSync('package.json','utf8')).version,webAssetsMatched:files.length,androidConfig:config,apk:{path:apk,bytes:statSync(apk).size,sha256:sha(readFileSync(apk))},resources};
writeFileSync(resolve(reportName),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({version:report.version,webAssetsMatched:files.length,apk:report.apk},null,2));
