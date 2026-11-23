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

/**
 * A spring described the way Apple's SwiftUI does: `response` is roughly how long one
 * oscillation takes (s), `dampingFraction` 1 = no overshoot, lower = bouncier. Designers think in
 * these two numbers, so every preset below is written with them.
 */
export function appleSpring(response: number, dampingFraction: number): SpringConfig {
  const w = (2 * Math.PI) / response;
  return { stiffness: w * w, damping: 2 * dampingFraction * w };
}

export const springs = {
  /** Things that arrive — message bubbles, cards: quick, with a whisper of overshoot. */
  land: appleSpring(0.46, 0.8),
  /** Layout moving to make room — no overshoot, unhurried. */
  glide: appleSpring(0.56, 1),
  /** Small UI responses. */
  snap: appleSpring(0.3, 0.92),
  /** Playful pops — reactions, badges. */
  pop: appleSpring(0.38, 0.58),
  /** Long, soft settles — lighting, depth. */
  settle: appleSpring(0.9, 1),
  /** Slow and heavy — camera moves. */
  camera: appleSpring(1.6, 0.9),
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
