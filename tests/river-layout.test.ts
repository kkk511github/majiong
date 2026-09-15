import { expect, it } from "vitest";
import { riverLayoutFor } from "../src/river-layout";

// Reference outputs captured from published commit 754750e (0.6.10).
it.each([
  [[568, 150, 34, 150, 1, 6, 150, 22], 19],
  [[800, 188, 48, 188, 1, 6, 188, 26], 26],
  [[853, 190, 48, 190, 1, 6, 190, 30], 29],
  [[960, 224, 48, 224, 1, 6, 224, 35], 32.5],
  [[1280, 280, 48, 280, 1, 6, 280, 48], 43.35443037974683],
] as const)("牌池在原视口上限之后增大20%：%j", (inputs, prior) => {
  const layout = riverLayoutFor(inputs[0], inputs[1], inputs[2], inputs[3], inputs[4], inputs[5], inputs[6], inputs[7]);
  expect(layout.tileHeight).toBeCloseTo(prior * 1.2, 6);
  expect(layout.farTileHeight).toBe(layout.tileHeight);
});
