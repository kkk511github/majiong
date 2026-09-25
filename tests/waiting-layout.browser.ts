import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGame,newPlayer,viewFor} from '../shared/engine';
import {DEFAULT_TABLE_SETTINGS} from '../shared/table-settings';
import {LEGAL_VERSION,LEGAL_STORAGE_KEY} from '../src/legal-copy';

for(const [width,height] of [[1280,590],[844,390],[640,280],[568,256]])test(`waiting room keeps heading, four seats and footer separate at ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});
 const account={id:'waiting-compat',username:'waiting-compat',name:'激情岁月',role:'member',canPlay:true,mustChangePassword:false};
 const game=createGame('845401','waiting-compat',{rounds:8});game.players[2]=newPlayer('other','浮萍');game.players[3]=newPlayer(account.id,account.name);game.players[3]!.ready=true;
 game.table={creatorId:'host',groupId:'fixture',number:1,createdAt:Date.now(),settings:{...DEFAULT_TABLE_SETTINGS,name:'50进园子'}};const state=viewFor(game,3);
 await page.addInitScript(({key,version})=>{localStorage.setItem(key,JSON.stringify({version}));localStorage.setItem('jinling:token',JSON.stringify('local-fixture'));},{key:LEGAL_STORAGE_KEY,version:LEGAL_VERSION});
 await page.route('**/api/**',route=>route.fulfill({json:{account}}));
 await page.routeWebSocket('**/ws',ws=>ws.onMessage(raw=>{if(JSON.parse(String(raw)).type==='hello'){ws.send(JSON.stringify({type:'session',id:account.id,name:account.name,account,token:'local-fixture',roomCode:state.code,tableLobby:true,tableInvites:true}));ws.send(JSON.stringify({type:'state',state,serverNow:Date.now()}));}}));
 await page.goto('/');await expect(page.locator('.waiting-room')).toBeVisible();
 const bounds=await page.evaluate(()=>{
  const r=(selector:string)=>{const b=document.querySelector(selector)!.getBoundingClientRect();return{top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height};};
  return{header:r('.waiting-room .page-heading'),code:r('.waiting-room .room-code'),seats:r('.waiting-seats'),footer:r('.waiting-footer'),room:r('.waiting-room'),cards:Array.from(document.querySelectorAll('.waiting-seat')).map(e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom};})};
 });
 expect(bounds.header.bottom+3).toBeLessThanOrEqual(bounds.seats.top);expect(bounds.code.bottom+3).toBeLessThanOrEqual(bounds.seats.top);expect(bounds.seats.bottom+3).toBeLessThanOrEqual(bounds.footer.top);
 for(let i=1;i<4;i++)expect(bounds.cards[i].left-bounds.cards[i-1].right).toBeGreaterThan(3);
 for(const card of bounds.cards){expect(card.top).toBeGreaterThanOrEqual(bounds.seats.top);expect(card.bottom).toBeLessThanOrEqual(bounds.seats.bottom);}
 const ready=page.getByRole('button',{name:'已准备，还差 2 位'});await ready.scrollIntoViewIfNeeded();await expect(ready).toBeVisible();
 const button=await ready.boundingBox();expect(button!.y+button!.height).toBeLessThanOrEqual(height);
 await page.locator('.waiting-room').evaluate(e=>{e.scrollTop=0;});
 mkdirSync('output/waiting-layout-compat',{recursive:true});
 await page.screenshot({path:`output/waiting-layout-compat/after-${width}.png`});
 if(width===640){
  const html=await page.evaluate(()=>{const css=Array.from(document.styleSheets).map(s=>Array.from(s.cssRules).map(r=>r.cssText).join('\n')).join('\n');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>'+css+'</style></head><body>'+document.querySelector('#root')!.outerHTML+'</body></html>';});
  writeFileSync('output/waiting-layout-compat/current-waiting.html',html);
 }
});
