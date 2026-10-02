import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAuthAudit, type AuthAuditRecord } from "../server/auth-audit";

it("认证审计只输出明确字段，不记录查询参数、凭据、正文或任意路径", () => {
  const records: AuthAuditRecord[] = [];
  const audit = createAuthAudit(record => records.push(record));
  const req = { method: "POST", url: "/api/control/auth/login?token=QUERY_SECRET",
    headers: { authorization: "Bearer TOKEN_SECRET" }, body: { password: "PASSWORD_SECRET" } } as unknown as IncomingMessage;
  audit.attempt(req, "admin");
  audit.identify(req, { id: "admin-id", username: "admin" });
  audit.emit("session-issued", req, { accountId: "admin-id", username: "admin", reason: "control-login", replaced: true });
  expect(records[0]).toMatchObject({ kind: "auth-audit", source: "control", path: "/api/control/auth/login",
    attemptedUsername: "admin", actorId: "admin-id", accountId: "admin-id", reason: "control-login", replaced: true });
  audit.emit("auth-rejected", { method: "GET", url: "/secret/TOKEN_SECRET.jpg" } as IncomingMessage, { status: 401 });
  expect(records[1].path).toBe("/api/other");
  audit.emit("auth-rejected", { method: "GET", url: "/api/" + "a".repeat(64) } as IncomingMessage, { status: 401 });
  expect(records[2].path).toBe("/api/other");
  expect(JSON.stringify(records)).not.toMatch(/QUERY_SECRET|TOKEN_SECRET|PASSWORD_SECRET|authorization|token_hash|password_hash/);
});

it("一次失败响应只安装一个监听，并保留请求关联号", () => {
  const records: AuthAuditRecord[] = [];
  const audit = createAuthAudit(record => records.push(record));
  const req = { method: "GET", url: "/api/control/accounts" } as IncomingMessage;
  const res = Object.assign(new EventEmitter(), { statusCode: 401 }) as ServerResponse;
  audit.observe(req, res); audit.observe(req, res);
  audit.emit("auth-rejected", req, { reason: "session-invalid", status: 401 });
  res.emit("finish");
  expect(records).toHaveLength(2);
  expect(records[1]).toMatchObject({ requestId: records[0].requestId, event: "request-rejected", status: 401 });
  res.emit("finish");
  expect(records).toHaveLength(2);
});

it("日志出口异常不改变认证流程", () => {
  const audit = createAuthAudit(() => { throw Error("disk full"); });
  expect(() => audit.emit("session-issued", undefined, { accountId: "member", reason: "app-login" })).not.toThrow();
});

it("失败请求日志有每分钟上限，正常会话变更不被限流", () => {
  const sink = vi.fn(); const audit = createAuthAudit(sink);
  for (let i = 0; i < 1100; i++) audit.emit("auth-rejected", undefined, { status: 401 });
  audit.emit("session-issued", undefined, { accountId: "member", reason: "app-login" });
  expect(sink).toHaveBeenCalledTimes(1001);
});
