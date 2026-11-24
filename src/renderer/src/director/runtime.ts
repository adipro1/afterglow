import { ticker } from '@/engine/ticker';
import { interpret } from '@/interpret/interpreter';
import { runtime, usePlayback } from '@/state/playback';
import { useScene } from '@/state/scene';
import { registry } from '@/visualizations/registry';
import { cueIndexAt, directSong, sectionIndexAt } from './director';
import { useDirector } from './store';

/**
 * Connects the director to playback. Runs outside React so that when a song changes, its
 * analysis, its plan and its opening scene are all decided in the same moment as the song
 * itself — the stage then hands over to the right scene in one move.
 */

const catalog = registry.map((e) => e.meta);

function replan() {
  const { lyrics, track } = usePlayback.getState();
  const d = useDirector.getState();
  if (!lyrics || !track || lyrics.sync === 'none' || !lyrics.lines.length) {
    if (d.plan || d.interpretation) {
      useDirector.setState({ plan: null, interpretation: null, cueIndex: -1, sectionIndex: -1 });
    }
    return;
  }
  const interpretation = interpret(lyrics, track);
  const plan = directSong(interpretation, lyrics.lines, catalog, {
    lockScene: d.lockScene,
    lockVariation: d.lockVariation,
    preferences: d.preferences,
    excluded: d.excluded,
  });
  useDirector.setState({ interpretation, plan, cueIndex: -1, sectionIndex: -1 });
  follow(runtime.position(performance.now()));
}

/** Bring the scene in line with the plan at time t (auto mode only). */
function follow(t: number) {
  const d = useDirector.getState();
  const { plan, interpretation } = d;
  if (!plan || !interpretation) return;
  const ci = cueIndexAt(plan, t);
  const si = sectionIndexAt(interpretation, t);
  if (ci !== d.cueIndex || si !== d.sectionIndex)
    useDirector.setState({ cueIndex: ci, sectionIndex: si });
  if (d.mode !== 'auto' || ci < 0) return;
  const cue = plan.cues[ci]!;
  useScene.getState().apply(cue.sceneId, cue.variation, cue.transition);
}

let started = false;

export function startDirector(): void {
  if (started) return;
  started = true;
  let lastTrack = usePlayback.getState().track?.key ?? null;
  usePlayback.subscribe((s, prev) => {
    const key = s.track?.key ?? null;
    if (key !== lastTrack) {
      lastTrack = key;
      // Skips belong to the song they were made in.
      if (Object.keys(useDirector.getState().excluded).length)
        useDirector.setState({ excluded: {} });
    }
    if (s.lyrics !== prev.lyrics || s.track !== prev.track) replan();
  });
  useDirector.subscribe((s, prev) => {
    if (
      s.lockScene !== prev.lockScene ||
      s.lockVariation !== prev.lockVariation ||
      s.preferences !== prev.preferences ||
      s.excluded !== prev.excluded
    ) {
      replan();
    } else if (s.mode !== prev.mode && s.mode === 'auto') {
      follow(runtime.position());
    }
  });
  ticker.add(() => follow(runtime.position()));
  replan();
}
