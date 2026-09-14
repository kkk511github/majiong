import { counts, kind } from "./tiles";
import type { Player, Rules, Tile, WinScore } from "./types";

interface Shape {
  pair: number;
  groups: number[][];
  seven: boolean;
  quads: number;
}
export function shapes(tiles: Tile[], openGroups = 0): Shape[] {
  if (
    tiles.length !== (4 - openGroups) * 3 + 2 ||
    tiles.some((t) => kind(t) > 30)
  )
    return [];
  const c = counts(tiles),
    out: Shape[] = [];
  if (c.some((n) => n > 4)) return [];
  if (!openGroups && c.every((n) => n % 2 === 0))
    out.push({
      pair: -1,
      groups: [],
      seven: true,
      quads: c.filter((n) => n === 4).length,
    });
  function visit(pair: number, groups: number[][]) {
    const k = c.findIndex((n) => n > 0);
    if (k < 0) {
      out.push({
        pair,
        groups: groups.map((g) => [...g]),
        seven: false,
        quads: 0,
      });
      return;
    }
    if (c[k] >= 3) {
      c[k] -= 3;
      groups.push([k, k, k]);
      visit(pair, groups);
      groups.pop();
      c[k] += 3;
    }
    if (k < 27 && k % 9 <= 6 && c[k + 1] && c[k + 2]) {
      c[k]--;
      c[k + 1]--;
      c[k + 2]--;
      groups.push([k, k + 1, k + 2]);
      visit(pair, groups);
      groups.pop();
      c[k]++;
      c[k + 1]++;
      c[k + 2]++;
    }
  }
  for (let k = 0; k < c.length; k++)
    if (c[k] >= 2) {
      c[k] -= 2;
      visit(k, []);
      c[k] += 2;
    }
  return out;
}
export interface WinContext {
  tile?: Tile;
  winTile?: Tile;
  selfDraw?: boolean;
  replacement?: "flower" | "kong";
  directKong?: boolean;
  visiblePungs?: number[];
  heavenly?: boolean;
  earthly?: boolean;
  doubled?: boolean;
  seaBottom?: boolean;
}
export function scoreHand(
  p: Player,
  rules: Rules,
  ctx: WinContext = {},
): WinScore | null {
  const flowerFactor = rules.flowerDouble === false ? 1 : 2;
  const hand = ctx.tile === undefined ? p.hand : [...p.hand, ctx.tile];
  const candidates = shapes(hand, p.melds.length);
  if (!candidates.length) return null;
  const all = [...hand, ...p.melds.flatMap((m) => m.tiles)].map(kind);
  const suits = new Set(
    all.filter((k) => k < 27).map((k) => Math.floor(k / 9)),
  );
  const winds = all.some((k) => k >= 27);
  const closed = p.melds.every((m) => m.concealed);
  const winningTile = ctx.tile ?? ctx.winTile;
  const winKind = winningTile === undefined ? -1 : kind(winningTile);
  let oneWait = false;
  if (winningTile !== undefined) {
    const before = [...hand];
    const at = before.findIndex((t) => kind(t) === winKind);
    if (at >= 0) before.splice(at, 1);
    const owned = counts([...before, ...p.melds.flatMap((m) => m.tiles)]);
    const waits = Array.from({ length: 31 }, (_, k) => k).filter(
      (k) => owned[k] < 4 && shapes([...before, k * 4], p.melds.length).length,
    );
    oneWait = waits.length === 1;
  }
  let best: WinScore | null = null;
  for (const s of candidates) {
    const items: WinScore["items"] = [];
    const add = (label: string, value: number) => {
      if (value) items.push({ label, value });
    };
    let big = false;
    add("成牌", 20);
    if (ctx.heavenly) {
      add("天胡", 320);
      big = true;
    }
    if (ctx.earthly) {
      add("地胡", 280);
      big = true;
    }
    if (s.seven) {
      add(
        ["七对", "豪华七对", "双豪华七对", "三豪华七对"][s.quads],
        80 * (1 + s.quads),
      );
      big = true;
    }
    if (!s.seven && s.groups.every((g) => g[0] === g[1])) {
      add("对对胡", 40);
      big = true;
    }
    if (suits.size === 1) {
      add(winds ? "混一色" : "清一色", winds ? 40 : 60);
      big = true;
    }
    if (suits.size === 0) {
      add("字一色（按清一色）", 60);
      big = true;
    }
    if (p.melds.length === 4) {
      add("全球独钓", 60);
      big = true;
    }
    if (closed && !s.seven) add("门清", 20);
    if (!p.flowers.length && closed) {
      add("无花果", 40);
      big = true;
    }
    if (ctx.replacement === "kong") {
      add(ctx.directKong ? "大杠开花" : "小杠开花", ctx.directKong ? 40 : 20);
      big = true;
    }
    if (ctx.replacement === "flower") add("补花胡", 20);
    if (ctx.seaBottom && rules.seaBottom && ctx.tile === undefined)
      add("海底捞月", 20);
    add(
      `硬花 ${p.flowers.length} × ${flowerFactor}`,
      p.flowers.length * flowerFactor,
    );
    let soft = 0;
    if (suits.size === 2) soft++;
    if (!s.seven) {
      if (s.pair >= 27) soft++;
      soft += s.groups.filter((g) => g[0] >= 27 && g[0] === g[1]).length;
      soft += p.melds.filter((m) => kind(m.tiles[0]) >= 27).length;
      const closedWait =
        oneWait && s.groups.some((g) => g[0] !== g[1] && g[1] === winKind);
      const edgeWait =
        oneWait &&
        s.groups.some(
          (g) =>
            g[0] !== g[1] &&
            ((g[0] % 9 === 0 && g[2] === winKind) ||
              (g[0] % 9 === 6 && g[0] === winKind)),
        );
      if ((closedWait || edgeWait) && ctx.visiblePungs?.includes(winKind)) {
        add("压绝", 40);
        big = true;
      } else if (closedWait || edgeWait)
        add(closedWait ? "压档" : "边枝", flowerFactor);
      else if (oneWait && s.pair === winKind) add("独占", flowerFactor);
    }
    add(`软花 ${soft} × ${flowerFactor}`, soft * flowerFactor);
    // All major patterns, including the winning-tile-dependent 压绝, must
    // be classified before applying the open ordinary-hand flower minimum.
    if (!closed && !big && p.flowers.length < rules.minimumFlowers) continue;
    let total = items.reduce((sum, i) => sum + i.value, 0);
    if (ctx.doubled) {
      add("比下胡 × 2", total);
      total *= 2;
    }
    if (!best || total > best.total)
      best = { total, items, kinds: hand.map(kind) };
  }
  return best;
}
export function winningKinds(p: Player, rules: Rules): number[] {
  const owned = counts([...p.hand, ...p.melds.flatMap((m) => m.tiles)]);
  return Array.from({ length: 31 }, (_, k) => k).filter(
    (k) => owned[k] < 4 && scoreHand(p, rules, { tile: k * 4 }),
  );
}
