import {it,expect} from 'vitest';
import {ACTION_TIMING,actionPose,ActionCueMemory} from '../shared/action-presentation';
import {actionAnchor,actionObstacles,clearOf,handActionAnchor,confirmedActionAnchor,actionCaptionAnchor} from '../shared/action-anchors';
import {layoutTable,type TableSceneState} from '../shared/table-scene';
import {viewFor,selfKongs} from '../shared/engine';
import {claimFixture,confirmFixture,addedFixture,multiWinFixture,kongFixture,debitFixture,rapidFixture} from '../src/dev/action-studio-fixtures';
import {gameFeedback} from '../src/game-feedback';
import {scoreDebits} from '../src/score-debits';
import {actionVoices} from '../src/voice-events';
import {referenceSnapshot} from './previews/table-reference-layout';
it('uses distinct finite timelines with exact settling and no ambient loops',()=>{
 expect(ACTION_TIMING.pass).toBeGreaterThanOrEqual(120);expect(ACTION_TIMING.pass).toBeLessThanOrEqual(180);
 for(const type of ['pung','kong','hu'] as const){const at=actionPose(type,ACTION_TIMING[type].impact),end=actionPose(type,ACTION_TIMING[type].duration);expect(at.alpha).toBe(1);expect(end.alpha).toBe(0);expect(end.scale).toBeCloseTo(.45);expect(actionPose(type,100).scale).toBeGreaterThan(1);expect(end.y).toBe(0);expect(actionPose(type,200,true).ink).toBe(0);}
 expect(actionPose('pung',80).spread).toBeGreaterThan(1);expect(actionPose('kong',80).y).toBeLessThan(-6);expect(actionPose('hu',80).alpha).toBe(0);
});
it('bankruptcy after a real kong keeps kong feedback, never announces an unconfirmed hu',()=>{
 const p=debitFixture('capped',0,2),a=viewFor(p.before,0),b=viewFor(p.after,0);expect(b.phase).toBe('finished');expect(gameFeedback(a,b).map(e=>e.type)).toContain('kong');expect(gameFeedback(a,b).map(e=>e.type)).not.toContain('hu');expect(scoreDebits(a,b).map(e=>e.amount)).toEqual([3,7,10]);
});
it('a replacement flower voice waits behind the confirmed kong call, independent flower calls remain immediate',()=>{
 const before=kongFixture(0);before.wall=[...before.wall,124];const after=confirmFixture(before,0,{type:'selfKong',tile:selfKongs(before,0)[0]}),a=viewFor(before,0),b=viewFor(after,0);
 expect(actionVoices(a,b).map(p=>p.phrase)).toEqual(['暗杠','补花']);expect(actionVoices(a,b,{deferConfirmed:true})).toEqual([]);
 const c=structuredClone(b);c.revision++;c.players[0]!.flowers.push(128);expect(actionVoices(b,c,{deferConfirmed:true}).map(p=>p.phrase)).toEqual(['补花']);
});
it('new transient anchors use each full hand centre with screen-edge safety',()=>{
 const s=referenceSnapshot();s.tableStyle='reference-3d';const tiles=layoutTable(s);
 for(const seat of [0,1,2,3]){const a=handActionAnchor(s,seat,tiles,'hu');expect(a.w).toBe(220);expect(a.x-a.w/2).toBeGreaterThanOrEqual(8);expect(a.y-a.h/2).toBeGreaterThanOrEqual(8);expect(a.y+a.h/2).toBeLessThanOrEqual(582);expect(a.x+a.w/2).toBeLessThanOrEqual(1272);}
});
it('pung/kong use stable discard-region anchors inward of the hand; hu retains its hand anchor',()=>{
 const s=referenceSnapshot();s.tableStyle='reference-3d';const tiles=layoutTable(s);
 for(const seat of [0,1,2,3]){const hand=handActionAnchor(s,seat,tiles,'pung'),river=confirmedActionAnchor(s,seat,tiles,'pung');expect(Math.hypot(river.x-640,river.y-295)).toBeLessThan(Math.hypot(hand.x-640,hand.y-295));const changed=structuredClone(s);changed.players.find(p=>p.seat===seat)!.discards=[];expect(confirmedActionAnchor(changed,seat,layoutTable(changed),'pung')).toEqual(river);expect(confirmedActionAnchor(s,seat,tiles,'hu')).toEqual(handActionAnchor(s,seat,tiles,'hu'));}
 expect(ACTION_TIMING.pung.duration).toBe(1200);expect(ACTION_TIMING.kong.duration).toBe(1450);
});
it('player captions do not cover the compass after moving calls to discard regions',()=>{
 for(const me of [0,1,2,3]){const s=referenceSnapshot();s.me=me;s.tableStyle='reference-3d';const tiles=layoutTable(s);for(const seat of [0,1,2,3])for(const kind of ['pung','kong','hu'] as const){const c=actionCaptionAnchor(s,seat,tiles,confirmedActionAnchor(s,seat,tiles,kind));expect(clearOf(c,{x:640,y:260,w:300,h:106})).toBe(true);}}
});
it('deduplicates, ignores private pass feedback and prioritizes one cue per player',()=>{
 const memory=new ActionCueMemory(),p={key:'p',seat:0,type:'pung'},k={key:'k',seat:0,type:'kong'},h={key:'h',seat:1,type:'hu'};
 expect(memory.consume([p,k,h,{key:'private-pass',seat:2,type:'pass'}],true)).toEqual([k,h]);expect(memory.consume([k,h],true)).toEqual([]);
 memory.reset([p]);expect(memory.consume([p],true)).toEqual([]);
 for(let i=0;i<1000;i++)memory.consume([{...p,key:String(i)}],false);expect((memory as any).seen.size).toBeLessThanOrEqual(96);
});
it('DEV controls and all kong/win cases use the unmodified real engine',()=>{
 for(const seat of [0,1,2,3] as const){const g=claimFixture(seat);expect(viewFor(g,seat).actions.sort()).toEqual(['hu','kong','pass','pung']);const added=addedFixture(seat);expect(added.pung.players[seat]!.melds[0].type).toBe('pung');expect(added.after.players[seat]!.melds[0]).toMatchObject({type:'kong',added:true});
 const concealed=kongFixture(seat);expect(confirmFixture(concealed,seat,{type:'selfKong',tile:selfKongs(concealed,seat)[0]}).players[seat]!.melds[0].concealed).toBe(true);
 }
 expect(multiWinFixture().after.result!.winners).toEqual([0,1]);
 for(const seat of [0,1,2,3] as const)expect(rapidFixture(seat).hu.result!.winners).toEqual([seat]);
});
it('anchors follow seat mapping and avoid tiles on the reference table',()=>{
 for(const me of [0,1,2,3]){const s=referenceSnapshot();s.me=me;s.tableStyle='reference-3d';const obstacles=actionObstacles(s,layoutTable(s)),reserved:any[]=[];
 for(const seat of [0,1,2,3]){const a=actionAnchor(s,seat,obstacles,reserved,true);expect(a.x).toBeGreaterThan(0);expect(a.x).toBeLessThan(1280);expect(reserved.every(r=>clearOf(a,r))).toBe(true);expect(obstacles.slice(0,layoutTable(s).length).every(r=>clearOf(a,r,0))).toBe(true);reserved.push(a);}}
});
