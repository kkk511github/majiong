import {it,expect} from 'vitest';
import {crowdedClaimFixture} from '../src/dev/action-studio-fixtures';
import {viewFor} from '../shared/engine';
import {cocosState} from '../src/cocos-state';
import {tableOverlayLayout} from '../src/table-overlay-layout';
import {tableActionRail} from '../src/table-action-rail';
const state=()=>({...cocosState(viewFor(crowdedClaimFixture(),0),{connected:true,disabled:false,practice:true,countdown:'',selected:null,inspectedKind:null,hintKinds:[],hintLabel:'',effects:[]}),tableStyle:'reference-3d' as const});
it('reference proportions use large primary and smaller separated pass, with single main anchored independently',()=>{
 const s=state();s.players=[];s.actions=[{id:'hu',label:'胡'},{id:'pass',label:'过'}];const f=tableOverlayLayout({left:0,top:0,width:1280,height:590},{left:0,top:0,width:1280,height:590},undefined,s.tableStyle);
 const r=tableActionRail(s,f,590);expect(r.main).toBe(88);expect(r.pass).toBe(68);expect(r.boxes.map(b=>b.x+b.w/2)).toEqual([914,1014]);expect(r.boxes.map(b=>b.y+b.h/2)).toEqual([422,422]);
 expect(r.boxes[1].x-r.boxes[0].x-r.boxes[0].w).toBe(22);expect(r.gap+r.passMargin).toBe(22);
 s.actions.pop();expect(tableActionRail(s,f,590).boxes[0].x+r.main/2).toBe(914);
});
it.each([[1280,590],[844,390]])('crowded %ix%i keeps four buttons clear even with eight local flowers', (width,height)=>{
 const s=state();let offset=124;for(const [i,n]of [8,2,8,2].entries()){s.players[i].flowers=Array.from({length:n},()=>offset++);}
 const rect={left:0,top:0,width,height},r=tableActionRail(s,tableOverlayLayout(rect,rect,undefined,s.tableStyle),height);
 expect(r.fits).toBe(true);expect(r.boxes).toHaveLength(4);expect(r.main).toBeGreaterThanOrEqual(44);expect(r.pass).toBeGreaterThanOrEqual(44);
});
it.each([[1280,590],[844,390]])('hu and three different self-kongs fit at %ix%i with distinct guarded slots',(width,height)=>{
 const s={...state(),...cocosState(viewFor(crowdedClaimFixture('multi-kong'),0),{connected:true,disabled:false,practice:true,countdown:'',selected:null,inspectedKind:null,hintKinds:[],hintLabel:'',effects:[]})};
 let offset=124;for(const [i,n]of [8,2,8,2].entries())s.players[i].flowers=Array.from({length:n},()=>offset++);
 const rect={left:0,top:0,width,height},r=tableActionRail(s,tableOverlayLayout(rect,rect,undefined,s.tableStyle),height);
 expect(r.fits).toBe(true);expect(r.boxes).toHaveLength(4);
 for(let i=1;i<r.boxes.length;i++){expect(r.boxes[i].x-r.boxes[i-1].x-r.boxes[i-1].w).toBeGreaterThanOrEqual(11.9);expect(r.boxes[i].x-r.boxes[i-1].x).toBeCloseTo(r.main+r.gap,6);}
});
