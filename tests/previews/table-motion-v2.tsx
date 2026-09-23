import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, Check, Image, MoveUp, Pause, Play, RotateCcw, Smartphone, Sparkles } from "lucide-react";
import { CocosTable } from "../../src/CocosTable";
import type { TableSceneCommand, TableSceneState, ScenePlayer } from "../../shared/table-scene";
import { SCORE_DEBIT_MS, type ScoreDebit } from "../../src/score-debits";
import { installTableMotionPreview, type PreviewMotion } from "./table-motion-renderer";
import { fullMeldFixture } from './table-full-meld-fixture';
import "./table-motion-v2.css";

// This view reuses the real table renderer and art. The snapshots are isolated
// visual fixtures; no game service, account, rules engine or live room is used.
type Seat = 0 | 1 | 2 | 3;
type Action = "response" | "overview" | "pung" | "open" | "concealed" | "added" | "flower" | "draw" | "discard" | "full-pung" | "full-open";
type ClaimChoice = "waiting" | "pung" | "kong" | "pass";
const actions: { id: Action; label: string; title: string; copy: string }[] = [
  { id: "response", label: "碰杠操作", title: "碰、杠、过在手牌上方，成功提示在手牌中间", copy: "左下角提示谁打了哪张牌，手牌上方选择碰、杠或过。此处会一直等你选择；点击后牌才会归组，手牌中间短暂显示对应动作，余牌、余花始终可见。" },
  { id: "overview", label: "总览", title: "在原来的牌桌上，重新安排碰杠与花位", copy: "使用软件真实牌桌、真实麻将牌与原来的四家头像。碰杠靠自己的手牌，花牌回到独立花位，风位、余牌、余花和把数保留在中央。" },
  { id: "pung", label: "碰牌", title: "四家同步展示碰上家、对家、下家", copy: "完成后每家同时摆出三组：碰上家、碰对家、碰下家。碰对家保持三张竖牌；碰上家、下家时来源牌贴边横置，不遮挡另外两张牌。" },
  { id: "open", label: "明杠", title: "四张完整并排，全部保持正向", copy: "明杠不套用补杠叠牌：四张底牌共用落桌基准且不转方向。扣分与补牌规则保持不变。" },
  { id: "concealed", label: "暗杠", title: "三张背面，一张明面，原牌桌上直接看", copy: "暗杠总共四张：底下三张背面，中间上方一张明面。其余三家门前分别显示 −5；比下胡分别 −10。" },
  { id: "added", label: "补杠", title: "第四张叠回原碰牌，来源清楚", copy: "新摸的牌平滑叠到原碰牌中间。按现有规则，仅原来供碰牌的玩家支付10分；比下胡20分。" },
  { id: "flower", label: "补花", title: "花归本人花位，补牌自然接上", copy: "花牌先移入本人花位，之后补到的新牌靠近剩余手牌落位。普通补花只显示“补花”，不显示扣分。" },
  { id: "draw", label: "摸牌", title: "轻提、滑入、停稳，摸到的新牌清楚可见", copy: "新牌按本侧方向平滑进入手牌末端，保留小间隙。碰杠后跟随变短的手牌，到位后保持可见，不闪现、不乱弹。" },
  { id: "discard", label: "出牌", title: "点选、慢慢上推，跟手落入牌河", copy: "使用软件原来的点选和拖牌手势。拖到桌上松手就打出，也保留再次点击出牌；不要求快速划动。" },
  { id: "full-pung", label: "四家满碰", title: "四家各4组碰牌：检查组间空隙与摸牌余量", copy: "每家12张碰牌分成4组，全部包含横置来牌，按较宽的情况展示。每家同时保留1张原手牌与1张摸牌位置。这是布局压力场景，不代表真实牌局中四家同时摸牌。" },
  { id: "full-open", label: "四家满明杠", title: "四家各4组明杠：每家16张完整并排", copy: "每组4张正向明杠，不叠牌、不转向；每家仍保留1张原手牌与1张摸牌位置。按当前真实尺寸和布局展示，不为演示缩小牌或隐藏越界。" },
];
const seatNames = ["本人", "下家", "对家", "上家"];
const initialKinds = [4, 12, 23, 27];
const clone = <T,>(value: T): T => structuredClone(value);

// The completed pung preview is also the visual-QA matrix for supplier
// direction. Every owner gets three independent groups in this fixed order:
// upstream, opposite, downstream. IDs are deliberately disjoint across
// melds, concealed hands, rivers and flowers so the fixture remains physical.
function applyPungSupplierMatrix(state: TableSceneState) {
  for (const player of state.players) {
    const seat = player.seat as Seat;
    const sources = [((seat + 3) % 4), ((seat + 2) % 4), ((seat + 1) % 4)];
    player.melds = sources.map((from, group) => {
      const kind = seat * 3 + group;
      return { type: "pung", tiles: [kind * 4, kind * 4 + 1, kind * 4 + 2], from, concealed: false };
    });
    player.hand = [12, 13, 14, 15].map(kind => kind * 4 + seat);
    player.handCount = 4; // 13 - 3 tiles represented by each exposed pung.
    player.discards = [0, 1, 2, 3].map(copy => (17 + seat) * 4 + copy);
    player.flowers = [136 + seat];
  }
  state.lastDiscard = undefined;
  state.drawn = undefined;
}

function makeSnapshots(action: Action, actor: Seat, multiple: number, from?: Seat, dense = false): TableSceneState[] {
  if (action === 'full-pung' || action === 'full-open') {
    const full = fullMeldFixture(action === 'full-pung' ? 'pung' : 'kong');
    return [full, clone(full), clone(full)];
  }
  const used = new Set<number>();
  const take = (kind: number) => {
    if (kind >= 34) { const tile = kind + 102; if (used.has(tile)) throw Error("演示花牌重复"); used.add(tile); return tile; }
    for (let copy = 0; copy < 4; copy++) { const tile = kind * 4 + copy; if (!used.has(tile)) { used.add(tile); return tile; } }
    throw Error("演示牌不足");
  };
  const fillers = [0, 1, 2, 9, 10, 11, 18, 19, 21, 22, 24, 25, 3, 5, 6, 7, 8, 13, 14, 15, 16, 28, 29, 30, ...(dense ? [4, 12, 23, 27] : [])];
  let fillerCursor = 0;
  const fill = (n: number) => Array.from({ length: n }, () => {
    for (let step = 0; step < fillers.length; step++) {
      const kind = fillers[fillerCursor++ % fillers.length];
      if ([0, 1, 2, 3].some(c => !used.has(kind * 4 + c))) return take(kind);
    }
    throw Error("演示手牌不足");
  });
  const source = from ?? ((actor + 3) % 4) as Seat;
  const players: ScenePlayer[] = [0, 1, 2, 3].map((seat) => ({
    name: seatNames[seat], score: 150, seat, bot: seat !== 0, trustee: false, online: true,
    hand: [], handCount: 10, flowers: [take(34 + seat)], discards: [],
    melds: [{ type: "pung", tiles: [take(initialKinds[seat]), take(initialKinds[seat]), take(initialKinds[seat])], from: (seat + 3) % 4, concealed: false }],
  }));
  if (dense) {
    const moreFlowers = [...[38, 39, 40, 41].map(take), ...Array.from({ length: 4 }, () => take(31)), ...Array.from({ length: 4 }, () => take(32))];
    for (const [s, count] of [6, 2, 2, 2].entries()) players[s].flowers.push(...moreFlowers.splice(0, count));
  }
  let newTiles: number[] = [], incoming: number | undefined, originalDraw: number | undefined;
  const replacement = take(17);
  if (["pung", "open", "concealed"].includes(action)) {
    newTiles = Array.from({ length: action === "pung" ? 3 : 4 }, () => take(20));
    if (action !== "concealed") { incoming = newTiles.at(-1)!; players[source].discards.push(incoming); }
    const owned = action === "pung" ? newTiles.slice(0, 2) : action === "open" ? newTiles.slice(0, 3) : newTiles;
    players[actor].hand.push(...owned);
    if (action === "concealed") originalDraw = owned.at(-1);
  }
  if (action === "added") { originalDraw = take(initialKinds[actor]); players[actor].hand.push(originalDraw); }
  if (action === "flower") { originalDraw = take(38); players[actor].hand.push(originalDraw); }
  if (action === "discard") { originalDraw = replacement; players[actor].hand.push(replacement); }
  for (const p of players) {
    const extra = p.seat === actor && ["concealed", "added", "flower", "discard"].includes(action) ? 1 : 0;
    p.hand.push(...fill(10 + extra - p.hand.length));
    p.hand.sort((a, b) => a - b);
    p.handCount = p.hand.length;
    p.discards.unshift(...fill(dense ? 15 : 4));
  }
  if (action === "overview") {
    players[1].melds[0].tiles.push(take(initialKinds[1])); players[1].melds[0].type = "kong";
    players[2].melds[0].tiles.push(take(initialKinds[2])); players[2].melds[0].type = "kong"; players[2].melds[0].concealed = true;
    players[3].melds[0].tiles.push(take(initialKinds[3])); players[3].melds[0].type = "kong";
  }
  const before: TableSceneState = {
    key: "table-motion-visual", revision: 0, me: 0, turn: actor, dealer: 0,
    phase: "playing", code: "预览", round: 3, rounds: 8, remaining: 52,
    rulesName: "进园子", roundMultiplier: multiple, countdown: "10", connected: true,
    disabled: false, practice: false, canDiscard: actor === 0, players, selected: null,
    drawn: actor === 0 ? originalDraw : undefined, inspectedKind: null, hintKinds: [], hintLabel: "", actions: [],
    effects: [], trusteeDisabled: true, lastDiscard: incoming !== undefined ? { tile: incoming, seat: source } : undefined,
  };
  const after = clone(before), player = after.players[actor];
  const remove = (tiles: number[]) => { player.hand = player.hand.filter(t => !tiles.includes(t)); player.handCount = player.hand.length; };
  if (["pung", "open", "concealed"].includes(action)) {
    remove(newTiles);
    if (incoming !== undefined) after.players[source].discards = after.players[source].discards.filter(t => t !== incoming);
    player.melds.push({ type: action === "pung" ? "pung" : "kong", tiles: newTiles, from: action === "concealed" ? actor : source, concealed: action === "concealed" });
    after.lastDiscard = undefined; after.drawn = undefined;
    after.effects = [{ key: "action", type: action === "pung" ? "pung" : "kong", seat: actor, concealed: action === "concealed" }];
  } else if (action === "added") {
    remove([originalDraw!]); player.melds[0].tiles.push(originalDraw!); player.melds[0].type = "kong"; player.melds[0].added = true;
    after.drawn = undefined; after.effects = [{ key: "action", type: "kong", seat: actor, upgraded: true }];
  } else if (action === "flower") {
    remove([originalDraw!]); player.flowers.push(originalDraw!); after.drawn = undefined;
    after.effects = [{ key: "action", type: "flower", seat: actor }];
  } else if (action === "draw") {
    player.hand.push(replacement); player.handCount++; after.drawn = actor === 0 ? replacement : undefined; after.remaining--;
  } else if (action === "discard") {
    remove([replacement]); player.discards.push(replacement); after.drawn = undefined; after.lastDiscard = { tile: replacement, seat: actor }; after.canDiscard = false;
  }
  if (["open", "concealed", "added"].includes(action)) {
    const amount = (action === "concealed" ? 5 : 10) * multiple;
    const payers = action === "concealed" ? [0, 1, 2, 3].filter(s => s !== actor) : [source];
    for (const payer of payers) { after.players[payer].score -= amount; player.score += amount; }
  }
  if (action === "pung") applyPungSupplierMatrix(after);
  after.revision = 1;
  const replenished = clone(after);
  if (["open", "concealed", "added", "flower"].includes(action)) {
    replenished.players[actor].hand.push(replacement); replenished.players[actor].handCount++;
    replenished.drawn = actor === 0 ? replacement : undefined; replenished.remaining--; replenished.revision = 2;
  }
  // Hidden opponent tiles stay hidden, exactly as on a normal live table.
  return [before, after, replenished].map((state) => ({ ...state,
    remaining: 144 - state.players.reduce((n, p) => n + p.handCount + p.flowers.length + p.discards.length + p.melds.reduce((m, meld) => m + meld.tiles.length, 0), 0),
    players: state.players.map(p => ({ ...p, hand: p.seat === 0 ? p.hand : [] })),
  }));
}

function claimSnapshots(canKong: boolean, source: Seat, multiple: number, dense: boolean, choice: ClaimChoice) {
  const states = makeSnapshots(canKong ? "open" : "pung", 0, multiple, source, dense);
  const before = states[0], incoming = before.lastDiscard!.tile;
  before.phase = "claiming"; before.turn = source; before.canDiscard = false;
  before.pending = { tile: incoming, from: source, answered: false, kind: "discard" };
  before.actions = [{ id: "pung", label: "碰" }, ...(canKong ? [{ id: "kong", label: "杠" }] : []), { id: "pass", label: "过" }];
  if (choice === "waiting") return { states: [before, before, before], tile: incoming };
  if (choice === "pass") {
    const passed = clone(before); passed.phase = "playing"; passed.pending = undefined; passed.actions = []; passed.turn = (source + 1) % 4;
    return { states: [before, passed, passed], tile: incoming };
  }
  if (choice === "pung") {
    const after = clone(before), own = after.players[0];
    const matching = own.hand.filter(t => Math.floor(t / 4) === Math.floor(incoming / 4)).slice(0, 2);
    own.hand = own.hand.filter(t => !matching.includes(t)); own.handCount = own.hand.length;
    own.melds.push({ type: "pung", tiles: [...matching, incoming], from: source, concealed: false });
    after.players[source].discards = after.players[source].discards.filter(t => t !== incoming);
    after.phase = "playing"; after.turn = 0; after.canDiscard = true; after.pending = undefined; after.actions = []; after.lastDiscard = undefined;
    after.effects = [{ key: "claim", type: "pung", seat: 0 }];
    return { states: [before, after, after], tile: incoming };
  }
  return { states, tile: incoming };
}

function Preview() {
  const [action, setAction] = useState<Action>(() => {
    const requested = new URLSearchParams(location.search).get('scene');
    return actions.some(item => item.id === requested) ? requested as Action : 'response';
  }), [seat, setSeat] = useState<Seat>(0);
  const [slow, setSlow] = useState(false), [double, setDouble] = useState(false);
  const [phase, setPhase] = useState(0), [run, setRun] = useState(0), [auto, setAuto] = useState(false);
  const [selected, setSelected] = useState<number | null>(null), [manual, setManual] = useState<TableSceneState | null>(null);
  const [claimSource, setClaimSource] = useState<Seat>(3), [canKong, setCanKong] = useState(true), [dense, setDense] = useState(false);
  const [claimChoice, setClaimChoice] = useState<ClaimChoice>("waiting");
  const [expiredDebit, setExpiredDebit] = useState("");
  const claimLocked = useRef(false);
  const [installed, setInstalled] = useState(false), [failure, setFailure] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const patch = useRef<Awaited<ReturnType<typeof installTableMotionPreview>> | null>(null);
  const playback = slow ? 2.8 : 1;
  const definition = actions.find((a) => a.id === action)!;
  const claim = useMemo(() => claimSnapshots(canKong, claimSource, double ? 2 : 1, dense, claimChoice), [canKong, claimSource, double, dense, claimChoice, run]);
  const standardSnapshots = useMemo(() => makeSnapshots(action, seat, double ? 2 : 1), [action, seat, double, run]);
  const snapshots = action === "response" ? claim.states : standardSnapshots;
  const charge = ["open", "concealed", "added"].includes(action) || action === "response" && claimChoice === "kong", amount = (action === "concealed" ? 5 : 10) * (double ? 2 : 1);
  const debitActive = !manual && charge && phase >= 1 && phase < 3;
  // Phase 2 adds the replacement draw; it must not restart an earlier payment.
  const debitBatch = useMemo(() => {
    if (!debitActive) return null;
    const payers = action === "response" ? [claimSource] : action === "concealed" ? [0, 1, 2, 3].filter(s => s !== seat) : [(seat + 3) % 4];
    const key = `${run}:${action}:${seat}:${claimSource}:${amount}`;
    const startedAt = Date.now();
    const events: ScoreDebit[] = payers.map(payer => ({
      key: `${key}:${payer}`, seat: payer as Seat, amount, label: action === "response" ? "明杠" : definition.label,
    }));
    return { key, events, startedAt, expiresAt: startedAt + SCORE_DEBIT_MS * playback };
  }, [debitActive, run, action, seat, claimSource, amount, definition.label, playback]);
  const debitEvents = debitBatch && expiredDebit !== debitBatch.key ? debitBatch.events : [];
  const scene: TableSceneState = {
    ...(manual ?? snapshots[Math.min(phase, 2)]), key: `motion-preview-${run}`, revision: manual?.revision ?? run * 10 + phase,
    selected, effects: manual || phase === 0 || phase >= 3 ? [] : snapshots[1].effects.map(e => ({ ...e, key: `${run}-${e.type}` })),
  };
  const meta: PreviewMotion = { speed: playback, action: manual ? "discard" : action, run };
  const latestMeta = useRef(meta); latestMeta.current = meta;
  useEffect(() => {
    let active = true, generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
    let frame: HTMLIFrameElement | null = null;
    const connect = async () => {
      if (!frame) return;
      const token = ++generation;
      setInstalled(false); setFailure(""); patch.current?.destroy(); patch.current = null;
      try {
        const handle = await installTableMotionPreview(frame);
        if (!active) { handle.destroy(); return; }
        if (token !== generation) { handle.destroy(); return; }
        patch.current = handle; handle.sync(latestMeta.current); setInstalled(true);
      } catch (error) { if (active && token === generation) setFailure((error as Error).message); }
    };
    const attach = () => {
      frame = stage.current?.querySelector("iframe") ?? null;
      if (!frame) { timer = setTimeout(attach, 100); return; }
      frame.addEventListener("load", connect);
      if (frame.contentDocument?.querySelector("canvas")) void connect();
    };
    attach();
    return () => { active = false; if (timer) clearTimeout(timer); frame?.removeEventListener("load", connect); patch.current?.destroy(); patch.current = null; };
  }, []);
  // Set local playback speed before CocosTable's normal state-post effect runs.
  useLayoutEffect(() => { patch.current?.sync(meta); }, [installed, playback, action, manual, run]);
  useEffect(() => {
    if (!debitBatch) return;
    const timer = setTimeout(() => setExpiredDebit(debitBatch.key), Math.max(0, debitBatch.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [debitBatch]);
  useEffect(() => {
    setPhase(0);
    if (!installed || action === "overview" || action === "response" || action.startsWith('full-')) return;
    const timers = [setTimeout(() => setPhase(1), 50 * playback), setTimeout(() => setPhase(2), 500 * playback), setTimeout(() => setPhase(3), 2300 * playback)];
    return () => timers.forEach(clearTimeout);
  }, [installed, run, action, seat, slow, double]);
  useEffect(() => {
    if (action !== "response" || claimChoice === "waiting") return;
    if (claimChoice === "pass") { setPhase(3); return; }
    setPhase(1);
    const timers = [setTimeout(() => setPhase(2), 450 * playback), setTimeout(() => setPhase(3), 2300 * playback)];
    return () => timers.forEach(clearTimeout);
  }, [action, claimChoice, run, playback]);
  useEffect(() => {
    if (!auto || !installed || action === "response") return;
    const id = setTimeout(() => { const index = actions.findIndex(a => a.id === action); setAction(actions[index >= actions.length - 1 ? 2 : index + 1].id); setRun(r => r + 1); setSelected(null); setManual(null); setPhase(0); }, 3000 * playback);
    return () => clearTimeout(id);
  }, [auto, installed, action, run, playback]);
  function play(next: Action) { setAuto(false); setSelected(null); setManual(null); setPhase(0); setAction(next); setClaimChoice("waiting"); claimLocked.current = false; setRun(r => r + 1); }
  function chooseClaim(choice: Exclude<ClaimChoice, "waiting">) {
    if (!installed || action !== "response" || claimChoice !== "waiting" || claimLocked.current || choice === "kong" && !canKong) return;
    claimLocked.current = true; setSelected(null); setManual(null); setClaimChoice(choice); setPhase(choice === "pass" ? 3 : 1);
  }
  function command(command: TableSceneCommand) {
    if (command.type === "action" && ["pung", "kong", "pass"].includes(command.action)) {
      chooseClaim(command.action as Exclude<ClaimChoice, "waiting">); return;
    }
    if (command.type === "select") setSelected(command.tile);
    if (command.type === "discard") {
      const next = clone(scene), me = next.players[0];
      if (!next.canDiscard || !me.hand.includes(command.tile)) return;
      me.hand = me.hand.filter(t => t !== command.tile); me.handCount = me.hand.length; me.discards.push(command.tile);
      next.lastDiscard = { tile: command.tile, seat: 0 }; next.selected = null; next.drawn = undefined; next.canDiscard = false; next.revision++;
      setAuto(false); setManual(next); setSelected(null);
    }
  }
  const status = !installed ? "正在载入真实牌桌" : manual ? "已在真实牌桌上出牌" : action.startsWith('full-') ? "极限展示 · 每家4组＋余手牌＋摸牌槽" : action === "response" ? claimChoice === "waiting" ? "真实牌桌 · 等待你选择碰、杠或过" : claimChoice === "pass" ? "已过，等待出牌" : "已响应 · 点击重演可重新选择" : action === "overview" ? "真实牌桌 · 四家位置总览" : phase < 3 ? "真实牌桌 · 动作演示中" : "已完成 · 点击可重放";
  return <div className="mv2-page">
    <header className="mv2-header"><div><span className="mv2-eyebrow">南京麻将 / REAL TABLE MOTION PREVIEW</span><h1>原来的牌桌，新的动作<span>03</span></h1></div><div className="mv2-local"><i />本地动效预览<small>正式牌桌组件 · 不连接正式牌局</small><a href={action === "response" ? "/docs/design/claim-response-v2.png" : "/docs/design/table-motion-v2.png"} target="_blank" rel="noreferrer"><Image size={12} />看设计图</a><a href="/docs/design/meld-angle-source-v1.png" target="_blank" rel="noreferrer"><Image size={12} />新牌角度样稿</a></div></header>
    <div className="mv2-controls"><nav aria-label="选择动作">{actions.map((item, i) => <button key={item.id} aria-pressed={action === item.id} onClick={() => play(item.id)}><span>{String(i).padStart(2, "0")}</span>{item.label}</button>)}</nav><button className="mv2-auto" disabled={action === "response"} aria-pressed={auto} onClick={() => { setAuto(!auto); if (!auto && action === "overview") { setAction("pung"); setRun(r => r + 1); } }}>{action === "response" ? <MoveUp size={15} /> : auto ? <Pause size={15} /> : <Play size={15} />}{action === "response" ? "手动选择" : auto ? "停止轮播" : "连续演示"}</button></div>
    <main className="mv2-showcase"><div className="mv2-stage-bar"><span><i className={installed && action !== "overview" && phase < 3 ? "is-playing" : ""} />{status}</span><div className="mv2-stage-options">{action === "response" ? <label>出牌方<select value={claimSource} aria-label="出牌方" onChange={e => { setClaimSource(Number(e.target.value) as Seat); play("response"); }}>{[1, 2, 3].map(s => <option key={s} value={s}>{seatNames[s]}</option>)}</select></label> : <label>行动位置<select value={seat} onChange={e => { setSeat(Number(e.target.value) as Seat); play(action); }} aria-label="行动位置">{seatNames.map((name, i) => <option value={i} key={name}>{name}</option>)}</select></label>}<button aria-pressed={slow} onClick={() => { setSlow(!slow); play(action); }}>{slow ? "慢速 ×0.36" : "正常速度"}</button><button aria-pressed={double} onClick={() => { setDouble(!double); play(action); }}>{double ? "比下胡 ×2" : "普通局 ×1"}</button><button aria-label="重新播放当前动作" onClick={() => play(action)}><RotateCcw size={14} /></button></div></div>
      {action === "response" && <div className="mv2-response-config"><div><button aria-pressed={!canKong} onClick={() => { setCanKong(false); play("response"); }}>只可碰</button><button aria-pressed={canKong} onClick={() => { setCanKong(true); play("response"); }}>可碰可杠</button><button aria-pressed={dense} onClick={() => { setDense(!dense); play("response"); }}>{dense ? "繁忙牌桌已开启" : "繁忙牌桌"}</button></div><span>点击牌桌上的操作，观察真实归组</span></div>}
      <div className="mv2-real-viewport" data-phase={phase} data-action={action} ref={stage} style={{ "--mv2-debit-duration": `${SCORE_DEBIT_MS * playback}ms` } as CSSProperties}><CocosTable state={scene} onCommand={command} scoreDebits={debitEvents} /></div>
      <div className="mv2-caption" aria-live="polite"><span className="mv2-caption-index">{String(actions.findIndex(a => a.id === action)).padStart(2, "0")}</span><div><h2>{definition.title}</h2><p>{definition.copy}</p>{failure && <p role="alert">{failure}</p>}</div><button onClick={() => play(action === "overview" ? "pung" : action)}><Play size={15} />{action === "response" ? "重新演示" : action === "overview" ? "播放碰牌" : "再看一次"}</button></div>
    </main>
    <div className="mv2-bottom"><div className="mv2-note"><span><Check size={16} />真实牌桌</span><p>原来的牌图、头像与风位<br />碰杠和花位在桌上直接看</p></div><div className="mv2-note"><span><Sparkles size={16} />付款人门前提示</span><p>克制米金动作字与浅米色扣分<br />补花与碰牌不扣分</p></div><div className="mv2-note"><span><ArrowUpRight size={16} />连续移动</span><p>真实牌节点移动到最终位置<br />可切换四个座位和慢速</p></div><div className="mv2-interaction"><MoveUp size={19} /><p><strong>{action === "response" ? "直接点击牌桌上的碰、杠或过" : "选择“本人”，试试自己的手牌"}</strong><span>{action === "response" ? "仅显示本次可用操作，点击后立即锁定" : "点选 → 慢慢拖到桌面，或再次点击打出"}</span></p></div></div>
    <div className="mv2-portrait"><Smartphone size={17} /><span>横屏查看更完整，仍可点击上方按钮演示。</span></div><footer className="mv2-footer">与软件共用正式牌桌、按钮和扣分组件 · 本地场景不连接服务器</footer>
  </div>;
}
document.documentElement.dataset.runtime = "web";
const root = createRoot(document.getElementById("root")!); root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
