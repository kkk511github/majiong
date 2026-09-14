import {
  createWall,
  kind,
  sortTiles,
  tileName,
  isFlower,
  counts,
  secureShuffleRandom,
  type ShuffleRandom,
} from "./tiles";
import { scoreHand, type WinContext } from "./scoring";
import { chargeOvertime } from "./timing";
import { captureReplay } from "./replay";
import {
  DEFAULT_RULES,
  type Action,
  type Claim,
  type Game,
  type Player,
  type Result,
  type Rules,
  type Seat,
  type Tile,
  type View,
} from "./types";

const clone = <T>(value: T): T =>
  typeof globalThis.structuredClone === "function"
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));

export const seats = [0, 1, 2, 3] as Seat[];
const next = (s: Seat) => ((s + 1) % 4) as Seat;
export function newPlayer(
  id: string,
  name: string,
  bot = false,
  initialScore = 90,
): Player {
  return {
    id,
    name,
    bot,
    ready: bot,
    online: true,
    trustee: bot,
    hand: [],
    flowers: [],
    melds: [],
    discards: [],
    score: initialScore,
    passedHu: false,
    passedPung: [],
  };
}
export function normalizeRules(input: Partial<Rules> = {}): Rules {
  return {
    ...DEFAULT_RULES,
    ...(typeof input.flowerDouble === "boolean"
      ? { flowerDouble: input.flowerDouble }
      : {}),
    ...(typeof input.seaBottom === "boolean"
      ? { seaBottom: input.seaBottom }
      : {}),
    ...(typeof input.twoBankrupt === "boolean"
      ? { twoBankrupt: input.twoBankrupt }
      : {}),
    ...(typeof input.protectWinner === "boolean"
      ? { protectWinner: input.protectWinner }
      : {}),
    rounds: [4, 8, 12, 16].includes(input.rounds!) ? input.rounds! : 4,
    turnSeconds:
      Number.isInteger(input.turnSeconds) &&
      (input.turnSeconds === 0 ||
        (input.turnSeconds! >= 10 && input.turnSeconds! <= 300))
        ? input.turnSeconds!
        : 30,
  };
}
export function createGame(
  code: string,
  id: string,
  rules: Partial<Rules> = {},
): Game {
  return {
    version: 1,
    id,
    code,
    ownerId: null,
    initialScore: 90,
    scoreDivisor: 2,
    rules: normalizeRules(rules),
    phase: "waiting",
    players: [null, null, null, null],
    wall: [],
    dealer: 0,
    turn: 0,
    round: 0,
    canSelfWin: false,
    deadline: 0,
    revision: 0,
    roundStartScores: [90, 90, 90, 90],
    roundTransfers: [],
    history: [],
    events: [],
  };
}
function note(g: Game, message: string) {
  g.events = [...g.events.slice(-19), message];
}
function clock(g: Game, now: number) {
  g.overtimeCharged = [];
  for (const p of g.players) if (p) p.resumedDeadline = undefined;
  g.deadline = g.rules.turnSeconds ? now + g.rules.turnSeconds * 1000 : 0;
}
function remove(p: Player, tiles: Tile[]) {
  if (
    new Set(tiles).size !== tiles.length ||
    tiles.some((t) => !p.hand.includes(t))
  )
    throw Error("手牌中没有这张牌");
  p.hand = p.hand.filter((t) => !tiles.includes(t));
}
function finish(g: Game, result: Result, now: number) {
  g.phase =
    g.round >= g.rules.rounds ||
    result.reason === "dissolved" ||
    result.reason === "bankrupt" ||
    result.bankrupt ||
    bankrupt(g)
      ? "finished"
      : "ended";
  if (g.table && (result.bankrupt || bankrupt(g)))
    g.table.endReason = "两家归零，本桌结束";
  g.pending = undefined;
  g.deadline = 0;
  g.result = result;
  g.dissolve = undefined;
  result.deltas = g.players.map(
    (p, i) => (p?.score ?? 0) - g.roundStartScores[i],
  );
  result.transfers =
    g.roundTransfers === undefined ? undefined : clone(g.roundTransfers);
  captureReplay(g, "finish", now);
  g.history.push({
    replayAvailable:
      g.replay?.id === `${g.id}-${g.round}` && !!g.replay.endedAt,
    hands: g.players.map((p) => ({
      hand: clone(p?.hand ?? []),
      melds: clone(p?.melds ?? []),
      flowers: clone(p?.flowers ?? []),
    })),
    id: `${g.id}-${g.round}`,
    at: now,
    round: g.round,
    result: clone(result),
    names: g.players.map((p) => p?.name ?? "空位"),
    scores: g.players.map((p) => p?.score ?? 0),
    initialScore: g.initialScore ?? 0,
    settlementBase: g.settlementBase ?? g.initialScore ?? 0,
    scoreDivisor: g.scoreDivisor ?? 1,
    playerIds: g.players.map((p) => p?.id ?? ""),
    totalRounds: g.rules.rounds,
    tableName: g.table?.settings.name ?? "南京好友桌",
  });
  g.players.forEach((p) => {
    if (p) p.ready = p.bot;
  });
  note(
    g,
    result.reason === "draw"
      ? g.rules.seaBottom
        ? "牌墙已摸完，本局流局"
        : "牌墙剩余 16 张，本局流局"
      : result.reason === "bankrupt"
        ? "两家归零，本桌结束"
        : result.reason === "dissolved"
          ? "牌桌已解散"
          : "本局结束",
  );
}
function transfer(
  g: Game,
  from: Seat,
  to: Seat,
  amount: number,
  reason: NonNullable<Result["transfers"]>[number]["reason"],
) {
  if (g.rules.twoBankrupt)
    amount = Math.min(amount, Math.max(0, g.players[from]!.score));
  if (amount <= 0) return;
  g.players[from]!.score -= amount;
  g.players[to]!.score += amount;
  // Legacy in-progress games omit the ledger until their next round begins.
  g.roundTransfers?.push({ from, to, amount, reason });
}
function bankrupt(g: Game): boolean {
  return (
    !!g.rules.twoBankrupt &&
    g.players.filter((p) => p && p.score <= 0).length >= 2
  );
}
function finishBankrupt(g: Game, now: number): boolean {
  if (!bankrupt(g)) return false;
  finish(g, { reason: "bankrupt", winners: [], details: {}, deltas: [] }, now);
  return true;
}
function winContext(g: Game, tile?: Tile): WinContext {
  return {
    tile,
    winTile: tile === undefined ? g.lastDraw : undefined,
    replacement: tile === undefined ? g.replacement?.type : undefined,
    directKong: g.replacement?.direct,
    seaBottom: !!g.rules.seaBottom && tile === undefined && g.wall.length <= 4,
    visiblePungs: g.players.flatMap(
      (p) =>
        p?.melds
          .filter((m) => m.type === "pung")
          .map((m) => kind(m.tiles[0])) ?? [],
    ),
  };
}
function flowersKong(g: Game, seat: Seat, t: Tile, initial: boolean) {
  const p = g.players[seat]!,
    k = kind(t);
  const set =
    k <= 33
      ? p.flowers.filter((f) => kind(f) === k)
      : p.flowers.filter((f) =>
          k <= 37 ? kind(f) >= 34 && kind(f) <= 37 : kind(f) >= 38,
        );
  if (set.length === 4) {
    for (const other of seats)
      if (other !== seat) transfer(g, other, seat, 12, "花杠");
    note(g, `${p.name} 花杠，每家 12 分${initial ? "（起手）" : ""}`);
  }
}
function draw(
  g: Game,
  seat: Seat,
  now: number,
  replacement = false,
  initial = false,
): boolean {
  const p = g.players[seat]!;
  if (finishBankrupt(g, now)) return false;
  if (!replacement) g.replacement = undefined;
  while (g.wall.length > (g.rules.seaBottom ? 0 : 16) || initial) {
    const t = replacement ? g.wall.pop() : g.wall.shift();
    if (t === undefined) break;
    if (isFlower(t)) {
      p.flowers.push(t);
      flowersKong(g, seat, t, initial);
      if (!initial) captureReplay(g, "flower", now, seat, t);
      if (finishBankrupt(g, now)) return false;
      replacement = true;
      if (g.replacement?.type !== "kong") g.replacement = { type: "flower" };
      continue;
    }
    p.hand.push(t);
    sortTiles(p.hand);
    g.lastDraw = t;
    g.turn = seat;
    g.canSelfWin = true;
    clock(g, now);
    if (!initial) captureReplay(g, "draw", now, seat, t);
    return true;
  }
  finish(g, { reason: "draw", winners: [], details: {}, deltas: [] }, now);
  return false;
}
export function startRound(
  source: Game,
  now = Date.now(),
  random: ShuffleRandom = secureShuffleRandom,
): Game {
  if (
    !["waiting", "ended"].includes(source.phase) ||
    source.players.some((p) => !p?.ready)
  )
    throw Error("需要四位玩家全部准备");
  const g = clone(source);
  if (
    g.round > 0 &&
    g.result?.reason !== "draw" &&
    !g.result?.winners.includes(g.dealer)
  )
    g.dealer = next(g.dealer);
  if (g.table) g.table.readyDeadline = undefined;
  g.round++;
  g.replay = {
    version: 1,
    id: `${g.id}-${g.round}`,
    code: g.code,
    round: g.round,
    startedAt: now,
    names: g.players.map((p) => p?.name ?? "空位"),
    frames: [],
  };
  g.phase = "playing";
  g.wall = createWall(random);
  g.pending = undefined;
  g.result = undefined;
  g.lastDiscard = undefined;
  g.replacement = undefined;
  g.dissolve = undefined;
  g.events = [];
  g.roundStartScores = g.players.map((p) => p!.score);
  g.roundTransfers = [];
  for (const p of g.players)
    Object.assign(p!, {
      hand: [],
      flowers: [],
      melds: [],
      discards: [],
      passedHu: false,
      passedPung: [],
      ready: false,
    });
  for (let n = 0; n < 13; n++)
    for (let j = 0; j < 4; j++)
      if (!draw(g, ((g.dealer + j) % 4) as Seat, now, false, true)) {
        g.revision++;
        return g;
      }
  if (!draw(g, g.dealer, now, false, true)) {
    g.revision++;
    return g;
  }
  g.replacement = undefined;
  g.revision++;
  note(g, `第 ${g.round} 局 · ${g.players[g.dealer]!.name} 坐庄`);
  captureReplay(g, "start", now);
  return g;
}
export function selfKongs(g: Game, seat: Seat): Tile[] {
  if (
    g.phase !== "playing" ||
    g.turn !== seat ||
    g.wall.length <= (g.rules.seaBottom ? 0 : 16)
  )
    return [];
  const p = g.players[seat]!,
    c = counts(p.hand);
  return p.hand.filter(
    (t) =>
      (c[kind(t)] === 4 && t === p.hand.find((a) => kind(a) === kind(t))) ||
      p.melds.some((m) => m.type === "pung" && kind(m.tiles[0]) === kind(t)),
  );
}
function settle(
  g: Game,
  winners: Seat[],
  from: Seat | undefined,
  now: number,
  robbed = false,
) {
  const result: Result = {
    winningTile: from === undefined ? g.lastDraw : g.pending?.tile,
    reason: "hu",
    winners,
    from,
    details: {},
    deltas: [],
  };
  const bills: {
    from: Seat;
    to: Seat;
    amount: number;
    reason: NonNullable<Result["transfers"]>[number]["reason"];
  }[] = [];
  const bill = (
    from: Seat,
    to: Seat,
    amount: number,
    reason: NonNullable<Result["transfers"]>[number]["reason"],
  ) => bills.push({ from, to, amount, reason });
  for (const seat of winners) {
    const p = g.players[seat]!;
    const score = scoreHand(
      p,
      g.rules,
      winContext(g, from === undefined ? undefined : g.pending!.tile),
    );
    if (!score) throw Error("当前牌型还不能胡牌");
    result.details[seat] = score;
    // Three exposed groups from one player establish responsibility for a fourth-group all-triplets hand.
    const responsibility = seats.find(
      (s) =>
        s !== seat &&
        p.melds.length === 4 &&
        p.melds.filter((m) => !m.concealed && m.from === s).length >= 3,
    );
    if (responsibility !== undefined)
      bill(responsibility, seat, score.total * 3, "三口承包");
    else if (from !== undefined)
      bill(
        from,
        seat,
        score.total * (robbed ? 3 : 1),
        robbed ? "抢杠包三家" : "点炮",
      );
    else if (
      g.replacement?.type === "kong" &&
      g.replacement.direct &&
      g.replacement.from !== undefined
    )
      bill(g.replacement.from, seat, score.total * 3, "杠开包三家");
    else
      for (const other of seats)
        if (other !== seat) bill(other, seat, score.total, "自摸");
    note(
      g,
      `${p.name} ${from === undefined ? "自摸" : robbed ? "抢杠胡" : "胡牌"} · ${score.total} 分`,
    );
  }
  for (const payer of seats) {
    const due = bills.filter((b) => b.from === payer),
      total = due.reduce((n, b) => n + b.amount, 0);
    const available = g.rules.twoBankrupt
      ? Math.max(0, g.players[payer]!.score)
      : total;
    if (total > available) {
      const split = due.map((b) => ({
        ...b,
        exact: (b.amount * available) / total,
        amount: Math.floor((b.amount * available) / total),
      }));
      let remainder = available - split.reduce((n, b) => n + b.amount, 0);
      split.sort(
        (a, b) =>
          b.exact - b.amount - (a.exact - a.amount) ||
          ((a.to - payer + 4) % 4) - ((b.to - payer + 4) % 4),
      );
      for (const b of split)
        if (remainder > 0) {
          b.amount++;
          remainder--;
        }
      for (const b of split) transfer(g, b.from, b.to, b.amount, b.reason);
    } else for (const b of due) transfer(g, b.from, b.to, b.amount, b.reason);
  }
  result.bankrupt = bankrupt(g);
  if (result.bankrupt && g.rules.protectWinner) {
    // User-confirmed: the finishing winner is topped up to 100 points (user-confirmed fixed target, initial stake remains 90).
    for (const winner of winners) {
      const missing = Math.max(0, 100 - g.players[winner]!.score);
      const donor = seats
        .filter((s) => s !== winner)
        .sort((a, b) => g.players[b]!.score - g.players[a]!.score || a - b)[0];
      if (missing > 0 && g.players[donor]!.score > g.players[winner]!.score) {
        transfer(g, donor, winner, missing, "保米");
        note(
          g,
          `${g.players[winner]!.name} 保米补到 100 分，由 ${g.players[donor]!.name} 补 ${missing} 分`,
        );
      }
    }
  }
  finish(g, result, now);
}
function offerClaims(
  g: Game,
  from: Seat,
  tile: Tile,
  robbed: boolean,
  now: number,
): boolean {
  const offers: NonNullable<Game["pending"]>["offers"] = {};
  for (const seat of seats)
    if (seat !== from) {
      const p = g.players[seat]!,
        options: Claim[] = [];
      if (!p.passedHu && scoreHand(p, g.rules, winContext(g, tile)))
        options.push("hu");
      const c = p.hand.filter((t) => kind(t) === kind(tile)).length;
      if (!robbed && !p.passedPung.includes(kind(tile))) {
        if (c >= 3 && g.wall.length > (g.rules.seaBottom ? 0 : 16))
          options.push("kong");
        if (c >= 2) options.push("pung");
      }
      if (options.length) offers[seat] = [...options, "pass"];
    }
  if (!Object.keys(offers).length) return false;
  g.phase = "claiming";
  g.pending = {
    openedAtRevision: g.revision + 1,
    tile,
    from,
    kind: robbed ? "robKong" : "discard",
    offers,
    replies: {},
  };
  clock(g, now);
  return true;
}
function completeAddedKong(g: Game, from: Seat, tile: Tile, now: number) {
  const p = g.players[from]!,
    meld = p.melds.find(
      (m) => m.type === "pung" && kind(m.tiles[0]) === kind(tile),
    )!;
  remove(p, [tile]);
  meld.tiles.push(tile);
  meld.type = "kong";
  transfer(g, meld.from, from, 12, "补杠");
  g.phase = "playing";
  g.pending = undefined;
  g.replacement = { type: "kong", from: meld.from, direct: true };
  note(g, `${p.name} 补杠 ${tileName(tile)}`);
  captureReplay(g, "addedKong", now, from, tile);
  draw(g, from, now, true);
}
function resolveClaims(g: Game, now: number) {
  const pending = g.pending!;
  if (
    Object.keys(pending.offers).some(
      (s) => pending.replies[Number(s) as Seat] === undefined,
    )
  )
    return;
  const winners = seats.filter((s) => pending.replies[s] === "hu");
  if (winners.length) {
    settle(g, winners, pending.from, now, pending.kind === "robKong");
    return;
  }
  if (pending.kind === "robKong") {
    completeAddedKong(g, pending.from, pending.tile, now);
    return;
  }
  const chosen = seats
    .filter((s) => ["kong", "pung"].includes(pending.replies[s] ?? ""))
    .sort(
      (a, b) => ((a - pending.from + 4) % 4) - ((b - pending.from + 4) % 4),
    )[0];
  g.pending = undefined;
  g.phase = "playing";
  if (chosen === undefined) {
    draw(g, next(pending.from), now);
    return;
  }
  const p = g.players[chosen]!,
    isKong = pending.replies[chosen] === "kong";
  const tiles = p.hand
    .filter((t) => kind(t) === kind(pending.tile))
    .slice(0, isKong ? 3 : 2);
  remove(p, tiles);
  p.melds.push({
    type: isKong ? "kong" : "pung",
    tiles: [...tiles, pending.tile],
    from: pending.from,
    concealed: false,
  });
  g.players[pending.from]!.discards.pop();
  g.turn = chosen;
  g.canSelfWin = false;
  g.lastDraw = undefined;
  g.replacement = undefined;
  note(g, `${p.name} ${isKong ? "杠" : "碰"} ${tileName(pending.tile)}`);
  if (isKong) {
    transfer(g, pending.from, chosen, 12, "直杠");
    captureReplay(g, "kong", now, chosen, pending.tile);
    g.replacement = { type: "kong", from: pending.from, direct: true };
    draw(g, chosen, now, true);
  } else {
    clock(g, now);
    captureReplay(g, "pung", now, chosen, pending.tile);
  }
}
export function act(
  source: Game,
  seat: Seat,
  action: Action,
  now = Date.now(),
): Game {
  if (!seats.includes(seat) || !source.players[seat])
    throw Error("你不在牌桌中");
  const g = clone(source),
    p = g.players[seat]!;
  chargeOvertime(g, seat, now);
  if (g.phase === "claiming") {
    const pending = g.pending!;
    if (
      !["hu", "kong", "pung", "pass"].includes(action.type) ||
      !pending.offers[seat]?.includes(action.type as Claim) ||
      pending.replies[seat] !== undefined
    )
      throw Error("该操作已失效");
    pending.replies[seat] = action.type as Claim;
    if (action.type !== "hu" && pending.offers[seat]!.includes("hu"))
      p.passedHu = true;
    if (action.type === "pass" && pending.offers[seat]!.includes("pung"))
      p.passedPung.push(kind(pending.tile));
    captureReplay(
      g,
      action.type === "pass" ? "pass" : "claim",
      now,
      seat,
      pending.tile,
    );
    resolveClaims(g, now);
  } else {
    if (g.phase !== "playing" || g.turn !== seat) throw Error("还没轮到你操作");
    if (action.type === "discard") {
      if (!Number.isInteger(action.tile) || !p.hand.includes(action.tile))
        throw Error("请选择手中的牌");
      remove(p, [action.tile]);
      p.discards.push(action.tile);
      p.passedHu = false;
      p.passedPung = [];
      g.lastDiscard = { tile: action.tile, seat };
      g.lastDraw = undefined;
      g.canSelfWin = false;
      note(g, `${p.name} 打出 ${tileName(action.tile)}`);
      captureReplay(g, "discard", now, seat, action.tile);
      if (!offerClaims(g, seat, action.tile, false, now))
        draw(g, next(seat), now);
    } else if (action.type === "hu") {
      if (!g.canSelfWin) throw Error("当前不能自摸");
      settle(g, [seat], undefined, now);
    } else if (action.type === "selfKong") {
      if (!selfKongs(g, seat).includes(action.tile))
        throw Error("当前不能杠这张牌");
      const tiles = p.hand.filter((t) => kind(t) === kind(action.tile));
      if (tiles.length === 4) {
        remove(p, tiles);
        p.melds.push({ type: "kong", tiles, from: seat, concealed: true });
        for (const other of seats)
          if (other !== seat) transfer(g, other, seat, 6, "暗杠");
        g.replacement = { type: "kong", direct: false };
        note(g, `${p.name} 暗杠`);
        captureReplay(g, "concealedKong", now, seat, action.tile);
        draw(g, seat, now, true);
      } else if (!offerClaims(g, seat, action.tile, true, now))
        completeAddedKong(g, seat, action.tile, now);
    } else throw Error("当前不能执行这个操作");
  }
  g.revision++;
  return g;
}
export function viewFor(g: Game, me: Seat): View {
  const {
    wall,
    players,
    pending,
    lastDraw,
    replacement,
    canSelfWin,
    replay: _replay,
    ...rest
  } = g;
  const reveal = ["ended", "finished"].includes(g.phase);
  return clone({
    ...rest,
    me,
    remaining: wall.length,
    players: players.map((p, seat) => {
      if (!p) return null;
      const { passedHu, passedPung, hand, ...visible } = p;
      return {
        ...visible,
        handCount: hand.length,
        hand: seat === me || reveal ? hand : [],
        melds: p.melds.map((m) =>
          m.concealed && seat !== me && !reveal ? { ...m, tiles: [] } : m,
        ),
      };
    }),
    pending: pending
      ? {
          tile: pending.tile,
          from: pending.from,
          kind: pending.kind,
          answered: pending.replies[me] !== undefined,
        }
      : undefined,
    actions:
      g.phase === "claiming"
        ? pending!.replies[me] === undefined
          ? (pending!.offers[me] ?? [])
          : []
        : g.phase === "playing" &&
            g.turn === me &&
            canSelfWin &&
            scoreHand(players[me]!, g.rules, winContext(g))
          ? ["hu"]
          : [],
    selfKongs: selfKongs(g, me),
    canDiscard: g.phase === "playing" && g.turn === me,
    lastDraw: g.turn === me ? lastDraw : undefined,
  });
}
export function botAction(g: Game, seat: Seat): Action | null {
  const v = viewFor(g, seat),
    p = g.players[seat]!;
  if (v.actions.includes("hu")) return { type: "hu" };
  if (v.actions.includes("kong")) return { type: "kong" };
  if (v.actions.includes("pung")) return { type: "pung" };
  if (v.actions.includes("pass")) return { type: "pass" };
  if (!v.canDiscard) return null;
  if (v.selfKongs.length) return { type: "selfKong", tile: v.selfKongs[0] };
  const c = counts(p.hand);
  const value = (t: Tile) => {
    const k = kind(t);
    let score = c[k] >= 3 ? 10 : c[k] === 2 ? 6 : 0;
    if (k < 27)
      for (const d of [-2, -1, 1, 2])
        if (Math.floor((k + d) / 9) === Math.floor(k / 9))
          score += (c[k + d] ?? 0) * (Math.abs(d) === 1 ? 2 : 1);
    return score;
  };
  const tile = [...p.hand].sort((a, b) => value(a) - value(b) || b - a)[0];
  return { type: "discard", tile };
}
export function dissolveGame(source: Game, now = Date.now()): Game {
  const g = clone(source);
  if (g.phase === "ended" && g.result) {
    g.phase = "finished";
    g.result = { ...g.result, reason: "dissolved" };
    g.dissolve = undefined;
    g.deadline = 0;
  } else {
    finish(
      g,
      { reason: "dissolved", winners: [], details: {}, deltas: [] },
      now,
    );
  }
  g.revision++;
  return g;
}
