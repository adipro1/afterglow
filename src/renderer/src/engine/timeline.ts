/**
 * Timeline primitives: how much of something is "there" at song time t.
 *
 * A scene doesn't animate by starting and stopping tweens; it schedules moments (a message
 * lands at 10 140 ms, a reaction at 29 850 ms) and asks, every frame, how far along each one is.
 * Everything here is a pure function of time, so seeking, pausing and screenshots are exact.
 */
import { clamp, smoothstep } from '@/animation/easing';
import { spring, type SpringConfig } from '@/animation/spring';

/** 0 before `at`, then follows the spring to 1. */
export function enter(t: number, at: number, cfg: SpringConfig): number {
  return spring(t - at, cfg);
}

/**
 * Presence of something that arrives at `from` and (optionally) leaves at `until`:
 * 0 → 1 on the way in, 1 → 0 on the way out. The product form means a quick in-and-out
 * never "pops": it simply doesn't get as far.
 */
export function presence(
  t: number,
  from: number,
  until: number | null | undefined,
  inCfg: SpringConfig,
  outCfg: SpringConfig = inCfg,
): number {
  const a = spring(t - from, inCfg);
  return until === null || until === undefined || !Number.isFinite(until)
    ? a
    : a * (1 - spring(t - until, outCfg));
}

/** Linear 0 → 1 ramp over `ms` after `at` (for quick opacity fades that must not overshoot). */
export function ramp(t: number, at: number, ms: number): number {
  return ms <= 0 ? (t >= at ? 1 : 0) : clamp((t - at) / ms);
}

/**
 * A flash: rises linearly over `riseMs`, then decays exponentially with time constant `tauMs`.
 * Light catching an edge, a screen waking.
 */
export function flash(age: number, riseMs: number, tauMs: number): number {
  if (age < 0) return 0;
  return clamp(age / riseMs) * Math.exp(-Math.max(0, age - riseMs) / tauMs);
}

/**
 * Lifts at `at` over `riseMs`, holds for `holdMs`, then fades out over `fadeMs`.
 * Returns 0 outside, so callers can max() several of them together.
 */
export function pulse(
  t: number,
  at: number,
  riseMs: number,
  holdMs: number,
  fadeMs: number,
): number {
  const age = t - at;
  if (age < 0 || age > holdMs + fadeMs) return 0;
  const rise = smoothstep(0, riseMs, age);
  return age < holdMs ? rise : rise * (1 - smoothstep(holdMs, holdMs + fadeMs, age));
}

/** On/off at a steady rhythm (text carets). On for the first half of each period. */
export function blink(t: number, periodMs = 1060): boolean {
  return Math.floor(t / (periodMs / 2)) % 2 === 0;
}

/**
 * A wave rolling through `index`-ed items: each item rises and falls once per `periodMs`,
 * `lag` of a period after the one before it, resting for the second half.
 * The real typing indicator works like this.
 */
export function wave(t: number, index: number, periodMs: number, lag: number): number {
  const phase = (((t / periodMs - index * lag) % 1) + 1) % 1;
  return phase < 0.5 ? Math.sin((phase / 0.5) * Math.PI) ** 2 : 0;
}

/** Index of the last cue whose time has come (cues sorted ascending), or -1. Binary search. */
export function lastBefore(times: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
