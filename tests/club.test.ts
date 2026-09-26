import { tileName } from "../shared/tiles";
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
import { settlementRows } from "../shared/settlement";
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
  async function peer(token:string,connectPort=port) {
    const ws=new WebSocket(`ws://127.0.0.1:${connectPort}/ws`);sockets.push(ws);const messages:any[]=[];
    ws.on("message",r=>messages.push(JSON.parse(String(r)))); await new Promise<void>(resolve=>ws.once("open",resolve));
    const send=(v:object)=>ws.send(JSON.stringify(v));
    async function read(type:string) {const end=Date.now()+3000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error(`Missing ${type}: ${JSON.stringify(messages)}`);}
    send({type:"hello",token,name:"任意"});await read("session");return {send,read,messages,socket:ws};
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
it("预置四队可改名；禁赛保留当前八把整桌并阻止进入下一桌",async()=>{
  const {api,root,register,assign,peer,server,file}=await boot();
  const teams=(await api("/api/admin/teams",undefined,root.token)).data.teams;
  expect(teams.map((t:any)=>t.name)).toEqual(["一生所爱战队","冰茉莉战队","日结丁战队","日结冰战队"]);
  await api("/api/admin/teams",{id:"team-1",name:"一生好友战队"},root.token);
  const player=await register("player"),ws=await peer(player.token),host=await peer(root.token);
  host.send({type:"createTables",count:1,settings:{continuousRounds:true,openingAnimation:false,autoRenew:false},rules:{rounds:8},creationId:"club-game"});const code=(await host.read("tablesCreated")).codes[0];
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
  if(live.turn===0){const tile=live.players[0]!.hand[0],event=`${live.players[0]!.name} 打出 ${tileName(tile)}`;ws.send({type:"action",revision:live.revision,action:{type:"discard",tile}});await expect.poll(()=>server.games.get(code)!.events.includes(event),{timeout:2000}).toBe(true);}
  for(let round=1;round<8;round++){
   const ended=server.games.get(code)!;ended.phase="ended";ended.round=round;ended.result={reason:"draw",winners:[],details:{},deltas:[0,0,0,0]};
   ended.history.push({id:ended.id+'-'+round,at:Date.now()-20000,round,result:ended.result,names:ended.players.map(p=>p!.name),scores:[90,90,90,90]});ended.players.forEach(p=>{p!.ready=false;});
   await expect.poll(()=>server.games.get(code)!.round,{timeout:2000}).toBe(round+1);
  }
  expect((await api('/api/auth/session',undefined,player.token)).data.account.playBlocked).toBe(true);
  const finished=server.games.get(code)!;finished.phase='finished';finished.table!.finishedAt=Date.now();
  ws.send({type:'leave'});await ws.read('left');
  host.send({type:'createTables',count:1,settings:{openingAnimation:false},creationId:'next-blocked-table'});
  const next=(await host.read('tablesCreated')).codes[0];
  ws.send({type:'join',code:next});expect((await ws.read('error')).message).toContain('暂停');
  const db=new DatabaseSync(file);expect(db.prepare("SELECT name FROM teams WHERE id='team-1'").get()!.name).toBe("一生好友战队");db.close();
});
it('禁玩发生在第一把之前，已入座也不能准备或自动开局',async()=>{
 const {api,root,register,assign,peer,server}=await boot();
 const member=await register('before-first');await assign(member.account.id);
 const host=await peer(root.token),player=await peer(member.token);
 host.send({type:'createTables',count:1,creationId:'before-first',settings:{readyMode:'auto',openingAnimation:false,kickUnready:false},rules:{rounds:8}});
 const code=(await host.read('tablesCreated')).codes[0];player.send({type:'join',code});await player.read('state');
 await api('/api/admin/members',{accountId:member.account.id,playBlocked:true},root.token);
 const g=server.games.get(code)!;for(const seat of [1,2,3])g.players[seat]=newPlayer('before-bot'+seat,'陪练',true,90);
 player.send({type:'ready'});expect((await player.read('error')).message).toContain('暂停');
 await new Promise(r=>setTimeout(r,150));expect(server.games.get(code)!.round).toBe(0);expect(server.games.get(code)!.phase).toBe('waiting');
 expect(player.messages.some(m=>m.type==='state'&&m.state.admissionMessage)).toBe(true);
});
it('手动续把、断线及服务重启均保留已开桌禁玩的保护，终桌不能再准备',async()=>{
 const {api,root,register,assign,peer,server,file}=await boot();
 const member=await register('resume-blocked','续桌玩家');await assign(member.account.id);
 const host=await peer(root.token);let player=await peer(member.token);
 host.send({type:'createTables',count:1,creationId:'resume-blocked',settings:{continuousRounds:false,openingAnimation:false,autoRenew:false,kickUnready:false},rules:{rounds:8}});
 const code=(await host.read('tablesCreated')).codes[0];player.send({type:'join',code});await player.read('state');
 const g=server.games.get(code)!;for(const seat of [1,2,3])g.players[seat]=newPlayer('resume-bot'+seat,'陪练',true,90);
 player.send({type:'ready'});await expect.poll(()=>server.games.get(code)!.round).toBe(1);
 await api('/api/admin/members',{accountId:member.account.id,playBlocked:true},root.token);
 const ended=server.games.get(code)!;ended.phase='ended';ended.result={reason:'draw',winners:[],details:{},deltas:[0,0,0,0]};ended.history.push({id:ended.id+'-1',at:Date.now()-20000,round:1,result:ended.result,names:ended.players.map(p=>p!.name),scores:[90,90,90,90]});ended.players.forEach(p=>{p!.ready=!!p!.bot});
 // Persist the isolated ended fixture, then exercise a real restart and hello.
 const db=new DatabaseSync(file);db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(ended),ended.id);db.close();
 player.socket.close();host.socket.close();await server.close();active.splice(active.indexOf(server),1);
 const resumed=makeServer({database:file,port:0,host:'127.0.0.1',tickMs:25});active.push(resumed);const port=await resumed.listen();
 player=await peer(member.token,port);const snapshot=(await player.read('state')).state;
 expect(snapshot.round).toBe(1);expect(snapshot.admissionMessage).toBeUndefined();
 player.send({type:'ready'});await expect.poll(()=>resumed.games.get(code)!.round).toBe(2);
 const done=resumed.games.get(code)!;done.phase='finished';done.round=8;
 player.send({type:'ready'});expect((await player.read('error')).message).toContain('暂停');
});

it("积分含一次桌费并按本桌倍率记分，历史战队锁定、去重、跨日边界、筛选及全量安全CSV",async()=>{
  const {api,root,register,assign,file}=await boot(),a=await register("stats-a","=1+1"),b=await register("stats-b");await assign(a.account.id);await assign(b.account.id,"team-2");
  const db=new DatabaseSync(file),records=createRecords(db),g=createGame("123456","stat-game",{rounds:8});
  g.settlementBase=100;
  g.players=seats.map(i=>newPlayer([a.account.id,b.account.id,"bot2","bot3"][i],i===0?"=1+1":`玩家${i}`,i>1));g.phase="playing";g.round=1;
  records.capture(g);
  await assign(a.account.id,"team-3");records.capture(g);
  const at=Date.parse("2026-09-14T00:00:00+08:00");
  g.phase="ended";g.history=[{id:"stat-1",at,round:1,names:g.players.map(p=>p!.name),scores:[120,60,90,90],result:{reason:"hu",winners:[0],details:{},deltas:[30,-30,0,0]}}];records.capture(g);records.capture(g);
  g.phase="playing";g.round=2;records.capture(g);
  g.phase="finished";g.history.push({...g.history[0],id:"stat-2",at:at+86400000,round:2,result:{reason:"draw",winners:[],details:{},deltas:[-10,10,0,0]}});records.capture(g);records.capture(g);
  const all=(await api("/api/admin/points",undefined,root.token)).data;
  expect(all).toMatchObject({total:3,completedRounds:2,tables:1,playerRounds:4,points:-10});
  expect(all.rows.find((r:any)=>r.teamId==="team-1")).toMatchObject({points:10,rounds:1,tables:1});
  expect(all.rows.find((r:any)=>r.teamId==="team-3")).toMatchObject({points:-5,rounds:1,tables:1});
  const one=(await api(`/api/admin/points?from=${at}&to=${at+86400000}&member=${a.account.id}`,undefined,root.token)).data;expect(one).toMatchObject({total:0,playerRounds:0,tables:0,points:0});
  const next=(await api(`/api/admin/points?from=${at+86400000}&member=${a.account.id}`,undefined,root.token)).data;expect(next).toMatchObject({total:2,playerRounds:2,tables:1,points:5});
  expect((await api(`/api/admin/points?from=${at+86400000}&member=${a.account.id}&team=team-3`,undefined,root.token)).data.points).toBe(-5);
  expect(one.points+next.points).toBe(5);
  expect((await api(`/api/admin/points?from=${at}&to=${at}`,undefined,root.token)).status).toBe(400);
  g.history.push({...g.history[0],id:"partial",round:3,result:{reason:"dissolved",winners:[],details:{},deltas:[100,-100,0,0]}});records.capture(g);expect(records.points(new URLSearchParams()).completedRounds).toBe(2);
  // Export deliberately ignores the current UI page.
  const csv=(await api("/api/admin/points/export?page=99",undefined,root.token)).data.csv;
  expect(csv.startsWith("\uFEFF")).toBe(true);expect(csv).toContain("'=1+1");expect(csv).toContain('"10"');expect(csv).toContain('"-5"');
  expect(csv).toContain('"桌数（8局/桌）","积分"');expect(csv).not.toContain("完成局数");
  const migrated=createRecords(db);expect(migrated.points(new URLSearchParams()).completedRounds).toBe(2);db.close();
});
it("旧单局流水仍可迁移，缺少整桌结束记录不纳入整桌统计，坏记录不阻断启动",async()=>{
  const {register,file}=await boot(),a=await register('legacy-member','旧成员');
  const db=new DatabaseSync(file);
  const record={id:'legacy-round',round:1,at:Date.now(),names:['旧成员'],scores:[108],result:{reason:'hu',deltas:[18],winners:[0],details:{}}};
  db.prepare('INSERT INTO round_records VALUES (?,?,?,?,?,?,?)').run(record.id,'deleted-room','123456',record.at,JSON.stringify([a.account.id]),0,JSON.stringify(record));
  db.prepare('INSERT INTO round_records VALUES (?,?,?,?,?,?,?)').run('bad-old','bad-room','123457',record.at,'[]',0,'{');
  const migrated=createRecords(db);
  expect(migrated.points(new URLSearchParams())).toMatchObject({completedRounds:0,playerRounds:0,points:0});
  expect(db.prepare("SELECT points FROM point_records WHERE record_id='legacy-round'").get()!.points).toBe(18);
  expect(createRecords(db).points(new URLSearchParams()).completedRounds).toBe(0);
  expect(db.prepare("SELECT record FROM round_records WHERE id='bad-old'").get()!.record).toBe('{');db.close();
});

it.each([1,2,5])("五把提前终桌按1桌统计，桌内与桌外输赢扣一次桌费后按除数%s结算",async(divisor)=>{
  const {register,assign,file}=await boot();
  const members:string[]=[];
  for(let seat=0;seat<4;seat++) {
    const member=await register(`reconcile-${seat}`,`核算牌友${seat}`);
    await assign(member.account.id,seat===3?"team-2":"team-1");members.push(member.account.id);
  }
  const db=new DatabaseSync(file),records=createRecords(db);
  const at=Date.parse("2026-09-16T14:00:00+08:00");
  const g=createGame("930069","five-hand-table",{rounds:8});
  g.settlementBase=100;g.scoreDivisor=divisor;
  g.players=seats.map(seat=>newPlayer(members[seat],`核算牌友${seat}`));
  const deltas=[[0,24,0,-24],[-90,0,24,66],[0,0,0,0],[0,160,-56,-104],[0,-14,42,-28]];
  let scores=[90,90,90,90],external=[0,0,0,0];
  for(let i=0;i<deltas.length;i++) {
    g.round=i+1;g.phase="playing";records.capture(g);
    const externalDeltas=i===2?[0,-100,0,100]:[0,0,0,0];
    scores=scores.map((score,seat)=>score+deltas[i][seat]);
    external=external.map((score,seat)=>score+externalDeltas[seat]);
    g.players.forEach((p,seat)=>{p!.score=scores[seat];p!.externalScore=external[seat];});
    g.history.push({id:`five-hand-${i+1}`,at:at+i*60000,round:i+1,names:g.players.map(p=>p!.name),scores:[...scores],externalScores:[...external],initialScore:90,settlementBase:100,scoreDivisor:divisor,playerIds:members,result:{reason:"hu",winners:[1],details:{},deltas:deltas[i],externalDeltas}});
    g.phase=i===4?"finished":"ended";records.capture(g);records.capture(g);
  }
  const query=new URLSearchParams({from:String(at),to:String(at+3600000)});
  const result=records.points(query);
  expect(result).toMatchObject({completedRounds:5,tables:1,playerRounds:20,total:4,points:-40/divisor});
  for(const [seat,net] of [-100,60,0,0].entries())
    expect(result.rows.find(r=>r.accountId===members[seat])).toMatchObject({rounds:5,tables:1,points:net/divisor});
  const final=records.details(g.id,members[0],true).match.record;
  for(const row of settlementRows(final))
    expect(result.rows.find(r=>r.accountId===row.id)!.points).toBe(row.recorded);
  const csv=records.exportPoints(query);
  expect(csv).toContain(`"1","${60/divisor}"`);
  expect(csv).not.toContain("完成局数");
  expect(csv).not.toContain("0.625");
  // Rendering the new report never changes the original raw points or snapshots.
  expect(db.prepare("SELECT SUM(points) AS points FROM point_records WHERE account_id=?").get(members[1])!.points).toBe(70);
  expect(createRecords(db).points(query)).toEqual(result);
  // A new table may reuse the room code. It is a second table with its own fee.
  const renewed=createGame(g.code,"same-code-new-table",{rounds:8});
  renewed.settlementBase=100;renewed.scoreDivisor=divisor;
  renewed.players=seats.map(seat=>newPlayer(members[seat],`核算牌友${seat}`));
  renewed.round=1;renewed.phase="playing";records.capture(renewed);
  expect(records.points(query)).toEqual(result); // No played hand, no table/fee yet.
  for(let i=0;i<8;i++) {
    renewed.round=i+1;records.capture(renewed);
    renewed.history.push({...g.history[0],id:`renewed-${i}`,round:i+1,at:at+(10+i)*60000,scores:[90,90,90,90],externalScores:[0,0,0,0],result:{reason:"draw",winners:[],details:{},deltas:[0,0,0,0],externalDeltas:[0,0,0,0]}});
  }
  renewed.phase="finished";records.capture(renewed);
  const two=records.points(query);
  expect(two).toMatchObject({completedRounds:13,tables:2,playerRounds:52,points:-80/divisor});
  expect(two.rows.find(r=>r.accountId===members[1])).toMatchObject({rounds:13,tables:2,points:50/divisor});
  db.close();
});
