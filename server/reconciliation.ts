import type {DatabaseSync} from 'node:sqlite';
import type {RoundRecord,ScoreTransfer} from '../shared/types';
import {latestCompletedSnapshot} from './completed-table-window';
import {AuthError} from './accounts';
import type {createRecords} from './records';
import {settlementRows} from '../shared/settlement';
import {dailyScoreRows,participationRows} from './telegram-reports';
export type ReconciliationReport={game:string;code:string;at:number;checkedAt:number;status:'passed'|'warning'|'mismatch'|'unverifiable';issues:string[];rounds:number;duplicateSnapshots:number};
/** A bounded, durable, read-only-of-ledgers audit. Never repairs scores or sends
 * bills. Team attribution and Telegram's fixed divisor are intentionally not
 * compared as if they were the app's historical team/divisor conventions. */
export function createReconciliation(db:DatabaseSync,queries?:Pick<ReturnType<typeof createRecords>,'list'|'points'>){
 db.exec(`CREATE TABLE IF NOT EXISTS reconciliation_jobs(game_id TEXT PRIMARY KEY,requested_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reconciliation_reports(game_id TEXT PRIMARY KEY,at INTEGER NOT NULL,checked_at INTEGER NOT NULL,status TEXT NOT NULL,report TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS reconciliation_time ON reconciliation_reports(at DESC);`);
 function checkGame(game:string):ReconciliationReport{
  const row=db.prepare('SELECT code,at,record,player_ids FROM match_records WHERE game_id=? ORDER BY at DESC,id DESC LIMIT 1').get(game);
  if(!row)throw new AuthError('未找到已结束牌桌',404);
  const final=JSON.parse(String(row.record)) as RoundRecord;
  const issues:string[]=[],duplicateSnapshots=Number(db.prepare('SELECT COUNT(*) n FROM match_records WHERE game_id=?').get(game)!.n)-1;
  const report:ReconciliationReport={game,code:String(row.code),at:Number(row.at),checkedAt:Date.now(),status:'passed',issues,rounds:0,duplicateSnapshots};
  if(row.code==='练习桌'||final.experience){report.status='unverifiable';issues.push('练习/体验桌不纳入正式积分核对');return report;}
  const rows=db.prepare('SELECT id,record,player_ids FROM round_records WHERE game_id=? ORDER BY at,id').all(game);
  const ledgers=db.prepare('SELECT record_id,account_id,points FROM point_records WHERE game_id=?').all(game);
  const seen=new Set<string>(),lastScore=new Map<string,{score:number;external:number}>();let unverifiable=false;
  for(const saved of rows){
   const record=JSON.parse(String(saved.record)) as RoundRecord;
   if(record.experience||record.result.reason==='dissolved')continue;
   report.rounds++;seen.add(String(saved.id));
   const ids=JSON.parse(String(saved.player_ids)) as string[];
   const transfers=record.result.transfers;
   if(transfers===undefined)unverifiable=true;
   else{
    const internal=ids.map(()=>0),external=ids.map(()=>0);
    for(const t of transfers as ScoreTransfer[]){
     if(!Number.isFinite(t.amount)||t.amount<0||!Number.isInteger(t.from)||!Number.isInteger(t.to)||!ids[t.from]||!ids[t.to]||t.from===t.to){issues.push(`第${record.round}把存在无效收支分录`);continue;}
     const target=t.scope==='external'?external:internal;target[t.from]-=t.amount;target[t.to]+=t.amount;
    }
    ids.forEach((_,seat)=>{if(internal[seat]!==record.result.deltas[seat]||external[seat]!== (record.result.externalDeltas?.[seat]??0))issues.push(`第${record.round}把座位${seat+1}分录与本把净额不一致`);});
   }
   ids.forEach((id,seat)=>{
    const delta=record.result.deltas[seat],externalDelta=record.result.externalDeltas?.[seat]??0;
    const score=record.scores[seat],external=record.externalScores?.[seat]??0,previous=lastScore.get(id);
    if(![delta,externalDelta,score,external].every(Number.isFinite)){issues.push(`第${record.round}把座位${seat+1}数值无效`);return;}
    if(previous&&(previous.score+delta!==score||previous.external+externalDelta!==external))issues.push(`第${record.round}把座位${seat+1}前后余额不连续`);
    lastScore.set(id,{score,external});
    if(!db.prepare('SELECT 1 FROM accounts WHERE id=?').get(id))return;
    const point=ledgers.find(p=>p.record_id===saved.id&&p.account_id===id);
    if(!point||Number(point.points)!==delta+externalDelta)issues.push(`第${record.round}把座位${seat+1}积分流水缺失或与净额不一致`);
   });
  }
  for(const point of ledgers)if(!seen.has(String(point.record_id)))issues.push('积分流水关联的有效牌局记录不存在');
  const ids=JSON.parse(String(row.player_ids)) as string[];
  ids.forEach((id,seat)=>{const last=lastScore.get(id);if(!last){unverifiable=true;return;}if(last.score!==final.scores[seat]||last.external!==(final.externalScores?.[seat]??0))issues.push(`座位${seat+1}终桌余额与末把余额不一致`);});
  if(queries&&report.rounds>0){
   const q=new URLSearchParams({game,from:String(row.at),to:String(Number(row.at)+1),calendar:'0'});
   const teams=db.prepare('SELECT id FROM teams').all().map(r=>String(r.id));
   const daily:ReturnType<typeof dailyScoreRows>=[],weekly:ReturnType<typeof participationRows>=[];
   for(let i=0;i<teams.length;i+=20){daily.push(...dailyScoreRows(db,teams.slice(i,i+20),Number(row.at),Number(row.at)+1,game));weekly.push(...participationRows(db,teams.slice(i,i+20),Number(row.at),Number(row.at)+1,game));}
   for(const person of settlementRows({...final,playerIds:ids})){
    if(!db.prepare('SELECT 1 FROM accounts WHERE id=?').get(person.id))continue;
    const app=queries.list(q,person.id),admin=queries.points(new URLSearchParams({...Object.fromEntries(q),member:person.id}));
    if(app.total!==1||(app.scoreTotals?.find(p=>p.id===person.id)?.points??0)!==person.recorded)issues.push(`座位${person.seat+1}App战绩与终桌快照不一致`);
    // Deliberately retain known record-clear carryovers as an explainable
    // history gap, rather than manufacturing a refund or a replacement fee.
    const carry=db.prepare("SELECT 1 FROM sqlite_master WHERE name='record_clear_fee_carryover'").get()&&db.prepare('SELECT 1 FROM record_clear_fee_carryover WHERE game_id=? AND account_id=?').get(game,person.id);
    if(carry){unverifiable=true;continue;}
    if(admin.tables!==1||Math.abs(admin.points-person.recorded)>1e-6)issues.push(`座位${person.seat+1}后台积分与App终桌分不一致（含桌费核对）`);
    const number=db.prepare('SELECT member_id FROM account_numbers WHERE account_id=?').get(person.id)?.member_id;
    const day=daily.find(r=>r.userId===String(number)),week=weekly.find(r=>r.userId===String(number));
    // Reports exclude users outside their final roster. For included members,
    // compare raw net amounts, not the app divisor vs Telegram's fixed 1/2.
    if(day&&Math.abs(day.score-person.net)>1e-6)issues.push(`座位${person.seat+1}日结原始净额与终桌分不一致`);
    if(week&&week.rounds!==1)issues.push(`座位${person.seat+1}周结桌数不一致`);
   }
  }
  if(issues.length)report.status='mismatch';
  else if(unverifiable||!rows.length){report.status='unverifiable';issues.push('历史记录不完整，不能证明所有分录一致');}
  else if(duplicateSnapshots){report.status='warning';issues.push(`存在${duplicateSnapshots}条旧终桌快照，统计已只取最新记录`);}
  return report;
 }
 function enqueue(game:string){db.prepare('INSERT OR IGNORE INTO reconciliation_jobs VALUES (?,?)').run(game,Date.now());}
 function tick(){
  const job=db.prepare('SELECT game_id FROM reconciliation_jobs ORDER BY requested_at LIMIT 1').get();if(!job)return;
  const game=String(job.game_id);
  try{
   const report=checkGame(game);
   db.prepare('INSERT OR REPLACE INTO reconciliation_reports VALUES (?,?,?,?,?)').run(game,report.at,report.checkedAt,report.status,JSON.stringify(report));
   db.prepare('DELETE FROM reconciliation_jobs WHERE game_id=?').run(game);
  }catch(error){
   if(error instanceof AuthError&&error.status===404){db.prepare('DELETE FROM reconciliation_jobs WHERE game_id=?').run(game);return;}
   // Leave a visible diagnostic, not an infinite retry every server tick.
   const source=db.prepare('SELECT code,at FROM match_records WHERE game_id=? ORDER BY at DESC,id DESC LIMIT 1').get(game);
   const report:ReconciliationReport={game,code:String(source?.code??''),at:Number(source?.at??Date.now()),checkedAt:Date.now(),status:'unverifiable',issues:['记录解析失败，需要人工检查原始数据'],rounds:0,duplicateSnapshots:0};
   db.prepare('INSERT OR REPLACE INTO reconciliation_reports VALUES (?,?,?,?,?)').run(game,report.at,report.checkedAt,report.status,JSON.stringify(report));
   db.prepare('DELETE FROM reconciliation_jobs WHERE game_id=?').run(game);
  }
 }
 function range(query:URLSearchParams){
  const from=Number(query.get('from')),to=Number(query.get('to'));
  if(!query.has('from')||!query.has('to')||![from,to].every(Number.isSafeInteger)||from<0||to<=from||to-from>31*86400000)throw new AuthError('请选择最多31天的日期范围');
  return{from,to};
 }
 return{checkGame,enqueue,tick,
  request(query:URLSearchParams){const {from,to}=range(query);const rows=db.prepare(`SELECT m.game_id FROM match_records m WHERE m.at>=? AND m.at<? AND ${latestCompletedSnapshot('m')} LIMIT 201`).all(from,to);
   if(rows.length>200)throw new AuthError('该范围超过200桌，请缩小日期范围');
   for(const r of rows)enqueue(String(r.game_id));return{queued:rows.length};},
  list(query:URLSearchParams){const {from,to}=range(query);return{pending:Number(db.prepare('SELECT COUNT(*) n FROM reconciliation_jobs').get()!.n),reports:db.prepare('SELECT report FROM reconciliation_reports WHERE at>=? AND at<? ORDER BY at DESC LIMIT 200').all(from,to).map(r=>JSON.parse(String(r.report)) as ReconciliationReport)};},
 };
}
