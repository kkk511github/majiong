import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ChevronRight,
  LogOut,
  Megaphone,
  PackageOpen,
  ShieldCheck,
  UsersRound,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  ControlApi,
  ControlApiError,
  controlAsset,
  errorMessage,
  readControlSession,
  writeControlSession,
} from "./api";
import { Announcements } from "./Announcements";
import { Members } from "./Members";
import { Releases } from "./Releases";
import { Settings } from './Settings';
import type { ControlAccount } from "./types";
import { ErrorNotice, Loading } from "./ui";

type Page = "announcements" | "releases" | "members" | "settings";
const pages = [
  { id: "announcements" as const, title: "公告管理", icon: Megaphone },
  { id: "releases" as const, title: "版本管理", icon: PackageOpen },
  { id: "members" as const, title: "人员管理", icon: UsersRound },
  { id: 'settings' as const, title: '后台设置', icon: SettingsIcon },
];

export function ControlApp() {
  const [token, setToken] = useState<string | null>(readControlSession);
  const [account, setAccount] = useState<ControlAccount | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [checking, setChecking] = useState(!!token);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState<Page>("announcements");
  const [visited, setVisited] = useState<Set<Page>>(new Set(["announcements"]));
  const [loggingOut, setLoggingOut] = useState(false);

  const expired = useCallback(() => {
    writeControlSession(null);
    setToken(null);
    setAccount(null);
    setChecking(false);
    setLoginNotice("后台登录已失效，请重新登录。");
  }, []);
  const api = useMemo(() => new ControlApi(token, expired), [token, expired]);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    setSessionError("");
    api
      .get<{ account: ControlAccount }>("/auth/session", controller.signal)
      .then((result) => {
        if (result.account.role !== "admin") {
          expired();
          setLoginNotice("此账号没有后台管理权限。");
          return;
        }
        setAccount(result.account);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ControlApiError && cause.status === 403) {
          writeControlSession(null);
          setToken(null);
          setAccount(null);
          setLoginNotice(cause.message);
        } else if (!(cause instanceof ControlApiError && cause.status === 401))
          setSessionError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [api, token, reload, expired]);

  function login(result: { token: string; account: ControlAccount }) {
    writeControlSession(result.token);
    setToken(result.token);
    setAccount(result.account);
    setLoginNotice("");
    setSessionError("");
    setPage("announcements");
    setVisited(new Set(["announcements"]));
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.post("/auth/logout");
    } catch {
      /* Removing this tab's credential still signs out locally. */
    } finally {
      writeControlSession(null);
      setToken(null);
      setAccount(null);
      setSessionError("");
      setLoginNotice("");
      setLoggingOut(false);
    }
  }

  if (!token) return <Login notice={loginNotice} onLogin={login} />;
  if (checking && !account)
    return (
      <div className="control-session-screen">
        <Brand />
        <Loading>正在验证后台会话…</Loading>
      </div>
    );
  if (!account)
    return (
      <div className="control-session-screen">
        <Brand />
        <ErrorNotice retry={() => setReload((value) => value + 1)}>
          {sessionError || "无法验证后台会话，请重试。"}
        </ErrorNotice>
        <button
          className="control-button"
          onClick={() => {
            writeControlSession(null);
            setToken(null);
          }}
        >
          返回登录
        </button>
      </div>
    );

  return (
    <div className="control-shell">
      <aside className="control-sidebar">
        <Brand />
        <nav aria-label="后台管理导航">
          {pages.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                aria-current={page === item.id ? "page" : undefined}
                className={page === item.id ? "control-nav-active" : ""}
                onClick={() => {
                  setPage(item.id);
                  setVisited((previous) => new Set([...previous, item.id]));
                }}
              >
                <Icon size={23} />
                <span>{item.title}</span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </nav>
        <div className="control-sidebar-bottom">
          <div className="control-sidebar-seal">金陵</div>
          <p>
            碰杠不吃
            <br />
            二十张花 · 四人约局
          </p>
          <span>
            <ShieldCheck size={15} />
            管理后台
          </span>
        </div>
      </aside>
      <main className="control-main">
        <header className="control-header">
          <div>
            <span className="control-eyebrow">金陵麻将 / 管理后台</span>
            <h1>{pages.find((item) => item.id === page)?.title}</h1>
          </div>
          <div className="control-session">
            <span className="control-admin-avatar">
              {account.name.slice(0, 1) || "管"}
            </span>
            <div>
              <strong>{account.name}</strong>
              <span>{account.username}</span>
            </div>
            <button
              type="button"
              className="control-logout"
              onClick={() => void logout()}
              disabled={loggingOut}
            >
              <LogOut size={17} />
              <span>{loggingOut ? "退出中…" : "退出登录"}</span>
            </button>
          </div>
        </header>
        {visited.has("announcements") && (
          <div hidden={page !== "announcements"}>
            <Announcements api={api} />
          </div>
        )}
        {visited.has("releases") && (
          <div hidden={page !== "releases"}>
            <Releases api={api} />
          </div>
        )}
        {visited.has("members") && (
          <div hidden={page !== "members"}>
            <Members api={api} actor={account} onAccountChanged={setAccount} />
          </div>
        )}
        {visited.has('settings') && <div hidden={page !== 'settings'}><Settings api={api} /></div>}
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="control-brand">
      <img src={controlAsset("brand-icon.png")} alt="金陵麻将" />
      <div>
        <strong>金陵麻将</strong>
        <span>管理后台</span>
      </div>
    </div>
  );
}

function Login({
  notice,
  onLogin,
}: {
  notice: string;
  onLogin: (result: { token: string; account: ControlAccount }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const result = await new ControlApi(null).post<{
        token: string;
        account: ControlAccount;
      }>("/auth/login", { username: username.trim(), password });
      if (result.account.role !== "admin")
        throw new ControlApiError("此账号没有后台管理权限。", 403);
      setPassword("");
      onLogin(result);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="control-login-page">
      <div className="control-login-brand">
        <Brand />
        <p>一桌南京味，一份安心管理。</p>
      </div>
      <section className="control-login-card">
        <span className="control-eyebrow">欢迎回来</span>
        <h1>登录后台</h1>
        <p className="control-muted">使用现有管理员账号登录</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="control-field">
            <span>账号</span>
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              maxLength={48}
              required
              disabled={busy}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="管理员账号"
            />
          </label>
          <label className="control-field">
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              maxLength={128}
              required
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          <ErrorNotice>{error || notice}</ErrorNotice>
          <button
            className="control-button control-primary control-login-submit"
            type="submit"
            disabled={busy || !username.trim() || !password}
          >
            {busy ? "正在登录…" : "登录后台"}
            <ChevronRight size={18} />
          </button>
        </form>
      </section>
      <p className="control-login-footer">金陵麻将 · 管理后台</p>
    </main>
  );
}
