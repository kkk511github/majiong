import {
  initialNetworkHealth,
  timedOut,
  measuredResponse,
  resetNetworkMeasurements,
  reconnectDelay,
  type NetworkHealth,
} from "./network-health";
import { voiceDuration, type RoomVoiceMessage } from "../shared/room-voice";
import { isRoomPhraseId, isRoomPhraseMessage, ROOM_PHRASE_TTL_MS, ROOM_PHRASE_HISTORY_LIMIT,
  type RoomPhraseId, type RoomPhraseMessage } from "../shared/room-phrases";
import { newGameRules } from "../shared/nanjing-rules";
import { ServerClock } from "./server-clock";
import { CONNECTION_POLICY } from "./connection-policy";
import type { OpeningCue } from "./TableOpening";
import type { OnlineInvitePeer, TableInvitation } from '../shared/table-invitations';
import { decisionDeadline, setTrustee } from "../shared/timing";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from '@capacitor/app';
import { version as webVersion } from '../package.json';
import {androidDiagnostics} from './android-diagnostics';
import type {DiagnosticEventMeta,DiagnosticEventCode} from '../shared/client-diagnostics';
import { isAvatarPath } from "../shared/account-profile";
import {
  act,
  botAction,
  trusteeAction,
  createGame,
  dissolveGame,
  newPlayer,
  seats,
  startRound,
  viewFor,
} from "../shared/engine";
import type {
  Account,
  MatchDetails,
  RecordsPage,
  RoundReplay,
  StoredRound,
  Action,
  ClientMessage,
  Game,
  Rules,
  ServerMessage,
  View,
  TableSummary,
  TableSettings,
} from "../shared/types";

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      return (
        JSON.parse(localStorage.getItem("jinling:" + key) ?? "null") ?? fallback
      );
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem("jinling:" + key, JSON.stringify(value));
    } catch {
      /* Gameplay remains available if storage is full. */
    }
  },
};
export interface ClientState {
  updateRequired?: { minimumVersion?: string; message: string };
  network: NetworkHealth;
  account: Account | null;
  authChecked: boolean;
  authBusy: boolean;
  authError: string;
  view: View | null;
  openingCue: OpeningCue | null;
  connected: boolean;
  connecting: boolean;
  mode: "local" | "online" | null;
  error: string;
  notice: string;
  submitting: ClientMessage["type"] | null;
  tables: TableSummary[];
  tablesLoading: boolean;
  tableLobby: boolean;
  createdTables: string[];
  lobbyNotice: string;
  voiceMessages: RoomVoiceMessage[];
  phraseMessages: RoomPhraseMessage[];
  phrasesAvailable: boolean;
  tableInvitesAvailable: boolean;
  tableInvitations: TableInvitation[];
  announcementVersion?: number;
  recordsReturn?: number;
}
const base = import.meta.env.VITE_GAME_SERVER_URL as string | undefined;
export const avatarURL = (path?: string) =>
  isAvatarPath(path) ? (base?.replace(/\/$/, "") ?? "") + path : undefined;
export const onlineAvailable = !Capacitor.isNativePlatform() || !!base;
export class GameClient {
  state: ClientState = {
    network: initialNetworkHealth(),
    account: null,
    authChecked: false,
    authBusy: false,
    authError: "",
    view: null,
    openingCue: null,
    connected: false,
    connecting: false,
    mode: null,
    error: "",
    notice: "",
    submitting: null,
    tables: [],
    tablesLoading: false,
    tableLobby: false,
    createdTables: [],
    lobbyNotice: "",
    voiceMessages: [],
    phraseMessages: [],
    phrasesAvailable: false,
    tableInvitesAvailable: false,
    tableInvitations: [],
    announcementVersion: 0,
  };
  private local?: Game;
  private authStarted = false;
  private authEpoch = 0;
  private profileSequence = 0;
  private passwordChange?: { current: () => boolean; revoked: boolean };
  private authSession() {
    const epoch = this.authEpoch, token = storage.get<string>("token", ""), id = this.state.account?.id;
    return () => epoch === this.authEpoch && token === storage.get<string>("token", "") && id === this.state.account?.id;
  }
  private socket?: WebSocket;
  private snapshotSocket?: WebSocket;
  private listeners = new Set<() => void>();
  private tick?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private pending?: ClientMessage;
  private name = "";
  private attempt = 0;
  private localPaused = false;
  private pausedAt?: number;
  private commandAck = false;
  private phraseSequence = 0;
  private phraseExpiry?: ReturnType<typeof setTimeout>;
  private phraseRequest?: { id: string; game: string; timer: ReturnType<typeof setTimeout>; resolve: () => void; reject: (error: Error) => void };
  private commandId?: string;
  private commandTimer?: ReturnType<typeof setTimeout>;
  private commandStartedAt = 0;
  private lobbyWanted = false;
  private clock = new ServerClock();
  private clockTimer?: ReturnType<typeof setInterval>;
  private timeSync = false;
  private clockPing?: number;
  private pendingPings = new Set<number>();
  private missedPongs = 0;
  private probeStartedAt?: number;
  private resumeStartedAt?: number;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private tablesTimer?: ReturnType<typeof setTimeout>;
  private networkVisible = true;
  private resumePending = false;
  private awaitingRoom?: string;
  private resumeViewSeen = false;
  private recoveryStartedAt?: number;
  private heartbeatAt = 0;
  private openedAt = 0;
  private diagnosticConnection = '';
  private receivedAt = 0;
  private diagnosticHeartbeatAt = 0;
  private diagnosticSnapshotAt = 0;
  private diagnosticCommand = '';
  private traceNetwork(message:string,extra:DiagnosticEventMeta={},code:DiagnosticEventCode='network') {
    androidDiagnostics.record(code,message,{
      connectionId:this.diagnosticConnection,phase:this.state.network.phase,
      online:navigator.onLine!==false,visible:this.networkVisible,
      socketState:this.socket?.readyState,bufferedBytes:this.socket?.bufferedAmount,
      lastReceivedAgoMs:this.receivedAt?performance.now()-this.receivedAt:undefined,
      revision:this.state.view?.revision,requestId:this.commandId,
      ...extra,
    });
  }
  private lastResumeAt = -Infinity;
  private openingCompletion?: {
    game: string;
    round: number;
  };
  private inviteSequence = 0;
  private inviteRequests = new Map<string, { resolve: (peers: OnlineInvitePeer[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private invitationRequest(message: Extract<ClientMessage, { type: 'invitePeers' | 'invitePlayer' | 'respondInvite' }>) {
    if (!this.state.connected || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('正在重连，请稍后再试'));
    if (!this.state.tableInvitesAvailable) return Promise.reject(new Error('在线邀请服务暂不可用，可先复制房号'));
    const requestId = `invite-${Date.now()}-${++this.inviteSequence}`;
    return new Promise<OnlineInvitePeer[]>((resolve, reject) => {
      const timer = setTimeout(() => this.finishInvitation(requestId, new Error('邀请回复超时，请刷新状态后重试')), 8000);
      this.inviteRequests.set(requestId, { resolve, reject, timer });
      try { this.socket!.send(JSON.stringify({ ...message, requestId })); }
      catch { this.finishInvitation(requestId, new Error('邀请未发送，请检查连接')); }
    });
  }
  private finishInvitation(id: string, error?: Error, peers: OnlineInvitePeer[] = []) {
    const pending = this.inviteRequests.get(id);
    if (!pending) return;
    clearTimeout(pending.timer); this.inviteRequests.delete(id);
    if (error) pending.reject(error); else pending.resolve(peers);
  }
  onlineInvitePeers = (game: string) => this.invitationRequest({ type: 'invitePeers', game });
  invitePlayer = (game: string, memberId: string) => this.invitationRequest({ type: 'invitePlayer', game, memberId });
  respondInvite = (invitation: string, accept: boolean) => this.invitationRequest({ type: 'respondInvite', invitation, accept });
  now = () => (this.state.mode === "online" ? this.clock.now() : Date.now());
  syncTime = (fresh = false) => {
    if (
      !this.timeSync ||
      (!this.state.connected && !this.resumePending && !this.awaitingRoom) ||
      this.socket?.readyState !== WebSocket.OPEN
    )
      return;
    if (fresh) {
      this.clock.resample();
      // A response requested before sleep may carry an old timestamp. Start a new exchange now.
      this.clockPing = undefined;
      this.pendingPings.clear();
      clearTimeout(this.pongTimer);
      this.missedPongs = 0;
      this.probeStartedAt = undefined;
    }
    if (!this.networkVisible) return;
    const now = performance.now();
    if (this.clockPing !== undefined) return;
    clearTimeout(this.pongTimer);
    this.clockPing = now;
    this.pendingPings.add(now);
    // Retain a few outstanding probes so a genuinely slow, valid response
    // can still recover the connection after its next probe has started.
    while (this.pendingPings.size > 4) this.pendingPings.delete(this.pendingPings.values().next().value!);
    this.heartbeatAt = performance.now();
    this.probeStartedAt ??= this.heartbeatAt;
    const socket = this.socket;
    try {
      this.socket.send(
        JSON.stringify({
          type: "ping",
          sentAt: now,
          ...(this.resumePending ? { sync: true } : {}),
        }),
      );
      if (this.networkVisible)
        this.pongTimer = setTimeout(
          () => {
            if (this.socket !== socket || this.clockPing !== now || !this.networkVisible) return;
            this.clockPing = undefined;
            this.missedPongs++;
            this.traceNetwork('heartbeat-timeout',{
              elapsedMs:performance.now()-this.heartbeatAt, attempt:this.missedPongs,
              reason:this.resumePending?'resume-probe':'heartbeat-probe',
            });
            this.updateNetwork(timedOut(this.state.network));
            const expired = this.resumePending
              ? performance.now() - this.resumeStartedAt! >= CONNECTION_POLICY.resumeDeadlineMs
              : performance.now() - Math.max(this.probeStartedAt!, this.receivedAt) >= CONNECTION_POLICY.heartbeatSilenceMs;
            if (expired) {
              this.restartConnection("正在恢复牌桌连接…", this.resumePending,
                this.resumePending?'resume-sync-timeout':'heartbeat-silence');
            } else {
              // A slow/missing pong alone is not a dead connection. Keep the
              // socket and probe again; authoritative state traffic is liveness.
              this.syncTime();
            }
          },
          this.resumePending ? CONNECTION_POLICY.resumeProbeMs : CONNECTION_POLICY.heartbeatProbeMs,
        );
    } catch {
      this.traceNetwork('send-failed',{operation:'ping'});
      this.restartConnection("连接中断，正在重新连接…", false, 'ping-send-failed');
    }
  };
  private stopClock() {
    clearInterval(this.clockTimer);
    this.clockTimer = undefined;
    this.clockPing = undefined;
    this.pendingPings.clear();
    this.missedPongs = 0;
    this.probeStartedAt = undefined;
    this.resumeStartedAt = undefined;
    this.timeSync = false;
    this.resumePending = false;
    this.awaitingRoom = undefined;
    this.resumeViewSeen = false;
    clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
  }
  private finishTables() {
    clearTimeout(this.tablesTimer);
    this.tablesTimer = undefined;
  }
  private updateNetwork(patch: Partial<NetworkHealth>) {
    if(patch.phase&&patch.phase!==this.state.network.phase)
      this.traceNetwork('phase-change',{phase:patch.phase,reason:this.state.network.phase});
    this.emit({ network: { ...this.state.network, ...patch } });
  }
  private connectionReady() {
    this.updateNetwork({
      phase: "ready",
      ...(this.recoveryStartedAt === undefined
        ? {}
        : { lastRecoveryMs: performance.now() - this.recoveryStartedAt }),
    });
    this.traceNetwork('connection-ready',{elapsedMs:this.recoveryStartedAt===undefined?performance.now()-this.openedAt:performance.now()-this.recoveryStartedAt});
    this.recoveryStartedAt = undefined;
  }
  retryNetwork = () => {
    this.traceNetwork('manual-retry');
    if (this.state.mode === "online" && !this.stopped)
      this.restartConnection("正在重新连接…", true, 'manual-retry');
  };
  private restartConnection(notice: string, immediate = false, reason = 'connection-recovery') {
    if (this.stopped || this.state.mode !== "online") return;
    this.recoveryStartedAt ??= performance.now();
    this.traceNetwork('reconnect-requested',{reason,attempt:this.missedPongs,operation:this.diagnosticCommand,elapsedMs:this.commandId?performance.now()-this.commandStartedAt:undefined});
    androidDiagnostics.disconnect();
    this.updateNetwork({
      phase: navigator.onLine === false ? "offline" : "retrying",
    });
    const previous = this.socket;
    // A half-open socket may never emit close. Retire it before waiting or retrying.
    this.socket = undefined;
    this.stopClock();
    this.finishTables();
    clearTimeout(this.connectTimer);
    clearTimeout(this.retry);
    this.finishCommand();
    previous?.close();
    this.emit({
      connected: false,
      connecting: true,
      tablesLoading: this.lobbyWanted,
      notice,
    });
    // Keep a working socket while hidden, but don't run retry/timeout loops
    // while the OS has suspended the WebView. Foreground resumes immediately.
    if (!this.networkVisible) return;
    const delay = immediate ? 0 : reconnectDelay(this.attempt++);
    this.traceNetwork('retry-scheduled',{attempt:this.attempt,delayMs:delay});
    this.retry = setTimeout(() => this.open(), delay);
  }
  resumeConnection = () => {
    if (
      this.stopped ||
      this.state.mode !== "online" ||
      !this.networkVisible ||
      this.resumePending
    )
      return;
    this.traceNetwork('foreground-resume');
    if (this.state.connected && this.socket?.readyState === WebSocket.OPEN) {
      if (performance.now() - this.lastResumeAt < 750) return;
      this.lastResumeAt = performance.now();
      if (!this.timeSync) {
        this.restartConnection("正在恢复牌桌连接…", true, 'legacy-resume');
        return;
      }
      this.syncCurrentConnection('foreground-resume');
    } else if (
      !this.socket ||
      this.socket.readyState === WebSocket.CLOSING ||
      this.socket.readyState === WebSocket.CLOSED ||
      performance.now() - this.openedAt >= 2000
    ) {
      this.restartConnection("正在恢复牌桌连接…", true, 'foreground-closed-socket');
    } else {
      clearTimeout(this.connectTimer);
      this.connectTimer = setTimeout(
        () => this.restartConnection("正在恢复牌桌连接…", true, 'foreground-pending-handshake'),
        2000,
      );
    }
  };
  private syncCurrentConnection(reason: string) {
    clearTimeout(this.commandTimer);
    this.commandTimer = undefined;
    this.finishTables();
    this.resumePending = true;
    this.resumeStartedAt = performance.now();
    this.resumeViewSeen = false;
    this.recoveryStartedAt ??= performance.now();
    this.traceNetwork('snapshot-requested', { reason, operation:this.diagnosticCommand });
    this.updateNetwork({ phase: 'syncing' });
    this.emit({ connected:false, connecting:true, notice:'正在同步牌桌…' });
    this.syncTime(true);
  }
  setNetworkVisible = (visible: boolean) => {
    if(visible!==this.networkVisible)this.traceNetwork('visibility-change',{visible});
    const returning = visible && !this.networkVisible;
    this.networkVisible = visible;
    if (visible) {
      // Moving focus from the canvas iframe to a toolbar button is not an
      // app foreground transition. Resync only after an actual hidden state.
      if (returning) {
        this.lastResumeAt = -Infinity;
        this.resumeConnection();
      }
    } else {
      if (this.resumePending) {
        this.resumePending = false;
        this.emit({
          connected: false,
          connecting: false,
        });
      }
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
      this.clockPing = undefined;
      this.pendingPings.clear();
      clearTimeout(this.connectTimer);
      clearTimeout(this.commandTimer);
      this.commandTimer = undefined;
      this.finishTables();
      clearTimeout(this.retry);
      this.retry = undefined;
    }
  };
  networkOffline = () => {
    this.traceNetwork('browser-offline');
    this.restartConnection("网络已断开，恢复后自动同步牌桌…", false, 'device-offline');
  };
  private finishCommand() {
    clearTimeout(this.commandTimer);
    this.commandTimer = undefined;
    this.commandId = undefined;
    this.diagnosticCommand = '';
    this.emit({ submitting: null });
  }
  private finishPhrase(error?: Error) {
    const pending = this.phraseRequest;
    this.phraseRequest = undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    if (error) pending.reject(error); else pending.resolve();
  }
  get phraseMessages() { return this.state.phraseMessages; }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private emit(patch: Partial<ClientState>) {
    if (patch.connected === false || patch.view === null) patch.openingCue = null;
    if (patch.view && (patch.mode ?? this.state.mode) === "local") {
      const me = patch.view.players[patch.view.me];
      if (me) me.avatar = this.state.account?.avatar;
    }
    if (
      ("view" in patch && patch.view?.id !== this.state.view?.id) ||
      ("mode" in patch && patch.mode !== "online")
    )
      patch.voiceMessages = [];
    if (patch.connected === false || ("view" in patch && patch.view?.id !== this.state.view?.id) ||
        ("mode" in patch && patch.mode !== "online")) {
      patch.phraseMessages = [];
      clearTimeout(this.phraseExpiry);
      this.phraseExpiry = undefined;
      this.finishPhrase(new Error("已离开或断开牌桌，短句发送未确认"));
    }
    if (patch.connected === false && patch.phrasesAvailable === undefined) patch.phrasesAvailable = false;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  pruneVoiceMessages() {
    const keep = this.state.voiceMessages.filter(
      (m) => this.now() - m.at < 60000,
    );
    if (keep.length !== this.state.voiceMessages.length)
      this.emit({ voiceMessages: keep });
  }
  prunePhraseMessages() {
    clearTimeout(this.phraseExpiry);
    this.phraseExpiry = undefined;
    const now = this.now(), keep = this.state.phraseMessages.filter(message =>
      message.game === this.state.view?.id && now - message.at < ROOM_PHRASE_TTL_MS);
    if (keep.length !== this.state.phraseMessages.length) this.emit({ phraseMessages: keep });
    if (keep.length) {
      const until = Math.min(...keep.map(message => message.at + ROOM_PHRASE_TTL_MS));
      this.phraseExpiry = setTimeout(() => this.prunePhraseMessages(), Math.max(1, until - now + 1));
    }
  }
  clearError() {
    this.emit({ error: "" });
  }
  clearLobbyNotice() {
    this.emit({ lobbyNotice: "" });
  }
  async api<T>(path: string, body?: unknown): Promise<T> {
    const currentSession = this.authSession();
    const started=performance.now();
    // Route family only: never log query strings, account IDs, bodies or headers.
    const route=['auth','records','tables','profile','app','diagnostics'].find(part=>path.startsWith(`/api/${part}/`)||path===`/api/${part}`)??'other';
    const operation=`${body===undefined?'GET':'POST'}:${route}`;
    let status:number|undefined;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const token = storage.get<string>("token", "");
      const response = await fetch((base?.replace(/\/$/, "") ?? "") + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      status=response.status;
      const data = await response.json();
      if (!response.ok) {
        if (
          response.status === 401 &&
          currentSession() &&
          token === storage.get<string>("token", "") &&
          ![
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/session",
          ].includes(path)
        )
          this.expireAuth();
        throw Object.assign(new Error(data.error ?? "服务暂时不可用"), {
          status: response.status,
        });
      }
      this.traceNetwork('http-complete',{operation,status,elapsedMs:performance.now()-started});
      return data as T;
    } catch (error) {
      this.traceNetwork(route==='diagnostics'?'diagnostic-upload-failed':'http-failed',{operation,status,elapsedMs:performance.now()-started,reason:error instanceof Error?error.name:'Unknown'});
      if (
        error instanceof TypeError ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw Error("暂时连接不上账号服务，请检查网络后重试");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  async sendVoice(bytes: Uint8Array, game: string, signal: AbortSignal) {
    const currentSession = this.authSession();
    voiceDuration(bytes);
    if (
      !this.state.connected ||
      this.state.mode !== "online" ||
      this.state.view?.id !== game
    )
      throw Error("请连接牌桌后再发送语音");
    const timeout = new AbortController();
    const cancel = () => timeout.abort();
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    const timer = setTimeout(cancel, 12000);
    try {
      const response = await fetch(
        (base?.replace(/\/$/, "") ?? "") +
          "/api/voice/" +
          encodeURIComponent(game),
        {
          method: "POST",
          headers: {
            "Content-Type": "audio/wav",
            Authorization: `Bearer ${storage.get("token", "")}`,
          },
          body: new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
          signal: timeout.signal,
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 && currentSession()) this.expireAuth();
        throw Error(data.error ?? "语音发送失败，请重试");
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  }
  async sendPhrase(game: string, phrase: RoomPhraseId): Promise<void> {
    if (!isRoomPhraseId(phrase)) throw Error("请选择有效的固定短句");
    if (!this.state.connected || this.state.mode !== "online" || this.state.view?.id !== game || this.socket?.readyState !== WebSocket.OPEN)
      throw Error("请连接牌桌后再发送短句");
    if (!this.state.phrasesAvailable) throw Error("牌桌短句服务正在更新，请稍后再试");
    if (this.phraseRequest) throw Error("短句正在发送，请稍候");
    const id = `phrase-${Date.now().toString(36)}-${++this.phraseSequence}-${Math.random().toString(36).slice(2, 10)}`;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.finishPhrase(new Error("发送确认超时，请稍后再试")), 8000);
      this.phraseRequest = { id, game, timer, resolve, reject };
      try { this.socket!.send(JSON.stringify({ type: "phrase", game, phrase, requestId: id })); }
      catch { this.finishPhrase(new Error("短句未发送，请检查牌桌连接")); }
    });
  }
  private acceptAccount(data: { token: string; account: Account }) {
    this.authEpoch++;
    this.disconnect();
    storage.set("token", data.token);
    storage.set("name", data.account.name);
    this.emit({
      account: data.account,
      authChecked: true,
      authBusy: false,
      authError: "",
      view: null,
      mode: null,
      tables: [],
    });
    if (!data.account.mustChangePassword) this.connect(data.account.name);
  }
  private expireAuth() {
    this.authEpoch++;
    this.disconnect();
    storage.set("onlineActive", false);
    this.emit({
      account: null,
      authChecked: true,
      authBusy: false,
      view: null,
      mode: null,
      tables: [],
      error: "",
      authError: "登录已失效，请重新登录",
    });
  }
  async authenticate(
    mode: "login" | "register",
    username: string,
    password: string,
    name?: string,
  ) {
    if (this.state.authBusy) return;
    const epoch = ++this.authEpoch;
    this.emit({ authBusy: true, authError: "" });
    try {
      const data = await this.api<{ token: string; account: Account }>(
        `/api/auth/${mode}`,
        {
          username,
          password,
          name,
          ...(mode === "register"
            ? {
                legacyToken: storage.get(
                  "legacyToken",
                  storage.get("token", ""),
                ),
              }
            : {}),
        },
      );
      if (epoch !== this.authEpoch) return;
      this.acceptAccount(data);
    } catch (error) {
      if (epoch !== this.authEpoch) return;
      this.emit({
        authError: error instanceof Error ? error.message : "登录失败",
      });
    } finally {
      if (epoch === this.authEpoch) this.emit({ authBusy: false });
    }
  }
  async changePassword(currentPassword: string, password: string) {
    if (this.state.authBusy) return false;
    const currentSession = this.authSession();
    const operation = { current: currentSession, revoked: false };
    this.passwordChange = operation;
    this.emit({ authBusy: true, authError: "" });
    try {
      const data = await this.api<{ token: string; account: Account }>(
        "/api/auth/password",
        { currentPassword, password },
      );
      if (!currentSession()) return false;
      this.acceptAccount(data);
      return true;
    } catch (error) {
      if (!currentSession()) return false;
      this.emit({
        authError: error instanceof Error ? error.message : "修改失败",
      });
      return false;
    } finally {
      if (this.passwordChange === operation) this.passwordChange = undefined;
      if (currentSession()) {
        if (operation.revoked) this.expireAuth();
        else this.emit({ authBusy: false });
      }
    }
  }
  async updateProfile(name: string) {
    const currentSession = this.authSession();
    const sequence = ++this.profileSequence;
    const data = await this.api<{ account: Account }>("/api/auth/profile", {
      name,
    });
    if (!currentSession() || sequence !== this.profileSequence || data.account.id !== this.state.account?.id) return;
    storage.set("name", data.account.name);
    this.emit({ account: data.account });
  }
  async updateAvatar(image: string | null) {
    const currentSession = this.authSession();
    const sequence = ++this.profileSequence;
    const data = await this.api<{ account: Account }>("/api/auth/avatar", {
      image,
    });
    if (currentSession() && sequence === this.profileSequence && data.account.id === this.state.account?.id) this.emit({ account: data.account });
  }
  async logout() {
    if (this.state.authBusy) return;
    const currentSession = this.authSession();
    this.emit({ authBusy: true, authError: "" });
    try {
      await this.api("/api/auth/logout", {});
      if (!currentSession()) return;
      this.authEpoch++;
      androidDiagnostics.logout();
      this.disconnect();
      storage.set("token", "");
      storage.set("onlineActive", false);
      this.emit({
        account: null,
        authBusy: false,
        view: null,
        mode: null,
        tables: [],
        authError: "",
        error: "",
      });
    } catch (error) {
      if (!currentSession()) return;
      this.emit({
        authError: error instanceof Error ? error.message : "退出失败",
      });
    } finally {
      if (currentSession()) this.emit({ authBusy: false });
    }
  }
  clearAuthError() {
    this.emit({ authError: "" });
  }
  async restore() {
    if (this.authStarted) return;
    this.authStarted = true;
    const currentSession = this.authSession();
    const token = storage.get<string>("token", "");
    if (!token) {
      this.emit({ authChecked: true });
      return;
    }
    try {
      const data = await this.api<{ account: Account }>("/api/auth/session");
      if (!currentSession()) return;
      this.emit({ account: data.account, authChecked: true, authError: "" });
      if (
        onlineAvailable &&
        !data.account.mustChangePassword &&
        this.stopped &&
        !this.local
      )
        this.connect(data.account.name);
    } catch (error) {
      if (!currentSession()) return;
      if ((error as { status?: number }).status === 401) {
        storage.set("legacyToken", token);
        storage.set("token", "");
      }
      this.emit({
        authChecked: true,
        authError:
          (error as { status?: number }).status === 401
            ? "请登录或注册账号，继续与牌友同桌"
            : (error as Error).message,
      });
    }
  }
  history(): StoredRound[] {
    const practice = storage.get<StoredRound[]>(
      "history:practice",
      storage.get<StoredRound[]>("history", []).filter((r) => r.practice),
    );
    const online = this.state.account
      ? storage.get<StoredRound[]>(`history:${this.state.account.id}`, [])
      : [];
    return [...online, ...practice].sort((a, b) => b.record.at - a.record.at);
  }
  private pendingRecords = new Map<string, Promise<RecordsPage>>();
  async loadRecords(admin: boolean, query: URLSearchParams) {
    const normalized = new URLSearchParams(query);
    if (normalized.get("read") === "all") normalized.delete("read");
    normalized.sort();
    const path = (admin ? "/api/admin/records" : "/api/records") + "?" + normalized.toString();
    const key = JSON.stringify([this.state.account?.id, storage.get("token", ""), path]);
    const pending = this.pendingRecords.get(key);
    if (pending) return pending;
    const request = this.api<RecordsPage>(path);
    this.pendingRecords.set(key, request);
    try {
      return await request;
    } finally {
      this.pendingRecords.delete(key);
    }
  }
  async loadReplay(id: string): Promise<RoundReplay> {
    const saved = storage
      .get<RoundReplay[]>("replays:practice", [])
      .find((r) => r.id === id);
    if (saved) return saved;
    return this.api<RoundReplay>("/api/replays/" + encodeURIComponent(id));
  }
  async markMatchRead(id: string) {
    return this.api<{ readAt: number }>(
      "/api/admin/match-reads/" + encodeURIComponent(id),
      {},
    );
  }
  async loadMatch(id: string): Promise<MatchDetails> {
    return this.api<MatchDetails>("/api/matches/" + encodeURIComponent(id));
  }
  private updateLocal() {
    if (this.local) {
      if (this.local.phase === "ended" && !this.local.deadline)
        this.local.deadline = Date.now() + 10_000;
      storage.set("practice", this.local);
      if (this.local.replay?.endedAt) {
        const saved = storage.get<RoundReplay[]>("replays:practice", []);
        if (!saved.some((r) => r.id === this.local!.replay!.id))
          storage.set(
            "replays:practice",
            [this.local.replay, ...saved].slice(0, 5),
          );
      }
      this.emit({ view: viewFor(this.local, 0) });
      this.archive();
    }
  }
  private archive() {
    const view = this.state.view;
    if (!view?.history.length) return;
    const key =
      this.state.mode === "local"
        ? "history:practice"
        : `history:${this.state.account?.id ?? "unbound"}`;
    const records = storage.get<StoredRound[]>(key, []);
    for (const record of view.history)
      if (!records.some((r) => r.record.id === record.id))
        records.unshift({
          game: view.id,
          code: view.code,
          me: view.me,
          practice: this.state.mode === "local",
          record,
        });
    if (view.phase === "finished" && this.state.mode === "local") {
      const latest = records.find(
        (r) => r.record.id === view.history.slice(-1)[0]?.id,
      );
      if (latest)
        latest.record = {
          ...latest.record,
          matchFinished: true,
          totalRounds: view.rules.rounds,
        };
    }
    storage.set(key, records.slice(0, 100));
  }
  /** Retired entry point: stale clients must not start a local practice game. */
  practice(_name: string, _rules: Partial<Rules>, _resume = false) {
    this.emit({error: "单人练习已关闭，请在大厅进入牌桌"});
  }
  pauseLocal(paused: boolean) {
    if (paused === this.localPaused) return;
    this.localPaused = paused;
    if (paused) this.pausedAt = Date.now();
    else if (this.local && this.pausedAt !== undefined) {
      if (this.local.deadline)
        this.local.deadline += Date.now() - this.pausedAt;
      for (const p of this.local.players)
        if (p?.resumedDeadline) p.resumedDeadline += Date.now() - this.pausedAt;
      this.pausedAt = undefined;
      this.updateLocal();
    }
  }
  connect(name: string, pending?: ClientMessage) {
    if (this.state.updateRequired) {
      this.emit({ error: this.state.updateRequired.message, tablesLoading: false });
      return;
    }
    if (
      this.state.authChecked &&
      (!this.state.account || this.state.account.mustChangePassword)
    ) {
      this.emit({ error: "请先登录账号", tablesLoading: false });
      return;
    }
    if (!onlineAvailable) {
      this.emit({
        error: "此安装包尚未配置牌桌服务，请安装最新版本。",
      });
      return;
    }
    this.disconnect();
    this.name = name;
    this.pending = pending;
    this.lobbyWanted =
      pending?.type === "tables" || pending?.type === "createTables";
    this.stopped = false;
    this.emit({
      mode: "online",
      connecting: true,
      connected: false,
      error: "",
      notice: "",
    });
    this.open();
  }
  browseTables(name: string) {
    this.lobbyWanted = true;
    this.emit({ tablesLoading: true, error: "" });
    if (this.state.connected && this.state.mode === "online")
      this.send({ type: "tables" });
    else if (this.state.connecting) return;
    else this.connect(name, { type: "tables" });
  }
  createTables(
    name: string,
    settings: TableSettings,
    rules: Partial<Rules>,
    count: number,
  ) {
    this.lobbyWanted = true;
    const creationId =
      crypto.randomUUID?.() ??
      Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    const message: ClientMessage = {
      type: "createTables",
      settings,
      rules,
      count,
      creationId,
    };
    this.emit({ createdTables: [], error: "" });
    if (this.state.connected && this.state.mode === "online")
      this.send(message);
    else this.connect(name, message);
  }
  joinTable(name: string, code: string, seat?: 0 | 1 | 2 | 3) {
    const message: ClientMessage = { type: "join", code, seat };
    if (this.state.connected && this.state.mode === "online")
      this.send(message);
    else this.connect(name, message);
  }
  private open() {
    if (this.stopped || !this.networkVisible) return;
    if (navigator.onLine === false) {
      this.updateNetwork({ phase: "offline" });
      return;
    }
    clearTimeout(this.retry);
    this.retry = undefined;
    this.stopClock();
    this.clock.reset();
    this.updateNetwork({
      phase: "connecting",
      ...resetNetworkMeasurements(),
      reconnects: this.state.network.reconnects + (this.openedAt ? 1 : 0),
    });
    const endpoint = new URL((base?.replace(/\/$/, "") ?? "") + "/ws", `${location.protocol}//${location.host}/`);
    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    const url = endpoint.href;
    this.diagnosticConnection=`ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    this.receivedAt=0;this.diagnosticHeartbeatAt=0;this.diagnosticSnapshotAt=0;
    const ws = new WebSocket(url);
    this.socket = ws;
    this.openedAt = performance.now();
    this.traceNetwork('socket-connect',{attempt:this.attempt});
    this.connectTimer = setTimeout(
      () => {this.traceNetwork('connect-timeout',{elapsedMs:performance.now()-this.openedAt});this.restartConnection("连接牌桌超时，正在重试…", false, 'handshake-timeout');},
      10000,
    );
    ws.onopen = async () => {
      if (this.socket !== ws || this.stopped) return;
      this.traceNetwork('socket-open',{elapsedMs:performance.now()-this.openedAt});
      this.updateNetwork({ phase: "authenticating" });
      let clientVersion: string | undefined = webVersion;
      if (Capacitor.isNativePlatform()) {
        // Report the installed binary, not a remotely served preview's version.
        try { clientVersion = (await NativeApp.getInfo()).version; }
        catch { clientVersion = undefined; }
        if (this.socket !== ws || this.stopped) return;
      }
      ws.send(
        JSON.stringify({
          type: "hello",
          capabilities: { openingComplete: true, ...(androidDiagnostics.enabled()?{clientDiagnostics:true}:{}) },
          clientVersion,
          clientPlatform: Capacitor.getPlatform(),
          name: this.name,
          token: storage.get("token", undefined),
        }),
      );
      this.traceNetwork('hello-sent',{elapsedMs:performance.now()-this.openedAt});
    };
    ws.onmessage = (event) => {
      if (this.socket !== ws || this.stopped) return;
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (!msg || typeof msg.type !== 'string') throw new Error('Invalid server message');
        // Only authoritative traffic or a matching pong extends probe grace.
        // Garbage and stale pongs must not keep a half-open connection alive.
        if ((msg.type === 'state' && msg.state?.code && Number.isFinite(msg.state.revision)) ||
            (msg.type === 'pong' && msg.sentAt !== undefined && this.pendingPings.has(msg.sentAt) && Number.isFinite(msg.serverNow)) ||
            msg.type === 'session' || msg.type === 'ack') this.receivedAt=performance.now();
        this.clock.observe(msg.serverNow);
        if (msg.type === "session") {
          androidDiagnostics.session(msg.id,msg.clientDiagnostics===true||msg.androidDiagnostics===true,(diagnosticId,report)=>{if(this.socket!==ws||ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>65536)return false;ws.send(JSON.stringify({type:'diagnosticUpload',diagnosticId,report}));return true;},msg.clientDiagnosticsVersion);
          this.traceNetwork('session-confirmed',{elapsedMs:performance.now()-this.openedAt});
          clearTimeout(this.connectTimer);
          this.connectTimer = undefined;
          this.commandAck = msg.commandAck === true;
          this.timeSync = msg.timeSync === true;
          this.updateNetwork({ serverVersion: typeof msg.serverVersion === "string" && msg.serverVersion.length <= 64 ? msg.serverVersion : null });
          storage.set("token", msg.token);
          const previousRoom = storage.get<string | null>(`activeRoom:${msg.id}`, null);
          const completedWhileAway = !msg.roomCode && !!previousRoom;
          if (!msg.roomCode) storage.set(`activeRoom:${msg.id}`, null);
          storage.set("onlineActive", !!msg.roomCode);
          this.attempt = 0;
          this.awaitingRoom = msg.roomCode;
          this.updateNetwork({ phase: msg.roomCode ? "syncing" : "ready" });
          if (msg.roomCode)
            this.connectTimer = setTimeout(
              () => {this.traceNetwork('sync-timeout');this.restartConnection("牌桌状态未同步，正在重试…", false, 'initial-snapshot-timeout');},
              CONNECTION_POLICY.snapshotDeadlineMs,
            );
          else this.connectionReady();
          this.emit({
            connected: !msg.roomCode,
            phrasesAvailable: msg.roomPhrases === true,
            tableInvitesAvailable: msg.tableInvites === true,
            tableInvitations: [],
            connecting: !!msg.roomCode,
            notice: msg.roomCode ? "正在同步牌桌…" : "",
            error: "",
            tableLobby: msg.tableLobby === true,
            ...(msg.account ? { account: msg.account } : {}),
            ...(!msg.roomCode ? { view: null } : {}),
            ...(completedWhileAway ? { recordsReturn: (this.state.recordsReturn ?? 0) + 1 } : {}),
          });
          if (this.timeSync) {
            this.syncTime(true);
            clearInterval(this.clockTimer);
            this.clockTimer = setInterval(() => {
              const playing =
                this.state.view &&
                ["playing", "claiming"].includes(this.state.view.phase);
              if (playing || performance.now() - this.heartbeatAt >= 30000)
                this.syncTime();
            }, 10000);
          }
          if (this.pending && !msg.roomCode) this.send(this.pending);
          else if (this.lobbyWanted && msg.tableLobby && !this.awaitingRoom)
            this.send({ type: "tables" });
          this.pending = undefined;
        } else if (msg.type === "pong") {
          if (
            msg.sentAt !== undefined && this.pendingPings.has(msg.sentAt) &&
            Number.isFinite(msg.serverNow)
          ) {
            this.updateNetwork(
              measuredResponse(
                this.state.network,
                performance.now() - msg.sentAt,
              ),
            );
            this.clock.sample(msg.serverNow!, msg.sentAt);
            const rtt=performance.now()-msg.sentAt;
            if(rtt>=600||this.resumePending||performance.now()-this.diagnosticHeartbeatAt>=60000){
              this.traceNetwork('heartbeat-received',{rttMs:rtt,smoothedRttMs:this.state.network.smoothedRttMs??undefined,serverTimeMs:msg.serverNow});
              this.diagnosticHeartbeatAt=performance.now();
            }
            this.clockPing = undefined;
            this.pendingPings.clear();
            this.missedPongs = 0;
            this.probeStartedAt = undefined;
            clearTimeout(this.pongTimer);
            this.pongTimer = undefined;
            if (this.resumePending) {
              if (
                !msg.synced ||
                (msg.roomCode &&
                  (!this.resumeViewSeen ||
                    this.state.view?.code !== msg.roomCode))
              ) {
                this.restartConnection("正在重新获取完整牌桌…", true, 'incomplete-sync-response');
                return;
              }
              this.resumePending = false;
              this.resumeStartedAt = undefined;
              this.connectionReady();
              this.finishCommand();
              if (msg.synced && !msg.roomCode)
                storage.set("onlineActive", false);
              this.emit({
                connected: true,
                connecting: false,
                notice: "",
                error: "",
                ...(msg.synced && !msg.roomCode ? { view: null } : {}),
              });
              this.sendOpeningCompletion();
              if (this.lobbyWanted) this.browseTables(this.name);
            }
          }
        } else if (msg.type === "phrase") {
          const message = msg.message, view = this.state.view, now = this.now();
          if (this.state.connected && this.state.mode === "online" && isRoomPhraseMessage(message) &&
              view?.id === message.game && view.players[message.seat]?.id === message.sender &&
              now - message.at < ROOM_PHRASE_TTL_MS && message.at <= now + 1000 &&
              !this.state.phraseMessages.some(item => item.id === message.id)) {
            this.emit({ phraseMessages: [...this.state.phraseMessages.filter(item => now - item.at < ROOM_PHRASE_TTL_MS), message].slice(-ROOM_PHRASE_HISTORY_LIMIT) });
            this.prunePhraseMessages();
          }
        } else if (msg.type === "voice") {
          const voice = msg.message;
          if (
            this.state.mode === "online" &&
            this.state.view?.id === voice.game &&
            !this.state.voiceMessages.some((item) => item.id === voice.id)
          )
            this.emit({
              voiceMessages: [
                ...this.state.voiceMessages.filter(
                  (item) => this.now() - item.at < 60000,
                ),
                voice,
              ].slice(-8),
            });
        } else if (msg.type === "announcementsChanged") {
          this.emit({ announcementVersion: (this.state.announcementVersion ?? 0) + 1 });
        } else if (msg.type === "accountUpdated") {
          if (this.state.account?.id === msg.account.id)
            this.emit({ account: msg.account });
        } else if (msg.type === "tables") {
          this.finishTables();
          this.emit({ tables: msg.tables, tablesLoading: false });
        } else if (msg.type === "tablesCreated") {
          this.emit({ createdTables: msg.codes });
        } else if (msg.type === "records") {
          const previous = storage.get<
            Extract<ServerMessage, { type: "records" }>["records"]
          >(`history:${this.state.account?.id ?? "unbound"}`, []);
          const merged = new Map(previous.map((r) => [r.record.id, r]));
          for (const record of msg.records)
            merged.set(record.record.id, record);
          storage.set(
            `history:${this.state.account?.id ?? "unbound"}`,
            [...merged.values()]
              .sort((a, b) => b.record.at - a.record.at)
              .slice(0, 100),
          );
          this.emit({});
        } else if (msg.type === "state") {
          const restored = this.awaitingRoom !== undefined;
          if (restored && msg.state.code !== this.awaitingRoom) return;
          const before = this.state.view, next = msg.state;
          if (this.snapshotSocket === ws && before?.id === next.id && before.round === next.round && next.revision < before.revision) {
            this.traceNetwork('snapshot-regression', { revision: next.revision, round: next.round });
            if (!this.resumePending && !restored) {
              if (this.timeSync) this.syncCurrentConnection('snapshot-regression');
              else this.restartConnection('正在重新获取完整牌桌…', true, 'snapshot-regression');
            }
            return;
          }
          storage.set("onlineActive", true);
          this.snapshotSocket = ws;
          if (!this.commandAck) this.finishCommand();
          const accountId = this.state.account?.id ?? next.players[next.me]?.id;
          if (accountId) storage.set(`activeRoom:${accountId}`, next.id);
          const openingPending =
            next.openingGate?.round === next.round &&
            next.openingGate.waiting.includes(next.me);
          const currentOpening =
            this.state.openingCue?.game === next.id &&
            this.state.openingCue.round === next.round;
          const explicitOpeningProtocol =
            typeof next.table?.settings.openingAnimation === "boolean";
          // New servers explicitly identify clients that still need the first-
          // hand entrance, including reconnects. The snapshot heuristic remains
          // only for compatibility with servers that predate the opening gate.
          const legacyStarting = !next.openingGate && !explicitOpeningProtocol &&
            !restored &&
            !this.resumePending && this.state.connected && this.networkVisible &&
            next.round === 1 && next.phase === "playing" && !next.result &&
            !next.lastDiscard &&
            next.players.every(p => p && !p.discards.length && !p.melds.length) &&
            (!before || before.id !== next.id || before.round === 0);
          const starting = next.table?.settings.openingAnimation !== false &&
            !currentOpening && (openingPending || legacyStarting);
          this.resumeViewSeen = this.resumePending;
          if(restored||before?.round!==next.round||performance.now()-this.diagnosticSnapshotAt>=60000){
            androidDiagnostics.context({code:next.code,round:next.round,phase:next.phase});
            this.traceNetwork('snapshot-received',{revision:next.revision,round:next.round});
            this.diagnosticSnapshotAt=performance.now();
          }
          this.updateNetwork({
            lastSnapshotAt: Date.now(),
            lastResponseAt: Date.now(),
          });
          if (restored) {
            this.awaitingRoom = undefined;
            clearTimeout(this.connectTimer);
            this.connectTimer = undefined;
            this.connectionReady();
          }
          this.emit({
            view: msg.state,
            ...(starting ? { openingCue: {
              key: `${next.id}:${next.round}:opening`,
              game: next.id, round: next.round, at: Date.now(),
            } } : {}),
            ...(restored
              ? { connected: true, connecting: false, notice: "" }
              : {}),
          });
          if (
            this.openingCompletion?.game === next.id &&
            this.openingCompletion.round === next.round
          ) {
            if (openingPending) this.sendOpeningCompletion();
            else this.openingCompletion = undefined;
          } else if (this.openingCompletion) this.openingCompletion = undefined;
          if (restored && this.lobbyWanted) this.send({ type: "tables" });
          this.archive();
        } else if (msg.type === 'tableInvitations') {
          this.emit({ tableInvitations: msg.invitations });
        } else if (msg.type === 'invitationResult') {
          this.finishInvitation(msg.requestId, undefined, msg.peers);
        } else if (msg.type === "ack") {
          if(msg.requestId!==this.commandId&&msg.requestId!==this.phraseRequest?.id)
            this.traceNetwork('late-ack',{requestId:msg.requestId});
          if (msg.requestId === this.phraseRequest?.id) this.finishPhrase();
          if (msg.requestId === this.commandId) {
            this.traceNetwork('confirmed',{operation:this.diagnosticCommand,elapsedMs:performance.now()-this.commandStartedAt},'command-ack');
            this.finishCommand();
          }
        } else if(msg.type==='diagnosticRequest'){
          androidDiagnostics.request(msg.id,msg.expiresAt);
        } else if(msg.type==='diagnosticAck'){
          androidDiagnostics.ack(msg.id,msg.accepted);
          // Diagnostic delivery is independent of game command acknowledgments.
        } else if (msg.type === "error") {
          if (msg.code === 'UPDATE_REQUIRED') {
            this.requireUpdate(msg.message, msg.minimumVersion);
            return;
          }
          if (msg.code === "AUTH_REQUIRED") {
            this.expireAuth();
            return;
          }
          if (msg.requestId && this.inviteRequests.has(msg.requestId)) {
            this.finishInvitation(msg.requestId, new Error(msg.message));
            return;
          }
          if (msg.requestId === this.phraseRequest?.id) {
            this.finishPhrase(new Error(msg.message));
            return;
          }
          // A renewal/leave notification can finish the old command before its late reply arrives.
          if (msg.requestId && msg.requestId !== this.commandId) {this.traceNetwork('late-command-error',{requestId:msg.requestId});return;}
          if(this.commandId)this.traceNetwork(msg.message,{operation:this.diagnosticCommand,elapsedMs:performance.now()-this.commandStartedAt},'command-error');
          if (!msg.requestId || msg.requestId === this.commandId)
            this.finishCommand();
          if (!msg.requestId) this.finishTables();
          this.emit({
            error: msg.message,
            ...(!msg.requestId ? { tablesLoading: false } : {}),
          });
        } else if (msg.type === "left") {
          storage.set("onlineActive", false);
          const accountId = this.state.account?.id ?? this.state.view?.players[this.state.view.me]?.id;
          if (accountId) storage.set(`activeRoom:${accountId}`, null);
          this.finishCommand();
          if (msg.lobby) {
            this.lobbyWanted = true;
            this.emit({
              view: null,
              mode: "online",
              error: "",
              lobbyNotice: msg.message ?? "",
            });
            this.send({ type: "tables" });
          } else {
            this.emit({ view: null, mode: null });
            this.disconnect();
          }
        }
      } catch {
        this.traceNetwork('message-invalid');
        this.emit({ error: "收到无效牌局信息，请重新连接" });
      }
    };
    ws.onclose = (event) => {
      if (this.socket !== ws || this.stopped) return;
      androidDiagnostics.disconnect();
      this.traceNetwork('socket-close',{closeCode:event.code,wasClean:event.wasClean,closeReason:event.reason,elapsedMs:performance.now()-this.openedAt});
      this.stopClock();
      clearTimeout(this.connectTimer);
      this.finishTables();
      this.finishCommand();
      if (event.code === 4006) {
        this.requireUpdate('当前版本已停止进入牌桌，请更新应用后继续。');
        return;
      }
      if (event.code === 4003) {
        // Password rotation revokes the old socket before HTTP can deliver the
        // replacement token. Keep that specific request alive, never the socket.
        if (this.passwordChange?.current()) {
          this.passwordChange.revoked = true;
          this.disconnect();
          return;
        }
        this.expireAuth();
        return;
      }
      if (event.code === 4001) {
        this.stopped = true;
        this.updateNetwork({ phase: "blocked" });
        this.emit({
          connected: false,
          connecting: false,
          notice: "账号已在另一处打开，请返回大厅后重新进入。",
        });
        return;
      }
      this.restartConnection("连接中断，正在重新连接…", false, 'socket-close');
    };
    ws.onerror = () => {
      if (this.socket !== ws || this.stopped) return;
      this.traceNetwork('socket-error');
      if (!this.state.view)
        this.emit({
          error:
            "暂时连接不上牌桌服务，正在重试。请检查网络后重试。",
        });
    };
  }
  send(msg: ClientMessage) {
    // A read-only list refresh must not be blocked by (or acknowledge) a game command.
    if (this.state.submitting && msg.type !== "tables") {this.traceNetwork('command-blocked',{operation:msg.type,reason:'pending-confirmation'});return;}
    if (msg.type === "tables" && this.tablesTimer) return;
    if (!this.state.connected || this.socket?.readyState !== WebSocket.OPEN) {
      this.traceNetwork('command-blocked',{operation:msg.type,reason:'not-connected'});
      this.emit({ error: "正在重连，请稍候" });
      if (msg.type === "tables") this.restartConnection("正在重新同步牌桌…", false, 'tables-socket-unavailable');
      return;
    }
    if (
      ["tables", "createTables", "closeTable"].includes(msg.type) &&
      !this.state.tableLobby
    ) {
      this.emit({
        error: "牌桌大厅服务正在更新，请稍后重试",
        tablesLoading: false,
      });
      return;
    }
    const tracked =
      [
        "createTables",
        "closeTable",
        "action",
        "ready",
        "addBot",
        "trustee",
        "leave",
        "dissolve",
      ].includes(msg.type) ||
      (this.state.tableLobby && ["create", "join"].includes(msg.type));
    if (tracked) {
      const operation = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      this.commandId = `command-${operation}`;
      this.commandStartedAt=performance.now();
      this.diagnosticCommand=msg.type==='action'?`action:${msg.action.type}`:msg.type;
      this.traceNetwork('sent',{operation:this.diagnosticCommand},'command-sent');
      this.emit({ submitting: msg.type, error: "" });
      this.commandTimer = setTimeout(() => {
        this.traceNetwork('awaiting confirmation',{operation:this.diagnosticCommand,elapsedMs:performance.now()-this.commandStartedAt},'command-timeout');
        // The server may have accepted the move. Sync over the existing socket
        // first, keeping input blocked; never resend an uncertain operation.
        this.updateNetwork({
          commandTimeouts: this.state.network.commandTimeouts + 1,
        });
        if (this.timeSync && this.networkVisible && this.socket?.readyState === WebSocket.OPEN)
          this.syncCurrentConnection('command-confirmation-timeout');
        else this.restartConnection("牌桌响应较慢，正在重新同步…", false, 'command-confirmation-timeout');
      }, CONNECTION_POLICY.commandConfirmationMs);
    }
    if (msg.type === "tables") {
      this.emit({ tablesLoading: true });
      this.tablesTimer = setTimeout(
        () => {this.traceNetwork('tables-timeout');this.restartConnection("牌桌列表响应较慢，正在重新同步…", false, 'tables-timeout');},
        8000,
      );
    }
    try {
      this.socket.send(
        JSON.stringify({
          ...msg,
          ...(tracked ? { requestId: this.commandId } : {}),
          ...(["ready", "addBot", "action", "trustee", "leave", "dissolve"].includes(msg.type) && this.state.view
            ? { context: { game: this.state.view.id, round: this.state.view.round } } : {}),
        }),
      );
    } catch {
      this.traceNetwork('send-failed',{operation:this.diagnosticCommand});
      this.finishCommand();
      this.emit({ error: "操作未发送，正在重新连接牌桌…" });
      this.restartConnection("操作未发送，正在重新连接牌桌…", false, 'command-send-failed');
    }
  }
  action(action: Action) {
    try {
      if (this.local) {
        this.local = act(this.local, 0, action);
        this.updateLocal();
      } else if (this.state.view)
        this.send({
          type: "action",
          action,
          revision: this.state.view.revision,
        });
    } catch (error) {
      this.emit({ error: error instanceof Error ? error.message : "操作失败" });
    }
  }
  private sendOpeningCompletion() {
    const completion = this.openingCompletion;
    const gate = this.state.view?.openingGate;
    if (
      !completion ||
      this.state.view?.id !== completion.game ||
      gate?.round !== completion.round ||
      !gate.waiting.includes(this.state.view.me) ||
      !this.state.connected ||
      this.socket?.readyState !== WebSocket.OPEN
    )
      return;
    try {
      this.socket.send(JSON.stringify({
        type: "openingComplete",
        game: completion.game,
        round: completion.round,
      } satisfies ClientMessage));
    } catch {
      // Keep the idempotent completion pending, then obtain an authoritative
      // snapshot before retrying it. Otherwise the last gated player can leave
      // the table waiting until the server's opening timeout expires.
      this.restartConnection("开局同步未完成，正在重新连接…", true, 'opening-sync-timeout');
    }
  }
  openingComplete(game: string, round: number) {
    if (!game || !Number.isInteger(round) || round < 1) return;
    const gate = this.state.view?.openingGate;
    if (
      this.state.view?.id !== game ||
      gate?.round !== round ||
      !gate.waiting.includes(this.state.view.me)
    )
      return;
    if (
      this.openingCompletion?.game !== game ||
      this.openingCompletion.round !== round
    )
      this.openingCompletion = { game, round };
    this.sendOpeningCompletion();
  }
  ready() {
    if (this.local) {
      if (this.local.phase !== "ended") return;
      this.local.players[0]!.ready = true;
      this.local = startRound(this.local);
      this.updateLocal();
    } else this.send({ type: "ready" });
  }
  trustee(enabled: boolean) {
    if (this.local) {
      setTrustee(this.local, 0, enabled, Date.now());
      this.updateLocal();
    } else this.send({ type: "trustee", enabled });
  }
  dissolve(agree: boolean) {
    if (this.local) {
      if (agree) {
        this.local = dissolveGame(this.local);
        this.updateLocal();
      }
    } else this.send({ type: "dissolve", agree });
  }
  leave() {
    if (this.local) {
      this.updateLocal();
      this.disconnect();
      this.emit({ view: null, mode: null });
    } else if (this.state.view) this.send({ type: "leave" });
    else {
      this.disconnect();
      this.emit({ view: null, mode: null });
    }
  }
  retryUpdate = () => {
    if (!this.state.updateRequired) return;
    this.emit({ updateRequired: undefined, error: '' });
    this.connect(this.name);
  };
  private requireUpdate(message: string, minimumVersion?: string) {
    const completed = this.state.view?.phase === 'finished' ? this.state.view : null;
    this.disconnect();
    this.updateNetwork({ phase: 'blocked' });
    this.emit({ updateRequired: { message, minimumVersion }, error: message, notice: '', view: completed, openingCue: null });
  }
  disconnect() {
    this.snapshotSocket = undefined;
    androidDiagnostics.disconnect();
    for (const id of this.inviteRequests.keys()) this.finishInvitation(id, new Error('连接已关闭'));
    this.stopClock();
    this.finishTables();
    clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    this.clock.reset();
    this.stopped = true;
    this.finishCommand();
    this.commandAck = false;
    this.lobbyWanted = false;
    clearInterval(this.tick);
    clearTimeout(this.retry);
    this.tick = undefined;
    this.retry = undefined;
    this.socket?.close();
    this.socket = undefined;
    this.local = undefined;
    this.pending = undefined;
    this.recoveryStartedAt = undefined;
    this.openedAt = 0;
    this.emit({
      connected: false,
      connecting: false,
      tablesLoading: false,
      network: initialNetworkHealth(),
      tableInvitesAvailable: false,
      tableInvitations: [],
    });
  }
}
export const client = new GameClient();
