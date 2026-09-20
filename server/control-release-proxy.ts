import { readFileSync } from "node:fs";
import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { Transform } from "node:stream";
import { AuthError, readJSON, type AuthSession } from "./accounts";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024 + 65536;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
type Options = { origin?: string; tokenFile?: string; timeoutMs?: number };
type Route =
  | { kind: "list" }
  | { kind: "upload"; platform: "android" | "ios" }
  | { kind: "publish" | "discard"; id: string };

function releaseRoute(req: IncomingMessage, url: URL): Route | null {
  if (req.method === "GET" && url.pathname === "/api/control/releases") return { kind: "list" };
  if (req.method === "POST" && url.pathname === "/api/control/releases/upload") {
    const platform = url.searchParams.get("platform");
    if (platform !== "android" && platform !== "ios") throw new AuthError("请选择 Android 或 iOS");
    return { kind: "upload", platform };
  }
  const match = /^\/api\/control\/releases\/([a-f0-9]{24})\/(publish|discard)$/.exec(url.pathname);
  if (req.method === "POST" && match)
    return { kind: match[2] as "publish" | "discard", id: match[1] };
  return null;
}

/** The browser supplies only its account session; the private hub credential never leaves the server. */
export function createControlReleaseProxy(authorize: (req: IncomingMessage) => AuthSession, options: Options = {}) {
  const uploads = new Set<string>();
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith("/api/control/releases")) return false;
    res.setHeader("Cache-Control", "no-store");
    let actorId: string | undefined;
    let uploading = false;
    const respond = (status: number, error: string) => {
      if (!res.headersSent && !res.destroyed) {
        res.statusCode = status;
        res.end(JSON.stringify({ error }));
      }
    };
    try {
      let actor = authorize(req);
      const route = releaseRoute(req, url);
      if (!route) throw new AuthError("版本管理接口不存在", 404);
      const configured = options.origin ?? process.env.MANAGEMENT_RELEASE_ORIGIN;
      const tokenFile = options.tokenFile ?? process.env.MANAGEMENT_API_TOKEN_FILE;
      if (!configured || !tokenFile) throw new AuthError("版本管理服务尚未配置", 503);
      let origin: URL;
      try {
        origin = new URL(configured);
      } catch {
        throw new AuthError("版本管理服务配置无效", 503);
      }
      if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/")
        throw new AuthError("版本管理服务配置无效", 503);
      let secret: string;
      try {
        secret = readFileSync(tokenFile, "utf8").trim();
      } catch {
        throw new AuthError("版本管理服务尚未就绪", 503);
      }
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) throw new AuthError("版本管理服务凭据无效", 503);

      const upload = route.kind === "upload";
      const targetPath = route.kind === "list" || upload
        ? `/internal/control/releases${upload ? "/upload" : ""}`
        : `/internal/control/releases/${encodeURIComponent(route.id)}/${route.kind}`;
      const target = new URL(targetPath, origin);
      const headers: Record<string, string> = {
        "X-Management-Token": secret,
        "X-Management-Actor": actor.id,
        Accept: "application/json",
      };
      let jsonBody: Buffer | undefined;
      if (upload) {
        target.searchParams.set("platform", route.platform);
        const type = req.headers["content-type"] ?? "";
        if (!/^multipart\/form-data;\s*boundary=[^\r\n]{1,200}$/i.test(type)) throw new AuthError("请使用安装包上传表单");
        const length = Number(req.headers["content-length"]);
        if (!Number.isSafeInteger(length) || length <= 0) throw new AuthError("无法读取上传文件大小，请重新选择文件", 411);
        if (length > MAX_UPLOAD_BYTES) throw new AuthError("安装包超过上传大小限制", 413);
        if (uploads.has(actor.id)) throw new AuthError("当前账号已有安装包正在上传", 409);
        if (uploads.size >= 2) throw new AuthError("上传服务繁忙，请稍后重试", 429);
        actorId = actor.id;
        uploads.add(actorId);
        uploading = true;
        headers["Content-Type"] = type;
        headers["Content-Length"] = String(length);
      } else if (route.kind !== "list") {
        const body = await readJSON(req, MAX_JSON_BYTES);
        jsonBody = Buffer.from(JSON.stringify(body));
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = String(jsonBody.length);
      }

      actor = authorize(req);
      if (actor.id !== headers["X-Management-Actor"]) throw new AuthError("登录状态已变化，请重新登录", 401);
      await new Promise<void>((resolve) => {
        let done = false;
        let received = 0;
        let lease: NodeJS.Timeout | undefined;
        let limit: Transform | undefined;
        const chunks: Buffer[] = [];
        const finish = (drainClient = false) => {
          if (done) return;
          done = true;
          if (lease) clearInterval(lease);
          if (limit) {
            req.unpipe(limit);
            if (!limit.destroyed) limit.destroy();
          }
          if (drainClient && !upstream.destroyed) upstream.destroy();
          if (drainClient && !req.complete && !req.destroyed) req.resume();
          resolve();
        };
        const upstream = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
          method: route.kind === "list" ? "GET" : "POST",
          headers,
          timeout: options.timeoutMs ?? (upload ? 120_000 : 20_000),
        }, upstreamResponse => {
          upstreamResponse.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_RESPONSE_BYTES) {
              upstreamResponse.destroy();
              upstream.destroy();
              respond(502, "版本服务响应过大，请稍后重试");
              finish(upload);
            } else chunks.push(Buffer.from(chunk));
          });
          upstreamResponse.on("error", () => {
            respond(502, "版本服务连接中断，请刷新确认当前版本");
            finish(upload);
          });
          upstreamResponse.on("end", () => {
            if (done) return;
            try {
              const current = authorize(req);
              if (current.id !== actor.id) throw new AuthError("请重新登录", 401);
              const status = upstreamResponse.statusCode ?? 502;
              if (status < 200 || status >= 600 || (status >= 300 && status < 400)) throw new Error("Unexpected upstream status");
              const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              if (!data || typeof data !== "object") throw new Error("Invalid upstream response");
              if (!res.destroyed) {
                res.statusCode = status;
                res.end(JSON.stringify(data));
              }
            } catch (error) {
              respond(error instanceof AuthError ? error.status : 502, error instanceof AuthError ? error.message : "版本服务返回异常，请刷新确认当前版本");
            }
            finish(upload);
          });
        });
        lease = setInterval(() => {
          try {
            if (authorize(req).id !== actor.id) throw new Error();
          } catch {
            upstream.destroy();
            respond(401, "登录状态已失效，请重新登录后核对当前版本");
            finish(upload);
          }
        }, 1000);
        lease.unref();
        upstream.on("timeout", () => upstream.destroy());
        upstream.on("error", () => {
          respond(502, upload ? "上传结果未确认，请刷新当前版本后再操作" : "暂时无法连接版本服务");
          finish(upload);
        });
        req.once("aborted", () => {
          upstream.destroy();
          finish();
        });
        res.once("close", () => {
          if (!res.writableEnded) {
            upstream.destroy();
            finish(upload);
          }
        });
        if (upload) {
          let bytes = 0;
          let lastChunk: Buffer | null = null;
          limit = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              bytes += chunk.length;
              if (bytes > MAX_UPLOAD_BYTES) return callback(new AuthError("安装包超过上传大小限制", 413));
              if (lastChunk) this.push(lastChunk);
              lastChunk = Buffer.from(chunk);
              callback();
            },
            flush(callback) {
              try {
                if (authorize(req).id !== actor.id) throw new AuthError("登录状态已变化，请重新登录", 401);
                if (bytes !== Number(headers["Content-Length"])) throw new AuthError("上传内容不完整，请重新选择文件");
                if (lastChunk) this.push(lastChunk);
                lastChunk = null;
                callback();
              } catch (error) {
                callback(error instanceof Error ? error : new Error("Upload authorization failed"));
              }
            },
          });
          limit.on("error", error => {
            upstream.destroy();
            respond(error instanceof AuthError ? error.status : 400, error instanceof AuthError ? error.message : "安装包上传中断");
            finish(true);
          });
          req.on("error", () => {
            upstream.destroy();
            finish();
          });
          req.pipe(limit).pipe(upstream);
        } else if (jsonBody) upstream.end(jsonBody);
        else upstream.end();
      });
    } catch (error) {
      respond(error instanceof AuthError ? error.status : 500, error instanceof AuthError ? error.message : "版本管理暂时不可用，请稍后重试");
      req.resume();
    } finally {
      if (uploading && actorId) uploads.delete(actorId);
    }
    return true;
  }
  return { handle };
}
