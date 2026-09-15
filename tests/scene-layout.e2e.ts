import { test, expect, type WebSocketRoute } from './browser-fixtures';
import { viewFor } from '../shared/engine';
import type { Game, Seat } from '../shared/types';
import late from './fixtures/late-table.json' with { type: 'json' };
import { mkdirSync } from 'node:fs';

for (const [width,height] of [[915,412],[844,390],[640,360],[1280,590]]) {
 test(`整桌场景 ${width}：四家朝向、固定牌池、牌槽和箭头`,async({page})=>{
  await page.setViewportSize({width,height});
  const v=viewFor(structuredClone(late) as unknown as Game,0);
  v.phase='playing';v.result=undefined;v.actions=[];v.selfKongs=[];v.canDiscard=true;
  v.players.forEach((p,i)=>{if(p){p.melds=[];p.hand=[];p.handCount=13;p.flowers=[124+i,128+i];p.discards=Array.from({length:5},(_,j)=>i*28+j);}});
  v.players[0]!.hand=[0,4,8,16,24,32,36,48,56,72,76,80,108,112];
  v.lastDraw=112;v.lastDiscard=undefined;
  let socket:WebSocketRoute;
  const push=()=>socket.send(JSON.stringify({type:'state',state:v,serverNow:Date.now()}));
  await page.routeWebSocket('**/ws',ws=>{socket=ws;ws.connectToServer().onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:v.code}));push();}else ws.send(raw);});});
  await page.goto('/');await expect(page.locator('#table-board')).toBeVisible();await page.waitForTimeout(150);
  const collisions=()=>page.locator('#table-board').evaluate(el=>{
   const nodes=[...el.querySelectorAll('.surface-tile:not(.stacked-kong),.standing-back,.hand .tile,.flower-rack .tile,.table-hud,.game-actions > button,.opponent-info,.my-info > div:first-child')];
   return nodes.flatMap((a,i)=>nodes.slice(i+1).filter(b=>{
    if(a.contains(b)||b.contains(a))return false;
    const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
    return Math.min(x.right,y.right)-Math.max(x.left,y.left)>1 && Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1;
   }).map(b=>({a:a.className,ap:a.parentElement!.className,seat:a.closest(".discards")?.className,index:[...(a.parentElement?.parentElement?.children??[])].indexOf(a.parentElement!),placement:el.querySelector(".discard-field")?.getAttribute("data-placement"),b:b.className,bp:b.parentElement!.className,otherSeat:b.closest(".discards")?.className,x:a.getBoundingClientRect().toJSON(),y:b.getBoundingClientRect().toJSON()})));
  });
  expect(await collisions()).toEqual([]);
  const size=(await page.locator('.discards-0 .surface-tile').first().boundingBox())!;
  expect(size.height).toBeGreaterThan(25);
  // Stable dimensions across platform flags and all valid-length growth states.
  for(const platform of ['standard','android']){
   await page.evaluate(p=>{document.documentElement.dataset.tablePlatform=p;},platform);
   const r=(await page.locator('.discards-0 .surface-tile').first().boundingBox())!;
   expect(r.width).toEqual(size.width);expect(r.height).toEqual(size.height);
  }
  for(const count of [8,9,16,17,20]){
   v.players.forEach((p,i)=>{if(p)p.discards=Array.from({length:count},(_,j)=>i*28+j);});
   v.revision++;push();await page.waitForTimeout(100);
   const r=(await page.locator('.discards-0 .surface-tile').first().boundingBox())!;
   expect(r.width).toEqual(size.width);expect(r.height).toEqual(size.height);
   expect(await collisions()).toEqual([]);
  }
  // Four kong sets take 12 surface slots, with the fourth tile above its own set.
  v.players.forEach((p,i)=>{if(p){p.discards=p.discards.slice(0,8);p.flowers=Array.from({length:5},(_,j)=>124+i*5+j);if(i){p.handCount=2;p.melds=Array.from({length:4},(_,n)=>({type:'kong',tiles:[n*4,n*4+1,n*4+2,n*4+3],from:0,concealed:false}));}}});
  v.actions=['pung','kong','hu','pass'];v.revision++;push();await page.waitForTimeout(1200);
  expect(await collisions()).toEqual([]);
  const tops=await page.locator('.game-actions > button').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));expect(Math.max(...tops)-Math.min(...tops)).toBeLessThan(1);
  mkdirSync('test-results/screenshots',{recursive:true});await page.screenshot({path:`test-results/screenshots/scene-dense-${width}.png`});
  v.actions=[];
  for(const flowerSeat of [0,1,2,3]){
   v.players.forEach((p,i)=>{if(p)p.flowers=i===flowerSeat?Array.from({length:20},(_,j)=>124+j):[];});
   v.revision++;push();await page.waitForTimeout(100);expect(await collisions()).toEqual([]);
  }
  // Source arrows name the supplier; latest-discard pointers stay world-down.
  v.players.forEach((p,i)=>{if(p){p.flowers=[124+i];p.melds=i?[{type:'pung',tiles:[4,5,6],from:0,concealed:false}]:[];p.handCount=10;p.discards=Array.from({length:9},(_,j)=>i*28+j);}});
  for(const seat of [0,1,2,3] as Seat[]){
   const tile=v.players[seat]!.discards.at(-1)!;v.lastDiscard={seat,tile};v.revision++;push();
   const arrow=page.locator('.last-discard-arrow');await expect(arrow).toHaveAttribute('data-direction','down');await expect(arrow).toHaveAttribute('aria-label',new RegExp(v.players[seat]!.name));
   await expect(arrow.locator('img')).toHaveJSProperty('complete',true);
   await page.waitForTimeout(100);expect(await collisions()).toEqual([]);
   await page.screenshot({path:`test-results/screenshots/scene-discard-${width}-${seat}.png`});
  }
  await expect(page.locator('.seat-tiles-right .meld-source-arrow')).toHaveAttribute('data-direction','down');
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.floating-discard-pointer img').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 });
}
