import type { TrackRef } from '@shared/lyrics';
import type { ControllablePlaybackSource, PlaybackSnapshot, Unsubscribe } from './types';

export interface DemoSourceOptions {
  /** How often to emit reports, mimicking an external player being polled. */
  reportIntervalMs?: number;
  /** Max random error added to reported positions (tests the clock's smoothing). */
  jitterMs?: number;
  loop?: boolean;
  now?: () => number;
  random?: () => number;
}

/**
 * Simulated player for development, the gallery and demo mode. It keeps a perfect internal
 * clock but only *reports* it periodically and imperfectly — the same shape of data the
 * Spotify poller will produce — so the rest of the app is exercised realistically.
 */
export class DemoPlaybackSource implements ControllablePlaybackSource {
  readonly kind = 'demo' as const;
  private listeners = new Set<(s: PlaybackSnapshot) => void>();
  private index = 0;
  private playing = false;
  private pos = 0;
  private at = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly interval: number;
  private readonly jitter: number;
  private readonly loop: boolean;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    private readonly tracks: readonly TrackRef[],
    opts: DemoSourceOptions = {},
  ) {
    if (!tracks.length) throw new Error('DemoPlaybackSource needs at least one track');
    this.interval = opts.reportIntervalMs ?? 1000;
    this.jitter = opts.jitterMs ?? 0;
    this.loop = opts.loop ?? true;
    this.now = opts.now ?? (() => performance.now());
    this.random = opts.random ?? Math.random;
    this.at = this.now();
  }

  get track(): TrackRef {
    return this.tracks[this.index]!;
  }

  /** Exact (un-jittered) position — for tests and UI scrubbers. */
  truePosition(): number {
    const p = this.pos + (this.playing ? this.now() - this.at : 0);
    return Math.min(p, this.track.durationMs);
  }

  subscribe(cb: (s: PlaybackSnapshot) => void): Unsubscribe {
    this.listeners.add(cb);
    cb(this.snapshot(false));
    if (!this.timer) this.timer = setInterval(() => this.tick(), this.interval);
    return () => {
      this.listeners.delete(cb);
      if (!this.listeners.size) this.stopTimer();
    };
  }

  play(): void {
    if (this.playing) return;
    this.rebase();
    this.playing = true;
    this.publish(false);
  }

  pause(): void {
    if (!this.playing) return;
    this.rebase();
    this.playing = false;
    this.publish(false);
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(ms: number): void {
    this.pos = Math.max(0, Math.min(ms, this.track.durationMs));
    this.at = this.now();
    this.publish(false);
  }

  next(): void {
    this.select((this.index + 1) % this.tracks.length);
  }

  previous(): void {
    if (this.truePosition() > 3000) this.seek(0);
    else this.select((this.index - 1 + this.tracks.length) % this.tracks.length);
  }

  select(index: number): void {
    this.index = Math.max(0, Math.min(index, this.tracks.length - 1));
    this.pos = 0;
    this.at = this.now();
    this.publish(false);
  }

  dispose(): void {
    this.stopTimer();
    this.listeners.clear();
  }

  /** Advance bookkeeping; handles end-of-track. Exposed for deterministic tests. */
  tick(): void {
    if (this.playing && this.truePosition() >= this.track.durationMs) {
      if (this.loop || this.index < this.tracks.length - 1) {
        this.select((this.index + 1) % this.tracks.length);
        return;
      }
      this.rebase();
      this.playing = false;
    }
    this.publish(true);
  }

  private rebase() {
    this.pos = this.truePosition();
    this.at = this.now();
  }

  private snapshot(noisy: boolean): PlaybackSnapshot {
    const error = noisy && this.jitter ? (this.random() * 2 - 1) * this.jitter : 0;
    return {
      track: this.track,
      isPlaying: this.playing,
      positionMs: Math.max(0, this.truePosition() + error),
      sampledAt: this.now(),
    };
  }

  private publish(noisy: boolean) {
    const s = this.snapshot(noisy);
    for (const l of this.listeners) l(s);
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
