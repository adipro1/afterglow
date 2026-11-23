import { create } from 'zustand';
import { registry } from '@/visualizations/registry';
import type { QualityLevel } from '@/visualizations/types';

interface SceneState {
  sceneId: string;
  variation: string;
  quality: QualityLevel;
  select(sceneId: string, variation?: string): void;
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
 * Which visualisation is showing. Manual for now; the adaptive director (Phase 4) will drive
 * this, with user locks/overrides layered on top (Phase 7).
 */
export const useScene = create<SceneState>((set, get) => ({
  ...loadInitial(),
  quality: 'balanced',
  select(sceneId, variation) {
    const entry = registry.find((e) => e.meta.id === sceneId);
    if (!entry) return;
    const v = variation ?? entry.meta.variations[0]!.id;
    persist(sceneId, v);
    set({ sceneId, variation: v });
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
