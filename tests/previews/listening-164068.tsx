import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, ChevronLeft, ChevronRight, Columns2, Flower2, History, Info, PanelTop, ShieldCheck } from "lucide-react";
import { CocosTable } from "../../src/CocosTable";
import { Tile } from "../../src/Tile";
import { listeningHints, unseenHintCounts } from "../../src/listening-hints";
import { listeningHints as listeningHintsBefore } from "./listening-164068-before";
import { structuralWaits } from "../../shared/scoring-nanjing";
import { ruleDisplayName } from "../../shared/nanjing-rules";
import { kind, tileName } from "../../shared/tiles";
import type { PublicPlayer, ReplayFrame, RoundReplay, Seat } from "../../shared/types";
import type { TableSceneState } from "../../shared/table-scene";
import "../../src/styles.css";
import "../../src/classic.css";
import "../../src/polish.css";
import "../../src/tables.css";
import "../../src/table-redesign.css";
import "./listening-164068.css";

// Historical public snapshots only. No live client, service request, game action,
// opponent concealed tiles, random wall, or production version switch is used.
type SafePlayer = ReplayFrame["players"][number] & { handCount?: number };
type SafeFrame = Omit<ReplayFrame, "players"> & { players: SafePlayer[] };
type SafeReplay = Omit<RoundReplay, "frames"> & { frames: SafeFrame[] };
type Checkpoint = { frame: number; label: string; description?: string; discard?: number };
type Fixture = {
  replay: SafeReplay;
  source: { seat: Seat; roomCode: string; round: number; frameCount: number; experience: boolean };
  targetSeat?: Seat;
  me?: Seat;
  checkpoints?: Checkpoint[];
  earthlyWaits?: number[];
};
type Version = "before" | "after";
const DATA = "/output/listening-164068-round2/sanitized-fixture.json";
const compareParams = new URLSearchParams(location.search);
const requestedFrame = Number(compareParams.get("frame") ?? 75);
const time = (at: number) => `${String(Math.floor(at / 60000)).padStart(2, "0")}:${String(Math.floor(at / 1000) % 60).padStart(2, "0")}`;
const namesFor = (kinds: number[]) => kinds.map(value => tileName(value * 4)).join("、");
const noCommand = () => {};

function publicPlayers(replay: SafeReplay, frame: SafeFrame, me: Seat): PublicPlayer[] {
  return frame.players.map((player, seat) => ({
    ...player,
    id: `local-seat-${seat}`,
    name: replay.names[seat],
    bot: seat !== me,
    ready: true,
    online: true,
    trustee: false,
    // Defense in depth: even a malformed local fixture cannot feed an opponent
    // concealed hand into the hint calculation or the real table component.
    hand: seat === me ? [...player.hand] : [],
    handCount: player.handCount ?? player.hand.length,
  }));
}

function analyze(fixture: Fixture, step: number, selected: number | undefined, version: Version) {
  const replay = fixture.replay, frame = replay.frames[step], me = fixture.source.seat;
  const rules = replay.rules!;
  const players = publicPlayers(replay, frame, me), current = players[me];
  const ended = !!frame.result || frame.type === "finish";
  const discard = current.hand.length % 3 === 2 ? selected : undefined;
  const hand = discard === undefined ? current.hand : current.hand.filter(tile => tile !== discard);
  const hints = ended ? [] : (version === "before" ? listeningHintsBefore : listeningHints)(current, rules, discard, players, { seat: me, earthlyWaits: fixture.earthlyWaits });
  const structural = !ended && hand.length % 3 === 1 ? structuralWaits({ hand, melds: current.melds }) : [];
  const unseen = unseenHintCounts({ me, players }, hints);
  const validShape = !ended && hand.length % 3 === 1;
  return { current, players, me, rules, discard, hints, structural, unseen, validShape, ended };
}

function makeScene(fixture: Fixture, step: number, selected: number | undefined, version: Version): TableSceneState {
  const replay = fixture.replay, frame = replay.frames[step];
  const result = analyze(fixture, step, selected, version);
  const previous = replay.frames.slice(0, step + 1).reverse();
  const last = previous.find(value => value.type === "discard");
  const lastDiscard = last?.seat !== undefined && last.tile !== undefined && frame.players[last.seat].discards.includes(last.tile) ? { seat: last.seat, tile: last.tile } : undefined;
  const ownEvent = previous.find(value => value.seat === result.me && ["draw", "discard", "pung", "kong", "concealedKong", "addedKong"].includes(value.type));
  const drawn = ownEvent?.type === "draw" && ownEvent.tile !== undefined && result.current.hand.includes(ownEvent.tile) ? ownEvent.tile : undefined;
  return {
    globalAnchorDiscards: frame.globalAnchorDiscards ?? [],
    key: `local-164068-round2-${version}`, revision: step, me: result.me,
    turn: frame.turn, dealer: replay.frames[0].turn, phase: result.ended ? "ended" : "playing",
    code: replay.code, round: replay.round, rounds: result.rules.rounds,
    remaining: frame.remaining, rulesName: ruleDisplayName(result.rules), roundMultiplier: replay.multiplier,
    countdown: "Ⅱ", connected: true, disabled: true, practice: false, canDiscard: false,
    selected: result.discard ?? null, drawn, inspectedKind: null,
    hintKinds: result.hints, hintLabel: result.discard === undefined ? "已经听牌" : "打出后可听",
    hintDiscard: result.discard, hintUnseen: result.unseen,
    actions: [], effects: [], trusteeDisabled: true, lastDiscard,
    players: result.players.map((player, seat) => ({
      ...player, seat,
      hand: seat === result.me ? [...player.hand].sort((a, b) => kind(a) - kind(b) || a - b) : [],
      melds: player.melds.map(meld => ({ ...meld, tiles: meld.concealed ? meld.tiles.slice(0, 1) : [...meld.tiles] })),
    })),
  };
}

function Board({ fixture, step, selected, version }: { fixture: Fixture; step: number; selected?: number; version: Version }) {
  const stage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const state = useMemo(() => makeScene(fixture, step, selected, version), [fixture, step, selected, version]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== stage.current?.querySelector("iframe")?.contentWindow || event.data?.scope !== "jinling-table-v1") return;
      if (event.data.type === "ready") setReady(true);
      if (event.data.type === "error") setReady(false);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  const title = version === "before" ? "旧算法 · 修正前" : "当前版本 · 0.7.30 Build67";
  return <article className={`l164-board-card l164-${version}`} aria-label={`${title}牌桌`}>
    <header className="l164-board-heading"><b><i className="l164-version-dot" />{title}</b><small>小淘气视角 · 同一时刻、同一手牌</small></header>
    <div ref={stage} className="l164-stage" data-ready={ready} data-version={version} data-step={step}>
      <CocosTable state={state} onCommand={noCommand} />
    </div>
    <div className="l164-board-result" role="status">
      {state.hintKinds.length ? <Check size={13} /> : <Info size={13} />}
      <span>{state.phase === "ended" ? "本把已结束，牌桌不再显示听牌提示。" : state.hintKinds.length ? `${version === "before" ? "旧算法显示" : state.hintDiscard === undefined ? "可听" : `打${tileName(state.hintDiscard)}后可听`}：${namesFor(state.hintKinds)}` : state.players[state.me].hand.length % 3 === 2 && state.hintDiscard === undefined ? "选择一张手牌，查看打出后的听牌结果。" : "此时没有合法听口，牌桌不显示听牌提示。"}</span>
    </div>
  </article>;
}

function Preview() {
  const [fixture, setFixture] = useState<Fixture | null>(null), [error, setError] = useState("");
  const [step, setStep] = useState(requestedFrame), [selected, setSelected] = useState<number | undefined>();
  const [version, setVersion] = useState<Version>(compareParams.get("version") === "before" ? "before" : "after");
  const [parallel, setParallel] = useState(compareParams.get("layout") === "parallel");
  const [compact, setCompact] = useState(window.innerWidth <= 850);
  useEffect(() => {
    const query = matchMedia("(max-width:850px)");
    const update = () => setCompact(query.matches); update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(DATA, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error("等待本地脱敏回放文件。牌面就绪后会在这里显示真实对照。");
      return response.json() as Promise<Fixture>;
    }).then(data => {
      if (data.replay?.code !== "164068" || data.replay.round !== 2 || !data.replay.rules || !data.replay.frames.length) throw Error("本地文件不是164068房第2把完整记录。");
      const me = data.source?.seat;
      if (me !== 0 || data.source.roomCode !== "164068" || data.source.round !== 2) throw Error("本地记录的观看玩家与本例不一致。");
      if (data.replay.frames.some(frame => frame.players.some((player, seat) => seat !== me && player.hand.length))) throw Error("本地文件未完成对手暗手脱敏。");
      data.replay.names = ["小淘气", "下家", "对家", "上家"];
      setFixture(data); setStep(Math.max(0, Math.min(data.replay.frames.length - 1, requestedFrame)));
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason.message ?? reason)); });
    return () => controller.abort();
  }, []);
  if (!fixture) return <main className="l164-loading"><History size={29} /><h1>164068 · 第2把</h1><p>{error || "正在读取小淘气的本地真实牌例…"}</p><p>同一张真实牌桌，使用修改前后的听牌函数计算。</p></main>;
  const replay = fixture.replay, frame = replay.frames[step], total = replay.frames.length;
  const before = analyze(fixture, step, selected, "before"), after = analyze(fixture, step, selected, "after");
  const same = before.hints.join(",") === after.hints.join(",");
  const isParallel = parallel && !compact;
  const current = after.current;
  const checkpoints = fixture.checkpoints ?? [
    { frame: 16, label: "碰九筒", description: "第一组明碰：九筒。三张由自己的两张九筒与上家打出的九筒组成。" },
    { frame: 26, label: "碰东风", description: "第二组明碰：东风。此时已有两组明碰，硬花仍为3朵。" },
    { frame: 74, label: "摸一万，选五万", discard: 18, description: "真实记录下一步打出五万。这里预选同一张五万，查看当时出牌前的听牌预览。" },
    { frame: 75, label: "打五万后", description: "打出五万后留下：一万、二万×3、三万、三筒、四筒。二筒与五筒是两面成牌；两明碰、3朵硬花不变。" },
    { frame: 122, label: "末轮仍为3花", description: "此后几轮保持同一手牌。直到末段打出东风，依然是两明碰、3朵硬花。" },
  ];
  const activeCheckpoint = [...checkpoints].reverse().find(point => point.frame <= step);
  const seek = (next: number, discard?: number) => { setStep(Math.max(0, Math.min(total - 1, next))); setSelected(discard); };
  const isOpen = current.melds.some(meld => meld.type === "pung" && !meld.concealed || meld.added);
  const belowFlowers = current.flowers.length < after.rules.minimumFlowers;
  const blockedShape = after.validShape && after.structural.length > 0 && !after.hints.length;
  const historicalAbsoluteMistake = before.hints.includes(10) && after.structural.includes(10) && after.structural.includes(13) && current.flowers.length === 3 && current.melds.length === 2;
  const comparisonText = after.ended ? "本把已结束。两种版本均停止展示听牌提示；可以退回打五万后的关键步骤继续对照。" : same
    ? before.hints.length ? "这一步两种算法结果相同。下方按真实记录说明花数与碰杠条件。" : "这一步两种算法均未显示听牌。前后结果按计算保留。"
    : historicalAbsoluteMistake
      ? `旧算法误把对家的二筒明碰当作「压绝」，显示${namesFor(before.hints)}。当前版本按实际两面听和3朵硬花判定，${after.hints.length ? `合法听口为${namesFor(after.hints)}` : "不显示听牌"}。`
      : `同一牌面重算：旧算法显示${before.hints.length ? namesFor(before.hints) : "无听口"}；当前版本${after.hints.length ? `合法听口为${namesFor(after.hints)}` : "没有合法听口"}。`;
  const reason = after.ended
    ? { title: "本把已经结束", text: "听牌提示仅在行牌期间展示。当前保留结束时的手牌与公开碰杠，可返回前面的关键步骤查看听牌计算。" }
    : blockedShape && isOpen && belowFlowers
    ? { title: "能凑成牌，还没有达到胡牌门槛", text: `${namesFor(after.structural)}可以补成完整牌形；这手已经开门，只有${current.flowers.length}朵硬花，普通开门胡需要${after.rules.minimumFlowers}朵。当前规则计算没有可用的豁免，因此不应提示听牌。` }
    : after.hints.length
      ? { title: "按这一手的实际规则，可以听牌", text: `合法听口：${namesFor(after.hints)}。牌桌提示由计分规则逐张核验；余牌仅扣除自己的手牌与公开牌。` }
      : !after.validShape
        ? { title: "先选要打出的牌", text: "在下方手牌中点选一张，查看打出后的结果。这是本地试算，不会改变原始记录。" }
        : { title: "当前没有合法听口", text: "这手牌按真实手牌、碰杠、花牌与本房规则计算，暂无符合条件的听口。" };
  return <main className={`l164-page polished classic${isParallel ? " l164-wide" : ""}`}>
    <header className="l164-header">
      <div><p className="l164-eyebrow"><History size={13} />真实牌例 · 听牌提示对照</p><h1>164068 · 第2把<span>小淘气的这一手</span></h1><p className="l164-subtitle">同一牌面核对历史算法与当前版本 · {ruleDisplayName(after.rules)} · 开局后 {time(frame.at)} · 第 {step + 1} / {total} 步</p></div>
      <div className="l164-provenance"><b>已结束记录 · 本地查看</b><span>小淘气手牌 + 公开牌面</span></div>
    </header>
    <nav className="l164-checkpoint-list" aria-label="真实记录关键步骤">{checkpoints.map((point, index) => <button key={point.frame} aria-current={activeCheckpoint?.frame === point.frame ? "step" : undefined} onClick={() => seek(point.frame, point.discard)}><span>{String(index + 1).padStart(2, "0")}</span>{point.label}</button>)}</nav>
    <div className="l164-workspace">
      <section className="l164-comparison" aria-label="听牌修改前后对照">
        <div className="l164-toolbar">
          <div className="l164-tabs" role="tablist" aria-label="查看版本">{(["before", "after"] as const).map(value => <button key={value} role="tab" aria-selected={version === value} onClick={() => setVersion(value)}>{value === "before" ? "旧算法（修正前）" : "当前版本"}{version === value && <Check size={12} />}</button>)}</div>
          <div className="l164-layout-toggle" aria-label="对照方式"><button aria-label="单桌切换" aria-pressed={!isParallel} onClick={() => setParallel(false)}><PanelTop size={15} /></button><button aria-label="并排对照" aria-pressed={isParallel} onClick={() => setParallel(true)}><Columns2 size={15} /></button></div>
        </div>
        <div className={`l164-grid${isParallel ? " parallel" : ""}`}>
          {(isParallel ? ["before", "after"] as const : [version]).map(value => <Board key={value} fixture={fixture} step={step} selected={selected} version={value} />)}
        </div>
        <div className="l164-same"><ShieldCheck size={15} /><span>{comparisonText}</span></div>
        <section className="l164-hand-picker" aria-label="放大查看小淘气手牌">
          <header><h2>{after.ended ? "结束时手牌" : current.hand.length % 3 === 2 ? "点选手牌 · 查看打出后的听口" : "此时手牌"}</h2><span>{current.hand.length} 张{after.discard !== undefined ? ` · 本地试算打${tileName(after.discard)}` : " · 与桌面同步"}</span></header>
          <div className="l164-hand-tiles">{[...current.hand].sort((a, b) => kind(a) - kind(b) || a - b).map(tile => <button key={tile} aria-label={`${tileName(tile)}${!after.ended && current.hand.length % 3 === 2 ? "，点选试算打出" : ""}`} aria-pressed={selected === tile} disabled={after.ended || current.hand.length % 3 !== 2} onClick={() => setSelected(selected === tile ? undefined : tile)}><Tile tile={tile} /></button>)}</div>
          <p>{activeCheckpoint?.frame === step && activeCheckpoint.description || `花牌：${current.flowers.map(tileName).join("、") || "无"}。当前${current.melds.length}组碰杠，${current.flowers.length}朵硬花。`}</p>
        </section>
        <div className="l164-timeline"><button aria-label="上一步" disabled={step === 0} onClick={() => seek(step - 1)}><ChevronLeft size={17} /></button><input aria-label="原始记录步骤" type="range" min={0} max={total - 1} value={step} onChange={event => seek(Number(event.target.value))} /><button aria-label="下一步" disabled={step === total - 1} onClick={() => seek(step + 1)}><ChevronRight size={17} /></button><span>{step + 1} / {total} 步</span></div>
      </section>
      <aside className="l164-facts" aria-label="小淘气当前牌面说明">
        <div className="l164-facts-heading"><span>小淘气 · 当前牌面</span><h2>{current.melds.length} 组碰杠，{current.flowers.length} 朵硬花</h2><p>{isOpen ? "已经开门" : "此时未开门"} · 以本把实际规则判定</p></div>
        <dl className="l164-flower-meter"><div><dt><Flower2 size={10} /> 现有硬花</dt><dd><b>{current.flowers.length}</b>朵</dd></div><div><dt>普通开门门槛</dt><dd><span>{after.rules.minimumFlowers}</span>朵</dd></div></dl>
        <ol className="l164-meld-list">{current.melds.map((meld, index) => <li key={index}><span className="l164-meld-number">{index + 1}</span><div><strong>{tileName(meld.tiles[0])} · {meld.type === "pung" ? "碰" : meld.concealed ? "暗杠" : meld.added ? "补杠" : "明杠"}</strong><small>{meld.concealed ? "自己集齐" : `${replay.names[meld.from]}供牌`} · {meld.tiles.length}张</small></div><span className="l164-meld-tag">{meld.type === "pung" ? "碰" : "杠"}</span></li>)}</ol>
        {!current.melds.length && <p className="l164-no-melds">这一刻还没有碰杠。</p>}
        <div className="l164-explanation"><strong>{reason.title}</strong><p>{reason.text}</p></div>
        <section className="l164-legal" aria-label="当前版本合法听口"><h3>当前版本 · 合法听口</h3>{after.hints.length ? <div className="l164-legal-tiles">{after.hints.map(value => <div key={value}><Tile tile={value * 4} /><span>未见 {after.unseen[value]} 张</span></div>)}</div> : <p>{after.ended ? "本把已结束，停止听牌提示" : `暂无${blockedShape ? ` · ${namesFor(after.structural)}仅满足成牌结构` : ""}`}</p>}</section>
      </aside>
    </div>
    <p className="l164-note">硬花按当时已经补出的花牌计算。大胡、门清等是否豁免由本房计分规则判断。未见张数包含他人暗手，不能当作牌墙存量。</p>
    <p className="l164-note">旧算法取自修正提交 5d34034 的前一版（8b1c03f）。本页用同一真实牌面重算；原记录未保存当时客户端版本或屏幕提示，不能据此确定当时设备实际显示了什么。</p>
    <footer className="l164-footer"><span>真实 Cocos 牌桌与听牌提示组件 · 所有操作仅在本地回放</span><span>164068 / 第2把 / 小淘气</span></footer>
  </main>;
}

document.documentElement.dataset.runtime = "web";
const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
