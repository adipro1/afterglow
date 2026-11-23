/**
 * Closed-form damped spring (step response from 0 to 1).
 *
 * Unlike an integrated spring, this is a pure function of elapsed time, so the value at any
 * song time can be computed directly — no per-frame state, no drift, seek-safe.
 */
export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
}

export const springs = {
  /** Soft landing with a hint of overshoot — message bubbles, cards. */
  land: { stiffness: 260, damping: 22 },
  /** Calm, no overshoot — layout shifts, scrolling. */
  glide: { stiffness: 140, damping: 24 },
  /** Snappy UI response. */
  snap: { stiffness: 420, damping: 34 },
  /** Slow and heavy — camera moves. */
  camera: { stiffness: 40, damping: 14 },
} satisfies Record<string, SpringConfig>;

/** Spring position at `ms` after release. 0 before release; settles at 1. */
export function spring(ms: number, cfg: SpringConfig): number {
  if (ms <= 0) return 0;
  const t = ms / 1000;
  const m = cfg.mass ?? 1;
  const w0 = Math.sqrt(cfg.stiffness / m);
  const zeta = cfg.damping / (2 * Math.sqrt(cfg.stiffness * m));
  let x: number;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    x = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  } else if (zeta === 1) {
    x = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  } else {
    const s = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + s;
    const r2 = -zeta * w0 - s;
    x = 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  // Snap the invisible tail so "settled" elements stop changing (lets callers skip DOM writes).
  return Math.abs(1 - x) < 1e-4 && t > 0.2 ? 1 : x;
}

/** Approximate time (ms) for a spring to settle within `eps` of 1 — for scheduling. */
export function settleTime(cfg: SpringConfig, eps = 1e-3): number {
  const m = cfg.mass ?? 1;
  const w0 = Math.sqrt(cfg.stiffness / m);
  const zeta = cfg.damping / (2 * Math.sqrt(cfg.stiffness * m));
  const decay = zeta < 1 ? zeta * w0 : w0 * (zeta - Math.sqrt(zeta * zeta - 1));
  return (Math.log(1 / eps) / decay) * 1000 * 1.1;
}
