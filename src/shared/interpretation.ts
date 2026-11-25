/**
 * What AFTERGLOW understands about a song: its sections, and what each section is about.
 * Produced by an `Interpreter` from timed lyrics; consumed by the adaptive director.
 */

/** Themes a visualisation can declare it suits, and that lyrics are analysed for. */
export const THEMES = [
  'conversation',
  'messages',
  'technology',
  'longing',
  'separation',
  'love',
  'heartbreak',
  'memory',
  'night',
  'city',
  'travel',
  'home',
  'water',
  'sky',
  'fire',
  'time',
  'dreams',
  'freedom',
  'party',
  'isolation',
  'reflection',
  'hope',
  'nature',
] as const;
export type ThemeId = (typeof THEMES)[number];

export type SectionKind =
  'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'instrumental';

export type MoodLabel = 'euphoric' | 'tender' | 'tense' | 'melancholic' | 'reflective';

export interface Mood {
  /** −1 (dark) … +1 (bright). */
  valence: number;
  /** 0 (still) … 1 (intense). */
  arousal: number;
  label: MoodLabel;
}

export interface WeightedTheme {
  id: ThemeId;
  /** 0…1, relative to the section's strongest theme. */
  weight: number;
}

export interface SectionPlan {
  index: number;
  kind: SectionKind;
  startMs: number;
  endMs: number;
  /** Lyric line indices [from, to) — empty for instrumental sections. */
  lines: readonly [number, number];
  /** Sections with the same lyrics share a group (chorus 1, 2, 3 …); null if unique. */
  group: number | null;
  /** 0 for the first time a group is heard, 1 for the second, … */
  occurrence: number;
  themes: WeightedTheme[];
  mood: Mood;
  /** 0 (sparse, quiet) … 1 (dense, driving). */
  energy: number;
  /** The few words that carry the section — for scenes that want a hero word. */
  focusWords: string[];
}

export interface InterpretationPlan {
  trackKey: string;
  /** Which interpreter produced it, e.g. 'local@1'. */
  interpreter: string;
  durationMs: number;
  sections: SectionPlan[];
  /** Whole-song summary. */
  themes: WeightedTheme[];
  mood: Mood;
  energy: number;
}
