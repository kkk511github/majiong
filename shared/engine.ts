import {
  canDeclareZhaozhi,
  recordGlobalAnchor,
  globalLiability,
} from "./reference-rules";
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
import { structuralWaits, threeMouths } from "./scoring-nanjing";
import {
  flowerFactor,
  isGarden,
  isNanjingB,
  isNanjingV2,
  nanjingValues,
  ruleDefaults,
} from "./nanjing-rules";
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
    externalScore: 0,
    passedHu: false,
    passedPung: [],
  };
}
export function normalizeRules(input: Partial<Rules> = {}): Rules {
  const base = ruleDefaults(input.id ?? "nj-casual-v1");
  return {
    ...base,
    ...(isNanjingV2(base)
      ? {
          biXiaHu: ["off", "next", "cumulative"].includes(input.biXiaHu ?? "")
            ? input.biXiaHu
            : base.biXiaHu,
          ...Object.fromEntries(
            [
              "doubleSidePayments",
              "successorDouble",
              "fourWinds",
              "discardPenalties",
            ]
              .filter((key) => typeof input[key as keyof Rules] === "boolean")
              .map((key) => [key, input[key as keyof Rules]]),
          ),
        }
      : {}),
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
    ...(isNanjingB(base) ? { flowerDouble: true, twoBankrupt: true } : {}),
    rounds: [4, 8, 12, 16].includes(input.rounds!) ? input.rounds! : base.rounds,
    turnSeconds:
      Number.isInteger(input.turnSeconds) &&
      (input.turnSeconds === 0 ||
        (input.turnSeconds! >= 10 && input.turnSeconds! <= 300))
        ? input.turnSeconds!
        : base.turnSeconds,
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
    ...(isNanjingB({ id: rules.id ?? "nj-casual-v1" }) ? { settlementBase: 100 } : {}),
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
function flushConcealed(g: Game, exempt: Seat[] = []) {
  const pending = g.ruleState?.deferredConcealed ?? [];
  if (g.ruleState) g.ruleState.deferredConcealed = [];
  payBills(
    g,
    pending.filter((b) => !exempt.includes(b.to)),
  );
}
function finish(g: Game, result: Result, now: number) {
  flushConcealed(g);
  finishNanjingRound(g, result);
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
  result.externalDeltas = g.players.map(
    (p, i) => (p?.externalScore ?? 0) - (g.roundStartExternalScores?.[i] ?? 0),
  );
  result.transfers =
    g.roundTransfers === undefined ? undefined : clone(g.roundTransfers);
  captureReplay(g, "finish", now);
  g.history.push({
    rules: clone(g.rules),
    multiplier: g.ruleState?.multiplier ?? 1,
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
    externalScores: g.players.map((p) => p?.externalScore ?? 0),
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
/** Garden external liability is a separate, uncapped ledger, not table chips. */
function transferExternal(g: Game, entry: Bill) {
  const payer = g.players[entry.from]!,
    winner = g.players[entry.to]!;
  const debit = (payer.externalScore ?? 0) - entry.amount;
  const credit = (winner.externalScore ?? 0) + entry.amount;
  if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit))
    throw Error("桌外记分超出安全范围");
  payer.externalScore = debit;
  winner.externalScore = credit;
  g.roundTransfers?.push({ ...entry, scope: "external" });
}
/** Top up the players whose winning hand or kong ended the table. */
function protectFinishers(g: Game, winners: Seat[]) {
  if (g.rules.protectWinner) {
    // User-confirmed: the finishing winner is topped up to 100 points (user-confirmed fixed target, initial stake remains 90).
    for (const winner of winners) {
      if (isNanjingV2(g.rules)) {
        for (const donor of seats
          .filter((s) => s !== winner)
          .sort((a, b) => g.players[b]!.score - g.players[a]!.score || a - b)) {
          const missing = Math.max(0, 100 - g.players[winner]!.score),
            amount = Math.min(
              missing,
              Math.max(
                0,
                g.players[donor]!.score - (winners.includes(donor) ? 100 : 0),
              ),
            );
          if (amount > 0) {
            transfer(g, donor, winner, amount, "保米");
            note(
              g,
              `${g.players[winner]!.name} 保米，由 ${g.players[donor]!.name} 补 ${amount} 分`,
            );
          }
        }
        continue;
      }
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
}
function finishBankrupt(g: Game, now: number, kongRecipient?: Seat): boolean {
  if (!bankrupt(g)) return false;
  if (kongRecipient !== undefined) protectFinishers(g, [kongRecipient]);
  finish(g, { reason: "bankrupt", winners: [], details: {}, deltas: [] }, now);
  return true;
}
type Bill = NonNullable<Result["transfers"]>[number];
/** Settle a simultaneous set of debts from opening balances, with deterministic penny allocation. */
function payBills(g: Game, bills: Bill[]) {
  const opening = g.players.map((p) => p!.score);
  const paid: Bill[] = [];
  for (const payer of seats) {
    const due = bills.filter(
      (b) => b.from === payer && b.to !== payer && b.amount > 0,
    );
    const total = due.reduce((sum, b) => sum + b.amount, 0);
    if (!Number.isSafeInteger(total)) throw Error("牌局计分超出安全范围");
    const available = g.rules.twoBankrupt
      ? Math.min(total, Math.max(0, opening[payer]))
      : total;
    const split = due.map((b) => ({
      ...b,
      exact: total ? (b.amount / total) * available : 0,
      amount:
        total > available
          ? Math.floor((b.amount / total) * available)
          : b.amount,
    }));
    let remainder = available - split.reduce((sum, b) => sum + b.amount, 0);
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
    paid.push(...split.map(({ exact, ...b }) => b));
  }
  for (const b of paid) transfer(g, b.from, b.to, b.amount, b.reason);
}
function sideAmount(g: Game, flowers: number) {
  return sidePoints(g, flowers * flowerFactor(g.rules));
}
/** Immediate kong points are separate from flowers in a winning hand. */
function sidePoints(g: Game, points: number) {
  const amount =
    points *
    (g.rules.doubleSidePayments ? (g.ruleState?.multiplier ?? 1) : 1);
  if (!Number.isSafeInteger(amount)) throw Error("牌局计分超出安全范围");
  return amount;
}
function flagNext(g: Game, reason: string) {
  if (g.ruleState && !g.ruleState.nextReasons.includes(reason))
    g.ruleState.nextReasons.push(reason);
}
function finishNanjingRound(g: Game, result: Result) {
  const state = g.ruleState;
  if (!isNanjingV2(g.rules) || !state) return;
  if (result.reason === "draw") flagNext(g, "流局");
  if (result.winners.includes(g.dealer)) flagNext(g, "庄家胡牌");
  if (Object.values(result.details).some((s) => s?.major)) flagNext(g, "大胡");
  if (result.winners.length > 1) flagNext(g, "一炮多响");
  if (
    Object.values(result.details).some((s) =>
      s?.items.some((i) => i.label === "海底捞月"),
    )
  )
    flagNext(g, "海底捞月");
  if (
    g.roundTransfers?.some((t) =>
      [
        "三口承包",
        "杠开包三家",
        "抢杠包三家",
        "清一色承包",
        "全球独钓承包",
      ].includes(t.reason),
    )
  )
    flagNext(g, "包牌");
  state.keepDealer = state.nextReasons.length > 0;
  if (!state.keepDealer && result.reason === "hu" && g.rules.successorDouble)
    flagNext(g, "接庄");
  const mode = g.rules.biXiaHu ?? "next";
  state.nextMultiplier =
    mode === "off" || !state.nextReasons.length
      ? 1
      : mode === "cumulative"
        ? state.multiplier * 2
        : 2;
  if (!Number.isSafeInteger(state.nextMultiplier))
    throw Error("牌局倍率超出安全范围");
}
/** Complete the initial deal before replacing flowers, in dealer-relative rounds. */
function dealNanjing(g: Game, now: number): boolean {
  const order = seats.map((s) => ((g.dealer + s) % 4) as Seat);
  for (let n = 0; n < 13; n++)
    for (const s of order) g.players[s]!.hand.push(g.wall.shift()!);
  const dealerTile = g.wall.shift()!;
  g.players[g.dealer]!.hand.push(dealerTile);
  let dealerLast: Tile = dealerTile;
  let replacing = true;
  let stoppedPayments = bankrupt(g);
  while (replacing) {
    replacing = false;
    for (const s of order) {
      const p = g.players[s]!,
        flowers = p.hand.filter(isFlower);
      p.hand = p.hand.filter((t) => !isFlower(t));
      for (const t of flowers) {
        p.flowers.push(t);
        if (!stoppedPayments) {
          flowersKong(g, s, t, true);
          stoppedPayments = bankrupt(g);
        }
      }
      const target = s === g.dealer ? 14 : 13;
      while (p.hand.length < target) {
        const t = g.wall.pop();
        if (t === undefined) throw Error("起手补花牌墙不足");
        p.hand.push(t);
        if (s === g.dealer) dealerLast = t;
        if (isFlower(t)) replacing = true;
      }
    }
  }
  for (const s of order) {
    sortTiles(g.players[s]!.hand);
    if (s !== g.dealer) {
      const waits = structuralWaits(g.players[s]!);
      if (waits.length) g.ruleState!.heavenlyWaits[s] = waits;
    }
  }
  g.turn = g.dealer;
  g.lastDraw = dealerLast;
  g.canSelfWin = true;
  clock(g, now);
  return !finishBankrupt(g, now);
}
function preservesHeavenlyWait(
  g: Game,
  seat: Seat,
  tile: Tile,
  external = false,
): boolean {
  const previous = g.ruleState?.heavenlyWaits[seat];
  if (!previous?.length) return true;
  const p = clone(g.players[seat]!),
    k = kind(tile);
  const pung = p.melds.find((m) => m.type === "pung" && kind(m.tiles[0]) === k);
  const removeCount = external ? 3 : pung ? 1 : 4;
  const selected = p.hand.filter((t) => kind(t) === k).slice(0, removeCount);
  if (selected.length !== removeCount) return false;
  remove(p, selected);
  if (pung) {
    pung.type = "kong";
    pung.tiles.push(...selected);
    pung.added = true;
  } else
    p.melds.push({
      type: "kong",
      tiles: external ? [...selected, tile] : selected,
      from: seat,
      concealed: !external,
    });
  const waits = structuralWaits(p);
  return waits.length > 0 && waits.every((k) => previous.includes(k));
}
function updateHeavenlyWait(g: Game, seat: Seat) {
  const previous = g.ruleState?.heavenlyWaits[seat];
  if (!previous?.length) return;
  const waits = structuralWaits(g.players[seat]!);
  if (waits.length && waits.every((k) => previous.includes(k)))
    g.ruleState!.heavenlyWaits[seat] = waits;
  else delete g.ruleState!.heavenlyWaits[seat];
}
function recordKong(g: Game, seat: Seat) {
  if (!g.ruleState) return;
  g.ruleState.heavenlyEligible = false;
  g.ruleState.kongOccurred = true;
  g.ruleState.discards = [];
  updateHeavenlyWait(g, seat);
}
function kongReplacement(
  g: Game,
  from: Seat | undefined,
  direct: boolean,
): Game["replacement"] {
  if (isNanjingV2(g.rules) && g.replacement?.from !== undefined)
    return { ...g.replacement, type: "kong" };
  return { type: "kong", ...(from === undefined ? {} : { from }), direct };
}
function applyDiscardPenalties(g: Game, seat: Seat, tile: Tile) {
  const state = g.ruleState;
  if (!state) return;
  const k = kind(tile),
    own = state.ownDiscards[seat],
    bProfile = isNanjingB(g.rules);
  own.push(k);
  state.discards = [...state.discards.slice(-3), { seat, tile }];
  const bills: Bill[] = [];
  const payOthers = (payer: Seat, amount: number, reason: Bill["reason"]) => {
    for (const to of seats)
      if (to !== payer)
        bills.push({ from: payer, to, amount, reason });
    flagNext(g, reason);
  };
  if (g.rules.discardPenalties) {
    if (own.filter((n) => n === k).length === 4)
      payOthers(seat, bProfile ? sidePoints(g, 5) : sideAmount(g, nanjingValues(g.rules).penaltyFlowers), "四张同牌");
    const chain = state.discards;
    if (
      chain.length === 4 &&
      new Set(chain.map((d) => d.seat)).size === 4 &&
      chain.every((d) => kind(d.tile) === k) &&
      (!bProfile || (
        k >= 27 && k <= 30 &&
        state.ownDiscards.every((discards) => discards.length === 1) &&
        chain.every((d, index) => d.seat === (g.dealer + index) % 4)
      ))
    )
      payOthers(
        chain[0].seat,
        bProfile ? 5 : sideAmount(g, nanjingValues(g.rules).penaltyFlowers),
        "四家跟牌",
      );
  }
  if (
    g.rules.fourWinds &&
    own.length === 4 &&
    new Set(own).size === 4 &&
    own.every((n) => n >= 27 && n <= 30)
  ) {
    for (const from of seats)
      if (from !== seat)
        bills.push({
          from,
          to: seat,
          amount: bProfile ? 5 : sideAmount(g, nanjingValues(g.rules).fourWindsFlowers),
          reason: "四连风",
        });
    flagNext(g, "四连风");
  }
  payBills(g, bills);
}
function winContext(g: Game, tile?: Tile, seat: Seat = g.turn): WinContext {
  return {
    multiplier: g.ruleState?.multiplier ?? 1,
    heavenly:
      isNanjingV2(g.rules) &&
      !!g.ruleState?.heavenlyEligible &&
      seat === g.dealer &&
      tile === undefined,
    earthly: isNanjingV2(g.rules) && !!g.ruleState?.heavenlyWaits[seat]?.length &&
      (!isNanjingB(g.rules) || g.ruleState?.earthlyDeclared?.[seat] === true),
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
    const amount = isNanjingV2(g.rules)
      ? sidePoints(g, nanjingValues(g.rules).flowerKongPoints)
      : 12;
    for (const other of seats)
      if (other !== seat) transfer(g, other, seat, amount, "花杠");
    flagNext(g, "花杠");
    note(g, `${p.name} 花杠，每家 ${amount} 分${initial ? "（起手）" : ""}`);
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
      if (finishBankrupt(g, now, seat)) return false;
      replacement = true;
      if (isNanjingV2(g.rules))
        g.replacement = { ...g.replacement, type: "flower" };
      else if (g.replacement?.type !== "kong")
        g.replacement = { type: "flower" };
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
    (isNanjingV2(g.rules) && g.ruleState
      ? !g.ruleState.keepDealer
      : g.result?.reason !== "draw" && !g.result?.winners.includes(g.dealer))
  )
    g.dealer = next(g.dealer);
  if (isNanjingV2(g.rules))
    g.ruleState = {
      multiplier: g.ruleState?.nextMultiplier ?? 1,
      nextMultiplier: 1,
      nextReasons: [],
      keepDealer: false,
      heavenlyEligible: true,
      heavenlyWaits: {},
      discards: [],
      ownDiscards: [[], [], [], []],
      kongOccurred: false,
    };
  if (g.table) g.table.readyDeadline = undefined;
  g.round++;
  g.replay = {
    rules: clone(g.rules),
    multiplier: g.ruleState?.multiplier ?? 1,
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
  g.roundStartExternalScores = g.players.map((p) => p!.externalScore ?? 0);
  g.roundTransfers = [];
  for (const p of g.players)
    Object.assign(p!, {
      hand: [],
      flowers: [],
      melds: [],
      discards: [],
      zhaozhi: false,
      passedHu: false,
      passedPung: [],
      ready: false,
    });
  if (isNanjingV2(g.rules)) {
    if (!dealNanjing(g, now)) {
      g.revision++;
      return g;
    }
  } else {
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
      ((c[kind(t)] === 4 && t === p.hand.find((a) => kind(a) === kind(t))) ||
        p.melds.some(
          (m) => m.type === "pung" && kind(m.tiles[0]) === kind(t),
        )) &&
      preservesHeavenlyWait(g, seat, t),
  );
}
function scoreForWin(g: Game, seat: Seat, tile?: Tile, robbed = false) {
  return scoreHand(g.players[seat]!, g.rules, {
    ...winContext(g, tile, seat),
    seat,
    robbed,
  });
}
function canClaimHuFrom(g: Game, from: Seat) {
  return !g.rules.twoBankrupt || g.players[from]!.score > 0;
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
  const externalBills: Bill[] = [];
  const bill = (
    from: Seat,
    to: Seat,
    amount: number,
    reason: NonNullable<Result["transfers"]>[number]["reason"],
  ) => bills.push({ from, to, amount, reason });
  const liability = (
    from: Seat,
    to: Seat,
    total: number,
    reason: Bill["reason"],
  ) => {
    if (isGarden(g.rules)) {
      // User-confirmed fixed external payment: 50 normally, 100 on a 比下胡 hand.
      const amount = (g.ruleState?.multiplier ?? 1) > 1 ? 100 : 50;
      externalBills.push({ from, to, amount, reason, scope: "external" });
    } else bill(from, to, total * 3, reason);
  };
  for (const seat of winners) {
    const p = g.players[seat]!;
    const score = scoreForWin(
      g,
      seat,
      from === undefined ? undefined : g.pending!.tile,
      robbed,
    );
    if (!score) throw Error("当前牌型还不能胡牌");
    result.details[seat] = score;
    // The supplied reference excludes a normal sequence plus a single pair wait.
    const responsibility = isNanjingV2(g.rules)
      ? score.items.some((i) => ["对对胡", "全球独钓"].includes(i.label))
        ? threeMouths(p, seat)
        : undefined
      : seats.find(
          (s) =>
            s !== seat &&
            p.melds.length === 4 &&
            p.melds.filter((m) => !m.concealed && m.from === s).length >= 3,
        );
    const firstThree = p.melds.slice(0, 3);
    const pure =
      firstThree.length === 3 &&
      firstThree.every(
        (m) =>
          !m.concealed &&
          m.tiles.every(
            (t) =>
              kind(t) < 27 &&
              Math.floor(kind(t) / 9) ===
                Math.floor(kind(firstThree[0].tiles[0]) / 9),
          ),
      );
    // Three-pure liability requires a same-suit winning discard; self draws
    // and concealed kongs do not create a fourth supplier.
    const purePayer =
      pure &&
      from !== undefined &&
      !robbed &&
      score.items.some((i) => i.label === "清一色") &&
      kind(g.pending!.tile) < 27 &&
      Math.floor(kind(g.pending!.tile) / 9) ===
        Math.floor(kind(firstThree[0].tiles[0]) / 9)
        ? from
        : undefined;
    if (score.allIn) {
      score.total = seats
        .filter((s) => s !== seat)
        .reduce<number>((n, s) => n + Math.max(0, g.players[s]!.score), 0);
      score.items = [{ label: "天胡（三家归零）", value: score.total }];
      for (const other of seats)
        if (other !== seat)
          bill(other, seat, Math.max(0, g.players[other]!.score), "天胡");
      result.bankrupt = true;
    } else if (isNanjingB(g.rules) && score.items.some((item) => item.label === "天胡")) {
      for (const other of seats)
        if (other !== seat) bill(other, seat, score.total, "天胡");
    } else if (isNanjingV2(g.rules) && responsibility !== undefined) {
      liability(responsibility, seat, score.total, "三口承包");
    } else if (isNanjingV2(g.rules) && robbed && from !== undefined) {
      if (responsibility !== undefined)
        liability(responsibility, seat, score.total, "三口承包");
      else bill(from, seat, score.total * 3, "抢杠包三家");
    } else if (
      isNanjingV2(g.rules) &&
      from === undefined &&
      g.replacement?.from !== undefined
    )
      bill(g.replacement.from, seat, score.total * 3, "杠开包三家");
    else if (responsibility !== undefined)
      liability(responsibility, seat, score.total, "三口承包");
    else if (
      isNanjingV2(g.rules) &&
      purePayer !== undefined &&
      purePayer !== seat
    )
      liability(purePayer, seat, score.total, "清一色承包");
    else if (
      isNanjingV2(g.rules) &&
      from !== undefined &&
      p.melds.length === 4 &&
      globalLiability(g, seat, g.pending!.tile)
    )
      liability(from, seat, score.total, "全球独钓承包");
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
      `${p.name} ${from === undefined ? "自摸" : robbed ? "抢杠胡" : "胡牌"} · ${externalBills.some((b) => b.to === seat) ? `桌外记分 ${externalBills.find((b) => b.to === seat)!.amount} 分` : `${score.total} 分`}`,
    );
  }
  flushConcealed(
    g,
    [...bills, ...externalBills]
      .filter((b) => b.reason === "三口承包")
      .map((b) => b.to),
  );
  payBills(g, bills);
  for (const entry of externalBills) transferExternal(g, entry);
  result.bankrupt = result.bankrupt || bankrupt(g);
  if (result.bankrupt) protectFinishers(g, winners);
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
      if (
        canClaimHuFrom(g, from) &&
        !p.passedHu &&
        scoreForWin(g, seat, tile, robbed)
      )
        options.push("hu");
      const c = p.hand.filter((t) => kind(t) === kind(tile)).length;
      if (!robbed && !p.passedPung.includes(kind(tile))) {
        if (
          c >= 3 &&
          g.wall.length > (g.rules.seaBottom ? 0 : 16) &&
          preservesHeavenlyWait(g, seat, tile, true)
        )
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
  if (isNanjingV2(g.rules)) meld.added = true;
  transfer(
    g,
    meld.from,
    from,
    isNanjingV2(g.rules)
      ? sidePoints(g, nanjingValues(g.rules).openKongPoints)
      : 12,
    "补杠",
  );
  g.phase = "playing";
  g.pending = undefined;
  g.replacement = kongReplacement(g, meld.from, true);
  recordKong(g, from);
  note(g, `${p.name} 补杠 ${tileName(tile)}`);
  captureReplay(g, "addedKong", now, from, tile);
  if (!finishBankrupt(g, now, from)) draw(g, from, now, true);
}
function resolveClaims(g: Game, now: number) {
  const pending = g.pending!;
  if (
    Object.keys(pending.offers).some(
      (s) => pending.replies[Number(s) as Seat] === undefined,
    )
  )
    return;
  // Persisted claims from an older server must obey the current payer limit too.
  const winners = canClaimHuFrom(g, pending.from)
    ? seats.filter((s) => pending.replies[s] === "hu")
    : [];
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
    transfer(
      g,
      pending.from,
      chosen,
      isNanjingV2(g.rules)
        ? sidePoints(g, nanjingValues(g.rules).openKongPoints)
        : 12,
      "直杠",
    );
    captureReplay(g, "kong", now, chosen, pending.tile);
    g.replacement = { type: "kong", from: pending.from, direct: true };
    recordKong(g, chosen);
    if (!finishBankrupt(g, now, chosen)) draw(g, chosen, now, true);
  } else {
    if (g.ruleState) {
      delete g.ruleState.heavenlyWaits[chosen];
      g.ruleState.discards = [];
    }
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
    if (action.type === "hu" && !canClaimHuFrom(g, pending.from))
      throw Error("不能胡桌内余额已归零的玩家");
    pending.replies[seat] = action.type as Claim;
    if (
      action.type !== "hu" &&
      canClaimHuFrom(g, pending.from) &&
      pending.offers[seat]!.includes("hu")
    )
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
      recordGlobalAnchor(g, seat, action.tile);
      p.passedHu = false;
      p.passedPung = [];
      if (g.ruleState) {
        g.ruleState.heavenlyEligible = false;
        updateHeavenlyWait(g, seat);
        if (isNanjingB(g.rules) && seat !== g.dealer &&
            g.ruleState.ownDiscards[seat].length === 0 && g.ruleState.heavenlyWaits[seat]?.length) {
          g.ruleState.earthlyDeclared ??= {};
          g.ruleState.earthlyDeclared[seat] = true;
          note(g, `${p.name} 地胡报听`);
        }
        applyDiscardPenalties(g, seat, action.tile);
      }
      g.lastDiscard = { tile: action.tile, seat };
      g.lastDraw = undefined;
      g.canSelfWin = false;
      note(g, `${p.name} 打出 ${tileName(action.tile)}`);
      captureReplay(g, "discard", now, seat, action.tile);
      if (finishBankrupt(g, now)) {
        g.revision++;
        return g;
      }
      if (!offerClaims(g, seat, action.tile, false, now))
        draw(g, next(seat), now);
    } else if (action.type === "zhaozhi") {
      throw Error("手机麻将不支持照直");
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
        for (const other of seats) {
          if (other === seat) continue;
          const amount = isNanjingV2(g.rules)
            ? sidePoints(g, nanjingValues(g.rules).concealedKongPoints)
            : 6;
          if (
            g.ruleState &&
            !isNanjingB(g.rules) &&
            threeMouths(p, seat) !== undefined &&
            p.melds.length === 4
          ) {
            (g.ruleState.deferredConcealed ??= []).push({
              from: other,
              to: seat,
              amount,
              reason: "暗杠",
            });
          } else transfer(g, other, seat, amount, "暗杠");
        }
        g.replacement = kongReplacement(g, undefined, false);
        recordKong(g, seat);
        note(g, `${p.name} 暗杠`);
        captureReplay(g, "concealedKong", now, seat, action.tile);
        if (!finishBankrupt(g, now, seat)) draw(g, seat, now, true);
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
    ruleState: _ruleState,
    ...rest
  } = g;
  const reveal = ["ended", "finished"].includes(g.phase);
  return clone({
    ...rest,
    me,
    ...(g.ruleState
      ? {
          roundMultiplier: g.ruleState.multiplier,
          nextRoundMultiplier: g.ruleState.nextMultiplier,
          earthlyWaits: isNanjingB(g.rules) && !g.ruleState.earthlyDeclared?.[me]
            ? [] : g.ruleState.heavenlyWaits[me] ?? [],
        }
      : {}),
    remaining: wall.length,
    players: players.map((p, seat) => {
      if (!p) return null;
      const { passedHu, passedPung, hand, ...visible } = p;
      return {
        ...visible,
        handCount: hand.length,
        hand: seat === me || reveal ? hand : [],
        melds: p.melds.map((m) =>
          m.concealed && seat !== me && !reveal ? { ...m, tiles: m.tiles.slice(0, 1) } : m,
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
          ? (pending!.offers[me] ?? []).filter(
              (claim) => claim !== "hu" || canClaimHuFrom(g, pending!.from),
            )
          : []
        : g.phase === "playing" &&
            g.turn === me &&
            canSelfWin &&
            scoreForWin(g, me)
          ? ["hu"]
          : [],
    canZhaozhi: canDeclareZhaozhi(g, me),
    selfKongs: selfKongs(g, me),
    canDiscard: g.phase === "playing" && g.turn === me,
    lastDraw: g.turn === me ? lastDraw : undefined,
  });
}
/** Human auto-play never chooses a hand strategy or accepts a claim. */
export function trusteeAction(g: Game, seat: Seat): Action | null {
  const p = g.players[seat];
  if (!p) return null;
  if (
    g.phase === "claiming" &&
    g.pending?.offers[seat] &&
    g.pending.replies[seat] === undefined
  )
    return { type: "pass" };
  if (g.phase !== "playing" || g.turn !== seat || !p.hand.length) return null;
  // A timeout immediately after a manual pung has no drawn tile. Only then
  // discard the rightmost legal tile; never inspect or optimise the hand.
  const tile =
    g.lastDraw !== undefined && p.hand.includes(g.lastDraw)
      ? g.lastDraw
      : p.hand[p.hand.length - 1];
  return { type: "discard", tile };
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
