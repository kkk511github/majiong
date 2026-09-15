import type { Tile } from "./types";
export const kind = (tile: Tile) =>
  tile < 136 ? Math.floor(tile / 4) : tile - 102;
export const isFlower = (tile: Tile) => kind(tile) >= 31;
const nums = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const honors = [
  "东",
  "南",
  "西",
  "北",
  "中",
  "发",
  "白",
  "春",
  "夏",
  "秋",
  "冬",
  "梅",
  "兰",
  "竹",
  "菊",
];
export function tileName(tile: Tile): string {
  const k = kind(tile);
  return k < 27
    ? nums[k % 9] + ["万", "筒", "条"][Math.floor(k / 9)]
    : honors[k - 27];
}
export const sortTiles = (tiles: Tile[]) =>
  tiles.sort((a, b) => kind(a) - kind(b) || a - b);
export type ShuffleRandom =
  (() => number) | { index: (limit: number) => number };
export const secureShuffleRandom: ShuffleRandom = {
  index(limit) {
    const cutoff = Math.floor(0x100000000 / limit) * limit;
    const value = new Uint32Array(1);
    do {
      globalThis.crypto.getRandomValues(value);
    } while (value[0] >= cutoff);
    return value[0] % limit;
  },
};
export function createWall(
  random: ShuffleRandom = secureShuffleRandom,
): Tile[] {
  const tiles = Array.from({ length: 144 }, (_, i) => i);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j =
      typeof random === "function"
        ? Math.floor(random() * (i + 1))
        : random.index(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw Error("洗牌随机源无效");
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}
export function counts(tiles: Tile[]): number[] {
  const c = Array(31).fill(0);
  for (const t of tiles) {
    const k = kind(t);
    if (k < 31) c[k]++;
  }
  return c;
}
export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
