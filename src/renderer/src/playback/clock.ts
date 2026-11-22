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
  /** Base time constant for gliding out small drift. */
  smoothingMs?: number;
  /**
   * While playing, the smoothed position never moves slower than this fraction of real time
   * when correcting "we were ahead" errors, so lyrics never visibly run backwards.
   */
  minRate?: number;
}

/**
 * PlaybackClock turns irregular, slightly-wrong position reports (from Spotify polling,
 * an <audio> element, or the demo source) into a smooth, monotonic song time for the renderer.
 *
 * - Between reports it extrapolates using the local monotonic clock.
 * - Small disagreements are glided out (exponential decay) instead of jumping.
 * - Large disagreements are treated as seeks and applied immediately.
 *
 * Time is injected (`t`) so the logic is fully deterministic and unit-testable.
 */
export class PlaybackClock {
  private track: TrackRef | null = null;
  private isPlaying = false;
  /** The authoritative model: position `basePos` at local time `baseAt`, advancing at 1x if playing. */
  private basePos = 0;
  private baseAt = 0;
  /** Decaying visual offset (smoothed - authoritative) captured at `offsetAt`. */
  private offset = 0;
  private offsetAt = 0;
  private hasReading = false;
  private listeners = new Set<(e: ClockEvent) => void>();

  private readonly seekThreshold: number;
  private readonly smoothing: number;
  private readonly minRate: number;

  constructor(opts: ClockOptions = {}) {
    this.seekThreshold = opts.seekThresholdMs ?? 1500;
    this.smoothing = opts.smoothingMs ?? 350;
    this.minRate = opts.minRate ?? 0.5;
  }

  on(cb: (e: ClockEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: ClockEvent) {
    for (const l of this.listeners) l(e);
  }

  private authoritative(t: number): number {
    return this.basePos + (this.isPlaying ? t - this.baseAt : 0);
  }

  private currentOffset(t: number): number {
    if (this.offset === 0) return 0;
    const dt = t - this.offsetAt;
    const mag = Math.abs(this.offset);
    let decayed = mag * Math.exp(-dt / this.smoothing);
    if (this.offset > 0 && this.isPlaying) {
      // We were ahead: shed the error no faster than (1 - minRate) so time keeps moving forward.
      decayed = Math.max(decayed, mag - (1 - this.minRate) * dt);
    }
    return decayed < 0.5 ? 0 : Math.sign(this.offset) * decayed;
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
      this.basePos = target;
      this.baseAt = t;
      this.offset = 0;
      this.hasReading = true;
      if (trackChanged) this.emit({ type: 'track', track: s.track });
      return;
    }

    const shown = this.authoritative(t) + this.currentOffset(t);
    const playStateChanged = s.isPlaying !== this.isPlaying;

    this.isPlaying = s.isPlaying;
    this.basePos = target;
    this.baseAt = t;

    const error = shown - target; // > 0 means we were ahead
    if (Math.abs(error) > this.seekThreshold) {
      this.offset = 0;
      this.emit({ type: 'seek', fromMs: this.clamp(shown), toMs: this.clamp(target) });
    } else {
      this.offset = error;
      this.offsetAt = t;
    }

    if (playStateChanged) this.emit({ type: 'play-state', isPlaying: s.isPlaying });
  }

  /** Smoothed reading at local time `t`. Cheap; call every frame. */
  read(t: number): ClockReading {
    return {
      track: this.track,
      isPlaying: this.isPlaying,
      positionMs: this.hasReading ? this.clamp(this.authoritative(t) + this.currentOffset(t)) : 0,
    };
  }

  reset(): void {
    this.track = null;
    this.isPlaying = false;
    this.basePos = this.baseAt = this.offset = 0;
    this.hasReading = false;
  }
}
