import { useEffect } from "react";
import { ChevronRight, MapPin, RefreshCw, Signal, WifiOff } from "lucide-react";
import { client, type ClientState } from "./game-client";

/** A presentation-only launcher. Both entrances use the existing room service. */
export function OnlineHome({
  name, state, openTables, openFriends,
}: {
  name: string;
  state: ClientState;
  openTables: () => void;
  openFriends: () => void;
}) {
  const admin = state.account?.role === "admin";
  useEffect(() => {
    if (state.account) client.browseTables(name);
  }, [state.account?.id]);
  const connected = state.connected && state.mode === "online";
  const refreshing = state.connecting || state.tablesLoading;
  const available = state.tables.filter(
    table => table.phase === "waiting" && table.seats.some(seat => !seat),
  ).length;
  return (
    <section className="game-launcher" aria-label="联机首页">
      <h1 className="sr-only">金陵麻将</h1>
      <div className={`game-entrances ${admin ? "has-management" : "member-only"}`}>
        <button className="game-entry game-entry-rooms" aria-label="房间大厅" onClick={openTables}>
          <span className="game-entry-copy"><strong>房间大厅</strong><small>南京麻将</small></span>
          <img src={`${import.meta.env.BASE_URL}art/lobby-v4/teapot.png`} alt="" draggable={false} />
          <span className="game-entry-foot"><MapPin size={17} />南京市<ChevronRight size={18} /></span>
        </button>
        {admin && (
          <button className="game-entry game-entry-friends" aria-label="亲友房" onClick={openFriends}>
            <span className="game-entry-copy"><strong>亲友房</strong><small>牌桌管理</small></span>
            <img src={`${import.meta.env.BASE_URL}art/lobby-v4/tea-bowl.png`} alt="" draggable={false} />
            <span className="game-entry-foot">管理牌桌<ChevronRight size={18} /></span>
          </button>
        )}
        <div className="game-lobby-connection" role="status">
          {refreshing ? <RefreshCw size={16} className="game-lobby-spinner" /> : connected ? <Signal size={17} /> : <WifiOff size={17} />}
          <span>{state.network.phase === "offline" ? "网络已断开，联网后自动恢复" : refreshing ? "正在更新牌桌…" : connected ? `${available} 桌可加入` : "连接中断，正在恢复…"}</span>
          {!connected && !refreshing && <button onClick={() => client.browseTables(name)}>重试</button>}
        </div>
        {state.account && !state.account.canPlay && (
          <p className="game-admission" role="status">
            {state.account.playBlocked ? "你的参赛权限已暂停，请联系管理员。" : "请联系管理员分配战队后入桌。"}
          </p>
        )}
      </div>
    </section>
  );
}
