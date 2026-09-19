import { encodeVoice, VOICE_MAX_SECONDS } from "../shared/room-voice";

/** One explicit press owns one recording, including pending microphone permission. */
export class VoiceRecorder {
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private muted?: GainNode;
  private chunks: Float32Array[] = [];
  private samples = 0;
  private ended = false;
  private timer?: ReturnType<typeof setTimeout>;
  private session?: { type: string };
  private previousSession?: string;
  async start(onLimit: () => void) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error(globalThis.isSecureContext === false
        ? "请通过 HTTPS 打开网页版后使用语音"
        : "当前浏览器不支持录音，请使用新版 Safari、Chrome 或手机 App");
    try {
      // WebKit refuses capture while the game owns a playback-only session.
      // Switch before requesting permission, then restore on every exit path.
      this.session = (
        navigator as Navigator & { audioSession?: { type: string } }
      ).audioSession;
      this.previousSession = this.session?.type;
      if (this.session) this.session.type = "play-and-record";
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (this.ended) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.stream = stream;
      const context = (this.context = new AudioContext());
      this.source = context.createMediaStreamSource(stream);
      this.processor = context.createScriptProcessor(4096, 1, 1);
      this.muted = context.createGain();
      this.muted.gain.value = 0;
      this.processor.onaudioprocess = (event) => {
        if (this.ended) return;
        const data = event.inputBuffer.getChannelData(0);
        const available = Math.min(
          data.length,
          Math.floor(context.sampleRate * VOICE_MAX_SECONDS) - this.samples,
        );
        if (available > 0) {
          this.chunks.push(data.slice(0, available));
          this.samples += available;
        }
      };
      this.source.connect(this.processor);
      this.processor.connect(this.muted);
      this.muted.connect(context.destination);
      await context.resume();
      if (this.ended) return false;
      this.timer = setTimeout(onLimit, VOICE_MAX_SECONDS * 1000);
      return true;
    } catch (error) {
      this.finish(false);
      throw error;
    }
  }
  finish(send: boolean): Uint8Array | undefined {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    const rate = this.context?.sampleRate ?? 48000;
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.processor) this.processor.onaudioprocess = null;
    this.source?.disconnect();
    this.processor?.disconnect();
    this.muted?.disconnect();
    void this.context?.close().catch(() => {});
    if (this.session && this.previousSession)
      this.session.type = this.previousSession;
    if (!send || this.samples < rate * 0.4) {
      this.chunks = [];
      return;
    }
    const samples = new Float32Array(this.samples);
    let at = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, at);
      at += chunk.length;
    }
    this.chunks = [];
    return encodeVoice(samples, rate);
  }
}
