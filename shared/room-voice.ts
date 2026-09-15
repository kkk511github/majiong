/** Small, interoperable mono PCM clips; no compressed/untrusted decoder on server. */
export const VOICE_RATE = 16000;
export const VOICE_MAX_SECONDS = 15;
export const VOICE_MAX_BYTES = 44 + VOICE_RATE * 2 * VOICE_MAX_SECONDS;
export interface RoomVoiceMessage {
  id: string;
  game: string;
  sender: string;
  name: string;
  seat: number;
  at: number;
  duration: number;
  audio: string;
}
export function voiceDuration(bytes: Uint8Array): number {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, n: number) =>
    String.fromCharCode(...bytes.subarray(at, at + n));
  if (
    bytes.length < 44 ||
    bytes.length > VOICE_MAX_BYTES ||
    text(0, 4) !== "RIFF" ||
    text(8, 8) !== "WAVEfmt " ||
    text(36, 4) !== "data" ||
    d.getUint32(4, true) !== bytes.length - 8 ||
    d.getUint32(16, true) !== 16 ||
    d.getUint16(20, true) !== 1 ||
    d.getUint16(22, true) !== 1 ||
    d.getUint32(24, true) !== VOICE_RATE ||
    d.getUint32(28, true) !== VOICE_RATE * 2 ||
    d.getUint16(32, true) !== 2 ||
    d.getUint16(34, true) !== 16 ||
    d.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2
  )
    throw Error("语音格式不正确");
  const duration = (bytes.length - 44) / (VOICE_RATE * 2);
  if (duration < 0.4 || duration > VOICE_MAX_SECONDS)
    throw Error("语音需要 0.4–15 秒");
  return duration;
}
export function encodeVoice(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < VOICE_RATE ||
    sampleRate > 192000
  )
    throw Error("录音采样率不正确");
  const length = Math.min(
    Math.floor((samples.length * VOICE_RATE) / sampleRate),
    VOICE_RATE * VOICE_MAX_SECONDS,
  );
  const b = new Uint8Array(44 + length * 2),
    d = new DataView(b.buffer);
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i);
  };
  str(0, "RIFF");
  d.setUint32(4, b.length - 8, true);
  str(8, "WAVEfmt ");
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, VOICE_RATE, true);
  d.setUint32(28, VOICE_RATE * 2, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  str(36, "data");
  d.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const from = Math.floor((i * sampleRate) / VOICE_RATE),
      to = Math.min(
        samples.length,
        Math.floor(((i + 1) * sampleRate) / VOICE_RATE),
      );
    let v = 0;
    for (let j = from; j < to; j++) v += samples[j];
    v /= Math.max(1, to - from);
    d.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, v)) * 32767),
      true,
    );
  }
  return b;
}
