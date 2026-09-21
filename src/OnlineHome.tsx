import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  GraduationCap,
  LayoutGrid,
  Plus,
  RefreshCw,
  Users,
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
  const vacantSeat = t.seats.findIndex((p) => !p);
  const ready = t.seats.filter((p) => p?.ready && p.online).length;
  return (
    <article className="home-table" aria-label={`${t.name} 房号 ${t.code}`}>
      <img className="home-table-image" src={`${import.meta.env.BASE_URL}art/home-table-v1.webp`} alt="" />
      <div className="home-table-heading">
        <strong title={t.name}>{t.name}</strong>
        <span className="home-table-meta">
          <span>{t.code}</span>
          <span>
            <Users size={14} aria-hidden="true" />
            {occupied}/4 人
          </span>
        </span>
        {waiting && ready > 0 && !refreshing && (
          <small className="ready">{ready} 人已准备</small>
        )}
      </div>
      <span className={`home-table-status ${waiting ? "waiting" : "playing"}`}>
        {refreshing
          ? "更新中"
          : waiting
            ? occupied === 4
              ? "等待准备"
              : "等待入座"
            : `对局中 ${t.round}/${t.rules.rounds}`}
      </span>
      <div className="home-table-action">
        {waiting && vacantSeat >= 0 && (
          <button
            className="home-table-join"
            disabled={busy}
            aria-label={`${t.code} ${winds[vacantSeat]}位入座`}
            onClick={() => client.joinTable(name, t.code, vacantSeat as Seat)}
          >
            入桌
          </button>
        )}
      </div>
    </article>
  );
}

export function OnlineHome({
  name,
  state,
  openTables,
  joinByCode,
  rules,
}: {
  name: string;
  state: ClientState;
  openTables: () => void;
  joinByCode: () => void;
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
  const joinable = state.tables.filter(
    (t) => t.phase === "waiting" && t.seats.some((p) => !p),
  );
  const visibleTables = [...joinable].sort((a, b) => {
    const occupied = (table: TableSummary) =>
      table.seats.filter(Boolean).length;
    const emptyRank = (table: TableSummary) => (occupied(table) === 0 ? 0 : 1);
    return (
      emptyRank(a) - emptyRank(b) ||
      occupied(b) - occupied(a) ||
      a.number - b.number ||
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
          <span className="home-eyebrow">金陵有好牌 · 相聚正当时</span>
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
              <span>房号入桌</span>
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
                <span>开桌设置</span>
              </button>
            )}
          </div>
        </div>
        <div className="home-quiet-links">
          <button onClick={rules}>
            <BookOpen size={15} />
            玩法说明
            <ChevronRight size={13} />
          </button>

        </div>
      </div>
      <aside className="home-live-panel" aria-label="实时牌桌">
        <div className="home-live-heading">
          <div>
            <span className={`home-live-dot ${connected ? "live" : ""}`} />
            <h2>有空位的牌桌</h2>
          </div>
          <div className="home-live-tools">
            <span
              role="status"
              className={refreshing ? "home-refresh-status" : undefined}
            >
              {refreshing && <RefreshCw size={12} aria-hidden="true" />}
              {refreshing
                ? "更新中…"
                : live
                  ? `${joinable.length} 桌可加入`
                  : state.connecting || state.tablesLoading
                    ? "连接中…"
                    : "连接已断开"}
            </span>
            <button
              className="home-refresh"
              aria-label="刷新牌桌"
              title="刷新牌桌"
              disabled={state.connecting || state.tablesLoading}
              onClick={() => client.browseTables(name)}
            >
              <RefreshCw size={18} />
            </button>
            <button className="home-all-tables" onClick={openTables}>
              全部牌桌
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div
          className="home-live-body"
          role="region"
          aria-label="可加入牌桌，可上下滑动"
          tabIndex={0}
          aria-busy={!live}
          data-refreshing={refreshing || undefined}
        >
          {connected && visibleTables.length ? (
            visibleTables.map((t) => (
              <HomeTable
                key={t.code}
                table={t}
                busy={
                  busy || !state.account?.canPlay || !!state.account.playBlocked
                }
                refreshing={refreshing}
                name={name}
              />
            ))
          ) : !live &&
            (refreshing || state.connecting || state.tablesLoading) ? (
            <div
              className="home-loading"
              role="status"
              aria-label={refreshing ? "正在更新牌桌" : "正在连接牌桌"}
            >
              {[0, 1, 2].map((i) => (
                <div className="home-table-skeleton" key={i} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : (
            <div className="home-empty">
              <img
                className="home-empty-image"
                src={`${import.meta.env.BASE_URL}art/home-table-v1.webp`}
                alt=""
              />
              <strong>
                {refreshing
                  ? "正在更新牌桌"
                  : !live
                    ? state.connecting || state.tablesLoading
                      ? "正在连接牌桌"
                      : "暂时连接不上牌桌"
                    : "暂时没有可加入牌桌"}
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
                ? `共 ${visibleTables.length} 桌可加入`
                : "好友联机 · 四人同桌"}
          </span>
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
