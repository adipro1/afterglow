import { useEffect, useRef } from 'react';

export interface FrameInfo {
  /** performance.now() at frame start. */
  now: number;
  /** ms since previous frame, clamped to avoid huge jumps after the tab was hidden. */
  dt: number;
}

type Subscriber = (f: FrameInfo) => void;

/**
 * One requestAnimationFrame loop for the whole renderer. Everything that animates per frame
 * subscribes here instead of starting its own loop, so there is one place to throttle,
 * pause or measure. The loop stops entirely when there are no subscribers.
 */
class Ticker {
  private subs = new Set<Subscriber>();
  private raf = 0;
  private last = 0;
  /** Ring buffer of recent frame intervals (ms) and script time per frame (ms). */
  private intervals = new Float32Array(240);
  private work = new Float32Array(240);
  private cursor = 0;
  private filled = 0;

  add(fn: Subscriber): () => void {
    this.subs.add(fn);
    if (this.subs.size === 1) this.start();
    return () => {
      this.subs.delete(fn);
      if (!this.subs.size) this.stop();
    };
  }

  private start() {
    this.last = performance.now();
    let prev = this.last;
    const loop = (now: number) => {
      const dt = Math.min(64, now - this.last);
      this.last = now;
      const info = { now, dt };
      const t0 = performance.now();
      for (const s of this.subs) s(info);
      this.intervals[this.cursor] = now - prev;
      this.work[this.cursor] = performance.now() - t0;
      this.cursor = (this.cursor + 1) % this.intervals.length;
      this.filled = Math.min(this.filled + 1, this.intervals.length);
      prev = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Frame statistics over the last ~4 seconds — for the perf overlay and tests. */
  stats(): { fps: number; p95FrameMs: number; avgScriptMs: number; frames: number } {
    const n = this.filled;
    if (!n) return { fps: 0, p95FrameMs: 0, avgScriptMs: 0, frames: 0 };
    const iv = Array.from(this.intervals.slice(0, n)).sort((a, b) => a - b);
    const mean = iv.reduce((a, b) => a + b, 0) / n;
    const work = Array.from(this.work.slice(0, n)).reduce((a, b) => a + b, 0) / n;
    return {
      fps: 1000 / mean,
      p95FrameMs: iv[Math.floor(n * 0.95)] ?? 0,
      avgScriptMs: work,
      frames: n,
    };
  }

  resetStats(): void {
    this.filled = 0;
    this.cursor = 0;
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}

export const ticker = new Ticker();

/** Subscribe a component to the shared frame loop. The callback may change between renders. */
export function useTicker(fn: Subscriber, enabled = true): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    return ticker.add((f) => ref.current(f));
  }, [enabled]);
}
