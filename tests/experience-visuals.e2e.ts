import {test,expect} from './browser-fixtures';
import {act,createGame,newPlayer,startRound,trusteeAction,viewFor} from '../shared/engine';
import {normalizeTableSettings} from '../shared/table-settings';
import {mkdirSync,writeFileSync} from 'node:fs';
const target=process.env.EXPERIENCE_PICTURES ?? 'output/table-experience-20260919/after';
const shot=async(page:any,name:string)=>{mkdirSync(target,{recursive:true});await page.screenshot({path:`${target}/${name}.png`});};
test('前后对比：摸牌位置、碰牌间隔和直接拖牌',async({page})=>{
 await page.setViewportSize({width:1280,height:590});
 await page.goto('/cocos-table/index.html');
 await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__);
 await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),s=c.demo();
  s.practice=false;s.phase='playing';s.turn=0;s.canDiscard=true;s.actions=[];s.effects=[];s.selected=null;s.pending=undefined;
  s.players[0].melds=[{type:'pung',tiles:[108,109,110],from:1,concealed:false}];
  s.players[0].hand=s.players[0].hand.slice(0,11);s.players[0].handCount=11;s.drawn=undefined;
  c.state=s;c.draw();
 });
 await shot(page,'layout-before-draw');
 await page.evaluate(async()=>{const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');c.state.players[1].handCount++;c.state.players[2].handCount++;c.draw();});
 await shot(page,'layout-with-draw');
 const t=await page.evaluate(()=>(window as any).__JINLING_TABLE_LAYOUT__.find((t:any)=>t.area==='hand'&&t.seat===0));
 await page.mouse.move(t.x,t.y);await page.mouse.down();await page.mouse.move(t.x+25,t.y-105,{steps:14});
 await shot(page,'direct-drag');await page.mouse.up();
});
test('前后对比：会员解散入口',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 const g=createGame('123456','visual-member',{turnSeconds:30});
 g.players=[0,1,2,3].map(i=>({...newPlayer(String(i),['金陵牌友','秦淮','钟山','莫愁'][i]),ready:true}));
 g.table={creatorId:'0',groupId:'visual',number:6,createdAt:0,settings:{...normalizeTableSettings({}),allowDissolve:true}};
 const v=viewFor(startRound(g,Date.now(),()=>0.51),0);v.deadline=Date.now()+600000;v.events=[];
 await page.routeWebSocket('**/ws',ws=>{const server=ws.connectToServer();server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,account:{...m.account,role:'member'},roomCode:v.code}));ws.send(JSON.stringify({type:'state',state:v}));}else ws.send(raw);});});
 await page.goto('/');await expect(page.getByRole('button',{name:'大厅',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'大厅',exact:true}).click();await shot(page,'member-dissolve');
});
test('前后对比：原引擎托管执行一次动作后的实际盘面',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 let g=createGame('123456','visual-trustee',{turnSeconds:30});
 g.players=[0,1,2,3].map(i=>({...newPlayer(String(i),['金陵牌友','秦淮','钟山','莫愁'][i]),ready:true}));
 g=startRound(g,Date.now(),()=>0.51);g.turn=0;g.canSelfWin=true;g.pending=undefined;g.phase='playing';
 g.players[0]!.hand=[0,4,8,36,40,44,72,76,80,108,109,110,112,113];g.players[0]!.melds=[];g.players[0]!.trustee=true;g.lastDraw=113;
 const action=trusteeAction(g,0)!;g=act(g,0,action,Date.now());
 const v=viewFor(g,0);v.events=[];v.deadline=Date.now()+600000;
 mkdirSync(target,{recursive:true});writeFileSync(`${target}/trustee-action.json`,JSON.stringify({action,result:v.result},null,2));
 await page.routeWebSocket('**/ws',ws=>{const server=ws.connectToServer();server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:v.code}));ws.send(JSON.stringify({type:'state',state:v}));}else ws.send(raw);});});
 await page.goto('/');await expect(page.locator('#cocos-table-board')).toBeVisible();
 await expect.poll(async()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
 // Wait only for the actual result presentation to finish its entrance animation.
 await page.waitForTimeout(1800);await shot(page,'trustee-action');
});
test('前后对比：首页入口',async({page})=>{
 await page.setViewportSize({width:844,height:390});await page.goto('/');
 await expect(page.getByRole('button',{name:'我的',exact:true})).toBeVisible();await shot(page,'home');
});
