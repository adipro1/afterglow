/**
 * Time-addressable motion primitives. Everything here is a pure function of time, so a scene's
 * look at song time t is fully determined — seeking, pausing and screenshot tests just work.
 */

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0..1 progress of `t` through the window [start, start + dur]. */
export const progress = (t: number, start: number, dur: number) =>
  dur <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / dur);

export type Ease = (x: number) => number;

export const linear: Ease = (x) => x;
export const easeOutQuad: Ease = (x) => 1 - (1 - x) * (1 - x);
export const easeOutCubic: Ease = (x) => 1 - Math.pow(1 - x, 3);
export const easeOutQuart: Ease = (x) => 1 - Math.pow(1 - x, 4);
export const easeOutExpo: Ease = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInQuad: Ease = (x) => x * x;
export const easeInCubic: Ease = (x) => x * x * x;
export const easeInOutSine: Ease = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
export const easeInOutCubic: Ease = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/** Gentle overshoot — for things that "land" (bubbles, cards). */
export const easeOutBack =
  (overshoot = 1.4): Ease =>
  (x) => {
    const c3 = overshoot + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
  };

/** Smooth 0→1→0 envelope over [0,1] with eased in/out shoulders of width `edge`. */
export function envelope(x: number, edge = 0.2): number {
  if (x <= 0 || x >= 1) return 0;
  if (x < edge) return easeInOutSine(x / edge);
  if (x > 1 - edge) return easeInOutSine((1 - x) / edge);
  return 1;
}

/** Deterministic hash → [0,1). Used for seeded "randomness" in scenes. */
export function hash01(n: number, seed = 0): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
