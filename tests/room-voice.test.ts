import { expect, it, afterEach, vi } from "vitest";
import { encodeVoice, voiceDuration } from "../shared/room-voice";
import { VoiceRecorder } from "../src/voice-recorder";
it("16k PCM语音采样保留波形，规范头、时长、上限严格验证", () => {
  const samples = Float32Array.from(
    { length: 48000 },
    (_, i) => Math.sin(i * 0.02) * 0.5,
  );
  const wav = encodeVoice(samples, 48000);
  expect(wav.length).toBe(32044);
  expect(voiceDuration(wav)).toBe(1);
  const d = new DataView(wav.buffer as ArrayBuffer);
  expect(d.getInt16(44 + 1000 * 2, true) / 32767).toBeCloseTo(
    (samples[3000] + samples[3001] + samples[3002]) / 3,
    4,
  );
  for (const offset of [0, 4, 8, 16, 20, 22, 24, 28, 32, 34, 36, 40]) {
    const bad = wav.slice();
    bad[offset] ^= 1;
    expect(() => voiceDuration(bad)).toThrow();
  }
  expect(() => voiceDuration(new Uint8Array())).toThrow();
  expect(() =>
    voiceDuration(encodeVoice(new Float32Array(100), 16000)),
  ).toThrow();
  expect(voiceDuration(encodeVoice(new Float32Array(16000 * 20), 16000))).toBe(
    15,
  );
  expect(() => encodeVoice(samples, NaN)).toThrow();
});
afterEach(() => vi.unstubAllGlobals());
it("等待麦克风权限时松开/离开，迟到的授权也必须立即停麦，不能发送", async () => {
  let grant!: (s: MediaStream) => void;
  const stop = vi.fn();
  const audioSession = { type: "playback" };
  vi.stubGlobal("navigator", {
    audioSession,
    mediaDevices: {
      getUserMedia: () => new Promise<MediaStream>((r) => (grant = r)),
    },
  });
  const recorder = new VoiceRecorder();
  const started = recorder.start(vi.fn());
  expect(audioSession.type).toBe("play-and-record");
  expect(recorder.finish(true)).toBeUndefined();
  expect(audioSession.type).toBe("playback");
  grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  expect(await started).toBe(false);
  expect(stop).toHaveBeenCalledTimes(1);
});

it("iOS在申请录音前切换音频会话，权限拒绝后恢复背景音乐模式", async () => {
  const audioSession = { type: "playback" };
  vi.stubGlobal("navigator", {
    audioSession,
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        expect(audioSession.type).toBe("play-and-record");
        throw new Error("permission denied");
      }),
    },
  });
  await expect(new VoiceRecorder().start(vi.fn())).rejects.toThrow(
    "permission denied",
  );
  expect(audioSession.type).toBe("playback");
});
