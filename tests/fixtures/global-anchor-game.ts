import { act, createGame, newPlayer, seats, viewFor } from "../../shared/engine";
import { newGameRules } from "../../shared/nanjing-rules";
import { captureReplay } from "../../shared/replay";
import { kind } from "../../shared/tiles";
import type { Game, Seat } from "../../shared/types";

export type AnchorScenario = "original" | "win" | "change" | "concealed" | "open";
export const ANCHOR_TILE = 92; // 六条，物理牌编号固定，绝不按所有同点数牌涂色。
export const WAIT_WAN = 16;
export const WAIT_BAMBOO = 88;
export const CHANGE_DRAW = 44;

/** Four disjoint hands and a complete 144-tile inventory, using real engine actions. */
export function anchorGame(scenario: AnchorScenario = "original", multiplier = 1, waitKind?: number, priorKongs: { index: number; concealed: boolean }[] = []): Game {
  let g = createGame("619826", `anchor-${scenario}`, newGameRules({ turnSeconds: 0 }));
  g.players = seats.map(s => newPlayer(`anchor-${s}`, ["甲 · 架牌方", "乙 · 出牌方", "丙", "丁"][s]));
  g.phase = "playing"; g.round = 1; g.turn = scenario === "concealed" ? 0 : 3;
  g.revision = 10; g.canSelfWin = true; g.roundStartScores = [90,90,90,90];
  g.roundStartExternalScores = [0,0,0,0];
  g.ruleState = {multiplier,nextMultiplier:1,nextReasons:[],keepDealer:false,heavenlyEligible:false,
    heavenlyWaits:{},discards:[],ownDiscards:[[],[],[],[]],kongOccurred:false};
  const rawWait = (waitKind ?? (scenario === "win" ? 22 : 4)) * 4;
  const wait = rawWait === ANCHOR_TILE ? rawWait + 2 : rawWait;
  g.players[0]!.melds = [0,12,18].map((k,i)=>({type:"pung",tiles:[k*4,k*4+1,k*4+2],from:(i+1) as Seat,concealed:false}));
  for (const { index, concealed } of priorKongs) {
    const meld = g.players[0]!.melds[index];
    meld.type = "kong";
    meld.concealed = concealed;
    meld.tiles.push(meld.tiles[0] + 3);
  }
  g.players[0]!.hand = scenario === "concealed" ? [36,37,38,39,wait] :
    scenario === "open" ? [36,37,38,wait] : [36,37,wait,ANCHOR_TILE];
  // Every selectable test discard is physically in the opponent's hand.
  g.players[1]!.hand = [...new Set([20,21,22,23,24,25,26,kind(wait)])].map(k=>k*4+1);
  g.players[3]!.hand = scenario === "concealed" ? [] : [39];
  const reserved = [120,116,112,CHANGE_DRAW, ...(scenario === "concealed" || scenario === "open" ? [ANCHOR_TILE] : [])];
  const held = new Set(g.players.flatMap(p=>[...p!.hand,...p!.melds.flatMap(m=>m.tiles)]));
  const rest = Array.from({length:124},(_,i)=>i).filter(t=>!held.has(t)&&!reserved.includes(t));
  // Avoid accidental unrelated winning offers without inventing any fifth copy.
  const ordered = rest.sort((a,b)=>((a*37)%127)-((b*37)%127));
  for(const seat of [1,2,3])while(g.players[seat]!.hand.length<(seat===3&&scenario!=="concealed"?14:13))g.players[seat]!.hand.push(ordered.shift()!);
  const allHeld = new Set(g.players.flatMap(p=>[...p!.hand,...p!.melds.flatMap(m=>m.tiles)]));
  g.wall = [...reserved.filter(t=>t!==ANCHOR_TILE),...Array.from({length:144},(_,i)=>i).filter(t=>!allHeld.has(t)&&!reserved.includes(t)),...(scenario==="concealed"||scenario==="open"?[ANCHOR_TILE]:[])];
  g.lastDraw=g.players[g.turn]!.hand.at(-1);
  g.replay={version:1,id:`${g.id}-1`,code:g.code,round:1,startedAt:1000,rules:g.rules,multiplier,names:g.players.map(p=>p!.name),frames:[]};
  captureReplay(g,"start",1000);
  if(scenario!=="concealed")g=act(g,3,{type:"discard",tile:39},1100);
  return g;
}
export function finishAnchorClaims(g:Game, choose:Partial<Record<Seat,"hu"|"pung"|"kong"|"pass">>={}) {
  for(const seat of seats)if(g.phase==="claiming"&&g.pending?.offers[seat]&&g.pending.replies[seat]===undefined)
    g=act(g,seat,{type:choose[seat]??"pass"},2000+g.revision*100);
  return g;
}
export function claimFourth(g:Game, scenario:AnchorScenario) {
  return scenario==="concealed" ? finishAnchorClaims(act(g,0,{type:"selfKong",tile:36},2100)) :
    finishAnchorClaims(g,{0:scenario==="open"?"kong":"pung"});
}
export function discardAnchor(g:Game) {
  return finishAnchorClaims(act(g,0,{type:"discard",tile:ANCHOR_TILE},3000));
}
export function advanceToAnchorDraw(g:Game) {
  for(let i=0;i<20;i++) {
    if(g.phase==="claiming")g=finishAnchorClaims(g);
    else if(g.turn===0)return g;
    else g=act(g,g.turn,{type:"discard",tile:g.lastDraw??g.players[g.turn]!.hand[0]},4000+i*100);
  }
  throw Error("演示未能轮到甲摸牌");
}
export function opponentDiscard(g:Game, k:number) {
  if(g.turn!==1||g.phase!=="playing")throw Error("请重新演示后由乙出牌");
  const tile=g.players[1]!.hand.find(t=>kind(t)===k);
  if(tile===undefined)throw Error("乙没有这张牌");
  return act(g,1,{type:"discard",tile},5000);
}
export function canAnchorWin(g:Game){return viewFor(g,0).actions.includes("hu");}
