import {it,expect} from 'vitest';
import {createLocalBotGame,stepLocalBots,beginLocalRound} from './previews/local-bot-game';
import {act,viewFor} from '../shared/engine';
import {seededRandom} from '../shared/tiles';
import {setTrustee} from '../shared/timing';
it('runs a local two-round ready/start/settlement/final flow with the original engine',()=>{
 const random=seededRandom(12);let game=createLocalBotGame(2,random,false);
 expect(game.phase).toBe('waiting');expect(game.round).toBe(0);
 game=beginLocalRound(game,random);setTrustee(game,0,true,Date.now());
 let steps=0;
 while(game.phase!=='finished'&&steps++<1000){
  if(game.phase==='ended'){expect(game.history).toHaveLength(1);game=beginLocalRound(game,random);}
  else game=stepLocalBots(game);
 }
 expect(game.phase).toBe('finished');expect(game.round).toBe(2);expect(game.history).toHaveLength(2);
 expect(game.rules.rounds).toBe(2);expect(game.table).toBeUndefined();
});
it('starts one human and three bots using the normal engine without timing the human',()=>{
 const game=createLocalBotGame();expect(game.phase).toBe('playing');expect(game.turn).toBe(0);expect(game.players.filter(p=>p?.bot)).toHaveLength(3);expect(game.players[0]?.bot).toBe(false);expect(game.rules.turnSeconds).toBe(0);expect(game.table).toBeUndefined();
 expect(stepLocalBots(game)).toBe(game);expect(viewFor(game,0).players.slice(1).every(p=>p?.hand.length===0)).toBe(true);
 let next=act(game,0,{type:'discard',tile:game.players[0]!.hand[0]});
 const revision=next.revision;for(let i=0;i<12;i++){const updated=stepLocalBots(next);if(updated===next)break;next=updated;}
 expect(next.revision).toBeGreaterThan(revision);
});
