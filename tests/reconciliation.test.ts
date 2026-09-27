import {afterEach,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createRecords} from '../server/records';
import {createReconciliation} from '../server/reconciliation';
const open:DatabaseSync[]=[];afterEach(()=>open.splice(0).forEach(db=>db.close()));
function fixture(){
 const db=new DatabaseSync(':memory:');open.push(db);
 db.exec("CREATE TABLE rooms(state TEXT);CREATE TABLE table_archives(state TEXT);CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT);INSERT INTO accounts VALUES('a','a','甲'),('b','b','乙');");
 db.exec("CREATE TABLE account_numbers(account_id TEXT,member_id INTEGER);INSERT INTO account_numbers VALUES('a',100001),('b',100002);CREATE TABLE teams(id TEXT PRIMARY KEY,name TEXT);INSERT INTO teams VALUES('t','测试');CREATE TABLE team_memberships(account_id TEXT PRIMARY KEY,team_id TEXT,updated_at INTEGER);INSERT INTO team_memberships VALUES('a','t',0),('b','t',0);CREATE TABLE account_audit(id TEXT,account_id TEXT,event TEXT,at INTEGER);");
 const records=createRecords(db);const audit=createReconciliation(db,records);
 const record={id:'r1',at:100,round:1,names:['甲','乙'],playerIds:['a','b'],scores:[110,70],initialScore:90,settlementBase:100,scoreDivisor:2,result:{reason:'hu',winners:[0],details:{},deltas:[20,-20],transfers:[{from:1,to:0,amount:20,reason:'自摸'}]}};
 db.prepare('INSERT INTO round_records VALUES(?,?,?,?,?,?,?)').run('r1','g','123456',100,JSON.stringify(record.playerIds),0,JSON.stringify(record));
 db.prepare('INSERT INTO match_records VALUES(?,?,?,?,?,?,?)').run('g','g','123456',100,JSON.stringify(record.playerIds),0,JSON.stringify(record));
 for(const [i,id]of record.playerIds.entries())db.prepare('INSERT INTO point_records VALUES(?,?,?,?,?,?,?,?)').run('r1','g',100,id,id,'t','测试',record.result.deltas[i]);
 return{db,audit,record,records};
}
it('audits valid ledger/deltas/final balance without changing any financial data',()=>{
 const{db,audit}=fixture(),before=db.prepare('SELECT * FROM point_records').all();audit.enqueue('g');audit.tick();
 expect(audit.checkGame('g')).toMatchObject({status:'passed',rounds:1});
 expect(audit.list(new URLSearchParams({from:'0',to:'200'}))).toMatchObject({pending:0,reports:[{status:'passed'}]});
 expect(db.prepare('SELECT * FROM point_records').all()).toEqual(before);
});
it('reports missing points, invalid transfer sums and final balance discrepancies',()=>{
 const{db,audit,record}=fixture();db.exec("DELETE FROM point_records WHERE account_id='a'");expect(audit.checkGame('g').status).toBe('mismatch');
 record.result.deltas=[19,-19];db.prepare('UPDATE round_records SET record=?').run(JSON.stringify(record));
 expect(audit.checkGame('g').issues.join('')).toContain('分录与本把净额不一致');
 record.scores=[111,69];db.prepare('UPDATE match_records SET record=?').run(JSON.stringify(record));expect(audit.checkGame('g').issues.join('')).toContain('终桌余额');
});
it('keeps legacy unknown evidence distinct from success and flags superseded snapshots',()=>{
 const{db,audit,record}=fixture();db.exec("INSERT INTO match_records SELECT 'duplicate',game_id,code,at-1,player_ids,private_names,record FROM match_records");
 expect(audit.checkGame('g')).toMatchObject({status:'warning',duplicateSnapshots:1});
 const {transfers,...result}=record.result;db.prepare('UPDATE round_records SET record=?').run(JSON.stringify({...record,result}));
 expect(audit.checkGame('g').status).toBe('unverifiable');
});
it('range scans are bounded and malformed source produces a visible diagnostic',()=>{
 const{db,audit}=fixture();expect(()=>audit.request(new URLSearchParams({from:'0',to:String(32*86400000)}))).toThrow('31天');
 expect(audit.request(new URLSearchParams({from:'0',to:'200'}))).toEqual({queued:1});
 db.exec("UPDATE round_records SET record='not-json'");audit.tick();
 expect(audit.list(new URLSearchParams({from:'0',to:'200'}))).toMatchObject({pending:0,reports:[{status:'unverifiable',at:100}]});
});
it('checks the actual app query independently and flags duplicate display even with correct ledger amounts',()=>{
 const{db,records}=fixture();const audit=createReconciliation(db,{points:records.points,list:(...args)=>({...records.list(...args),total:2})});
 expect(audit.checkGame('g').issues.join('')).toContain('App战绩');
});
