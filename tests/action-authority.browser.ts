import {test,expect,type WebSocketRoute,type Page} from './browser-fixtures';
import {claimFixture,confirmFixture} from '../src/dev/action-studio-fixtures';
import {viewFor} from '../shared/engine';
import type {Game} from '../shared/types';
const frame=(page:Page)=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
async function cues(page:Page){return frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return [...c.actionFx.slots.values()].filter((s:any)=>s.root.active).map((s:any)=>s.cue.type);});}
test('real App waits for confirmed socket state; duplicate clicks, failure and pointer expiry are safe',async({page},info)=>{
 let g=claimFixture(),socket:WebSocketRoute;g.code='682714';const commands:any[]=[];
 const push=(next:Game)=>{g=next;socket.send(JSON.stringify({type:'state',state:viewFor(g,0),serverNow:Date.now()}));};
 await page.routeWebSocket('**/ws',ws=>{socket=ws;const upstream=ws.connectToServer();ws.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='action')commands.push(m);else upstream.send(raw);});upstream.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:g.code}));push(g);}else ws.send(raw);});});
 await page.goto('/');const group=page.getByRole('group',{name:'碰杠胡操作'}),pung=group.getByRole('button',{name:'碰',exact:true});await expect(pung).toBeEnabled();
 await expect.poll(()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
 await pung.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect.poll(()=>commands.length).toBe(1);await expect(pung).toBeDisabled();await page.waitForTimeout(220);expect(await cues(page)).toEqual([]);
 socket!.send(JSON.stringify({type:'error',requestId:commands[0].requestId,message:'测试：动作过期，请重试'}));await expect(pung).toBeEnabled();expect(await cues(page)).toEqual([]);
 await pung.click();await expect.poll(()=>commands.length).toBe(2);expect(await cues(page)).toEqual([]);
  push(confirmFixture(g,0,{type:'pung'}));socket!.send(JSON.stringify({type:'ack',requestId:commands[1].requestId}));await expect.poll(()=>cues(page),{intervals:[30,50,80]}).toContain('pung');
 await page.waitForTimeout(260);
 // Still animating: a real hand tap continues to work; presentation is not
 // a lock on input or on the next authoritative state.
 const target=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),hand=[...c.tileLayout.values()].filter((t:any)=>t.seat===0&&t.area==='hand') as any[];const t=hand[Math.floor(hand.length/2)];return{x:t.x,y:t.y,tile:t.tile};});
 const bounds=(await page.locator('#cocos-table-board iframe').boundingBox())!,scale=Math.min(bounds.width/1280,bounds.height/590);
 await page.mouse.click(bounds.x+(bounds.width-1280*scale)/2+target.x*scale,bounds.y+(bounds.height-590*scale)/2+target.y*scale);
 await expect.poll(()=>frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state.selected;})).toBe(target.tile);
 await page.screenshot({path:`output/qa/action-jade-v2/${info.project.name}-real-app-confirmed.png`});await expect.poll(()=>cues(page)).toEqual([]);
 // A fresh real-engine claim expires while a finger is held. Retain empty
 // slots and capture the release; do not retarget the touch to a new button/hand.
 const fresh=claimFixture();fresh.id=g.id+'-expiry';fresh.code=g.code;fresh.revision=g.revision+1;push(fresh);await expect(pung).toBeEnabled();
 const box=(await pung.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await expect(pung).toHaveAttribute('data-state','pressed');
 const after=confirmFixture(g,0,{type:'pass'});after.revision=g.revision+1;push(after);await expect(pung).toHaveCount(0);await page.mouse.up();await page.waitForTimeout(250);expect(commands.length).toBe(2);
 const selected=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state.selected;});expect(selected).toBeNull();
});
test.describe('touch input',()=>{
 test.use({hasTouch:true});
 test('expired held touch cannot fall through to a hand tile',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','CDP touch injection is Chromium-only; native iOS touch remains unverified');
  let game=claimFixture(),socket:WebSocketRoute;game.code='682715';const commands:any[]=[];
  const push=()=>socket.send(JSON.stringify({type:'state',state:viewFor(game,0),serverNow:Date.now()}));
  await page.routeWebSocket('**/ws',ws=>{socket=ws;const upstream=ws.connectToServer();ws.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='action')commands.push(m);else upstream.send(raw);});upstream.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:game.code}));push();}else ws.send(raw);});});
  await page.goto('/');const pung=page.getByRole('group',{name:'碰杠胡操作'}).getByRole('button',{name:'碰',exact:true});await expect(pung).toBeEnabled();
  const b=(await pung.boundingBox())!,cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:9}]});await expect(pung).toHaveAttribute('data-state','pressed');
  game=confirmFixture(game,0,{type:'pass'});push();await expect(pung).toHaveCount(0);
  const f=(await page.locator('#cocos-table-board iframe').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:f.x+f.width*.6,y:f.y+f.height*.88,id:9}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(250);expect(commands).toEqual([]);
  const selected=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state.selected;});expect(selected).toBeNull();await cdp.detach();
 });
});
