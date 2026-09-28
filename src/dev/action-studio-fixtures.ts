import {act,selfKongs,seats} from '../../shared/engine';
import type {Game,Seat,Action} from '../../shared/types';
import {debitGame,applyDebit,type DebitExample} from '../../tests/fixtures/debit-game';
/** Isolated DEV fixtures. The real engine derives offers and confirms actions;
 * no network client, persistence or alternate scoring implementation. */
export function rotateFixture(source:Game,seat:Seat){
 const g=structuredClone(source),move=(s:number)=>((s+seat)%4) as Seat;
 g.players=seats.map(s=>source.players[(s-seat+4)%4]?structuredClone(source.players[(s-seat+4)%4]):null);
 g.players.forEach((p,i)=>{if(p){p.name=['本家·金陵','下家·秦淮','对家·钟山','上家·莫愁'][i];p.bot=false;p.trustee=false;p.melds.forEach(m=>m.from=move(m.from));}});
 g.turn=move(source.turn);g.dealer=move(source.dealer);
 if(g.pending){g.pending.from=move(source.pending!.from);g.pending.offers=Object.fromEntries(Object.entries(source.pending!.offers).map(([s,v])=>[move(Number(s)),v]));g.pending.replies={};}
  if(g.lastDiscard)g.lastDiscard.seat=move(g.lastDiscard.seat);
 g.roundTransfers=g.roundTransfers?.map(t=>({...t,from:move(t.from),to:move(t.to)}));
 if(g.ruleState){g.ruleState.discards=g.ruleState.discards.map(d=>({...d,seat:move(d.seat)}));g.ruleState.ownDiscards=seats.map(s=>source.ruleState!.ownDiscards[(s-seat+4)%4]);}
 if(g.result){g.result.winners=g.result.winners.map(move);if(g.result.from!==undefined)g.result.from=move(g.result.from);g.result.deltas=seats.map(s=>source.result!.deltas[(s-seat+4)%4]);g.result.details=Object.fromEntries(Object.entries(source.result!.details).map(([s,v])=>[move(Number(s)),v]));g.result.transfers=g.result.transfers?.map(t=>({...t,from:move(t.from),to:move(t.to)}));}
 g.id='action-studio';g.code='本地验收';g.deadline=Date.now()+600000;return g;
}
export function claimFixture(seat:Seat=0,multiple=false){
 const g=debitGame();g.phase='playing';g.turn=3;g.pending=undefined;g.lastDiscard=undefined;g.lastDraw=3;
 g.players.forEach(p=>{p!.melds=[];p!.discards=[];p!.flowers=[];p!.trustee=false;p!.bot=false;});
 g.players[0]!.hand=[0,1,2,4,5,6,8,12,16,20,24,28,32];
 if(multiple){g.players[1]!.hand=[7,9,40,41,42,44,45,46,76,77,78,80,81];g.players[1]!.flowers=[124,128,132,136];}
 const used=new Set([3,...g.players[0]!.hand,...(multiple?[...g.players[1]!.hand,...g.players[1]!.flowers]:[])]);
 const rest=Array.from({length:124},(_,i)=>i).filter(t=>!used.has(t));
 for(const s of [1,2,3])if(s!==1||!multiple)g.players[s]!.hand=rest.splice(0,13);
 g.players[3]!.hand.push(3);g.wall=rest;g.revision=1;
 const rotated=rotateFixture(g,seat);return act(rotated,rotated.turn,{type:'discard',tile:3},Date.now());
}
export function confirmFixture(before:Game,seat:Seat,action:Action){
 let next=act(before,seat,action,Date.now());
 for(let i=0;i<4&&next.phase==='claiming';i++){
  const other=seats.find(s=>next.pending?.offers[s]&&next.pending.replies[s]===undefined);if(other===undefined)break;next=act(next,other,{type:'pass'},Date.now());
 }return next;
}
/** Dense but physically unique tile inventory; offers still come from act(). */
export type CrowdedAction='all'|'hu'|'hu-claim'|'pung'|'kong'|'hu-pung'|'kong-pung'|'multi-kong';
export function crowdedClaimFixture(action:CrowdedAction='all'){
 const g=claimFixture();g.phase='playing';g.turn=3;g.pending=undefined;g.lastDiscard=undefined;g.lastDraw=3;
 const self=action==='hu'||action==='kong'||action==='multi-kong';
 if(action==='hu')g.players[0]!.hand=[0,1,4,5,6,8,9,10,12,13,14,16,17,18];
 if(action==='hu-claim')g.players[0]!.hand=[4,8,12,13,14,16,17,18,20,21,22,24,25];
 if(action==='pung')g.players[0]!.hand=[0,1,4,12,20,28,36,44,52,60,72,84,96];
 if(action==='kong')g.players[0]!.hand=[0,1,2,3,4,12,20,28,36,44,52,60,72,96];
 if(action==='hu-pung')g.players[0]!.hand=[0,1,4,5,6,8,9,10,12,13,14,16,17];
 if(action==='kong-pung')g.players[0]!.hand=[0,1,2,4,12,20,28,36,44,52,60,72,96];
 if(action==='multi-kong')g.players[0]!.hand=Array.from({length:14},(_,i)=>i);
 const reserved=new Set([...g.players[0]!.hand,...(self?[]:[3])]);
 let pool=Array.from({length:124},(_,i)=>i).filter(t=>!reserved.has(t));
 for(const seat of [1,2,3]){
  const p=g.players[seat]!;p.melds=[];
  for(let n=0;n<2;n++){
   const kind=Array.from({length:31},(_,k)=>k).find(k=>pool.filter(t=>Math.floor(t/4)===k).length>=3)!;
   const tiles=pool.filter(t=>Math.floor(t/4)===kind).slice(0,3);
   pool=pool.filter(t=>!tiles.includes(t));p.melds.push({type:'pung',tiles,from:((seat+1)%4) as Seat,concealed:false});
  }
 }
 for(const seat of [1,2,3])g.players[seat]!.hand=pool.splice(0,7);
 for(const seat of seats){g.players[seat]!.discards=pool.splice(0,16);g.players[seat]!.flowers=Array.from({length:5},(_,i)=>124+seat*5+i);}
 g.wall=pool;
 if(g.ruleState){g.ruleState.discards=seats.flatMap(seat=>g.players[seat]!.discards.map(tile=>({seat,tile})));g.ruleState.ownDiscards=seats.map(seat=>g.players[seat]!.discards.map(t=>Math.floor(t/4)));}
 g.id='action-studio-crowded-'+action;
 if(self){g.turn=0;g.lastDraw=action==='hu'?18:action==='multi-kong'?13:3;g.canSelfWin=true;return g;}
 g.players[3]!.hand.push(3);
 return act(g,3,{type:'discard',tile:3},Date.now());
}
export function kongFixture(seat:Seat){return rotateFixture(debitGame(),seat);}
export function addedFixture(seat:Seat){const before=claimFixture(seat),pung=confirmFixture(before,seat,{type:'pung'});return{before,pung,after:confirmFixture(pung,seat,{type:'selfKong',tile:selfKongs(pung,seat)[0]})};}
export function rapidFixture(seat:Seat){
 const before=claimFixture(seat),owner=before.players.find(p=>p?.hand.includes(33));
 if(owner){const at=owner.hand.indexOf(33);owner.hand[at]=before.wall.shift()!;}
 before.wall=[...before.wall.filter(t=>t!==33),33];
 const pung=confirmFixture(before,seat,{type:'pung'}),kong=confirmFixture(pung,seat,{type:'selfKong',tile:selfKongs(pung,seat)[0]}),hu=confirmFixture(kong,seat,{type:'hu'});
 return{before,pung,kong,hu};
}
export function multiWinFixture(){const before=claimFixture(0,true);let after=act(before,0,{type:'hu'},Date.now());after=act(after,1,{type:'hu'},Date.now());for(const s of seats)if(after.phase==='claiming'&&after.pending?.offers[s]&&after.pending.replies[s]===undefined)after=act(after,s,{type:'pass'},Date.now());return{before,after};}
export type DebitCase=DebitExample|'flower'|'capped';
export function debitFixture(example:DebitCase,seat:Seat,multiplier=1){
 const kind=example==='flower'||example==='capped'?'concealed':example;
 const before=debitGame(kind,multiplier);let after:Game;
 if(example==='flower'){before.players[1]!.flowers=[124,125,126];before.wall=[127,...before.wall.filter(t=>t<124)];after=act(before,0,{type:'discard',tile:96},Date.now());}
 else{if(example==='capped'){before.players[1]!.score=3;before.players[2]!.score=7;}after=applyDebit(before,kind);}
 const rotation=(example==='flower'?(seat+3)%4:seat) as Seat;
 return{before:rotateFixture(before,rotation),after:rotateFixture(after,rotation)};
}
