import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { accountSchema, provisionAdministrator } from "../server/accounts";
const password = "Fixture-only-Password-2026";
const adminTokens = new Map<number,string>();
const adminReady = new Map<number,Promise<void>>();
const adminResolve = new Map<number,()=>void>();
const hosts = new Map<number, boolean>();
export async function seedTestAdmin(database: string) {
  const db = new DatabaseSync(database);
  try {
    accountSchema(db);
    if (!db.prepare("SELECT 1 FROM accounts WHERE username='guanli@1'").get())
      await provisionAdministrator(db, {
        username: "guanli@1",
        password,
        mustChangePassword: false,
      });
  } finally {
    db.close();
  }
}
export function registerTestPort(port: number) {
  hosts.set(port, false);
  adminReady.set(port,new Promise(resolve => adminResolve.set(port,resolve)));
}
export async function peerCredential(port: number, name: string) {
  const first = !hosts.get(port);
  hosts.set(port, true);
  const path = first ? "login" : "register";
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: first ? "guanli@1" : `test-${randomUUID()}`,
      password,
      name,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw Error(JSON.stringify(data));
  if (first)
    await fetch(`http://127.0.0.1:${port}/api/auth/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.token}`,
      },
      body: JSON.stringify({ name }),
    });
  if (first) { adminTokens.set(port,data.token); adminResolve.get(port)?.(); }
  else await adminReady.get(port);
  const admission = await fetch(`http://127.0.0.1:${port}/api/admin/members`, {
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${adminTokens.get(port)}`},
    body:JSON.stringify({accountId:data.account.id,teamId:"team-1"}),
  });
  if (!admission.ok) throw Error("Fixture team approval failed");
  return data.token as string;
}
