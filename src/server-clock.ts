/** Server deadlines advance on a monotonic clock, independent of the phone's date setting. */
export class ServerClock {
  private anchor?: { server: number; local: number };
  private bestRtt = Infinity;
  constructor(
    private monotonic = () => performance.now(),
    private wall = () => Date.now(),
  ) {}
  now() {
    return this.anchor
      ? this.anchor.server + this.monotonic() - this.anchor.local
      : this.wall();
  }
  observe(serverNow: number | undefined) {
    if (!this.anchor && Number.isFinite(serverNow))
      this.anchor = { server: serverNow!, local: this.monotonic() };
  }
  sample(serverNow: number, sentAt: number) {
    const received = this.monotonic(),
      rtt = received - sentAt;
    if (
      !Number.isFinite(serverNow) ||
      !Number.isFinite(rtt) ||
      rtt < 0 ||
      rtt > 10000
    )
      return;
    // Prefer the least delayed samples. A background return explicitly starts a fresh sample window.
    if (rtt <= this.bestRtt + 25) {
      this.anchor = { server: serverNow + rtt / 2, local: received };
      this.bestRtt = Math.min(this.bestRtt, rtt);
    }
  }
  resample() {
    this.bestRtt = Infinity;
  }
  reset() {
    this.anchor = undefined;
    this.resample();
  }
}
