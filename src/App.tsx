import { copyText } from "./clipboard";
import { DeferredFeature } from "./DeferredFeature";
import { ruleDisplayName } from "../shared/nanjing-rules";
import { AudioRecovery } from "./AudioRecovery";
import { NetworkDiagnostics } from "./NetworkDiagnostics";
import { networkLabel } from "./network-health";
import { MIN_PASSWORD_LENGTH } from "../shared/account-profile";
import { ProfilePage } from "./ProfilePage";
import { CocosTable } from "./CocosTable";
import { useScoreDebits } from "./useScoreDebits";
import { openingScene, openingTitle, type OpeningCue } from "./TableOpening";
import { cocosState } from "./cocos-state";
import { referenceRiverSlot } from "./table-camera";
import { TableSeatTiles, SurfaceTile } from "./TableSeat";
import { meldDisplayTiles } from "../shared/table-scene";
import { MeldSourceArrow } from "./MeldSourceArrow";
import { useRiverPlacement } from "./river-placement";
import { RoomVoice } from "./RoomVoice";
import { decisionCountdown } from "../shared/timing";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import {
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Flower2,
  History,
  Home,
  Leaf,
  LayoutGrid,
  LogOut,
  Plus,
  Play,
  RotateCw,
  Settings,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { client, storage, avatarURL } from "./game-client";
import { Tile, TileBack } from "./Tile";
import { GameMotion, useGameMotion, useHandMotion } from "./GameMotion";
import { Dialog } from "./Dialog";
import { AuthScreen } from "./AuthScreen";
const ClubManagement = lazy(() => import("./ClubManagement").then(m => ({ default: m.ClubManagement })));
const TablePermissions = lazy(() => import("./TablePermissions").then(m => ({ default: m.TablePermissions })));
import { mayCreateTables } from "../shared/permissions";
const RecordsPanel = lazy(() => import("./RecordsPanel").then(m => ({ default: m.RecordsPanel })));
import { Settlement, ScoreDetails } from "./Settlement";
import { roundReadiness } from "./round-readiness";
import { RoundReveal } from "./RoundReveal";
import { resultDisplayLabel } from "./win-label";
import { listeningHints, readyDiscardTiles } from "./listening-hints";
import { riverLayoutFor, tableRiverLayout } from "./river-layout";
import { DiscardArrow } from "./DiscardArrow";
import { TableLobby, TableSettingsSummary } from "./TableLobby";
import { OnlineHome } from "./OnlineHome";
import { resultWait } from "../shared/table-settings";
import { gameAudio, gameCues, type AudioPreferences } from "./audio";
import { discardedVoice } from "./tile-voice";
import { actionVoices } from "./voice-events";
import { AudioSettings } from "./AudioSettings";
import {
  DEFAULT_RULES,
  type Game,
  type PublicPlayer,
  type RoundRecord,
  type Rules,
  type Seat,
  type View,
} from "../shared/types";
import { kind, tileName } from "../shared/tiles";
import { ruleSections } from "./rule-copy";
import { LegalContent } from "./Legal";

type Page = "tables" | "home" | "history" | "rules" | "profile";
type Modal =
  | "legal"
  | "create"
  | "join"
  | "leave"
  | "settings"
  | "rules"
  | "events"
  | "table"
  | "password"
  | "club"
  | "permissions"
  | "newPractice"
  | null;
const seatNames = ["东", "南", "西", "北"];

function RulesContent({ view }: { view?: View | null }) {
  return (
    <div className="rules-content">
      <div className="edition">
        <Flower2 size={20} />
        <span>南京麻将 · {ruleDisplayName(view?.rules) ?? "进园子 B档"}</span>
      </div>
      {ruleSections(view?.rules, view?.table?.settings).map(
        ([title, text], i) => (
          <section key={title}>
            <span className="rule-index">0{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </section>
        ),
      )}
    </div>
  );
}
function Avatar({
  player,
  seat = 0,
  big = false,
}: {
  player?: { name: string; bot: boolean; avatar?: string } | null;
  seat?: number;
  big?: boolean;
}) {
  return (
    <span className={`avatar avatar-${seat} ${big ? "big" : ""}`}>
      {player ? <>
        <span className="portrait-art" aria-hidden="true" />
        {avatarURL(player.avatar) && <img key={player.avatar} className="user-avatar" src={avatarURL(player.avatar)} alt={`${player.name}的头像`} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />}
      </> : <Plus size={24} />}
    </span>
  );
}

export function App() {
  const [scoreDetailsKey, setScoreDetailsKey] = useState("");
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [page, setPage] = useState<Page>("home"),
    [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState(storage.get("name", "金陵牌友"));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const admin = state.account?.role === "admin";
  const canOpen = mayCreateTables(state.account);
  useEffect(() => {
    if (!canOpen && modal === "create") setModal(null);
  }, [canOpen, modal]);
  useEffect(() => {
    if (state.account) {
      setName(state.account.name);
    }
  }, [state.account?.id, state.account?.name]);
  const [rounds, setRounds] = useState(4),
    [seconds, setSeconds] = useState(30),
    [code, setCode] = useState("");
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>(
    () => ({
      sound: storage.get("sound", true),
      music: storage.get("music", true),
      soundVolume: storage.get("soundVolume", 0.7),
      musicVolume: storage.get("musicVolume", 0.4),
      voice: storage.get("voice", storage.get("sound", true)),
      voiceVolume: storage.get("voiceVolume", 0.85),
      voiceGender:
        storage.get<string>("voiceGender", "male") === "female"
          ? "female"
          : "male",
      chat: storage.get("chat", true),
    }),
  );
  const [toast, setToast] = useState("");
  const [roomError, setRoomError] = useState<{
    field: "name" | "code";
    message: string;
  } | null>(null);
  const [tableSeat, setTableSeat] = useState<Seat>(0);
  const [riverLayout, setRiverLayout] = useState(() =>
    riverLayoutFor(480, 220),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const selectionContext = useRef<{ id?: string; round?: number; canDiscard?: boolean }>({});
  const [, refreshClock] = useState(0);
  const now = client.now();
  const [dismissedResult, setDismissedResult] = useState("");
  const [finishedSnapshot, setFinishedSnapshot] = useState<View | null>(null);
  const v = state.view,
    mine = v?.players[v.me];
  useEffect(() => {
    if (v?.phase === "finished" && v.table?.settings.continuousRounds)
      setFinishedSnapshot(v);
    else if (v && v.phase !== "finished") setFinishedSnapshot(null);
  }, [v]);
  // Keep the newly drawn physical tile at the right until a discard is confirmed.
  // Engine hands stay sorted; meld claims and restored result screens have no draw slot.
  const drawnTile =
    v?.canDiscard && v.lastDraw !== undefined && mine?.hand.includes(v.lastDraw)
      ? v.lastDraw
      : undefined;
  const displayedHand =
    drawnTile === undefined
      ? mine?.hand
      : [...mine!.hand.filter((tile) => tile !== drawnTile), drawnTile];
  const motionLive =
    state.connected && !(state.mode === "local" && modal !== null);
  const motion = useGameMotion(v, motionLive);
  const [opening, setOpening] = useState<OpeningCue | null>(null);
  const [tableEntryBusy, setTableEntryBusy] = useState(false);
  const debitEvents = useScoreDebits(v, motionLive, !tableEntryBusy);
  useEffect(() => {
    if (state.openingCue) setOpening(state.openingCue);
  }, [state.openingCue]);
  useEffect(() => {
    if (!motionLive || !v || v.result) setOpening(null);
  }, [motionLive, v?.id, v?.result]);
  useEffect(() => {
    for (const src of [openingScene, openingTitle]) { const image = new Image(); image.src = src; }
  }, []);
  const showingWinEffect = !!v?.result && motion.some(e=>e.type==="hu");
  const readyDiscards = useMemo(()=>v ? readyDiscardTiles(v) : [],[v]);
  const handRef = useHandMotion(v, motionLive);
  const previousAudioView = useRef<View | null>(null);
  const openingAudioKey = useRef("");
  const previousRoom = useRef<View | null>(null);
  useEffect(() => {
    if (previousRoom.current?.table && !v) {
      setPage("tables");
      setModal(null);
      setDismissedResult("");
    }
    previousRoom.current = v;
  }, [v]);
  const riverRef = useRef<HTMLDivElement>(null);
  const submittedRevision = useRef<number | null>(null);
  const roomErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    submittedRevision.current = null;
  }, [v?.id, state.error]);
  useEffect(() => {
    client.restore();
  }, []);
  useEffect(() => setRoomError(null), [modal, name, code]);
  useEffect(() => {
    if (roomError) roomErrorRef.current?.scrollIntoView({ block: "nearest" });
  }, [roomError]);
  useEffect(() => {
    const t = setInterval(() => refreshClock((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    const previous = selectionContext.current;
    // An off-turn preview must not turn the next single tap into a discard.
    const newDiscardTurn = !!v?.canDiscard && !previous.canDiscard;
    if (selected !== null && (!mine?.hand.includes(selected) ||
        !v || !["playing", "claiming"].includes(v.phase) || mine.trustee ||
        previous.id !== v.id || previous.round !== v.round || newDiscardTurn))
      setSelected(null);
    selectionContext.current = { id: v?.id, round: v?.round, canDiscard: v?.canDiscard };
  }, [v, selected, mine]);
  useEffect(() => {
    gameAudio.configure(audioPreferences, !!v && v.phase !== "waiting");
    Object.entries(audioPreferences).forEach(([key, value]) =>
      storage.set(key, value),
    );
  }, [audioPreferences, v?.phase]);
  useEffect(() => {
    let nativeActive: boolean | undefined;
    let wasVisible = !document.hidden;
    const visibility = (event?: Event) => {
      // Native lifecycle is authoritative once available: WKWebView visibility
      // events can arrive out of order during the foreground transition.
      const visible = nativeActive ?? !document.hidden;
      // Focus also moves between the canvas iframe, controls and result dialog.
      // Only a real lifecycle transition should discard the audio baseline;
      // clearing it on an in-page focus change can swallow the just-confirmed hu.
      if (event?.type !== "focus" || !visible || !wasVisible)
        previousAudioView.current = null;
      wasVisible = visible;
      gameAudio.setVisible(visible);
      client.setNetworkVisible(visible);
    };
    document.addEventListener("pointerdown", gameAudio.unlock, {
      capture: true,
    });
    // Touch activation is granted on release in mobile Safari/WeChat.
    document.addEventListener("pointerup", gameAudio.unlock, { capture: true });
    document.addEventListener("touchend", gameAudio.unlock, { capture: true, passive: true });
    document.addEventListener("keydown", gameAudio.unlock, { capture: true });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", visibility);
    window.addEventListener("focus", visibility);
    let active = true;
    let appListener: PluginListenerHandle | undefined;
    if (Capacitor.isNativePlatform())
      void NativeApp.addListener("appStateChange", ({ isActive }) => {
        nativeActive = isActive;
        visibility();
      })
        .then((handle) => {
          if (active) appListener = handle;
          else void handle.remove();
        })
        .catch(() => {});
    window.addEventListener("online", client.resumeConnection);
    window.addEventListener("offline", client.networkOffline);
    visibility();
    return () => {
      document.removeEventListener("pointerdown", gameAudio.unlock, {
        capture: true,
      });
      document.removeEventListener("keydown", gameAudio.unlock, {
        capture: true,
      });
      document.removeEventListener("pointerup", gameAudio.unlock, { capture: true });
      document.removeEventListener("touchend", gameAudio.unlock, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", visibility);
      window.removeEventListener("focus", visibility);
      active = false;
      void appListener?.remove();
      window.removeEventListener("online", client.resumeConnection);
      window.removeEventListener("offline", client.networkOffline);
      gameAudio.dispose();
    };
  }, []);
  useEffect(() => {
    if (!state.connected || document.hidden) {
      previousAudioView.current = null;
      gameAudio.stopVoice();
      return;
    }
    const cues = gameCues(previousAudioView.current, v);
    const start = state.openingCue;
    if (start && start.game === v?.id && start.round === v.round &&
        Date.now() - start.at < 6000 && start.key !== openingAudioKey.current) {
      openingAudioKey.current = start.key;
      if (!cues.includes("deal")) cues.unshift("deal");
    }
    cues.forEach((cue, i) =>
      gameAudio.play(cue, i * 0.12),
    );
    const spoken = discardedVoice(previousAudioView.current, v);
    if (spoken) gameAudio.sayTile(spoken.key, spoken.tile);
    actionVoices(previousAudioView.current, v).forEach(({ key, phrase }) =>
      gameAudio.sayTile(key, phrase),
    );
    previousAudioView.current = v;
  }, [v, state.connected]);
  const changeAudio = (patch: Partial<AudioPreferences>) => {
    const next = { ...audioPreferences, ...patch };
    gameAudio.configure(next, !!v && v.phase !== "waiting");
    gameAudio.unlock();
    setAudioPreferences(next);
  };
  useEffect(() => {
    client.pauseLocal(modal !== null || tableEntryBusy || document.hidden);
  }, [modal, tableEntryBusy]);
  useEffect(() => {
    const change = () => client.pauseLocal(document.hidden || modal !== null || tableEntryBusy);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [modal, tableEntryBusy]);
  function clickSound() {
    gameAudio.play("select");
  }
  function discardTile(tile: number) {
    if (
      !v?.canDiscard ||
      !mine ||
      mine.trustee ||
      !state.connected ||
      state.submitting ||
      !mine.hand.includes(tile) ||
      submittedRevision.current === v.revision
    )
      return;
    submittedRevision.current = v.revision;
    client.action({ type: "discard", tile });
    setSelected(null);
  }
  function selectTile(tile: number) {
    if (selected === tile) {
      if (v?.canDiscard) discardTile(tile);
      else setSelected(null);
    }
    else {
      clickSound();
      setSelected(tile);
    }
  }
  function saveName() {
    const value = name.trim();
    if (!value || value.length > 12) {
      setToast("昵称需要 1–12 个字");
      return false;
    }
    setName(value);
    storage.set("name", value);
    return true;
  }
  async function beginOnline(type: "create" | "join") {
    if (!name.trim() || name.trim().length > 12) {
      setRoomError({
        field: "name",
        message: "请填写 1–12 个字的昵称，让朋友认出你。",
      });
      return;
    }
    if (type === "join" && !/^\d{6}$/.test(code)) {
      setRoomError({
        field: "code",
        message: "房间号需要 6 位数字，请核对后再加入。",
      });
      return;
    }
    saveName();
    try {
      if (state.account && state.account.name !== name.trim())
        await client.updateProfile(name.trim());
    } catch (error) {
      setToast((error as Error).message);
      return;
    }
    setModal(null);
    setDismissedResult("");
    client.connect(
      name.trim(),
      type === "create"
        ? { type, rules: { rounds, turnSeconds: seconds } }
        : { type, code },
    );
  }
  async function copyCode() {
    if (!v) return;
    try {
      await copyText(v.code);
      setToast("房间号已复制");
    } catch {
      setToast(`房间号：${v.code}`);
    }
  }
  const commandsDisabled = !state.connected || !!state.submitting;
  const resultKey = v?.result ? `${v.id}-${v.round}-${v.result.reason}` : "";
  useEffect(() => {
    setScoreDetailsKey("");
  }, [resultKey]);
  const gameActive = v && !["waiting"].includes(v.phase);
  const ticking = !!v && ["playing", "claiming"].includes(v.phase);
  const timed = ticking && v.rules.turnSeconds > 0;
  const resultSecondsLeft = v
    ? Math.ceil(
        (state.mode === "local" && v.phase === "ended"
          ? Math.max(0, v.deadline - now)
          : resultWait(v, now)) / 1000,
      )
    : 0;
  const continuousRounds =
    state.mode === "local" || !!v?.table?.settings.continuousRounds;
  const autoNext =
    state.mode === "online" &&
    (v?.table?.settings.readyMode === "auto" || !!mine?.trustee) &&
    !mine?.awaitingReady;
  const nextRound =
    v?.phase === "ended" && state.mode === "online"
      ? roundReadiness(v, state.connected, resultSecondsLeft)
      : undefined;
  const decisionTime =
    v && timed ? decisionCountdown(v, now) : { seconds: 0, overtime: false };
  const countdown = decisionTime.seconds;
  const myOvertime =
    state.connected &&
    timed &&
    decisionTime.overtime &&
    (v?.canDiscard || !!v?.actions.length) &&
    !mine?.trustee;
  const waitingOthersOvertime =
    !!v && v.phase === "claiming" && !v.actions.length && decisionTime.overtime;
  const paused = state.mode === "local" && (modal !== null || tableEntryBusy);
  const waitingFor = v?.players
    .filter((p) => p && !p.ready)
    .map((p) => p!.name)
    .join("、");
  useEffect(() => {
    if (
      state.connected &&
      !paused &&
      (v?.canDiscard || !!v?.actions.length) &&
      !mine?.trustee &&
      countdown > 0 &&
      countdown <= 5
    )
      gameAudio.play("warning");
  }, [
    state.connected,
    countdown,
    v?.deadline,
    paused,
    v?.canDiscard,
    v?.actions.length,
    mine?.trustee,
  ]);
  useEffect(() => {
    const viewport = riverRef.current;
    if (!gameActive || !viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setRiverLayout(
        tableRiverLayout(entry.contentRect.width, entry.contentRect.height, window.innerHeight),
      );
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [gameActive, handRef]);
  useRiverPlacement(
    `${gameActive}:${v?.revision}:${selected}:${riverLayout.tileHeight}:${riverLayout.width}:${riverLayout.height}`,
  );
  const hintDiscard =
    mine?.hand.length && mine.hand.length % 3 === 2
      ? (selected ?? undefined)
      : undefined;
  const inspectedTile =
    selected !== null && mine?.hand.includes(selected) ? selected : null;
  const inspectedKind = inspectedTile === null ? null : kind(inspectedTile);
  const inspectedDiscardCount =
    inspectedKind === null
      ? 0
      : (v?.players.reduce(
          (total, player) =>
            total +
            (player?.discards.filter((tile) => kind(tile) === inspectedKind)
              .length ?? 0),
          0,
        ) ?? 0);
  const hintKinds = useMemo(
    () =>
      mine && v && ["playing", "claiming"].includes(v.phase)
        ? listeningHints(mine, v.rules, hintDiscard, v.players, {seat:v.me,earthlyWaits:v.earthlyWaits})
        : [],
    [mine, v?.rules, v?.phase, v?.players, v?.me, v?.earthlyWaits, hintDiscard],
  );
  if (
    (!state.authChecked ||
      !state.account ||
      state.account.mustChangePassword) &&
    state.mode !== "local"
  )
    return <AuthScreen state={state} />;
  return (
    <div
      className={`app classic polished ${v ? "in-room" : ""}`}
      data-page={gameActive ? "table" : v ? "waiting" : page}
      onClickCapture={(event) => {
        const target = event.target as Element;
        if (
          target.closest("button:not(.tile)") &&
          !target.closest(".audio-settings")
        )
          gameAudio.play("click");
      }}
    >
      <div className="orientation-guide" role="status">
        <RotateCw size={42} />
        <h2>横屏，开始这一局</h2>
        <p>请将手机横过来，完整牌桌就在眼前。</p>
      </div>
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            if (v) setModal("leave");
            else if (page === "home") client.browseTables(name);
            else setPage("home");
          }}
          aria-label="金陵麻将首页"
        >
          <img className="brand-emblem" src={`${import.meta.env.BASE_URL}brand-icon.png`} alt="" />
          <span>
            金陵麻将<small>JINLING MAHJONG</small>
          </span>
        </button>
        {!v && page === "profile" && <h1 className="profile-header-title">我的</h1>}
        <div className="header-right">
          <span className="header-note">{name}</span>
          <button
            className="icon-button"
            onClick={() => setModal("settings")}
            aria-label="设置"
          >
            <Settings size={21} />
          </button>
          <Avatar player={{ name, bot: false, avatar: state.account?.avatar }} />
        </div>
      </header>
      {state.notice && (
        <div className="connection-banner" role="status">
          <WifiOff size={16} />
          <span><strong>{networkLabel(state.network)}</strong> · {state.notice}</span>
          {v && state.network.phase !== "blocked" && <button onClick={client.retryNetwork} disabled={["connecting","authenticating","syncing"].includes(state.network.phase)}>重试</button>}
          {!v && <button onClick={() => client.leave()}>返回大厅</button>}
        </div>
      )}
      {state.error && (
        <div className="error-banner" role="alert">
          <CircleHelp size={17} />
          <span>{state.error}</span>
          <button aria-label="关闭提示" onClick={() => client.clearError()}>
            <X size={18} />
          </button>
        </div>
      )}
      {!v && (
        <main className="lobby">
          {page === "home" && (
            <OnlineHome
              name={name}
              state={state}
              openTables={() => setPage("tables")}
              joinByCode={() => setModal("join")}
              rules={() => setPage("rules")}
            />
          )}
          {page === "tables" && (
            <TableLobby
              name={name}
              state={state}
              joinByCode={() => setModal("join")}
            />
          )}
          {page === "rules" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">先讲规矩，再摸好牌</span>
                <h1>本桌怎么玩</h1>
                <p>南京麻将存在不同计分口径，以下是本版明确采用的玩法。</p>
              </div>
              <RulesContent />
            </>
          )}
          {page === "history" && (
            <DeferredFeature label="战绩" close={() => setPage("home")}><RecordsPanel
              key={state.account?.id ?? "practice"}
              account={state.account}
              onBack={() => setPage("home")}
            /></DeferredFeature>
          )}
          {page === "profile" && <ProfilePage
            account={state.account} name={name} audio={audioPreferences} changeAudio={changeAudio}
            notice={setToast} legal={() => setModal("legal")} rules={() => setPage("rules")}
            club={() => setModal("club")} permissions={() => setModal("permissions")}
            password={() => {
              client.clearAuthError(); setCurrentPassword(""); setNewPassword("");
              setConfirmPassword(""); setPasswordError(""); setModal("password");
            }}
          />}
          <footer
            className="lobby-footer"
            hidden={page === "home" || page === "tables"}
          >
            <span>金陵有好牌，相聚正当时。</span>
            <span>理性娱乐 · 适度游戏</span>
          </footer>
        </main>
      )}
      {v?.phase === "waiting" && (
        <main className="waiting-room">
          <button className="back-link" onClick={() => client.leave()}>
            <ArrowLeft size={17} />
            返回大厅
          </button>
          <div className="page-heading">
            <span className="eyebrow">
              {v.table ? "真人同桌 · 四人准备开局" : "邀请好友 · 准备开局"}
            </span>
            <h1>{v.table?.settings.name ?? "好友牌桌"}</h1>
            <p>
              {v.rules.rounds} 局 ·{" "}
              {v.rules.turnSeconds
                ? `每步 ${v.rules.turnSeconds} 秒`
                : "不限时 · 无托管"}{" "}
              ·{" "}
              {v.table?.settings.readyMode === "auto"
                ? "满四人自动开局"
                : "全员准备后开局"}
            </p>
          </div>
          <button className="room-code" onClick={copyCode}>
            <span>房间号</span>
            <strong>{v.code}</strong>
            <Copy size={22} />
          </button>
          <div className="waiting-seats">
            {v.players.map((p, i) => (
              <div
                className="waiting-seat"
                data-state={
                  !p
                    ? "empty"
                    : !p.online && !p.bot
                      ? "offline"
                      : p.ready
                        ? "ready"
                        : "waiting"
                }
                data-ready-clock={
                  !!v.table?.readyDeadline &&
                  !!p &&
                  !p.ready &&
                  p.online &&
                  state.connected
                }
                key={i}
              >
                <Avatar player={p} seat={i} big />
                <h3>
                  {p?.name ?? "虚位以待"}
                  {i === v.me && <small>我</small>}
                  {p && p.id === v.ownerId && <small>房主</small>}
                </h3>
                <span
                  role={
                    v.table?.readyDeadline &&
                    p &&
                    !p.ready &&
                    p.online &&
                    state.connected
                      ? "timer"
                      : undefined
                  }
                  aria-label={
                    v.table?.readyDeadline &&
                    p &&
                    !p.ready &&
                    p.online &&
                    state.connected
                      ? `${p.name}准备剩余 ${Math.max(0, Math.ceil((v.table.readyDeadline - now) / 1000))} 秒`
                      : undefined
                  }
                >
                  {p ? (
                    !p.online && !p.bot ? (
                      "离线，等待重连"
                    ) : p.ready ? (
                      <>
                        <Check size={15} />
                        已准备
                      </>
                    ) : state.connected && v.table?.readyDeadline ? (
                      `${Math.max(0, Math.ceil((v.table.readyDeadline - now) / 1000))} 秒内准备`
                    ) : (
                      "等待准备"
                    )
                  ) : (
                    "邀请一位朋友"
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="waiting-footer">
            <p className="waiting-status" role="status">
              {v.admissionMessage && <span>{v.admissionMessage} · </span>}
              {!state.connected
                ? "正在重新连接，等待同步准备状态…"
                : v.players.some((p) => !p)
                  ? `已入座 ${v.players.filter(Boolean).length} / 4 · ${v.table ? "邀请真人牌友入座" : "邀请好友或添加电脑"}，${v.table?.settings.readyMode === "auto" ? "满四人自动开局" : "全员准备后开局"}`
                  : v.players.some((p) => p && !p.online && !p.bot)
                    ? "有牌友离线，回桌后即可继续准备开局"
                    : waitingFor
                      ? `等待 ${waitingFor} 准备${v.table?.readyDeadline ? ` · ${Math.max(0, Math.ceil((v.table.readyDeadline - now) / 1000))} 秒后未准备者离座` : ""}`
                      : "全员准备，正在发牌…"}
            </p>
            <div className="waiting-actions">
              <button
                className="primary"
                onClick={() => client.ready()}
                disabled={mine?.ready || commandsDisabled}
              >
                {state.submitting === "ready"
                  ? "正在准备…"
                  : mine?.ready
                    ? v.players.some((p) => !p)
                      ? `已准备，还差 ${v.players.filter((p) => !p).length} 位`
                      : "已准备，等待牌友"
                    : "我准备好了"}
                <Check size={18} />
              </button>
              {!v.table &&
                v.ownerId === mine?.id &&
                v.players.some((p) => !p) && (
                  <button
                    className="secondary"
                    onClick={() => client.send({ type: "addBot" })}
                    disabled={commandsDisabled}
                  >
                    <Plus size={18} />
                    {state.submitting === "addBot"
                      ? "正在入座…"
                      : "添加电脑陪练"}
                  </button>
                )}
              <button className="text-button" onClick={() => setModal("rules")}>
                <BookOpen size={17} />
                本桌规则
              </button>
            </div>
          </div>
        </main>
      )}
      {gameActive && v && mine && (
        <CocosTable
          opening={opening}
          onEntryBusyChange={setTableEntryBusy}
          readyDiscards={readyDiscards}
          winResult={showingWinEffect ? v.result : undefined}
          scoreDebits={debitEvents}
          connectionQuality={state.mode === "online" && state.connected && (state.network.consecutiveTimeouts > 0 || (state.network.smoothedRttMs ?? 0) >= 600) ? networkLabel(state.network) : undefined}
          state={cocosState(v, {
            connected: state.connected, disabled: commandsDisabled || paused,
            practice: state.mode === "local", countdown: !state.connected || paused || !timed ? "—" : waitingOthersOvertime ? "…" : String(countdown).padStart(2, "0"),
            selected, drawn: drawnTile, inspectedKind, hintKinds, hintDiscard,
            hintLabel: hintDiscard !== undefined ? `打${tileName(hintDiscard)}后可胡` : "已听牌 · 可胡",
            effects: motion,
          })}
          onCommand={(command) => {
            gameAudio.unlock();
            if (command.type === "menu") {
              if (command.menu === "result") setDismissedResult("");
              else if (["leave", "settings", "events", "table"].includes(command.menu)) {
                if (command.menu === "table") setTableSeat(v.me);
                setModal(command.menu);
              }
              return;
            }
            if (commandsDisabled || paused) return;
            if (command.type === "select" && ["playing", "claiming"].includes(v.phase) && !mine.trustee && mine.hand.includes(command.tile)) selectTile(command.tile);
            if (command.type === "discard") discardTile(command.tile);
            if (command.type === "trustee" && (mine.trustee || v.table?.settings.trusteeMode !== "disabled")) client.trustee(command.enabled);
            if (command.type === "action") {
              if (command.action === "zhaozhi" && v.canZhaozhi) client.action({ type: "zhaozhi" });
              else if (command.action === "selfKong" && command.tile !== undefined && v.selfKongs.includes(command.tile)) client.action({ type: "selfKong", tile: command.tile });
              else if (command.action === "pass" && v.actions.includes("pass")) client.action({ type: "pass" });
              else if (command.action === "pung" && v.actions.includes("pung")) client.action({ type: "pung" });
              else if (command.action === "kong" && v.actions.includes("kong")) client.action({ type: "kong" });
              else if (command.action === "hu" && v.actions.includes("hu")) client.action({ type: "hu" });
            }
          }}
        >
          {state.mode === "online" && <RoomVoice key={v.id} client={client} game={v.id} connected={state.connected} enabled={audioPreferences.chat !== false} volume={audioPreferences.voiceVolume} me={mine.id} messages={state.voiceMessages} />}
        </CocosTable>
      )}
      <AudioRecovery />
      {!v && (
        <nav className="bottom-nav" aria-label="主导航">
          {(
            [
              { id: "home", title: "牌桌", icon: Home },
              { id: "tables", title: "约局", icon: LayoutGrid },
              { id: "history", title: "战绩", icon: History },
              { id: "rules", title: "玩法", icon: BookOpen },
              { id: "profile", title: "我的", icon: Users },
            ] as const
          ).map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                if (page === id && (id === "home" || id === "tables"))
                  client.browseTables(name);
                setPage(id);
              }}
            >
              <Icon size={21} />
              <span>{title}</span>
            </button>
          ))}
        </nav>
      )}
      {modal === "club" && admin && state.account && (
        <DeferredFeature label="管理员页面" modal close={() => setModal(null)}><ClubManagement account={state.account} close={() => setModal(null)} /></DeferredFeature>
      )}
      {modal === "permissions" && admin && (
        <DeferredFeature label="开桌权限" modal close={() => setModal(null)}><TablePermissions close={() => setModal(null)} /></DeferredFeature>
      )}
      {((modal === "create" && canOpen) || modal === "join") && (
        <Dialog
          variant="room-dialog"
          title={modal === "create" ? "创建好友房间" : "加入好友房间"}
          close={() => setModal(null)}
          footer={
            <div className="room-form-footer">
              <span>
                <ShieldCheck size={16} />
                {modal === "create"
                  ? "四位玩家准备后自动开局"
                  : "同一房间号，一起上桌"}
              </span>
              <button className="primary" onClick={() => beginOnline(modal)}>
                {modal === "create" ? "创建房间" : "加入房间"}
                <ArrowRight size={18} />
              </button>
            </div>
          }
        >
          <p className="modal-intro">
            {modal === "create"
              ? "选好规则，分享房间号即可邀请好友。"
              : "输入朋友分享的六位房间号。"}
          </p>
          <div
            className={`room-form-grid ${modal === "join" ? "joining" : ""}`}
          >
            <label className="form-label">
              牌桌昵称
              <input
                value={name}
                maxLength={12}
                onChange={(e) => setName(e.target.value)}
                placeholder="让朋友认出你"
                aria-invalid={roomError?.field === "name"}
                aria-describedby={
                  roomError?.field === "name" ? "room-form-error" : undefined
                }
              />
            </label>
            {modal === "create" ? (
              <>
                <div>
                  <label className="form-label">打几局？</label>
                  <div className="choice-row">
                    {[4, 8, 16].map((n) => (
                      <button
                        className={rounds === n ? "selected" : ""}
                        aria-pressed={rounds === n}
                        key={n}
                        onClick={() => setRounds(n)}
                      >
                        {n} 局
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">每步思考时间</label>
                  <div className="choice-row">
                    {[15, 30, 60].map((n) => (
                      <button
                        className={seconds === n ? "selected" : ""}
                        aria-pressed={seconds === n}
                        key={n}
                        onClick={() => setSeconds(n)}
                      >
                        {n} 秒
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <label className="form-label">
                房间号
                <input
                  className="code-input"
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") beginOnline("join");
                  }}
                  placeholder="000000"
                  aria-invalid={roomError?.field === "code"}
                  aria-describedby={
                    roomError?.field === "code" ? "room-form-error" : undefined
                  }
                />
              </label>
            )}
          </div>
          {roomError && (
            <p
              ref={roomErrorRef}
              className="room-form-error"
              id="room-form-error"
              role="alert"
            >
              <CircleHelp size={16} />
              {roomError.message}
            </p>
          )}
        </Dialog>
      )}
      {modal === "events" && v && (
        <Dialog title="牌局记录" close={() => setModal(null)}>
          <ol className="event-log">
            {v.events.map((event, i) => (
              <li key={i}>{event}</li>
            ))}
          </ol>
        </Dialog>
      )}
      {modal === "legal" && (
        <Dialog title="用户协议与隐私说明" close={() => setModal(null)}>
          <div className="legal-viewer">
            <LegalContent />
          </div>
        </Dialog>
      )}
      {modal === "rules" && (
        <Dialog title="本桌规则" close={() => setModal(null)}>
          {v?.table && <TableSettingsSummary table={v.table} rules={v.rules} />}
          <RulesContent view={v} />
        </Dialog>
      )}
      {modal === "password" && (
        <Dialog
          title="修改密码"
          close={() => setModal(null)}
          variant="password-dialog"
        >
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (newPassword !== confirmPassword) {
                setPasswordError("两次新密码不一致");
                return;
              }
              setPasswordError("");
              if (await client.changePassword(currentPassword, newPassword)) {
                setModal(null);
                setToast("密码已更新");
              }
            }}
          >
            <label>
              原密码
              <input
                type="password"
                autoComplete="current-password"
                placeholder="请输入原密码"
                enterKeyHint="next"
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={128}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label>
              新密码
              <input
                type="password"
                autoComplete="new-password"
                placeholder="请输入新密码"
                enterKeyHint="next"
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={128}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                autoComplete="new-password"
                placeholder="再次输入新密码"
                enterKeyHint="done"
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            {(passwordError || state.authError) && (
              <p className="account-error" role="alert">
                {passwordError || state.authError}
              </p>
            )}
            <button className="primary" type="submit" disabled={state.authBusy}>
              {state.authBusy ? "正在保存…" : "保存新密码"}
            </button>
          </form>
        </Dialog>
      )}
      {modal === "settings" && (
        <Dialog
          title="牌桌设置"
          variant="settings-dialog"
          close={() => setModal(null)}
        >
          <button className="setting-row" onClick={() => setModal("rules")}>
            <span>
              <BookOpen size={20} /> 本桌规则
            </span>
            <ChevronRight size={18} />
          </button>
          <AudioSettings value={audioPreferences} change={changeAudio} />
          <AudioRecovery diagnostics />
          <NetworkDiagnostics health={state.network} online={state.mode==="online"} retry={client.retryNetwork}/>
          <p className="muted">设置会保存在当前设备。</p>
        </Dialog>
      )}
      {modal === "leave" && (
        <Dialog
          title={state.mode === "local" ? "先歇一会儿？" : "离开这张牌桌？"}
          close={() => setModal(null)}
        >
          <p className="modal-intro">
            {state.mode === "local"
              ? "练习进度会保存，回到大厅可以继续。"
              : v && ["waiting", "finished"].includes(v.phase)
                ? "你可以返回大厅，重新约一桌。"
                : v?.table
                  ? `本桌正在进行中。仅管理员可以解散牌桌。${v.table.settings.trusteeMode !== "disabled" ? "也可以开启托管。" : "请继续完成对局。"}`
                  : "进行中的牌桌仅管理员可以解散。你可以开启托管，让牌局继续。"}
          </p>
          <div className="dialog-actions">
            {state.mode === "local" ||
            (v && ["waiting", "finished"].includes(v.phase)) ? (
              <button
                className="primary"
                onClick={() => {
                  setModal(null);
                  client.leave();
                }}
              >
                返回大厅
              </button>
            ) : (
              <>
                {v?.table?.settings.trusteeMode !== "disabled" && (
                  <button
                    className="secondary"
                    disabled={commandsDisabled}
                    onClick={() => {
                      client.trustee(true);
                      setModal(null);
                    }}
                  >
                    开启托管
                  </button>
                )}
                {state.account?.role === "admin" && (
                  <button
                    className="primary"
                    disabled={commandsDisabled}
                    onClick={() => {
                      client.dissolve(true);
                      setModal(null);
                    }}
                  >
                    管理员解散
                  </button>
                )}
                {v?.table &&
                  !v.table.settings.allowDissolve &&
                  v.table.settings.trusteeMode === "disabled" && (
                    <button className="primary" onClick={() => setModal(null)}>
                      继续打牌
                    </button>
                  )}
              </>
            )}
          </div>
        </Dialog>
      )}
      {v?.dissolve && (
        <Dialog title="牌友申请解散" close={() => client.dissolve(false)}>
          <p className="modal-intro">
            {v.players[v.dissolve.proposer]?.name}{" "}
            希望结束这桌。需要四位玩家同意，超时则取消申请。
          </p>
          <p>
            {v.dissolve.yes.length} / 4 已同意 · 剩余{" "}
            {Math.max(0, Math.ceil((v.dissolve.expires - now) / 1000))} 秒
          </p>
          <div className="dialog-actions">
            <button
              className="secondary"
              onClick={() => client.dissolve(false)}
            >
              继续打牌
            </button>
            <button
              className="primary"
              disabled={v.dissolve.yes.includes(v.me)}
              onClick={() => client.dissolve(true)}
            >
              {v.dissolve.yes.includes(v.me) ? "等待其他牌友" : "同意解散"}
            </button>
          </div>
        </Dialog>
      )}
      {v?.result && !showingWinEffect && !debitEvents.length && dismissedResult !== resultKey && (
        <Dialog
          title={
            v.result.reason === "dissolved"
              ? "牌桌已解散"
              : v.phase === "finished"
                ? "本桌最终战绩"
                : "本局牌面"
          }
          variant="round-reveal-dialog"
          headerAside={<>
            {v.result.reason === "hu" && <strong className="result-call-label">{resultDisplayLabel(v.result)}</strong>}
            <button className="result-details-button" aria-pressed={scoreDetailsKey === resultKey} onClick={() => setScoreDetailsKey(scoreDetailsKey === resultKey ? "" : resultKey)}>
              {scoreDetailsKey === resultKey ? "查看牌面" : "计分详情"}
            </button>
          </>}
          close={() => {
            setDismissedResult(resultKey);
            setFinishedSnapshot(null);
          }}
          footer={
            !continuousRounds ? (
              <div className="result-footer">
                <div className="result-next-info">
                  <span>
                    第 {v.round} / {v.rules.rounds} 局
                    {v.phase === "finished"
                      ? v.table?.settings.autoRenew
                        ? ` · ${resultSecondsLeft} 秒后换新桌号开空桌`
                        : " · 本桌结束"
                      : resultSecondsLeft > 0
                        ? ` · 结算展示 ${resultSecondsLeft} 秒`
                        : " · 等待牌友继续"}
                  </span>
                  {v.admissionMessage ? (
                    <p role="status">{v.admissionMessage}</p>
                  ) : (
                    nextRound && <p role="status">{nextRound.message}</p>
                  )}
                </div>
                {v.phase === "finished" ? (
                  <button
                    className="primary"
                    disabled={commandsDisabled}
                    onClick={() => client.leave()}
                  >
                    {!state.connected
                      ? "等待重新连接"
                      : state.submitting === "leave"
                        ? "正在返回…"
                        : "返回大厅"}
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={
                      mine?.ready ||
                      commandsDisabled ||
                      !!autoNext ||
                      !!v.admissionMessage
                    }
                    onClick={() => {
                      client.ready();
                      setDismissedResult("");
                    }}
                  >
                    {!state.connected
                      ? "等待重新连接"
                      : state.submitting === "ready"
                        ? "正在准备…"
                        : autoNext
                          ? resultSecondsLeft > 0
                            ? `${resultSecondsLeft} 秒后自动准备`
                            : "等待牌友就绪"
                          : mine?.ready
                            ? "等待其他牌友准备"
                            : mine?.awaitingReady
                              ? "托管已暂停 · 继续"
                              : "再来一局"}
                    <ArrowRight size={18} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="reveal-next" role="status">
                  {!state.connected ? (
                    "连接中断，正在同步牌桌…"
                  ) : v.phase === "finished" ? (
                    "本桌已结束，战绩已保存"
                  ) : v.admissionMessage ? (
                    v.admissionMessage
                  ) : resultSecondsLeft > 0 ? (
                    <>
                      <b>{resultSecondsLeft}</b> 秒后进入下一局 ·{" "}
                      {v.players.filter((p) => p?.ready || p?.bot).length}/4
                      已确认
                    </>
                  ) : v.players.some((p) => p && !p.bot && !p.online) ? (
                    "等待离线牌友回桌后发牌"
                  ) : (
                    "正在发下一把…"
                  )}
                </div>
                <button
                  className="primary"
                  disabled={
                    commandsDisabled ||
                    (v.phase !== "finished" &&
                      (!!mine?.ready || !!v.admissionMessage))
                  }
                  onClick={() => {
                    if (v.phase === "finished") {
                      setFinishedSnapshot(null);
                      client.leave();
                    } else client.ready();
                  }}
                >
                  {v.phase === "finished"
                    ? "返回大厅"
                    : mine?.ready
                      ? "已确认，等待开局"
                      : "进入下一局"}
                </button>
              </>
            )
          }
        >
          {scoreDetailsKey === resultKey ? <div className="live-score-details">
            <p className="live-score-note">{v.phase === "finished" ? "本桌已结束，仍可在战绩中查看各把明细。" : "下一把开始后返回牌桌，仍可在战绩中查看本把明细。"}</p>
            <ScoreDetails record={v.history.slice(-1)[0]!} me={v.me} />
          </div> : <RoundReveal
            view={v}
            readiness={!continuousRounds ? nextRound?.seats : undefined}
            record={{
              ...v.history.slice(-1)[0]!,
              matchFinished: v.phase === "finished",
              at:
                v.phase === "finished"
                  ? (v.table?.finishedAt ?? v.history.slice(-1)[0]!.at)
                  : v.history.slice(-1)[0]!.at,
            }}
          />}
        </Dialog>
      )}
      {!v && finishedSnapshot?.result && (
        <Dialog
          title="本桌最终战绩"
          variant="round-reveal-dialog"
          close={() => setFinishedSnapshot(null)}
          footer={
            <>
              <span className="reveal-next">本桌已结束，战绩已保存</span>
              <button
                className="primary"
                onClick={() => {
                  setFinishedSnapshot(null);
                  setPage("tables");
                }}
              >
                返回大厅
              </button>
            </>
          }
        >
          <RoundReveal
            view={finishedSnapshot}
            record={{
              ...finishedSnapshot.history.slice(-1)[0]!,
              matchFinished: true,
              at:
                finishedSnapshot.table?.finishedAt ??
                finishedSnapshot.history.slice(-1)[0]!.at,
            }}
          />
        </Dialog>
      )}
      {modal === "table" && v && (
        <Dialog
          title="公开牌一览"
          close={() => setModal(null)}
          variant="table-overview-dialog"
        >
          <nav className="overview-seats" aria-label="选择牌友">
            {v.players.map(
              (p, seat) =>
                p && (
                  <button
                    key={seat}
                    aria-pressed={tableSeat === seat}
                    onClick={() => setTableSeat(seat as Seat)}
                  >
                    <span>{seatNames[seat]}</span> {p.name}
                  </button>
                ),
            )}
          </nav>
          <div className="table-overview">
            {v.players.map(
              (p, seat) =>
                p &&
                seat === tableSeat && (
                  <section key={seat} aria-label={`${p.name}的公开牌`}>
                    <h3>
                      <span>{seatNames[seat]}</span>
                      {p.name}
                      <small>
                        {seat === v.me ? "我" : ""} · 弃牌 {p.discards.length}
                      </small>
                    </h3>
                    <div className="overview-discards">
                      {p.discards.length ? (
                        p.discards.map((t) => <Tile key={t} tile={t} small />)
                      ) : (
                        <p className="muted">尚未出牌</p>
                      )}
                    </div>
                    {p.melds.length > 0 && (
                      <div className="overview-melds">
                        {p.melds.map((m, i) => (
                          <div key={i}>
                            <span>
                              {meldDisplayTiles(m).map((t, n) => t === undefined
                                ? <TileBack key={n} />
                                : <Tile key={n} tile={t} small />)}
                            </span>
                            <small>
                              {m.concealed
                                ? "暗杠"
                                : `${seatNames[m.from]}家${m.type === "kong" ? "杠" : "碰"}`}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                    {p.flowers.length > 0 && (
                      <div className="overview-flowers">
                        <Flower2 size={13} />
                        <span>
                          {p.flowers.map((t) => (
                            <Tile key={t} tile={t} small />
                          ))}
                        </span>
                      </div>
                    )}
                  </section>
                ),
            )}
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
function TurnCountdown({
  name,
  seconds,
  total,
  paused,
  action = "出牌",
}: {
  action?: "出牌" | "响应" | "累计超时" | "超时";
  name: string;
  seconds: number;
  total: number;
  paused: boolean;
}) {
  if (total <= 0) return null;
  return (
    <span
      className={`turn-countdown ${seconds <= 5 ? "urgent" : ""}`}
      role="timer"
      aria-label={`${name}${action}剩余${seconds}秒`}
    >
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="timer-track" cx="20" cy="20" r="17" />
        <circle
          className="timer-progress"
          cx="20"
          cy="20"
          r="17"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 * (1 - seconds / total)}
        />
      </svg>
      <b>{paused ? "Ⅱ" : seconds}</b>
    </span>
  );
}

function FlowerRack({
  flowers,
  name,
  compact = false,
}: {
  flowers: PublicPlayer["flowers"];
  name: string;
  compact?: boolean;
}) {
  if (!flowers.length) return null;
  return (
    <div
      className="flower-rack"
      role="group"
      aria-label={`${name}花牌，共${flowers.length}张`}
      style={{ "--flower-count": flowers.length } as CSSProperties}
    >
      <span className="flower-rack-label" aria-hidden="true">
        {compact ? `花${flowers.length}` : `花牌（${flowers.length}）`}
      </span>
      <div className="flower-rack-tiles">
        {flowers.map((t) => (
          <Tile tile={t} small key={t} />
        ))}
      </div>
    </div>
  );
}

function Opponent({
  player: p,
  seat,
  me,
  names,
  position,
  active,
  dealer,
  countdown,
  overtime,
  totalSeconds,
  paused,
}: {
  player: PublicPlayer;
  seat: Seat;
  me: Seat;
  names: string[];
  position: string;
  active: boolean;
  dealer: boolean;
  countdown: number;
  overtime: boolean;
  totalSeconds: number;
  paused: boolean;
}) {
  return (
    <div
      className={`opponent opponent-${position} ${active ? "active" : ""} ${p.melds.length ? "has-melds" : ""}`}
      style={
        {
          "--opponent-hand-count": p.hand.length || p.handCount,
          "--concealed-rows": Math.max(1, Math.ceil(p.handCount / 2)),
          "--meld-count": p.melds.length,
          "--side-flower-rows": Math.ceil(p.flowers.length / 4),
        } as CSSProperties
      }
    >
      <div className="opponent-info">
        <span className="player-portrait">
          <Avatar player={p} seat={seat} />
          {active && (
            <TurnCountdown
              name={p.name}
              action={
                overtime ? "累计超时" : "出牌"
              }
              seconds={countdown}
              total={totalSeconds}
              paused={paused}
            />
          )}
        </span>
        <div>
          <strong>{p.name}</strong>
          <span className="opponent-meta">
            {seatNames[seat]}
            {dealer ? " · 庄" : ""} · {p.score}
            {position === "top" && p.flowers.length
              ? ` · 花${p.flowers.length}`
              : ""}
          </span>
        </div>
        {(!p.online || p.trustee) && (
          <small>{p.bot ? "电脑" : !p.online ? "离线" : "托管"}</small>
        )}
        {active && (
          <span
            className="opponent-turn-status"
            role="status"
            aria-label={`${p.name}${paused ? "已暂停" : overtime ? "累计超时中" : p.trustee ? "托管出牌中" : "正在思考"}`}
          >
            {paused
              ? "已暂停"
              : overtime
                ? "累计超时"
                : p.trustee
                  ? "托管出牌"
                  : "正在思考…"}
          </span>
        )}
      </div>
      <TableSeatTiles player={p} seat={seat} me={me} names={names} position={position} />
    </div>
  );
}
