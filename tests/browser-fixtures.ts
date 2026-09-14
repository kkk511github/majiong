import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import { hashPassword } from "../server/accounts";
export * from "@playwright/test";
export const UI_PASSWORD = "Browser-fixture-password-2026";
const encoded = hashPassword(UI_PASSWORD);
export async function browserAccount(
  context: BrowserContext,
  name = "金陵牌友",
) {
  const username = `qa-${randomUUID()}`,
    id = randomUUID();
  const db = new DatabaseSync(resolve("../../work/accounts-e2e.sqlite"));
  const hash = await encoded;
  const token = randomBytes(32).toString("hex");
  try {
    db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(
      id,
      username,
      name,
      hash,
      "admin",
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
      role: "admin",
      mustChangePassword: false,
      canCreateTables: true,
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
      await browserAccount(context);
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
