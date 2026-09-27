import type {ServerMessage} from '../shared/types';
type Socket={readyState:number;bufferedAmount:number;send:(data:string)=>void;close:(code:number,reason:string)=>void};
const SOFT=128*1024,HARD=1024*1024;
/** Replaceable snapshots may coalesce; acknowledgments/errors never do.
 * A stalled transport is explicitly disconnected so the client resynchronizes
 * authoritative state instead of replaying an uncertain action. */
export function createSocketSender(now=Date.now){
 const pending=new Map<Socket,{state?:string;tables?:string;since:number}>();
 let stopped=false;
 const disconnect=(ws:Socket)=>{pending.delete(ws);try{ws.close(1013,'Connection slow; reconnect to synchronize');}catch{}};
 const write=(ws:Socket,data:string)=>{
  if(ws.readyState!==1){pending.delete(ws);return false;}
  if(ws.bufferedAmount+Buffer.byteLength(data)>HARD){disconnect(ws);return false;}
  try{ws.send(data);return true;}catch{disconnect(ws);return false;}
 };
 function flush(ws:Socket,force=false){
  const entry=pending.get(ws);if(!entry)return;
  if(ws.readyState!==1){pending.delete(ws);return;}
  if(now()-entry.since>5000||ws.bufferedAmount>=HARD){disconnect(ws);return;}
  if(!force&&ws.bufferedAmount>=SOFT)return;
  pending.delete(ws);
  if(entry.state&&!write(ws,entry.state))return;
  if(entry.tables)write(ws,entry.tables);
 }
 const timer=setInterval(()=>{for(const ws of pending.keys())flush(ws);},100);timer.unref();
 return {
  send(ws:Socket,message:ServerMessage){
   if(stopped||ws.readyState!==1)return;
   if(ws.bufferedAmount>=HARD){disconnect(ws);return;}
   const data=JSON.stringify({...message,serverNow:now()});
   if((message.type==='state'||message.type==='tables')&&ws.bufferedAmount>=SOFT){
    // Bound both queued bytes and queue age, even if the snapshot is replaced.
    if(Buffer.byteLength(data)>SOFT){disconnect(ws);return;}
    const entry=pending.get(ws)??{since:now()};entry[message.type]=data;pending.set(ws,entry);return;
   }
   flush(ws,true);
   write(ws,data);
  },
  forget(ws:Socket){pending.delete(ws);},
  close(){stopped=true;clearInterval(timer);pending.clear();},
  queued:()=>pending.size,
 };
}
