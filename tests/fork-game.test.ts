import {it,expect} from 'vitest';
import {forkGame} from '../server/fork-game';
import {replayedRound} from './fixtures/replayed-round';
it('live fields are isolated while append-only history/frame arrays can grow independently',()=>{
 const g=replayedRound(),fork=forkGame(g),before=JSON.stringify(g);
 expect(fork.history).not.toBe(g.history);expect(fork.history[0]).toBe(g.history[0]);
 expect(fork.replay!.frames).not.toBe(g.replay!.frames);expect(fork.replay!.frames[0]).toBe(g.replay!.frames[0]);
 fork.players[0]!.hand.push(999);fork.rules.rounds++;fork.history.push(g.history[0]);fork.replay!.frames.push(g.replay!.frames[0]);
 fork.replay!.frames[0]={...fork.replay!.frames[0],at:123};
 expect(JSON.stringify(g)).toBe(before);
});
