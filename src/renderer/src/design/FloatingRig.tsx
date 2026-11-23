import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { useTicker } from '@/engine/ticker';
import { ambient } from '@/engine/ambient';

const TAU = Math.PI * 2;

export interface DriftSpec {
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
 * A window hanging in the void, seen slightly off-axis. It drifts on slow, incommensurate sine
 * periods so the motion never visibly loops — "camera breathing" without wobble.
 */
export function FloatingRig({
  children,
  className,
  style,
  drift = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  drift?: DriftSpec;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const {
    rotX = 1.4,
    rotY = -3.2,
    rotZ = 0,
    z = 0,
    ampX = 0.7,
    ampY = 1.6,
    ampLift = 4,
    phase = 0,
  } = drift;

  const pose = (now: number, moving: boolean) => {
    const k = moving ? 1 : 0;
    const ry = rotY + Math.sin((now / 23_000) * TAU + phase) * ampY * k;
    const rx = rotX + Math.sin((now / 31_000) * TAU + 1.3 + phase) * ampX * k;
    const ty = Math.sin((now / 17_000) * TAU + phase * 2) * ampLift * k;
    return `translate3d(0, ${ty.toFixed(2)}px, ${z}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rotZ}deg)`;
  };

  useTicker(() => {
    if (ref.current) ref.current.style.transform = pose(ambient.now(), true);
  }, !reduced);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        transform: pose(0, false),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
