import {it,expect} from 'vitest';
import {layoutTable,layoutPlayerHud} from '../shared/table-scene';
import {layout3DTable} from '../shared/table-3d-layout';
import {referenceSnapshot,referenceTiles} from './previews/table-reference-layout';
import {fullMeldFixture,busyTableFixture} from './previews/table-full-meld-fixture';
import {replayedRound} from './fixtures/replayed-round';
import {debitGame,applyDebit} from './fixtures/debit-game';
import {viewFor} from '../shared/engine';
import {cocosState} from '../src/cocos-state';

it('all seat stacks share the middle tile ground anchor and the opposite stack is not clipped',()=>{
 for(const mode of ['concealed','added'] as const)for(const me of [0,1,2,3] as const){
  const g=applyDebit(debitGame(mode),mode),s=cocosState(viewFor(g,me),{connected:true,disabled:false,practice:true,countdown:'',selected:null,inspectedKind:null,hintKinds:[],hintLabel:'',effects:[]});
  const tiles=layout3DTable(s),upper=tiles.find(t=>t.stack)!,middle=tiles.find(t=>t.id===upper.id.replace(/-3$/,'-1'))!;
  expect(upper.groundX).toBe(middle.groundX);expect(upper.groundZ).toBe(middle.groundZ);
  if(me===2)expect(upper.y-upper.h/2).toBeGreaterThan(2);
 }
});

it('production geometry matches the approved preview in all seats and stress fixtures',()=>{
 for(const input of [referenceSnapshot(),fullMeldFixture('pung'),fullMeldFixture('kong'),busyTableFixture()])for(const me of [0,1,2,3]){
  const state={...input,me,drawn:undefined,selected:null};
  const expected=referenceTiles(state),actual=layout3DTable({...state,tableStyle:'reference-3d'});
  expect(actual).toHaveLength(expected.length);
  for(const t of actual){const e=expected.find(e=>e.id===t.id&&e.seat===t.seat)!;expect(t.tile).toBe(e.tile);expect(t.yaw).toBe(e.yaw);if(t.area==='hand'&&t.seat!==me&&t.tile!==undefined)continue;expect(t.groundX).toBe(e.groundX);expect(t.groundZ).toBe(e.groundZ);expect(t.modelWidth).toBe(e.modelWidth);expect(t.modelLength).toBe(e.modelLength);}
 }
});
it('selected real hand tile lifts while identity and ordering remain stable',()=>{
 const s={...referenceSnapshot(),tableStyle:'reference-3d' as const,canDiscard:true,disabled:false},tile=s.players[0].hand[2];
 const before=layoutTable(s),after=layoutTable({...s,selected:tile});
 const a=after.find(t=>t.area==='hand'&&t.tile===tile)!,b=before.find(t=>t.id===a.id)!;
 expect(a.x).toBe(b.x);expect(a.y).toBe(b.y-18);expect(a.clickable).toBe(true);
 expect(after.map(t=>t.id)).toEqual(before.map(t=>t.id));
});
it('latest real-player avatar anchors use approved locations',()=>{
 const top=layoutPlayerHud(2,undefined,'reference-3d'),self=layoutPlayerHud(0,undefined,'reference-3d');
 expect(top.x).toBe(911);expect(top.y-top.h/2+30).toBe(54);
 expect(self.x-self.w/2+27).toBe(99);expect(self.y-28).toBe(386);
 expect(layoutPlayerHud(3,undefined,'reference-3d').x).toBe(99);
 expect(layoutPlayerHud(1,undefined,'reference-3d').x).toBe(1180);
});
it('opposite discards face the local viewer without moving their rack or turning other tiles',()=>{
 for(const me of [0,1,2,3]){
  const state={...referenceSnapshot(),me,tableStyle:'reference-3d' as const};
  for(const t of layout3DTable(state)){
    const offset=(t.seat-me+4)%4;
    if(t.area==='river')expect(t.yaw).toBe(offset===2?0:offset*90);
    if(t.area==='flower')expect(t.yaw).toBe(offset*90);
  }
 }
});
it('all revealed replay frames keep separate players and flowers apart in four perspectives',()=>{
 const data=replayedRound().replay!;
 for(const [step,f]of data.frames.entries())for(const me of [0,1,2,3]){
  const s={...referenceSnapshot(),tableStyle:'reference-3d' as const,me,players:f.players.map((p,seat)=>({...p,seat,name:'回放检查',bot:false,trustee:false,handCount:p.hand.length,hand:[...p.hand]}))};
  const tiles=layoutTable(s);
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
   const a=tiles[i],b=tiles[j];if(a.stack||b.stack||a.seat===b.seat&&a.area===b.area)continue;
   const overlapX=(a.w+b.w)/2-Math.abs(a.x-b.x),overlapY=(a.h+b.h)/2-Math.abs(a.y-b.y);
   if(overlapX>3&&overlapY>3)throw Error(`frame ${step}, view ${me}: ${a.id}/${b.id} overlap ${overlapX.toFixed(1)}×${overlapY.toFixed(1)}`);
  }
 }
},15000);
