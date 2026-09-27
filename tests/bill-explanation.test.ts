import {it,expect} from 'vitest';
import {debitGame,applyDebit} from './fixtures/debit-game';
import {captureReplay} from '../shared/replay';
import {explainTransfer} from '../shared/bill-explanation';
it('explains authoritative capped payments and records the exact corresponding replay frame',()=>{
 const g=debitGame();g.wall=[140];g.players[1]!.score=3;g.roundStartScores=g.players.map(p=>p!.score);
 g.replay={version:1,id:`${g.id}-1`,code:g.code,round:1,startedAt:1,names:g.players.map(p=>p!.name),frames:[]};captureReplay(g,'start',1);
 const after=applyDebit(g,'concealed'),record=after.history[0],bill=explainTransfer(record,0)!;
 expect(bill.amount).toBe(3);expect(bill.notes.join('')).toContain('规则参考 5 分');expect(bill.notes.join('')).toContain('余额不足');
 const frame=after.replay!.frames.find(f=>(f.transferCount??0)>0);expect(frame?.type).toBe('concealedKong');
 expect(explainTransfer(record,999)).toBeNull();
});
