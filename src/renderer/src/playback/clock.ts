import type { TrackRef } from '@shared/lyrics';
import type { PlaybackSnapshot } from './types';

export interface ClockReading {
  track: TrackRef | null;
  isPlaying: boolean;
  /** Smoothed song position in ms, clamped to [0, duration]. */
  positionMs: number;
}

export type ClockEvent =
  | { type: 'track'; track: TrackRef | null }
  | { type: 'seek'; fromMs: number; toMs: number }
  | { type: 'play-state'; isPlaying: boolean };

export interface ClockOptions {
  /** Corrections larger than this are treated as a real seek and applied instantly. */
  seekThresholdMs?: number;
  /**
   * The most the displayed time may speed up or slow down while correcting, as a fraction of
   * real time. Small (a few %) so animations driven by song time never visibly stutter.
   */
  maxRateDeviation?: number;
  /** Errors are corrected over roughly this long (bounded by `maxRateDeviation`). */
  correctionMs?: number;
  /** How many recent reports are averaged to cancel out reporting jitter. */
  window?: number;
}

/** Errors smaller than this are left alone — invisible, and not worth bending time for. */
const DEADBAND_MS = 12;
/** A report this far from the running average is a real jump, not jitter: start averaging afresh. */
const JUMP_MS = 400;

/**
 * PlaybackClock turns irregular, slightly-wrong position reports (from Spotify polling,
 * an <audio> element, or the demo source) into a smooth, monotonic song time for the renderer.
 *
 * - Reports arrive maybe once a second, each a little early or late. While playing, the true
 *   offset between song time and the local clock is constant, so the clock *averages* the last
 *   few reports — the jitter cancels out instead of being chased.
 * - The displayed time then leans gently toward that estimate by running at most a few percent
 *   fast or slow (piecewise-linear, never backwards), which the eye cannot see.
 * - Large disagreements, and exact reports from user actions (seek, play, pause), snap.
 *
 * Time is injected (`t`) so the logic is fully deterministic and unit-testable.
 */
export class PlaybackClock {
  private track: TrackRef | null = null;
  private isPlaying = false;
  private hasReading = false;
  /** Displayed time: `anchorPos` at `anchorAt`, moving at `rate` for `corrMs`, then at 1x. */
  private anchorPos = 0;
  private anchorAt = 0;
  private rate = 1;
  private corrMs = 0;
  /** Recent (reported position − local time) samples while playing. */
  private samples: number[] = [];
  private listeners = new Set<(e: ClockEvent) => void>();

  private readonly seekThreshold: number;
  private readonly maxDev: number;
  private readonly correction: number;
  private readonly windowSize: number;

  constructor(opts: ClockOptions = {}) {
    this.seekThreshold = opts.seekThresholdMs ?? 1500;
    this.maxDev = opts.maxRateDeviation ?? 0.06;
    this.correction = opts.correctionMs ?? 1600;
    this.windowSize = opts.window ?? 6;
  }

  on(cb: (e: ClockEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: ClockEvent) {
    for (const l of this.listeners) l(e);
  }

  /** Unclamped displayed position at local time t. */
  private shown(t: number): number {
    if (!this.isPlaying) return this.anchorPos;
    const dt = Math.max(0, t - this.anchorAt);
    const bent = Math.min(dt, this.corrMs);
    return this.anchorPos + bent * this.rate + (dt - bent);
  }

  /** Best estimate of the true position, averaging out report jitter. */
  private estimate(t: number): number {
    const s = this.samples;
    if (!s.length) return this.anchorPos;
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of s) {
      sum += k;
      lo = Math.min(lo, k);
      hi = Math.max(hi, k);
    }
    // Trimmed mean: one wild report can't drag the estimate.
    const mean = s.length >= 4 ? (sum - lo - hi) / (s.length - 2) : sum / s.length;
    return mean + t;
  }

  private snapTo(pos: number, t: number) {
    this.anchorPos = pos;
    this.anchorAt = t;
    this.rate = 1;
    this.corrMs = 0;
  }

  private clamp(ms: number): number {
    const max = this.track?.durationMs ?? Number.POSITIVE_INFINITY;
    return ms < 0 ? 0 : ms > max ? max : ms;
  }

  /** Feed a new report from a playback source. */
  ingest(s: PlaybackSnapshot, t: number): void {
    const target = s.positionMs + (s.isPlaying ? t - s.sampledAt : 0);
    const trackChanged = (s.track?.key ?? null) !== (this.track?.key ?? null);

    if (!this.hasReading || trackChanged) {
      this.track = s.track;
      this.isPlaying = s.isPlaying;
      this.hasReading = true;
      this.samples = s.isPlaying ? [target - t] : [];
      this.snapTo(target, t);
      if (trackChanged) this.emit({ type: 'track', track: s.track });
      return;
    }

    const shown = this.shown(t);
    const playStateChanged = s.isPlaying !== this.isPlaying;
    this.isPlaying = s.isPlaying;

    // Maintain the jitter-averaging window.
    const k = target - t;
    if (!s.isPlaying || playStateChanged || s.exact) {
      this.samples = s.isPlaying ? [k] : [];
    } else {
      const est = this.estimate(t) - t;
      if (this.samples.length && Math.abs(k - est) > JUMP_MS) this.samples = [];
      this.samples.push(k);
      if (this.samples.length > this.windowSize) this.samples.shift();
    }

    const truth = s.isPlaying && !s.exact ? this.estimate(t) : target;
    const error = shown - truth; // > 0: we're ahead

    if (Math.abs(error) > this.seekThreshold || s.exact || !s.isPlaying) {
      // User actions and paused reports are exact; big disagreements are real seeks.
      this.snapTo(truth, t);
      if (Math.abs(error) > this.seekThreshold || (s.exact && Math.abs(error) > 250)) {
        this.emit({ type: 'seek', fromMs: this.clamp(shown), toMs: this.clamp(truth) });
      }
    } else {
      // Lean toward the estimate by bending time slightly, then return to 1x.
      this.anchorPos = shown;
      this.anchorAt = t;
      const mag = Math.abs(error);
      if (mag < DEADBAND_MS) {
        this.rate = 1;
        this.corrMs = 0;
      } else {
        // Proportional to the error, capped: tiny errors use tiny deviations.
        const dev = Math.min(this.maxDev * (mag > 300 ? 4 : 1), mag / this.correction);
        this.rate = error > 0 ? 1 - dev : 1 + dev;
        this.corrMs = mag / dev;
      }
    }

    if (playStateChanged) this.emit({ type: 'play-state', isPlaying: s.isPlaying });
  }

  /** Smoothed reading at local time `t`. Cheap; call every frame. */
  read(t: number): ClockReading {
    return {
      track: this.track,
      isPlaying: this.isPlaying,
      positionMs: this.hasReading ? this.clamp(this.shown(t)) : 0,
    };
  }

  reset(): void {
    this.track = null;
    this.isPlaying = false;
    this.hasReading = false;
    this.samples = [];
    this.snapTo(0, 0);
  }
}
