import { create } from 'zustand';
import type { InterpretationPlan } from '@shared/interpretation';
import type { ScenePlan } from './director';

export type DirectorMode = 'auto' | 'manual';

interface DirectorState {
  /** auto: the director picks scenes. manual: the user's S / V picks stay put. */
  mode: DirectorMode;
  lockScene: string | null;
  lockVariation: string | null;
  /** −1 … +1 per scene id. Edited in Settings (Phase 7); honoured from now. */
  preferences: Record<string, number>;
  /** Per song: section index → scene ids the user skipped there. Cleared on song change. */
  excluded: Record<number, string[]>;

  /** The current song's analysis and the director's plan for it. */
  interpretation: InterpretationPlan | null;
  plan: ScenePlan | null;
  /** Where playback is in the plan (updated a few times per song, not every frame). */
  sectionIndex: number;
  cueIndex: number;

  setMode(mode: DirectorMode): void;
  toggleMode(): void;
  /** Never show this scene for the section that's playing; pick the next best. */
  skip(sceneId: string): void;
  clearSkips(): void;
}

const STORAGE_KEY = 'afterglow.director';

function loadMode(): DirectorMode {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { mode?: string } | null;
    return raw?.mode === 'manual' ? 'manual' : 'auto';
  } catch {
    return 'auto';
  }
}

function persistMode(mode: DirectorMode) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
  } catch {
    /* non-essential */
  }
}

export const useDirector = create<DirectorState>((set, get) => ({
  mode: loadMode(),
  lockScene: null,
  lockVariation: null,
  preferences: {},
  excluded: {},
  interpretation: null,
  plan: null,
  sectionIndex: -1,
  cueIndex: -1,
  setMode(mode) {
    persistMode(mode);
    set({ mode });
  },
  toggleMode() {
    get().setMode(get().mode === 'auto' ? 'manual' : 'auto');
  },
  skip(sceneId) {
    const { sectionIndex, excluded, plan } = get();
    if (sectionIndex < 0 || !plan) return;
    // Skip it for every section of the current cue, so the replacement can actually play.
    const cue = plan.cues.find((c) => c.sections.includes(sectionIndex));
    const next = { ...excluded };
    for (const i of cue?.sections ?? [sectionIndex]) {
      next[i] = [...new Set([...(next[i] ?? []), sceneId])];
    }
    set({ excluded: next, mode: 'auto' });
    persistMode('auto');
  },
  clearSkips() {
    set({ excluded: {} });
  },
}));
