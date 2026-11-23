import { useEffect, useRef, useState } from 'react';
import type { LyricsDocument, TrackRef } from '@shared/lyrics';
import { useReducedMotion } from '@/design/useReducedMotion';
import { useTicker } from '@/engine/ticker';
import { runtime, usePlayback } from '@/state/playback';
import { useScene } from '@/state/scene';
import { findEntry } from '@/visualizations/registry';
import type { SceneProps, VisualizationModule } from '@/visualizations/types';

interface Layer {
  key: string;
  mod: VisualizationModule;
  variation: string;
  phase: 'enter' | 'live' | 'exit';
  /** Exiting layers keep the song they were showing, frozen at the moment they left. */
  frozen?: { lyrics: LyricsDocument | null; track: TrackRef | null; at: number };
}

const EXIT_MS = 1000;
const getTime = () => runtime.position();

let counter = 0;
const nextKey = (sceneId: string, variation: string) => `${sceneId}:${variation}:${counter++}`;

/**
 * Hosts the active visualisation. Scene code is loaded on demand. When the scene, variation or
 * song changes, the old layer sinks back while the new one surfaces, then the old one is
 * unmounted (freeing its DOM/GPU resources). At most two scenes are ever mounted.
 *
 * On a song change the outgoing layer keeps showing the *old* song, frozen at its last frame,
 * so the hand-off reads as one conversation ending and the next beginning — never a blank cut.
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

  // Remember what the outgoing song looked like on its last frame.
  const last = useRef<{
    key: string | null;
    at: number;
    lyrics: LyricsDocument | null;
    track: TrackRef | null;
  }>({
    key: null,
    at: 0,
    lyrics: null,
    track: null,
  });
  useTicker(() => {
    const s = usePlayback.getState();
    if ((s.track?.key ?? null) === last.current.key) last.current.at = getTime();
  });

  /** Retire current layers and surface a new one (after the next two frames, so CSS animates). */
  const surface = (mod: VisualizationModule, v: string, frozen?: Layer['frozen']) => {
    const key = nextKey(mod.meta.id, v);
    setLayers((prev) => [
      ...prev
        .filter((l) => l.phase !== 'exit')
        .map((l) => ({ ...l, phase: 'exit' as const, frozen: l.frozen ?? frozen })),
      { key, mod, variation: v, phase: 'enter' },
    ]);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setLayers((prev) => prev.map((l) => (l.key === key ? { ...l, phase: 'live' } : l))),
      ),
    );
    setTimeout(() => setLayers((prev) => prev.filter((l) => l.phase !== 'exit')), EXIT_MS);
  };

  useEffect(() => {
    let cancelled = false;
    const entry = findEntry(sceneId);
    if (!entry) return;
    void entry.load().then((mod) => {
      if (cancelled) return;
      surface(mod, variation);
      const v = mod.meta.variations.find((x) => x.id === variation);
      setLabel(`${mod.meta.name}${v && mod.meta.variations.length > 1 ? ` · ${v.name}` : ''}`);
    });
    return () => {
      cancelled = true;
    };
  }, [sceneId, variation]);

  // Song change: hand over from the old conversation to the new one.
  useEffect(() => {
    const prev = last.current;
    const key = track?.key ?? null;
    if (prev.key === key) return;
    const frozen = { lyrics: prev.lyrics, track: prev.track, at: prev.at };
    last.current = { key, at: 0, lyrics, track };
    if (prev.key === null || reducedMotion) return;
    setLayers((ls) => {
      const live = ls.find((l) => l.phase !== 'exit');
      if (live) queueMicrotask(() => surface(live.mod, live.variation, frozen));
      return ls;
    });
  }, [track, lyrics, reducedMotion]);

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
        const f = l.frozen;
        const props: SceneProps = {
          lyrics: f ? f.lyrics : lyrics,
          track: f ? f.track : track,
          variation: l.variation,
          quality,
          reducedMotion,
          seed: 7,
          getTime: f ? () => f.at : getTime,
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
