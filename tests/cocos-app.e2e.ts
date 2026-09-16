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
async function clickTable(page: Page, x: number, y: number) {
  const box = (await page.locator('#cocos-table-board iframe').boundingBox())!;
  const scale = Math.min(box.width / 1280, box.height / 590);
  await page.mouse.click(box.x + (box.width - 1280 * scale) / 2 + x * scale,
    box.y + (box.height - 590 * scale) / 2 + y * scale);
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
    v.players.forEach((p,i)=>{if(p){p.discards=p.discards.slice(0,5);if(i){p.hand=[];p.handCount=13;p.melds=[];p.flowers=[];}}});
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
    const initial=await scene(page);
    expect(initial.labels).toContain('比下胡 × 2');
    expect(initial.labels).toContain(`进园子 · ${v.round} / ${v.rules.rounds} 把`);
    expect(initial.labels.some((s:string)=>s.startsWith('下把'))).toBe(false);
    mkdirSync('test-results/screenshots',{recursive:true});
    await page.screenshot({path:`test-results/screenshots/round-multiplier-${width}.png`});
    expect(initial.state.players.filter((p:any)=>p.seat!==0).every((p:any)=>p.hand.length===0)).toBe(true);
    const tile=initial.tiles.find((t:any)=>t.area==='hand'&&t.tile===8);
    await clickTable(page,tile.x,tile.y);
    await expect.poll(async()=>(await scene(page)).state.selected).toBe(8);
    expect((await scene(page)).state.hintKinds).toEqual([0,1]);
    const hint=page.getByRole('region',{name:'胡牌提示'});
    await expect(hint).toContainText('打出后可听');
    await expect(hint.getByRole('listitem')).toHaveCount(2);
    await expect(hint).toContainText('未见数含他人暗手');
    const hintBox=(await hint.boundingBox())!;
    expect(hintBox.x).toBeGreaterThanOrEqual(0);
    expect(hintBox.x+hintBox.width).toBeLessThanOrEqual(width);
    await page.screenshot({path:`test-results/screenshots/win-hint-${width}.png`});
    expect(commands).toHaveLength(0);
    const selected=(await scene(page)).tiles.find((t:any)=>t.area==='hand'&&t.tile===8);
    await clickTable(page,selected.x,selected.y);
    await expect.poll(()=>commands.filter(m=>m.type==='action').length).toBe(1);
    expect(commands[0].action).toEqual({type:'discard',tile:8});
    mine.hand=mine.hand.filter(t=>t!==8);v.phase='claiming';v.canDiscard=false;
    v.actions=['pass','pung','kong','hu'];v.pending={tile:2,from:1,kind:'discard',answered:false};v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.actions.length).toBe(4);
    await expect.poll(async()=>(await scene(page)).state.disabled).toBe(false);
    await expect(hint).toContainText('现在可以胡牌');
    await page.screenshot({path:`test-results/screenshots/win-ready-${width}.png`});
    const current=(await scene(page)).state,actions=layoutActions(current,layoutTable(current));
    expect(new Set(actions.map(a=>a.y)).size).toBe(1);
    const pung=actions.find(a=>a.action.id==='pung')!;await clickTable(page,pung.x,pung.y);
    await expect.poll(()=>commands.filter(m=>m.type==='action').length).toBe(2);
    expect(commands[1].action).toEqual({type:'pung'});
    v.phase='playing';v.actions=[];v.pending=undefined;v.turn=1;mine.trustee=true;v.revision++;push();
    await expect.poll(async()=>(await scene(page)).state.players[0].trustee).toBe(true);
    await clickTable(page,1107,88);
    await expect.poll(()=>commands.filter(m=>m.type==='trustee').length).toBe(1);
    expect(commands.find(m=>m.type==='trustee').enabled).toBe(false);
    mine.trustee=false;v.revision++;push();
    await clickTable(page,1227,35);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button',{name:'南京男声',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    v.phase='ended';v.revision++;push();
    // Closing settings remounts the table iframe; wait for the new rendered HUD.
    await expect(async()=>expect((await scene(page)).labels).toContain('下把恢复 × 1')).toPass({timeout:30000});
    v.phase='finished';v.revision++;push();
    await expect(async()=>{
      const current=await scene(page);
      expect(current.state.phase).toBe('finished');
      expect(current.labels.some((s:string)=>s.startsWith('下把'))).toBe(false);
    }).toPass({timeout:30000});
  });
}
