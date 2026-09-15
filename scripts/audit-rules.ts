/** Read-only rule audit. Fixtures are synthetic; no account, database or live room is used. */
import assert from "node:assert/strict";
import {
  act,
  createGame,
  newPlayer,
  seats,
  selfKongs,
  startRound,
  viewFor,
} from "../shared/engine";
import { scoreHand, shapes } from "../shared/scoring";
import { createWall, kind, seededRandom } from "../shared/tiles";
import {
  DEFAULT_RULES,
  type Game,
  type Player,
  type Seat,
} from "../shared/types";
import { listeningHints } from "../src/listening-hints";

const observations: { id: string; status: string; detail: unknown }[] = [];
function check(
  id: string,
  run: () => unknown,
  status = "verified-current-profile",
) {
  observations.push({ id, status, detail: run() ?? "通过" });
}
function tiles(kinds: number[]) {
  const copies = new Map<number, number>();
  return kinds.map((k) => {
    const copy = copies.get(k) ?? 0;
    assert.ok(copy < 4);
    copies.set(k, copy + 1);
    return k * 4 + copy;
  });
}
function player(hand: number[], flowers = 1): Player {
  return {
    ...newPlayer("audit", "核验"),
    hand: tiles(hand),
    flowers: [124, 128, 132, 136].slice(0, flowers),
  };
}
type Spec = {
  hand: number[];
  melds?: { k: number; from: Seat; concealed?: boolean; kong?: boolean }[];
  flowers?: number[];
};
function fixture(
  specs: Partial<Record<Seat, Spec>>,
  front: number[] = [],
  tail: number[] = [],
): Game {
  const g = createGame("000000", "isolated-rule-audit");
  const pool = createWall(seededRandom(20260915));
  const take = (k: number) => {
    const i = pool.findIndex((t) => kind(t) === k);
    assert.ok(i >= 0, `Fixture has no remaining copy of kind ${k}`);
    return pool.splice(i, 1)[0];
  };
  const first = front.map(take),
    last = tail.map(take);
  g.players = seats.map((s) =>
    newPlayer(`audit-${s}`, `核验${s}`, false, 1000),
  );
  for (const s of seats) {
    const spec = specs[s];
    if (!spec) continue;
    const p = g.players[s]!;
    p.hand = spec.hand.map(take);
    p.flowers = (spec.flowers ?? []).map(take);
    p.melds = (spec.melds ?? []).map((m) => ({
      type: m.kong ? "kong" : "pung",
      from: m.from,
      concealed: !!m.concealed,
      tiles: Array.from({ length: m.kong ? 4 : 3 }, () => take(m.k)),
    }));
  }
  for (const s of seats) {
    if (specs[s]) continue;
    g.players[s]!.hand = pool
      .filter((t) => kind(t) < 31)
      .slice(0, s === 0 ? 14 : 13);
    for (const t of g.players[s]!.hand) pool.splice(pool.indexOf(t), 1);
  }
  g.wall = [...first, ...pool, ...last];
  g.round = 1;
  g.phase = "playing";
  g.turn = 0;
  g.canSelfWin = true;
  g.lastDraw = g.players[0]!.hand.at(-1);
  g.roundStartScores = [1000, 1000, 1000, 1000];
  physical(g);
  return g;
}
function physical(g: Game) {
  const all = [
    ...g.wall,
    ...g.players.flatMap((p) => [
      ...p!.hand,
      ...p!.flowers,
      ...p!.discards,
      ...p!.melds.flatMap((m) => m.tiles),
    ]),
  ];
  assert.equal(all.length, 144);
  assert.equal(new Set(all).size, 144);
  assert.equal(
    g.players.reduce((n, p) => n + p!.score, 0),
    4000,
  );
}
function randomForWall(target: number[]) {
  assert.equal(new Set(target).size, 144);
  const working = Array.from({ length: 144 }, (_, i) => i),
    choices: number[] = [];
  for (let i = 143; i > 0; i--) {
    const j = working.indexOf(target[i]);
    assert.ok(j <= i);
    choices.push(j);
    [working[i], working[j]] = [working[j], working[i]];
  }
  return { index: () => choices.shift()! };
}
function replies(
  g: Game,
  selected: Partial<Record<Seat, "hu" | "pung" | "kong">> = {},
) {
  while (g.phase === "claiming") {
    const s = seats.find(
      (s) => g.pending!.offers[s] && g.pending!.replies[s] === undefined,
    );
    assert.notEqual(s, undefined);
    g = act(g, s!, { type: selected[s!] ?? "pass" }, 2000);
  }
  physical(g);
  return g;
}
const ordinary = [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28, 28];

check("S01-ordinary-closed-and-flower-toggle", () => {
  const p = player(ordinary, 4);
  assert.equal(scoreHand(p, DEFAULT_RULES)!.total, 52); // 20 + 20 + 4*2 + 风刻/风对*2
  assert.equal(
    scoreHand(p, { ...DEFAULT_RULES, flowerDouble: false })!.total,
    46,
  );
  p.flowers = [];
  assert.equal(scoreHand(p, DEFAULT_RULES)!.total, 84);
});
check("S02-seven-pairs-all-quad-levels", () => {
  const examples = [
    [0, 0, 3, 3, 9, 9, 12, 12, 18, 18, 21, 21, 27, 27],
    [0, 0, 0, 0, 9, 9, 12, 12, 18, 18, 21, 21, 27, 27],
    [0, 0, 0, 0, 9, 9, 9, 9, 18, 18, 21, 21, 27, 27],
    [0, 0, 0, 0, 9, 9, 9, 9, 18, 18, 18, 18, 27, 27],
  ];
  return examples.map((hand, i) => {
    const score = scoreHand(player(hand), DEFAULT_RULES)!;
    assert.ok(score.items.some((item) => item.value === 80 * (i + 1)));
    assert.ok(!score.items.some((item) => item.label === "门清"));
    assert.equal(score.total, 22 + 80 * (i + 1));
    return score.total;
  });
});
check("S03-suit-triplet-and-global-stacking", () => {
  const cases: [number[], string, number][] = [
    [[0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8], "清一色", 60],
    [[0, 1, 2, 3, 4, 5, 6, 7, 8, 27, 27, 27, 28, 28], "混一色", 40],
  ];
  for (const [hand, label, value] of cases)
    assert.ok(
      scoreHand(player(hand), DEFAULT_RULES)!.items.some(
        (i) => i.label === label && i.value === value,
      ),
    );
  const p = player([28, 28]);
  p.melds = [0, 9, 18, 27].map((k) => ({
    type: "pung",
    tiles: tiles([k, k, k]),
    from: 1,
    concealed: false,
  }));
  const global = scoreHand(p, DEFAULT_RULES)!;
  assert.ok(global.items.some((i) => i.label === "对对胡" && i.value === 40));
  assert.ok(global.items.some((i) => i.label === "全球独钓" && i.value === 60));
  assert.equal(global.total, 126);
  // Structural evaluator is separately tested with physically valid wind seven pairs below.
  const windSeven = player([
    27, 27, 27, 27, 28, 28, 28, 28, 29, 29, 29, 29, 30, 30,
  ]);
  assert.ok(
    scoreHand(windSeven, DEFAULT_RULES)!.items.some(
      (i) => i.label === "字一色（按清一色）" && i.value === 60,
    ),
  );
});
check("S04-minimum-and-concealed-kong", () => {
  for (const concealed of [false, true]) {
    const p = player([0, 1, 2, 9, 10, 11, 18, 19, 20, 28, 28], 0);
    p.melds = [
      { type: "kong", tiles: tiles([27, 27, 27, 27]), from: 1, concealed },
    ];
    assert.equal(!!scoreHand(p, DEFAULT_RULES), concealed);
    p.flowers = [124, 128, 132, 136];
    assert.ok(scoreHand(p, DEFAULT_RULES));
  }
});
check("S05-replacement-and-sea-bottom-context", () => {
  const p = player(ordinary);
  const base = scoreHand(p, DEFAULT_RULES)!.total;
  for (const [replacement, directKong, extra] of [
    ["flower", false, 20],
    ["kong", false, 20],
    ["kong", true, 40],
  ] as const)
    assert.equal(
      scoreHand(p, DEFAULT_RULES, { replacement, directKong })!.total,
      base + extra,
    );
  assert.equal(
    scoreHand(p, { ...DEFAULT_RULES, seaBottom: true }, { seaBottom: true })!
      .total,
    base + 20,
  );
  assert.equal(
    scoreHand(p, { ...DEFAULT_RULES, seaBottom: false }, { seaBottom: true })!
      .total,
    base,
  );
});
check("S06-independent-hand-decomposition", () => {
  // Independent pair-first count oracle; includes complete/incomplete hands, suit boundaries and seven pairs.
  function oracle(hand: number[], groups: number): boolean {
    if (hand.length !== groups * 3 + 2 || hand.some((k) => k < 0 || k > 30))
      return false;
    const c = Array(31).fill(0);
    for (const k of hand) c[k]++;
    if (c.some((n) => n > 4)) return false;
    if (groups === 4 && c.every((n) => n % 2 === 0)) return true;
    const split = (): boolean => {
      const k = c.findIndex((n) => n > 0);
      if (k < 0) return true;
      if (c[k] >= 3) {
        c[k] -= 3;
        const ok = split();
        c[k] += 3;
        if (ok) return true;
      }
      if (k < 27 && k % 9 < 7 && c[k + 1] && c[k + 2]) {
        c[k]--;
        c[k + 1]--;
        c[k + 2]--;
        const ok = split();
        c[k]++;
        c[k + 1]++;
        c[k + 2]++;
        if (ok) return true;
      }
      return false;
    };
    return c.some((n, k) => {
      if (n < 2) return false;
      c[k] -= 2;
      const ok = split();
      c[k] += 2;
      return ok;
    });
  }
  const rng = seededRandom(20260915);
  let count = 0,
    valid = 0;
  for (let open = 0; open <= 4; open++)
    for (let n = 0; n < 200; n++) {
      const pair = Math.floor(rng() * 31),
        hand = [pair, pair];
      for (let j = 0; j < 4 - open; j++) {
        const k = Math.floor(rng() * 31);
        hand.push(
          ...(rng() < 0.5 && k < 27 && k % 9 < 7
            ? [k, k + 1, k + 2]
            : [k, k, k]),
        );
      }
      if (n % 2) hand[Math.floor(rng() * hand.length)] = Math.floor(rng() * 31);
      const expected = oracle(hand, 4 - open);
      // IDs may repeat here: pure shape tests operate on multiplicities, never mutate an actual game.
      assert.equal(
        shapes(
          hand.map((k) => k * 4),
          open,
        ).length > 0,
        expected,
      );
      count++;
      if (expected) valid++;
    }
  return { count, valid, invalid: count - valid };
});
check("E01-kong-replacement-after-flower", () => {
  let g = fixture(
    { 0: { hand: [0, 0, 0, 0, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28] } },
    [],
    [28, 34],
  );
  g = act(g, 0, { type: "selfKong", tile: g.players[0]!.hand[0] }, 1000);
  physical(g);
  assert.equal(g.replacement?.type, "kong");
  assert.equal(g.players[0]!.flowers.length, 1);
  assert.equal(kind(g.lastDraw!), 28);
  assert.ok(viewFor(g, 0).actions.includes("hu"));
  g = act(g, 0, { type: "hu" }, 2000);
  assert.ok(g.result!.details[0]!.items.some((i) => i.label === "小杠开花"));
  assert.ok(!g.result!.details[0]!.items.some((i) => i.label === "补花胡"));
  physical(g);
});
check("E02-added-kong-success-and-original-payer", () => {
  let g = fixture(
    {
      0: {
        hand: [0, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28],
        melds: [{ k: 0, from: 2 }],
      },
    },
    [],
    [28],
  );
  g = replies(
    act(g, 0, { type: "selfKong", tile: g.players[0]!.hand[0] }, 1000),
  );
  assert.equal(g.players[0]!.melds[0].type, "kong");
  assert.deepEqual(g.roundTransfers, [
    { from: 2, to: 0, amount: 12, reason: "补杠" },
  ]);
  g = act(g, 0, { type: "hu" }, 3000);
  const total = g.result!.details[0]!.total;
  assert.deepEqual(g.result!.transfers!.at(-1), {
    from: 2,
    to: 0,
    amount: total * 3,
    reason: "杠开包三家",
  });
  physical(g);
});
check("E03-direct-kong-and-hu-priority", () => {
  const specs: Partial<Record<Seat, Spec>> = {
    0: { hand: [0, 6, 7, 8, 15, 16, 17, 24, 25, 26, 30, 30, 30, 29] },
    1: { hand: [0, 0, 0, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28] },
    2: { hand: [1, 2, 3, 4, 5, 12, 13, 14, 21, 22, 23, 29, 29] },
  };
  let g = fixture(specs);
  const discarded = g.players[0]!.hand[0];
  g = act(g, 0, { type: "discard", tile: discarded }, 1000);
  assert.ok(g.pending!.offers[1]!.includes("kong"));
  assert.ok(g.pending!.offers[2]!.includes("hu"));
  g = replies(g, { 1: "kong", 2: "hu" });
  assert.deepEqual(g.result!.winners, [2]);
  assert.equal(g.players[1]!.melds.length, 0);
  assert.ok(!g.roundTransfers!.some((t) => t.reason === "直杠"));
  let direct = fixture({ 0: specs[0], 1: specs[1] }, [], [28]);
  direct = replies(
    act(direct, 0, { type: "discard", tile: direct.players[0]!.hand[0] }, 1000),
    { 1: "kong" },
  );
  assert.equal(direct.turn, 1);
  assert.equal(direct.players[1]!.melds[0].tiles.length, 4);
  assert.deepEqual(direct.roundTransfers, [
    { from: 0, to: 1, amount: 12, reason: "直杠" },
  ]);
});
check("E04-flower-kong-five-sets", () => {
  return [
    [31, 31, 31, 31],
    [32, 32, 32, 32],
    [33, 33, 33, 33],
    [34, 35, 36, 37],
    [38, 39, 40, 41],
  ].map((set) => {
    let g = fixture(
      { 1: { hand: ordinary.slice(0, 13), flowers: set.slice(0, 3) } },
      [set[3]],
      [30],
    );
    g = replies(
      act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000),
    );
    assert.equal(g.players[1]!.flowers.length, 4);
    assert.deepEqual(
      g.roundTransfers,
      seats
        .filter((s) => s !== 1)
        .map((from) => ({ from, to: 1, amount: 12, reason: "花杠" })),
    );
    return set;
  });
});
check("E05-wall-boundaries", () => {
  return [false, true].map((seaBottom) => {
    let g = fixture({ 0: { hand: ordinary } });
    g.rules.seaBottom = seaBottom;
    const keep = seaBottom ? 0 : 16;
    // Move consumed wall tiles to public discards; preserve all 144 physical IDs.
    g.players[3]!.discards.push(...g.wall.splice(keep));
    assert.equal(selfKongs(g, 0).length, 0);
    g = replies(
      act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000),
    );
    assert.equal(g.result!.reason, "draw");
    assert.equal(g.wall.length, keep);
    return { seaBottom, remaining: g.wall.length };
  });
});
check("E06-initial-flower-kong-and-repeat-replacement", () => {
  const flowers = [136, 137, 138, 139];
  // First dealer draw is spring. The tail contains the other 19 flowers, exercising repeated replacement and all five initial flower kongs.
  const target = [
    136,
    ...Array.from({ length: 144 }, (_, i) => i).filter(
      (t) => !flowers.includes(t),
    ),
    139,
    138,
    137,
  ];
  const g = createGame("000000", "initial-flower-audit");
  g.players = seats.map((s) => ({
    ...newPlayer(`p${s}`, `p${s}`, false, 1000),
    ready: true,
  }));
  const started = startRound(g, 1000, randomForWall(target));
  assert.deepEqual(
    started.players.map((p) => p!.hand.length),
    [14, 13, 13, 13],
  );
  assert.ok(flowers.every((t) => started.players[0]!.flowers.includes(t)));
  assert.equal(started.players[0]!.flowers.length, 20);
  assert.deepEqual(
    started.roundTransfers!.filter((t) => t.reason === "花杠"),
    Array.from({ length: 5 }, () =>
      [1, 2, 3].map((from) => ({ from, to: 0, amount: 12, reason: "花杠" })),
    ).flat(),
  );
  physical(started);
});
check("E07-passed-claim-until-own-discard", () => {
  return ["hu", "pung"].map((mode) => {
    let g = fixture(
      {
        1: {
          hand:
            mode === "hu"
              ? ordinary.slice(0, 13)
              : [28, 28, 0, 2, 4, 6, 9, 11, 13, 18, 20, 22, 30],
        },
        3: { hand: [28, 3, 4, 5, 6, 7, 8, 12, 13, 14, 21, 22, 23, 30] },
      },
      [28],
    );
    g.turn = 3;
    g.lastDraw = g.players[3]!.hand[0];
    g = act(g, 3, { type: "discard", tile: g.players[3]!.hand[0] }, 1000);
    assert.ok(g.pending!.offers[1]!.includes(mode as "hu" | "pung"));
    g = replies(g);
    assert.equal(g.turn, 0);
    assert.equal(kind(g.lastDraw!), 28);
    g = act(g, 0, { type: "discard", tile: g.lastDraw! }, 3000);
    assert.ok(!g.pending?.offers[1]?.includes(mode as "hu" | "pung"));
    g = replies(g);
    assert.equal(g.turn, 1);
    assert.ok(
      mode === "hu"
        ? g.players[1]!.passedHu
        : g.players[1]!.passedPung.includes(28),
    );
    g = act(g, 1, { type: "discard", tile: g.players[1]!.hand[0] }, 4000);
    assert.equal(g.players[1]!.passedHu, false);
    assert.deepEqual(g.players[1]!.passedPung, []);
    physical(g);
    return mode;
  });
});
check("E08-three-mouth-responsibility", () => {
  let g = fixture({
    0: {
      hand: [28, 28],
      melds: [
        { k: 0, from: 2 },
        { k: 9, from: 2 },
        { k: 18, from: 2 },
        { k: 27, from: 3 },
      ],
      flowers: [31],
    },
  });
  g = act(g, 0, { type: "hu" }, 1000);
  assert.equal(g.roundTransfers!.length, 1);
  assert.deepEqual(g.roundTransfers![0], {
    from: 2,
    to: 0,
    amount: g.result!.details[0]!.total * 3,
    reason: "三口承包",
  });
  physical(g);
});
check("E09-final-draw-sea-bottom-and-dealer-continuation", () => {
  let g = fixture({ 1: { hand: ordinary.slice(0, 13), flowers: [31] } }, [28]);
  g.rules.seaBottom = true;
  g.players[3]!.discards.push(...g.wall.splice(1));
  g = replies(
    act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000),
  );
  assert.equal(g.wall.length, 0);
  assert.ok(viewFor(g, 1).actions.includes("hu"));
  g = act(g, 1, { type: "hu" }, 2000);
  assert.ok(
    g.result!.details[1]!.items.some(
      (i) => i.label === "海底捞月" && i.value === 20,
    ),
  );
  physical(g);
  return { lastTileCanWin: true, seaBottomBonus: 20 };
});
check("E10-last-flower-cannot-replace-draw", () => {
  let g = fixture({ 1: { hand: ordinary.slice(0, 13) } }, [34]);
  g.players[3]!.discards.push(...g.wall.splice(17));
  g = replies(
    act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000),
  );
  assert.equal(g.result!.reason, "draw");
  assert.equal(g.wall.length, 16);
  assert.ok(g.players[1]!.flowers.some((t) => kind(t) === 34));
  assert.equal(g.players[1]!.hand.length, 13);
  return { flowerRevealed: true, remaining: 16, result: "draw" };
});
check(
  "G06-fourth-pung-no-snapshot-win",
  () => {
    let g = fixture({
      0: { hand: ordinary },
      1: {
        hand: [0, 0, 28, 29],
        melds: [5, 14, 23].map((k) => ({ k, from: 2 as Seat })),
      },
    });
    g = replies(
      act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000),
      { 1: "pung" },
    );
    assert.equal(g.players[1]!.melds.length, 4);
    assert.equal(g.phase, "playing");
    assert.equal(g.turn, 1);
    assert.equal(g.canSelfWin, false);
    return {
      melds: 4,
      handKinds: g.players[1]!.hand.map(kind),
      phase: g.phase,
      canSelfWin: g.canSelfWin,
    };
  },
  "missing-rule-reproduced",
);
check(
  "G01-yajue-listening-mismatch",
  () => {
    const g = fixture({
      0: {
        hand: [0, 2, 9, 10, 11, 18, 19, 20, 28, 28],
        melds: [{ k: 27, from: 1 }],
      },
      1: { hand: [1, 6, 7, 8, 15, 16, 17, 24, 25, 26, 29, 29, 29, 30] },
      2: {
        hand: [3, 4, 5, 12, 13, 14, 21, 22, 23, 30],
        melds: [{ k: 1, from: 3 }],
      },
    });
    const p = viewFor(g, 0).players[0]!;
    const winning = g.players[1]!.hand[0];
    const serverScore = scoreHand(g.players[0]!, g.rules, {
      tile: winning,
      visiblePungs: [1, 27],
    });
    const hints = listeningHints(p, g.rules);
    assert.equal(serverScore!.total, 64);
    assert.deepEqual(hints, []);
    g.turn = 1;
    g.lastDraw = winning;
    const offered = act(g, 1, { type: "discard", tile: winning }, 1000);
    assert.ok(viewFor(offered, 0).actions.includes("hu"));
    return {
      handKinds: p.hand.map(kind),
      publicPungKinds: [1, 27],
      winningKind: 1,
      serverScore: serverScore!.total,
      hints,
      actualHuActionOffered: true,
    };
  },
  "gap-reproduced",
);
check(
  "G02-open-big-no-flower",
  () => {
    const p = player([0, 1, 2, 3, 4, 5, 6, 7, 8, 28, 28], 0);
    p.melds = [
      { type: "pung", tiles: tiles([27, 27, 27]), from: 1, concealed: false },
    ];
    const score = scoreHand(p, DEFAULT_RULES)!;
    assert.ok(score.items.some((i) => i.label === "混一色"));
    assert.ok(!score.items.some((i) => i.label === "无花果"));
    return score;
  },
  "variant-difference-reproduced",
);
check(
  "G03-first-deal-no-heavenly",
  () => {
    const hand = tiles(ordinary),
      remaining = Array.from({ length: 144 }, (_, i) => i).filter(
        (t) => !hand.includes(t),
      );
    const target = Array.from({ length: 53 }, (_, i) =>
      i % 4 === 0 ? hand[i / 4] : remaining.shift()!,
    );
    target.push(...remaining);
    const source = createGame("000000", "heavenly-audit");
    source.players = seats.map((s) => ({
      ...newPlayer(`p${s}`, `p${s}`, false, 1000),
      ready: true,
    }));
    const g = startRound(source, 1000, randomForWall(target));
    assert.deepEqual(g.players[0]!.hand, hand);
    assert.equal(g.players.flatMap((p) => p!.discards).length, 0);
    const done = act(g, 0, { type: "hu" }, 1000);
    assert.ok(!done.result!.details[0]!.items.some((i) => i.label === "天胡"));
    return done.result!.details[0];
  },
  "missing-rule-reproduced",
);
check(
  "G04-multiwinner-dealer",
  () => {
    let g = fixture({
      0: { hand: [30, 0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27] },
      1: { hand: [0, 1, 2, 3, 4, 5, 12, 13, 14, 21, 22, 23, 30] },
      2: { hand: [6, 7, 8, 15, 16, 17, 24, 25, 26, 29, 29, 29, 30] },
    });
    g = replies(
      act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000),
      { 1: "hu", 2: "hu" },
    );
    assert.deepEqual(g.result!.winners, [1, 2]);
    g.players.forEach((p) => (p!.ready = true));
    const next = startRound(g, 3000, seededRandom(13));
    assert.equal(next.dealer, 1);
    return { previousDealer: 0, winners: [1, 2], nextDealer: next.dealer };
  },
  "variant-difference-reproduced",
);
check(
  "G05-global-adds-single-wait",
  () => {
    const p = player([28]);
    p.melds = [0, 9, 18, 27].map((k) => ({
      type: "pung",
      tiles: tiles([k, k, k]),
      from: 1,
      concealed: false,
    }));
    const score = scoreHand(p, DEFAULT_RULES, { tile: 113 })!;
    assert.ok(score.items.some((i) => i.label === "全球独钓"));
    assert.ok(score.items.some((i) => i.label === "独占"));
    return score;
  },
  "variant-difference-reproduced",
);

console.log(
  JSON.stringify(
    {
      profile: DEFAULT_RULES.id,
      scope: "当前规则核验与缺口复现；通过不代表微乐或荔枝全规则一致",
      observations,
    },
    null,
    2,
  ),
);
