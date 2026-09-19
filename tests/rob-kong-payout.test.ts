import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, seats, viewFor } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import type { Game, Rules, Seat } from "../shared/types";
import { createRecords } from "../server/records";

const flowers = [124, 128, 132, 136, 125, 129, 133, 137, 126, 130, 134, 138, 127, 131, 135, 139, 140, 141, 142, 143];
const firstWait = [3, 4, 5, 15, 17, 18, 19, 20, 22, 22];
const secondWait = [6, 7, 8, 15, 17, 21, 22, 23, 10, 10];

function inventory(g: Game) {
  const tiles = [...g.wall, ...g.players.flatMap(player => [
    ...player!.hand, ...player!.flowers, ...player!.discards, ...player!.melds.flatMap(meld => meld.tiles),
  ])];
  expect(tiles).toHaveLength(144);
  expect(new Set(tiles).size).toBe(144);
}

function robTable({ flowerCounts = [4], payerBalance = 1000, shift = 0, multiplier = 1,
  profile = "nj-garden-b-v3", twoSided = false }: {
  flowerCounts?: number[]; payerBalance?: number; shift?: number; multiplier?: number;
  profile?: Rules["id"]; twoSided?: boolean;
} = {}) {
  const g = createGame("779988", `rob-payout-${profile}-${shift}`, { ...ruleDefaults(profile), turnSeconds: 0 });
  g.players = seats.map(seat => ({ ...newPlayer(`rob-payout-${seat}`, `牌友${seat}`), score: seat === 1 ? payerBalance : 1000 }));
  g.phase = "playing"; g.round = 2; g.revision = 20;
  g.initialScore = 1000; g.settlementBase = 1000;
  const used = new Map<number, number>();
  const tile = (k: number) => {
    const copy = used.get(k) ?? 0;
    if (copy >= 4) throw Error(`Fifth physical tile of kind ${k}`);
    used.set(k, copy + 1); return k * 4 + copy;
  };
  g.players[1]!.melds = [{ type: "pung", tiles: [tile(16), tile(16), tile(16)], from: 3, concealed: false }];
  const winning = tile(16);
  g.players[1]!.hand = [winning];
  let flowerOffset = 0;
  const winners: Seat[] = flowerCounts.map((_count, index) => index === 0 ? 0 : 2);
  for (const [index, winner] of winners.entries()) {
    const pungKind = index === 0 ? 0 : 26;
    const wait = index === 0 ? twoSided ? [3, 4, 5, 14, 15, 18, 19, 20, 22, 22] : firstWait : secondWait;
    const player = g.players[winner]!;
    player.hand = wait.map(tile);
    player.melds = [{ type: "pung", tiles: [tile(pungKind), tile(pungKind), tile(pungKind)], from: 3, concealed: false }];
    player.flowers = flowers.slice(flowerOffset, flowerOffset + flowerCounts[index]);
    flowerOffset += flowerCounts[index];
  }
  const usedTiles = new Set(g.players.flatMap(player => [
    ...player!.hand, ...player!.flowers, ...player!.melds.flatMap(meld => meld.tiles),
  ]));
  const rest = Array.from({ length: 124 }, (_, id) => id).filter(id => !usedTiles.has(id))
    .sort((a, b) => (a * 37 % 127) - (b * 37 % 127));
  for (const seat of seats.filter(seat => !winners.includes(seat))) {
    const player = g.players[seat]!;
    while (player.hand.length < 13 - player.melds.length * 3 + Number(seat === 1)) player.hand.push(rest.shift()!);
  }
  const held = new Set(g.players.flatMap(player => [
    ...player!.hand, ...player!.flowers, ...player!.melds.flatMap(meld => meld.tiles),
  ]));
  g.wall = Array.from({ length: 144 }, (_, id) => id).filter(id => !held.has(id));
  const rotated = (seat: Seat) => ((seat + shift) % 4) as Seat;
  const players = [...g.players];
  for (const seat of seats) {
    g.players[rotated(seat)] = players[seat];
    g.players[rotated(seat)]!.melds.forEach(meld => { meld.from = rotated(meld.from); });
  }
  g.turn = rotated(1); g.dealer = rotated(3); g.lastDraw = winning; g.canSelfWin = true;
  g.roundStartScores = g.players.map(player => player!.score);
  g.roundStartExternalScores = [0, 0, 0, 0];
  g.ruleState = { multiplier, nextMultiplier: 1, nextReasons: [], keepDealer: false,
    heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: false };
  inventory(g);
  return { game: g, payer: rotated(1), winners: winners.map(rotated).sort((a, b) => a - b), winning };
}

function offered(value: ReturnType<typeof robTable>) {
  return act(value.game, value.payer, { type: "selfKong", tile: value.winning }, 2000);
}
function resolve(value: ReturnType<typeof robTable>, choose = value.winners) {
  let g = offered(value);
  for (const seat of choose) expect(viewFor(g, seat).actions).toContain("hu");
  for (const seat of seats) if (g.phase === "claiming" && g.pending?.offers[seat] && g.pending.replies[seat] === undefined)
    g = act(g, seat, { type: choose.includes(seat) ? "hu" : "pass" }, 3000 + seat);
  inventory(g);
  return g;
}
const received = (g: Game, seat: Seat) => g.result!.transfers!.filter(transfer => transfer.to === seat).reduce((sum, transfer) => sum + transfer.amount, 0);

describe("B档抢杠按实际胡牌逐组赔给其余三家", () => {
  it.each([0, 1, 2, 3])("座位轮转%i：非胡牌两家也各获一份，但winners仅有实际胡牌者", shift => {
    const value = robTable({ shift }), g = resolve(value);
    expect(g.result!.winners).toEqual(value.winners);
    expect(g.result!.robbedKong).toBe(true);
    expect(g.result!.from).toBe(value.payer);
    expect(Object.keys(g.result!.details)).toEqual(value.winners.map(String));
    for (const seat of seats) expect(g.result!.deltas[seat]).toBe(seat === value.payer ? -144 : 48);
    expect(g.result!.transfers).toHaveLength(3);
    expect(g.result!.transfers!.every(transfer => transfer.from === value.payer && transfer.reason === "抢杠赔三家")).toBe(true);
    expect(g.players[value.payer]!.melds[0].type).toBe("pung");
    expect(g.ruleState!.nextReasons).toContain("包牌");
  });

  it.each([1, 2, 5, 90, 143, 144, 500])("付款人余额%i：按比例和座序分配余数，实付封顶且守恒", payerBalance => {
    const value = robTable({ payerBalance }), g = resolve(value), total = Math.min(payerBalance, 144);
    expect(g.result!.deltas[value.payer]).toBe(-total);
    expect(g.players[value.payer]!.score).toBe(payerBalance - total);
    const each = Math.floor(total / 3), remainder = total % 3;
    for (let distance = 1; distance <= 3; distance++) {
      const seat = ((value.payer + distance) % 4) as Seat;
      expect(received(g, seat)).toBe(each + Number(distance <= remainder));
    }
    expect(g.result!.deltas.reduce((sum, delta) => sum + delta, 0)).toBe(0);
    expect(g.players.reduce((sum, player) => sum + player!.score, 0)).toBe(3000 + payerBalance);
    expect(g.result!.winners).toEqual([0]);
  });

  it("付款只剩1分时实际胡牌者未分到零头，仍保留抢杠事实标记", () => {
    const g = resolve(robTable({ payerBalance: 1 }));
    expect(g.result!.winners).toEqual([0]);
    expect(g.result!.deltas[0]).toBe(0);
    expect(g.result!.transfers).toEqual([{ from: 1, to: 2, amount: 1, reason: "抢杠赔三家" }]);
    expect(g.result!.robbedKong).toBe(true);
    expect(g.history.at(-1)!.result.robbedKong).toBe(true);
    expect(g.result!.details[0]!.items).toContainEqual({ label: "压绝", value: 30 });
  });

  it("余额已为0的补杠者不能被抢胡", () => {
    const value = robTable({ payerBalance: 0 }), g = offered(value);
    expect(g.pending?.offers[0] ?? []).not.toContain("hu");
    expect(viewFor(g, 0).actions).not.toContain("hu");
    expect(() => act(g, 0, { type: "hu" }, 4000)).toThrow();
    expect(g.result?.robbedKong).not.toBe(true);
  });

  it("抢杠成功不收本次补杠费，也不提前改为杠或抽补牌", () => {
    const value = robTable(), pending = offered(value);
    expect(pending.pending!.kind).toBe("robKong");
    expect(pending.roundTransfers).toEqual([]);
    expect(pending.wall).toEqual(value.game.wall);
    const g = resolve(value);
    expect(g.wall).toEqual(value.game.wall);
    expect(g.players[value.payer]!.melds[0]).toEqual(value.game.players[value.payer]!.melds[0]);
    expect(g.roundTransfers!.every(transfer => transfer.reason === "抢杠赔三家")).toBe(true);
  });

  it.each([1, 2])("多人抢杠、倍率%i：每名Hu各触发一组，非胡牌者也收到各组份额", multiplier => {
    const value = robTable({ flowerCounts: [4, 5], multiplier }), g = resolve(value);
    expect(g.result!.winners).toEqual([0, 2]);
    expect(Object.keys(g.result!.details)).toEqual(["0", "2"]);
    expect(g.result!.details[0]!.total).toBe(48 * multiplier);
    expect(g.result!.details[2]!.total).toBe(50 * multiplier);
    expect(g.result!.transfers).toHaveLength(6);
    const each = 98 * multiplier;
    expect(g.result!.deltas).toEqual([each, -3 * each, each, each]);
    for (const seat of [0, 2, 3] as Seat[]) expect(received(g, seat)).toBe(each);
    expect(g.result!.transfers!.every(transfer => transfer.reason === "抢杠赔三家" && transfer.from === 1)).toBe(true);
    expect(g.result!.robbedKong).toBe(true);
  });

  it("两个合法听牌人只有一家点胡，另一家过牌不触发第二组赔付", () => {
    const value = robTable({ flowerCounts: [4, 5] }), g = resolve(value, [0]);
    expect(g.result!.winners).toEqual([0]);
    expect(g.result!.transfers).toHaveLength(3);
    expect(g.result!.deltas).toEqual([48, -144, 48, 48]);
  });

  it("多人抢杠但付款人仅剩90时，总封顶90、其余三家各30", () => {
    const g = resolve(robTable({ flowerCounts: [4, 5], payerBalance: 90 }));
    expect(g.result!.winners).toEqual([0, 2]);
    expect(g.result!.deltas).toEqual([30, -90, 30, 30]);
    expect(g.result!.transfers!.reduce((sum, transfer) => sum + transfer.amount, 0)).toBe(90);
  });

  it("普通开门三花不能借抢杠赔付取得胡牌资格", () => {
    const value = robTable({ flowerCounts: [3] }), g = offered(value);
    expect(g.pending?.offers[0] ?? []).not.toContain("hu");
    expect(viewFor(g, 0).actions).not.toContain("hu");
    expect(() => act(g, 0, { type: "hu" }, 4000)).toThrow();
  });

  it("零花无花果独立资格仍能抢，三家各得成牌10+无花30+压绝30", () => {
    const g = resolve(robTable({ flowerCounts: [0] }));
    expect(g.result!.details[0]!.total).toBe(70);
    expect(g.result!.details[0]!.items).toContainEqual({ label: "无花果", value: 30 });
    expect(g.result!.deltas).toEqual([70, -210, 70, 70]);
  });

  it("无大胡的四花两面普通抢杠，赔三家仍触发下一把包牌比下胡", () => {
    const g = resolve(robTable({ twoSided: true }));
    expect(g.result!.details[0]!.total).toBe(18);
    expect(g.result!.details[0]!.major).toBe(false);
    expect(g.result!.deltas).toEqual([18, -54, 18, 18]);
    expect(g.ruleState!.nextReasons).toContain("包牌");
    expect(g.ruleState!.nextMultiplier).toBe(2);
  });

  it.each(["nj-casual-v1", "nj-garden-v2", "nj-open-v2"] as const)("%s保存旧规则：三份仍只归真实抢胡者", profile => {
    const g = resolve(robTable({ profile })), total = g.result!.details[0]!.total * 3;
    expect(g.result!.winners).toEqual([0]);
    expect(g.result!.transfers).toEqual([{ from: 1, to: 0, amount: total, reason: "抢杠包三家" }]);
    expect(g.result!.deltas).toEqual([total, -total, 0, 0]);
  });
});

function recordDatabase(g: Game) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT);
    CREATE TABLE teams(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE account_numbers(account_id TEXT PRIMARY KEY,member_id INTEGER);
    CREATE TABLE table_archives(state TEXT); CREATE TABLE rooms(state TEXT);`);
  for (const [seat, player] of g.players.entries()) if (!player!.bot) {
    db.prepare("INSERT INTO accounts VALUES (?,?,?)").run(player!.id, player!.id, player!.name);
    db.prepare("INSERT INTO account_numbers VALUES (?,?)").run(player!.id, 100001 + seat);
  }
  return db;
}

describe("抢杠新分账的战绩与练习统计范围", () => {
  it("真人战绩保存三家实际收入，不把收分的两家误记为胡牌者", () => {
    const g = resolve(robTable()), db = recordDatabase(g);
    try {
      createRecords(db).capture(g, false);
      const record = JSON.parse(String(db.prepare("SELECT record FROM round_records").get()!.record));
      expect(record.result.winners).toEqual([0]);
      expect(record.result.robbedKong).toBe(true);
      expect(record.result.deltas).toEqual([48, -144, 48, 48]);
      expect(db.prepare("SELECT account_id,points FROM point_records ORDER BY account_id").all()).toEqual([
        { account_id: "rob-payout-0", points: 48 }, { account_id: "rob-payout-1", points: -144 },
        { account_id: "rob-payout-2", points: 48 }, { account_id: "rob-payout-3", points: 48 },
      ]);
    } finally { db.close(); }
  });

  it.each(["practice", "experience"] as const)("%s机器人场景保留抢杠战绩，仍不进入积分统计或重启迁移", mode => {
    const value = robTable();
    value.game.players.forEach((player, seat) => { player!.bot = seat !== 0; });
    if (mode === "practice") value.game.code = "练习桌";
    else value.game.table = { creatorId: value.game.players[0]!.id, groupId: "experience", number: 1,
      createdAt: 1000, experience: { sourceCode: "112233" }, settings: { ...DEFAULT_TABLE_SETTINGS } };
    const g = resolve(value), db = recordDatabase(g);
    try {
      createRecords(db).capture(g, false);
      const record = JSON.parse(String(db.prepare("SELECT record FROM round_records").get()!.record));
      expect(record.result.winners).toEqual([0]);
      expect(record.result.robbedKong).toBe(true);
      expect(record.result.deltas).toEqual([48, -144, 48, 48]);
      if (mode === "experience") expect(record.experience).toBe(true);
      expect(db.prepare("SELECT COUNT(*) AS n FROM point_records").get()!.n).toBe(0);
      db.prepare("INSERT INTO table_archives VALUES (?)").run(JSON.stringify(g));
      expect(createRecords(db).points(new URLSearchParams())).toMatchObject({ total: 0, points: 0 });
    } finally { db.close(); }
  });
});
