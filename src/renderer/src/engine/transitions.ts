/**
 * Transitions.
 *
 * 1. Reveals — an element appears through a rounded window that grows from one size to its
 *    full size. Corners stay perfectly round (a non-uniform scale would squash them). Used for
 *    the typing bubble growing into a message and a notification unfolding into the list.
 *    Clip-path changes repaint, so use reveals only on small elements, briefly, then clear them.
 *
 * 2. Scene transitions — how one composition hands over to the next (scene switch, variation
 *    switch, song change). Declared as data: a pose for the outgoing layer to leave to, a pose
 *    for the incoming layer to start from, and timings. The stage animates between them with
 *    CSS transitions on transform + opacity only, so they run entirely on the compositor.
 */

// ── Reveals ─────────────────────────────────────────────────────────────────────────────────

export interface Box {
  w: number;
  h: number;
}

export type RevealAnchor = 'bottom-left' | 'top';

/**
 * `clip-path` that shows `shown` of an element whose full size is `full`, anchored at a corner
 * or edge. `bleed` extends the window outward on the anchored side (px) so attached details —
 * a bubble's tail — stay visible. Returns '' once fully shown, to clear the clip.
 */
export function revealClip(
  full: Box,
  shown: Box,
  { anchor, radius, bleed = 0 }: { anchor: RevealAnchor; radius: string | number; bleed?: number },
): string {
  const cutY = full.h - shown.h;
  const cutX = full.w - shown.w;
  const r = typeof radius === 'number' ? `${radius.toFixed(1)}px` : radius;
  if (anchor === 'top') {
    if (cutY <= 0.5) return '';
    return `inset(0 0 ${cutY.toFixed(1)}px 0 round ${r})`;
  }
  return `inset(${cutY.toFixed(1)}px ${cutX.toFixed(1)}px 0 ${(-bleed).toFixed(0)}px round ${r})`;
}

// ── Scene transitions ───────────────────────────────────────────────────────────────────────

export interface LayerPose {
  opacity: number;
  /** CSS transform (compositor-only). */
  transform: string;
}

export interface SceneTransition {
  id: string;
  /** Where the outgoing layer goes, and how long it takes. */
  exit: LayerPose & { opacityMs: number; transformMs: number; easing: string };
  /** Where the incoming layer starts; it then animates to rest. */
  enter: LayerPose;
  /** How the incoming layer moves to rest. */
  settle: { opacityMs: number; transformMs: number; easing: string };
  /** When the outgoing layer can be unmounted. */
  totalMs: number;
}

const REST_POSE: LayerPose = { opacity: 1, transform: 'none' };

export const sceneTransitions = {
  /** The default: the old scene sinks back into the dark while the new one surfaces in front. */
  sink: {
    id: 'sink',
    exit: {
      opacity: 0,
      transform: 'scale(0.94) translateY(1.5%)',
      opacityMs: 450,
      transformMs: 900,
      easing: 'var(--ease-out-expo)',
    },
    enter: { opacity: 0, transform: 'scale(1.045)' },
    settle: { opacityMs: 700, transformMs: 1100, easing: 'var(--ease-spring)' },
    totalMs: 1000,
  },
  /** The camera pushes forward through the old scene into the new one (for escalations). */
  push: {
    id: 'push',
    exit: {
      opacity: 0,
      transform: 'scale(1.12)',
      opacityMs: 380,
      transformMs: 800,
      easing: 'var(--ease-out-expo)',
    },
    enter: { opacity: 0, transform: 'scale(0.9)' },
    settle: { opacityMs: 600, transformMs: 1200, easing: 'var(--ease-spring-soft)' },
    totalMs: 900,
  },
  /** Slides sideways, like turning to a second screen in the room. */
  pan: {
    id: 'pan',
    exit: {
      opacity: 0,
      transform: 'translateX(-6%) rotateY(8deg) scale(0.97)',
      opacityMs: 500,
      transformMs: 900,
      easing: 'var(--ease-out-expo)',
    },
    enter: { opacity: 0, transform: 'translateX(6%) rotateY(-8deg) scale(0.97)' },
    settle: { opacityMs: 650, transformMs: 1150, easing: 'var(--ease-spring)' },
    totalMs: 1000,
  },
  /** A plain cross-fade, for reduced motion. */
  fade: {
    id: 'fade',
    exit: { opacity: 0, transform: 'none', opacityMs: 400, transformMs: 0, easing: 'linear' },
    enter: { opacity: 0, transform: 'none' },
    settle: { opacityMs: 400, transformMs: 0, easing: 'var(--ease-out-quart)' },
    totalMs: 450,
  },
} satisfies Record<string, SceneTransition>;

export type SceneTransitionId = keyof typeof sceneTransitions;

export type LayerPhase = 'enter' | 'live' | 'exit';

/** Inline style for a scene layer in a given phase of a transition. */
export function layerStyle(
  tr: SceneTransition,
  phase: LayerPhase,
): { opacity: number; transform: string; transition: string } {
  if (phase === 'enter') return { ...tr.enter, transition: 'none' };
  if (phase === 'exit')
    return {
      opacity: tr.exit.opacity,
      transform: tr.exit.transform,
      transition: `opacity ${tr.exit.opacityMs}ms var(--ease-out-quart), transform ${tr.exit.transformMs}ms ${tr.exit.easing}`,
    };
  return {
    ...REST_POSE,
    transition: `opacity ${tr.settle.opacityMs}ms var(--ease-out-quart), transform ${tr.settle.transformMs}ms ${tr.settle.easing}`,
  };
}
