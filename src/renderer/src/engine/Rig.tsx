import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from '@/design/useReducedMotion';
import { ambient } from './ambient';
import { breathe, poseTransform, type BreatheSpec } from './camera';
import { setTransform } from './style';
import { useTicker } from './ticker';

/**
 * A camera rig: everything inside moves as one object hanging in the void, seen slightly
 * off-axis, breathing slowly on ambient time (see `breathe`). Frozen at rest under reduced
 * motion. Nest rigs to give parts of a composition their own, out-of-step drift.
 */
export function Rig({
  children,
  className,
  style,
  drift = {},
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  drift?: BreatheSpec;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useTicker(() => {
    setTransform(ref.current, poseTransform(breathe(ambient.now(), drift)));
  }, !reduced);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        transform: poseTransform(breathe(0, drift, 0)),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
