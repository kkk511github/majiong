import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  LayoutGrid,
  Plus,
  RefreshCw,
  Users,
  UserRound,
  WifiOff,
} from "lucide-react";
import { mayCreateTables } from "../shared/permissions";
import type { Seat, TableSummary } from "../shared/types";
import { client, type ClientState } from "./game-client";
import { TableSetup } from "./TableLobby";

const winds = ["东", "南", "西", "北"];
function HomeTable({
  table: t,
  busy,
  refreshing,
  name,
}: {
  table: TableSummary;
  busy: boolean;
  refreshing: boolean;
  name: string;
}) {
  const occupied = t.seats.filter(Boolean).length;
  const waiting = t.phase === "waiting";
  return (
    <article className="home-table" aria-label={`${t.name} 房号 ${t.code}`}>
      <div className="home-table-heading">
        <div>
          <strong>{t.name}</strong>
          <span>
            {t.code} · {t.rules.rounds} 局
          </span>
        </div>
        <span
          className={`home-table-status ${waiting ? "waiting" : "playing"}`}
        >
          {refreshing
            ? "更新中"
            : waiting
              ? occupied === 4
                ? "等待准备"
                : `还差 ${4 - occupied} 人`
              : `对局中 ${t.round}/${t.rules.rounds}`}
        </span>
      </div>
      <div className="home-table-seats">
        {t.seats.map((p, i) =>
          p ? (
            <div className={`home-seat occupied seat-tone-${i}`} key={i}>
              <span className="home-seat-avatar" aria-hidden="true">
                {p.name.slice(0, 1) || <UserRound size={18} />}
              </span>
              <div>
                <strong>{p.isMe ? "我" : p.name}</strong>
                <small
                  className={!refreshing && p.ready && p.online ? "ready" : ""}
                >
                  {refreshing
                    ? "待更新"
                    : !p.online
                      ? "离线"
                      : waiting
                        ? p.ready
                          ? "已准备"
                          : "待准备"
                        : "对局中"}
                </small>
              </div>
            </div>
          ) : (
            <button
              className="home-seat vacant"
              key={i}
              disabled={busy || !waiting}
              aria-label={`${t.code} ${winds[i]}位入座`}
              onClick={() => client.joinTable(name, t.code, i as Seat)}
            >
              <span className="home-seat-avatar">
                <Plus size={19} />
              </span>
              <div>
                <strong>入座</strong>
                <small>{winds[i]}位空闲</small>
              </div>
            </button>
          ),
        )}
      </div>
    </article>
  );
}

export function OnlineHome({
  name,
  state,
  resumable,
  openTables,
  joinByCode,
  practice,
  newPractice,
  rules,
}: {
  name: string;
  state: ClientState;
  resumable: boolean;
  openTables: () => void;
  joinByCode: () => void;
  practice: () => void;
  newPractice: () => void;
  rules: () => void;
}) {
  const canOpen = mayCreateTables(state.account);
  const [setup, setSetup] = useState(false);
  const initialCreated = useRef(state.createdTables);
  useEffect(() => {
    if (state.account) client.browseTables(name);
  }, [state.account?.id]);
  useEffect(() => {
    if (!canOpen) setSetup(false);
  }, [canOpen]);
  useEffect(() => {
    if (
      setup &&
      state.createdTables !== initialCreated.current &&
      state.createdTables.length
    ) {
      setSetup(false);
      openTables();
    }
    initialCreated.current = state.createdTables;
  }, [state.createdTables]);
  const connected = state.connected && state.mode === "online";
  const refreshing = connected && state.tablesLoading;
  const live = connected && !state.tablesLoading;
  const busy = !live || !!state.submitting;
  const active = state.tables.filter((t) => t.phase !== "finished");
  const waiting = active.filter(
    (t) => t.phase === "waiting" && t.seats.some((p) => !p),
  );
  const visibleTables = [...active].sort((a, b) => {
    const rank = (t: TableSummary) =>
      t.phase === "waiting" && t.seats.some((p) => !p)
        ? 0
        : t.phase === "waiting"
          ? 1
          : 2;
    return (
      rank(a) - rank(b) ||
      b.seats.filter(Boolean).length - a.seats.filter(Boolean).length ||
      a.code.localeCompare(b.code)
    );
  });
  return (
    <section className="online-home" aria-label="联机首页">
      <div className="home-welcome">
        {state.account && !state.account.canPlay && (
          <p className="admission-notice" role="status">
            {state.account.playBlocked
              ? "你的参赛权限已暂停，请联系管理员。"
              : "账号已注册，请联系管理员分配战队后入桌。"}
          </p>
        )}

        <div className="home-intro">
          <span className="home-eyebrow">金陵相聚 · 好友同桌</span>
          <h1>南京麻将</h1>
          <p>
            碰杠不吃<span>·</span>二十张花<span>·</span>四人约局
          </p>
        </div>
        <div className="home-actions">
          <button
            className="home-online-primary"
            aria-label="进入牌桌大厅"
            onClick={openTables}
          >
            <LayoutGrid size={25} />
            <span>
              <strong>进入牌桌大厅</strong>
              <small>选桌入座 · 与牌友一起开局</small>
            </span>
            <ArrowRight size={23} />
          </button>
          <div
            className={`home-secondary-actions ${canOpen ? "can-create" : ""}`}
          >
            <button
              className="home-join"
              aria-label="加入好友桌"
              onClick={joinByCode}
            >
              <Users size={21} />
              <span>
                房号入桌<small>输入 6 位房间号</small>
              </span>
            </button>
            {canOpen && (
              <button
                className="home-create"
                aria-label="开一桌，等朋友"
                onClick={() => {
                  client.clearError();
                  setSetup(true);
                }}
              >
                <Plus size={20} />
                <span>
                  开桌设置<small>设置玩法 · 邀友牌友</small>
                </span>
              </button>
            )}
          </div>
        </div>
        <div className="home-quiet-links">
          <button onClick={rules}>
            <BookOpen size={15} />
            玩法说明
          </button>
          <i />
          <button
            aria-label={
              resumable ? "继续打，恢复上次练习" : "单人练习，快速开始"
            }
            onClick={practice}
          >
            {resumable ? "继续练习" : "单人练习"}
            <ChevronRight size={13} />
          </button>
          {resumable && (
            <button
              className="home-new-practice"
              aria-label="新开练习"
              onClick={newPractice}
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>
      <aside className="home-live-panel" aria-label="实时牌桌">
        <div className="home-live-heading">
          <div>
            <span className={`home-live-dot ${connected ? "live" : ""}`} />
            <h2>牌友正在等你</h2>
          </div>
          <span
            role="status"
            className={refreshing ? "home-refresh-status" : undefined}
          >
            {refreshing && <RefreshCw size={12} aria-hidden="true" />}
            {refreshing
              ? "更新中…"
              : live
                ? `${waiting.length} 桌有空位`
                : state.connecting || state.tablesLoading
                  ? "连接中…"
                  : "连接已断开"}
          </span>
        </div>
        <div
          className="home-live-body"
          role="region"
          aria-label="全部实时牌桌，可上下滑动"
          tabIndex={0}
          aria-busy={!live}
          data-refreshing={refreshing || undefined}
        >
          {connected && visibleTables.length ? (
            visibleTables.map((t) => (
              <HomeTable
                key={t.code}
                table={t}
                busy={busy}
                refreshing={refreshing}
                name={name}
              />
            ))
          ) : (
            <div className="home-empty">
              <div className="home-empty-table" aria-hidden="true">
                <span>金陵</span>
                {winds.map((w) => (
                  <i key={w}>
                    <UserRound size={19} />
                  </i>
                ))}
              </div>
              <strong>
                {refreshing
                  ? "正在更新牌桌"
                  : !live
                    ? state.connecting || state.tablesLoading
                      ? "正在连接牌桌"
                      : "暂时连接不上牌桌"
                    : "好牌局，等你来相聚"}
              </strong>
              <p>
                {refreshing
                  ? "正在获取最新空位与准备状态"
                  : !live
                    ? "连上后，空位与准备状态会自动更新"
                    : canOpen
                      ? "开好桌子，朋友即可入座准备"
                      : "等待管理员开桌，或输入好友房号加入"}
              </p>
              {!connected && !state.connecting && (
                <button
                  className="home-retry"
                  onClick={() => client.browseTables(name)}
                >
                  <WifiOff size={14} />
                  重新连接
                </button>
              )}
            </div>
          )}
        </div>
        <div className="home-live-footer">
          <span>
            {refreshing
              ? "正在更新空位 · 稍后即可入座"
              : live && visibleTables.length
                ? `共 ${visibleTables.length} 桌 · 上下滑动选桌`
                : "好友联机 · 四人同桌"}
          </span>
          <button onClick={openTables}>
            全部牌桌
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      {setup && canOpen && (
        <TableSetup
          name={name}
          busy={busy}
          error={state.error}
          close={() => setSetup(false)}
          submit={(settings, gameRules, count) =>
            client.createTables(name, settings, gameRules, count)
          }
        />
      )}
    </section>
  );
}
