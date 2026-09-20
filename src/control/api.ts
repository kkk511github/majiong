import brandImage from "../../public/brand-icon.png";
import lobbyImage from "../../public/lobby-scene.png";

export const CONTROL_SESSION_KEY = "jinling.control.session.v1";

export class ControlApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ControlApiError";
  }
}

export function controlApiBase() {
  return (
    import.meta.env.VITE_CONTROL_API_BASE ||
    (import.meta.env.DEV ? "/api/control" : "/mahjong/api/control")
  ).replace(/\/$/, "");
}

export function controlAsset(name: string) {
  if (name === "brand-icon.png") return brandImage;
  if (name === "lobby-scene.png") return lobbyImage;
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${name.replace(/^\//, "")}`;
}

export function readControlSession(): string | null {
  try {
    return sessionStorage.getItem(CONTROL_SESSION_KEY);
  } catch {
    return null;
  }
}

export function writeControlSession(token: string | null) {
  try {
    if (token) sessionStorage.setItem(CONTROL_SESSION_KEY, token);
    else sessionStorage.removeItem(CONTROL_SESSION_KEY);
  } catch {
    /* The current tab still works when storage is unavailable. */
  }
}

function responseMessage(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  )
    return data.error;
  return fallback;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ControlApiError) return error.message;
  if (error instanceof Error && error.name === "AbortError")
    return "操作已取消";
  return "连接失败，请检查网络后重试。你的输入已保留。";
}

export class ControlApi {
  constructor(
    private token: string | null,
    private onUnauthorized: () => void = () => {},
    private base = controlApiBase(),
  ) {}

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.base}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "omit",
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && this.token) this.onUnauthorized();
      throw new ControlApiError(
        responseMessage(data, `请求失败（${response.status}），请重试`),
        response.status,
        data,
      );
    }
    if (data === null)
      throw new ControlApiError("服务器返回的数据无法读取，请重试", 502);
    return data as T;
  }

  get<T>(path: string, signal?: AbortSignal) {
    return this.request<T>(path, { signal });
  }
  post<T>(path: string, body: unknown = {}) {
    return this.request<T>(path, { method: "POST", body });
  }

  upload<T>(
    path: string,
    file: File,
    notes: string,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      const abort = () => request.abort();
      const cleanup = () => signal.removeEventListener("abort", abort);
      request.open("POST", `${this.base}${path}`);
      request.setRequestHeader("Accept", "application/json");
      if (this.token)
        request.setRequestHeader("Authorization", `Bearer ${this.token}`);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable)
          onProgress(Math.round((event.loaded * 100) / event.total));
      };
      request.onload = () => {
        cleanup();
        let data: unknown;
        try {
          data = JSON.parse(request.responseText);
        } catch {
          data = null;
        }
        if (request.status < 200 || request.status >= 300) {
          if (request.status === 401 && this.token) this.onUnauthorized();
          reject(
            new ControlApiError(
              responseMessage(data, `上传失败（${request.status}），请重试`),
              request.status,
              data,
            ),
          );
        } else if (!data)
          reject(
            new ControlApiError(
              "服务器返回的数据无法读取，请刷新待发布列表确认结果",
              502,
            ),
          );
        else resolve(data as T);
      };
      request.onerror = () => {
        cleanup();
        reject(
          new ControlApiError(
            "上传连接中断，请检查网络，并刷新待发布列表确认结果",
            0,
          ),
        );
      };
      request.onabort = () => {
        cleanup();
        reject(new DOMException("上传已取消", "AbortError"));
      };
      if (signal.aborted) {
        reject(new DOMException("上传已取消", "AbortError"));
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      const form = new FormData();
      form.append("file", file);
      form.append("notes", notes);
      request.send(form);
    });
  }
}
