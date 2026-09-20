import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ROOM_PHRASES, type RoomPhraseId } from "../shared/room-phrases";
import { phraseAudioUrl } from "../src/phrase-audio";
import { GameAudio } from "../src/audio";
import manifest from "../public/audio/phrases/manifest.json";

const players: GameAudio[] = [];
afterEach(() => { players.splice(0).forEach(player => player.dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });
const response = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
function fixture() {
  const gain = () => ({ gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
  const sources: any[] = [];
  const context = { state: "running", currentTime: 4, resume: vi.fn(async () => {}), suspend: vi.fn(async () => {}), close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({ duration: 2 })), createBufferSource: vi.fn(() => {
      const source = { buffer: undefined, playbackRate: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      sources.push(source); return source;
    }) };
  const player = new GameAudio() as any; players.push(player);
  player.context = context; player.musicGain = gain(); player.effectsGain = gain(); player.voiceGain = gain(); player.phraseGain = gain();
  player.voice = { stop: vi.fn(), dispose: vi.fn(), setEnabled: vi.fn(), setPack: vi.fn() };
  player.table = true; player.unlock = vi.fn(); player.ensureMusic = vi.fn();
  const fetcher = vi.fn(async () => response()); vi.stubGlobal("fetch", fetcher);
  return { player: player as GameAudio, raw: player, context, sources, fetcher };
}

describe("用户原始南京话短句录音", () => {
  it.each(["male", "female"] as const)("%s 十二句均有合法稳定路径、原始SHA及正常解码信息", gender => {
    expect(Object.keys(manifest.packs[gender])).toEqual(ROOM_PHRASES.map(p => p.id));
    for (const phrase of ROOM_PHRASES) {
      const clip = manifest.packs[gender][phrase.id];
      expect(phraseAudioUrl(phrase.id, gender)).toBe(clip.file);
      expect(clip.source).toContain(`/${phrase.id}_`);
      const bytes = readFileSync("public" + clip.file);
      expect(bytes.length).toBe(clip.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(clip.sourceSha256);
      expect(clip.sha256).toBe(clip.sourceSha256);
      expect(clip.duration).toBeGreaterThan(.3); expect(clip.duration).toBeLessThan(15);
      expect(clip.decodedFrames).toBeGreaterThan(0); expect(clip.rms).toBeGreaterThan(.003);
    }
  });
  it("不能用自定义路径或未登记ID读取音频", () => {
    expect(() => phraseAudioUrl("../other" as RoomPhraseId, "male")).toThrow();
    expect(() => phraseAudioUrl("chat_13" as RoomPhraseId, "male")).toThrow();
    expect(() => phraseAudioUrl("chat_01", "other" as any)).toThrow();
  });
});

describe("短句本地播放与优先级", () => {
  it("保留原速、使用独立音量、只压低BGM且不停止正常报牌", async () => {
    const { player, raw, sources } = fixture(), notice = vi.fn();
    const stop = player.playChatPhrase("chat_01", "male", .4, notice);
    expect(notice).toHaveBeenLastCalledWith("loading");
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(notice).toHaveBeenLastCalledWith("playing");
    expect(sources[0].playbackRate.value).toBe(1); expect(sources[0].connect).toHaveBeenCalledWith(raw.phraseGain);
    expect(raw.phraseGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.4, 4, .015);
    expect(raw.musicGain.gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.38 * .85 * .3);
    expect(raw.voiceGain.gain.setTargetAtTime.mock.lastCall[0]).toBe(.85);
    expect(raw.voice.stop).not.toHaveBeenCalled();
    sources[0].onended(); stop();
    expect(notice.mock.calls.map((call: string[]) => call[0])).toEqual(["loading", "playing", "ended"]);
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    expect(raw.musicGain.gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.38 * .85);
  });
  it("后来的短句替换旧句，旧解码结果和旧stop句柄都不能干扰新句", async () => {
    const { player, context, sources } = fixture();
    let finishFirst!: (buffer: { duration: number }) => void;
    context.decodeAudioData.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
    const firstNotice = vi.fn(), secondNotice = vi.fn();
    const oldStop = player.playChatPhrase("chat_01", "male", .6, firstNotice);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    player.playChatPhrase("chat_02", "female", .6, secondNotice);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(firstNotice).toHaveBeenLastCalledWith("cancelled");
    finishFirst({ duration: 2 }); await Promise.resolve(); await Promise.resolve(); oldStop();
    expect(sources).toHaveLength(1); expect(sources[0].stop).not.toHaveBeenCalled();
    expect(secondNotice).toHaveBeenLastCalledWith("playing");
  });
  it.each(["recording", "playing"] as const)("真人%s优先，中止短句并阻止新短句双播", async state => {
    const { player, sources, fetcher } = fixture(), first = vi.fn(), second = vi.fn();
    player.playChatPhrase("chat_03", "male", .8, first);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    player.setCommunication(state);
    expect(first).toHaveBeenLastCalledWith("cancelled"); expect(sources[0].stop).toHaveBeenCalledOnce();
    player.playChatPhrase("chat_04", "female", .8, second);
    expect(second).toHaveBeenLastCalledWith("cancelled"); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("后台/聊天关闭会停止，音量变动立即跟随设置且不会恢复旧短句", async () => {
    const { player, raw, sources } = fixture(), notice = vi.fn();
    player.playChatPhrase("chat_05", "male", .8, notice);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    player.configure({ ...raw.preferences, voiceVolume: .2 }, true);
    expect(raw.phraseGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.2, 4, .015);
    player.configure({ ...raw.preferences, chat: false }, true);
    expect(notice).toHaveBeenLastCalledWith("cancelled"); expect(sources[0].stop).toHaveBeenCalledOnce();
    player.configure({ ...raw.preferences, chat: true }, true);
    expect(sources).toHaveLength(1);
    player.playChatPhrase("chat_06", "female", .2, notice);
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    player.setVisible(false); expect(notice).toHaveBeenLastCalledWith("cancelled"); expect(sources[1].stop).toHaveBeenCalledOnce();
  });
  it("解锁超时只失败一次，之后恢复不能补播旧消息", async () => {
    vi.useFakeTimers();
    const { player, context, sources, fetcher } = fixture(), notice = vi.fn();
    let resume!: () => void;
    context.state = "suspended"; context.resume.mockImplementation(() => new Promise<void>(resolve => { resume = resolve; }));
    player.playChatPhrase("chat_07", "male", .8, notice);
    await vi.advanceTimersByTimeAsync(4100);
    expect(notice.mock.calls.map((call: string[]) => call[0])).toEqual(["loading", "failed"]);
    context.state = "running"; resume(); await Promise.resolve(); await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled(); expect(sources).toHaveLength(0);
  });
  it("取消下载会Abort，缓存仅来自成功解码，静音不加载", async () => {
    const { player, fetcher, sources } = fixture(), notice = vi.fn();
    let resolveFetch!: (value: ReturnType<typeof response>) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveFetch = resolve; }));
    const stop = player.playChatPhrase("chat_08", "male", .8, notice);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const signal = (fetcher.mock.calls[0] as any[])[1].signal as AbortSignal;
    stop(); expect(signal.aborted).toBe(true); resolveFetch(response()); await Promise.resolve(); await Promise.resolve();
    expect(sources).toHaveLength(0); expect(notice).toHaveBeenLastCalledWith("cancelled");
    player.playChatPhrase("chat_09", "female", 0, notice); expect(fetcher).toHaveBeenCalledOnce();
  });
});
