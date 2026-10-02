import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export type AuthAuditEvent = "session-issued" | "session-revoked" | "auth-rejected" | "request-rejected";
export interface AuthAuditFields {
  accountId?: string;
  username?: string;
  reason?: string;
  replaced?: boolean;
  status?: number;
}
export interface AuthAuditRecord extends AuthAuditFields {
  kind: "auth-audit";
  event: AuthAuditEvent;
  at: string;
  runtime: string;
  requestId?: string;
  method?: string;
  path?: string;
  source?: "control" | "app";
  attemptedUsername?: string;
  actorId?: string;
  actorUsername?: string;
}
export type AuthAuditSink = (record: AuthAuditRecord) => void;

export function createAuthAudit(sink: AuthAuditSink = record => console.info(JSON.stringify(record))) {
  const requests = new WeakMap<IncomingMessage, {
    requestId: string; method: string; path: string; source: "control" | "app";
    attemptedUsername?: string; actorId?: string; actorUsername?: string; observed?: boolean;
  }>();
  let windowStart = Date.now(), failures = 0;
  function context(req: IncomingMessage) {
    let value = requests.get(req);
    if (!value) {
      // Never retain the query, headers or body. Unrecognized paths may contain secrets.
      const rawPath = (req.url ?? "").split("?")[0];
      const path = /^\/api\/[a-z0-9/_-]{1,180}$/i.test(rawPath) && !/[a-f0-9]{32,}/i.test(rawPath)
        ? rawPath : "/api/other";
      value = { requestId: randomUUID(), method: req.method ?? "UNKNOWN", path,
        source: path.startsWith("/api/control/") ? "control" : "app" };
      requests.set(req, value);
    }
    return value;
  }
  function emit(event: AuthAuditEvent, req?: IncomingMessage, fields: AuthAuditFields = {}) {
    try {
      if (event === "auth-rejected" || event === "request-rejected") {
        const now = Date.now();
        if (now - windowStart >= 60000) { windowStart = now; failures = 0; }
        if (++failures > 1000) return;
      }
      const value = req ? context(req) : undefined;
      sink({ kind: "auth-audit", event, at: new Date().toISOString(),
        runtime: process.env.MAHJONG_RUNTIME_ID ?? "single-service",
        ...(value ? { requestId: value.requestId, method: value.method, path: value.path,
          source: value.source, attemptedUsername: value.attemptedUsername,
          actorId: value.actorId, actorUsername: value.actorUsername } : {}),
        accountId: fields.accountId, username: fields.username, reason: fields.reason,
        replaced: fields.replaced, status: fields.status });
    } catch { /* Logging must not change authentication outcomes. */ }
  }
  function observe(req: IncomingMessage, res: ServerResponse) {
    const value = context(req);
    if (value.observed) return;
    value.observed = true;
    res.once("finish", () => {
      if (res.statusCode >= 400) emit("request-rejected", req, { status: res.statusCode, reason: "http-response" });
    });
  }
  function identify(req: IncomingMessage, actor: { id: string; username: string }) {
    const value = context(req);
    value.actorId = actor.id;
    value.actorUsername = actor.username;
  }
  function attempt(req: IncomingMessage, username: string) { context(req).attemptedUsername = username; }
  return { emit, observe, identify, attempt };
}
