import {act,botAction,createGame,newPlayer,seats,startRound,trusteeAction} from '../../shared/engine';
import {newGameRules} from '../../shared/nanjing-rules';
import type {Game} from '../../shared/types';
import type {ShuffleRandom} from '../../shared/tiles';

/** Dev-only local table. Never opens a room or sends a message to a service. */
export function createLocalBotGame(rounds:2|8=8,random?:ShuffleRandom,deal=true):Game {
 const game=createGame('本地机器人桌',`local-bots-${Date.now()}`,newGameRules({rounds:8,turnSeconds:0}));
 // A two-hand cap belongs only to this isolated demo. Production admission
 // still accepts the existing supported round counts and is not changed.
 game.rules.rounds=rounds;
 game.ownerId='local-human';
 game.players=seats.map(seat=>newPlayer(seat===0?'local-human':`local-bot-${seat}`,seat===0?'你（本地）':`机器人${['','一','二','三'][seat]}`,seat!==0));
 game.players[0]!.ready=deal;
 return deal?startRound(game,Date.now(),random):game;
}
export function beginLocalRound(game:Game,random?:ShuffleRandom):Game {
 const next=structuredClone(game);next.players.forEach(p=>{if(p)p.ready=true;});
 return startRound(next,Date.now(),random);
}
export function stepLocalBots(game:Game):Game {
 if(!['playing','claiming'].includes(game.phase))return game;
 for(const seat of seats){
  const p=game.players[seat];if(!p||!p.bot&&!p.trustee)continue;
  const action=p.bot?botAction(game,seat):trusteeAction(game,seat);
  if(action)return act(game,seat,action);
 }
 return game;
}
