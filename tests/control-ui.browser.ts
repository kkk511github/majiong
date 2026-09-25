import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import type { AnnouncementReadPage } from '../shared/announcements';
import type {
  ControlAccount,
  ControlAnnouncement,
  ControlRelease,
} from "../src/control/types";

const actor: ControlAccount = {
  id: "test-admin",
  memberId: "100001",
  username: "testadmin",
  name: "测试管理员",
  role: "admin",
  canManageAdmins: true,
  canCreateTables: false,
  createdAt: 1780000000000,
  suspended: false,
};
const makeMember = (index: number): ControlAccount => ({
  id: `test-member-${index}`,
  memberId: String(100100 + index),
  username: `testmember${index}`,
  name: `测试成员${index}`,
  role: "member",
  teamId: null,
  teamName: null,
  createdAt: 1780000000000 + index * 60000,
  suspended: false,
  canManageAdmins: false,
  canCreateTables: false,
});
const release: ControlRelease = {
  id: "test-release",
  platform: "android",
  stage: "published",
  name: "测试安装包",
  packageId: "com.jinling.mahjong",
  version: "1.0.0",
  build: "100",
  size: 1024,
  sha256: "a".repeat(64),
  notes: "浏览器测试更新",
  createdAt: 1780000000000,
  createdBy: actor.username,
  publishedAt: 1780000000000,
  publishedBy: actor.username,
  productUrl: "",
  downloadUrl: "",
  minimumOsVersion: "24",
  distribution: "",
  signingMetadataPresent: true,
  provisioningExpiresAt: null,
  installationNote: "由系统验证安装条件",
  validation: {
    canPublish: true,
    errors: [],
    warnings: [],
    currentBuild: null,
    sameBuild: false,
    requiresSameBuildConfirmation: false,
    installationVerificationRequired: false,
  },
};

async function setup(page: Page, customActor = actor) {
  const state = {
    announcements: [] as ControlAnnouncement[],
    accounts: Array.from({ length: 24 }, (_, index) =>
      makeMember(index + 1),
    ).reverse(),
    current: [] as ControlRelease[],
    drafts: [] as ControlRelease[],
    posts: [] as { path: string; body: Record<string, unknown> }[],
    memberQueries: [] as Record<string, string>[],
    failAnnouncement: false,
    failMember: false,
    failUpload: false,
    updateSettings: { enabled: false, minimumVersion: '', revision: 0, updatedAt: 0, updatedBy: null as string | null },
    failSettings: false,
    receipts: [] as AnnouncementReadPage['readers'],
    readQueries: [] as Record<string, string>[],
    failReads: false,
  };
  await page.addInitScript(() => {
    sessionStorage.setItem("jinling.control.session.v1", "test-session");
    localStorage.setItem(
      "jinling:token",
      JSON.stringify("existing-game-token"),
    );
  });
  await page.route("**/api/control/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/control", "");
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/session") return send({ account: customActor });
    if (path === '/settings/client-update') {
      if (request.method() === 'GET') return send(state.updateSettings);
      const body = request.postDataJSON(); state.posts.push({ path, body });
      if (state.failSettings) { state.failSettings = false; return send({ error: '设置已变化，请刷新后再保存' }, 409); }
      state.updateSettings = { enabled: body.enabled, minimumVersion: body.minimumVersion, revision: state.updateSettings.revision + 1, updatedAt: Date.now(), updatedBy: customActor.id };
      return send(state.updateSettings);
    }
    if (path === "/auth/logout") return send({ ok: true });
    if (path === "/announcements" && request.method() === "GET")
      return send({ announcements: state.announcements });
    if (path.startsWith('/announcements/') && path.endsWith('/readers')) {
      const query = Object.fromEntries(url.searchParams); state.readQueries.push(query);
      if (state.failReads) return send({ error: '公告版本已变化，请刷新公告列表后查看' }, 409);
      const item = state.announcements.find(a => path.includes(a.id))!;
      const readCount = state.receipts.filter(r => r.readAt !== null).length;
      const stats = { revision: item.readStats!.revision, readCount, unreadCount: state.receipts.length - readCount, totalCount: state.receipts.length };
      let rows = state.receipts.filter(r => query.status === 'all' || (query.status === 'read' ? r.readAt !== null : r.readAt === null));
      if (query.q) rows = rows.filter(r => `${r.name} ${r.username} ${r.memberId}`.includes(query.q));
      const page = Number(query.page || 1);
      return send({ id: item.id, title: item.publishedTitle, status: item.status, stats, readers: rows.slice((page-1)*20, page*20), total: rows.length, page, pageSize: 20 });
    }
    if (path.startsWith("/announcements") && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.posts.push({ path, body });
      if (state.failAnnouncement) {
        state.failAnnouncement = false;
        return send({ error: "暂时无法保存，请重试" }, 503);
      }
      const previous = state.announcements.find((item) =>
        path.startsWith(`/announcements/${item.id}`),
      );
      let announcement: ControlAnnouncement;
      if (path.endsWith("/publish") && previous) {
        announcement = {
          ...previous,
          status: "published",
          revision: previous.revision + 1,
          publishedTitle: previous.draftTitle,
          publishedBody: previous.draftBody,
          publishedAt: 1780000000000,
          publishedBy: customActor.username,
        };
      } else if (path.endsWith("/withdraw") && previous) {
        announcement = {
          ...previous,
          status: "withdrawn",
          revision: previous.revision + 1,
          draftVersion: previous.draftVersion + 1,
        };
      } else {
        announcement = {
          id:
            previous?.id ||
            `test-announcement-${state.announcements.length + 1}`,
          status: previous?.status || "draft",
          draftTitle: String(body.title),
          draftBody: String(body.body),
          draftVersion: (previous?.draftVersion || 0) + 1,
          revision: previous?.revision || 0,
          publishedTitle: previous?.publishedTitle || null,
          publishedBody: previous?.publishedBody || null,
          createdAt: 1780000000000,
          updatedAt: 1780000000000,
          publishedAt: previous?.publishedAt || null,
          publishedBy: previous?.publishedBy || null,
        };
      }
      state.announcements = [
        announcement,
        ...state.announcements.filter((item) => item.id !== announcement.id),
      ];
      return send({ announcement });
    }
    if (path === "/teams")
      return send({
        teams: [{ id: "test-team", name: "测试战队", members: 0 }],
      });
    if (path === "/members") {
      const query = Object.fromEntries(url.searchParams);
      state.memberQueries.push(query);
      let accounts = state.accounts;
      if (query.q)
        accounts = accounts.filter((member) =>
          `${member.id} ${member.memberId} ${member.username} ${member.name}`.includes(
            query.q,
          ),
        );
      if (query.team === "unassigned")
        accounts = accounts.filter((member) => !member.teamId);
      else if (query.team)
        accounts = accounts.filter((member) => member.teamId === query.team);
      if (query.status)
        accounts = accounts.filter(
          (member) => !!member.suspended === (query.status === "suspended"),
        );
      const targetVersion=query.targetVersion||'0.8.0';
      const reached=(version:string)=>version.localeCompare(targetVersion,undefined,{numeric:true})>=0;
      const updated=accounts.filter(a=>a.clientVersion&&reached(a.clientVersion)).length,unknown=accounts.filter(a=>!a.clientVersion).length;
      const versionStats={targetVersion,total:accounts.length,updated,unknown,older:accounts.length-updated-unknown,asOf:Date.now()};
      if(query.versionStatus==='updated')accounts=accounts.filter(a=>a.clientVersion&&reached(a.clientVersion));
      if(query.versionStatus==='older')accounts=accounts.filter(a=>a.clientVersion&&!reached(a.clientVersion));
      if(query.versionStatus==='unknown')accounts=accounts.filter(a=>!a.clientVersion);
      const pageNumber = Number(query.page || 1);
      return send({
        versionStats,
        accounts: accounts.slice((pageNumber - 1) * 20, pageNumber * 20),
        total: accounts.length,
        page: pageNumber,
        pageSize: 20,
      });
    }
    if (path.endsWith("/audit")) return send({ audit: [] });
    if (path.startsWith("/members/") && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.posts.push({ path, body });
      if (state.failMember) {
        state.failMember = false;
        return send({ error: "当前无权保存，请稍后重试" }, 403);
      }
      if (path.endsWith("/delete")) {
        const id = decodeURIComponent(path.split("/").at(-2) || "");
        state.accounts = state.accounts.filter((member) => member.id !== id);
        return send({ ok: true, id });
      }
      const previous = state.accounts.find(
        (member) => path === `/members/${member.id}`,
      )!;
      const account = {
        ...previous,
        name: String(body.name),
        teamId: body.teamId as string | null,
        teamName: body.teamId === "test-team" ? "测试战队" : null,
      };
      state.accounts = state.accounts.map((member) =>
        member.id === account.id ? account : member,
      );
      return send({ account });
    }
    if (path === "/releases")
      return send({
        current: state.current,
        drafts: state.drafts,
        history: [],
      });
    if (path === "/releases/upload") {
      state.posts.push({ path, body: { multipart: request.postData() } });
      if (state.failUpload) {
        state.failUpload = false;
        return send({ error: "安装包校验暂时失败" }, 400);
      }
      if (state.current.length)
        return send({ release: state.current[0], alreadyPublished: true });
      if (state.drafts.length)
        return send({ draft: state.drafts[0], alreadyStaged: true });
      const draft: ControlRelease = {
        ...release,
        stage: "draft",
        publishedAt: null,
        publishedBy: null,
      };
      state.drafts = [draft];
      return send({ draft }, 201);
    }
    if (path === `/releases/${release.id}/publish`) {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.posts.push({ path, body });
      const draft = state.drafts[0];
      if (draft.validation.sameBuild && body.confirmSameBuild !== true)
        return send(
          {
            error: "需要确认相同Build",
            code: "SAME_BUILD_CONFIRMATION_REQUIRED",
          },
          409,
        );
      state.current = [
        { ...draft, stage: "published", publishedAt: 1780000000000 },
      ];
      state.drafts = [];
      return send({ release: state.current[0] });
    }
    return send({ error: `未定义测试路由 ${path}` }, 404);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "公告管理", exact: true }),
  ).toBeVisible();
  return state;
}

test('会员对局支持区间总桌数、分页、每日下钻、详情和窄屏',async({page})=>{
 await setup(page);
 const queries:URLSearchParams[]=[];
 await page.route('**/api/control/member-games**',async route=>{
  const url=new URL(route.request().url()),q=url.searchParams;
  const member={id:'member',memberId:'100022',name:'示例会员',username:'example',deleted:false};
  if(q.get('memberId')==='999999')return route.fulfill({status:404,json:{error:'会员ID不存在'}});
  if(url.pathname.endsWith('/game-0')){
   const record={id:'r1',at:Date.parse('2026-09-25T18:00:00+08:00'),round:8,names:['示例会员','乙','丙','丁'],playerIds:['member','p2','p3','p4'],scores:[120,90,95,95],initialScore:100,scoreDivisor:5,result:{reason:'draw',winners:[],details:{},deltas:[20,-10,-5,-5]}};
   return route.fulfill({json:{member,details:{match:{gameId:'game-0',code:'845400',record},rounds:[{gameId:'game-0',code:'845400',record}]}}});
  }
  queries.push(q);const single=q.get('from')===q.get('to'),current=Number(q.get('page')),empty=single&&q.get('from')==='2026-09-18';
  const items=Array.from({length:empty?0:single?1:current===2?3:20},(_,i)=>({gameId:`game-${i}`,code:String(845400+i),finishedAt:Date.parse('2026-09-25T18:00:00+08:00'),tableName:'50进园子',rounds:8,reason:'打满8把',experience:false,names:['示例会员','乙','丙','丁'],memberRecorded:4}));
  return route.fulfill({json:{member,from:q.get('from'),to:q.get('to'),timeZone:'Asia/Shanghai',totalTables:empty?0:single?1:23,page:current,pageSize:20,daily:single?[{date:q.get('from'),tables:empty?0:1}]:Array.from({length:8},(_,i)=>({date:`2026-09-${18+i}`,tables:i===7?23:0})),items}});
 });
 await page.getByRole('button',{name:'会员对局',exact:true}).click();
 await page.getByLabel('查询会员ID').fill('100022');
 await page.getByLabel('开始日期',{exact:true}).fill('2026-09-18');
 await page.getByLabel('结束日期',{exact:true}).fill('2026-09-25');
 await page.getByRole('button',{name:'查询对局',exact:true}).click();
 const summary=page.getByLabel('会员对局汇总');await expect(summary).toContainText('23');await expect(summary).toContainText('示例会员');
 await page.screenshot({path:'output/member-games-query-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.getByText('第 2 / 2 页',{exact:true})).toBeVisible();await expect(summary).toContainText('23');
 expect(queries.at(-1)?.get('page')).toBe('2');
 await page.getByRole('button',{name:'查看房间845400详情'}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('查询会员');await expect(dialog).toContainText('+4');await expect(dialog).toContainText('第8把');
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'2026-09-25 23 桌'}).click();await expect(page.getByLabel('开始日期',{exact:true})).toHaveValue('2026-09-25');
 await expect(page.getByText('共1桌',{exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/member-games-query-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'查看房间845400详情'}).click();await expect(dialog).toContainText('第8把');
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByLabel('查询会员ID').fill('999999');await page.getByRole('button',{name:'查询对局',exact:true}).click();await expect(page.getByText('会员ID不存在',{exact:true})).toBeVisible();await expect(summary).toHaveCount(0);
 await page.getByLabel('查询会员ID').fill('100022');await page.getByLabel('开始日期',{exact:true}).fill('2026-09-18');await page.getByLabel('结束日期',{exact:true}).fill('2026-09-18');await page.getByRole('button',{name:'查询对局',exact:true}).click();
 await expect(page.getByText('该会员所选日期内没有已结束牌桌。')).toBeVisible();
});

test('公告已读确认显示人数、名单、未读筛选、分页、刷新和版本冲突，不修改草稿或发送确认', async ({ page }) => {
  const state = await setup(page);
  state.announcements.push({ id: 'receipt-announcement', status: 'published', draftTitle: '阅读确认测试', draftBody: '内容', draftVersion: 1, revision: 1,
    publishedTitle: '阅读确认测试', publishedBody: '内容', createdAt: 1780000000000, updatedAt: 1780000000000, publishedAt: 1780000000000, publishedBy: 'admin',
    readStats: { revision: 1, readCount: 22, unreadCount: 2, totalCount: 24 } });
  state.receipts = Array.from({ length: 24 }, (_, i) => ({ id: `reader-${i+1}`, memberId: String(100001+i), name: `确认牌友${i+1}`, username: `member${i+1}`, readAt: i < 22 ? 1780000000000+i*1000 : null }));
  await page.getByRole('button', { name: '刷新公告列表' }).click();
  const row = page.getByRole('row').filter({ hasText: '阅读确认测试' });
  await expect(row).toContainText('已读 22 / 24 人');
  await page.getByLabel(/^公告标题/).fill('未保存输入');
  await row.getByRole('button', { name: '查看已读确认：阅读确认测试' }).click();
  const dialog = page.getByRole('dialog', { name: '公告已读确认' });
  await expect(dialog).toContainText('已读 22 人'); await expect(dialog).toContainText('未读 2 人');
  await expect(dialog.getByRole('row')).toHaveCount(21);
  await dialog.getByRole('button', { name: '下一页' }).click(); await expect(dialog).toContainText('确认牌友22');
  await expect(dialog.getByRole('row')).toHaveCount(3);
  await dialog.getByLabel('阅读状态').selectOption('unread'); await expect(dialog).toContainText('确认牌友23');
  expect(state.readQueries.at(-1)?.page).toBe('1');
  await dialog.getByLabel('搜索牌友').fill('100024'); await expect(dialog.getByRole('row')).toHaveCount(2);
  await expect(dialog).toContainText('共 24 人');
  state.receipts[23].readAt = 1780000100000;
  await dialog.getByRole('button', { name: '刷新阅读记录' }).click(); await expect(dialog).toContainText('已读 23 人');
  await expect(dialog).toContainText('没有符合搜索条件的牌友');
  state.failReads = true; await dialog.getByRole('button', { name: '刷新阅读记录' }).click();
  await expect(dialog.getByRole('alert')).toContainText('公告版本已变化');
  state.failReads = false; await dialog.getByRole('button', { name: '重试', exact: true }).click();
  await dialog.getByLabel('搜索牌友').fill(''); await dialog.getByLabel('阅读状态').selectOption('read');
  await expect(dialog.getByRole('row')).toHaveCount(21);
  await page.screenshot({ path: 'output/qa/announcement-reads.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = await dialog.boundingBox(); expect(fits!.x).toBeGreaterThanOrEqual(0); expect(fits!.x + fits!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByLabel(/^公告标题/)).toHaveValue('未保存输入');
  await expect(row).toContainText('已读 23 / 24 人');
  expect(state.posts).toEqual([]);
});

test('后台强更开关：确认发布后开启，失败保留输入，关闭后持久显示', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '后台设置', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '强制更新', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  const version = page.getByLabel('最低允许版本');
  const save = page.getByRole('button', { name: '保存更新设置', exact: true });
  await expect(save).toBeDisabled();
  await version.fill('0.7.37'); await save.click();
  const dialog = page.getByRole('dialog', { name: '确认启用强制更新' });
  await expect(dialog).toContainText('整桌结束');
  const confirm = dialog.getByRole('button', { name: '确认启用并保存' });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('checkbox').check(); await confirm.click();
  await expect(page.getByRole('status')).toContainText('已开启强制更新');
  expect(state.updateSettings).toMatchObject({ enabled: true, minimumVersion: '0.7.37' });
  await toggle.uncheck(); state.failSettings = true; await save.click();
  await expect(page.getByRole('alert')).toContainText('设置已变化');
  await expect(toggle).not.toBeChecked(); await expect(version).toHaveValue('0.7.37');
  expect(state.updateSettings.enabled).toBe(true);
  await save.click(); await expect(page.getByRole('status')).toContainText('已关闭强制更新');
  await page.reload(); await page.getByRole('button', { name: '后台设置', exact: true }).click();
  await expect(toggle).not.toBeChecked(); await expect(version).toHaveValue('0.7.37');
  await page.screenshot({ path: 'output/qa/client-update-settings.png', fullPage: true });
});

test("announcement drafts keep the online version unchanged until explicit publication", async ({
  page,
}) => {
  const state = await setup(page);
  state.failAnnouncement = true;
  await page.getByLabel(/^公告标题/).fill("测试发布标题");
  await page.getByLabel(/^公告正文/).fill("第一段\n第二段");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("暂时无法保存");
  await expect(page.getByLabel(/^公告正文/)).toHaveValue("第一段\n第二段");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  expect(state.posts[0].body.requestId).toBe(state.posts[1].body.requestId);
  expect(state.announcements[0].revision).toBe(0);
  expect(state.announcements[0].publishedBody).toBeNull();
  await page.getByRole("button", { name: "发布公告", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "确认发布公告" }),
  ).toBeVisible();
  expect(state.posts).toHaveLength(2);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  expect(state.announcements[0].status).toBe("draft");
  await page.getByRole("button", { name: "发布公告", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("公告已发布");
  expect(state.posts[2].body).toMatchObject({
    expectedRevision: 0,
    expectedDraftVersion: 1,
  });
  expect(state.posts[2].body.requestId).not.toBe(state.posts[1].body.requestId);
  await page.getByLabel(/^公告正文/).fill("新版正文");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  expect(state.announcements[0].publishedBody).toBe("第一段\n第二段");
  expect(state.announcements[0].revision).toBe(1);
  expect(state.announcements[0].draftBody).toBe("新版正文");
  await page
    .getByRole("row")
    .filter({ hasText: "测试发布标题" })
    .getByRole("button", { name: "预览", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".control-app-dialog-body"),
  ).toHaveText("第一段\n第二段");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "发布新版", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect.poll(() => state.announcements[0]?.revision).toBe(2);
  expect(state.announcements[0].publishedBody).toBe("新版正文");
  expect(await page.evaluate(() => localStorage.getItem("jinling:token"))).toBe(
    JSON.stringify("existing-game-token"),
  );
});

for(const platform of ['android','ios'])test(`administrator requests ${platform} diagnostics without a player confirmation`,async({page})=>{
 const state=await setup(page);let requested=false;
 await page.route('**/api/control/members/*/diagnostics',async route=>{
  const post=route.request().method()==='POST';if(post)requested=true;
  await route.fulfill({contentType:'application/json',body:JSON.stringify({connection:'ready',retentionDays:7,requests:requested?[{id:'00000000-0000-4000-8000-000000000001',source:'admin',actorId:actor.id,createdAt:Date.now(),expiresAt:Date.now()+86400000,status:post?'pending':'received',report:post?null:{version:1,platform,at:Date.now(),environment:{appVersion:'0.8.1',webViewVersion:'83.0.4103.120',ios:platform==='ios'?'15.3':'',model:'<img src=x onerror=alert(1)>'},events:[{at:Date.now(),code:'table-error',message:'roundRect is not a function',stack:'at /cocos-table/index.js:1'}]}}]:[]})});
 });
 await page.getByRole('button',{name:'人员管理',exact:true}).click();
 await page.getByRole('row').filter({hasText:state.accounts[0].username}).getByRole('button',{name:'诊断日志',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:new RegExp(state.accounts[0].name+' · 客户端诊断')});
 await dialog.getByRole('button',{name:'采集客户端日志',exact:true}).click();
 await expect(dialog.locator('p').filter({hasText:'等待设备上传'})).toBeVisible();
 await expect(dialog.getByRole('region',{name:'诊断报告'})).toBeVisible({timeout:10000});
 await expect(dialog).toContainText('83.0.4103.120');await expect(dialog).toContainText('roundRect is not a function');
 await expect(dialog.locator('.control-diagnostic-report img')).toHaveCount(0);
 await page.screenshot({path:`output/qa/${platform}-diagnostic-control.png`});
});

test('member version totals filter the whole list and fit mobile screens',async({page})=>{
 const state=await setup(page);
 state.accounts[0].clientVersion='0.8.0';state.accounts[0].versionReportedAt=Date.now();
 state.accounts[1].clientVersion='0.7.100';state.accounts[1].versionReportedAt=Date.now();
 await page.getByRole('button',{name:'人员管理',exact:true}).click();
 const panel=page.getByRole('region',{name:'软件版本统计'});
 await expect(panel.getByRole('button',{name:/已达 0.8.0/})).toContainText('1');
 await panel.getByRole('button',{name:/旧版本/}).click();
 await expect.poll(()=>state.memberQueries.at(-1)?.versionStatus).toBe('older');
 await expect(page.locator('.control-member-table tbody tr')).toHaveCount(1);
 await expect(page.locator('.control-member-table')).toContainText('0.7.100');
 await page.getByLabel('目标软件版本').fill('0.7.99');await page.getByRole('button',{name:'查询版本',exact:true}).click();
 await expect(panel.getByRole('button',{name:/已达 0.7.99/})).toContainText('2');
 await panel.getByRole('button',{name:/版本未知/}).click();
 await expect.poll(()=>state.memberQueries.at(-1)?.versionStatus).toBe('unknown');
 await expect(page.locator('.control-member-table tbody')).toContainText('尚未上报');
 await page.screenshot({path:'output/qa/member-versions-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(panel.getByRole('button',{name:'刷新统计'})).toBeVisible();
 await page.screenshot({path:'output/qa/member-versions-mobile.png',fullPage:true});
});

test("member paging resets for search and never interprets playBlocked as suspended", async ({
  page,
}) => {
  const state = await setup(page, { ...actor, canManageAdmins: false });
  state.accounts.unshift({
    ...makeMember(30),
    username: "oldplayblocked",
    playBlocked: true,
  });
  state.accounts.push({
    ...actor,
    id: "other-admin",
    username: "otheradmin",
    canManageAdmins: false,
  });
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect.poll(() => state.memberQueries.at(-1)?.page).toBe("2");
  await page
    .getByRole("textbox", { name: "搜索账号、用户 ID 或昵称" })
    .fill("oldplayblocked");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect
    .poll(() => state.memberQueries.at(-1))
    .toEqual({ q: "oldplayblocked", page: "1" });
  await expect(
    page.getByRole("row").filter({ hasText: "oldplayblocked" }),
  ).toContainText("正常");
  await page
    .getByRole("combobox", { name: "状态筛选" })
    .selectOption("suspended");
  await expect(
    page.getByText("没有符合条件的成员。可以调整筛选条件。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "重置筛选" }).click();
  await page
    .getByRole("textbox", { name: "搜索账号、用户 ID 或昵称" })
    .fill("otheradmin");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "otheradmin" })
    .getByRole("button", { name: "查看" })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel(/^昵称/)).toBeDisabled();
  await expect(drawer.getByRole("button", { name: "保存修改" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "重置密码" })).toBeDisabled();
  await expect(drawer.locator(".control-permissions")).toContainText(
    "开桌权限无",
  );
});

test("人员列表和编辑页显示已保存头像，缺失照片保留姓名占位", async ({ page }) => {
  const imagePath = `/api/avatars/00000000-0000-4000-8000-000000000024/${"a".repeat(64)}.jpg`;
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#b45533" } }).jpeg().toBuffer();
  let fetched = 0;
  await page.route(`**${imagePath}`, route => {
    fetched++;
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: image });
  });
  const state = await setup(page);
  state.accounts.find(member => member.username === "testmember24")!.avatar = imagePath;
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "testmember24" });
  const photo = row.getByRole("img", { name: "测试成员24的头像" });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(20);
  await row.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: "测试成员24的头像" })).toBeVisible();
  expect(fetched).toBeGreaterThan(0);
  await expect(page.getByRole("row").filter({ hasText: "testmember23" }).locator(".control-avatar img")).toHaveCount(0);
});

test("member saves keep inputs on permission failure and show the server's final team", async ({
  page,
}) => {
  const state = await setup(page);
  state.failMember = true;
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "testmember24" })
    .getByRole("button", { name: "编辑" })
    .click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel(/^昵称/).fill("改名测试");
  await drawer
    .getByRole("combobox", { name: "所属战队", exact: true })
    .selectOption("test-team");
  await expect(drawer).toContainText("未分配 → 测试战队");
  await drawer.getByRole("button", { name: "保存修改" }).click();
  await expect(drawer.getByRole("alert")).toContainText("当前无权保存");
  await expect(drawer.getByLabel(/^昵称/)).toHaveValue("改名测试");
  await drawer.getByRole("button", { name: "保存修改" }).click();
  await expect(drawer.getByRole("status")).toContainText("人员资料已更新");
  expect(state.posts.at(-1)?.body).toEqual({
    name: "改名测试",
    teamId: "test-team",
  });
  await drawer.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "testmember24" }),
  ).toContainText("测试战队");
});

test("member deletion requires the exact account and removes only the login account", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page);
  const member = state.accounts.find(
    (account) => account.username === "testmember24",
  )!;
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: member.username });
  await row.getByText("更多", { exact: true }).click();
  await row.getByRole("button", { name: "删除账号", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "删除账号", exact: true });
  await expect(drawer).toBeInViewport();
  await expect(drawer).toContainText(
    "已经完成的牌局、战绩、积分与回放继续保留",
  );
  const confirm = drawer.getByRole("button", {
    name: "确认删除账号",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await drawer.getByLabel("输入账号确认删除").fill(member.username);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    `账号 ${member.username} 已删除`,
  );
  await expect(
    page.getByRole("row").filter({ hasText: member.username }),
  ).toHaveCount(0);
  expect(state.accounts.some((account) => account.id === member.id)).toBe(
    false,
  );
  expect(state.posts.at(-1)).toEqual({
    path: `/members/${member.id}/delete`,
    body: {},
  });
});

test("package upload stages only and publishes the exact package after confirmation", async ({
  page,
}) => {
  const state = await setup(page);
  state.failUpload = true;
  await page.getByRole("button", { name: "版本管理", exact: true }).click();
  const android = page.locator(".control-platform-card").first();
  await android.locator('input[type="file"]').setInputFiles({
    name: "browser-fixture.apk",
    mimeType: "application/vnd.android.package-archive",
    buffer: Buffer.from("isolated browser test fixture"),
  });
  await android
    .getByRole("textbox", { name: "Android 更新说明" })
    .fill("浏览器测试更新");
  await android.getByRole("button", { name: "上传并校验" }).click();
  await expect(android.getByRole("alert")).toContainText("安装包校验暂时失败");
  await expect(
    android.getByRole("textbox", { name: "Android 更新说明" }),
  ).toHaveValue("浏览器测试更新");
  await expect(android.getByText("browser-fixture.apk")).toBeVisible();
  await android.getByRole("button", { name: "上传并校验" }).click();
  await expect(android.locator(".control-release-draft")).toContainText(
    "Build 100",
  );
  expect(state.current).toHaveLength(0);
  expect(state.drafts).toHaveLength(1);
  await android.getByRole("button", { name: "发布更新", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "确认发布更新" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  expect(state.current).toHaveLength(0);
  await android.getByRole("button", { name: "发布更新", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect(android.locator(".control-platform-heading")).toContainText(
    "v1.0.0 · Build 100",
  );
  expect(state.posts.at(-1)).toEqual({
    path: "/releases/test-release/publish",
    body: { sha256: release.sha256, build: "100" },
  });
  expect(state.drafts).toHaveLength(0);
  await android.getByText("查看包信息与校验结果").click();
  await expect(android).toContainText("最低 Android API24");
});

test("same-build replacement requires its own explicit acknowledgment", async ({
  page,
}) => {
  const state = await setup(page);
  state.drafts = [
    {
      ...release,
      stage: "draft",
      publishedAt: null,
      validation: {
        ...release.validation,
        sameBuild: true,
        requiresSameBuildConfirmation: true,
      },
    },
  ];
  await page.getByRole("button", { name: "版本管理", exact: true }).click();
  await page.getByRole("button", { name: "发布更新", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认发布更新" });
  await expect(
    dialog.getByRole("button", { name: "确认发布", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "确认发布", exact: true }).click();
  await expect.poll(() => state.current.length).toBe(1);
  expect(state.posts.at(-1)?.body).toEqual({
    sha256: release.sha256,
    build: "100",
    confirmSameBuild: true,
  });
});

test("mobile management fits the viewport and previews escaped announcement text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByLabel(/^公告标题/).fill("手机预览测试");
  await page.getByLabel(/^公告正文/).fill("<b>保持文本</b>\n第二段");
  await page.getByRole("button", { name: "预览", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "公告预览", exact: true });
  await expect(dialog.locator(".control-app-dialog-body")).toHaveText(
    "<b>保持文本</b>\n第二段",
  );
  await expect(dialog.locator(".control-app-dialog-body b")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "人员管理", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("withdrawal keeps unsaved inputs without allowing an unnoticed overwrite of a newer draft", async ({
  page,
}) => {
  const state = await setup(page);
  state.announcements = [
    {
      id: "concurrent-announcement",
      status: "published",
      draftTitle: "并发编辑测试",
      draftBody: "原正文",
      draftVersion: 1,
      revision: 1,
      publishedTitle: "并发编辑测试",
      publishedBody: "原正文",
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      publishedAt: 1780000000000,
      publishedBy: actor.username,
    },
  ];
  await page.getByRole("button", { name: "刷新公告列表" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "并发编辑测试" })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByLabel(/^公告正文/).fill("尚未保存的本地修改");
  state.announcements[0] = {
    ...state.announcements[0],
    draftBody: "另一管理员已保存的草稿",
    draftVersion: 2,
  };
  await page
    .getByRole("row")
    .filter({ hasText: "并发编辑测试" })
    .getByRole("button", { name: "撤回", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认撤回" })
    .click();
  await expect(page.getByLabel(/^公告正文/)).toHaveValue("尚未保存的本地修改");
  await expect(
    page.getByRole("button", { name: "保存草稿", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("重新载入最新草稿");
  expect(state.announcements[0].draftBody).toBe("另一管理员已保存的草稿");
});
