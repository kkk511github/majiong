import { counts, kind } from "./tiles";
import { shapes, type Shape } from "./hand-shapes";
import { flowerFactor, isNanjingB, nanjingValues } from "./nanjing-rules";
import type { WinContext } from "./scoring";
import type { Player, Rules, WinScore, Seat } from "./types";

/** Shape-only waits, independent of flower eligibility and private opponent information. */
export function structuralWaits(p: Pick<Player, "hand" | "melds">): number[] {
  const own = counts([...p.hand, ...p.melds.flatMap((m) => m.tiles)]);
  return Array.from({ length: 31 }, (_, k) => k).filter(
    (k) => own[k] < 4 && shapes([...p.hand, k * 4], p.melds.length).length > 0,
  );
}

function scoreNanjingBase(
  p: Player,
  rules: Rules,
  ctx: WinContext = {},
): WinScore | null {
  const hand = ctx.tile === undefined ? p.hand : [...p.hand, ctx.tile];
  const allTiles = [...hand, ...p.melds.flatMap((m) => m.tiles)];
  if (
    allTiles.some((t) => !Number.isInteger(t) || t < 0 || t >= 124) ||
    counts(allTiles).some((n) => n > 4)
  )
    return null;
  const snapshot =
    !!ctx.snapshot &&
    ctx.tile === undefined &&
    p.melds.length === 4 &&
    (hand.length === 2 || (hand.length === 1 && p.melds.slice(-1)[0]?.type === "kong"));
  const candidates: Shape[] = snapshot
    ? [
        {
          pair: -1,
          groups: ctx.snapshotGroup ? [ctx.snapshotGroup] : [],
          seven: false,
          quads: 0,
        },
      ]
    : shapes(hand, p.melds.length);
  if (!candidates.length) return null;
  const bProfile = isNanjingB(rules);
  if (ctx.heavenly && !p.melds.length && !bProfile)
    return {
      total: 0,
      items: [{ label: "天胡（三家归零）", value: 0 }],
      kinds: hand.map(kind),
      major: true,
      allIn: true,
    };
  const values = nanjingValues(rules),
    flower = flowerFactor(rules);
  // B-profile heavenly wins charge a fixed amount per opponent, capped by their balance.
  if (ctx.heavenly && !p.melds.length && bProfile)
    return {
      total: values.heavenly,
      items: [{ label: "天胡", value: values.heavenly }],
      kinds: hand.map(kind),
      major: true,
    };
  const all = (snapshot ? p.melds.flatMap((m) => m.tiles) : allTiles).map(kind);
  const suits = new Set(
    all.filter((k) => k < 27).map((k) => Math.floor(k / 9)),
  );
  const winds = all.some((k) => k >= 27);
  const windOnlyB = bProfile && suits.size === 0;
  const closed = p.melds.every(
    (m) => m.concealed || (m.type === "kong" && !m.added),
  );
  const winTile = ctx.tile ?? ctx.winTile,
    winKind = winTile === undefined ? -1 : kind(winTile);
  let oneWait = false;
  if (winTile !== undefined && !snapshot) {
    const before = [...hand];
    const index = before.findIndex((t) => kind(t) === winKind);
    if (index >= 0) before.splice(index, 1);
    oneWait = structuralWaits({ hand: before, melds: p.melds }).length === 1;
  }
  let best: WinScore | null = null;
  for (const shape of candidates) {
    const items: WinScore["items"] = [];
    const add = (label: string, value: number) => {
      if (value) items.push({ label, value });
    };
    let major = false, flowerExempt = false;
    const big = (label: string, value: number, exemptsFlowers = true) => {
      add(label, value);
      major = true;
      flowerExempt ||= exemptsFlowers;
    };
    add("成牌", values.base);
    if (shape.seven && !windOnlyB)
      big(
        ["七对", "双七对", "豪华双七对", "超豪华双七对"][shape.quads],
        values.seven[shape.quads],
      );
    if (!shape.seven && !windOnlyB && shape.groups.every((g) => g[0] === g[1]))
      big("对对胡", values.triplets);
    if (suits.size === 1)
      big(winds ? "混一色" : "清一色", winds ? values.mixed : values.pure);
    if (!suits.size) big(bProfile ? "风一色" : "字一色（按清一色）", values.winds);
    const global = p.melds.length === 4;
    if (global) big("全球独钓", values.global);
    if (closed && !shape.seven && !windOnlyB) add("门清", values.closed);
    if (ctx.earthly) big("地胡", values.earthly);
    const large = ctx.replacement === "kong";
    // B-profile replacement wins add points/trigger 比下胡, but are not an
    // independent hard-flower exemption (175382, round 8).
    if (large) big("大杠开花", values.largeReplacement, !bProfile);
    if (ctx.replacement === "flower") big("小杠开花", values.smallReplacement, !bProfile);
    if (ctx.seaBottom && rules.seaBottom && ctx.tile === undefined)
      add("海底捞月", values.seaBottom);
    let soft = suits.size === 2 ? 1 : 0;
    if (!shape.seven) {
      if (shape.pair >= 27) soft++;
      if (!snapshot)
        soft += shape.groups.filter((g) => g[0] >= 27 && g[0] === g[1]).length;
      for (const meld of p.melds) {
        const wind = kind(meld.tiles[0]) >= 27;
        soft +=
          meld.type === "kong"
            ? (meld.concealed ? 2 : 1) + (wind ? 1 : 0)
            : wind
              ? 1
              : 0;
      }
      if (!global && !snapshot) {
        const middle =
          oneWait &&
          shape.groups.some((g) => g[0] !== g[1] && g[1] === winKind);
        const edge =
          oneWait &&
          shape.groups.some(
            (g) =>
              g[0] !== g[1] &&
              ((g[0] % 9 === 0 && g[2] === winKind) ||
                (g[0] % 9 === 6 && g[0] === winKind)),
          );
        // B-profile 压绝 is the sole middle wait on the fourth tile of another
        // player's exposed pung. It remains a major result for the next round,
        // but does not by itself waive this hand's hard-flower requirement.
        const absolute = bProfile
          ? middle && !p.melds.some((meld) => meld.type === "pung" && kind(meld.tiles[0]) === winKind)
          : middle || edge;
        if (absolute && ctx.visiblePungs?.includes(winKind))
          big("压绝", values.absolute, !bProfile);
        else if (middle || edge) add(middle ? "压档" : "边枝", flower);
        else if (oneWait && shape.pair === winKind) add("独占", flower);
      }
    }
    if (!p.flowers.length && (bProfile || closed || major)) big("无花果", values.noFlower);
    if (!closed && !flowerExempt && p.flowers.length < rules.minimumFlowers) continue;
    add(`硬花 ${p.flowers.length} × ${flower}`, p.flowers.length * flower);
    add(`软花 ${soft} × ${flower}`, soft * flower);
    let total = items.reduce((n, i) => n + i.value, 0);
    if (large && values.largeReplacementMultiplier > 1) {
      add("大杠开花 × 2", total);
      total *= 2;
    }
    const multiplier = ctx.multiplier ?? (ctx.doubled ? 2 : 1);
    if (!Number.isSafeInteger(multiplier) || multiplier < 1)
      throw Error("牌局倍率无效");
    if (multiplier > 1) {
      add(`比下胡 × ${multiplier}`, total * (multiplier - 1));
      total *= multiplier;
    }
    if (!Number.isSafeInteger(total)) throw Error("牌局计分超出安全范围");
    if (!best || total > best.total)
      best = {
        total,
        items,
        kinds: hand.map(kind),
        major,
        ...(snapshot ? { snapshot: true } : {}),
      };
  }
  return best;
}

export function threeMouths(p: Player, seat: Seat): Seat | undefined {
  // Reference rules: the first three mouths, never a later run of three.
  const first = p.melds.slice(0, 3);
  if (first.length < 3) return undefined;
  return ([0, 1, 2, 3] as Seat[]).find(
    (s) =>
      s !== seat &&
      first.some((m) => !m.concealed && m.from === s) &&
      first.every((m) => m.concealed || m.from === s),
  );
}
/** Three same-suit mouths may have any suppliers and may include concealed kongs. */
export function pureMouthSuit(p: Pick<Player, "melds">): number | undefined {
  const first = p.melds.slice(0, 3);
  if (first.length !== 3) return undefined;
  const suit = Math.floor(kind(first[0].tiles[0]) / 9);
  return suit < 3 && first.every(m => m.tiles.every(t => kind(t) < 27 && Math.floor(kind(t) / 9) === suit))
    ? suit : undefined;
}
/** Quick-shot is evaluated on a copy: a shared winning discard must never be duplicated. */
export function scoreNanjingHand(
  p: Player,
  rules: Rules,
  ctx: WinContext = {},
): WinScore | null {
  const { seat, tile, robbed } = ctx;
  let best = scoreNanjingBase(p, rules, ctx);
  if (
    seat === undefined ||
    tile === undefined ||
    p.melds.length !== 3 ||
    robbed
  )
    return best;
  const hand = tile === undefined ? [...p.hand] : [...p.hand, tile];
  if (hand.length !== 5) return best;
  const mouth = threeMouths(p, seat);
  const suit = pureMouthSuit(p) ?? -1;
  const winning = tile ?? ctx.winTile;
  if (winning === undefined) return best;
  for (let a = 0; a < hand.length; a++)
    for (let b = a + 1; b < hand.length; b++)
      for (let c = b + 1; c < hand.length; c++) {
        const tiles = [hand[a], hand[b], hand[c]],
          group = tiles.map(kind).sort((x, y) => x - y);
        if (!tiles.includes(winning)) continue;
        const triplet = group[0] === group[2];
        const pure =
          suit >= 0 && group.every((k) => k < 27 && Math.floor(k / 9) === suit);
        if (!(triplet && (mouth !== undefined || pure))) continue;
        const candidate = {
          ...p,
          hand: [...p.hand],
          melds: p.melds.map((m) => ({ ...m, tiles: [...m.tiles] })),
        };
        candidate.hand = hand.filter((_, i) => i !== a && i !== b && i !== c);
        candidate.melds.push({
          type: "pung",
          tiles,
          from: seat,
          concealed: false,
        });
        const score = scoreNanjingBase(candidate, rules, {
          ...ctx,
          tile: undefined,
          snapshot: true,
          snapshotGroup: group,
        });
        if (score && (!best || score.total > best.total))
          best = { ...score, kinds: hand.map(kind) };
      }
  return best;
}
