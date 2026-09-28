import {it,expect} from 'vitest';
import {claimFixture,confirmFixture,multiWinFixture} from '../src/dev/action-studio-fixtures';
import {viewFor,seats} from '../shared/engine';
import {cocosState} from '../src/cocos-state';
import {layout3DTable} from '../shared/table-3d-layout';
import type {Seat} from '../shared/types';
const ui={connected:true,disabled:false,practice:true,countdown:'',selected:null,inspectedKind:null,hintKinds:[],hintLabel:'',effects:[]};
it.each(seats)('winner %i is the only public hand from every seat, also in live history',winner=>{
 const g=confirmFixture(claimFixture(winner),winner,{type:'hu'}),original=structuredClone(g);
 for(const me of seats){
  const v=viewFor(g,me),s=cocosState(v,ui);s.tableStyle='reference-3d';
  for(const seat of seats){const visible=seat===me||seat===winner;
   expect(v.players[seat]!.hand).toEqual(visible?g.players[seat]!.hand:[]);
   expect(v.players[seat]!.handCount).toBe(g.players[seat]!.hand.length);
   expect(v.history.at(-1)!.hands![seat].hand).toEqual(visible?g.history.at(-1)!.hands![seat].hand:[]);
   expect(s.players[seat].hand).toEqual(visible?g.players[seat]!.hand:[]);
  }
  const tiles=layout3DTable(s);
  for(const t of tiles.filter(t=>t.area==='hand')){expect(!!t.laidDown).toBe(t.seat===winner);if(t.seat!==me&&t.seat!==winner)expect(t.tile).toBeUndefined();}
 }
 expect(g).toEqual(original);
});
it('multi-win reveals only the actual winners, and the client rejects old all-face payloads',()=>{
 const g=multiWinFixture().after;expect(g.result!.winners).toEqual([0,1]);
 const v=viewFor(g,3);v.players[2]!.hand=[...g.players[2]!.hand]; // Old server defense.
 const s=cocosState(v,ui);expect(s.players[2].hand).toEqual([]);
 expect(s.revealedWinners).toEqual([0,1]);
});
it.each(['draw','bankrupt','dissolved'] as const)('%s does not automatically reveal any opponents or concealed sets',reason=>{
 const g=claimFixture();g.phase='finished';g.pending=undefined;g.result={reason,winners:[],details:{},deltas:[0,0,0,0]};
 g.players[1]!.melds=[{type:'kong',tiles:[100,101,102,103],from:1 as Seat,concealed:true}];
 const v=viewFor(g,0),s=cocosState(v,ui);
 expect(v.players[1]!.hand).toEqual([]);expect(v.players[1]!.melds[0].tiles).toEqual([100]);
 expect(s.revealedWinners).toEqual([]);expect(s.players.filter(p=>p.seat!==0).every(p=>!p.hand.length)).toBe(true);
});
