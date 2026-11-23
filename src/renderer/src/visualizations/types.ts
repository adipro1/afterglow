import type { ComponentType } from 'react';
import type { LyricsDocument, TrackRef } from '@shared/lyrics';

export type QualityLevel = 'performance' | 'balanced' | 'quality';

export type VisualizationCategory =
  'interface' | 'typographic' | 'cinematic' | 'environment' | 'abstract';

export interface VariationMeta {
  id: string;
  name: string;
  description: string;
}

export interface VisualizationMeta {
  id: string;
  name: string;
  description: string;
  category: VisualizationCategory;
  variations: readonly VariationMeta[];
  /** Lyric themes this visualisation suits — consumed by the adaptive director (Phase 4). */
  themes: readonly string[];
}

/**
 * What every scene receives. Scenes read song time via `getTime()` inside the shared ticker
 * and must render a pure function of (lyrics, time, variation, seed).
 */
export interface SceneProps {
  lyrics: LyricsDocument | null;
  track: TrackRef | null;
  variation: string;
  quality: QualityLevel;
  reducedMotion: boolean;
  seed: number;
  /** Smoothed song position in ms. Cheap — call every frame. */
  getTime: () => number;
  /** Increments on seeks/track changes; scenes may use it to skip transitions. */
  discontinuity: number;
}

export interface VisualizationModule {
  meta: VisualizationMeta;
  Scene: ComponentType<SceneProps>;
}

/** Registry entry: metadata is available immediately, the scene code loads on demand. */
export interface VisualizationEntry {
  meta: VisualizationMeta;
  load: () => Promise<VisualizationModule>;
}
