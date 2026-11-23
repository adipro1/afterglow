/**
 * Camera motion: how a whole composition moves as one object.
 *
 * - `breathe` — the slow, never-repeating drift of something hanging in the void.
 * - `shake`   — a short decaying vibration (a phone buzzing on a table).
 * - `nudge`   — a one-off push and settle (a window answering a sent message).
 * - `move`    — a spring-driven camera move between two poses (for transitions and pushes).
 *
 * All are pure functions of time and return a `Pose`; `poseTransform` turns it into CSS.
 */
import { bump, mix } from '@/animation/easing';
import { spring, springs, type SpringConfig } from '@/animation/spring';

const TAU = Math.PI * 2;

export interface Pose {
  /** px */
  x: number;
  y: number;
  z: number;
  /** degrees */
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

export const REST: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 };

export interface BreatheSpec {
  /** Resting pose in degrees / px. */
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  z?: number;
  /** Amplitudes of the slow drift. */
  ampX?: number;
  ampY?: number;
  ampLift?: number;
  /** Phase offset so several rigs in one scene never move in lockstep. */
  phase?: number;
}

/**
 * Slow drift on incommensurate sine periods (23 s, 31 s, 17 s), so the motion never visibly
 * loops — "camera breathing" without wobble. `amount` 0 gives the resting pose.
 */
export function breathe(now: number, spec: BreatheSpec = {}, amount = 1): Pose {
  const {
    rotX = 1.4,
    rotY = -3.2,
    rotZ = 0,
    z = 0,
    ampX = 0.7,
    ampY = 1.6,
    ampLift = 4,
    phase = 0,
  } = spec;
  return {
    x: 0,
    y: Math.sin((now / 17_000) * TAU + phase * 2) * ampLift * amount,
    z,
    rotX: rotX + Math.sin((now / 31_000) * TAU + 1.3 + phase) * ampX * amount,
    rotY: rotY + Math.sin((now / 23_000) * TAU + phase) * ampY * amount,
    rotZ,
    scale: 1,
  };
}

export interface ShakeSpec {
  /** Peak sideways travel (px) and rotation (deg). */
  amp: number;
  rot: number;
  /** Decay time constant (ms) and the two vibration periods (ms). */
  decayMs?: number;
  periodMs?: number;
  rotPeriodMs?: number;
  /** After this the shake is over (exactly 0). */
  durationMs?: number;
}

/** A short, fast, decaying vibration starting at age 0. */
export function shake(age: number, s: ShakeSpec): { x: number; rot: number } {
  const { decayMs = 150, periodMs = 44, rotPeriodMs = 61, durationMs = 520 } = s;
  if (age < 0 || age > durationMs) return { x: 0, rot: 0 };
  const env = Math.exp(-age / decayMs) * smooth01(age / 30);
  return {
    x: s.amp * env * Math.sin((age / periodMs) * TAU),
    rot: s.rot * env * Math.sin((age / rotPeriodMs) * TAU + 1.1),
  };
}

/** A push that peaks at `peakMs` and settles back: returns 0..1 (scale it by the distance). */
export function nudge(age: number, peakMs: number): number {
  return bump(age, peakMs);
}

/** Spring-driven move from pose `a` to pose `b`, starting at `at`. */
export function move(
  t: number,
  at: number,
  a: Pose,
  b: Pose,
  cfg: SpringConfig = springs.camera,
): Pose {
  const k = spring(t - at, cfg);
  return {
    x: mix(a.x, b.x, k),
    y: mix(a.y, b.y, k),
    z: mix(a.z, b.z, k),
    rotX: mix(a.rotX, b.rotX, k),
    rotY: mix(a.rotY, b.rotY, k),
    rotZ: mix(a.rotZ, b.rotZ, k),
    scale: mix(a.scale, b.scale, k),
  };
}

/** CSS transform for a pose, in the rig's order: translate → rotateX → rotateY → rotateZ → scale. */
export function poseTransform(p: Pose): string {
  let s = `translate3d(${p.x === 0 ? 0 : `${p.x.toFixed(2)}px`}, ${p.y.toFixed(2)}px, ${p.z}px) rotateX(${p.rotX.toFixed(3)}deg) rotateY(${p.rotY.toFixed(3)}deg) rotateZ(${p.rotZ}deg)`;
  if (p.scale !== 1) s += ` scale(${p.scale.toFixed(4)})`;
  return s;
}

function smooth01(x: number) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}
