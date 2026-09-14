import { afterEach, describe, expect, it, vi } from "vitest";
import { TileVoice, discardedVoice, type VoiceSprite } from "../src/tile-voice";
import { createGame, newPlayer, startRound, viewFor } from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import type { Seat } from "../shared/types";

function before() {
  const g = createGame("voice", "voice-session");
  g.players = [0, 1, 2, 3].map((i) => {
    const p = newPlayer(String(i), `牌友${i}`);
    p.ready = true;
    return p;
  });
  return viewFor(startRound(g, 1000, seededRandom(54)), 0);
}
function fixture(file = "/audio/fixture.wav") {
  const sources: any[] = [];
  const context = {
    state: "running",
    decodeAudioData: vi.fn(async () => ({ duration: 100 })),
    createBufferSource: vi.fn(() => {
      const s = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(s);
      return s;
    }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  const pack: VoiceSprite = {
    file,
    cues: Array.from({ length: 34 }, (_, i) => [i * 2, 0.8]),
  };
  const activity = vi.fn();
  const player = new TileVoice(context as any, {} as AudioNode, activity, pack);
  return { player, context, sources, activity };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("四家报牌", () => {
  it("四个座位只报服务器确认的新弃牌，同牌面不同实体也各报一次", () => {
    let a = before();
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const b = structuredClone(a);
      b.revision++;
      b.lastDiscard = { seat, tile: 96 + seat };
      expect(discardedVoice(a, b)?.tile).toBe(96 + seat);
      expect(discardedVoice(b, b)).toBeUndefined();
      const presence = structuredClone(b);
      presence.revision++;
      presence.players[seat]!.online = false;
      expect(discardedVoice(b, presence)).toBeUndefined();
      a = b;
    }
  });
  it("重连、换桌、换局、摸牌不报；最后一次弃牌导致流局仍报牌", () => {
    const a = before(),
      b = structuredClone(a);
    b.revision++;
    b.lastDiscard = { seat: 1, tile: 108 };
    expect(discardedVoice(null, b)).toBeUndefined();
    expect(discardedVoice(a, { ...b, id: "other" })).toBeUndefined();
    expect(discardedVoice(a, { ...b, round: b.round + 1 })).toBeUndefined();
    expect(
      discardedVoice(a, { ...b, lastDiscard: undefined, lastDraw: 96 }),
    ).toBeUndefined();
    expect(
      discardedVoice(a, {
        ...b,
        phase: "ended",
        result: {
          reason: "draw",
          winners: [],
          details: {},
          deltas: [0, 0, 0, 0],
        },
      })?.tile,
    ).toBe(108);
  });
  it("同一音频只解码一次，按顺序播放正确牌名片段，不重叠、不重复", async () => {
    const { player, context, sources } = fixture();
    player.setEnabled(true);
    player.say("a", 96);
    player.say("b", 0);
    player.say("a", 96);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].start).toHaveBeenCalledWith(0, 48, 0.8);
    sources[0].onended();
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[1].start).toHaveBeenCalledWith(0, 0, 0.8);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    player.dispose();
  });
  it("iOS 内置媒体返回状态 0 时仍读取并解码，成功播放对应牌名", async () => {
    const { player, context, sources } = fixture();
    vi.stubGlobal("location", new URL("capacitor://localhost/index.html"));
    const bytes = new ArrayBuffer(32);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 0,
      arrayBuffer: async () => bytes,
    } as Response);
    player.setEnabled(true);
    player.say("ios", 96);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(context.decodeAudioData).toHaveBeenCalledWith(bytes);
    expect(sources[0].start).toHaveBeenCalledWith(0, 48, 0.8);
    player.dispose();
  });
  it.each([
    ["https://example.test/", "/audio/fixture.wav", 0],
    ["capacitor://localhost/", "https://example.test/fixture.wav", 0],
    ["capacitor://localhost/", "capacitor://other/fixture.wav", 0],
    ["capacitor://localhost/", "/audio/fixture.wav", 404],
  ])("继续拒绝远程或失败的媒体响应 %s %s %i", async (page, file, status) => {
    const { player, context, sources } = fixture(file);
    vi.stubGlobal("location", new URL(page));
    const body = vi.fn(async () => new ArrayBuffer(32));
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status,
      arrayBuffer: body,
    } as unknown as Response);
    player.setEnabled(true);
    player.say("rejected", 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(body).not.toHaveBeenCalled();
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(sources).toHaveLength(0);
    player.dispose();
  });
  it("静音/离桌立即停声并清空排队，恢复不会补播旧牌", async () => {
    const { player, sources } = fixture();
    player.setEnabled(true);
    player.say("a", 96);
    player.say("b", 0);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    player.setEnabled(false);
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    player.setEnabled(true);
    player.say("a", 96);
    player.say("c", 4);
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[1].start).toHaveBeenCalledWith(0, 2, 0.8);
    player.dispose();
  });
  it("音频加载失败后短暂退避，网络恢复可重试而不回放失败时的旧牌", async () => {
    const { player, sources } = fixture();
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    player.setEnabled(true);
    player.say("offline", 0);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    player.say("too-soon", 4);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(0);
    now.mockReturnValue(17000);
    player.say("recovered", 8);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].start).toHaveBeenCalledWith(0, 4, 0.8);
    expect(fetch).toHaveBeenCalledTimes(2);
    player.dispose();
    now.mockRestore();
  });
  it("网络/解码延迟的旧报牌过期丢弃，后台未解锁不排队", async () => {
    const { player, context, sources } = fixture();
    vi.spyOn(Date, "now").mockReturnValue(1000);
    let finish!: (x: any) => void;
    context.decodeAudioData.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    player.setEnabled(true);
    player.say("a", 96);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalled());
    vi.spyOn(Date, "now").mockReturnValue(5000);
    finish({ duration: 100 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sources).toHaveLength(0);
    context.state = "suspended";
    player.say("b", 0);
    context.state = "running";
    player.say("c", 4);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].start).toHaveBeenCalledWith(0, 2, 0.8);
    player.dispose();
    vi.restoreAllMocks();
  });
});
