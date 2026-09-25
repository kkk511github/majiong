import { afterEach, beforeAll, expect, it } from "vitest";
import { createServer, request } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createAccounts, hashPassword } from "../server/accounts";
import { createControl } from "../server/control";
import { createAnnouncements } from "../server/announcements";
import { createRecords } from "../server/records";
import { createClientUpdateSettings } from '../server/client-update-settings';
import {createClientVersionReports} from '../server/client-version-reports';
import type {RoundRecord} from '../shared/types';

function seedMemberGame(db:DatabaseSync,gameId:string,date:string,ids=['member','p2','p3','p4'],snapshot=gameId){
 const at=Date.parse(date),record:RoundRecord={id:snapshot,at,round:8,totalRounds:8,names:['查询会员','乙','丙','丁'],scores:[120,90,95,95],initialScore:100,scoreDivisor:5,playerIds:ids,tableName:'测试桌',endReason:'打满8把',matchFinished:true,result:{reason:'draw',winners:[],details:{},deltas:[20,-10,-5,-5]}};
 db.prepare('INSERT INTO match_records VALUES (?,?,?,?,?,?,?)').run(snapshot,gameId,'123456',at,JSON.stringify(ids),0,JSON.stringify(record));
 db.prepare('INSERT INTO round_records VALUES (?,?,?,?,?,?,?)').run(snapshot,gameId,'123456',at,JSON.stringify(ids),0,JSON.stringify(record));
 return record;
}

const secret = "Fixture-2026";
let encoded: string;
beforeAll(async () => {
  encoded = await hashPassword(secret);
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

async function fixture(withRecords=false) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,id TEXT UNIQUE,name TEXT,last_seen INTEGER)",
  );
  const revoked: string[] = [];
  const accounts = createAccounts(db, (id) => revoked.push(id));
  for (const [id, username, role] of [
    ["guardian", "guanli@1", "admin"],
    ["admin", "second-admin", "admin"],
    ["member", "ordinary-member", "member"],
  ])
    db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,0,?)").run(
      id,
      username,
      id,
      encoded,
      role,
      1000,
    );
  let changed = 0;
  if(withRecords)db.exec('CREATE TABLE rooms(code TEXT PRIMARY KEY,state TEXT); CREATE TABLE table_archives(id TEXT PRIMARY KEY,state TEXT,at INTEGER);');
  const records=withRecords?createRecords(db,accounts.getAvatar):undefined;
  const updateSettings = createClientUpdateSettings(db, () => []);
  const control = createControl(db, accounts, () => {
    changed++;
  }, updateSettings,undefined,records);
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url!, "http://localhost");
    if (await control.handle(req, res, url)) return;
    if (await accounts.handle(req, res, url.pathname)) return;
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    db.close();
  });
  const call = async (path: string, token?: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  async function login(username = "guanli@1", admin = true, password = secret) {
    const response = await call(
      `/api/${admin ? "control/" : ""}auth/login`,
      undefined,
      { username, password },
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body.token as string;
  }
  return {
    db,
    base,
    accounts,
    control,
    server,
    call,
    login,
    revoked,
    changed: () => changed,
  };
}

it('会员对局仅管理员可查，按北京时间含首尾日，整桌去重且不按战队过滤',async()=>{
 const f=await fixture(true),token=await f.login(),memberId=f.accounts.getAccount('member')!.memberId!;
 const path=`/api/control/member-games?memberId=${memberId}&from=2026-9-18&to=2026-9-25`;
 seedMemberGame(f.db,'before','2026-09-17T23:59:59.999+08:00');
 seedMemberGame(f.db,'first','2026-09-18T00:00:00+08:00');
 seedMemberGame(f.db,'last','2026-09-25T23:59:59.999+08:00');
 seedMemberGame(f.db,'after','2026-09-26T00:00:00+08:00');
 seedMemberGame(f.db,'unrelated','2026-09-23T10:00:00+08:00',['p1','p2','p3','p4']);
 seedMemberGame(f.db,'first','2026-09-18T01:00:00+08:00',undefined,'first-new');
 expect((await f.call(path)).status).toBe(401);
 const memberToken=await f.login('ordinary-member',false);
 expect((await f.call(path,memberToken)).status).toBe(403);
 expect((await f.call(path,token,{})).status).toBe(405);
 const response=await f.call(path,token);expect(response.status).toBe(200);
 expect(response.body).toMatchObject({totalTables:2,from:'2026-09-18',to:'2026-09-25',timeZone:'Asia/Shanghai'});
 expect(response.body.items.map((r:{gameId:string})=>r.gameId)).toEqual(['last','first']);
 expect(response.body.items[1].memberRecorded).toBe(4);
 expect(response.body.daily).toHaveLength(8);
 expect(response.body.daily.map((d:{tables:number})=>d.tables)).toEqual([1,0,0,0,0,0,0,1]);
 const detail=`/api/control/member-games/first?memberId=${memberId}`;
 expect((await f.call(detail,memberToken)).status).toBe(403);
 expect((await f.call(detail,token,{})).status).toBe(405);
 const details=await f.call(detail,token);expect(details.status).toBe(200);expect(details.body.details.match.record.id).toBe('first-new');
 expect((await f.call(`/api/control/member-games/unrelated?memberId=${memberId}`,token)).status).toBe(404);
});

it('会员对局总数不受20桌分页影响，账号删除后仍可查历史，进行中不计入',async()=>{
 const f=await fixture(true),token=await f.login(),memberId=f.accounts.getAccount('member')!.memberId!;
 for(let i=0;i<23;i++)seedMemberGame(f.db,`game-${i}`,'2026-09-23T12:00:00+08:00');
 const path=`/api/control/member-games?memberId=${memberId}&from=2026-09-23&to=2026-09-23`;
 const first=(await f.call(path,token)).body,second=(await f.call(path+'&page=2',token)).body;
 expect(first.totalTables).toBe(23);expect(first.items).toHaveLength(20);
 expect(second.totalTables).toBe(23);expect(second.items).toHaveLength(3);
 expect(new Set([...first.items,...second.items].map(r=>r.gameId)).size).toBe(23);
 f.db.prepare('DELETE FROM accounts WHERE id=?').run('member');
 const deleted=(await f.call(path,token)).body;expect(deleted.member.deleted).toBe(true);expect(deleted.totalTables).toBe(23);
 const empty=(await f.call(path.replaceAll('2026-09-23','2026-09-24'),token)).body;expect(empty.totalTables).toBe(0);expect(empty.items).toEqual([]);
});

it('会员对局校验会员ID、真实日期、查询跨度及页码',async()=>{
 const f=await fixture(true),token=await f.login(),memberId=f.accounts.getAccount('member')!.memberId!;
 const valid={memberId,from:'2026-09-18',to:'2026-09-25'};
 const invalid:Record<string,string>[]=[{memberId:'abc'},{from:'2026-02-30'},{from:'2026-09-26'},{from:'2025-01-01'},{page:'0'},{page:'1.5'},{to:''}];
 for(const overrides of invalid){
  expect((await f.call('/api/control/member-games?'+new URLSearchParams({...valid,...overrides}),token)).status).toBe(400);
 }
 expect((await f.call('/api/control/member-games?'+new URLSearchParams({...valid,memberId:'999999999999'}),token)).status).toBe(404);
});

it('version counts are admin-only, unique per account and independent of version pagination',async()=>{
 const f=await fixture(),token=await f.login(),reports=createClientVersionReports(f.db);
 reports.record('guardian','0.8.0',1000);reports.record('guardian','0.8.0',2000);reports.record('member','0.7.100',3000);
 const base='/api/control/members?targetVersion=0.8.0';
 expect((await f.call(base)).status).toBe(401);
 expect((await f.call(base,await f.login('ordinary-member',false))).status).toBe(403);
 const all=(await f.call(base,token)).body;
 expect(all.versionStats).toMatchObject({total:3,updated:1,older:1,unknown:1,targetVersion:'0.8.0'});
 expect(all.accounts.find((a:{id:string})=>a.id==='guardian')).toMatchObject({clientVersion:'0.8.0',versionReportedAt:2000});
 for(const [status,id] of [['updated','guardian'],['older','member'],['unknown','admin']]){
  const r=(await f.call(base+'&versionStatus='+status,token)).body;expect(r.total).toBe(1);expect(r.accounts[0].id).toBe(id);expect(r.versionStats.total).toBe(3);
  expect((await f.call(base+'&versionStatus='+status+'&page=2',token)).body.accounts).toEqual([]);
 }
 expect((await f.call(base+'&q=ordinary-member',token)).body.versionStats).toMatchObject({total:1,older:1,updated:0,unknown:0});
 reports.record('member',undefined,4000);
 expect((await f.call(base,token)).body.versionStats.unknown).toBe(2);
 expect((await f.call(base+'&versionStatus=nope',token)).status).toBe(400);
 expect((await f.call('/api/control/members?targetVersion=garbage',token)).status).toBe(400);
});

it("后台沿用APP单账号会话，每次请求核验管理员身份且不能绕过独占开桌规则", async () => {
  const f = await fixture();
  const app = await f.login("guanli@1", false),
    control = await f.login();
  expect(f.revoked).toEqual(["guardian", "guardian"]);
  expect((await f.call("/api/auth/session", app)).status).toBe(401);
  expect((await f.call("/api/control/auth/session", app)).status).toBe(401);
  expect((await f.call("/api/auth/session", control)).status).toBe(200);
  expect(
    (
      await f.call("/api/control/auth/login", undefined, {
        username: "ordinary-member",
        password: secret,
      })
    ).status,
  ).toBe(403);
  const second = await f.login("second-admin");
  const member = await f.call("/api/control/members/member", second, {
    name: "guanli@1",
    teamId: "team-1",
  });
  expect(member.body.account.canCreateTables).toBe(false);
  expect(
    (
      await f.call("/api/control/members/member", second, {
        name: "新昵称",
        teamId: null,
        role: "admin",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.call("/api/control/members/guardian", second, {
        name: "新昵称",
        teamId: null,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.call("/api/control/members/admin/password", second, {
        password: "new-password",
        confirmPassword: "new-password",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.call("/api/control/members/guardian/suspension", control, {
        suspended: true,
      })
    ).status,
  ).toBe(403);
  f.db.prepare("UPDATE accounts SET role='member' WHERE id='admin'").run();
  expect((await f.call("/api/control/members", second)).status).toBe(403);
  await f.call("/api/control/auth/logout", control, {});
  expect((await f.call("/api/control/auth/session", control)).status).toBe(401);
  expect((await f.call("/api/auth/session", app)).status).toBe(401);
});

it('后台更新开关仅限管理员，支持实时启停、版本校验、冲突保护与审计', async () => {
  const f = await fixture();
  const admin = await f.login(), member = await f.login('ordinary-member', false);
  const path = '/api/control/settings/client-update';
  expect((await f.call(path)).status).toBe(401);
  expect((await f.call(path, member)).status).toBe(403);
  expect((await f.call(path, member, { enabled: true, minimumVersion: '0.7.37', revision: 0 })).status).toBe(403);
  expect((await f.call(path, admin)).body).toMatchObject({ enabled: false, revision: 0 });
  expect((await f.call(path, admin, { enabled: true, minimumVersion: '', revision: 0 })).status).toBe(400);
  expect((await f.call(path, admin, { enabled: true, minimumVersion: '0.7.37', revision: 0 })).body).toMatchObject({ enabled: true, revision: 1 });
  expect((await f.call(path, admin, { enabled: false, minimumVersion: '0.7.37', revision: 0 })).status).toBe(409);
  expect((await f.call(path, admin, { enabled: false, minimumVersion: '0.7.37', revision: 1 })).body).toMatchObject({ enabled: false, revision: 2 });
  expect(f.db.prepare('SELECT * FROM client_update_audit').all()).toHaveLength(2);
});

it("公告草稿与线上分离，确认发布幂等且受并发保护，跨设备已读和撤回持续有效", async () => {
  const f = await fixture(),
    admin = await f.login(),
    member = await f.login("ordinary-member", false);
  const empty = { title: "", body: "", requestId: randomUUID() };
  const created = await f.call("/api/control/announcements", admin, empty);
  expect(created.status).toBe(200);
  const draft = created.body.announcement,
    path = `/api/control/announcements/${draft.id}`;
  expect(draft).toMatchObject({
    status: "draft",
    draftVersion: 1,
    revision: 0,
    publishedTitle: null,
    publishedBody: null,
    publishedAt: null,
    publishedBy: null,
  });
  expect(
    (await f.call("/api/control/announcements", admin, empty)).body,
  ).toEqual(created.body);
  expect((await f.call("/api/control/announcements", member)).status).toBe(403);
  expect(
    (
      await f.call(path + "/publish", admin, {
        expectedRevision: 0,
        expectedDraftVersion: 1,
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(400);
  expect(f.changed()).toBe(0);
  const firstDraft = {
    title: "<b>标题</b>",
    body: "第一版\n原样文本",
    expectedDraftVersion: 1,
    requestId: randomUUID(),
  };
  const saved = await f.call(path, admin, firstDraft);
  expect(saved.body.announcement).toMatchObject({
    status: "draft",
    draftVersion: 2,
    revision: 0,
    draftTitle: firstDraft.title,
    draftBody: firstDraft.body,
    publishedTitle: null,
  });
  expect((await f.call(path, admin, firstDraft)).body).toEqual(saved.body);
  expect(
    (await f.call(path, admin, { ...firstDraft, body: "不能复用编号覆盖" }))
      .status,
  ).toBe(409);
  expect((await f.call("/api/announcements", member)).body).toEqual({
    announcements: [],
    unreadCount: 0,
  });
  expect(
    (await f.call("/api/control/announcements", admin)).body.announcements[0]
      .status,
  ).toBe("draft");
  expect(f.changed()).toBe(0);
  const publish = {
    expectedRevision: 0,
    expectedDraftVersion: 2,
    requestId: randomUUID(),
  };
  const published = await f.call(path + "/publish", admin, publish);
  expect(published.body.announcement).toMatchObject({
    status: "published",
    revision: 1,
    draftVersion: 2,
    publishedTitle: firstDraft.title,
    publishedBody: firstDraft.body,
  });
  expect((await f.call(path + "/publish", admin, publish)).body).toEqual(
    published.body,
  );
  expect(
    (
      await f.call(path + "/publish", admin, {
        ...publish,
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect(f.changed()).toBe(1);
  const list = (await f.call("/api/announcements", member)).body;
  expect(list.announcements[0]).toMatchObject({
    title: "<b>标题</b>",
    body: "第一版\n原样文本",
    revision: 1,
    unread: true,
  });
  expect(list.announcements[0]).not.toHaveProperty("draftTitle");
  const readPath = `/api/announcements/${draft.id}/read`;
  const firstRead = await f.call(readPath, member, { revision: 1 });
  expect(firstRead.status).toBe(200);
  expect((await f.call(readPath, member, { revision: 1 })).body).toEqual(
    firstRead.body,
  );
  const anotherDevice = await f.login("ordinary-member", false);
  expect(
    (await f.call("/api/announcements", anotherDevice)).body.unreadCount,
  ).toBe(0);
  expect(createAnnouncements(f.db).published("member").unreadCount).toBe(0);
  const edit = {
    title: "新版标题",
    body: "新内容",
    expectedDraftVersion: 2,
    requestId: randomUUID(),
  };
  const revisedDraft = await f.call(path, admin, edit);
  expect(revisedDraft.body.announcement).toMatchObject({
    status: "published",
    draftVersion: 3,
    draftTitle: "新版标题",
    revision: 1,
    publishedTitle: firstDraft.title,
  });
  expect((await f.call(path, admin, edit)).body).toEqual(revisedDraft.body);
  expect(
    (await f.call(path, admin, { ...edit, requestId: randomUUID() })).status,
  ).toBe(409);
  expect(
    (await f.call("/api/announcements", anotherDevice)).body.announcements[0],
  ).toMatchObject({
    title: firstDraft.title,
    revision: 1,
    readRevision: 1,
    unread: false,
  });
  expect(f.changed()).toBe(1);
  expect(
    (
      await f.call(path + "/publish", admin, {
        expectedRevision: 1,
        expectedDraftVersion: 2,
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const publishRevision = {
    expectedRevision: 1,
    expectedDraftVersion: 3,
    requestId: randomUUID(),
  };
  expect(
    (await f.call(path + "/publish", admin, publishRevision)).body.announcement
      .revision,
  ).toBe(2);
  expect(
    (await f.call(path + "/publish", admin, publishRevision)).body.announcement
      .revision,
  ).toBe(2);
  expect(
    (await f.call("/api/announcements", anotherDevice)).body.announcements[0],
  ).toMatchObject({
    title: "新版标题",
    readRevision: 1,
    revision: 2,
    unread: true,
  });
  expect((await f.call(readPath, anotherDevice, { revision: 1 })).status).toBe(
    409,
  );
  const withdraw = { expectedRevision: 2, requestId: randomUUID() };
  const withdrawn = await f.call(path + "/withdraw", admin, withdraw);
  expect(withdrawn.body.announcement).toMatchObject({
    status: "withdrawn",
    revision: 3,
    draftVersion: 4,
  });
  expect((await f.call(path + "/withdraw", admin, withdraw)).body).toEqual(
    withdrawn.body,
  );
  expect(f.changed()).toBe(3);
  expect(
    (
      await f.call(path + "/publish", admin, {
        expectedRevision: 2,
        expectedDraftVersion: 3,
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect((await f.call(readPath, anotherDevice, { revision: 2 })).status).toBe(
    409,
  );
  expect(
    (await f.call("/api/announcements", anotherDevice)).body.announcements,
  ).toEqual([]);
  const editedWithdrawal = await f.call(path, admin, {
    title: "撤回后编辑",
    body: "仍需确认发布",
    expectedDraftVersion: 4,
    requestId: randomUUID(),
  });
  expect(editedWithdrawal.body.announcement).toMatchObject({
    status: "withdrawn",
    revision: 3,
    draftVersion: 5,
  });
  expect(
    (await f.call("/api/announcements", anotherDevice)).body.announcements,
  ).toEqual([]);
  expect(f.changed()).toBe(3);
  expect(
    f.db.prepare("SELECT COUNT(*) AS n FROM announcement_reads").get()!.n,
  ).toBe(1);
  expect(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM announcement_audit WHERE event IN ('published','withdrawn')",
      )
      .get()!.n,
  ).toBe(3);
});

it('管理员可查询按当前发布版本去重的已读/未读人数、名单和确认时间，普通用户不能查询', async () => {
  const f = await fixture(), admin = await f.login(), member = await f.login('ordinary-member', false);
  const draft = (await f.call('/api/control/announcements', admin, { title: '已读统计', body: '确认内容', requestId: randomUUID() })).body.announcement;
  const path = `/api/control/announcements/${draft.id}`;
  expect((await f.call('/api/control/announcements', admin)).body.announcements[0].readStats).toBeNull();
  expect((await f.call(path + '/readers?revision=0', admin)).status).toBe(409);
  await f.call(path + '/publish', admin, { expectedRevision: 0, expectedDraftVersion: 1, requestId: randomUUID() });
  await f.call('/api/announcements', member); // Opening the list is not confirmation.
  expect((await f.call('/api/control/announcements', admin)).body.announcements[0].readStats)
    .toEqual({ revision: 1, readCount: 0, unreadCount: 3, totalCount: 3 });
  const readPath = `/api/announcements/${draft.id}/read`;
  const first = await f.call(readPath, member, { revision: 1, accountId: 'guardian' });
  expect((await f.call(readPath, member, { revision: 1 })).body).toEqual(first.body);
  const query = path + '/readers?revision=1';
  expect((await f.call(query)).status).toBe(401); expect((await f.call(query, member)).status).toBe(403);
  const read = await f.call(query, admin);
  expect(read.body.stats).toEqual({ revision: 1, readCount: 1, unreadCount: 2, totalCount: 3 });
  expect(read.body.readers).toEqual([{ id: 'member', name: 'member', username: 'ordinary-member', memberId: expect.any(String), readAt: first.body.readAt }]);
  const unread = await f.call(query + '&status=unread', admin);
  expect(unread.body.total).toBe(2); expect(unread.body.readers.every((r: { readAt: unknown }) => r.readAt === null)).toBe(true);
  expect((await f.call(query + '&q=missing', admin)).body).toMatchObject({ total: 0, readers: [], stats: { readCount: 1, totalCount: 3 } });
  expect((await f.call(query + '&page=-1', admin)).status).toBe(400);
  expect((await f.call(query + '&status=invalid', admin)).status).toBe(400);
  expect((await f.call(path + '/readers?revision=2', admin)).status).toBe(409);
  expect(f.db.prepare('SELECT COUNT(*) n FROM announcement_reads').get()!.n).toBe(1);

  await f.call(path, admin, { title: '未发布的草稿', body: '修改', expectedDraftVersion: 1, requestId: randomUUID() });
  expect((await f.call(query, admin)).body).toMatchObject({ title: '已读统计', stats: { revision: 1, readCount: 1 } });
  await f.call(path + '/withdraw', admin, { expectedRevision: 1, requestId: randomUUID() });
  expect((await f.call(query, admin)).body).toMatchObject({ status: 'withdrawn', stats: { revision: 1, readCount: 1 } });
  await f.call(path + '/publish', admin, { expectedRevision: 2, expectedDraftVersion: 3, requestId: randomUUID() });
  expect((await f.call('/api/control/announcements', admin)).body.announcements[0].readStats)
    .toEqual({ revision: 3, readCount: 0, unreadCount: 3, totalCount: 3 });
  expect((await f.call(query, admin)).status).toBe(409);
  await f.call(readPath, member, { revision: 3 });
  expect((await f.call(path + '/readers?revision=3', admin)).body.stats.readCount).toBe(1);
  expect(f.db.prepare('SELECT COUNT(*) n FROM announcement_reads').get()!.n).toBe(2);
});

it('阅读统计明确排除不可登录/删除账号，包含新账号，分页和搜索不会改变总人数口径', async () => {
  const f = await fixture(), admin = await f.login();
  const service = createAnnouncements(f.db);
  const { announcement: draft } = service.save('guardian', undefined, { title: '分页统计', body: '内容', requestId: randomUUID() });
  service.publish('guardian', draft.id, { expectedRevision: 0, expectedDraftVersion: 1, requestId: randomUUID() });
  for (let i = 0; i < 24; i++) f.db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?,?)').run(`reader-${i}`, `reader${i}`, `昵称${i}`, encoded, 'member', 0, Date.now());
  service.read('reader-0', draft.id, 1); service.read('reader-1', draft.id, 1);
  f.db.prepare('INSERT INTO account_suspensions VALUES (?,?,?,?,?)').run('reader-0', 1, '', 'guardian', Date.now());
  f.db.exec("UPDATE accounts SET must_change=1 WHERE id='reader-2'; DELETE FROM accounts WHERE id='reader-1';");
  const path = `/api/control/announcements/${draft.id}/readers?revision=1&status=unread`;
  const first = (await f.call(path, admin)).body, second = (await f.call(path + '&page=2', admin)).body;
  expect(first.stats).toEqual({ revision: 1, readCount: 0, unreadCount: 24, totalCount: 24 });
  expect(first.readers).toHaveLength(20); expect(second.readers).toHaveLength(4);
  expect(new Set([...first.readers, ...second.readers].map(r => r.id)).size).toBe(24);
  const search = (await f.call(path + '&q=' + encodeURIComponent('昵称23'), admin)).body;
  expect(search.total).toBe(1); expect(search.stats.totalCount).toBe(24); expect(search.readers[0].username).toBe('reader23');
  f.db.exec("UPDATE account_suspensions SET suspended=0 WHERE account_id='reader-0';");
  expect(service.list().announcements[0].readStats).toEqual({ revision: 1, readCount: 1, unreadCount: 24, totalCount: 25 });
});

it("公告确认发布与审计及幂等收据为一个事务，失败保留草稿和线上内容", async () => {
  const f = await fixture(),
    admin = await f.login(),
    member = await f.login("ordinary-member", false);
  const created = await f.call("/api/control/announcements", admin, {
    title: "待确认公告",
    body: "事务失败时不发布",
    requestId: randomUUID(),
  });
  const id = created.body.announcement.id;
  const publish = {
    expectedRevision: 0,
    expectedDraftVersion: 1,
    requestId: randomUUID(),
  };
  f.db.exec(
    "CREATE TRIGGER announcement_audit_failure BEFORE INSERT ON announcement_audit WHEN new.event='published' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;",
  );
  expect(
    (await f.call(`/api/control/announcements/${id}/publish`, admin, publish))
      .status,
  ).toBe(500);
  expect(
    (await f.call("/api/announcements", member)).body.announcements,
  ).toEqual([]);
  expect(
    (await f.call("/api/control/announcements", admin)).body.announcements[0],
  ).toMatchObject({ status: "draft", revision: 0, publishedTitle: null });
  expect(
    f.db
      .prepare("SELECT 1 FROM announcement_requests WHERE request_id=?")
      .get(publish.requestId),
  ).toBeUndefined();
  expect(f.changed()).toBe(0);
  f.db.exec("DROP TRIGGER announcement_audit_failure");
  expect(
    (await f.call(`/api/control/announcements/${id}/publish`, admin, publish))
      .status,
  ).toBe(200);
  expect(
    (await f.call("/api/announcements", member)).body.announcements[0].title,
  ).toBe("待确认公告");
  expect(f.changed()).toBe(1);
});

it("人员列表按真实注册时间及rowid稳定分页，昵称与战队写入原子且保留会员报表审计", async () => {
  const f = await fixture(),
    token = await f.login();
  for (let i = 0; i < 25; i++)
    f.db
      .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,0,?)")
      .run(`page-${i}`, `page-${i}`, `用户${25 - i}`, encoded, "member", 2000);
  const first = (await f.call("/api/control/members", token)).body;
  const second = (await f.call("/api/control/members?page=2", token)).body;
  expect(first).toMatchObject({ total: 28, page: 1, pageSize: 20 });
  expect(first.accounts.map((a: { id: string }) => a.id)).toEqual(
    Array.from({ length: 20 }, (_, i) => `page-${24 - i}`),
  );
  expect(second.accounts[0].id).toBe("page-4");
  expect(
    first.accounts.every((a: { createdAt: number }) => a.createdAt === 2000),
  ).toBe(true);
  expect(
    (await f.call("/api/control/members?q=page-24", token)).body.total,
  ).toBe(1);
  const memberId = f.accounts.getAccount("member")!.memberId;
  expect(
    (await f.call(`/api/control/members?q=${memberId}`, token)).body.accounts[0]
      .id,
  ).toBe("member");
  expect(
    (
      await f.call("/api/control/members/member", token, {
        name: "已改昵称",
        teamId: "team-1",
      })
    ).status,
  ).toBe(200);
  const audit = f.db
    .prepare(
      "SELECT event FROM account_audit WHERE account_id='member' AND json_extract(event,'$.event')='membership-changed'",
    )
    .get()!;
  expect(JSON.parse(String(audit.event))).toMatchObject({
    teamId: "team-1",
    actorId: "guardian",
  });
  expect(
    (await f.call("/api/control/members?team=team-1", token)).body.total,
  ).toBe(1);
  expect(
    (await f.call("/api/control/members?team=unassigned", token)).body.total,
  ).toBe(27);
  f.db.exec(
    `CREATE TRIGGER audit_failure BEFORE INSERT ON account_audit WHEN json_valid(new.event) AND json_extract(new.event,'$.event')='membership-changed' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`,
  );
  expect(
    (
      await f.call("/api/control/members/member", token, {
        name: "不得保存",
        teamId: "team-2",
      })
    ).status,
  ).toBe(500);
  expect(f.accounts.getAccount("member")).toMatchObject({
    name: "已改昵称",
    teamId: "team-1",
  });
});

it("删除账号会撤销会话和当前归属，同时保留会员编号、历史战绩、回放与审计", async () => {
  const f = await fixture(),
    memberToken = await f.login("ordinary-member", false),
    root = await f.login();
  f.db.exec(
    `CREATE TABLE rooms(id TEXT PRIMARY KEY,state TEXT,updated_at INTEGER);
    CREATE TABLE table_archives(id TEXT PRIMARY KEY,state TEXT,at INTEGER);
    CREATE TABLE table_creations(session_id TEXT,creation_id TEXT,codes TEXT,PRIMARY KEY(session_id,creation_id));`,
  );
  createRecords(f.db);
  f.db
    .prepare("INSERT INTO team_memberships VALUES (?,?,?,?,?)")
    .run("member", "team-1", 1, "guardian", 1000);
  f.db
    .prepare("INSERT INTO table_permissions VALUES (?,?,?,?)")
    .run("member", 0, "guardian", 1000);
  f.db
    .prepare("INSERT INTO account_avatars VALUES (?,?,?)")
    .run("member", "avatar", Buffer.from("avatar"));
  f.db
    .prepare("INSERT INTO account_suspensions VALUES (?,?,?,?,?)")
    .run("member", 0, "", "guardian", 1000);
  f.db
    .prepare("INSERT INTO announcement_reads VALUES (?,?,?,?)")
    .run("member", "announcement", 1, 1000);
  f.db
    .prepare("INSERT INTO announcement_requests VALUES (?,?,?,?,?)")
    .run("member", "request", "fingerprint", "{}", 1000);
  f.db
    .prepare("INSERT INTO admin_match_reads VALUES (?,?,?)")
    .run("game", "member", 1000);
  f.db
    .prepare("INSERT INTO table_creations VALUES (?,?,?)")
    .run("member", "creation", "[]");

  f.db
    .prepare("INSERT INTO round_replays VALUES (?,?)")
    .run("replay", Buffer.from("historical-replay"));
  f.db
    .prepare("INSERT INTO round_records VALUES (?,?,?,?,?,?,?)")
    .run("round", "game", "123456", 1000, '["member"]', 0, "{}");
  f.db
    .prepare("INSERT INTO match_records VALUES (?,?,?,?,?,?,?)")
    .run("match", "game", "123456", 1000, '["member"]', 0, "{}");
  f.db
    .prepare("INSERT INTO round_rosters VALUES (?,?,?,?,?)")
    .run("game", 1, "member", "team-1", "一生所爱战队");
  f.db
    .prepare("INSERT INTO point_records VALUES (?,?,?,?,?,?,?,?)")
    .run(
      "round",
      "game",
      1000,
      "member",
      "ordinary-member",
      "team-1",
      "一生所爱战队",
      20,
    );
  const memberId = f.accounts.getAccount("member")!.memberId;

  expect(
    (await f.call("/api/control/members/member/delete", undefined, {})).status,
  ).toBe(401);
  expect(
    (await f.call("/api/control/members/member/delete", memberToken, {}))
      .status,
  ).toBe(403);
  const removed = await f.call("/api/control/members/member/delete", root, {});
  expect(removed).toEqual({ status: 200, body: { ok: true, id: "member" } });
  expect(f.accounts.getAccount("member")).toBeUndefined();
  expect((await f.call("/api/auth/session", memberToken)).status).toBe(401);
  expect(f.revoked).toContain("member");

  for (const [table, column] of [
    ["sessions", "id"],
    ["team_memberships", "account_id"],
    ["table_permissions", "account_id"],
    ["account_avatars", "account_id"],
    ["account_suspensions", "account_id"],
    ["announcement_reads", "account_id"],
    ["announcement_requests", "actor_id"],
    ["admin_match_reads", "admin_id"],
    ["table_creations", "session_id"],
  ])
    expect(
      f.db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`)
        .get("member")!.n,
      table,
    ).toBe(0);
  expect(
    f.db
      .prepare(
        "SELECT member_id FROM account_numbers WHERE account_id='member'",
      )
      .get()!.member_id,
  ).toBe(Number(memberId));
  for (const [table, id] of [
    ["round_replays", "replay"],
    ["round_records", "round"],
    ["match_records", "match"],
  ])
    expect(
      f.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id=?`).get(id)!.n,
      table,
    ).toBe(1);
  expect(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM round_rosters WHERE account_id='member'",
      )
      .get()!.n,
  ).toBe(1);
  expect(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM point_records WHERE account_id='member'",
      )
      .get()!.n,
  ).toBe(1);
  expect(
    JSON.parse(
      String(
        f.db
          .prepare(
            "SELECT event FROM account_audit WHERE account_id='member' ORDER BY at DESC,rowid DESC LIMIT 1",
          )
          .get()!.event,
      ),
    ),
  ).toMatchObject({ event: "account-deleted", actorId: "guardian" });
});

it("删除账号对不存在账号、当前账号和受保护开桌账号返回明确错误", async () => {
  const f = await fixture(),
    root = await f.login(),
    second = await f.login("second-admin");
  expect(
    await f.call("/api/control/members/missing/delete", root, {}),
  ).toMatchObject({ status: 404, body: { error: "账号不存在" } });
  expect(
    await f.call("/api/control/members/admin/delete", second, {}),
  ).toMatchObject({
    status: 403,
    body: { error: "不能删除当前登录的账号" },
  });
  expect(
    await f.call("/api/control/members/guardian/delete", second, {}),
  ).toMatchObject({
    status: 403,
    body: { error: "不能删除受保护账号 guanli@1" },
  });
  expect(f.accounts.getAccount("guardian")).toBeDefined();
  expect(f.accounts.getAccount("admin")).toBeDefined();
});

it("密码重置撤销共用会话，停用与牌局暂停分离，恢复保留角色战队和开桌资格", async () => {
  const f = await fixture(),
    root = await f.login(),
    app = await f.login("second-admin", false),
    admin = await f.login("second-admin");
  await f.call("/api/control/members/admin", root, {
    name: "协管",
    teamId: "team-2",
  });
  const reset = await f.call("/api/control/members/admin/password", root, {
    password: "New-Password",
    confirmPassword: "New-Password",
  });
  expect(reset.status).toBe(200);
  expect((await f.call("/api/auth/session", app)).status).toBe(401);
  expect((await f.call("/api/control/auth/session", admin)).status).toBe(401);
  expect(
    (
      await f.call("/api/auth/login", undefined, {
        username: "second-admin",
        password: secret,
      })
    ).status,
  ).toBe(401);
  const newApp = await f.login("second-admin", false, "New-Password"),
    newControl = await f.login("second-admin", true, "New-Password");
  const paused = await f.call("/api/control/members/admin/suspension", root, {
    suspended: true,
    reason: "会员申请",
  });
  expect(paused.body.account).toMatchObject({
    suspended: true,
    canPlay: false,
    playBlocked: false,
  });
  expect((await f.call("/api/auth/session", newApp)).status).toBe(401);
  expect((await f.call("/api/control/auth/session", newControl)).status).toBe(
    401,
  );
  for (const prefix of ["", "control/"])
    expect(
      (
        await f.call(`/api/${prefix}auth/login`, undefined, {
          username: "second-admin",
          password: "New-Password",
        })
      ).status,
    ).toBe(403);
  expect(
    (await f.call("/api/control/members?status=suspended", root)).body.total,
  ).toBe(1);
  expect(() => f.accounts.requirePlay("admin")).toThrow("暂停使用");
  expect(
    (
      await f.call("/api/control/members/admin/suspension", root, {
        suspended: false,
      })
    ).body.account,
  ).toMatchObject({
    suspended: false,
    canPlay: true,
    role: "admin",
    teamId: "team-2",
    canCreateTables: false,
  });
  expect(f.accounts.canOpenTables("guardian")).toBe(true);
  const audit = await f.call("/api/control/members/admin/audit", root);
  expect(JSON.stringify(audit.body)).not.toContain("New-Password");
  expect(
    audit.body.audit.map((entry: { event: string }) => entry.event),
  ).toEqual(
    expect.arrayContaining([
      "password-reset",
      "account-suspended",
      "account-restored",
      "membership-changed",
    ]),
  );
  expect(
    f.revoked.filter((id) => id === "admin").length,
  ).toBeGreaterThanOrEqual(4);
});

it("异步密码哈希结束后重新校验权限，不允许已撤权的后台管理员写入", async () => {
  const f = await fixture(),
    admin = await f.login("second-admin");
  const original = f.accounts.hashAdministrativePassword;
  f.accounts.hashAdministrativePassword = async (...args) => {
    const result = await original(...args);
    f.db.prepare("UPDATE accounts SET role='member' WHERE id='admin'").run();
    return result;
  };
  expect(
    (
      await f.call("/api/control/members/member/password", admin, {
        password: "Should-not-save",
        confirmPassword: "Should-not-save",
      })
    ).status,
  ).toBe(403);
  expect(
    f.db.prepare("SELECT password_hash FROM accounts WHERE id='member'").get()!
      .password_hash,
  ).toBe(encoded);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM account_audit").get()!.n).toBe(
    0,
  );
});

it("请求体到达期间撤销的管理员权限不会发布公告", async () => {
  const f = await fixture(),
    admin = await f.login("second-admin");
  const received = new Promise<void>((resolve) =>
    f.server.once("request", (req) => req.once("data", () => resolve())),
  );
  let sent!: ReturnType<typeof request>;
  const response = new Promise<number>((resolve, reject) => {
    sent = request(
      f.base + "/api/control/announcements",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${admin}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      },
    );
    sent.on("error", reject);
    sent.write('{"title":"');
  });
  await received;
  f.db.prepare("UPDATE accounts SET role='member' WHERE id='admin'").run();
  sent.end('公告","body":"内容"}');
  expect(await response).toBe(403);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM announcements").get()!.n).toBe(
    0,
  );
});

it("APP改密撤销后台共用会话，临时密码管理员须先完成改密", async () => {
  const f = await fixture(),
    control = await f.login(),
    app = control;
  expect((await f.call("/api/control/auth/session", control)).status).toBe(200);
  expect(
    (
      await f.call("/api/auth/password", app, {
        currentPassword: secret,
        password: "Changed-Password",
      })
    ).status,
  ).toBe(200);
  expect((await f.call("/api/control/auth/session", control)).status).toBe(401);
  f.db.prepare("UPDATE accounts SET must_change=1 WHERE id='admin'").run();
  expect(
    (
      await f.call("/api/control/auth/login", undefined, {
        username: "second-admin",
        password: secret,
      })
    ).body.error,
  ).toContain("APP");
});

it("后台与APP登录共用失败限流，登录哈希后撤权不签发会话", async () => {
  const f = await fixture();
  for (let index = 0; index < 15; index++) {
    const prefix = index % 2 ? "control/" : "";
    expect(
      (
        await f.call(`/api/${prefix}auth/login`, undefined, {
          username: "shared-rate",
          password: secret,
        })
      ).status,
    ).toBe(401);
  }
  expect(
    (
      await f.call("/api/control/auth/login", undefined, {
        username: "shared-rate",
        password: secret,
      })
    ).status,
  ).toBe(429);
  const original = f.accounts.verifyAdministrator;
  f.accounts.verifyAdministrator = async (...args) => {
    const result = await original(...args);
    f.db.prepare("UPDATE accounts SET role='member' WHERE id='admin'").run();
    return result;
  };
  expect(
    (
      await f.call("/api/control/auth/login", undefined, {
        username: "second-admin",
        password: secret,
      })
    ).status,
  ).toBe(403);
  expect(
    f.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id='admin'").get()!
      .n,
  ).toBe(0);
});
