import {it,expect} from 'vitest';
import {drawnTileInsertion,handInsertionPoint} from '../shared/table-hand-motion';
import {layoutTable} from '../shared/table-scene';
import {referenceSnapshot} from './previews/table-reference-layout';
function setup(){const s=referenceSnapshot();s.players[0].hand=[0,4,8,9,12,16,20,24,28,32,36,40,44,52];s.players[0].handCount=14;s.players[0].discards=[];s.drawn=9;s.canDiscard=true;s.disabled=false;return s;}
it('only inserts the retained draw after a different own physical tile is discarded',()=>{
 const s=setup(),previous=layoutTable(s);s.players[0].hand=s.players[0].hand.filter(t=>t!==0);s.players[0].discards.push(0);s.drawn=undefined;
 expect(drawnTileInsertion(s,previous)).toBe(9);
});
it('does not insert when discarding the draw, merely sorting, or moving cards into a kong',()=>{
 for(const mode of ['draw-discard','sort','kong']){
  const s=setup(),previous=layoutTable(s);s.drawn=undefined;
  if(mode==='draw-discard'){s.players[0].hand=s.players[0].hand.filter(t=>t!==9);s.players[0].discards.push(9);}
  if(mode==='kong')s.players[0].hand=s.players[0].hand.filter(t=>t!==0);
  expect(drawnTileInsertion(s,previous)).toBeUndefined();
 }
});
it('lifts in place, crosses above the hand, then lands exactly in its sorted slot',()=>{
 const from={x:1120,y:522,w:71.3,h:100},to={...from,x:480};
 expect(handInsertionPoint(from,to,0)).toEqual(from);
 const lift=handInsertionPoint(from,to,.2);expect(lift.x).toBe(from.x);expect(lift.y).toBeLessThan(from.y-20);
 const slide=handInsertionPoint(from,to,.5);expect(slide.x).toBeLessThan(from.x);expect(slide.x).toBeGreaterThan(to.x);expect(slide.y).toBe(to.y-24);
 expect(handInsertionPoint(from,to,.8).x).toBe(to.x);expect(handInsertionPoint(from,to,1)).toEqual(to);
});
