import { create } from 'zustand';
import { registry } from '@/visualizations/registry';
import type { QualityLevel } from '@/visualizations/types';
import type { SceneTransitionId } from '@/engine/transitions';

interface SceneState {
  sceneId: string;
  variation: string;
  quality: QualityLevel;
  /** How the next scene change should look (set by whoever changes the scene). */
  transition: SceneTransitionId;
  /** A choice by the user — remembered for next time. */
  select(sceneId: string, variation?: string): void;
  /** A choice by the director — not remembered (the director re-decides every song). */
  apply(sceneId: string, variation: string, transition: SceneTransitionId): void;
  cycleVariation(dir?: 1 | -1): void;
  cycleScene(dir?: 1 | -1): void;
}

const STORAGE_KEY = 'afterglow.scene';
const fallback = { sceneId: 'messages', variation: 'thread' };

function loadInitial(): { sceneId: string; variation: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      sceneId?: string;
      variation?: string;
    } | null;
    const entry = registry.find((e) => e.meta.id === raw?.sceneId);
    if (entry && entry.meta.variations.some((v) => v.id === raw?.variation)) {
      return { sceneId: entry.meta.id, variation: raw!.variation! };
    }
  } catch {
    /* storage unavailable or corrupt — fall through */
  }
  return fallback;
}

function persist(sceneId: string, variation: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sceneId, variation }));
  } catch {
    /* non-essential */
  }
}

/**
 * Which visualisation is showing. The adaptive director (`director/`) drives it while it's in
 * auto mode; the user's own picks (S / V) take over in manual mode.
 */
export const useScene = create<SceneState>((set, get) => ({
  ...loadInitial(),
  quality: 'balanced',
  transition: 'sink',
  select(sceneId, variation) {
    const entry = registry.find((e) => e.meta.id === sceneId);
    if (!entry) return;
    const v = variation ?? entry.meta.variations[0]!.id;
    persist(sceneId, v);
    set({ sceneId, variation: v, transition: 'sink' });
  },
  apply(sceneId, variation, transition) {
    const entry = registry.find((e) => e.meta.id === sceneId);
    if (!entry || !entry.meta.variations.some((v) => v.id === variation)) return;
    const cur = get();
    if (cur.sceneId === sceneId && cur.variation === variation) return;
    set({ sceneId, variation, transition });
  },
  cycleVariation(dir = 1) {
    const { sceneId, variation } = get();
    const vs = registry.find((e) => e.meta.id === sceneId)?.meta.variations ?? [];
    const i = vs.findIndex((v) => v.id === variation);
    const next = vs[(i + dir + vs.length) % vs.length];
    if (next) get().select(sceneId, next.id);
  },
  cycleScene(dir = 1) {
    const i = registry.findIndex((e) => e.meta.id === get().sceneId);
    const next = registry[(i + dir + registry.length) % registry.length];
    if (next) get().select(next.meta.id);
  },
}));
