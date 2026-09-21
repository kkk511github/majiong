import { useEffect, useState, type FormEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { ControlApi, controlAvatarURL, errorMessage } from "./api";
import {
  displayTime,
  mayChangeMemberAccess,
  mayEditMember,
  memberQuery,
} from "./model";
import type {
  ControlAccount,
  ControlAudit,
  ControlTeam,
  MemberFilters,
  MemberList,
} from "./types";
import { Empty, ErrorNotice, Loading, Modal, Notice, StatusBadge } from "./ui";

type MemberMode = "edit" | "password" | "suspension" | "delete";
const initialFilters: MemberFilters = { q: "", team: "", status: "", page: 1 };

function MemberAvatar({ member, compact = false }: { member: ControlAccount; compact?: boolean }) {
  const photo = controlAvatarURL(member.avatar);
  return (
    <span className={`control-avatar${compact ? " control-avatar-small" : ""}`}>
      <span aria-hidden="true">{member.name.slice(0, 1) || <UserRound size={compact ? 18 : 28} />}</span>
      {photo && <img key={photo} src={photo} alt={`${member.name}的头像`} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }} />}
    </span>
  );
}

export function Members({
  api,
  actor,
  onAccountChanged,
}: {
  api: ControlApi;
  actor: ControlAccount;
  onAccountChanged: (account: ControlAccount) => void;
}) {
  const [filters, setFilters] = useState<MemberFilters>(initialFilters);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<MemberList>({
    accounts: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [teams, setTeams] = useState<ControlTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [teamError, setTeamError] = useState("");
  const [reload, setReload] = useState(0);
  const [teamReload, setTeamReload] = useState(0);
  const [selection, setSelection] = useState<{
    account: ControlAccount;
    mode: MemberMode;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setTeamsLoading(true);
    setTeamError("");
    api
      .get<{ teams: ControlTeam[] }>("/teams", controller.signal)
      .then((result) => setTeams(result.teams))
      .catch((cause) => {
        if (!controller.signal.aborted) setTeamError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTeamsLoading(false);
      });
    return () => controller.abort();
  }, [api, teamReload]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .get<MemberList>(memberQuery(filters), controller.signal)
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, filters, reload]);

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  function changed(account: ControlAccount) {
    setData((previous) => ({
      ...previous,
      accounts: previous.accounts.map((value) =>
        value.id === account.id ? account : value,
      ),
    }));
    if (actor.id === account.id) onAccountChanged(account);
    setReload((value) => value + 1);
  }
  function deleted(account: ControlAccount) {
    const moveToPreviousPage = data.accounts.length === 1 && filters.page > 1;
    setSelection(null);
    setNotice(`账号 ${account.username} 已删除，历史战绩仍会保留。`);
    setData((previous) => ({
      ...previous,
      accounts: previous.accounts.filter((value) => value.id !== account.id),
      total: Math.max(0, previous.total - 1),
    }));
    if (moveToPreviousPage)
      setFilters((previous) => ({ ...previous, page: previous.page - 1 }));
    else setReload((value) => value + 1);
  }

  return (
    <div className="control-page">
      <div className="control-page-toolbar">
        <p>查看成员资料，维护所属战队与使用状态。</p>
      </div>
      <section className="control-panel control-members-panel">
        <form
          className="control-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters((previous) => ({ ...previous, q: query, page: 1 }));
          }}
        >
          <label className="control-search">
            <Search size={19} />
            <input
              aria-label="搜索账号、用户 ID 或昵称"
              placeholder="搜索账号、用户 ID 或昵称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="control-link" type="submit">
              搜索
            </button>
          </label>
          <select
            aria-label="战队筛选"
            value={filters.team}
            disabled={teamsLoading || !!teamError}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                team: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">全部战队</option>
            <option value="unassigned">未分配</option>
            {teams.map((team) => (
              <option value={team.id} key={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <select
            aria-label="状态筛选"
            value={filters.status}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                status: event.target.value as MemberFilters["status"],
                page: 1,
              }))
            }
          >
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="suspended">暂停使用</option>
          </select>
          <button
            className="control-button control-filter-reset"
            type="button"
            onClick={() => {
              setQuery("");
              setFilters({ ...initialFilters });
            }}
          >
            <RefreshCw size={17} />
            重置筛选
          </button>
        </form>
        <ErrorNotice retry={() => setTeamReload((value) => value + 1)}>
          {teamError && `战队列表：${teamError}`}
        </ErrorNotice>
        <div className="control-table-meta">
          <span>最新注册优先</span>
          <span>{loading ? "正在查询…" : `共 ${data.total} 位成员`}</span>
        </div>
        <ErrorNotice retry={() => setReload((value) => value + 1)}>
          {error}
        </ErrorNotice>
        {notice && <Notice success>{notice}</Notice>}
        {data.accounts.length > 0 && (
          <p className="control-mobile-table-hint">
            横向滑动查看完整资料，右侧可编辑成员。
          </p>
        )}
        {loading && !data.accounts.length ? (
          <Loading />
        ) : !data.accounts.length && !error ? (
          <Empty>没有符合条件的成员。可以调整筛选条件。</Empty>
        ) : (
          <div className="control-table-scroll" aria-busy={loading}>
            <table className="control-table control-member-table">
              <thead>
                <tr>
                  <th>用户 ID</th>
                  <th>账号</th>
                  <th>昵称</th>
                  <th>角色</th>
                  <th>所属战队</th>
                  <th>状态</th>
                  <th>注册时间 ↓</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((member) => (
                  <tr key={member.id}>
                    <td className="control-member-id">
                      {member.memberId || member.id}
                    </td>
                    <td>{member.username}</td>
                    <td>
                      <span className="control-member-name">
                        <MemberAvatar member={member} compact />
                        <strong>{member.name}</strong>
                      </span>
                    </td>
                    <td>
                      <StatusBadge>
                        {member.role === "admin" ? "管理员" : "成员"}
                      </StatusBadge>
                    </td>
                    <td>{member.teamName || "未分配"}</td>
                    <td>
                      <StatusBadge tone={member.suspended ? "bad" : "good"}>
                        {member.suspended ? "暂停使用" : "正常"}
                      </StatusBadge>
                    </td>
                    <td className="control-table-date">
                      {displayTime(member.createdAt)}
                    </td>
                    <td>
                      <div className="control-row-actions">
                        <button
                          className="control-link"
                          type="button"
                          onClick={() =>
                            setSelection({ account: member, mode: "edit" })
                          }
                        >
                          {mayEditMember(actor, member) ? "编辑" : "查看"}
                        </button>
                        {mayChangeMemberAccess(actor, member) && (
                          <details className="control-more">
                            <summary>
                              更多
                              <ChevronDown size={12} />
                            </summary>
                            <div className="control-more-menu">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  setSelection({
                                    account: member,
                                    mode: "password",
                                  });
                                }}
                              >
                                重置密码
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  setSelection({
                                    account: member,
                                    mode: "suspension",
                                  });
                                }}
                              >
                                {member.suspended ? "恢复使用" : "暂停使用"}
                              </button>
                              <button
                                className="control-danger-menu-item"
                                type="button"
                                onClick={(event) => {
                                  event.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  setSelection({
                                    account: member,
                                    mode: "delete",
                                  });
                                }}
                              >
                                删除账号
                              </button>
                            </div>
                          </details>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="control-pagination">
          <span>按注册时间倒序排列</span>
          <div>
            <button
              className="control-icon-button"
              aria-label="上一页"
              disabled={loading || data.page <= 1}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  page: Math.max(1, data.page - 1),
                }))
              }
            >
              <ChevronLeft size={19} />
            </button>
            <span>
              第 {data.page} / {pages} 页
            </span>
            <button
              className="control-icon-button"
              aria-label="下一页"
              disabled={loading || data.page >= pages}
              onClick={() =>
                setFilters((previous) => ({ ...previous, page: data.page + 1 }))
              }
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
      </section>
      {selection && (
        <MemberDrawer
          key={`${selection.account.id}:${selection.mode}`}
          api={api}
          actor={actor}
          account={selection.account}
          initialMode={selection.mode}
          teams={teams}
          teamsReady={!teamsLoading && !teamError}
          onClose={() => setSelection(null)}
          onChanged={changed}
          onDeleted={deleted}
        />
      )}
    </div>
  );
}

function MemberDrawer({
  api,
  actor,
  account,
  initialMode,
  teams,
  teamsReady,
  onClose,
  onChanged,
  onDeleted,
}: {
  api: ControlApi;
  actor: ControlAccount;
  account: ControlAccount;
  initialMode: MemberMode;
  teams: ControlTeam[];
  teamsReady: boolean;
  onClose: () => void;
  onChanged: (account: ControlAccount) => void;
  onDeleted: (account: ControlAccount) => void;
}) {
  const [member, setMember] = useState(account);
  const [mode, setMode] = useState<MemberMode>(initialMode);
  const [name, setName] = useState(account.name);
  const [teamId, setTeamId] = useState(account.teamId || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState<ControlAudit[]>([]);
  const [auditError, setAuditError] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReload, setAuditReload] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const canEdit = mayEditMember(actor, member);
  const canChangeAccess = mayChangeMemberAccess(actor, member);
  const dirty = name !== member.name || teamId !== (member.teamId || "");
  const targetTeam =
    teams.find((team) => team.id === teamId)?.name ||
    (teamId === member.teamId ? member.teamName : null) ||
    "未分配";
  const titles = {
    edit: canEdit ? "编辑人员" : "成员资料",
    password: "重置密码",
    suspension: member.suspended ? "恢复使用" : "暂停使用",
    delete: "删除账号",
  };

  useEffect(() => {
    if (!auditOpen) return;
    const controller = new AbortController();
    setAuditLoading(true);
    setAuditError("");
    api
      .get<{ audit: ControlAudit[] }>(
        `/members/${encodeURIComponent(member.id)}/audit`,
        controller.signal,
      )
      .then((result) => setAudit(result.audit))
      .catch((cause) => {
        if (!controller.signal.aborted) setAuditError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuditLoading(false);
      });
    return () => controller.abort();
  }, [api, member.id, auditOpen, auditReload]);

  function changeMode(next: MemberMode) {
    setMode(next);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmation("");
    setReason("");
    setDeleteConfirmation("");
  }
  function close() {
    if (dirty || password || confirmation || reason || deleteConfirmation)
      setConfirmClose(true);
    else onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (mode === "edit" ? !canEdit || !teamsReady : !canChangeAccess))
      return;
    if (mode === "password" && password !== confirmation) {
      setError("两次输入的新密码不一致，请重新核对。");
      return;
    }
    if (mode === "edit" && (!name.trim() || name.trim().length > 12)) {
      setError("昵称需要 1–12 个字。");
      return;
    }
    if (mode === "delete" && deleteConfirmation.trim() !== member.username) {
      setError("请输入完整账号，确认删除的是正确人员。");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "delete") {
        await api.post<{ ok: true; id: string }>(
          `/members/${encodeURIComponent(member.id)}/delete`,
        );
        onDeleted(member);
        return;
      }
      const suffix =
        mode === "edit"
          ? ""
          : mode === "password"
            ? "/password"
            : "/suspension";
      const payload =
        mode === "edit"
          ? { name: name.trim(), teamId: teamId || null }
          : mode === "password"
            ? { password, confirmPassword: confirmation }
            : { suspended: !member.suspended, reason: reason.trim() };
      const result = await api.post<{ account: ControlAccount }>(
        `/members/${encodeURIComponent(member.id)}${suffix}`,
        payload,
      );
      setMember(result.account);
      onChanged(result.account);
      setAuditReload((value) => value + 1);
      if (mode === "edit") {
        setName(result.account.name);
        setTeamId(result.account.teamId || "");
        setSuccess("人员资料已更新。");
      }
      if (mode === "password") {
        setPassword("");
        setConfirmation("");
        setMode("edit");
        setSuccess("密码已重置，原密码和已有会话已失效，该成员需重新登录。");
      }
      if (mode === "suspension") {
        setReason("");
        setMode("edit");
        setSuccess(
          result.account.suspended
            ? "已暂停使用，账号资料和历史记录已保留。"
            : "已恢复使用，角色、战队和开桌资格保持原样。",
        );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={confirmClose ? "放弃未保存的修改？" : titles[mode]}
      onClose={() => {
        if (confirmClose) setConfirmClose(false);
        else close();
      }}
      drawer
      busy={busy}
    >
      {confirmClose ? (
        <>
          <p className="control-confirm-copy">
            当前输入尚未保存。关闭后将放弃这些输入。
          </p>
          <div className="control-actions">
            <button
              className="control-button"
              onClick={() => setConfirmClose(false)}
            >
              继续编辑
            </button>
            <button
              className="control-button control-primary"
              onClick={onClose}
            >
              放弃并关闭
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="control-member-identity">
            <MemberAvatar member={member} />
            <div>
              <h3>{member.name}</h3>
              <p>ID {member.memberId || member.id}</p>
            </div>
            <StatusBadge tone={member.suspended ? "bad" : "good"}>
              {member.suspended ? "暂停使用" : "正常"}
            </StatusBadge>
          </div>
          <dl className="control-identity-details">
            <div>
              <dt>账号</dt>
              <dd>{member.username}</dd>
            </div>
            <div>
              <dt>用户 ID</dt>
              <dd>{member.memberId || member.id}</dd>
            </div>
          </dl>
          {success && <Notice success>{success}</Notice>}
          <form onSubmit={(event) => void submit(event)}>
            {mode === "edit" && (
              <>
                {!canEdit && (
                  <Notice>
                    当前账号无权修改管理员资料，可查看角色与权限。
                  </Notice>
                )}
                <label className="control-field">
                  <span>
                    昵称<small>{name.length}/12</small>
                  </span>
                  <input
                    value={name}
                    maxLength={12}
                    required
                    disabled={busy || !canEdit}
                    onChange={(event) => {
                      setName(event.target.value);
                      setSuccess("");
                    }}
                  />
                </label>
                <label className="control-field">
                  <span>所属战队</span>
                  <select
                    value={teamId}
                    disabled={busy || !canEdit || !teamsReady}
                    onChange={(event) => {
                      setTeamId(event.target.value);
                      setSuccess("");
                    }}
                  >
                    <option value="">未分配</option>
                    {member.teamId &&
                      !teams.some((team) => team.id === member.teamId) && (
                        <option value={member.teamId}>
                          {member.teamName || "当前战队"}
                        </option>
                      )}
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!teamsReady && (
                  <p className="control-field-hint">
                    战队列表未就绪，请关闭抽屉后刷新战队列表再保存。
                  </p>
                )}
                {teamId !== (member.teamId || "") && (
                  <Notice>
                    战队变更：{member.teamName || "未分配"} → {targetTeam}
                    。保存后生效。
                  </Notice>
                )}
                <dl className="control-permissions">
                  <div>
                    <dt>角色身份</dt>
                    <dd>{member.role === "admin" ? "管理员" : "成员"}</dd>
                  </div>
                  <div>
                    <dt>后台管理</dt>
                    <dd>{member.role === "admin" ? "有" : "无"}</dd>
                  </div>
                  <div>
                    <dt>管理员维护权限</dt>
                    <dd>{member.canManageAdmins === true ? "有" : "无"}</dd>
                  </div>
                  <div>
                    <dt>开桌权限</dt>
                    <dd>{member.canCreateTables === true ? "有" : "无"}</dd>
                  </div>
                </dl>
                <p className="control-muted control-permission-note">
                  <ShieldCheck size={16} />
                  角色、管理资格和开桌权限分别由服务端确认。
                </p>
                <section className="control-account-actions">
                  <h3>账号操作</h3>
                  <div className="control-actions">
                    <button
                      className="control-button"
                      type="button"
                      disabled={busy || !canChangeAccess}
                      onClick={() => changeMode("password")}
                    >
                      <KeyRound size={16} />
                      重置密码
                    </button>
                    <button
                      className={`control-button${member.suspended ? "" : " control-danger-outline"}`}
                      type="button"
                      disabled={busy || !canChangeAccess}
                      onClick={() => changeMode("suspension")}
                    >
                      {member.suspended ? "恢复使用" : "暂停使用"}
                    </button>
                    <button
                      className="control-button control-danger-outline"
                      type="button"
                      disabled={busy || !canChangeAccess}
                      onClick={() => changeMode("delete")}
                    >
                      <Trash2 size={16} />
                      删除账号
                    </button>
                  </div>
                  {!canChangeAccess && (
                    <p className="control-field-hint">
                      本人、受保护账号，或无权维护的管理员不能在这里重置密码、暂停使用或删除账号。
                    </p>
                  )}
                </section>
              </>
            )}
            {mode === "password" && (
              <>
                <Notice>
                  重置后原密码和已有会话失效，该成员需重新登录。后台不会显示或记录明文密码。
                </Notice>
                <label className="control-field">
                  <span>新密码</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    minLength={4}
                    maxLength={128}
                    required
                    disabled={busy}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="4–128 位字符"
                  />
                </label>
                <label className="control-field">
                  <span>确认新密码</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    minLength={4}
                    maxLength={128}
                    required
                    disabled={busy}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="再次输入新密码"
                  />
                </label>
              </>
            )}
            {mode === "suspension" && (
              <>
                <div className="control-confirm-copy">
                  {member.suspended ? (
                    <p>
                      恢复后，该成员可重新登录并使用应用。恢复不会改变角色、所属战队或开桌资格。
                    </p>
                  ) : (
                    <>
                      <p>
                        暂停后，该成员无法登录或进入新牌局；账号资料和历史记录保留。
                      </p>
                      <p>
                        已有 APP
                        和后台会话立即失效。进行中的牌局由断线托管继续处理。
                      </p>
                    </>
                  )}
                </div>
                <label className="control-field">
                  <span>
                    处理原因<small>选填</small>
                  </span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={reason}
                    disabled={busy}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="此原因会保留在操作记录中"
                  />
                </label>
              </>
            )}
            {mode === "delete" && (
              <>
                <div className="control-confirm-copy control-delete-warning">
                  <Trash2 size={22} />
                  <div>
                    <strong>删除后无法恢复这个登录账号。</strong>
                    <p>
                      该账号的游戏和后台会话会立即失效，当前战队归属会移除；已经完成的牌局、战绩、积分与回放继续保留。
                    </p>
                  </div>
                </div>
                <label className="control-field">
                  <span>输入账号 {member.username} 确认删除</span>
                  <input
                    aria-label="输入账号确认删除"
                    autoComplete="off"
                    value={deleteConfirmation}
                    disabled={busy}
                    onChange={(event) => {
                      setDeleteConfirmation(event.target.value);
                      setError("");
                    }}
                    placeholder={member.username}
                  />
                </label>
              </>
            )}
            <ErrorNotice>{error}</ErrorNotice>
            <div className="control-actions control-drawer-footer">
              <button
                className="control-button"
                type="button"
                disabled={busy}
                onClick={() => (mode === "edit" ? close() : changeMode("edit"))}
              >
                {mode === "edit" ? "取消" : "返回资料"}
              </button>
              {(mode === "edit" ? canEdit : canChangeAccess) && (
                <button
                  className={`control-button ${mode === "delete" || (mode === "suspension" && !member.suspended) ? "control-danger" : "control-primary"}`}
                  type="submit"
                  disabled={
                    busy ||
                    (mode === "edit" && (!dirty || !teamsReady)) ||
                    (mode === "delete" &&
                      deleteConfirmation.trim() !== member.username)
                  }
                >
                  {busy
                    ? "处理中…"
                    : mode === "edit"
                      ? "保存修改"
                      : mode === "password"
                        ? "确认重置"
                        : mode === "delete"
                          ? "确认删除账号"
                          : member.suspended
                            ? "确认恢复"
                            : "确认暂停"}
                </button>
              )}
            </div>
          </form>
          {mode === "edit" && (
            <section className="control-audit">
              <button
                className="control-audit-toggle"
                type="button"
                aria-expanded={auditOpen}
                onClick={() => setAuditOpen((value) => !value)}
              >
                最近操作
                <ChevronDown size={17} />
              </button>
              {auditOpen && (
                <>
                  <ErrorNotice
                    retry={() => setAuditReload((value) => value + 1)}
                  >
                    {auditError}
                  </ErrorNotice>
                  {auditLoading ? (
                    <Loading />
                  ) : audit.length ? (
                    <ol>
                      {audit.map((item) => (
                        <li key={item.id}>
                          <strong>{auditEventLabel(item.event)}</strong>
                          <span>
                            {item.actorName || "管理员"} ·{" "}
                            {displayTime(item.at)}
                          </span>
                          {auditChanges(item, teams) && (
                            <p>{auditChanges(item, teams)}</p>
                          )}
                          {item.reason && <p>原因：{item.reason}</p>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    !auditError && (
                      <p className="control-muted">暂无操作记录。</p>
                    )
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </Modal>
  );
}

function auditEventLabel(event: string) {
  const labels: Record<string, string> = {
    "member.updated": "更新人员资料",
    "member.profile": "更新人员资料",
    "member-update": "更新人员资料",
    "profile-updated": "更新人员资料",
    "member.password_reset": "重置密码",
    "member-password-reset": "重置密码",
    "password-reset": "重置密码",
    "member.suspended": "暂停使用",
    "member-suspended": "暂停使用",
    "account-suspended": "暂停使用",
    suspended: "暂停使用",
    "member.restored": "恢复使用",
    "member-restored": "恢复使用",
    "account-restored": "恢复使用",
    restored: "恢复使用",
    "membership-changed": "更新战队归属",
    "password-changed": "修改密码",
    "admin-provisioned": "创建管理员",
    "administrator-changed": "变更管理员身份",
    "team-created": "创建战队",
    "team-renamed": "战队更名",
  };
  return labels[event] || "账号操作";
}

function auditChanges(item: ControlAudit, teams: ControlTeam[]) {
  const before = item.before,
    after = item.after;
  if (!before || !after) return "";
  const changes: string[] = [];
  if (
    before.name !== after.name &&
    (typeof before.name === "string" || typeof after.name === "string")
  )
    changes.push(
      `昵称：${String(before.name ?? "—")} → ${String(after.name ?? "—")}`,
    );
  if (before.teamId !== after.teamId) {
    const teamName = (value: unknown) =>
      teams.find((team) => team.id === value)?.name ||
      (value ? `战队 ${String(value)}` : "未分配");
    changes.push(
      `战队：${teamName(before.teamId)} → ${teamName(after.teamId)}`,
    );
  }
  if (
    typeof before.suspended === "boolean" &&
    typeof after.suspended === "boolean" &&
    before.suspended !== after.suspended
  )
    changes.push(
      `状态：${before.suspended ? "暂停使用" : "正常"} → ${after.suspended ? "暂停使用" : "正常"}`,
    );
  return changes.join("；");
}
