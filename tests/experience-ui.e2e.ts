import {test,expect,openTableMenu,type WebSocketRoute} from './browser-fixtures';
import {viewFor} from '../shared/engine';
import type {Game} from '../shared/types';
import late from './fixtures/late-table.json' with {type:'json'};
import {mkdirSync} from 'node:fs';
const artifact='output/table-experience-20260919/after';
const tableFrame=(page:any)=>page.frames().find((f:any)=>f.url().includes('/cocos-table/index.html'));

for(const input of ['direct-drag','rapid-double-tap'] as const) {
 test(`真实App ${input}一次出牌，首击不等待父页面选牌回传`,async({page})=>{
  await page.setViewportSize({width:844,height:390});
  const v=viewFor(structuredClone(late) as unknown as Game,0);
  Object.assign(v,{phase:'playing',turn:0,canDiscard:true,actions:[],selfKongs:[],pending:undefined,result:undefined,lastDraw:8,deadline:Date.now()+600000});
  Object.assign(v.players[0]!,{hand:[0,1,4,5,8,92,96,100],handCount:8,trustee:false,trusteeLocked:false,
   melds:[{type:'pung',tiles:[64,65,66],from:1,concealed:false},{type:'pung',tiles:[24,25,26],from:1,concealed:false}],flowers:[]});
  let socket:WebSocketRoute;const commands:any[]=[];
  await page.routeWebSocket('**/ws',ws=>{
   socket=ws;const server=ws.connectToServer();
   ws.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='action')commands.push(m);else server.send(raw);});
   server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:v.code}));ws.send(JSON.stringify({type:'state',state:v}));}else ws.send(raw);});
  });
  await page.goto('/');
  await expect.poll(async()=>tableFrame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
  await expect.poll(async()=>tableFrame(page)?.evaluate(async()=>{const cc=await (window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state.key;})).not.toBe('demo');
  await expect.poll(async()=>tableFrame(page)?.evaluate(async()=>{const cc=await (window as any).System.import('cc'),s=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state;return s.connected&&s.canDiscard&&!s.disabled;})).toBe(true);
  const getTile=()=>tableFrame(page)!.evaluate(()=> (window as any).__JINLING_TABLE_LAYOUT__.find((t:any)=>t.area==='hand'&&t.tile===8));
  await tableFrame(page)!.evaluate(async()=>{
    const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
    (window as any).__gestureEvents=[];
    const emit=c.emit.bind(c);c.emit=(command:any)=>{(window as any).__gestureEvents.push({command,at:performance.now(),key:c.state.key,canDiscard:c.state.canDiscard});emit(command);};
  });
  const tile=await getTile(),box=(await page.locator('#cocos-table-board iframe').boundingBox())!;
  const scale=Math.min(box.width/1280,box.height/590);
  const x=box.x+(box.width-1280*scale)/2+tile.x*scale,y=box.y+(box.height-590*scale)/2+tile.y*scale;
  mkdirSync(artifact,{recursive:true});
  await page.screenshot({path:`${artifact}/${input}-start.png`});
  if(input==='direct-drag'){
   await page.mouse.move(x,y);await page.mouse.down();
   await page.mouse.move(x-65*scale,y-80*scale,{steps:12});
   const moved=await tableFrame(page)!.evaluate(async()=>{const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return {selected:c.state.selected,nodeY:c.nodes.get(c.handTouch.id).position.y};});
   expect(moved.selected).toBeNull();
   expect(moved.nodeY).toBeCloseTo(295-tile.y+80,0);
   await page.screenshot({path:`${artifact}/direct-drag-moving.png`});
   await page.mouse.up();
  }else{
   // Simulate an arbitrarily delayed selection response from the parent app.
   await tableFrame(page)!.evaluate(async()=>{const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');window.removeEventListener('message',c.onMessage);});
   await page.mouse.dblclick(x,y,{delay:45});
  }
  try { await expect.poll(()=>commands.length).toBe(1); }
  catch(error){console.log(await tableFrame(page)!.evaluate(async()=>{const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return {events:(window as any).__gestureEvents,tap:c.lastHandTap,touch:c.handTouch};}));throw error;}
  expect(commands[0].action).toEqual({type:'discard',tile:8});
  await page.waitForTimeout(150);
  expect(commands).toHaveLength(1);
  // A second discard while the server has not confirmed the first is blocked.
  await page.mouse.dblclick(x,y,{delay:45});
  expect(commands).toHaveLength(1);
 });
}

test('大厅去掉练习入口；正式体验桌三机器人开局并由管理员收桌',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 await page.goto('/');
 await expect(page.getByRole('button',{name:'我的',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/练习/})).toHaveCount(0);
 await page.evaluate(async()=>{
  const {client}=await import('/src/game-client.ts' as string);
  client.createTables('金陵牌友',{name:'南京好友桌',readyMode:'auto',autoRenew:true,continuousRounds:true,overtimeSeconds:90},{rounds:8,turnSeconds:10},1);
 });
 await expect.poll(()=>page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);return client.snapshot().createdTables?.length;})).toBe(1);
 const source=await page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);const code=client.snapshot().createdTables![0];client.send({type:'createExperienceTable',sourceCode:code});return code;});
 await expect.poll(()=>page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);return client.snapshot().createdTables?.[0];})).not.toBe(source);
 const code=await page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);return client.snapshot().createdTables![0];});
 await expect(page.getByText(code!,{exact:true}).first()).toBeVisible();
 mkdirSync(artifact,{recursive:true});
 await page.screenshot({path:`${artifact}/home-experience.png`});
 await page.evaluate(async(code)=>{const {client}=await import('/src/game-client.ts' as string);client.joinTable('金陵牌友',code!,0);},code);
 await expect(page.locator('#cocos-table-board')).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);return client.snapshot().view?.players.filter((p:any)=>p?.bot).length;})).toBe(3);
 await openTableMenu(page,'leave');
 await expect(page.getByRole('button',{name:'管理员解散',exact:true})).toBeVisible();
 await page.screenshot({path:`${artifact}/admin-dissolve.png`});
 await page.getByRole('button',{name:'管理员解散',exact:true}).click();
 await expect(page.locator('#cocos-table-board')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'我的',exact:true})).toBeVisible();
});
