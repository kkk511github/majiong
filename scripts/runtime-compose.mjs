import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
/** Consume `docker compose config --format json`, not hand-copied secrets or
 * mounts. The stable service keeps its network aliases; workers never inherit
 * public aliases or host ports. Result must be stored privately by operators. */
export function runtimeCompose(base,{image,release,node,service='mahjong-blue'}){
 if(!/^jinling-mahjong:[a-zA-Z0-9_.-]+$/.test(image)||!release||image!==`jinling-mahjong:${release}`||!/^[a-zA-Z0-9_-]{1,64}$/.test(node)||!/^mahjong-[a-z0-9-]+$/.test(service))throw Error('Invalid immutable runtime configuration');
 const config=structuredClone(base),original=config.services?.mahjong;
 if(!original||original.environment?.DATABASE_PATH!=='/app/data/mahjong.sqlite'||!original.volumes?.some(v=>v.target==='/app/data'))throw Error('Unexpected base database configuration');
 if(config.services[service])throw Error('Worker service already exists');
 if(original.environment.MAHJONG_RUNTIME_ID||original.environment.MAHJONG_GATEWAY_RELEASE)throw Error('First bootstrap requires the standalone configuration');
 const worker=structuredClone(original);
 delete worker.container_name;delete worker.ports;delete worker.depends_on;
 worker.networks=Object.fromEntries(Object.keys(original.networks??{default:null}).map(name=>[name,null]));
 worker.image=image;worker.command=['node','--import','tsx','server/index.ts'];worker.entrypoint=null;
 worker.environment={...original.environment,HOST:'0.0.0.0',PORT:'8787',MAHJONG_RUNTIME_ID:node,MAHJONG_RUNTIME_RELEASE:release,MAHJONG_RUNTIME_ENDPOINT:`http://${service}:8787`,MAHJONG_RUNTIME_BOOTSTRAP:'1'};
 config.services[service]=worker;
 original.image=image;original.command=['node','--import','tsx','server/runtime-gateway-main.ts'];original.entrypoint=null;
 original.environment={...original.environment,HOST:'0.0.0.0',PORT:'8787',MAHJONG_GATEWAY_RELEASE:release};
 return config;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output,release,node]=process.argv.slice(2);if(!input||!output||!release||!node||input===output)throw Error('Usage: node scripts/runtime-compose.mjs input.json output.json release node');
 writeFileSync(output,JSON.stringify(runtimeCompose(JSON.parse(readFileSync(input,'utf8')),{image:`jinling-mahjong:${release}`,release,node}),null,2)+'\n',{mode:0o600,flag:'wx'});
}
