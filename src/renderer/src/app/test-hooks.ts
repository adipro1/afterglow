import type { AfterglowTestHooks } from '@shared/test-hooks';
import { ambient } from '@/engine/ambient';
import { ticker } from '@/engine/ticker';
import { isControllable } from '@/playback/types';
import { DemoPlaybackSource } from '@/playback/demo-source';
import { runtime } from '@/state/playback';
import { useScene } from '@/state/scene';

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
      src().pause();
      src().seek(ms);
    },
    play: () => {
      ambient.unfreeze();
      src().play();
    },
    pause: () => src().pause(),
    selectTrack(index) {
      const s = src();
      if (s instanceof DemoPlaybackSource) s.select(index);
    },
    selectScene: (id, v) => useScene.getState().select(id, v),
    position: () => runtime.position(),
    resetPerf: () => ticker.resetStats(),
    perf: () => ticker.stats(),
  };
  window.__afterglowTest = hooks;
}
