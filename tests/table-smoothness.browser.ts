import {test,expect,type Page} from '@playwright/test';
import {busyTableFixture} from './previews/table-full-meld-fixture';
import {referenceSnapshot} from './previews/table-reference-layout';
import type {TableSceneState} from '../shared/table-scene';

async function setup(page:Page,state:TableSceneState){
  await page.route('**/__smoothness.html',route=>route.fulfill({contentType:'text/html',body:'<style>html,body{margin:0;width:100%;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe src="/cocos-table/index.html?channel=smoothness"></iframe>'}));
  await page.goto('/__smoothness.html');
  const frame=page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
  await frame.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__,{},{timeout:45000});
  await page.evaluate(state=>{
    const w=window as any;w.commands=[];w.sceneState=state;
    w.sendState=()=>document.querySelector('iframe')!.contentWindow!.postMessage({scope:'jinling-table-v1',channel:'smoothness',type:'state',state:w.sceneState},location.origin);
    window.addEventListener('message',event=>{
      if(event.data?.channel!=='smoothness'||event.data.type!=='command')return;
      w.commands.push(event.data.command);
      if(event.data.command.type==='select'){
        w.sceneState={...w.sceneState,selected:event.data.command.tile};setTimeout(()=>w.sendState(),w.echoDelay??0);
      }
    });w.sendState();
  },{...state,tableStyle:'reference-3d',disabled:false,connected:true,canDiscard:true,turn:state.me});
  await expect.poll(()=>frame.evaluate(()=>(window as any).__JINLING_TABLE_3D__?.enabled)).toBe(true);
  await frame.evaluate(async()=>{const cc=await(window as any).System.import('cc');(window as any).c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');(window as any).modelRoot=cc.director.getScene().getChildByName('Table 3D models');});
  return frame;
}

test('密集牌桌连续选牌：静态模型复用而不是整桌重建',async({page},info)=>{
  const frame=await setup(page,busyTableFixture());
  const result=await frame.evaluate(async()=>{
    const w=window as any,c=w.c,root=w.modelRoot;
    const before=new Set(root.children),times:number[]=[];
    for(let i=0;i<12;i++){
      c.state={...c.state,selected:c.state.players[0].hand[i%13]};
      const t=performance.now();c.draw();times.push(performance.now()-t);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    }
    const sorted=times.slice().sort((a,b)=>a-b);
    return {models:before.size,retained:root.children.filter((n:any)=>before.has(n)).length,medianMs:sorted[6],maxMs:sorted[11],times};
  });
  await info.attach('selection-render-cost',{body:JSON.stringify(result),contentType:'application/json'});
  console.log('selection-render-cost',JSON.stringify(result));
  expect(result.models).toBeGreaterThan(100);
  expect(result.retained).toBe(result.models);
});

test('首击选牌确认落在第二次按住期间，仍只出一张；滑动确认前不跳回',async({page})=>{
  const s=referenceSnapshot();
  const frame=await setup(page,s);
  const tile=s.players[0].hand[0],id=`hand-${tile}`;
  const read=()=>frame.evaluate(id=>{const c=(window as any).c,n=c.nodes.get(id);return {x:n.position.x+640,y:295-n.position.y,held:c.releasedTile?.tile,touch:!!c.handTouch};},id);
  const b=(await page.locator('iframe').boundingBox())!,scale=Math.min(b.width/1280,b.height/590);
  const xy=(p:{x:number;y:number})=>({x:b.x+(b.width-1280*scale)/2+p.x*scale,y:b.y+(b.height-590*scale)/2+p.y*scale});
  await page.evaluate(()=>(window as any).echoDelay=150);
  let p=xy(await read());await page.mouse.click(p.x,p.y);
  await page.mouse.move(p.x,p.y);await page.mouse.down();
  await expect.poll(()=>frame.evaluate(()=>(window as any).c.state.selected)).toBe(tile);
  await page.mouse.up();
  await expect.poll(async()=>(await read()).held).toBe(tile);
  await expect.poll(()=>page.evaluate(()=>(window as any).commands.filter((c:any)=>c.type==='discard'))).toEqual([{type:'discard',tile}]);
  // Reset via an authoritative new room before exercising a drag.
  await page.evaluate(()=>{const w=window as any;w.commands=[];w.sceneState={...w.sceneState,key:'drag-performance',selected:null};w.sendState();});
  await expect.poll(()=>frame.evaluate(()=>(window as any).c.state.key)).toBe('drag-performance');
  await expect.poll(async()=>(await read()).held).toBeUndefined();
  p=xy(await read());await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.mouse.move(p.x+40*scale,p.y-95*scale,{steps:12});
  await page.waitForTimeout(40);const released=await read();await page.mouse.up();
  await expect.poll(async()=>(await read()).held).toBe(tile);
  await page.waitForTimeout(250);const held=await read();
  expect(Math.hypot(held.x-released.x,held.y-released.y)).toBeLessThan(.3);
  await expect.poll(()=>page.evaluate(()=>(window as any).commands.filter((c:any)=>c.type==='discard'))).toEqual([{type:'discard',tile}]);
  await page.evaluate(tile=>{const w=window as any;w.sceneState={...w.sceneState,revision:w.sceneState.revision+1,canDiscard:false,turn:1,lastDiscard:{seat:0,tile},players:w.sceneState.players.map((p:any)=>p.seat===0?{...p,hand:p.hand.filter((t:number)=>t!==tile),handCount:p.handCount-1,discards:[...p.discards,tile]}:p)};w.sendState();},tile);
  await expect.poll(()=>frame.evaluate(tile=>{const c=(window as any).c;return c.tileLayout.has(`river-${tile}`)&&!c.tileFlights.has(`river-${tile}`);},tile)).toBe(true);
});

test('短拖回位、慢速第二次点击出牌、重复点击不重复发送',async({page})=>{
  const state=referenceSnapshot();state.players[0].hand=[0,4,8,12,16,20,24,28,32,36,40,44,52];state.players[0].handCount=13;
  const frame=await setup(page,state);
  const card=()=>frame.evaluate(()=>{const c=(window as any).c,t=c.tileLayout.get('hand-0'),n=c.nodes.get('hand-0');return {x:n.position.x+640,y:295-n.position.y,error:Math.hypot(n.position.x+640-t.x,295-n.position.y-t.y),held:c.releasedTile?.tile};});
  const b=(await page.locator('iframe').boundingBox())!,scale=Math.min(b.width/1280,b.height/590);
  const xy=(p:{x:number;y:number})=>({x:b.x+(b.width-1280*scale)/2+p.x*scale,y:b.y+(b.height-590*scale)/2+p.y*scale});
  let p=xy(await card());
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+15*scale,p.y-25*scale,{steps:5});await page.mouse.up();
  await expect.poll(async()=>(await card()).error).toBeLessThan(.3);
  expect(await page.evaluate(()=>(window as any).commands.filter((c:any)=>c.type==='discard'))).toEqual([]);
  p=xy(await card());await page.mouse.click(p.x,p.y);
  await expect.poll(()=>frame.evaluate(()=>(window as any).c.state.selected)).toBe(0);
  await page.waitForTimeout(500);
  p=xy(await card());await page.mouse.click(p.x,p.y);
  await expect.poll(async()=>(await card()).held).toBe(0);
  await page.mouse.click(p.x,p.y);await page.mouse.click(p.x,p.y);
  expect(await page.evaluate(()=>(window as any).commands.filter((c:any)=>c.type==='discard'))).toEqual([{type:'discard',tile:0}]);
  await page.evaluate(()=>{const w=window as any;w.sceneState={...w.sceneState,disabled:true};w.sendState();});
  await expect.poll(()=>frame.evaluate(()=>(window as any).c.state.disabled)).toBe(true);
  await page.evaluate(()=>{const w=window as any;w.sceneState={...w.sceneState,disabled:false};w.sendState();});
  await expect.poll(async()=>(await card()).held).toBeUndefined();
  await expect.poll(async()=>(await card()).error).toBeLessThan(.3);
});
