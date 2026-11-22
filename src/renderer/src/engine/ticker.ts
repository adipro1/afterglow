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
    const loop = (now: number) => {
      const dt = Math.min(64, now - this.last);
      this.last = now;
      const info = { now, dt };
      for (const s of this.subs) s(info);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
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
