import { useEffect, useRef, useState } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";
import { Dialog } from "./Dialog";
import { client } from "./game-client";
import type {
  TablePermissionAccount,
  TablePermissionsPage,
} from "../shared/types";
import "./table-permissions.css";

export function TablePermissions({ close }: { close: () => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ username: "", page: 1 });
  const [result, setResult] = useState<TablePermissionsPage>({
    accounts: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  async function load(username: string, page: number) {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const data = await client.api<TablePermissionsPage>(
        "/api/admin/table-permissions?" +
          new URLSearchParams({ username, page: String(page) }),
      );
      if (current === request.current) setResult(data);
    } catch (e) {
      if (current === request.current) setError((e as Error).message);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load(query.username, query.page);
    return () => {
      request.current++;
    };
  }, [query]);
  async function change(target: TablePermissionAccount) {
    if (busy) return;
    setBusy(target.id);
    setError("");
    setNotice("");
    try {
      const enabled = !target.canCreateTables;
      await client.api("/api/admin/table-permissions", {
        accountId: target.id,
        canCreateTables: enabled,
      });
      setNotice(
        `${target.name}（${target.username}）${enabled ? "已获得开桌权限" : "已收回开桌权限"}`,
      );
      if (!enabled && query.page !== 1) setQuery({ ...query, page: 1 });
      else await load(query.username, query.page);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Dialog title="开桌授权" close={close} variant="permissions-dialog">
      <div className="permission-intro">
        <ShieldCheck size={24} />
        <div>
          <strong>让信任的牌友帮忙开桌</strong>
          <p>只授予开桌与收起自己牌桌的权限，授权和全部战绩仍由管理员管理。</p>
        </div>
      </div>
      <form
        className="permission-search"
        onSubmit={(e) => {
          e.preventDefault();
          setNotice("");
          setQuery({ username: search.trim(), page: 1 });
        }}
      >
        <label>
          <span className="sr-only">授权账号</span>
          <input
            value={search}
            maxLength={48}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="输入牌友完整账号"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button className="primary" disabled={!!busy || loading}>
          <Search size={17} />
          查找账号
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!!busy || loading}
          onClick={() => {
            setSearch("");
            setQuery({ username: "", page: 1 });
            setNotice("");
          }}
        >
          已授权
        </button>
      </form>
      <div className="permission-feedback" aria-live="polite">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">
            {notice ||
              (loading
                ? "正在查询账号…"
                : query.username
                  ? "请核对账号和昵称后授权"
                  : `已授权 ${result.total} 位牌友`)}
          </p>
        )}
      </div>
      <div className="permission-list" aria-busy={loading}>
        {!loading &&
          !error &&
          result.accounts.map((a) => (
            <article className="permission-account" key={a.id}>
              <span className="permission-avatar">
                <Users size={22} />
              </span>
              <div className="permission-identity">
                <strong>{a.name}</strong>
                <span>账号：{a.username}</span>
              </div>
              <span
                className={`permission-badge ${a.canCreateTables ? "enabled" : ""}`}
              >
                {a.role === "admin"
                  ? "管理员"
                  : a.canCreateTables
                    ? "可开桌"
                    : "普通牌友"}
              </span>
              {a.role !== "admin" && (
                <button
                  className={a.canCreateTables ? "secondary" : "primary"}
                  disabled={!!busy}
                  onClick={() => change(a)}
                >
                  {busy === a.id
                    ? "保存中…"
                    : a.canCreateTables
                      ? "收回开桌权限"
                      : "授予开桌权限"}
                </button>
              )}
            </article>
          ))}
        {!loading && !error && !result.accounts.length && (
          <div className="permission-empty">
            <Users size={30} />
            <strong>
              {query.username ? "没有找到这个账号" : "还没有授权的牌友"}
            </strong>
            <p>
              {query.username
                ? "核对完整账号；对方需要先注册。"
                : "输入牌友账号，即可授予开桌权限。"}
            </p>
          </div>
        )}
      </div>
      <div className="permission-footer">
        <small>权限立即生效。收回后不能新开或自动续桌，当前对局继续。</small>
        {!query.username && result.total > result.pageSize && (
          <div>
            <button
              className="secondary"
              disabled={loading || !!busy || query.page === 1}
              onClick={() => setQuery({ ...query, page: query.page - 1 })}
            >
              上一页
            </button>
            <span>
              {query.page} / {Math.ceil(result.total / result.pageSize)}
            </span>
            <button
              className="secondary"
              disabled={
                loading ||
                !!busy ||
                query.page * result.pageSize >= result.total
              }
              onClick={() => setQuery({ ...query, page: query.page + 1 })}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
