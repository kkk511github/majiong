import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import { hashPassword } from "../server/accounts";
import { TABLE_CREATOR_USERNAME } from "../shared/permissions";
export * from "@playwright/test";
export const UI_PASSWORD = "Browser-fixture-password-2026";
const encoded = hashPassword(UI_PASSWORD);
export async function browserAccount(
  context: BrowserContext,
  name = "金陵牌友",
  creator = false,
  role: "admin" | "member" = "admin",
) {
  const username = creator ? TABLE_CREATOR_USERNAME : `qa-${randomUUID()}`,
    id = randomUUID();
  const db = new DatabaseSync(resolve(process.env.MAHJONG_E2E_DATABASE ?? "../../work/accounts-e2e.sqlite"));
  const hash = await encoded;
  const token = randomBytes(32).toString("hex");
  try {
    // Each scenario gets a fresh sole creator in the isolated UI-test database.
    // Additional peers retain the requested test role and cannot create tables.
    if (creator)
      db.prepare("UPDATE accounts SET username=? WHERE username=?")
        .run(`qa-retired-${randomUUID()}`, TABLE_CREATOR_USERNAME);
    db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(
      id,
      username,
      name,
      hash,
      role,
      0,
      Date.now(),
    );
    db.prepare("INSERT INTO team_memberships VALUES (?,?,?,?,?)").run(id,"team-1",0,"test-fixture",Date.now());
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(
      createHash("sha256").update(token).digest("hex"),
      id,
      name,
      Date.now(),
    );
  } finally {
    db.close();
  }
  // UI setup is not a login load test. Authentication itself is covered in accounts.e2e.ts.
  const data = {
    token,
    account: {
      id,
      username,
      name,
      role,
      mustChangePassword: false,
      canCreateTables: creator,
    },
  };
  await context.addInitScript(({ token }) => {
    if (!localStorage.getItem("jinling:token"))
      localStorage.setItem("jinling:token", JSON.stringify(token));
  }, data);
  return data;
}
export const test = base.extend<{ accountFixture: void }>({
  accountFixture: [
    async ({ context }, use) => {
      await browserAccount(context, "金陵牌友", true);
      await use();
    },
    { auto: true },
  ],
});

// Legacy room fixtures retain compatibility coverage after the homepage moves to managed tables.
export async function legacyRoom(page: Page, name = "金陵牌友") {
  await page.waitForFunction(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.state.account && client.state.connected;
  });
  await page.evaluate(async (name) => {
    const { client } = await import("/src/game-client.ts" as string);
    if (client.state.account?.name !== name) await client.updateProfile(name);
    client.connect(name, {
      type: "create",
      rules: { rounds: 4, turnSeconds: 30 },
    });
  }, name);
  await page.locator(".waiting-room").waitFor();
}

// Panel regressions exercise the existing table command bridge directly.
// The removed lobby/records/table toolbar buttons are intentionally not UI
// entry points; this helper does not claim that those buttons still exist.
export async function openTableMenu(page: Page, menu: 'leave' | 'events' | 'table') {
  const iframe = page.locator('#cocos-table-board iframe');
  await iframe.waitFor();
  const frame = await (await iframe.elementHandle())!.contentFrame();
  if (!frame) throw new Error('The Cocos table frame is unavailable');
  await frame.waitForFunction(() => !!(window as any).__JINLING_TABLE_READY__);
  await frame.evaluate(async menu => {
    const cc = await (window as any).System.import('cc');
    cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').emit({ type: 'menu', menu });
  }, menu);
}
