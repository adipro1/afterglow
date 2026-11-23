/**
 * Seeded particle fields: a fixed set of soft motes (bokeh, dust, embers) that drift slowly
 * upward through a scene on ambient time. Deterministic per seed, so screenshots are stable.
 */
import { hash01, smoothstep } from '@/animation/easing';

const TAU = Math.PI * 2;

export interface Mote {
  /** Home position, % of the container. */
  x: number;
  y: number;
  /** Diameter (px). */
  size: number;
  /** 0 = near, 1 = far. */
  depth: number;
  /** Time to drift through the whole field (ms). */
  period: number;
  /** A coin-flip per mote, e.g. warm vs cool colour. */
  alt: boolean;
}

export interface FieldSpec {
  count: number;
  /** Size range (px). */
  minSize: number;
  maxSize: number;
  /** Drift period range (ms). */
  minPeriod: number;
  maxPeriod: number;
  /** Seed offset so different fields in one scene don't share motes. */
  salt?: number;
}

export function makeField(seed: number, f: FieldSpec): Mote[] {
  const s = seed + (f.salt ?? 31);
  return Array.from({ length: f.count }, (_, i) => ({
    x: hash01(i, s) * 100,
    y: hash01(i, s + 1) * 100,
    size: f.minSize + hash01(i, s + 2) * (f.maxSize - f.minSize),
    depth: hash01(i, s + 3),
    period: f.minPeriod + hash01(i, s + 4) * (f.maxPeriod - f.minPeriod),
    alt: hash01(i, s + 5) < 0.5,
  }));
}

/**
 * Where mote `i` is at ambient time `now`: position (% of the container; rises from below the
 * bottom edge to above the top), and a 0..1 visibility that fades in and out at the edges and
 * twinkles gently.
 */
export function motePose(m: Mote, i: number, now: number): { x: number; y: number; k: number } {
  const ph = (now / m.period + m.depth) % 1;
  const y = 110 - ph * 120;
  const x = m.x + Math.sin(ph * TAU * 2 + i) * 2;
  const twinkle = 0.5 + 0.5 * Math.sin(now / 2300 + i * 1.7);
  const fade = smoothstep(0, 0.15, ph) * (1 - smoothstep(0.85, 1, ph));
  return { x, y, k: fade * (0.7 + 0.3 * twinkle) };
}
