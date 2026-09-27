import type {DatabaseSync} from 'node:sqlite';
import {gzipSync,gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import type {RoundReplay} from '../shared/types';
const zip=promisify(gzip),unzip=promisify(gunzip);
/** Durable gzip level 0 is immediately readable by old and new servers.
 * Expensive compression runs asynchronously after the scoring transaction.
 * No new on-disk payload format and no acknowledgement before persistence. */
export function createReplayStore(db:DatabaseSync){
 db.exec('CREATE TABLE IF NOT EXISTS replay_compression_jobs(id TEXT PRIMARY KEY)');
 let inFlight:Promise<boolean>|undefined;
 function save(replay:RoundReplay){
  if(db.prepare('SELECT 1 FROM round_replays WHERE id=?').get(replay.id))return;
  const payload=gzipSync(JSON.stringify(replay),{level:0});
  db.prepare('INSERT OR IGNORE INTO round_replays VALUES (?,?)').run(replay.id,payload);
  db.prepare('INSERT OR IGNORE INTO replay_compression_jobs VALUES (?)').run(replay.id);
 }
 async function run(){
  const job=db.prepare('SELECT id FROM replay_compression_jobs ORDER BY rowid LIMIT 1').get();if(!job)return false;
  const row=db.prepare('SELECT payload FROM round_replays WHERE id=?').get(job.id);
  if(!row){db.prepare('DELETE FROM replay_compression_jobs WHERE id=?').run(job.id);return true;}
  const before=Buffer.from(row.payload as Uint8Array);
  const plain=await unzip(before,{maxOutputLength:16*1024*1024});
  const after=await zip(plain);
  // A concurrent purge/change must never be resurrected or overwritten.
  const updated=db.prepare('UPDATE round_replays SET payload=? WHERE id=? AND payload=?').run(after,job.id,before);
  if(updated.changes||!db.prepare('SELECT 1 FROM round_replays WHERE id=?').get(job.id))db.prepare('DELETE FROM replay_compression_jobs WHERE id=?').run(job.id);
  return true;
 }
 function compressNext(){return inFlight??=(run().finally(()=>{inFlight=undefined;}));}
 return{save,compressNext,async drain(limit=100){for(let i=0;i<limit&&await compressNext();i++);}};
}
