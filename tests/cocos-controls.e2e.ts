import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('取消托管单击生效，按下和抬起之间更新倒计时也不丢点击', async ({page})=>{
 await page.setViewportSize({width:1280,height:590});
 await page.goto('/cocos-table/index.html');
 await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__);
 await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc');
  const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  c.state.players[0].trustee=true;c.draw();
  (window as any).commands=[];
  const emit=c.emit.bind(c);c.emit=(command:any)=>{(window as any).commands.push(command);emit(command);};
 });
 const trusteePoint=await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc');
  const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  return {x:c.trusteeButton.position.x+640,y:295-c.trusteeButton.position.y};
 });
 await page.mouse.move(trusteePoint.x,trusteePoint.y);await page.mouse.down();
 await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc');
  const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  (window as any).pressedButton=c.trusteeButton;
  for(const time of ['09','08','07']){c.state.countdown=time;c.draw();}
 });
 await page.waitForTimeout(80); // Let Cocos process deferred HUD destruction.
 await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window as any).commands)).toEqual([{type:'trustee',enabled:false}]);
 const result=await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  return {same:c.trusteeButton===(window as any).pressedButton,trustee:c.state.players[0].trustee,label:c.trusteeLabel.string};
 });
 expect(result).toEqual({same:true,trustee:false,label:'托管'});
});

test('独立牌桌只保留托管和设置，结算仍复用托管入口',async({page})=>{
 await page.setViewportSize({width:1280,height:590});
 await page.goto('/cocos-table/index.html');
 await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__);
 const toolbar=await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc');
  const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  c.state.presentation=undefined;c.state.externalControls=false;c.state.phase='playing';
  c.state.actions=[];c.state.trusteeDisabled=false;c.state.players[c.state.me].trustee=false;
  c.hudKey='';c.draw();
  (window as any).toolbarCommands=[];
  const emit=c.emit.bind(c);c.emit=(command:any)=>{(window as any).toolbarCommands.push(command);emit(command);};
  const nodes=c.root.getComponentsInChildren(cc.UITransform).map((t:any)=>t.node);
  const buttons=nodes.filter((n:any)=>n.activeInHierarchy&&n.name.startsWith('table-tool-'));
  return {
   removed:nodes.filter((n:any)=>['button-‹ 大厅','button-牌','button-录','button-⚙'].includes(n.name)).map((n:any)=>n.name),
   buttons:buttons.map((n:any)=>({name:n.name,x:n.position.x+640,y:295-n.position.y,w:n.getComponent(cc.UITransform).width,h:n.getComponent(cc.UITransform).height})),
  };
 });
 expect(toolbar.removed).toEqual([]);
 expect(toolbar.buttons.map((button:any)=>button.name).sort()).toEqual(['table-tool-settings','table-tool-trustee']);
 for(const button of toolbar.buttons){expect(button.w).toBeGreaterThanOrEqual(44);expect(button.h).toBeGreaterThanOrEqual(44);}
 const settings=toolbar.buttons.find((button:any)=>button.name==='table-tool-settings')!;
 const trustee=toolbar.buttons.find((button:any)=>button.name==='table-tool-trustee')!;
 await page.mouse.click(settings.x,settings.y);
 await page.mouse.click(trustee.x,trustee.y);
 await expect.poll(()=>page.evaluate(()=>(window as any).toolbarCommands)).toEqual([{type:'menu',menu:'settings'},{type:'trustee',enabled:true}]);
 await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc');
  const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  c.state.phase='ended';c.state.trusteeDisabled=true;c.draw();
 });
 await page.mouse.click(trustee.x,trustee.y);
 await expect.poll(()=>page.evaluate(()=>(window as any).toolbarCommands)).toEqual([
  {type:'menu',menu:'settings'},{type:'trustee',enabled:true},{type:'menu',menu:'result'},
 ]);
});

for (const [width,height] of [[568,320],[844,390],[1280,590]]) {
 test(`碰杠胡响应时余牌、余花和把数保持可见且不挡牌 ${width}`, async ({page})=>{
  await page.setViewportSize({width,height});
  await page.goto('/cocos-table/index.html');
  await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__);
  const draw=async(action:string,answered=false,dense=false)=>page.evaluate(async({action,answered,dense})=>{
   const cc=await (window as any).System.import('cc');
   const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),s=c.demo();
   s.phase=action?'claiming':'playing';s.remaining=42;s.round=4;s.rounds=8;s.countdown='06';
   s.actions=action?[{id:action==='robKong'?'hu':action,label:action==='pung'?'碰':action==='kong'?'杠':'胡'},{id:'pass',label:'过'}]:[];
   s.pending=action?{tile:56,from:2,kind:action==='robKong'?'robKong':'discard',answered}:undefined;
   s.effects=[];s.players.forEach((p:any,i:number)=>{
    p.flowers=Array.from({length:2},(_,j)=>124+i*2+j);
    p.discards=dense?Array.from({length:27},(_,j)=>i*32+j):p.discards;
   });
   if(!dense)s.players[2].discards.push(56);
   s.lastDiscard={tile:s.players[2].discards.at(-1),seat:2};
   c.state=s;c.draw();
   const bounds=(n:any)=>{const u=n.getComponent(cc.UITransform);return {x:n.position.x+640,y:295-n.position.y,w:u.width,h:u.height};};
   const counters=['table-remaining-count','table-flowers-count','table-round-label','table-round-count'].map(name=>{
    const n=c.hud.getChildByName(name);
    return n?{name,text:n.getComponent(cc.Label).string,visible:n.activeInHierarchy,...bounds(n)}:null;
   });
   const prompt=c.hud.getChildByName('claim-prompt');
   const center=c.hud.getChildByName('center');
   const compass=center?.getChildByName('compass');
   return {compass:compass?{visible:compass.activeInHierarchy,...bounds(compass)}:null,counters,prompt:prompt?bounds(prompt):null,tiles:(window as any).__JINLING_TABLE_LAYOUT__};
  },{action,answered,dense});
  const initial=await draw('');
  const expected=['余牌 42','余花 12','把数','4 / 8'];
  for(const action of ['pung','kong','hu','robKong']) {
   const result=await draw(action);
   expect(result.counters.map((c:any)=>c?.text)).toEqual(expected);
   expect(result.counters.every((c:any)=>c.visible)).toBe(true);
   expect(result.prompt).not.toBeNull();
   expect(result.compass?.visible).toBe(true);
   const separated=(a:any,b:any)=>Math.abs(a.x-b.x)>=(a.w+b.w)/2 || Math.abs(a.y-b.y)>=(a.h+b.h)/2;
   expect(separated(result.compass,result.prompt),'compass overlaps claim prompt').toBe(true);
   expect(result.tiles.every((tile:any)=>separated(result.prompt,tile)),'claim prompt overlaps tile').toBe(true);
   for(const counter of result.counters) {
    expect(separated(counter,result.prompt),`${action}: counter overlaps prompt`).toBe(true);
    expect(result.tiles.every((tile:any)=>separated(counter,tile)),`${action}: counter overlaps a table tile`).toBe(true);
   }
   // A claim may highlight a discard, but it must not move the physical cards.
   const positions=(tiles:any[])=>tiles.map(({id,x,y,w,h})=>({id,x,y,w,h}));
   expect(positions(result.tiles)).toEqual(positions(initial.tiles));
   if(action==='pung') {
    mkdirSync('test-results/screenshots',{recursive:true});
    await page.screenshot({path:`test-results/screenshots/claim-counters-${width}-${test.info().project.name}.png`});
   }
   const answered=await draw(action,true,true);
   expect(answered.counters.map((c:any)=>c?.text)).toEqual(expected);
   expect(answered.prompt).toBeNull();
   const dense=await draw(action,false,true);
   expect(dense.compass?.visible).toBe(true);
   expect(dense.tiles.every((tile:any)=>separated(dense.compass,tile)),'dense river overlaps fixed compass').toBe(true);
   expect(dense.tiles.every((tile:any)=>separated(dense.prompt,tile)),'claim prompt overlaps dense river').toBe(true);
   for(const counter of dense.counters)
    expect(dense.tiles.every((tile:any)=>separated(counter,tile)),`${action}: dense river overlaps counter`).toBe(true);
  }
 });
}
