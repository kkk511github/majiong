import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { hashPassword } from "../server/accounts";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "../src/legal-copy";
import { replayedRound } from "./fixtures/replayed-round";
import { act, createGame, newPlayer, seats, startRound, viewFor } from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import type { View } from "../shared/types";

const encoded = hashPassword("Local-web-check-2026");
async function account(context: BrowserContext, role = "admin") {
  const id = randomUUID(), token = randomBytes(32).toString("hex"), hash = await encoded;
  const db = new DatabaseSync(resolve("output/web-parity-20260919/test.sqlite"));
  try {
    db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(id, id, "网页牌友", hash, role, 0, Date.now());
    db.prepare("INSERT INTO team_memberships VALUES (?,?,?,?,?)").run(id, "team-1", 0, "web-test", Date.now());
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(createHash("sha256").update(token).digest("hex"), id, "网页牌友", Date.now());
  } finally { db.close(); }
  await context.addInitScript(({ token, key, version }) => {
    if (!JSON.parse(localStorage.getItem("jinling:token") ?? "null")) localStorage.setItem("jinling:token", JSON.stringify(token));
    localStorage.setItem(key, JSON.stringify({ version, acceptedAt: "2026-09-19" }));
  }, { token, key:LEGAL_STORAGE_KEY, version:LEGAL_VERSION });
  return { id, token };
}
function audit(page: Page) {
  const errors: string[] = [], missing: string[] = [], api: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => {
    if(r.status() >= 400) missing.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on("request", r => { if (/\/api\/|\/ws\b/.test(r.url())) api.push(r.url()); });
  return { errors, missing, api };
}
async function assertFit(page: Page) {
  const size=await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("body *")].flatMap(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left < -1)?[{tag:e.tagName,cls:e.className,left:r.left,right:r.right}]:[]}).slice(0,15)}));
  expect(size.scroll,JSON.stringify(size)).toBeLessThanOrEqual(size.width);
}

test("真实 /play/ 登录、会话恢复、普通会员权限", async ({ page, context }) => {
  const checks = audit(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto("./");
  await expect(page.getByPlaceholder("请输入账号")).toBeVisible();
  await page.getByPlaceholder("请输入账号").fill("web-admin");
  await page.getByPlaceholder("请输入密码").fill("Local-web-check-2026");
  await page.getByRole("button",{name:"登录，开始相聚",exact:true}).click();
  await expect(page.getByRole("button",{name:"开一桌，等朋友"})).toBeVisible();
  await assertFit(page);
  await page.reload();
  await expect(page.getByRole("button",{name:"进入牌桌大厅"})).toBeVisible();
  expect(checks.errors).toEqual([]); expect(checks.missing).toEqual([]);
  expect(checks.api.every(url=>url.startsWith("http://127.0.0.1:5194/mahjong/api/"))).toBe(true);
  await page.getByRole("button",{name:"我的",exact:true}).click();
  await page.getByRole("button",{name:"退出登录",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"退出登录",exact:true}).click();
  await expect(page.getByPlaceholder("请输入账号")).toBeVisible();
  const member = await account(context,"member");
  await page.reload();
  await expect(page.getByRole("button",{name:"进入牌桌大厅"})).toBeVisible();
  await expect(page.getByRole("button",{name:"开一桌，等朋友"})).toHaveCount(0);
  await page.getByRole("button",{name:"我的",exact:true}).click();
  await expect(page.getByRole("button",{name:"战队与会员",exact:true})).toHaveCount(0);
  const denied=await context.request.get("/mahjong/api/admin/members",{headers:{Authorization:`Bearer ${member.token}`}});
  expect(denied.status()).toBe(403);
});

for (const [width,height] of [[390,844],[844,390],[1280,720]]) {
  test(`管理、导出、头像、报牌、复制在发布版可用 ${width}`, async ({page,context},info) => {
    await account(context); await page.setViewportSize({width,height});
    // Embedded browsers may expose no async Clipboard API, even over HTTPS.
    await page.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:undefined}));
    const checks=audit(page);
    await page.addInitScript(()=>{
      const Original=window.AudioContext;
      (window as any).__audioContexts=[];
      (window as any).__voiceBuffers=0;
      window.AudioContext=class extends Original {
        constructor(options?:AudioContextOptions){super(options);(window as any).__audioContexts.push(this);}
        createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);
          source.start=((...args:any[])=>{if(!source.loop)(window as any).__voiceBuffers++;start(...args as [number?,number?,number?]);}) as typeof source.start;
          return source;}
      };
    });
    await page.goto("./");
    await page.getByRole("button",{name:"我的",exact:true}).click();
    await page.getByRole("button",{name:"复制会员 ID",exact:true}).click();
    await expect(page.getByText("会员 ID 已复制",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"修改昵称",exact:true}).click();
    await page.getByLabel("牌桌昵称",{exact:false}).fill("网页验收");
    await page.getByRole("button",{name:"保存昵称",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button",{name:"更换头像",exact:true}).click();
    await page.getByLabel("选择头像照片").setInputFiles("public/brand-icon.png");
    await expect(page.getByAltText("新头像预览")).toBeVisible();
    await page.getByRole("button",{name:"保存头像",exact:true}).click();
    await expect(page.getByText("头像已保存，牌桌同步更新。",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"关闭",exact:true}).click();
    await page.getByRole("button",{name:"声音设置",exact:true}).click();
    for(const gender of ["南京男声","南京女声"]) {
      await page.getByRole("button",{name:gender,exact:true}).click();
      await page.getByRole("button",{name:"试听南京话",exact:true}).click();
      await expect(page.locator(".voice-preview-status")).toHaveText(/正在试听南京话|试听结束/,{timeout:20000});
    }
    await expect.poll(()=>page.evaluate(()=>(window as any).__voiceBuffers)).toBeGreaterThan(1);
    const clock=await page.evaluate(()=>(window as any).__audioContexts.at(-1).currentTime);
    await expect.poll(()=>page.evaluate(()=>(window as any).__audioContexts.at(-1).currentTime)).toBeGreaterThan(clock);
    await page.getByRole("button",{name:"关闭",exact:true}).click();
    await page.getByRole("button",{name:"战队与会员",exact:true}).click();
    await expect(page.locator(".club-workspace")).toBeVisible();
    await page.getByRole("button",{name:"积分统计",exact:true}).click();
    const download=page.waitForEvent("download");
    await page.getByRole("button",{name:"导出 CSV",exact:true}).click();
    const csv=await download;
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    expect((await readFile((await csv.path())!,"utf8")).length).toBeGreaterThan(10);
    await page.getByRole("button",{name:"关闭",exact:true}).click();
    await page.getByRole("button",{name:"开桌权限",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"开桌权限",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"关闭",exact:true}).click();
    await assertFit(page);
    await page.screenshot({path:`output/web-parity-20260919/profile-${width}-${info.project.name}.png`});
    expect(checks.errors).toEqual([]); expect(checks.missing).toEqual([]);
  });
}

test("战绩筛选、本把明细、盘面和回放按 /play/ 加载", async ({page,context})=>{
  await account(context); const checks=audit(page), g=replayedRound();
  const item={game:g.id,code:g.code,me:0,practice:false,record:{...g.history[0],at:Date.now(),matchFinished:true,totalRounds:8}};
  await page.route("**/mahjong/api/**",async route=>{
    const path=new URL(route.request().url()).pathname.replace(/^\/mahjong/,"");
    const json=/\/api\/(admin\/)?records/.test(path)?{records:[item],total:1,page:1,pageSize:20,dates:[]}:
      path.startsWith("/api/admin/match-reads/")?{readAt:Date.now()}:
      path.startsWith("/api/matches/")?{match:item,rounds:[item]}:
      path.startsWith("/api/replays/")?g.replay:undefined;
    if(json) await route.fulfill({json});else await route.continue();
  });
  await page.goto("./"); await page.getByRole("button",{name:"战绩",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("button",{name:`查看房间 ${g.code} 最终战绩`,exact:true})).toBeVisible();
  await assertFit(page);
  await page.setViewportSize({width:844,height:390});
  await page.getByRole("button",{name:`查看房间 ${g.code} 最终战绩`,exact:true}).click();
  await page.getByRole("tab",{name:"本把明细",exact:true}).click();
  await expect(page.getByRole("tab",{name:"本把明细",exact:true})).toHaveAttribute("aria-selected","true");
  await page.getByRole("tab",{name:"查看盘面",exact:true}).click();
  await expect(page.getByRole("tab",{name:"查看盘面",exact:true})).toHaveAttribute("aria-selected","true");
  await page.getByRole("button",{name:/回放第 1 把/}).click();
  const replay=page.getByRole("dialog",{name:"牌局回放",exact:true});
  await expect(replay).toBeVisible();
  await expect(replay.locator(".cocos-loading")).toHaveCount(0,{timeout:45000});
  await expect(replay.locator("iframe")).toBeVisible();
  expect(checks.errors).toEqual([]);expect(checks.missing).toEqual([]);
});

test("四人开桌准备、拖牌与旧出牌方式、刷新恢复同桌",async({browser},info)=>{
  test.setTimeout(120000);
  const contexts=await Promise.all([0,1,2,3].map(()=>browser.newContext({viewport:{width:844,height:390}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  const views:Array<View|undefined>=[];
  try {
    await Promise.all(contexts.map(c=>account(c)));
    const checks=pages.map((page,i)=>{
      page.on("websocket", ws=>ws.on("framereceived", f=>{
        const m=JSON.parse(String(f.payload));if(m.type==="state")views[i]=m.state;
      }));
      return audit(page);
    });
    for(const page of pages)await page.goto("http://127.0.0.1:5194/play/");
    const host=pages[0], tableName=`网页验收-${randomUUID().slice(0,8)}`;
    await host.getByRole("button",{name:"开一桌，等朋友"}).click();
    await host.getByLabel("玩法名称",{exact:true}).fill(tableName);
    await host.getByRole("button",{name:"下一步",exact:true}).click();
    await host.getByRole("group",{name:"创建桌数",exact:true}).getByRole("button",{name:"1 桌",exact:true}).click();
    await host.getByRole("group",{name:"准备方式",exact:true}).getByRole("button",{name:"手动准备",exact:true}).click();
    await host.getByRole("group",{name:"超时托管",exact:true}).getByRole("button",{name:"关闭托管",exact:true}).click();
    await host.getByRole("button",{name:"下一步",exact:true}).click();
    await host.getByRole("button",{name:"创建 1 桌",exact:true}).click();
    await expect(host.getByRole("dialog")).toHaveCount(0);
    const code=(await host.locator(".table-card").filter({hasText:tableName}).last().locator(".table-room-code").innerText()).trim();
    for(let i=0;i<4;i++){
      if(i>0)await pages[i].getByRole("button",{name:"进入牌桌大厅"}).click();
      await pages[i].getByRole("button",{name:`${code} ${["东","南","西","北"][i]}位入座`,exact:true}).click();
      await pages[i].getByRole("button",{name:"我准备好了",exact:true}).click();
    }
    await expect.poll(()=>views.filter(v=>v?.phase==="playing").length).toBe(4);
    for(const page of pages){
      await expect(page.locator(".table-opening")).toHaveCount(0,{timeout:30000});
      await expect(page.locator(".cocos-loading")).toHaveCount(0,{timeout:45000});
    }
    for(const method of ["drag","double-click"]){
      // Claiming may follow the first discard. Pass any claims via real controls.
      for(let j=0;j<4;j++)if(views[j]?.actions.length){
        const pass=pages[j].getByRole("button",{name:"过",exact:true});if(await pass.isVisible())await pass.click();
      }
      await expect.poll(()=>views.some(v=>v?.canDiscard)).toBe(true);
      const who=views.findIndex(v=>v?.canDiscard), page=pages[who], before=views[who]!;
      const frame=page.frames().find(f=>f.url().includes("/cocos-table/index.html"))!;
      const tile=before.players[before.me]!.hand[0];
      await expect.poll(()=>frame.evaluate(tile=>(window as any).__JINLING_TABLE_LAYOUT__?.some((t:any)=>t.area==="hand"&&t.tile===tile),tile)).toBe(true);
      const point=await frame.evaluate(tile=>(window as any).__JINLING_TABLE_LAYOUT__.find((t:any)=>t.area==="hand"&&t.tile===tile),tile);
      const box=(await page.locator("#cocos-table-board iframe").boundingBox())!, scale=Math.min(box.width/1280,box.height/590);
      const x=box.x+(box.width-1280*scale)/2+point.x*scale,y=box.y+(box.height-590*scale)/2+point.y*scale;
      if(method==="drag") {await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-110*scale,{steps:15});await page.mouse.up();}
      else await page.mouse.dblclick(x,y,{delay:80});
      await expect.poll(()=>views[who]?.players[before.me]?.hand.includes(tile)).toBe(false);
    }
    const original=views[0]!.id;
    await host.reload();
    await expect.poll(()=>views[0]?.id).toBe(original);
    await expect(host.locator("#cocos-table-board")).toBeVisible();
    await expect(host.locator(".cocos-loading")).toHaveCount(0,{timeout:45000});
    await expect(host.locator(".table-opening")).toHaveCount(0);
    await host.screenshot({path:`output/web-parity-20260919/table-${info.project.name}.png`});
    for(const check of checks){expect(check.errors).toEqual([]);expect(check.missing).toEqual([]);}
  } finally {await Promise.allSettled(contexts.map(c=>c.close()));}
});


const tableFrame=(page:Page)=>page.frames().find(f=>f.url().includes("/cocos-table/index.html"));
async function renderedHand(page:Page) {
  return tableFrame(page)!.evaluate(async()=>{
    if(!(window as any).__JINLING_TABLE_READY__)return {revision:undefined,tiles:[]};
    const cc=await (window as any).System.import("cc");
    const c=cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    return { revision:c.state?.revision,drawn:c.state?.drawn, tiles:((window as any).__JINLING_TABLE_LAYOUT__??[])
      .filter((t:any)=>t.area==="hand"&&t.seat===c.state.me).map((t:any)=>{
        const node=c.nodes.get(t.id),sprite=node?.getComponent(cc.Sprite);
        return {tile:t.tile,id:t.id,x:t.x,y:t.y,frame:!!sprite?.spriteFrame,active:!!node?.activeInHierarchy,
          opacity:node?._uiProps?.opacity,vertices:sprite?.renderData?.vertexCount};
      })};
  });
}
test.describe("电脑牌桌渲染",()=>{
 test.use({viewport:{width:1280,height:720}});
for (const me of seats) test(`新摸牌实际牌面显示：座位${me}，横竖屏切换和画布恢复`,async({page,context},info)=>{
  await account(context); const checks=audit(page);
  let g=createGame("682194",`web-draw-${me}`,{turnSeconds:0,twoBankrupt:false});
  g.players=seats.map(s=>({...newPlayer(`web-seat-${s}`,`牌友${s+1}`),ready:true}));
  g.dealer=me;g=startRound(g,Date.now(),seededRandom(52+me));
  let socket:any;
  await page.routeWebSocket("**/mahjong/ws",ws=>{
    socket=ws;const server=ws.connectToServer();
    server.onMessage(raw=>{
      const m=JSON.parse(String(raw));
      if(m.type==="session"){ws.send(JSON.stringify({...m,roomCode:g.code}));ws.send(JSON.stringify({type:"state",state:viewFor(g,me)}));}
      else if(m.type!=="state")ws.send(raw);
    });
  });
  await page.goto("./");
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect(page.locator(".cocos-loading")).toHaveCount(0,{timeout:45000});
  const verify=async()=>{
    const expected=viewFor(g,me),hand=expected.players[me]!.hand;
    await expect.poll(async()=>tableFrame(page)?.evaluate(()=>(window as any).__JINLING_TABLE_READY__) ? (await renderedHand(page)).revision:undefined).toBe(g.revision);
    const rendered=await renderedHand(page);
    expect(rendered.tiles.map((t:any)=>t.tile).sort((a:number,b:number)=>a-b)).toEqual([...hand].sort((a,b)=>a-b));
    expect(rendered.tiles.every((t:any)=>t.frame&&t.active&&t.opacity>0&&t.vertices>=4),JSON.stringify(rendered)).toBe(true);
    if(expected.canDiscard&&expected.lastDraw!==undefined) expect(rendered.tiles.find((t:any)=>t.tile===expected.lastDraw)?.id).toBe(`draw-${expected.lastDraw}`);
  };
  await verify();
  // Advance a real engine round. Every draw packet carries the complete private hand.
  for(let i=0;i<12;i++){
    if(g.phase==="claiming"){
      for(const s of seats)if(viewFor(g,s).actions.includes("pass"))g=act(g,s,{type:"pass"},Date.now());
    }else g=act(g,g.turn,{type:"discard",tile:g.lastDraw??g.players[g.turn]!.hand[0]},Date.now());
    socket.send(JSON.stringify({type:"state",state:viewFor(g,me)}));
    await verify();
  }
  // Rotate a browser that was hidden by the landscape guide, then display a new draw.
  await page.setViewportSize({width:390,height:844});
  await page.setViewportSize({width:844,height:390});
  await verify();
  if(me===0){
    const src=await page.locator("#cocos-table-board iframe").getAttribute("src");
    const lost=await tableFrame(page)!.evaluate(()=>{
      const canvas=document.querySelector("canvas")!;
      const gl=canvas.getContext("webgl2")??canvas.getContext("webgl");
      const ext=gl?.getExtension("WEBGL_lose_context");ext?.loseContext();return !!ext;
    });
    expect(lost).toBe(true);
    // The game progresses independently while the failed renderer is rebuilding.
    for(let step=0;step<12;step++){
      if(g.phase==="claiming"){
        for(const seat of seats)if(viewFor(g,seat).actions.includes("pass"))g=act(g,seat,{type:"pass"},Date.now());
      }else g=act(g,g.turn,{type:"discard",tile:g.lastDraw??g.players[g.turn]!.hand[0]},Date.now());
      if(g.turn===me&&g.phase==="playing")break;
    }
    socket.send(JSON.stringify({type:"state",state:viewFor(g,me)}));
    await expect(page.locator("#cocos-table-board iframe")).not.toHaveAttribute("src",src!);
    await expect(page.locator(".cocos-loading")).toHaveCount(0,{timeout:45000});
    await verify();
    await expect(page.locator(".table-opening")).toHaveCount(0);
  }
  await page.screenshot({path:`output/web-parity-20260919/draw-${me}-${info.project.name}.png`});
  if(me===0){
    await tableFrame(page)!.evaluate(()=>document.querySelector("canvas")!.dispatchEvent(new Event("webglcontextlost",{cancelable:true})));
    await expect(page.getByText("牌桌画面暂时中断",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"重新加载",exact:true}).click();
    await expect(page.locator(".cocos-loading")).toHaveCount(0,{timeout:45000});
    await verify();
  }
  expect(checks.errors).toEqual([]);expect(checks.missing).toEqual([]);
});

test("开局状态连续到达也播放立体动画，重连与下一把不重播",async({page,context})=>{
  await account(context);
  let g=createGame("682197","web-opening",{turnSeconds:0,twoBankrupt:false});
  g.players=seats.map(s=>({...newPlayer(`opening-seat-${s}`,`牌友${s+1}`),ready:true}));
  let socket:any;
  await page.addInitScript(()=>{
    (window as any).__openings=0;let last:Element|null=null;
    new MutationObserver(()=>{const next=document.querySelector(".table-opening");if(next&&next!==last)(window as any).__openings++;last=next;}).observe(document,{childList:true,subtree:true});
  });
  await page.routeWebSocket("**/mahjong/ws",ws=>{socket=ws;ws.connectToServer();});
  await page.goto("./");await page.getByRole("button",{name:"我的",exact:true}).click();
  g=startRound(g,Date.now(),seededRandom(53));
  socket.send(JSON.stringify({type:"state",state:viewFor(g,0)}));
  await expect(page.locator(".table-opening")).toBeVisible();
  await expect(page.locator(".table-opening.opening-entered")).toBeVisible();
  const transforms=await page.evaluate(async()=>{
    const result:string[]=[];const end=performance.now()+400;
    while(performance.now()<end){const e=document.querySelector(".opening-camera");if(e)result.push(getComputedStyle(e).transform);await new Promise(requestAnimationFrame);}
    return result;
  });
  expect(new Set(transforms).size).toBeGreaterThan(2);
  await expect(page.locator(".table-opening")).toHaveCount(0,{timeout:30000});
  expect(await page.evaluate(()=>(window as any).__openings)).toBe(1);
  g.round=2;g.revision++;
  socket.send(JSON.stringify({type:"state",state:viewFor(g,0)}));
  await expect.poll(async()=>(await renderedHand(page)).revision).toBe(g.revision);
  expect(await page.evaluate(()=>(window as any).__openings)).toBe(1);
});

});
