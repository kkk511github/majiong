import {afterEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createGame,newPlayer} from '../shared/engine';
import {createRecords} from '../server/records';
import {dailyScoreRows,participationRows} from '../server/telegram-reports';
const opened:DatabaseSync[]=[];afterEach(()=>opened.splice(0).forEach(db=>db.close()));
const ms=(value:string)=>Date.parse(value+'+08:00');
function fixture(code:string,member:string,deltas:number[],dates:string[],finish=true){
 const db=new DatabaseSync(':memory:');opened.push(db);
 db.exec(`CREATE TABLE rooms(state TEXT);CREATE TABLE table_archives(state TEXT);
 CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT);
 CREATE TABLE account_numbers(account_id TEXT,member_id INTEGER);
 CREATE TABLE teams(id TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE team_memberships(account_id TEXT PRIMARY KEY,team_id TEXT,blocked INTEGER,updated_by TEXT,updated_at INTEGER);
 CREATE TABLE account_audit(id TEXT,account_id TEXT,event TEXT,at INTEGER);
 INSERT INTO teams VALUES('team-3','日结丁战队');`);
 const ids=[member,'b','c','d'];ids.forEach((id,i)=>{db.prepare('INSERT INTO accounts VALUES(?,?,?)').run(id,id,id);db.prepare('INSERT INTO account_numbers VALUES(?,?)').run(id,100001+i);db.prepare('INSERT INTO team_memberships VALUES(?,?,0,?,0)').run(id,'team-3','admin');});
 const records=createRecords(db),g=createGame(code,'game-'+code,{rounds:8});g.initialScore=90;g.settlementBase=100;g.scoreDivisor=2;g.players=ids.map(id=>newPlayer(id,id,false,90));
 deltas.forEach((delta,i)=>{
  g.round=i+1;g.phase='playing';records.capture(g);g.players[0]!.score+=delta;g.players[1]!.score-=delta;
  g.history.push({id:g.id+'-'+i,at:ms(dates[i]),round:i+1,names:ids,playerIds:ids,scores:g.players.map(p=>p!.score),initialScore:90,settlementBase:100,scoreDivisor:2,result:{reason:'hu',winners:[0],details:{},deltas:[delta,-delta,0,0]}});
  g.phase=i===deltas.length-1&&finish?'finished':'ended';records.capture(g);
 });
 return{db,records,g,query:(from:string,to:string)=>new URLSearchParams({from:String(ms(from+'T00:00:00')),to:String(ms(to+'T00:00:00')),member})};
}
it('701439: seven prior-day hands (+2) and zero-point last hand stay wholly on the table finish date',()=>{
 const f=fixture('701439','sun',[0,0,-10,-52,10,-38,104,0],['2026-09-24T23:40:03','2026-09-24T23:46:30','2026-09-24T23:49:55','2026-09-24T23:50:50','2026-09-24T23:53:40','2026-09-24T23:56:22','2026-09-24T23:58:58','2026-09-25T00:01:00']);
 expect(f.records.points(f.query('2026-09-24','2026-09-25'))).toMatchObject({points:0,tables:0,completedRounds:0});
 const q=f.query('2026-09-25','2026-09-26');expect(f.records.points(q)).toMatchObject({points:2,tables:1,completedRounds:8});
 expect(dailyScoreRows(f.db,'team-3',Number(q.get('from')),Number(q.get('to'))).find(r=>r.username==='sun')?.points).toBe(2);
});
it('418990: a +2.5 / +55 midnight split becomes one six-hand table of +57.5, without rewriting its ledger',()=>{
 const f=fixture('418990','yiyi',[15,40,-28,33,23,42],['2026-09-25T23:59:21','2026-09-26T00:02:42','2026-09-26T00:05:59','2026-09-26T00:10:02','2026-09-26T00:11:32','2026-09-26T00:14:23']);
 const before=f.db.prepare('SELECT * FROM point_records ORDER BY rowid').all();
 expect(f.records.points(f.query('2026-09-25','2026-09-26'))).toMatchObject({points:0,tables:0});
 const q=f.query('2026-09-26','2026-09-27');expect(f.records.points(q)).toMatchObject({points:57.5,tables:1,completedRounds:6});
 expect(f.records.list(new URLSearchParams({from:q.get('from')!,to:q.get('to')!}),'yiyi').scoreTotals?.[0].points).toBe(57.5);
 expect(f.records.exportPoints(q)).toContain('"57.5"');
 expect(dailyScoreRows(f.db,'team-3',Number(q.get('from')),Number(q.get('to'))).find(r=>r.username==='yiyi')?.points).toBe(57.5);
 expect(f.records.points(f.query('2026-09-25','2026-09-27')).points).toBe(57.5);
 expect(f.db.prepare('SELECT * FROM point_records ORDER BY rowid').all()).toEqual(before);
});
it('unfinished tables are excluded, and duplicate final snapshots never multiply amounts',()=>{
 const f=fixture('123456','member',[20],['2026-09-25T23:59:59'],false),q=f.query('2026-09-25','2026-09-27');
 expect(f.records.points(q).tables).toBe(0);f.g.phase='finished';createRecords(f.db).capture(f.g);
 f.db.exec("INSERT INTO match_records SELECT id||'-duplicate',game_id,code,at+1,player_ids,private_names,record FROM match_records");
 expect(f.records.points(q)).toMatchObject({tables:1,points:5});
 expect(dailyScoreRows(f.db,'team-3',Number(q.get('from')),Number(q.get('to'))).find(r=>r.username==='member')?.points).toBe(5);
});

it('跨周遗留终桌快照：后台、CSV、日结、周结只归最新一周且流水不变',()=>{
 const f=fixture('123456','member',[20],['2026-09-20T23:59:59']);
 const ledger=f.db.prepare('SELECT * FROM point_records ORDER BY rowid').all();
 const latest=ms('2026-09-21T00:00:00');
 f.db.prepare("INSERT INTO match_records SELECT id||'-latest',game_id,code,?,player_ids,private_names,record FROM match_records").run(latest);
 for(const [from,to,expected] of [
  ['2026-09-14','2026-09-21',0],['2026-09-21','2026-09-28',1],['2026-09-14','2026-09-28',1],
  ['2026-09-20','2026-09-21',0],['2026-09-21','2026-09-22',1],
 ] as const){
  const q=f.query(from,to),a=Number(q.get('from')),b=Number(q.get('to'));
  expect(f.records.points(q)).toMatchObject({tables:expected,points:expected*5});
  expect(f.records.exportPoints(q).includes('"member"')).toBe(expected===1);
  expect(dailyScoreRows(f.db,'team-3',a,b).find(r=>r.username==='member')?.points??0).toBe(expected*5);
  expect(participationRows(f.db,'team-3',a,b).find(r=>r.username==='member')?.rounds??0).toBe(expected);
 }
 expect(f.db.prepare('SELECT * FROM point_records ORDER BY rowid').all()).toEqual(ledger);
});

it('同时间快照按唯一ID决胜；不能先排除练习快照再把旧终桌算回来',()=>{
 const f=fixture('123456','member',[20],['2026-09-25T23:59:59']),q=f.query('2026-09-25','2026-09-26');
 f.db.exec("INSERT INTO match_records SELECT id||'-z',game_id,'练习桌',at,player_ids,private_names,record FROM match_records");
 const from=Number(q.get('from')),to=Number(q.get('to'));
 expect(f.records.points(q).tables).toBe(0);
 expect(dailyScoreRows(f.db,'team-3',from,to)).toEqual([]);
 expect(participationRows(f.db,'team-3',from,to)).toEqual([]);
 f.db.exec("UPDATE match_records SET code='123456' WHERE id LIKE '%-z'");
 expect(f.records.points(q)).toMatchObject({tables:1,points:5});
 expect(participationRows(f.db,'team-3',from,to).map(r=>r.rounds)).toEqual([1,1,1,1]);
});

it('真实统计SQL先索引筛选终桌，再按game_id查积分，不扫描全历史流水',()=>{
 const f=fixture('123456','member',[20],['2026-09-25T23:59:59']);
 f.db.exec(`BEGIN;
 WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<2000)
 INSERT INTO match_records SELECT 'old-'||n,'old-'||n,'888888',n,'[]',0,'{}' FROM numbers;
 INSERT INTO round_records
 SELECT m.id||'-'||h.n,m.game_id,m.code,m.at+h.n,'[]',0,
   '{"initialScore":90,"settlementBase":100,"scoreDivisor":2,"result":{"reason":"hu"}}'
 FROM match_records m CROSS JOIN (SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8) h
 WHERE m.id LIKE 'old-%';
 INSERT INTO point_records SELECT r.id,r.game_id,r.at,a.id,a.name,'team-3','日结丁战队',20
 FROM round_records r CROSS JOIN accounts a WHERE r.game_id LIKE 'old-%';
 COMMIT; ANALYZE;`);
 const prepare=f.db.prepare.bind(f.db),plans:{sql:string;details:string[]}[]=[];
 const spy=vi.spyOn(f.db,'prepare').mockImplementation(sql=>{
  const statement=prepare(sql);
  if(!sql.includes('FROM point_records p'))return statement;
  return new Proxy(statement,{get(target,property){
   const method=Reflect.get(target,property);
   if(typeof method!=='function')return method;
   return (...args:any[])=>{
    if(property==='all'||property==='get')plans.push({sql,details:prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(r=>String(r.detail))});
    return method.apply(target,args);
   };
  }});
 });
 try{
  const q=f.query('2026-09-25','2026-09-26'),from=Number(q.get('from')),to=Number(q.get('to'));
  q.delete('member');
  expect(f.records.points(q).tables).toBe(1);f.records.exportPoints(q);
  for(const filter of [{team:'team-3'},{member:'member'},{q:'member'}]){
   const filtered=new URLSearchParams(q);for(const [key,value] of Object.entries(filter))filtered.set(key,value);
   expect(f.records.points(filtered).tables).toBe(1);f.records.exportPoints(filtered);
  }
  expect(dailyScoreRows(f.db,'team-3',from,to)).toHaveLength(4);
  expect(participationRows(f.db,'team-3',from,to).map(r=>r.rounds)).toEqual([1,1,1,1]);
 }finally{spy.mockRestore();}
 expect(plans.length).toBeGreaterThanOrEqual(8);
 for(const plan of plans){
  const text=plan.details.join('\n');
  expect(text).toMatch(/SEARCH p USING (?:COVERING )?INDEX point_records_table_member \(game_id=\?/);
  expect(text).toMatch(/SEARCH m USING (?:COVERING )?INDEX match_records_time \(at/);
  expect(text).toMatch(/SEARCH latest USING COVERING INDEX match_records_game_latest/);
  expect(text).not.toMatch(/\bSCAN p\b/);
 }
});
