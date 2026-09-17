import { describe, expect, it, vi } from "vitest";
import { gameCues, GameAudio } from "../src/audio";
import { act, createGame, newPlayer, startRound, viewFor } from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import type { Game } from "../shared/types";

function table() {
  const g = createGame("123456", "sound-test");
  g.players = [0, 1, 2, 3].map(i => { const p = newPlayer(String(i), `牌友${i}`); p.ready = true; return p; });
  return g;
}
describe("对局声音跟随已确认的牌局", () => {
  it("开局发牌，落牌后才播放落牌声；重复状态和在线状态更新不重复响", () => {
    const waiting = table(), playing = startRound(waiting, 1000, seededRandom(43));
    expect(gameCues(viewFor(waiting, 0), viewFor(playing, 0))).toEqual(["deal"]);
    const after = act(playing, 0, {type: "discard", tile: playing.players[0]!.hand[0]}, 2000);
    expect(gameCues(viewFor(playing, 0), viewFor(after, 0))).toContain("discard");
    const presence: Game = structuredClone(after); presence.players[2]!.online = false; presence.revision++;
    expect(gameCues(viewFor(after, 0), viewFor(presence, 0))).toEqual([]);
    expect(gameCues(viewFor(after, 0), viewFor(after, 0))).toEqual([]);
  });
  it("回到大厅与恢复结算页不播放发牌声", () => {
    const g = startRound(table(), 1000, seededRandom(2));
    g.phase = "ended"; g.result = {reason: "draw", winners: [], details: {}, deltas: [0,0,0,0]};
    expect(gameCues(null, viewFor(g, 0))).toEqual([]);
    expect(gameCues(viewFor(g, 0), null)).toEqual([]);
  });
});


it("试听恢复超时后不播迟到语音，也不修改静音设置", async () => {
  vi.useFakeTimers();
  try {
    const a = new GameAudio() as any;
    let resume!: () => void;
    a.context = { resume: () => new Promise<void>(resolve => { resume = resolve; }) };
    a.unlock = vi.fn();
    a.voice = { stop: vi.fn(), setEnabled: vi.fn(), say: vi.fn() };
    const before = { ...a.preferences }, notice = vi.fn();
    a.previewVoice(notice);
    expect(notice).toHaveBeenLastCalledWith("loading");
    await vi.advanceTimersByTimeAsync(10000);
    expect(notice).toHaveBeenLastCalledWith("failed");
    resume();
    await Promise.resolve();
    expect(a.voice.say).not.toHaveBeenCalled();
    expect(a.preferences).toEqual(before);
  } finally { vi.useRealTimers(); }
});
