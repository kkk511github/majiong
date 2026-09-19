import type { View } from "../shared/types";
import { kind } from "../shared/tiles";
import female from "./nanjing-female.json";
import male from "./nanjing-male.json";

export interface VoiceSprite {
  file: string | null;
  cues: number[][];
  actions?: Record<string, number[]>;
}
export type VoicePlaybackState = "playing" | "ended" | "failed" | "cancelled";
type VoiceNotice = (state: VoicePlaybackState) => void;
export const voicePacks = { female, male };
export const nanjingVoice: VoiceSprite = male;
export const hasNanjingVoice =
  !!nanjingVoice.file && nanjingVoice.cues.length === 34;

/** A confirmed discard by any seat; never speak a private draw or a restored snapshot. */
export function discardedVoice(before: View | null, after: View | null) {
  if (
    !before ||
    !after ||
    before.id !== after.id ||
    before.me !== after.me ||
    before.round !== after.round ||
    after.revision <= before.revision ||
    !["playing", "claiming"].includes(before.phase) ||
    !after.lastDiscard ||
    after.lastDiscard.tile === before.lastDiscard?.tile
  )
    return undefined;
  const tile = after.lastDiscard.tile;
  if (!Number.isInteger(tile) || tile < 0 || tile >= 136) return undefined;
  return { key: `${after.id}:${after.round}:${tile}`, tile };
}

/** One bundled audio sprite: decoded once, independent volume, short serial queue. */
export class TileVoice {
  private buffer?: Promise<AudioBuffer | undefined>;
  private abort?: AbortController;
  private retryAt = 0;
  private disposed = false;
  private queue: { cue: number[]; at: number; lifetime: number; notice?: VoiceNotice }[] = [];
  private activeNotice?: VoiceNotice;
  private seen = new Set<string>();
  private active?: AudioBufferSourceNode;
  private loading = false;
  private epoch = 0;
  private enabled = false;
  constructor(
    private context: AudioContext,
    private output: AudioNode,
    private activity: (speaking: boolean) => void,
    private pack = nanjingVoice,
  ) {}

  setPack(pack: VoiceSprite) {
    if (this.pack === pack) return;
    this.stop();
    this.abort?.abort();
    this.pack = pack;
    this.buffer = undefined;
    this.retryAt = 0;
    if (this.enabled) void this.preload();
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
    else void this.preload();
  }
  private preload() {
    if (!this.pack.file || this.disposed || Date.now() < this.retryAt)
      return Promise.resolve(undefined);
    const pack = this.pack;
    return (this.buffer ??= (async () => {
      const abort = (this.abort = new AbortController());
      const timeout = setTimeout(() => abort.abort(), 8000);
      try {
        const file = pack.file!.startsWith("/") && !pack.file!.startsWith("//")
          ? `${import.meta.env.BASE_URL}${pack.file!.slice(1)}`
          : pack.file!;
        const response = await fetch(file, {
          signal: abort.signal,
        });
        // WKWebView reports status 0 for some bundled media scheme responses.
        // This exception is only for our local app origin, never an API request.
        const page = globalThis.location;
        const asset = page && new URL(file, page.href);
        const bundledMedia =
          page?.protocol === "capacitor:" &&
          page.host === "localhost" &&
          asset?.protocol === page.protocol &&
          asset.host === page.host;
        if (!response.ok && !(response.status === 0 && bundledMedia))
          throw new Error("Voice asset unavailable");
        return await this.context.decodeAudioData(await response.arrayBuffer());
      } catch {
        if (this.abort === abort) {
          this.buffer = undefined;
          this.retryAt = Date.now() + 15000;
        }
        return undefined;
      } finally {
        clearTimeout(timeout);
      }
    })());
  }
  say(key: string, tile: number | string, notice?: VoiceNotice) {
    if (this.seen.has(key)) { notice?.("cancelled"); return; }
    this.seen.add(key);
    if (this.seen.size > 160)
      this.seen.delete(this.seen.values().next().value!);
    const cue =
      typeof tile === "number"
        ? this.pack.cues[kind(tile)]
        : this.pack.actions?.[tile];
    if (!this.enabled || this.context.state !== "running" || !cue) { notice?.("failed"); return; }
    this.queue.push({
      cue,
      at: Date.now(),
      lifetime: typeof tile === "number" ? 3000 : 5500,
      notice,
    });
    if (this.queue.length > 6) this.queue.shift()?.notice?.("cancelled");
    void this.next();
  }
  private async next() {
    if (this.active || this.loading || !this.enabled || !this.queue.length)
      return;
    const epoch = this.epoch;
    this.loading = true;
    const buffer = await this.preload();
    if (epoch !== this.epoch) return;
    this.loading = false;
    if (!buffer || !this.enabled || this.context.state !== "running") {
      this.queue.forEach((item) => item.notice?.("failed"));
      this.queue = [];
      return;
    }
    let item = this.queue.shift();
    while (item && Date.now() - item.at > item.lifetime) {
      item.notice?.("cancelled");
      item = this.queue.shift();
    }
    if (!item) return;
    const [offset, duration] = item.cue;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    this.active = source;
    this.activeNotice = item.notice;
    this.activity(true);
    source.onended = () => {
      source.disconnect();
      if (this.active !== source) return;
      this.active = undefined;
      this.activeNotice = undefined;
      this.activity(false);
      item.notice?.("ended");
      void this.next();
    };
    try {
      source.start(0, offset, duration);
      item.notice?.("playing");
    } catch {
      this.activeNotice = undefined;
      item.notice?.("failed");
      this.stop();
    }
  }
  stop() {
    this.epoch++;
    this.loading = false;
    const cancelled = this.queue;
    this.queue = [];
    cancelled.forEach((item) => item.notice?.("cancelled"));
    const notice = this.activeNotice;
    this.activeNotice = undefined;
    notice?.("cancelled");
    const source = this.active;
    this.active = undefined;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.activity(false);
  }
  dispose() {
    this.disposed = true;
    this.enabled = false;
    this.stop();
    this.abort?.abort();
  }
}
