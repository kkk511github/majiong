import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { makeServer } from "../server/service";
import { provisionAdministrator } from "../server/accounts";
import { createRecords } from "../server/records";
import { createGame, newPlayer, seats } from "../shared/engine";
const active: ReturnType<typeof makeServer>[] = [], dirs: string[] = [], sockets: WebSocket[] = [];
afterEach(async () => { for (const s of sockets.splice(0)) s.close(); for (const s of active.splice(0)) await s.close(); for (const d of dirs.splice(0)) rmSync(d,{recursive:true,force:true}); });
async function boot() {
  const dir=mkdtempSync(join(tmpdir(),"club-")); dirs.push(dir);
  const file=join(dir,"test.sqlite"), seed=new DatabaseSync(file);
  await provisionAdministrator(seed,{username:"guanli@1",password:"Testing-password-2026",mustChangePassword:false}); seed.close();
  const server=makeServer({database:file,port:0,host:"127.0.0.1",tickMs:25}); active.push(server);
  const port=await server.listen();
  async function api(path:string,body?:object,token?:string) { const res=await fetch(`http://127.0.0.1:${port}${path}`,{method:body ? "POST":"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined}); return {status:res.status,data:await res.json()}; }
  const root=(await api("/api/auth/login",{username:"guanli@1",password:"Testing-password-2026"})).data;
  const register=async (username:string,name=username) => (await api("/api/auth/register",{username,password:"Testing-password-2026",name,role:"admin",canPlay:true,teamId:"team-1"})).data;
  const assign=(id:string,teamId="team-1") => api("/api/admin/members",{accountId:id,teamId},root.token);
  async function peer(token:string) {
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);sockets.push(ws);const messages:any[]=[];
    ws.on("message",r=>messages.push(JSON.parse(String(r)))); await new Promise<void>(resolve=>ws.once("open",resolve));
    const send=(v:object)=>ws.send(JSON.stringify(v));
    async function read(type:string) {const end=Date.now()+3000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error(`Missing ${type}: ${JSON.stringify(messages)}`);}
    send({type:"hello",token,name:"任意"});await read("session");return {send,read,messages};
  }
  return {api,root,register,assign,peer,server,file};
}
it("仅 guanli@1 能增减管理员；注册和其他管理员都不能越权，改权实时生效并审计",async()=>{
  const {api,root,register,peer,file}=await boot(), a=await register("delegate"),b=await register("normal");
  expect(a.account).toMatchObject({role:"member",canPlay:false,teamId:null,canManageAdmins:false});
  expect((await api("/api/admin/teams",undefined,a.token)).status).toBe(403);
  expect((await api("/api/admin/administrators",{accountId:b.account.id,admin:true},a.token)).status).toBe(403);
  const ws=await peer(a.token);
  expect((await api("/api/admin/administrators",{accountId:a.account.id,admin:true},root.token)).status).toBe(200);
  expect((await ws.read("accountUpdated")).account).toMatchObject({role:"admin",canManageAdmins:false,canPlay:false});
  expect((await api("/api/admin/administrators",{accountId:b.account.id,admin:true},a.token)).status).toBe(403);
  expect((await api("/api/admin/administrators",{accountId:root.account.id,admin:false},root.token)).status).toBe(403);
  expect((await api("/api/admin/members",{accountId:root.account.id,teamId:"team-1"},a.token)).status).toBe(403);
  expect((await api("/api/admin/teams",{name:"第五战队"},a.token)).status).toBe(200);
  await api("/api/admin/administrators",{accountId:a.account.id,admin:false},root.token);
  expect((await ws.read("accountUpdated")).account.role).toBe("member");
  expect((await api("/api/admin/points",undefined,a.token)).status).toBe(403);
  const db=new DatabaseSync(file);expect(db.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE event LIKE '%administrator-changed%'").get()!.n).toBe(2);db.close();
});
it("预置四队可改名且重启不重置；分队后可入座，禁赛仍允许打完本局并阻止自动下一局",async()=>{
  const {api,root,register,assign,peer,server,file}=await boot();
  const teams=(await api("/api/admin/teams",undefined,root.token)).data.teams;
  expect(teams.map((t:any)=>t.name)).toEqual(["一生所爱战队","冰茉莉战队","日结丁战队","日结冰战队"]);
  await api("/api/admin/teams",{id:"team-1",name:"一生好友战队"},root.token);
  const player=await register("player"),ws=await peer(player.token),host=await peer(root.token);
  host.send({type:"createTables",count:1,settings:{continuousRounds:true},creationId:"club-game"});const code=(await host.read("tablesCreated")).codes[0];
  ws.send({type:"join",code});expect((await ws.read("error")).message).toContain("分配战队");
  await assign(player.account.id);ws.send({type:"join",code});await ws.read("state");
  const g=server.games.get(code)!;
  // Three bots isolate admission from matchmaking; real public tables still reject addBot.
  for(const i of [1,2,3]) g.players[i]=newPlayer(`bot${i}`,`陪练${i}`,true,90);
  ws.send({type:"ready"});
  const end=Date.now()+2000;while(server.games.get(code)!.phase!=="playing" && Date.now()<end)await new Promise(r=>setTimeout(r,10));
  expect(server.games.get(code)!.phase).toBe("playing");
  await api("/api/admin/members",{accountId:player.account.id,playBlocked:true},root.token);
  const live=server.games.get(code)!;expect(live.phase).toBe("playing");
  if(live.turn===0){ws.send({type:"action",revision:live.revision,action:{type:"discard",tile:live.players[0]!.hand[0]}});await new Promise(r=>setTimeout(r,50));expect(server.games.get(code)!.players[0]!.discards.length).toBe(1);}
  const ended=server.games.get(code)!;ended.phase="ended";ended.round=1;ended.result={reason:"draw",winners:[],details:{},deltas:[0,0,0,0]};ended.history=[{id:ended.id+"-1",at:Date.now()-20000,round:1,result:ended.result,names:ended.players.map(p=>p!.name),scores:[90,90,90,90]}];ended.players.forEach(p=>{p!.ready=true;p!.online=true;});
  await new Promise(r=>setTimeout(r,120));expect(server.games.get(code)!.phase).toBe("ended");
  ws.send({type:"ready"});expect((await ws.read("error")).message).toContain("暂停");
  await api("/api/admin/members",{accountId:player.account.id,playBlocked:false},root.token);
  const deadline=Date.now()+2000;while(server.games.get(code)!.phase==="ended"&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));expect(server.games.get(code)!.round).toBe(2);
  const db=new DatabaseSync(file);expect(db.prepare("SELECT name FROM teams WHERE id='team-1'").get()!.name).toBe("一生好友战队");db.close();
});
it("积分只累加单局变化，历史战队锁定、去重、跨日边界、筛选及全量安全CSV",async()=>{
  const {api,root,register,assign,file}=await boot(),a=await register("stats-a","=1+1"),b=await register("stats-b");await assign(a.account.id);await assign(b.account.id,"team-2");
  const db=new DatabaseSync(file),records=createRecords(db),g=createGame("123456","stat-game",{rounds:8});
  g.players=seats.map(i=>newPlayer([a.account.id,b.account.id,"bot2","bot3"][i],i===0?"=1+1":`玩家${i}`,i>1));g.phase="playing";g.round=1;
  records.capture(g);
  await assign(a.account.id,"team-3");records.capture(g);
  const at=Date.parse("2026-09-14T00:00:00+08:00");
  g.phase="ended";g.history=[{id:"stat-1",at,round:1,names:g.players.map(p=>p!.name),scores:[120,60,90,90],result:{reason:"hu",winners:[0],details:{},deltas:[30,-30,0,0]}}];records.capture(g);records.capture(g);
  g.phase="playing";g.round=2;records.capture(g);
  g.phase="finished";g.history.push({...g.history[0],id:"stat-2",at:at+86400000,round:2,result:{reason:"draw",winners:[],details:{},deltas:[-10,10,0,0]}});records.capture(g);records.capture(g);
  const all=(await api("/api/admin/points",undefined,root.token)).data;
  expect(all).toMatchObject({total:3,completedRounds:2,playerRounds:4,points:0});
  expect(all.rows.find((r:any)=>r.teamId==="team-1")).toMatchObject({points:30,rounds:1});
  expect(all.rows.find((r:any)=>r.teamId==="team-3")).toMatchObject({points:-10,rounds:1});
  const one=(await api(`/api/admin/points?from=${at}&to=${at+86400000}&member=${a.account.id}`,undefined,root.token)).data;expect(one).toMatchObject({total:1,playerRounds:1,points:30});
  expect((await api(`/api/admin/points?from=${at}&to=${at}`,undefined,root.token)).status).toBe(400);
  g.history.push({...g.history[0],id:"partial",round:3,result:{reason:"dissolved",winners:[],details:{},deltas:[100,-100,0,0]}});records.capture(g);expect(records.points(new URLSearchParams()).completedRounds).toBe(2);
  // Export deliberately ignores the current UI page.
  const csv=(await api("/api/admin/points/export?page=99",undefined,root.token)).data.csv;
  expect(csv.startsWith("\uFEFF")).toBe(true);expect(csv).toContain("'=1+1");expect(csv).toContain('"30"');expect(csv).toContain('"-10"');
  const migrated=createRecords(db);expect(migrated.points(new URLSearchParams()).completedRounds).toBe(2);db.close();
});
it("已删除的旧牌桌从单局存档补统计，坏记录不阻断启动，重复迁移不重计",async()=>{
  const {register,file}=await boot(),a=await register('legacy-member','旧成员');
  const db=new DatabaseSync(file);
  const record={id:'legacy-round',round:1,at:Date.now(),names:['旧成员'],scores:[108],result:{reason:'hu',deltas:[18],winners:[0],details:{}}};
  db.prepare('INSERT INTO round_records VALUES (?,?,?,?,?,?,?)').run(record.id,'deleted-room','123456',record.at,JSON.stringify([a.account.id]),0,JSON.stringify(record));
  db.prepare('INSERT INTO round_records VALUES (?,?,?,?,?,?,?)').run('bad-old','bad-room','123457',record.at,'[]',0,'{');
  const migrated=createRecords(db);
  expect(migrated.points(new URLSearchParams())).toMatchObject({completedRounds:1,playerRounds:1,points:18});
  expect(migrated.points(new URLSearchParams()).rows[0]).toMatchObject({teamId:'',teamName:'历史未归队',points:18,rounds:1});
  expect(createRecords(db).points(new URLSearchParams()).completedRounds).toBe(1);
  expect(db.prepare("SELECT record FROM round_records WHERE id='bad-old'").get()!.record).toBe('{');db.close();
});
