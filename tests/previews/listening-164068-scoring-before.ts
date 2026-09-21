// Preview-only historical source. Production never imports this file.
// Original: shared/scoring.ts
// Commit: 8b1c03f8258de9085325cd5845b94a28dd91a2b7 (parent of the 5d34034 fix)
// Original SHA-256: c30ab82d951554608ae601c24105ac7983e75cfbc26c5267a27dcf87634bae1e
// Only import paths changed; all original scoring semantics are preserved.
import { counts, kind } from "../../shared/tiles";
import type { Player, Rules, Tile, WinScore, Seat } from "../../shared/types";
import { shapes } from "../../shared/hand-shapes";
import { isNanjingV2 } from "../../shared/nanjing-rules";
import { scoreNanjingHand } from "./listening-164068-scoring-nanjing-before";
export { shapes } from "../../shared/hand-shapes";

export interface WinContext {
  seat?: Seat;
  robbed?: boolean;
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
  multiplier?: number;
  snapshot?: boolean;
  snapshotGroup?: number[];
}
export function scoreHand(
  p: Player,
  rules: Rules,
  ctx: WinContext = {},
): WinScore | null {
  if (isNanjingV2(rules)) return scoreNanjingHand(p, rules, ctx);
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
export function winningKinds(
  p: Player,
  rules: Rules,
  context: Pick<WinContext, "visiblePungs" | "earthly" | "seat"> = {},
): number[] {
  const owned = counts([...p.hand, ...p.melds.flatMap((m) => m.tiles)]);
  return Array.from({ length: 31 }, (_, k) => k).filter(
    (k) => owned[k] < 4 && scoreHand(p, rules, { ...context, tile: k * 4 }),
  );
}
