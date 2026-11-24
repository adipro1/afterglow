import type { AfterglowTestHooks } from '@shared/test-hooks';
import { ambient } from '@/engine/ambient';
import { ticker } from '@/engine/ticker';
import { isControllable } from '@/playback/types';
import { DemoPlaybackSource } from '@/playback/demo-source';
import { runtime, usePlayback } from '@/state/playback';
import { useScene } from '@/state/scene';
import { useDirector } from '@/director/store';
import { importLyricsText } from '@/lyrics/importer';

/**
 * Endless CSS animations (e.g. the edge light breathing) run on their own clock, which a freeze
 * cannot stop. Pin them to their first frame so frozen screenshots are exactly repeatable.
 * One-shot animations and transitions are left alone: they still have to finish.
 */
function holdLoopingAnimations(hold: boolean) {
  for (const a of document.getAnimations()) {
    if (!(a instanceof CSSAnimation) || a.effect?.getTiming().iterations !== Infinity) continue;
    if (hold) {
      a.pause();
      a.currentTime = 0;
    } else a.play();
  }
}

/** Installed only when the app is launched by the test harness (`?test=1`). */
export function installTestHooks(): void {
  if (new URLSearchParams(location.search).get('test') !== '1') return;
  const src = () => {
    const s = runtime.source;
    if (!isControllable(s)) throw new Error('active source is not controllable');
    return s;
  };
  const hooks: AfterglowTestHooks = {
    freezeAt(ms) {
      ambient.freeze(0);
      holdLoopingAnimations(true);
      src().pause();
      src().seek(ms);
    },
    play: () => {
      ambient.unfreeze();
      holdLoopingAnimations(false);
      src().play();
    },
    pause: () => src().pause(),
    selectTrack(index) {
      const s = src();
      if (s instanceof DemoPlaybackSource) s.select(index);
    },
    // A test picking a scene is like the user picking one: the director stands aside.
    selectScene: (id, v) => {
      useDirector.getState().setMode('manual');
      useScene.getState().select(id, v);
    },
    setDirector: (mode) => useDirector.getState().setMode(mode),
    director: () => {
      const d = useDirector.getState();
      const s = useScene.getState();
      return {
        mode: d.mode,
        sceneId: s.sceneId,
        variation: s.variation,
        cues:
          d.plan?.cues.map((c) => ({ atMs: c.atMs, sceneId: c.sceneId, variation: c.variation })) ??
          [],
        sections:
          d.interpretation?.sections.map((x) => ({ kind: x.kind, startMs: x.startMs })) ?? [],
      };
    },
    importLyrics: (name, text) => importLyricsText(name, text),
    lyrics: () => {
      const p = usePlayback.getState();
      return {
        origin: p.lyricsOrigin,
        sync: p.lyrics?.sync ?? null,
        lines: p.lyrics?.lines.length ?? 0,
      };
    },
    position: (at) => runtime.position(at),
    resetPerf: () => ticker.resetStats(),
    perf: () => ticker.stats(),
  };
  window.__afterglowTest = hooks;
}
