import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tileName } from "../shared/tiles";
import approved from "./fixtures/voice-content-sha256.json";
import provenance from "../docs/nanjing-voice-import.json";
import female from "../src/nanjing-female.json";
import male from "../src/nanjing-male.json";

describe("随 App 打包的南京话语音", () => {
  it.each(["male", "female"] as const)(
    "%s 实际片段按牌面排列，筒条不再按错误文件名互换",
    (gender) => {
      const pack = gender === "male" ? male : female;
      const bytes = readFileSync("public" + pack.file);
      const verifiedCodes = [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 33, 34, 35, 36, 37, 38, 39, 40, 41, 17, 18,
        19, 20, 21, 22, 23, 24, 25, 49, 50, 51, 52,
      ];
      for (let k = 0; k < 31; k++) {
        const name = tileName(k * 4);
        const [start, duration] = pack.cues[k];
        const pcm = bytes.subarray(
          44 + Math.round(start * 24000) * 2,
          44 + Math.round((start + duration) * 24000) * 2,
        );
        // Fixed content fingerprints, independent of current importer manifest/cue offsets.
        expect(
          createHash("sha256").update(pcm).digest("hex"),
          `${gender} ${name}`,
        ).toBe((approved[gender] as Record<string, string>)[name]);
        const entry = (provenance.packs[gender] as Record<string, any>)[
          `card_${verifiedCodes[k]}`
        ];
        expect(entry.spoken).toBe(name);
        expect(entry.tileKind).toBe(k);
        expect(entry.cue).toEqual(pack.cues[k]);
      }
      const twoWan = provenance.packs[gender].card_2;
      expect(twoWan.edits.map((p) => p.spoken)).toEqual(["二", "万"]);
      expect(twoWan.edits.every((p) => !p.source.startsWith("card_2_"))).toBe(
        true,
      );
    },
  );
  it.each([female, male])("男女语音片段有声音、无削波且不越界", (pack) => {
    const bytes = readFileSync("public" + pack.file);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    const rate = bytes.readUInt32LE(24);
    expect(rate).toBe(24000);
    expect(bytes.readUInt16LE(22)).toBe(1);
    expect(bytes.readUInt16LE(34)).toBe(16);
    expect(pack.cues).toHaveLength(34);
    for (const name of [
      "碰",
      "杠",
      "暗杠",
      "补杠",
      "补花",
      "胡了",
      "自摸",
      "听",
    ])
      expect(pack.actions).toHaveProperty(name);
    const all = [
      ...new Map(
        [...pack.cues, ...Object.values(pack.actions)].map((cue) => [
          cue[0],
          cue,
        ]),
      ).values(),
    ].sort((a, b) => a[0] - b[0]);
    let previousEnd = 0;
    for (const [start, duration] of all) {
      expect(start).toBeGreaterThanOrEqual(previousEnd - 0.000002);
      expect(duration).toBeGreaterThan(0.2);
      expect(duration).toBeLessThan(4.5);
      const a = Math.round(start * rate),
        b = Math.round((start + duration) * rate);
      expect(44 + b * 2).toBeLessThanOrEqual(bytes.length + 2);
      let energy = 0,
        peak = 0;
      for (let i = a; i < b; i++) {
        const n = bytes.readInt16LE(44 + i * 2) / 32768;
        energy += n * n;
        peak = Math.max(peak, Math.abs(n));
      }
      expect(peak).toBeGreaterThan(0.03);
      expect(peak).toBeLessThan(0.99);
      expect(Math.sqrt(energy / (b - a))).toBeGreaterThan(0.006);
      previousEnd = start + duration;
    }
  });
});
