import { useRef } from 'react';
import { EdgePanel } from '@/design/EdgePanel';
import { useReducedMotion } from '@/design/useReducedMotion';
import { useTicker } from '@/engine/ticker';
import { PreludeView } from './PreludeView';

const TAU = Math.PI * 2;

/**
 * The stage: a single floating window hanging in the void, seen slightly off-axis.
 * It drifts on two slow, incommensurate sine periods so the motion never visibly loops —
 * the "camera breathing" feel of reference 1 without any wobble.
 */
export function Stage() {
  const rig = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useTicker(({ now }) => {
    const el = rig.current;
    if (!el) return;
    const ry = -3.2 + Math.sin((now / 23_000) * TAU) * 1.6;
    const rx = 1.4 + Math.sin((now / 31_000) * TAU + 1.3) * 0.7;
    const ty = Math.sin((now / 17_000) * TAU) * 4;
    el.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
  }, !reduced);

  return (
    <main className="stage" data-testid="stage">
      <div className="stage__floor" aria-hidden />
      <div className="stage__rig" ref={rig}>
        <EdgePanel
          className="stage__window"
          radius={16}
          notch={{ width: 132, depth: 9, at: 0.5 }}
          breathe
          data-testid="stage-window"
        >
          <PreludeView />
        </EdgePanel>
      </div>
    </main>
  );
}
