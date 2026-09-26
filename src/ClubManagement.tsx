import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { client } from "./game-client";
import type {
  Account,
  ClubMembersPage,
  PointSummaryPage,
  Team,
} from "../shared/types";
import { exportCsv } from "./export-file";
import "./club.css";

type Tab = "members" | "teams" | "points";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
type Filters = {
  q: string;
  team: string;
  from: string;
  to: string;
  page: number;
};
function parameters(tab: Tab, query: Filters) {
  const params = new URLSearchParams({
    q: query.q.trim(),
    team: query.team,
    page: String(query.page),
  });
  if (tab === "points") {
    const from = Date.parse(query.from + "T00:00:00+08:00"),
      to = Date.parse(query.to + "T00:00:00+08:00") + 86400000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
      throw Error("请选择正确的起止日期");
    params.set("from", String(from));
    params.set("to", String(to));
  }
  return params;
}

export function ClubManagement({
  close,
  account,
}: {
  close: () => void;
  account: Account;
}) {
  const [tab, setTab] = useState<Tab>("members");
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsReady, setTeamsReady] = useState(false);
  const [members, setMembers] = useState<ClubMembersPage>();
  const [stats, setStats] = useState<PointSummaryPage>();
  const [query, setQuery] = useState<Filters>({
    q: "",
    team: "",
    page: 1,
    from: today(),
    to: today(),
  });
  const [draft, setDraft] = useState(query);
  const [teamName, setTeamName] = useState("");
  const [editing, setEditing] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const generation = useRef(0),
    clock = useRef(0),
    mounted = useRef(true);
  const pending = useRef(new Set<string>());
  const writes = useRef(new Map<string, { at: number; account: Account }>());
  // These caches live only in this authenticated dialog; no member data survives logout.
  const cache = useRef(
    new Map<string, { at: number; data: ClubMembersPage | PointSummaryPage }>(),
  );
  const requests = useRef(
    new Map<string, Promise<ClubMembersPage | PointSummaryPage>>(),
  );
  const teamRequest = useRef<Promise<{ teams: Team[] }> | null>(null);
  function loadTeams(retry = false) {
    if (retry) teamRequest.current = null;
    teamRequest.current ??= client.api<{ teams: Team[] }>("/api/admin/teams");
    void teamRequest.current
      .then((data) => {
        if (mounted.current) {
          setTeams(data.teams);
          setTeamsReady(true);
        }
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
  }
  useEffect(() => {
    mounted.current = true;
    loadTeams();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const current = ++generation.current,
      started = ++clock.current;
    if (tab === "teams") {
      setLoading(false);
      return;
    }
    let key: string;
    try {
      key = `/api/admin/${tab}?${parameters(tab, query)}`;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
      return;
    }
    const accept = (data: ClubMembersPage | PointSummaryPage) => {
      if (tab === "members") {
        const page = data as ClubMembersPage;
        setMembers({
          ...page,
          accounts: page.accounts.map((a) => {
            const write = writes.current.get(a.id);
            return write && (write.at >= started || pending.current.has(a.id))
              ? write.account
              : a;
          }),
        });
      } else setStats(data as PointSummaryPage);
    };
    const cached = cache.current.get(key);
    if (cached && Date.now() - cached.at < 30000) {
      accept(cached.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    let request = requests.current.get(key);
    if (!request) {
      request = client.api<ClubMembersPage | PointSummaryPage>(key);
      requests.current.set(key, request);
      void request
        .finally(() => {
          if (requests.current.get(key) === request)
            requests.current.delete(key);
        })
        .catch(() => {});
    }
    void request
      .then((data) => {
        if (!mounted.current || current !== generation.current) return;
        // A fetch started before a save must never replace the newly assigned team.
        if (started === clock.current)
          cache.current.set(key, { at: Date.now(), data });
        accept(data);
      })
      .catch((e) => {
        if (mounted.current && current === generation.current)
          setError(e.message);
      })
      .finally(() => {
        if (mounted.current && current === generation.current)
          setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [tab, query, revision]);

  function replaceMember(a: Account) {
    writes.current.set(a.id, { at: ++clock.current, account: a });
    cache.current.clear();
    setMembers(
      (data) =>
        data && {
          ...data,
          accounts: data.accounts.map((row) => (row.id === a.id ? a : row)),
        },
    );
  }
  async function changeMember(
    a: Account,
    patch: { teamId?: string | null; playBlocked?: boolean; admin?: boolean },
  ) {
    if (pending.current.has(a.id)) return;
    pending.current.add(a.id);
    setSaving(new Set(pending.current));
    setError("");
    setNotice("");
    const optimistic = {
      ...a,
      ...patch,
      teamName:
        patch.teamId !== undefined
          ? (teams.find((t) => t.id === patch.teamId)?.name ?? null)
          : a.teamName,
    };
    // Administrator grants only become effective in the UI after server authorization.
    if (patch.admin === undefined) replaceMember(optimistic);
    try {
      const data = await client.api<{ account: Account }>(
        patch.admin === undefined
          ? "/api/admin/members"
          : "/api/admin/administrators",
        { accountId: a.id, ...patch },
      );
      if (!mounted.current) return;
      replaceMember(data.account);
      if (data.account.teamId !== a.teamId)
        setTeams((list) =>
          list.map((t) => ({
            ...t,
            members:
              t.members +
              (t.id === data.account.teamId ? 1 : 0) -
              (t.id === a.teamId ? 1 : 0),
          })),
        );
      setNotice(
        `${a.name}：${patch.admin !== undefined ? (patch.admin ? "已设为管理员" : "已撤销管理员") : patch.teamId !== undefined ? "战队已保存" : patch.playBlocked ? "已暂停参赛，本局可打完" : "已恢复参赛"}`,
      );
    } catch (e) {
      if (mounted.current) {
        replaceMember(a);
        setError(`${a.name}保存失败：${(e as Error).message}，已恢复原设置`);
      }
    } finally {
      pending.current.delete(a.id);
      if (mounted.current) setSaving(new Set(pending.current));
    }
  }
  async function saveTeam() {
    if (teamBusy || !teamName.trim()) return;
    setTeamBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await client.api<{ id: string; name: string }>(
        "/api/admin/teams",
        { name: teamName.trim(), ...(editing ? { id: editing } : {}) },
      );
      if (!mounted.current) return;
      setTeams((list) =>
        list.some((t) => t.id === data.id)
          ? list.map((t) => (t.id === data.id ? { ...t, name: data.name } : t))
          : [...list, { ...data, members: 0 }],
      );
      cache.current.clear();
      setMembers(
        (value) =>
          value && {
            ...value,
            accounts: value.accounts.map((a) =>
              a.teamId === data.id ? { ...a, teamName: data.name } : a,
            ),
          },
      );
      setNotice(editing ? "战队名称已更新" : "已添加战队");
      setTeamName("");
      setEditing("");
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setTeamBusy(false);
    }
  }
  function search() {
    try {
      parameters(tab, draft);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError("");
    setNotice("");
    cache.current.clear();
    setQuery({ ...draft, q: draft.q.trim(), page: 1 });
    setRevision((r) => r + 1);
  }
  async function download() {
    if (exporting || loading) return;
    setExporting(true);
    setError("");
    try {
      const data = await client.api<{ csv: string }>(
        "/api/admin/points/export?" + parameters(tab, query),
      );
      await exportCsv(data.csv, `战队积分_${query.from}_${query.to}.csv`);
      if (mounted.current) setNotice("已导出查询范围的全部成员记录");
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setExporting(false);
    }
  }
  const total = tab === "members" ? (members?.total ?? 0) : (stats?.total ?? 0);
  const pageSize =
    (tab === "members" ? members?.pageSize : stats?.pageSize) ?? 20;
  return (
    <Dialog
      title="战队与会员"
      close={close}
      variant="club-dialog"
      headerAside={
        <span className="club-header-note">
          {account.canManageAdmins ? "主管理员" : "管理员"}
        </span>
      }
    >
      <nav className="club-tabs" aria-label="管理分类">
        {(
          [
            ["members", "会员管理"],
            ["teams", "战队设置"],
            ["points", "积分统计"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "primary" : "secondary"}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setQuery((q) => ({ ...q, page: 1 }));
              setDraft(query);
              setError("");
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
        <p className="club-help">
          {tab === "members"
            ? "先分战队，再入桌。暂停参赛后，本局可打完。"
            : tab === "teams"
              ? "战队改名不会改变历史成绩归属。"
              : "按整桌结束时间统计（北京时间，含结束日），跨零点不拆桌。未结束桌不计入，桌费每人每桌只计一次。"}
        </p>
      </nav>
      <section
        className="club-workspace"
        aria-label={
          tab === "members"
            ? "会员设置"
            : tab === "teams"
              ? "战队列表"
              : "积分查询结果"
        }
      >
        {tab !== "teams" ? (
          <form
            className="club-filters"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <div className="club-filter-main">
              <input
                aria-label="搜索会员"
                placeholder="ID、账号或昵称"
                value={draft.q}
                maxLength={100}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              />
              <select
                aria-label="筛选战队"
                value={draft.team}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, team: e.target.value }))
                }
              >
                <option value="">全部战队</option>
                <option value="unassigned">
                  {tab === "points" ? "历史未归队" : "未分队"}
                </option>
                {teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button className="primary" disabled={loading}>
                查询
              </button>
              {tab === "points" && (
                <button
                  type="button"
                  className="secondary"
                  disabled={exporting || loading || !stats}
                  onClick={download}
                >
                  {exporting ? "导出中…" : "导出 CSV"}
                </button>
              )}
            </div>
            {tab === "points" && (
              <div className="club-filter-dates">
                <label>
                  从
                  <input
                    aria-label="开始日期"
                    type="date"
                    value={draft.from}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, from: e.target.value }))
                    }
                  />
                </label>
                <label>
                  至
                  <input
                    aria-label="结束日期"
                    type="date"
                    value={draft.to}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, to: e.target.value }))
                    }
                  />
                </label>
              </div>
            )}
          </form>
        ) : (
          <form
            className="club-filters"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTeam();
            }}
          >
            <div className="club-filter-main">
              <input
                aria-label="战队名称"
                placeholder="填写战队名称"
                maxLength={24}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                disabled={teamBusy}
              />
              <button
                className="primary"
                disabled={teamBusy || !teamName.trim() || !teamsReady}
              >
                {teamBusy ? "保存中…" : editing ? "保存名称" : "添加战队"}
              </button>
              {editing && (
                <button
                  className="secondary"
                  type="button"
                  disabled={teamBusy}
                  onClick={() => {
                    setEditing("");
                    setTeamName("");
                  }}
                >
                  取消改名
                </button>
              )}
            </div>
          </form>
        )}
        {(error || notice) && (
          <p
            className={error ? "club-error" : "club-notice"}
            role={error ? "alert" : "status"}
          >
            {error || notice}
            {error && !teamsReady && (
              <button
                className="secondary"
                onClick={() => {
                  setError("");
                  loadTeams(true);
                }}
              >
                重试加载战队
              </button>
            )}
          </p>
        )}
        {tab === "points" && stats && (
          <div className="club-totals">
            <span>
              把数 <b>{stats.completedRounds}</b>
            </span>
            <span>
              桌数（8局/桌） <b>{stats.tables}</b>
            </span>
            <span>
              积分合计{" "}
              <b>
                {stats.points > 0 ? "+" : ""}
                {stats.points}
              </b>
            </span>
          </div>
        )}
        <div className="club-results" aria-busy={loading} key={tab}>
          {(loading || (tab === "teams" && !teamsReady && !error)) && (
            <div className="club-refresh" role="status">
              正在读取…
            </div>
          )}
          {tab === "members" && (
            <div className="club-list">
              {members?.accounts.map((a) => {
                const canEdit = a.role !== "admin" || account.canManageAdmins,
                  isSaving = saving.has(a.id);
                return (
                  <article
                    className="club-member"
                    key={a.id}
                    aria-label={`会员 ${a.username}`}
                    aria-busy={isSaving}
                  >
                    <div className="club-identity">
                      <strong>{a.name}</strong>
                      <small>
                        ID {a.memberId ?? "—"} · {a.username} ·{" "}
                        {a.role === "admin" ? "管理员" : "会员"}
                      </small>
                      <span className={a.playBlocked ? "club-blocked" : ""}>
                        {isSaving
                          ? "保存中…"
                          : a.playBlocked
                            ? "已暂停参赛"
                            : a.canPlay
                              ? "可参赛"
                              : "等待分队"}
                      </span>
                    </div>
                    <label>
                      所属战队
                      <select
                        aria-label={`${a.username} 所属战队`}
                        disabled={isSaving || !canEdit || !teamsReady}
                        value={a.teamId ?? ""}
                        onChange={(e) =>
                          void changeMember(a, {
                            teamId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">未分队</option>
                        {teams.map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="club-member-actions">
                      <button
                        className="secondary"
                        disabled={isSaving || !canEdit}
                        onClick={() =>
                          void changeMember(a, { playBlocked: !a.playBlocked })
                        }
                      >
                        {a.playBlocked ? "恢复参赛" : "暂停参赛"}
                      </button>
                      {account.canManageAdmins &&
                        a.username.toLowerCase() !== "guanli@1" && (
                          <button
                            className="secondary"
                            disabled={isSaving}
                            onClick={() =>
                              void changeMember(a, {
                                admin: a.role !== "admin",
                              })
                            }
                          >
                            {a.role === "admin" ? "撤销管理员" : "设为管理员"}
                          </button>
                        )}
                    </div>
                  </article>
                );
              })}
              {!loading && !members?.accounts.length && (
                <p className="club-empty">
                  没有符合条件的会员，请让对方先注册。
                </p>
              )}
            </div>
          )}
          {tab === "teams" && (
            <div className="club-list">
              {teams.map((t) => (
                <article className="club-team" key={t.id}>
                  <strong>{t.name}</strong>
                  <span>{t.members} 人</span>
                  <button
                    className="secondary"
                    disabled={teamBusy}
                    onClick={() => {
                      setEditing(t.id);
                      setTeamName(t.name);
                    }}
                  >
                    改名
                  </button>
                </article>
              ))}
            </div>
          )}
          {tab === "points" && stats && (
            <div className="club-stats-scroll">
              <table>
                <colgroup>
                  <col className="club-col-team" />
                  <col className="club-col-member" />
                  <col className="club-col-rounds" />
                  <col className="club-col-tables" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>战队</th>
                    <th>会员</th>
                    <th>把数</th>
                    <th>桌数（8局/桌）</th>
                    <th>积分</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rows.map((r) => (
                    <tr key={r.accountId + ":" + r.teamId}>
                      <td>{r.teamName}</td>
                      <td>
                        <strong>{r.name}</strong>
                        <small>
                          ID {r.memberId ?? "—"} · {r.username}
                        </small>
                      </td>
                      <td>{r.rounds}</td>
                      <td>{r.tables}</td>
                      <td
                        className={
                          r.points > 0
                            ? "club-positive"
                            : r.points < 0
                              ? "club-negative"
                              : ""
                        }
                      >
                        {r.points > 0 ? "+" : ""}
                        {r.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!stats.rows.length && (
                <p className="club-empty">这个时间范围内还没有已完成的牌局。</p>
              )}
            </div>
          )}
        </div>
        {tab !== "teams" && (
          <footer className="club-footer">
            <small>共 {total} 条</small>
            <button
              className="secondary"
              disabled={loading || query.page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
            >
              上一页
            </button>
            <span>
              {query.page} / {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <button
              className="secondary"
              disabled={loading || query.page * pageSize >= total}
              onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
            >
              下一页
            </button>
          </footer>
        )}
      </section>
    </Dialog>
  );
}
