import { counts, kind } from "./tiles";
import type { Tile } from "./types";

export interface Shape {
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
