import { test, expect, type Page, type WebSocketRoute } from './browser-fixtures';
import { viewFor } from '../shared/engine';
import { newGameRules } from '../shared/nanjing-rules';
import { mkdirSync } from 'node:fs';
import { layoutActions, layoutTable } from '../shared/table-scene';
import type { Game } from '../shared/types';
import late from './fixtures/late-table.json' with { type: 'json' };

const frame = (page: Page) => page.frames().find(f => f.url().includes('/cocos-table/index.html'))!;
async function scene(page: Page) {
  return frame(page).evaluate(async () => {
    const cc = await (window as any).System.import('cc');
    const c = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
    return { state: c.state, tiles: (window as any).__JINLING_TABLE_LAYOUT__, labels: c.hud.getComponentsInChildren(cc.Label).map((l:any)=>l.string) };
  });
}
async function tablePoint(page: Page, x: number, y: number) {
  const box = (await page.locator('#cocos-table-board iframe').boundingBox())!;
  const scale = Math.min(box.width / 1280, box.height / 590);
  return {x:box.x + (box.width - 1280 * scale) / 2 + x * scale,
    y:box.y + (box.height - 590 * scale) / 2 + y * scale};
}
async function clickTable(page: Page, x: number, y: number) {
  const point=await tablePoint(page,x,y);
  await page.mouse.click(point.x,point.y);
}
async function visibleHandTile(page: Page, tile: number) {
  return frame(page).evaluate(async tile => {
    const cc = await (window as any).System.import('cc');
    const c = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
    const target = (window as any).__JINLING_TABLE_LAYOUT__.find((t:any) => t.area === 'hand' && t.tile === tile);
    const node = target && c.nodes.get(target.id);
    return node ? { ...target, x: node.position.x + 640, y: 295 - node.position.y } : undefined;
  }, tile);
}
async function dragTile(page: Page, tile: number, dx: number, dy: number, duringDrag?:()=>Promise<void>) {
  const t=await visibleHandTile(page,tile);
  expect(t).toBeDefined();
  const start=await tablePoint(page,t.x,t.y),middle=await tablePoint(page,t.x+dx/2,t.y+dy/2),end=await tablePoint(page,t.x+dx,t.y+dy);
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  try {
    await page.mouse.move(middle.x,middle.y,{steps:5});
    await duringDrag?.();
    await page.mouse.move(end.x,end.y,{steps:5});
  } finally {
    await page.mouse.up();
  }
  // Deliver iframe postMessages and render the resulting selection/disabled state
  // before asserting that an invalid gesture submitted no action.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}

for (const [width, height] of [[568,320],[844,390],[1280,590]]) {
  test(`正式 App 的 Cocos 通道：选牌听口、出牌、碰牌和单击取消托管 ${width}`, async ({ page }) => {
    await page.setViewportSize({width,height});
    const v = viewFor(structuredClone(late) as unknown as Game, 0);
    Object.assign(v,{rules:newGameRules(),roundMultiplier:2,nextRoundMultiplier:1});
    Object.assign(v,{phase:'playing',turn:0,canDiscard:true,actions:[],selfKongs:[],pending:undefined,result:undefined,deadline:Date.now()+600000,lastDraw:8});
    const mine=v.players[0]!;
    Object.assign(mine,{hand:[0,1,4,5,8,92,96,100],handCount:8,trustee:false,trusteeLocked:false,
      melds:[{type:'pung',tiles:[64,65,66],from:1,concealed:false},{type:'pung',tiles:[24,25,26],from:1,concealed:false}],flowers:[124,128,136,140]});
    v.players.forEach((p,i)=>{if(p){p.discards=[];if(i){p.hand=[];p.handCount=13;p.melds=[];p.flowers=[];}}});
    let socket:WebSocketRoute;
    const commands:any[]=[];
    const push=()=>{
      socket.send(JSON.stringify({type:'state',state:v,serverNow:Date.now()}));
      if(commands.length)socket.send(JSON.stringify({type:'ack',requestId:commands.at(-1).requestId}));
    };
    await page.routeWebSocket('**/ws',ws=>{
      socket=ws;const server=ws.connectToServer();
      ws.onMessage(raw=>{const m=JSON.parse(String(raw));if(['action','trustee'].includes(m.type))commands.push(m);else server.send(raw);});
      server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:v.code}));push();}else ws.send(raw);});
    });
    await page.goto('/');
    await expect(page.locator('#cocos-table-board')).toBeVisible();
    await expect.poll(async()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    await expect.poll(async()=>(await scene(page)).state?.key).not.toBe('demo');
    const fullFrame=(await page.locator('#cocos-table-board iframe').boundingBox())!;
    expect(fullFrame).toEqual({x:0,y:0,width,height});
    const floating=await page.getByRole('navigation',{name:'牌桌工具'}).evaluate(el=>({
      background:getComputedStyle(el).backgroundColor,
      pointerEvents:getComputedStyle(el).pointerEvents,
    }));
    expect(floating).toEqual({background:'rgba(0, 0, 0, 0)',pointerEvents:'none'});
    await page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);(client as any).updateNetwork({rttMs:800,smoothedRttMs:800});});
    await expect(page.locator('.table-connection-quality')).toHaveText('网络较慢');
    const initial=await scene(page);
    expect(initial.labels).toContain('出牌中');
    expect(initial.state.players.filter((p:any)=>p.bot&&p.trustee)).toHaveLength(3);
    expect(initial.labels).not.toContain('托管中');
    expect(initial.labels).toContain('比下胡 × 2');
    expect(initial.labels).not.toContain(`进园子 B档 · ${v.round} / ${v.rules.rounds} 把`);
    expect(initial.labels.some((s:string)=>s.startsWith('下把'))).toBe(false);
    mkdirSync('test-results/screenshots',{recursive:true});
    await page.screenshot({path:`test-results/screenshots/round-multiplier-${width}.png`});
    const tools=page.getByRole('navigation',{name:'牌桌工具'});
    await expect(tools.getByRole('button')).toHaveCount(1);
    await expect(tools.getByRole('button',{name:'开启托管',exact:true})).toBeEnabled();
    for(const name of ['牌桌设置','大厅','牌局信息','对局记录'])await expect(tools.getByRole('button',{name,exact:true})).toHaveCount(0);
    const toolbar=await tools.getByRole('button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,w:b.width,h:b.height,reachable:n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};}));
    for(const b of toolbar){expect(b.w).toBeGreaterThanOrEqual(44);expect(b.h).toBeGreaterThanOrEqual(44);expect(b.x+b.w).toBeLessThanOrEqual(width);expect(b.reachable).toBe(true);}
    expect(initial.state.players.filter((p:any)=>p.seat!==0).every((p:any)=>p.hand.length===0)).toBe(true);
    await expect(page.getByRole("region",{name:"胡牌提示"})).toHaveCount(0);
    await expect(page.locator(".ready-discard-arrow")).toHaveCount(5);
    const tile=initial.tiles.find((t:any)=>t.area==='hand'&&t.tile===8);
    await clickTable(page,tile.x,tile.y);
    await expect.poll(async()=>(await scene(page)).state.selected).toBe(8);
    await expect(page.locator('.table-activity')).toContainText('已选三万 · 再点或上拖出牌');
    expect((await scene(page)).state.hintKinds).toEqual([0,1]);
    const hint=page.getByRole('region',{name:'胡牌提示'});
    await expect(hint).toContainText('打出后可听');
    await expect(hint.getByRole('listitem')).toHaveCount(2);
    await expect(hint.getByLabel('听牌汇总')).toContainText('打三万2种 · 余4张');
    await expect(hint).toContainText('未见数含他人暗手');
    const hintBox=(await hint.boundingBox())!;
    expect(hintBox.x).toBeGreaterThanOrEqual(0);
    const hintFrame=(await page.locator("#cocos-table-board iframe").boundingBox())!;
    expect(hintBox.y+hintBox.height).toBeLessThan(hintFrame.y+hintFrame.height);
    await expect(page.getByLabel("打出三万可听牌",{exact:true})).toBeVisible();
    expect(hintBox.x+hintBox.width).toBeLessThanOrEqual(width);
    await page.screenshot({path:`test-results/screenshots/win-hint-${width}.png`});
    expect(commands).toHaveLength(0);
    await dragTile(page,4,0,-30);
    await expect.poll(async()=>(await scene(page)).state.selected).toBe(8);
    expect(commands).toHaveLength(0);
    const choose=async(tile:number)=>{const t=(await scene(page)).tiles.find((t:any)=>t.area==='hand'&&t.tile===tile);await clickTable(page,t.x,t.y);await expect.poll(async()=>(await scene(page)).state.selected).toBe(tile);};
    await choose(0);
    await expect(hint.getByLabel('听牌汇总')).toContainText('打一万1种 · 余2张');
    await choose(4);
    await expect(hint.getByLabel('听牌汇总')).toContainText('打二万2种 · 余6张');
    await expect(hint.getByRole('listitem').nth(0)).toHaveAttribute('aria-label','一万，未见2张');
    await expect(hint.getByRole('listitem').nth(1)).toHaveAttribute('aria-label','四万，未见4张');
    await page.screenshot({path:`test-results/screenshots/listening-compare-${width}.png`});
    v.players[1]!.discards.push(2);v.revision++;push();
    await expect(hint.getByLabel('听牌汇总')).toContainText('打二万2种 · 余5张');
    v.players[2]!.melds=[{type:'kong',tiles:[12,13,14,15],from:3,concealed:false}];v.revision++;push();
    await expect(hint.getByLabel('听牌汇总')).toContainText('打二万2种 · 余1张');
    await expect(hint.getByRole('listitem').nth(1)).toHaveAttribute('aria-label','四万，未见0张');
    await choose(92);
    await expect(hint).toHaveCount(0);
    await expect(page.getByLabel('打出六条可听牌',{exact:true})).toHaveCount(0);
    await choose(8);
    await expect(hint.getByLabel('听牌汇总')).toContainText('打三万2种 · 余3张');
    expect(commands).toHaveLength(0);
    await dragTile(page,8,0,-30);
    await expect.poll(async()=>(await scene(page)).state.selected).toBe(8);
    expect(commands).toHaveLength(0);
    await dragTile(page,8,0,35);
    await expect.poll(async()=>(await scene(page)).state.selected).toBe(8);
    expect(commands).toHaveLength(0);
    await dragTile(page,8,0,-90,async()=>{
      const held=await frame(page).evaluate(async()=>{
        const cc=await (window as any).System.import('cc');
        const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
        const node=c.nodes.get(c.handTouch.id);
        return {id:c.handTouch.id,x:node.position.x,y:node.position.y,
          baseX:c.handTouch.base.x,baseY:c.handTouch.base.y,
          dx:c.handTouch.x-c.handTouch.startX,dy:c.handTouch.y-c.handTouch.startY,
          flying:c.tileFlights.has(c.handTouch.id)};
      });
      expect(held.id).toBe('draw-8');
      expect(held.flying).toBe(false);
      const dragFrame=(await page.locator('#cocos-table-board iframe').boundingBox())!;
      const dragScale=Math.min(dragFrame.width/1280,dragFrame.height/590);
      // WebKit rounds pointer coordinates to CSS pixels. Keep the tolerance
      // in that unit, while node-to-pointer tracking below stays subpixel exact.
      expect(Math.abs(held.dy-45)*dragScale).toBeLessThanOrEqual(1.1);
      expect(Math.abs(held.x-held.baseX-held.dx)).toBeLessThan(.2);
      expect(Math.abs(held.y-held.baseY-held.dy)).toBeLessThan(.2);
      v.deadline=Date.now()+9000;v.revision++;push();
      await expect.poll(async()=>(await scene(page)).state.revision).toBe(v.revision);
      await expect.poll(async()=>(await scene(page)).state.countdown).not.toBe(initial.state.countdown);
      const updated=await frame(page).evaluate(async()=>{
        const cc=await (window as any).System.import('cc');
        const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
        const node=c.nodes.get(c.handTouch.id);
        return {id:c.handTouch.id,x:node.position.x,y:node.position.y,
          baseX:c.handTouch.base.x,baseY:c.handTouch.base.y,
          dx:c.handTouch.x-c.handTouch.startX,dy:c.handTouch.y-c.handTouch.startY,
          flying:c.tileFlights.has(c.handTouch.id)};
      });
      expect(updated).toEqual(held);
      expect(commands).toHaveLength(0);
    });
    await expect.poll(()=>commands.filter(m=>m.type==='action').length).toBe(1);
    expect(commands[0].action).toEqual({type:'discard',tile:8});
    await expect(page.locator('.table-activity')).toContainText('正在提交操作');
    mine.hand=mine.hand.filter(t=>t!==8);v.phase='claiming';v.canDiscard=false;
    v.actions=['pass','pung','kong','hu'];v.pending={tile:2,from:1,kind:'discard',answered:false};v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.actions.length).toBe(4);
    await expect.poll(async()=>(await scene(page)).state.disabled).toBe(false);
    await expect(hint).toContainText('现在可以胡牌');
    await expect(page.locator('.table-activity')).toContainText(`${v.players[1]!.name}打出一万 · 请选择操作`);
    await page.screenshot({path:`test-results/screenshots/win-ready-${width}.png`});
    const current=(await scene(page)).state,actions=layoutActions(current,layoutTable(current));
    expect(new Set(actions.map(a=>a.y)).size).toBe(1);
    const controls=page.getByRole('group',{name:'碰杠胡操作'});
    const frameBounds=(await page.locator('#cocos-table-board iframe').boundingBox())!;
    const frameScale=Math.min(frameBounds.width/1280,frameBounds.height/590);
    const avatarLeft=frameBounds.x+(frameBounds.width-1280*frameScale)/2+1148*frameScale;
    expect((await controls.boundingBox())!.x+(await controls.boundingBox())!.width).toBeLessThanOrEqual(avatarLeft-7);
    await expect(async()=>{
      const h=(await hint.boundingBox())!,c=(await controls.boundingBox())!;
      expect(h.x+h.width+8<=c.x || h.y+h.height+8<=c.y || c.y+c.height+8<=h.y).toBe(true);
    }).toPass();
    const boxes=await controls.getByRole('button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
    for(const b of boxes){expect(b.w).toBeGreaterThanOrEqual(44);expect(b.h).toBeGreaterThanOrEqual(44);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(width);}
    for(let i=1;i<boxes.length;i++)expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i-1].x+boxes[i-1].w);
    await page.getByRole('button',{name:'碰',exact:true}).click();
    await expect.poll(()=>commands.filter(m=>m.type==='action').length).toBe(2);
    expect(commands[1].action).toEqual({type:'pung'});
    await expect(controls.getByRole('button',{name:'碰',exact:true})).toBeDisabled();
    v.pending!.kind='robKong';v.actions=['hu','pass'];v.revision++;push();
    await expect(page.locator('.table-activity')).toContainText(`${v.players[1]!.name}补杠一万 · 请选择操作`);
    v.pending!.answered=true;v.actions=[];v.revision++;push();
    await expect(page.locator('.table-activity')).toContainText('已响应，等待牌友');
    v.phase='playing';v.actions=[];v.pending=undefined;v.turn=1;mine.trustee=true;v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.players[0].trustee).toBe(true);
    await expect.poll(async()=>(await scene(page)).labels).toContain('托管中');
    await page.getByRole('button',{name:'取消托管',exact:true}).click();
    await expect.poll(()=>commands.filter(m=>m.type==='trustee').length).toBe(1);
    expect(commands.find(m=>m.type==='trustee').enabled).toBe(false);
    mine.trustee=false;v.players[1]!.bot=false;v.players[1]!.online=false;v.players[1]!.trustee=true;v.revision++;push();
    await expect.poll(async()=>(await scene(page)).labels).toContain('离线·托管');
    await expect(page.getByLabel('玩家状态')).toContainText('离线·托管');
    await page.screenshot({path:`test-results/screenshots/player-status-${width}.png`});

    v.phase='ended';v.revision++;push();
    await expect(page.getByRole('navigation',{name:'牌桌工具'}).getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('button',{name:'本局结算',exact:true})).toBeEnabled();
    await expect(async()=>expect((await scene(page)).labels).toContain('下把恢复 × 1')).toPass({timeout:30000});
    v.phase='finished';v.revision++;push();
    await expect(async()=>{
      const current=await scene(page);
      expect(current.state.phase).toBe('finished');
      expect(current.labels.some((s:string)=>s.startsWith('下把'))).toBe(false);
    }).toPass({timeout:30000});
  });
}

for (const [width, height] of [[844,390],[1280,590]]) {
  test(`未摸牌可预选但上拖不出牌，摸牌后保留再次点击出牌 ${width}`,async({page})=>{
    await page.setViewportSize({width,height});
    const v=viewFor(structuredClone(late) as unknown as Game,0);
    Object.assign(v,{phase:'playing',turn:1,canDiscard:false,actions:[],selfKongs:[],pending:undefined,result:undefined,lastDraw:undefined,deadline:Date.now()+600000});
    const mine=v.players[0]!;
    Object.assign(mine,{hand:[0,1,4,5,92,96,100],handCount:7,trustee:false,trusteeLocked:false,
      melds:[{type:'pung',tiles:[64,65,66],from:1,concealed:false},{type:'pung',tiles:[24,25,26],from:1,concealed:false}],flowers:[]});
    let socket:WebSocketRoute;
    const commands:any[]=[];
    const push=()=>{
      socket.send(JSON.stringify({type:'state',state:v,serverNow:Date.now()}));
      if(commands.length)socket.send(JSON.stringify({type:'ack',requestId:commands.at(-1).requestId}));
    };
    await page.routeWebSocket('**/ws',ws=>{
      socket=ws;const server=ws.connectToServer();
      ws.onMessage(raw=>{const m=JSON.parse(String(raw));if(['action','trustee'].includes(m.type))commands.push(m);else server.send(raw);});
      server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:v.code}));push();}else ws.send(raw);});
    });
    await page.goto('/');
    await expect.poll(async()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    await expect.poll(async()=>(await scene(page)).state?.key).not.toBe('demo');
    const tap=async(tile:number)=>{
      // A card can still be closing the gap left by a confirmed discard. Hit
      // the actual visible card, rather than another card at its future slot.
      const t=await visibleHandTile(page,tile);
      expect(t).toBeDefined();
      await clickTable(page,t.x,t.y);
    };
    const selected=async(tile:number|null)=>{
      await expect.poll(async()=>(await scene(page)).state.selected).toBe(tile);
    };
    const selectable=async(enabled:boolean)=>{
      await expect.poll(async()=>{
        const hand=(await scene(page)).tiles.filter((t:any)=>t.area==='hand'&&t.seat===0);
        return hand.length>0&&hand.every((t:any)=>t.clickable===enabled);
      }).toBe(true);
    };
    await selectable(true);
    await tap(0);await selected(0);
    await tap(4);await selected(4);
    await dragTile(page,4,0,-90);
    await selected(4);
    expect(commands).toHaveLength(0);
    await tap(4);await selected(null);
    expect(commands).toHaveLength(0);
    await tap(4);await selected(4);
    v.players[1]!.discards.push(12);v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.players[1].discards).toContain(12);
    await selected(4);
    mkdirSync('test-results/screenshots',{recursive:true});
    await page.screenshot({path:`test-results/screenshots/off-turn-selection-${width}.png`});

    v.phase='claiming';v.actions=['pass','pung'];v.pending={tile:8,from:1,kind:'discard',answered:false};v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.phase).toBe('claiming');
    await selected(4);await selectable(true);
    await dragTile(page,4,0,-90);
    await selected(4);
    expect(commands).toHaveLength(0);
    await tap(92);await selected(92);
    await tap(92);await selected(null);
    await tap(4);await selected(4);
    expect(commands).toHaveLength(0);
    await page.screenshot({path:`test-results/screenshots/claiming-selection-${width}.png`});

    mine.hand.push(8);mine.handCount=mine.hand.length;
    Object.assign(v,{phase:'playing',turn:0,canDiscard:true,actions:[],pending:undefined,lastDraw:8});v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.canDiscard).toBe(true);
    await selected(null);
    await tap(4);await selected(4);
    expect(commands).toHaveLength(0);
    await tap(4);
    await expect.poll(()=>commands.length).toBe(1);
    expect(commands[0].action).toEqual({type:'discard',tile:4});
    await expect.poll(async()=>(await scene(page)).state.disabled).toBe(true);
    await selected(null);await selectable(false);

    mine.hand=mine.hand.filter(t=>t!==4);mine.handCount=mine.hand.length;
    Object.assign(v,{turn:1,canDiscard:false,lastDraw:undefined});v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.disabled).toBe(false);
    await tap(92);await selected(92);
    mine.trustee=true;v.revision++;push();
    await selected(null);await selectable(false);
    await tap(96);await selected(null);
    mine.trustee=false;v.revision++;push();
    await selectable(true);
    await tap(96);await selected(96);
    v.phase='ended';v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.phase).toBe('ended');
    await selected(null);await selectable(false);
    expect(commands).toHaveLength(1);
  });
}

test.describe('真实触屏拖牌',()=>{
  test.use({hasTouch:true});
  test('直接慢拖到桌面松手、斜拖和终点更新可出牌，取消与拖回不误出',async({page,browserName})=>{
    await page.setViewportSize({width:844,height:390});
    const v=viewFor(structuredClone(late) as unknown as Game,0);
    Object.assign(v,{phase:'playing',turn:0,canDiscard:true,actions:[],selfKongs:[],pending:undefined,result:undefined,lastDraw:8,deadline:Date.now()+600000});
    Object.assign(v.players[0]!,{hand:[0,1,4,5,8,92,96,100],handCount:8,trustee:false,trusteeLocked:false,
      melds:[{type:'pung',tiles:[64,65,66],from:1,concealed:false},{type:'pung',tiles:[24,25,26],from:1,concealed:false}],flowers:[]});
    const commands:any[]=[];
    let socket:WebSocketRoute;
    const push=()=>{
      socket.send(JSON.stringify({type:'state',state:v,serverNow:Date.now()}));
      if(commands.length)socket.send(JSON.stringify({type:'ack',requestId:commands.at(-1).requestId}));
    };
    await page.routeWebSocket('**/ws',ws=>{
      socket=ws;const server=ws.connectToServer();
      ws.onMessage(raw=>{const m=JSON.parse(String(raw));if(['action','trustee'].includes(m.type))commands.push(m);else server.send(raw);});
      server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:v.code}));push();}else ws.send(raw);});
    });
    await page.goto('/');
    await expect.poll(async()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    await expect.poll(async()=>(await scene(page)).state?.key).not.toBe('demo');
    const flush=()=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const tile=async()=> visibleHandTile(page,8);
    const selected=()=>expect.poll(async()=>(await scene(page)).state.selected).toBe(8);
    const select=async()=>{const t=await tile(),p=await tablePoint(page,t.x,t.y);await page.touchscreen.tap(p.x,p.y);await selected();};
    const touch=async(type:'touchstart'|'touchmove'|'touchend'|'touchcancel',x:number,y:number)=>{
      // Browser TouchEvent path through Creator's canvas input adapter. These
      // constructed events are untrusted; Chrome's CDP gesture below additionally
      // covers native input dispatch. WebKit requires legacy Touch/TouchList factories.
      // Unlike CDP touchEnd, TouchEvent permits a final position different from
      // the last move, which reproduces iOS/coalesced-event release behaviour.
      await frame(page).evaluate(({type,x,y})=>{
        const canvas=document.querySelector('canvas')!,rect=canvas.getBoundingClientRect();
        const scale=Math.min(rect.width/1280,rect.height/590);
        const clientX=rect.x+(rect.width-1280*scale)/2+x*scale,clientY=rect.y+(rect.height-590*scale)/2+y*scale;
        const ended=type==='touchend'||type==='touchcancel';
        const legacy=document as Document&{
          createTouch?:(view:Window,target:EventTarget,id:number,pageX:number,pageY:number,screenX:number,screenY:number)=>Touch;
          createTouchList?:(...touches:Touch[])=>TouchList;
        };
        let event:TouchEvent;
        if(legacy.createTouch&&legacy.createTouchList){
          const point=legacy.createTouch(window,canvas,29,clientX+window.scrollX,clientY+window.scrollY,clientX,clientY);
          const changed=legacy.createTouchList(point),active=ended?legacy.createTouchList():changed;
          event=new TouchEvent(type,{bubbles:true,cancelable:true,changedTouches:changed as unknown as Touch[],touches:active as unknown as Touch[],targetTouches:active as unknown as Touch[]});
        }else{
          const point=new Touch({identifier:29,target:canvas,clientX,clientY});
          event=new TouchEvent(type,{bubbles:true,cancelable:true,changedTouches:[point],touches:ended?[]:[point],targetTouches:ended?[]:[point]});
        }
        canvas.dispatchEvent(event);
      },{type,x,y});
      await flush();
    };
    const ack=async(count:number)=>{
      await expect.poll(()=>commands.length).toBe(count);
      expect(commands[count-1].action).toEqual({type:'discard',tile:8});
      v.revision++;push();
      await expect.poll(async()=>(await scene(page)).state.disabled).toBe(false);
      await expect.poll(async()=>(await scene(page)).state.selected).toBe(null);
      // This fixture deliberately keeps the same card for the next gesture.
      // Its returned rack position must settle before starting a fresh native
      // touch sequence; a real accepted discard would remove it from the hand.
      await expect.poll(()=>frame(page).evaluate(async()=>{
        const cc=await (window as any).System.import('cc');
        const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
        const t=Array.from(c.tileLayout.values()).find((t:any)=>t.area==='hand'&&t.tile===8) as any;
        const n=t&&c.nodes.get(t.id);
        return n?Math.hypot(n.position.x+640-t.x,295-n.position.y-t.y):Infinity;
      })).toBeLessThanOrEqual(.2);
    };

    await select();
    let t=await tile();
    await touch('touchstart',t.x,t.y);
    await touch('touchmove',t.x,t.y-100);
    expect(commands).toHaveLength(0); // Crossing the edge alone must not submit.
    await touch('touchmove',t.x,t.y);
    await touch('touchend',t.x,t.y);
    await selected();expect(commands).toHaveLength(0);

    // Retake the card at its current visible position while its return-to-hand
    // animation may still be running after the preceding cancelled gesture.
    t=await tile();
    await touch('touchstart',t.x,t.y);
    await touch('touchmove',t.x,t.y-140);
    await touch('touchcancel',t.x,t.y-140);
    await selected();expect(commands).toHaveLength(0);

    // A release coordinate can be newer than the final move. Creator reports
    // TOUCH_CANCEL because its old sprite bounds no longer contain the finger.
    t=await tile();
    await touch('touchstart',t.x,t.y);
    await touch('touchmove',t.x,t.y-20);
    await touch('touchend',t.x-250,t.y-140);
    await ack(1);

    // Second discard starts directly on an unselected tile.
    t=await tile();
    await expect.poll(async()=>(await scene(page)).state.selected).toBe(null);
    if(browserName==='chromium'){
      const cdp=await page.context().newCDPSession(page);
      const start=await tablePoint(page,t.x,t.y);
      try {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:41}]});
        for(let step=1;step<=4;step++){
          const p=await tablePoint(page,t.x-180*step/4,t.y-100*step/4);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y,id:41}]});
          await page.waitForTimeout(150); // Deliberate slow drag, no speed requirement.
          expect(commands).toHaveLength(1);
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      } finally {await cdp.detach();}
    }else{
      await touch('touchstart',t.x,t.y);
      for(let step=1;step<=4;step++){
        await touch('touchmove',t.x-180*step/4,t.y-100*step/4);
        await page.waitForTimeout(150);
        expect(commands).toHaveLength(1);
      }
      await touch('touchend',t.x-180,t.y-100);
    }
    await ack(2);

    await select();t=await tile();
    await touch('touchstart',t.x,t.y);
    await touch('touchmove',t.x,t.y-100);
    v.turn=1;v.canDiscard=false;v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.turn).toBe(1);
    await touch('touchend',t.x,t.y-140);
    expect(commands).toHaveLength(2);
  });
});

test('灵动岛安全区更新时四家信息避让，牌桌和牌面尺寸保持全屏',async({page})=>{
  await page.setViewportSize({width:874,height:402});
  const v=viewFor(structuredClone(late) as unknown as Game,0);
  Object.assign(v,{phase:'playing',turn:0,canDiscard:true,actions:[],selfKongs:[],pending:undefined,result:undefined,deadline:Date.now()+600000});
  await page.routeWebSocket('**/ws',ws=>{
    const server=ws.connectToServer();ws.onMessage(raw=>server.send(raw));
    server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:v.code}));ws.send(JSON.stringify({type:'state',state:v,serverNow:Date.now()}));}else ws.send(raw);});
  });
  await page.goto('/');
  await expect.poll(async()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
  const baseline=(await scene(page)).tiles;
  const panels=()=>frame(page).evaluate(async()=>{
    const cc=await (window as any).System.import('cc');
    const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
    return c.hud.children.filter((n:any)=>n.name.startsWith('player-panel-')).map((n:any)=>{
      const ui=n.getComponent(cc.UITransform);return {name:n.name,x:n.position.x+640-ui.width/2,y:295-n.position.y-ui.height/2,w:ui.width,h:ui.height};
    });
  });
  for(const [left,right] of [[62,0],[0,62],[62,62],[0,0]]){
    const bottom=left||right?21:0;
    await page.locator('#cocos-table-board').evaluate((el,{left,right,bottom})=>{
      const style=(el as HTMLElement).style;
      style.setProperty('--table-safe-left',`${left}px`);style.setProperty('--table-safe-right',`${right}px`);style.setProperty('--table-safe-bottom',`${bottom}px`);
    },{left,right,bottom});
    const box=(await page.locator('#cocos-table-board iframe').boundingBox())!;
    expect(box).toEqual({x:0,y:0,width:874,height:402});
    const k=Math.min(box.width/1280,box.height/590),ox=(box.width-1280*k)/2,oy=(box.height-590*k)/2;
    await expect(async()=>{
      const p=await panels();expect(p).toHaveLength(4);
      for(const a of p){
        expect(ox+a.x*k).toBeGreaterThanOrEqual(left-1);
        expect(ox+(a.x+a.w)*k).toBeLessThanOrEqual(874-right+1);
        if(bottom)expect(oy+(a.y+a.h)*k).toBeLessThanOrEqual(402-bottom+1);
      }
    }).toPass();
    expect((await scene(page)).tiles).toEqual(baseline);
    const buttons=await page.getByRole('navigation',{name:'牌桌工具'}).getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
    for(const b of buttons){expect(b.left).toBeGreaterThanOrEqual(left);expect(b.right).toBeLessThanOrEqual(874-right);}
    if(left&&right){mkdirSync('test-results/screenshots',{recursive:true});await page.screenshot({path:'test-results/screenshots/island-safe-table.png'});}
  }
});
