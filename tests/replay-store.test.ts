import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import {createReplayStore} from '../server/replay-store';
import type {RoundReplay} from '../shared/types';
function fixture(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE round_replays(id TEXT PRIMARY KEY,payload BLOB NOT NULL)');return db;}
const replay:RoundReplay={id:'g-1',code:'123456',version:1,round:1,startedAt:1,endedAt:2,names:['测试'.repeat(2000)],frames:[]};
it('durable data reads before asynchronous compression, and restart resumes jobs with byte-equivalent JSON',async()=>{
 const db=fixture();try{const a=createReplayStore(db);db.exec('BEGIN');a.save(replay);db.exec('COMMIT');
 const old=db.prepare('SELECT payload FROM round_replays').get()!.payload as Uint8Array;
 expect(JSON.parse(gunzipSync(old).toString())).toEqual(replay);
 const reopened=createReplayStore(db);await reopened.drain();
 const next=db.prepare('SELECT payload FROM round_replays').get()!.payload as Uint8Array;
 expect(next.length).toBeLessThan(old.length);expect(gunzipSync(next).equals(gunzipSync(old))).toBe(true);
 expect(db.prepare('SELECT COUNT(*) n FROM replay_compression_jobs').get()!.n).toBe(0);
 }finally{db.close();}
});
it('transaction rollback leaves no replay/job and deleting during compression cannot restore a replay',async()=>{
 const db=fixture();try{const a=createReplayStore(db);db.exec('BEGIN');a.save(replay);db.exec('ROLLBACK');
 expect(await a.compressNext()).toBe(false);a.save(replay);const work=a.compressNext();db.exec('DELETE FROM round_replays');await work;
 expect(db.prepare('SELECT COUNT(*) n FROM round_replays').get()!.n).toBe(0);
 }finally{db.close();}
});
