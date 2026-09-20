import { expect, it } from "vitest";
import { nextCompassMemory, sceneOffset } from "../shared/table-scene";

type State = Parameters<typeof nextCompassMemory>[0];
const state = (changes: Partial<State> = {}): State => ({
  key: "table-a", round: 1, revision: 20, connected: true, ...changes,
});

it("碰走后保留本把真实出牌者，下一次实际弃牌才切换", () => {
  const discard = nextCompassMemory(state({ lastDiscard: { tile: 12, seat: 3 } }));
  const claimed = nextCompassMemory(state({ revision: 21 }), discard);
  const drawn = nextCompassMemory(state({ revision: 22 }), claimed);
  expect([discard, claimed, drawn].map(memory => memory.lastDiscardSeat)).toEqual([3, 3, 3]);
  expect(nextCompassMemory(state({ revision: 23, lastDiscard: { tile: 24, seat: 1 } }), drawn).lastDiscardSeat).toBe(1);
});

it.each([0, 1, 2, 3])("观看座位%i：风位随视角映射，不固定东在下", me => {
  for (const seat of [0, 1, 2, 3]) {
    const memory = nextCompassMemory(state({ lastDiscard: { tile: 12, seat } }));
    const offset = sceneOffset(memory.lastDiscardSeat!, me);
    expect((me + offset) % 4).toBe(seat);
    expect(["东", "南", "西", "北"][(me + offset) % 4]).toBe(["东", "南", "西", "北"][seat]);
  }
});

it.each([{ key: "table-b" }, { round: 2 }, { revision: 19 }, { presentation: "replay" as const }])("切换上下文%j不会带入上一处出牌者", changes => {
  const previous = nextCompassMemory(state({ lastDiscard: { tile: 12, seat: 2 } }));
  expect(nextCompassMemory(state(changes), previous).lastDiscardSeat).toBeUndefined();
  expect(nextCompassMemory(state({ ...changes, lastDiscard: { tile: 16, seat: 0 } }), previous).lastDiscardSeat).toBe(0);
});

it("回放只在连续帧保留被碰走的弃牌；跳转时使用目标帧公开信息", () => {
  const previous = nextCompassMemory(state({ presentation: "replay", lastDiscard: { tile: 12, seat: 2 } }));
  expect(nextCompassMemory(state({ presentation: "replay", revision: 21 }), previous).lastDiscardSeat).toBe(2);
  expect(nextCompassMemory(state({ presentation: "replay", revision: 20 }), previous).lastDiscardSeat).toBe(2);
  expect(nextCompassMemory(state({ presentation: "replay", revision: 30 }), previous).lastDiscardSeat).toBeUndefined();
  expect(nextCompassMemory(state({ presentation: "replay", revision: 3 }), previous).lastDiscardSeat).toBeUndefined();
});

it("重连不把断线前的旧弃牌冒充当前最近弃牌", () => {
  const previous = nextCompassMemory(state({ lastDiscard: { tile: 12, seat: 2 } }));
  const offline = nextCompassMemory(state({ connected: false }), previous);
  expect(nextCompassMemory(state({ revision: 28 }), offline).lastDiscardSeat).toBeUndefined();
  expect(nextCompassMemory(state({ revision: 28, lastDiscard: { tile: 20, seat: 1 } }), offline).lastDiscardSeat).toBe(1);
});

it("同帧合并前逐条观察弃牌与碰牌，避免遗漏出牌侧", () => {
  let memory = nextCompassMemory(state({ lastDiscard: { tile: 12, seat: 0 } }));
  for (const snapshot of [state({ revision: 21, lastDiscard: { tile: 20, seat: 3 } }), state({ revision: 22 })])
    memory = nextCompassMemory(snapshot, memory);
  expect(memory.lastDiscardSeat).toBe(3);
});
