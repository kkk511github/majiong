import {makeRuntimeGateway} from './runtime-gateway';
import {verifyDeploymentManifest} from '../scripts/deployment-manifest.mjs';
if(process.env.NODE_ENV==='production')verifyDeploymentManifest(process.cwd(),process.env.MAHJONG_GATEWAY_RELEASE??'');
if(!process.env.DATABASE_PATH)throw Error('DATABASE_PATH is required');
const gateway=makeRuntimeGateway({database:process.env.DATABASE_PATH,host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??8786)});
await gateway.listen();
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void gateway.close().then(()=>process.exit(0));});
