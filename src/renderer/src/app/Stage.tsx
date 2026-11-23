import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/design/useReducedMotion';
import { runtime, usePlayback } from '@/state/playback';
import { useScene } from '@/state/scene';
import { findEntry } from '@/visualizations/registry';
import type { SceneProps, VisualizationModule } from '@/visualizations/types';

interface Layer {
  key: string;
  mod: VisualizationModule;
  variation: string;
  phase: 'enter' | 'live' | 'exit';
}

const EXIT_MS = 1000;
const getTime = () => runtime.position();

/**
 * Hosts the active visualisation. Scene code is loaded on demand; when the scene or variation
 * changes, the old layer sinks back while the new one surfaces, then the old one is unmounted
 * (freeing its DOM/GPU resources). At most two scenes are ever mounted.
 */
export function Stage() {
  const sceneId = useScene((s) => s.sceneId);
  const variation = useScene((s) => s.variation);
  const quality = useScene((s) => s.quality);
  const lyrics = usePlayback((s) => s.lyrics);
  const track = usePlayback((s) => s.track);
  const discontinuity = usePlayback((s) => s.discontinuity);
  const reducedMotion = useReducedMotion();
  const [layers, setLayers] = useState<Layer[]>([]);
  const [label, setLabel] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const entry = findEntry(sceneId);
    if (!entry) return;
    void entry.load().then((mod) => {
      if (cancelled) return;
      const key = `${sceneId}:${variation}:${counter.current++}`;
      setLayers((prev) => [
        ...prev.filter((l) => l.phase !== 'exit').map((l) => ({ ...l, phase: 'exit' as const })),
        { key, mod, variation, phase: 'enter' },
      ]);
      // Two frames later, flip 'enter' → 'live' so the CSS transition runs.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setLayers((prev) => prev.map((l) => (l.key === key ? { ...l, phase: 'live' } : l))),
        ),
      );
      setTimeout(() => setLayers((prev) => prev.filter((l) => l.phase !== 'exit')), EXIT_MS);
      const v = mod.meta.variations.find((x) => x.id === variation);
      setLabel(`${mod.meta.name}${v && mod.meta.variations.length > 1 ? ` · ${v.name}` : ''}`);
    });
    return () => {
      cancelled = true;
    };
  }, [sceneId, variation]);

  // The scene name appears briefly after a switch, then gets out of the way.
  useEffect(() => {
    if (!label) return;
    const t = setTimeout(() => setLabel(null), 2200);
    return () => clearTimeout(t);
  }, [label]);

  return (
    <main className="stage" data-testid="stage" data-scene={sceneId} data-variation={variation}>
      <div className={`stage__label caps ${label ? 'is-shown' : ''}`}>{label}</div>
      {layers.map((l) => {
        const props: SceneProps = {
          lyrics,
          track,
          variation: l.variation,
          quality,
          reducedMotion,
          seed: 7,
          getTime,
          discontinuity,
        };
        const { Scene } = l.mod;
        return (
          <div key={l.key} className="scene-layer" data-phase={l.phase}>
            <Scene {...props} />
          </div>
        );
      })}
    </main>
  );
}
