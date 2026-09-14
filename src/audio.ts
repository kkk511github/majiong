import type { View } from "../shared/types";
import { gameFeedback } from "./game-feedback";
import { TileVoice } from "./tile-voice";

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

// Original 16-bar pentatonic composition, with a plucked lead, warm bass and soft flute phrases.
// All audio is generated locally; no downloads, streaming or third-party recordings are required.
const melody = [
  [72, 76, 79, 76],
  [74, 79, 81, 79],
  [76, 72, 69, 72],
  [67, 69, 72, 0],
  [72, 74, 76, 79],
  [81, 79, 76, 74],
  [76, 74, 72, 69],
  [67, 0, 72, 0],
  [79, 81, 84, 81],
  [79, 76, 74, 0],
  [76, 79, 81, 79],
  [74, 72, 69, 0],
  [72, 76, 79, 76],
  [74, 76, 72, 69],
  [67, 69, 72, 74],
  [72, 0, 0, 0],
];
const bass = [48, 43, 45, 41, 48, 43, 45, 43, 48, 43, 45, 41, 48, 43, 41, 48];
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
  private previewEpoch = 0;
  private room?: ConvolverNode;
  private noise?: AudioBuffer;
  private timer?: ReturnType<typeof setInterval>;
  private resumeRetry?: ReturnType<typeof setTimeout>;
  private nextBeat = 0;
  private beat = 0;
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
    this.preferences = preferences;
    this.table = table;
    this.voice?.setEnabled(
      preferences.voice && this.visible && (table || this.replayActive),
    );
    this.setGains();
  }
  private setGains() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicGain!.gain.setTargetAtTime(
      this.preferences.music && this.visible
        ? clamp(this.preferences.musicVolume) *
            (this.table ? 0.58 : 0.85) *
            (this.speaking ? 0.3 : 1)
        : 0,
      now,
      0.06,
    );
    this.effectsGain!.gain.setTargetAtTime(
      this.preferences.sound && this.visible
        ? clamp(this.preferences.soundVolume)
        : 0,
      now,
      0.015,
    );
    this.voiceGain!.gain.setTargetAtTime(
      this.preferences.voice && this.visible
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
        this.schedule();
        return;
      }
      void context
        .resume()
        .then(() => {
          if (this.context !== context) return;
          if (!this.visible) {
            void context.suspend().catch(() => {});
            return;
          }
          this.nextBeat = context.currentTime + 0.04;
          this.setGains();
          this.schedule();
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
        this.schedule();
      }
      // iOS can report an interruption after the app has already become visible.
      // Retry once after the native audio session has had time to reactivate.
      else if ((a.state as string) === "interrupted") this.retryResume();
    };
    this.musicGain = a.createGain();
    this.effectsGain = a.createGain();
    this.voiceGain = a.createGain();
    this.musicGain.gain.value = 0;
    this.effectsGain.gain.value = 0;
    const limiter = a.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 5;
    this.musicGain.connect(limiter);
    this.effectsGain.connect(limiter);
    this.voiceGain.connect(limiter);
    this.voice = new TileVoice(a, this.voiceGain, (speaking) => {
      this.speaking = speaking;
      this.setGains();
    });
    this.voice.setEnabled(
      this.preferences.voice &&
        this.visible &&
        (this.table || this.replayActive),
    );
    limiter.connect(a.destination);
    this.room = a.createConvolver();
    const impulse = a.createBuffer(
      2,
      Math.floor(a.sampleRate * 1.3),
      a.sampleRate,
    );
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    this.room.buffer = impulse;
    const wet = a.createGain();
    wet.gain.value = 0.12;
    this.room.connect(wet);
    wet.connect(this.musicGain);
    this.noise = a.createBuffer(1, Math.ceil(a.sampleRate * 0.2), a.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.nextBeat = a.currentTime + 0.04;
    this.setGains();
    this.timer = setInterval(() => this.schedule(), 100);
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    this.voice?.setEnabled(
      this.preferences.voice && visible && (this.table || this.replayActive),
    );
    this.setGains();
    if (!this.context) return;
    clearTimeout(this.resumeRetry);
    if (!visible) void this.context.suspend().catch(() => {});
    else {
      this.unlock();
      this.retryResume();
    }
  }
  private retryResume() {
    clearTimeout(this.resumeRetry);
    this.resumeRetry = setTimeout(() => {
      if (this.visible && this.context?.state !== "running") this.unlock();
    }, 350);
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
    osc.start(time);
    osc.stop(time + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  }
  private pluck(note: number, at: number, volume: number, duration = 1.6) {
    const a = this.context!,
      bus = a.createGain();
    bus.connect(this.musicGain!);
    bus.connect(this.room!);
    for (const [partial, strength, decay] of [
      [1, 1, 1],
      [2, 0.33, 0.65],
      [3, 0.12, 0.4],
    ])
      this.tone(
        hz(note) * partial,
        at,
        duration * decay,
        volume * strength,
        bus,
      );
    // Disconnect the shared send when its final oscillator finishes, including room input.
    const cleanup = a.createConstantSource();
    cleanup.offset.value = 0;
    cleanup.start(at);
    cleanup.stop(at + duration + 0.05);
    cleanup.onended = () => {
      bus.disconnect();
      cleanup.disconnect();
    };
  }
  private schedule() {
    const a = this.context;
    if (!a || a.state !== "running" || !this.visible) return;
    if (this.nextBeat < a.currentTime) this.nextBeat = a.currentTime + 0.03;
    while (this.nextBeat < a.currentTime + 0.2) {
      const bar = Math.floor(this.beat / 4) % melody.length,
        step = this.beat % 4;
      if (this.preferences.music && this.preferences.musicVolume > 0) {
        const note = melody[bar][step];
        if (note) this.pluck(note, this.nextBeat, 0.115);
        if (step === 0) {
          this.pluck(bass[bar], this.nextBeat, 0.095, 2.3);
          this.pluck(bass[bar] + 12, this.nextBeat + 0.035, 0.045, 2);
        }
        if (step === 2) this.pluck(bass[bar] + 19, this.nextBeat, 0.04, 1.5);
        if (bar % 4 === 1 && step === 0)
          this.tone(
            hz(melody[bar][0] - 12),
            this.nextBeat,
            2.4,
            0.045,
            this.musicGain!,
            "sine",
            0.3,
          );
      }
      this.beat++;
      this.nextBeat += 60 / 88;
    }
  }
  private tileClick(at: number, weight: number) {
    const a = this.context!,
      source = a.createBufferSource(),
      filter = a.createBiquadFilter(),
      envelope = a.createGain();
    source.buffer = this.noise!;
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.65;
    envelope.gain.setValueAtTime(weight, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.effectsGain!);
    source.start(at);
    source.stop(at + 0.08);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    this.tone(680, at, 0.075, weight * 0.55, this.effectsGain!);
    this.tone(1540, at, 0.035, weight * 0.18, this.effectsGain!);
  }
  play(cue: Cue, delay = 0) {
    if (
      !this.preferences.sound ||
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
    if (cue === "deal")
      for (let i = 0; i < 8; i++)
        this.tileClick(at + i * 0.055, 0.16 + (i % 2) * 0.08);
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
    this.replayActive = active;
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
        this.voice?.say(`preview:${epoch}`, "杠上开花");
      })
      .catch(() => {});
  }
  stopVoice() {
    this.previewEpoch++;
    this.voice?.stop();
  }
  dispose() {
    this.previewEpoch++;
    this.voice?.dispose();
    this.voice = undefined;
    clearInterval(this.timer);
    clearTimeout(this.resumeRetry);
    this.timer = undefined;
    if (this.context) this.context.onstatechange = null;
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.beat = 0;
  }
}

export const gameAudio = new GameAudio();
