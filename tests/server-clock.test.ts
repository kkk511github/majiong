import { describe, expect, it } from "vitest";
import { ServerClock } from "../src/server-clock";
import { decisionCountdown } from "../shared/timing";
import { createGame, newPlayer, startRound, viewFor } from "../shared/engine";
import { normalizeTableSettings } from "../shared/table-settings";

function setup() {
  const time = { local: 100, wall: 86_400_000 };
  const clock = new ServerClock(
    () => time.local,
    () => time.wall,
  );
  return { time, clock };
}
describe("服务器校时", () => {
  it("旧服务器没有时间戳时保留本机时间，新服务器首个消息立即校准", () => {
    const { time, clock } = setup();
    clock.observe(undefined);
    clock.observe(NaN);
    expect(clock.now()).toBe(time.wall);
    clock.observe(1_000_000);
    time.local += 2300;
    time.wall -= 6 * 3600_000;
    expect(clock.now()).toBe(1_002_300);
    clock.observe(999_000); // A delayed push cannot turn the clock back.
    expect(clock.now()).toBe(1_002_300);
  });
  it("按往返时间中点校准，拒绝迟到或无效样本", () => {
    const { time, clock } = setup();
    time.local = 140;
    clock.sample(1000, 100);
    expect(clock.now()).toBe(1020);
    time.local = 240;
    clock.sample(200, 0); // Slower than the known 40 ms sample.
    expect(clock.now()).toBe(1120);
    clock.sample(Infinity, 230);
    clock.sample(99999, 300);
    clock.sample(99999, NaN);
    clock.sample(99999, -10000);
    expect(clock.now()).toBe(1120);
    clock.sample(1120, 220); // A fresh 20 ms sample is accepted.
    expect(clock.now()).toBe(1130);
  });
  it("从后台返回允许重新校时，换连接时不会继承旧服务器的基准", () => {
    const { time, clock } = setup();
    clock.sample(1000, 80);
    time.local = 200;
    clock.resample();
    clock.sample(61_000, 100);
    expect(clock.now()).toBe(61_050);
    clock.reset();
    expect(clock.now()).toBe(time.wall);
    clock.observe(80_000);
    expect(clock.now()).toBe(80_000);
  });
  it.each([-6, 6])("手机快慢 %s 小时不影响10秒出牌与整桌90秒累计超时", (hours) => {
    const { time, clock } = setup();
    time.wall = 1_000_000 + hours * 3600_000;
    const g = createGame("123456", "clock", { turnSeconds: 10 });
    g.table = {
      creatorId: "admin",
      groupId: "clock",
      number: 1,
      createdAt: 1_000_000,
      settings: normalizeTableSettings(),
    };
    g.players = [0, 1, 2, 3].map((i) => ({
      ...newPlayer(String(i), String(i)),
      ready: true,
    }));
    const playing = startRound(g, 1_000_000, () => 0.51);
    playing.players[playing.turn]!.overtimeUsedMs = 6000;
    const view = viewFor(playing, playing.turn);
    clock.observe(1_000_000);
    expect(decisionCountdown(view, clock.now())).toEqual({
      seconds: 10,
      overtime: false,
    });
    time.local += 12_000;
    time.wall += 24 * 3600_000;
    expect(decisionCountdown(view, clock.now())).toEqual({
      seconds: 82,
      overtime: true,
    });
    time.local += 88_000;
    expect(decisionCountdown(view, clock.now())).toEqual({
      seconds: 0,
      overtime: true,
    });
    expect(view.players[view.me]!.overtimeUsedMs).toBe(6000);
  });
});
