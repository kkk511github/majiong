import { expect, test } from "@playwright/test";
import { replayedRound } from "./fixtures/replayed-round";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "../src/legal-copy";

test("the built client opens a playable table without newer WebView APIs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    Object.defineProperty(Array.prototype, "at", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "structuredClone", { configurable: true, value: undefined });
  });
  await page.goto("/");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "同意并进入", exact: true }).click();
  await page.getByRole("button", { name: /先去单人练习/ }).click();
  await expect(page.locator(".cocos-loading")).toHaveCount(0, { timeout: 45000 });
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect(page.frameLocator('iframe[title="金陵麻将牌桌"]').locator("canvas")).toBeVisible();
  await expect(page.locator(".recovery")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the installed bundle opens records, details, replay and admin features with final asset filenames", async ({ page }) => {
  const errors: string[] = [], missing: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/assets/")) missing.push(r.url()); });
  const account = { id:"native-fixture", username:"native-fixture", name:"安装包验收", role:"admin", mustChangePassword:false, canManageAdmins:true, canCreateTables:true, canPlay:true };
  const g = replayedRound();
  const item = { game:g.id, code:g.code, me:0, practice:false, record:{ ...g.history[0], at:Date.now(), matchFinished:true, totalRounds:8 } };
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem("jinling:token", JSON.stringify("native-fixture-token"));
    localStorage.setItem(key, JSON.stringify({version,acceptedAt:"2026-09-16"}));
  }, {key:LEGAL_STORAGE_KEY,version:LEGAL_VERSION});
  // Intercept every account/game request; this exact production bundle must
  // never contact the production service during browser verification.
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/mahjong/, "");
    const json = path === "/api/auth/session" ? {account}
      : /\/api\/(admin\/)?records/.test(path) ? {records:[item],total:1,page:1,pageSize:20,dates:[]}
      : path.startsWith("/api/admin/match-reads/") ? {readAt:Date.now()}
      : path.startsWith("/api/matches/") ? {match:item,rounds:[{...item,record:g.history[0]}]}
      : path.startsWith("/api/replays/") ? g.replay
      : path === "/api/admin/teams" ? {teams:[]}
      : path.startsWith("/api/admin/members") ? {accounts:[],total:0,page:1,pageSize:20}
      : path.startsWith("/api/admin/points") ? {rows:[],total:0,page:1,pageSize:20,completedRounds:0,playerRounds:0,tables:0,points:0}
      : path.startsWith("/api/admin/table-permissions") ? {accounts:[],total:0,page:1,pageSize:20}
      : undefined;
    return route.fulfill({status:json ? 200 : 404,json:json ?? {error:"Unexpected test API path: "+path}});
  });
  await page.routeWebSocket("**/ws", ws => ws.onMessage(raw => {
    const m=JSON.parse(String(raw));
    if(m.type==="hello") {
      ws.send(JSON.stringify({type:"session",id:account.id,name:account.name,account,token:"native-fixture-token",tableLobby:true}));
      ws.send(JSON.stringify({type:"tables",tables:[]}));
    }
  }));
  await page.goto("/");
  await page.getByRole("button",{name:"战绩",exact:true}).click();
  await expect(page.locator(".records-workspace")).toBeVisible();
  await page.getByRole("button",{name:`查看房间 ${g.code} 最终战绩`,exact:true}).click();
  await expect(page.getByText("每把明细",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"摘要 / 反馈",exact:true}).click();
  await expect(page.getByLabel("导出内容预览")).toContainText("金陵麻将");
  await page.getByRole("dialog",{name:"战绩摘要与反馈",exact:true}).getByRole("button",{name:"关闭",exact:true}).click();
  await page.getByRole("button",{name:"回放",exact:true}).click();
  const replay=page.getByRole("dialog",{name:"牌局回放",exact:true});
  await expect(replay).toBeVisible();
  await expect(replay.locator(".cocos-loading")).toHaveCount(0,{timeout:45000});
  await expect(replay.locator("iframe")).toBeVisible();
  await replay.getByRole("button",{name:"关闭",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"关闭",exact:true}).click();
  await expect(page.locator(".record-read")).toBeVisible();
  await page.getByRole("button",{name:"我的",exact:true}).click();
  await page.getByRole("button",{name:"战队与会员",exact:true}).click();
  await expect(page.locator(".club-workspace")).toBeVisible();
  await page.getByRole("button",{name:"积分统计",exact:true}).click();
  await expect(page.getByRole("columnheader",{name:"桌数（8局/桌）",exact:true})).toBeVisible();
  await page.getByRole("dialog").getByRole("button",{name:"关闭",exact:true}).click();
  await page.getByRole("button",{name:"开桌授权",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"开桌授权",exact:true})).toBeVisible();
  await expect(page.locator(".feature-loading[role=alert]")).toHaveCount(0);
  expect(missing).toEqual([]);
  expect(errors).toEqual([]);
});
