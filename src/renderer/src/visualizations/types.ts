import type { ComponentType } from 'react';
import type { LyricsDocument, TrackRef } from '@shared/lyrics';
import type { MoodLabel, ThemeId } from '@shared/interpretation';

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
  /** Lyric themes this visualisation suits, strongest first — read by the adaptive director. */
  themes: readonly ThemeId[];
  /** Section energy (0…1) it is comfortable with. Default: anything. */
  energy?: readonly [number, number];
  /** Moods it carries well. */
  moods?: readonly MoodLabel[];
  /**
   * Variations in order of intensity. When a section returns (chorus 2, chorus 3), the director
   * moves one step along this list so the song escalates. Default: the `variations` order.
   */
  escalation?: readonly string[];
  /** A calm fallback the director may use when nothing else fits a section. */
  baseline?: boolean;
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
