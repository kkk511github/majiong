import {test,expect} from '@playwright/test';
import {fullMeldFixture,busyTableFixture} from './previews/table-full-meld-fixture';
import {referenceSnapshot} from './previews/table-reference-layout';

test('older canvas without roundRect still initializes the production 3D table',async({page})=>{
 await page.addInitScript(()=>{delete (CanvasRenderingContext2D.prototype as any).roundRect;});
 await page.goto('/cocos-table/index.html');
 await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__,{},{timeout:30000});
 expect(await page.evaluate(()=>typeof CanvasRenderingContext2D.prototype.roundRect)).toBe('undefined');
 await expect.poll(()=>page.evaluate(()=>(window as any).__JINLING_TABLE_3D__?.meshTiles??0)).toBeGreaterThan(0);
});

test('3D claims, global-anchor tint, listening hints and real stack transforms are all visible',async({page})=>{
 await page.goto('/tests/previews/table-features.html?case=anchor');
 const frame=()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
 await expect.poll(async()=>frame()?.evaluate(()=>(window as any).__JINLING_TABLE_3D__?.enabled)).toBe(true);
 const anchors=()=>frame().evaluate(async()=>{const cc=await(window as any).System.import('cc'),root=cc.director.getScene().getChildByName('Table 3D models');return (window as any).__JINLING_TABLE_3D__.tiles.filter((t:any)=>t.globalAnchor).map((t:any)=>{const n=root.getChildByName(t.id).getChildByName('Physical tile').getChildByName('Face');return {id:t.id,visible:n.activeInHierarchy,color:n.getComponent(cc.MeshRenderer).sharedMaterials[0].getProperty('mainColor').toHEX('#rrggbb')};});});
 await expect.poll(anchors).toEqual([{id:'river-92',visible:true,color:'ffe16a'}]);
 await page.screenshot({path:'output/qa/global-anchor-3d.png'});
 await page.getByRole('button',{name:'换听，验证去黄'}).click();await expect.poll(anchors).toEqual([]);
 await page.getByLabel('显示场景').selectOption('listening');
 await expect(page.getByRole('region',{name:'胡牌提示'})).toBeVisible();
 await expect(page.getByRole('list',{name:'可胡牌'}).getByRole('listitem')).toHaveCount(1);
 await page.screenshot({path:'output/qa/listening-3d.png'});
 await page.getByLabel('显示场景').selectOption('claim');
 await expect.poll(()=>frame().evaluate(async()=>{const cc=await(window as any).System.import('cc'),s=cc.director.getScene(),c=s.getChildByName('Canvas').getComponent('TableScene'),root=s.getChildByName('Table 3D models');return {oldBoxes:c.marks.children.length,outlines:root.children.filter((n:any)=>n.getChildByName('Claim face outline')).length};})).toEqual({oldBoxes:0,outlines:1});
 await page.screenshot({path:'output/qa/claim-plane-outline-3d.png'});
 await page.getByLabel('显示场景').selectOption('highlight');
 await expect.poll(()=>frame().evaluate(async()=>{const cc=await(window as any).System.import('cc'),s=cc.director.getScene(),c=s.getChildByName('Canvas').getComponent('TableScene'),t=Array.from(c.tileLayout.values()).find((t:any)=>t.highlight) as any;return t?s.getChildByName('Table 3D models').getChildByName(t.id).getChildByName('Physical tile').getChildByName('Face').getComponent(cc.MeshRenderer).sharedMaterials[0].getProperty('mainColor').toHEX('#rrggbb'):null;})).toBe('fff7b1');
 for(const mode of ['concealed','added']){
  await page.getByLabel('显示场景').selectOption(mode);
  await expect.poll(()=>frame().evaluate(async()=>{const cc=await(window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state.key;})).toBe(`feature-${mode}-false`);
  await expect.poll(()=>frame().evaluate(()=>(window as any).__JINLING_TABLE_3D__.tiles.filter((t:any)=>t.stack).length)).toBe(1);
  await expect.poll(()=>frame().evaluate(async()=>{const cc=await(window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').tileFlights.size;})).toBe(0);
  await frame().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const stack=await frame().evaluate(async()=>{const cc=await(window as any).System.import('cc'),root=cc.director.getScene().getChildByName('Table 3D models'),t=(window as any).__JINLING_TABLE_3D__.tiles.find((t:any)=>t.stack),upper=root.getChildByName(t.id),base=root.getChildByName(t.id.replace(/-3$/,'-1'));return {upper:{x:upper.position.x,y:upper.position.y,z:upper.position.z},base:{x:base.position.x,y:base.position.y,z:base.position.z},thickness:t.thickness};});
  expect(stack.upper.x).toBeCloseTo(stack.base.x,6);expect(stack.upper.z).toBeCloseTo(stack.base.z,6);expect(stack.upper.y-stack.base.y).toBeCloseTo(stack.thickness,6);
  await page.screenshot({path:`output/qa/opposite-${mode}-contact.png`});
 }
});

test('two-round local demo runs opening, both rounds and final settlement',async({page})=>{
 await page.goto('/tests/previews/local-bots.html?rounds=2&testSeed=12&testSpeed=40');
 await expect(page.getByRole('heading',{name:'本地两把练习'})).toBeVisible();
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'准备并开始',exact:true}).click();
 await expect(page.getByRole('region',{name:'第1把开局',exact:true})).toBeVisible();
 await expect(page.locator('.opening-blue')).toHaveCount(1);
 await page.screenshot({path:'output/qa/two-round-opening.png'});
 await page.getByRole('button',{name:'进入牌局',exact:true}).click();
 await expect(page.getByRole('heading',{name:'第1把结算',exact:true})).toBeVisible({timeout:45000});
 await expect(page.getByRole('heading',{name:'本桌最终战绩',exact:true})).toBeVisible({timeout:45000});
 await page.getByRole('button',{name:'计分明细',exact:true}).click();
 await expect(page.locator('.score-details')).toBeVisible();
 await page.getByRole('button',{name:'返回牌面',exact:true}).click();
 await page.screenshot({path:'output/qa/two-round-final.png'});
 const game=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('jinling:isolated-local-bots-two-rounds-v2')!));
 expect(game.round).toBe(2);expect(game.history).toHaveLength(2);expect(game.phase).toBe('finished');
});

test('local table starts three real bots, responds to a human discard, and makes no game-server requests',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.url());});page.on('websocket',ws=>{if(new URL(ws.url()).pathname==='/ws')requests.push(ws.url());});
 await page.goto('/tests/previews/local-bots.html');
 const frame=()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
 const state=()=>frame()?.evaluate(async()=>{if(!(window as any).__JINLING_TABLE_READY__)return null;const cc=await(window as any).System.import('cc');return cc.director.getScene()?.getChildByName('Canvas')?.getComponent('TableScene')?.state;});
 await expect.poll(async()=>{const s=await state();return !!s?.canDiscard&&!s?.disabled;},{timeout:30000}).toBe(true);
 const start=await state();expect(start.practice).toBe(true);expect(start.players.filter((p:any)=>p.bot)).toHaveLength(3);expect(start.players.slice(1).every((p:any)=>p.hand.length===0)).toBe(true);
 await page.screenshot({path:'output/qa/local-bots-start.png'});
 const first=await frame().evaluate(()=>(window as any).__JINLING_TABLE_LAYOUT__.find((t:any)=>t.area==='hand'&&t.seat===0));
 await page.mouse.click(first.x,first.y);await expect.poll(async()=>(await state()).selected).toBe(first.tile);
 await page.mouse.click(first.x,first.y-18);
 await expect.poll(async()=>(await state()).players[0].hand.includes(first.tile)).toBe(false);
 await expect.poll(async()=>{const s=await state();return s.players.some((p:any)=>p.bot&&(p.discards.length||p.melds.length))||['ended','finished'].includes(s.phase);},{timeout:12000}).toBe(true);
 await page.getByRole('button',{name:'暂停',exact:true}).click();
 const revision=(await state()).revision;await page.waitForTimeout(1100);expect((await state()).revision).toBe(revision);
 expect(requests).toEqual([]);
});

test('shipped Cocos runtime renders approved layouts and retains real selection, discard and trustee commands',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')console.log('Cocos:',m.text());});
  await page.goto('/cocos-table/index.html');
  await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__,{},{timeout:45000});
  for(const [name,fixture]of [['reference',referenceSnapshot()],['full-pung',fullMeldFixture('pung')],['full-kong',fullMeldFixture('kong')],['busy',busyTableFixture()]] as const){
    await page.evaluate(async(state)=>{const cc=await(window as any).System.import('cc');const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');c.state={...state,tableStyle:'reference-3d',externalControls:false};c.skipNextTransition=true;c.draw();},fixture);
    await expect.poll(()=>page.evaluate(()=>(window as any).__JINLING_TABLE_3D__?.enabled)).toBe(true);
    await page.screenshot({path:`output/qa/production-3d-${name}.png`});
    const result=await page.evaluate(async()=>{const cc=await(window as any).System.import('cc');const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return {meshes:(window as any).__JINLING_TABLE_3D__.meshTiles,flowers:c.hud.children.filter((n:any)=>n.name.startsWith('player-flower-count-')&&!n.name.includes('box')).map((n:any)=>n.getComponent(cc.Label)?.string),own:[...c.tileLayout.values()].filter((t:any)=>t.area==='hand'&&t.seat===c.state.me).map((t:any)=>({id:t.id,active:c.nodes.get(t.id).active})),toolbar:c.trusteeButton?.position.x+640};});
    expect(result.meshes).toBeGreaterThan(20);expect(result.flowers).toHaveLength(4);expect(result.own.every((t:any)=>t.active)).toBe(true);expect(result.toolbar).toBe(1230);
  }
  const playing=referenceSnapshot();playing.disabled=false;playing.canDiscard=true;playing.turn=0;
  await page.evaluate(async(state)=>{const cc=await(window as any).System.import('cc');const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');c.state={...state,tableStyle:'reference-3d',externalControls:false};c.skipNextTransition=true;c.draw();(window as any).testCommands=[];c.emit=(command:any)=>{(window as any).testCommands.push(command);if(command.type==='select'){c.state={...c.state,selected:command.tile,revision:c.state.revision+1};c.draw();}};},playing);
  const hand=await page.evaluate(()=>(window as any).__JINLING_TABLE_LAYOUT__.find((t:any)=>t.area==='hand'&&t.seat===0));
  await page.mouse.click(hand.x,hand.y);
  await expect.poll(()=>page.evaluate(()=>(window as any).testCommands[0]?.type)).toBe('select');
  const selected=await page.evaluate((id)=>(window as any).__JINLING_TABLE_LAYOUT__.find((t:any)=>t.id===id),hand.id);
  expect(selected.y).toBeLessThan(hand.y);await page.mouse.click(selected.x,selected.y);
  await expect.poll(()=>page.evaluate(()=>(window as any).testCommands.some((c:any)=>c.type==='discard'))).toBe(true);
  expect(errors).toEqual([]);
});

test('a retained drawn tile lifts, inserts into its sorted slot and settles; a discarded draw never inserts',async({page})=>{
 await page.goto('/cocos-table/index.html');await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__);
 const fixture=referenceSnapshot();fixture.key='insertion-proof';fixture.tableStyle='reference-3d';fixture.disabled=false;fixture.canDiscard=true;fixture.turn=0;fixture.drawn=9;
 fixture.players[0].hand=[0,4,8,9,12,16,20,24,28,32,36,40,44,52];fixture.players[0].handCount=14;fixture.players[0].discards=[];
 const baseline=async()=>page.evaluate(async state=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');c.state=structuredClone(state);c.skipNextTransition=true;c.motionScale=1.8;c.draw();},fixture);
 await baseline();
 const discard=async(tile:number)=>page.evaluate(async tile=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');c.state.players[0].hand=c.state.players[0].hand.filter((t:number)=>t!==tile);c.state.players[0].handCount--;c.state.players[0].discards.push(tile);c.state.drawn=undefined;c.state.canDiscard=false;c.state.turn=1;c.state.revision++;c.draw();},tile);
 await discard(0);
 const read=()=>page.evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),n=c.nodes.get('hand-9'),target=c.tileLayout.get('hand-9'),flight=c.tileFlights.get('hand-9');return {kind:flight?.kind,x:n?.position.x+640,y:295-n?.position.y,target,layer:n?.layer};});
 expect((await read()).kind).toBe('insert');
 await expect.poll(async()=>(await read()).y).toBeLessThan(505);
 await page.screenshot({path:'output/qa/hand-insertion-raised.png'});
 await expect.poll(async()=>(await read()).kind).toBeUndefined();
 const landed=await read();expect(landed.x).toBeCloseTo(landed.target.x);expect(landed.y).toBeCloseTo(landed.target.y);
 await baseline();await discard(9);
 const inserts=await page.evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return Array.from(c.tileFlights.values()).filter((f:any)=>f.kind==='insert').length;});
 expect(inserts).toBe(0);
});
