import type { View } from "../shared/types";
import { gameFeedback } from "./game-feedback";
import { TileVoice, voicePacks } from "./tile-voice";

export type Cue =
  | "click"
  | "select"
  | "ready"
  | "deal"
  | "draw"
  | "discard"
  | "pung"
  | "kong"
  | "hu"
  | "warning"
  | "flower";
export interface AudioPreferences {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  voice: boolean;
  voiceVolume: number;
  voiceGender?: "male" | "female";
  chat?: boolean;
}

/** Compare authoritative snapshots, so rejected actions and presence updates make no game sound. */
export function gameCues(before: View | null, after: View | null): Cue[] {
  const types = [
    ...new Set(gameFeedback(before, after).map((event) => event.type)),
  ];
  // Major calls get one clear cue, including a kong that also replenishes flowers.
  for (const main of ["deal", "hu", "kong", "pung"] as const)
    if (types.includes(main)) return [main];
  return types;
}

// User-provided scene tracks, normalized with smooth loop boundaries offline.
export const BACKGROUND_MUSIC = {
  lobby: { file: "/audio/mahjong-lobby.m4a", title: "大厅背景音乐" },
  table: { file: "/audio/mahjong-table.m4a", title: "牌局背景音乐" },
};
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const clamp = (n: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;

export class GameAudio {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private effectsGain?: GainNode;
  private voiceGain?: GainNode;
  private voice?: TileVoice;
  private speaking = false;
  private communication: "off" | "recording" | "playing" = "off";
  private previewEpoch = 0;
  private musicBuffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private musicEpoch = 0;
  private musicAbort?: AbortController;
  private musicSource?: AudioBufferSourceNode;
  private musicEnvelope?: GainNode;
  private musicLoading = false;
  private musicRetry?: ReturnType<typeof setTimeout>;
  private effects = new Set<OscillatorNode>();
  private lastDealAt = -Infinity;
  private resumeRetry?: ReturnType<typeof setTimeout>;
  private recovering = false;
  private recoveryAttempt = 0;
  private recoveryRebuilt = false;
  private visible = true;
  private table = false;
  private replayActive = false;
  private preferences: AudioPreferences = {
    sound: true,
    music: true,
    soundVolume: 0.7,
    musicVolume: 0.38,
    voice: true,
    voiceVolume: 0.85,
  };

  configure(preferences: AudioPreferences, table: boolean) {
    const track = this.musicTrack;
    this.preferences = preferences;
    this.table = table;
    if (track !== this.musicTrack) this.changeMusic();
    this.voice?.setPack(voicePacks[preferences.voiceGender ?? "male"]);
    this.voice?.setEnabled(
      preferences.voice && this.visible && (table || this.replayActive),
    );
    this.setGains();
    this.ensureMusic();
  }
  private get musicTrack() {
    return BACKGROUND_MUSIC[
      this.table || this.replayActive ? "table" : "lobby"
    ];
  }
  private changeMusic() {
    this.musicEpoch++;
    this.musicLoading = false;
    clearTimeout(this.musicRetry);
    const source = this.musicSource,
      envelope = this.musicEnvelope;
    this.musicSource = undefined;
    this.musicEnvelope = undefined;
    if (!source || !envelope || !this.context) return;
    const now = this.context.currentTime;
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setValueAtTime(envelope.gain.value, now);
    envelope.gain.linearRampToValueAtTime(0, now + 0.18);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
    };
    try {
      source.stop(now + 0.2);
    } catch {
      source.disconnect();
      envelope.disconnect();
    }
  }
  setCommunication(state: "off" | "recording" | "playing") {
    this.communication = state;
    if (state === "recording") this.stopVoice();
    this.setGains();
  }
  private setGains() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicGain!.gain.setTargetAtTime(
      this.preferences.music &&
        this.visible &&
        this.communication !== "recording"
        ? clamp(this.preferences.musicVolume) *
            (this.table ? 0.85 : 1) *
            (this.speaking || this.communication === "playing" ? 0.3 : 1)
        : 0,
      now,
      0.06,
    );
    this.effectsGain!.gain.setTargetAtTime(
      this.preferences.sound &&
        this.visible &&
        this.communication !== "recording"
        ? clamp(this.preferences.soundVolume)
        : 0,
      now,
      0.015,
    );
    this.voiceGain!.gain.setTargetAtTime(
      this.preferences.voice &&
        this.visible &&
        this.communication !== "recording"
        ? clamp(this.preferences.voiceVolume)
        : 0,
      now,
      0.015,
    );
  }
  unlock = () => {
    if (!this.visible) return;
    try {
      if (this.context?.state === "closed") this.dispose();
      if (!this.context) this.create();
      const context = this.context!;
      if (context.state === "running") {
        this.setGains();
        this.ensureMusic();
        this.retryResume();
        return;
      }
      this.retryResume();
      void context
        .resume()
        .then(() => {
          if (this.context !== context) return;
          if (!this.visible) {
            void context.suspend().catch(() => {});
            return;
          }
          this.setGains();
          this.ensureMusic();
        })
        .catch(() => {});
    } catch {
      /* A blocked audio device must not block the table. */
    }
  };
  private create() {
    const session = (
      navigator as Navigator & { audioSession?: { type: string } }
    ).audioSession;
    if (session) session.type = "playback";
    const a = (this.context = new AudioContext({ latencyHint: "interactive" }));
    a.onstatechange = () => {
      if (this.context !== a || !this.visible) return;
      if (a.state === "running") {
        this.setGains();
        this.ensureMusic();
      }
      // iOS can report an interruption after the app has already become visible.
      // Recover with bounded retries while the native audio session reactivates.
      else if (a.state !== "closed") this.retryResume();
    };
    this.musicGain = a.createGain();
    this.effectsGain = a.createGain();
    this.voiceGain = a.createGain();
    this.musicGain.gain.value = 0;
    this.effectsGain.gain.value = 0;
    this.voiceGain.gain.value = 0;
    const limiter = a.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 5;
    this.musicGain.connect(limiter);
    this.effectsGain.connect(limiter);
    this.voiceGain.connect(limiter);
    this.voice = new TileVoice(
      a,
      this.voiceGain,
      (speaking) => {
        this.speaking = speaking;
        this.setGains();
      },
      voicePacks[this.preferences.voiceGender ?? "male"],
    );
    this.voice.setEnabled(
      this.preferences.voice &&
        this.visible &&
        (this.table || this.replayActive),
    );
    limiter.connect(a.destination);
    this.setGains();
  }
  private ensureMusic() {
    const context = this.context;
    if (
      !context ||
      context.state !== "running" ||
      !this.visible ||
      !this.preferences.music ||
      this.preferences.musicVolume <= 0 ||
      this.musicSource ||
      this.musicLoading
    )
      return;
    const track = this.musicTrack,
      epoch = this.musicEpoch;
    this.musicLoading = true;
    let pending = this.musicBuffers.get(track.file);
    if (!pending) {
      pending = (async () => {
        const abort = (this.musicAbort = new AbortController());
        const timeout = setTimeout(() => abort.abort(), 10000);
        try {
          const response = await fetch(track.file, {
            signal: abort.signal,
          });
          const bundled =
            globalThis.location?.protocol === "capacitor:" &&
            globalThis.location.host === "localhost";
          if (!response.ok && !(response.status === 0 && bundled))
            throw new Error("Music asset unavailable");
          return await context.decodeAudioData(await response.arrayBuffer());
        } catch {
          if (this.context === context) this.musicBuffers.delete(track.file);
          return undefined;
        } finally {
          clearTimeout(timeout);
        }
      })();
      this.musicBuffers.set(track.file, pending);
    }
    void pending
      .then((buffer) => {
        if (this.context !== context || this.musicEpoch !== epoch) return;
        this.musicLoading = false;
        if (!buffer) {
          clearTimeout(this.musicRetry);
          this.musicRetry = setTimeout(() => this.ensureMusic(), 15000);
          return;
        }
        if (
          !this.visible ||
          !this.preferences.music ||
          this.preferences.musicVolume <= 0 ||
          context.state !== "running" ||
          this.musicSource
        )
          return;
        const source = context.createBufferSource();
        const envelope = context.createGain();
        source.buffer = buffer;
        source.loop = true;
        source.loopEnd = buffer.duration;
        envelope.gain.setValueAtTime(0, context.currentTime);
        envelope.gain.linearRampToValueAtTime(1, context.currentTime + 0.65);
        source.connect(envelope);
        envelope.connect(this.musicGain!);
        this.musicSource = source;
        this.musicEnvelope = envelope;
        source.start(context.currentTime + 0.02);
      })
      .catch(() => {
        if (this.context === context && this.musicEpoch === epoch)
          this.musicLoading = false;
      });
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.voice?.setEnabled(
      this.preferences.voice && visible && (this.table || this.replayActive),
    );
    this.setGains();
    if (!this.context) return;
    this.stopRecovery();
    if (!visible) {
      this.stopEffects();
      void this.context.suspend().catch(() => {});
    } else {
      this.unlock();
      this.retryResume();
    }
  }
  private stopRecovery() {
    clearTimeout(this.resumeRetry);
    this.resumeRetry = undefined;
    this.recovering = false;
    this.recoveryAttempt = 0;
    this.recoveryRebuilt = false;
  }
  /** Check the audio clock as well as state: WebKit can say "running" while
   * its output clock is frozen after an interruption. Retries are bounded;
   * later user gestures can start a fresh recovery without changing volume. */
  private retryResume() {
    if (!this.visible || !this.context || this.resumeRetry) return;
    if (!this.recovering) {
      this.recovering = true;
      this.recoveryAttempt = 0;
      this.recoveryRebuilt = false;
    }
    const context = this.context, clock = context.currentTime;
    const delays = [250, 750, 1500, 3000];
    this.resumeRetry = setTimeout(() => {
      this.resumeRetry = undefined;
      if (!this.visible || this.context !== context) return;
      if (context.state === "running" && context.currentTime > clock + 0.001) {
        this.stopRecovery();
        return;
      }
      if (++this.recoveryAttempt >= delays.length) {
        if (this.recoveryRebuilt) {
          this.stopRecovery();
          return;
        }
        // Rebuild every node together; never leave music or voices connected
        // to an abandoned context. No stale game cues are replayed.
        this.dispose();
        this.recovering = true;
        this.recoveryRebuilt = true;
        this.recoveryAttempt = 0;
      }
      this.unlock();
    }, delays[this.recoveryAttempt]);
  }
  private tone(
    frequency: number,
    time: number,
    duration: number,
    volume: number,
    target: AudioNode,
    type: OscillatorType = "sine",
    attack = 0.008,
  ) {
    const a = this.context!,
      osc = a.createOscillator(),
      envelope = a.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(envelope);
    envelope.connect(target);
    this.effects.add(osc);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    osc.onended = () => {
      this.effects.delete(osc);
      osc.disconnect();
      envelope.disconnect();
    };
  }
  private stopEffects() {
    for (const source of this.effects) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.effects.clear();
  }
  private tileClick(at: number, weight: number) {
    // Short, rounded resonances, with a soft attack and no white-noise burst.
    this.tone(520, at, 0.065, weight * 0.32, this.effectsGain!, "sine", 0.004);
    this.tone(1080, at, 0.034, weight * 0.14, this.effectsGain!, "sine", 0.003);
    this.tone(
      1780,
      at,
      0.024,
      weight * 0.045,
      this.effectsGain!,
      "sine",
      0.003,
    );
  }
  play(cue: Cue, delay = 0) {
    if (
      !this.preferences.sound ||
      this.preferences.soundVolume <= 0 ||
      !this.visible ||
      this.context?.state !== "running"
    )
      return;
    const at = this.context.currentTime + 0.005 + delay,
      out = this.effectsGain!;
    if (cue === "click" || cue === "select") {
      // A quiet, dry wooden tap; navigation must not sound like a tile hitting the table.
      const weight = cue === "select" ? 1 : 0.7;
      this.tone(420, at, 0.045, 0.09 * weight, out, "sine", 0.002);
      this.tone(840, at, 0.022, 0.025 * weight, out, "sine", 0.001);
    }
    if (cue === "discard") {
      this.tileClick(at, 0.42);
      this.tileClick(at + 0.025, 0.16);
    }
    if (cue === "draw") this.tileClick(at, 0.24);
    if (cue === "deal") {
      // One gentle two-note opening cue. Suppress duplicate dispatches rather
      // than layering eight overlapping noise clicks over the opening voice.
      if (at - this.lastDealAt < 0.8) return;
      this.lastDealAt = at;
      this.tone(hz(74), at, 0.28, 0.085, out, "sine", 0.018);
      this.tone(hz(81), at + 0.16, 0.34, 0.065, out, "sine", 0.018);
    }
    const chimes: Partial<Record<Cue, number[]>> = {
      flower: [79, 84],
      warning: [81],
      ready: [76, 79],
      pung: [67, 72],
      kong: [67, 72, 79],
      hu: [72, 76, 79, 84],
    };
    chimes[cue]?.forEach((note, i) =>
      this.tone(
        hz(note),
        at + i * 0.11,
        cue === "hu" ? 0.8 : 0.35,
        0.17,
        out,
        "sine",
      ),
    );
  }
  setReplayActive(active: boolean) {
    const track = this.musicTrack;
    this.replayActive = active;
    if (track !== this.musicTrack) {
      this.changeMusic();
      this.ensureMusic();
    }
    if (!active) this.stopVoice();
    this.voice?.setEnabled(
      this.preferences.voice && this.visible && (this.table || active),
    );
  }
  sayTile(key: string, tile: number | string) {
    this.voice?.say(key, tile);
  }
  previewVoice() {
    if (!this.visible || !this.preferences.voice) return;
    this.stopVoice();
    this.unlock();
    const context = this.context;
    if (!context) return;
    const epoch = this.previewEpoch;
    void context
      .resume()
      .then(() => {
        if (
          this.context !== context ||
          epoch !== this.previewEpoch ||
          !this.visible ||
          !this.preferences.voice
        )
          return;
        this.voice?.setEnabled(true);
        this.voice?.say(`preview:${epoch}`, "自摸");
      })
      .catch(() => {});
  }
  stopVoice() {
    this.previewEpoch++;
    this.voice?.stop();
  }
  dispose() {
    this.musicEpoch++;
    this.previewEpoch++;
    this.voice?.dispose();
    this.voice = undefined;
    this.stopRecovery();
    clearTimeout(this.musicRetry);
    this.musicAbort?.abort();
    this.stopEffects();
    try {
      this.musicSource?.stop();
    } catch {
      /* Already stopped. */
    }
    this.musicSource?.disconnect();
    this.musicEnvelope?.disconnect();
    this.musicSource = undefined;
    this.musicEnvelope = undefined;
    this.musicBuffers.clear();
    this.musicLoading = false;
    this.speaking = false;
    this.lastDealAt = -Infinity;
    if (this.context) this.context.onstatechange = null;
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}

export const gameAudio = new GameAudio();
