import { describe, expect, it } from 'vitest';
import { layoutTable, type TableSceneState } from '../shared/table-scene';
function scene(melds:number):TableSceneState {
  return {
    key:'layout',revision:1,me:0,turn:0,dealer:0,phase:'playing',code:'123456',round:1,
    remaining:80,countdown:'10',connected:true,disabled:false,practice:false,
    canDiscard:true,selected:null,inspectedKind:null,hintKinds:[],hintLabel:'',actions:[],effects:[],trusteeDisabled:false,
    players:[0,1,2,3].map(seat=>({seat,name:String(seat),score:90,bot:false,trustee:false,
      hand:seat===0?Array.from({length:13-3*melds},(_,i)=>i):[],handCount:13-3*melds,
      flowers:[],discards:[],melds:Array.from({length:melds},(_,i)=>({type:'pung' as const,tiles:[60+i*4,61+i*4,62+i*4],from:(seat+1)%4,concealed:false}))})),
  };
}
describe('摸牌固定槽和碰牌间隔',()=>{
  it.each([0,1,2,3,4])('%i组碰牌时，下家摸牌在最上，对家在最左，已有牌不动',melds=>{
    const state=scene(melds), before=layoutTable(state);
    state.players[1].handCount++;
    state.players[2].handCount++;
    const after=layoutTable(state);
    for(const tile of before) expect(after.find(t=>t.id===tile.id)).toEqual(tile);
    for(const seat of [1,2]) {
      const previous=before.filter(t=>t.area==='hand'&&t.seat===seat);
      const added=after.find(t=>t.area==='hand'&&t.seat===seat&&!previous.some(p=>p.id===t.id))!;
      expect(added).toBeDefined();
      expect(seat===1?added.y:added.x).toBeLessThan(Math.min(...previous.map(t=>seat===1?t.y:t.x)));
    }
  });
  it.each([1,2,3,4])('%i组碰牌与自家、对家手牌至少留12设计像素',melds=>{
    const tiles=layoutTable(scene(melds));
    for(const seat of [0,2]) {
      const hand=tiles.filter(t=>t.seat===seat&&t.area==='hand');
      const sets=tiles.filter(t=>t.seat===seat&&t.area==='meld');
      const gap=seat===0
        ? Math.min(...hand.map(t=>t.x-t.w/2))-Math.max(...sets.map(t=>t.x+t.w/2))
        : Math.min(...sets.map(t=>t.x-t.w/2))-Math.max(...hand.map(t=>t.x+t.w/2));
      expect(gap).toBeGreaterThanOrEqual(12-1e-8);
    }
  });
});
