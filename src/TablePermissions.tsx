import { useEffect, useRef, useState } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";
import { Dialog } from "./Dialog";
import { client } from "./game-client";
import type { TablePermissionsPage } from "../shared/types";
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
  const [error, setError] = useState("");
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
  return (
    <Dialog title="开桌权限" close={close} variant="permissions-dialog">
      <div className="permission-intro">
        <ShieldCheck size={24} />
        <div>
          <strong>仅 guanli@1 可开桌</strong>
          <p>
            普通桌和体验桌均由此账号创建。此处仅供查询，其他管理员仍可管理牌桌、战队与会员。
          </p>
        </div>
      </div>
      <form
        className="permission-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ username: search.trim(), page: 1 });
        }}
      >
        <label>
          <span className="sr-only">查询账号</span>
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
        <button className="primary" disabled={loading}>
          <Search size={17} />
          查找账号
        </button>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => {
            setSearch("");
            setQuery({ username: "", page: 1 });
          }}
        >
          可开桌账号
        </button>
      </form>
      <div className="permission-feedback" aria-live="polite">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">
            {loading
              ? "正在查询账号…"
              : query.username
                ? "账号开桌权限（只读）"
                : `可开桌账号 ${result.total} 个`}
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
                {a.canCreateTables ? "可开桌" : "不可开桌"}
              </span>
            </article>
          ))}
        {!loading && !error && !result.accounts.length && (
          <div className="permission-empty">
            <Users size={30} />
            <strong>
              {query.username ? "没有找到这个账号" : "暂无可开桌账号"}
            </strong>
            <p>
              {query.username
                ? "核对完整账号；对方需要先注册。"
                : "开桌权限仅限指定管理员账号。"}
            </p>
          </div>
        )}
      </div>
      <div className="permission-footer">
        <small>开桌权限固定，不能在此授予或转交他人。</small>
        {!query.username && result.total > result.pageSize && (
          <div>
            <button
              className="secondary"
              disabled={loading || query.page === 1}
              onClick={() => setQuery({ ...query, page: query.page - 1 })}
            >
              上一页
            </button>
            <span>
              {query.page} / {Math.ceil(result.total / result.pageSize)}
            </span>
            <button
              className="secondary"
              disabled={loading || query.page * result.pageSize >= result.total}
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
