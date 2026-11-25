import type { LyricsDocument } from '@shared/lyrics';
import type {
  InterpretationPlan,
  Mood,
  MoodLabel,
  SectionKind,
  SectionPlan,
  ThemeId,
  WeightedTheme,
} from '@shared/interpretation';
import { conceptByWord, negators, phrases, stopwords, type ThemeWeights } from './lexicon';
import { analyseStructure, normWords } from './structure';

/**
 * Turns timed lyrics into an `InterpretationPlan`: sections, and for each one its themes,
 * mood, energy and focus words.
 *
 * The local interpreter is deterministic and runs entirely on this computer. Later, an optional
 * model pass can *refine* a plan (never replace it) — opt-in, showing exactly what text would be
 * sent, and only for lyrics whose licence allows it. Nothing here talks to the network.
 */
export interface Interpreter {
  readonly id: string;
  interpret(doc: LyricsDocument, track: { title?: string; durationMs: number }): InterpretationPlan;
}

/* ───────────── Reading one line ───────────── */

export interface LineReading {
  themes: Map<ThemeId, number>;
  valence: number[];
  arousal: number[];
  /** Addressed to someone ("you", "your"…) — conversation scenes love these. */
  addressed: boolean;
  question: boolean;
  tokens: string[];
}

const YOU = new Set(['you', 'your', 'youre', 'yours', 'youve', 'youll', 'youd', 'yourself']);

function add(into: Map<ThemeId, number>, themes: ThemeWeights | undefined, k = 1) {
  if (!themes) return;
  for (const [id, w] of Object.entries(themes) as [ThemeId, number][]) {
    into.set(id, (into.get(id) ?? 0) + w * k);
  }
}

export function readLine(text: string): LineReading {
  const tokens = normWords(text);
  const joined = tokens.join(' ');
  const themes = new Map<ThemeId, number>();
  const valence: number[] = [];
  const arousal: number[] = [];
  const silenced = new Set<number>();

  // Phrases first: they decide what their words mean.
  for (const p of phrases) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(joined); m; m = p.re.exec(joined)) {
      add(themes, p.themes);
      if (p.valence !== undefined) valence.push(p.valence);
      if (p.arousal !== undefined) arousal.push(p.arousal);
      if (p.silences) {
        const first = joined.slice(0, m.index).split(' ').length - 1;
        const count = m[0].split(' ').length;
        for (let i = first; i < first + count; i++) {
          if (p.silences.includes(tokens[i]!)) silenced.add(i);
        }
      }
      if (m[0].length === 0) p.re.lastIndex++;
    }
  }

  tokens.forEach((tok, i) => {
    if (silenced.has(i)) return;
    const concept = conceptByWord.get(tok);
    if (!concept) return;
    const negated =
      concept.negatable === true &&
      (negators.has(tokens[i - 1] ?? '') || negators.has(tokens[i - 2] ?? ''));
    add(themes, concept.themes, negated ? -0.5 : 1);
    if (concept.valence !== undefined)
      valence.push(negated ? -0.6 * concept.valence : concept.valence);
    if (concept.arousal !== undefined) arousal.push(concept.arousal);
  });

  return {
    themes,
    valence,
    arousal,
    addressed: tokens.some((t) => YOU.has(t)),
    question: text.includes('?'),
    tokens,
  };
}

/* ───────────── Summaries ───────────── */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mean = (xs: number[], fallback: number) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;

/** Normalise to the strongest theme = 1, drop the faint ones, strongest first. */
function rank(m: Map<ThemeId, number>, keep = 6, floor = 0.12): WeightedTheme[] {
  const max = Math.max(0, ...m.values());
  if (max <= 0) return [];
  return [...m.entries()]
    .map(([id, w]) => ({ id, weight: Math.round((w / max) * 1000) / 1000 }))
    .filter((t) => t.weight >= floor)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, keep);
}

function blend(a: WeightedTheme[], b: WeightedTheme[], wb: number): Map<ThemeId, number> {
  const m = new Map<ThemeId, number>();
  for (const t of a) m.set(t.id, (m.get(t.id) ?? 0) + t.weight * (1 - wb));
  for (const t of b) m.set(t.id, (m.get(t.id) ?? 0) + t.weight * wb);
  return m;
}

export function moodLabel(valence: number, arousal: number): MoodLabel {
  if (arousal >= 0.55) return valence >= 0 ? 'euphoric' : 'tense';
  if (valence >= 0.2) return 'tender';
  if (valence <= -0.2) return 'melancholic';
  return 'reflective';
}

const mood = (valence: number, arousal: number): Mood => ({
  valence: Math.round(valence * 1000) / 1000,
  arousal: Math.round(arousal * 1000) / 1000,
  label: moodLabel(valence, arousal),
});

const KIND_ENERGY: Record<SectionKind, number> = {
  intro: -0.1,
  verse: 0,
  'pre-chorus': 0.08,
  chorus: 0.15,
  bridge: -0.05,
  outro: -0.1,
  instrumental: 0,
};

/* ───────────── The local interpreter ───────────── */

export const localInterpreter: Interpreter = {
  id: 'local@1',
  interpret(doc, track) {
    // Indices must match doc.lines exactly (the director looks lines up by them).
    const lines = doc.lines;
    const readings = lines.map((l) => readLine(l.text));
    const titleWords = new Set(normWords(track.title ?? ''));
    const durationMs = Math.max(track.durationMs, lines.at(-1)?.endMs ?? 0);

    // Whole song.
    const songThemes = new Map<ThemeId, number>();
    for (const r of readings) {
      add(songThemes, Object.fromEntries(r.themes));
      if (r.addressed) songThemes.set('conversation', (songThemes.get('conversation') ?? 0) + 0.4);
    }
    const songRanked = rank(songThemes);
    const songValence = mean(
      readings.flatMap((r) => r.valence),
      0,
    );
    const songArousal = mean(
      readings.flatMap((r) => r.arousal),
      0.35,
    );

    const raw = analyseStructure(lines, durationMs, track.title);
    const sections: SectionPlan[] = raw.map((s, index) => {
      const [from, to] = s.lines;
      const rs = readings.slice(from, to);
      if (!rs.length) {
        return {
          index,
          kind: s.kind,
          startMs: s.startMs,
          endMs: s.endMs,
          lines: [from, to] as const,
          group: s.group,
          occurrence: s.occurrence,
          themes: songRanked,
          mood: mood(songValence * 0.6, Math.min(songArousal, 0.3)),
          energy: 0, // filled from neighbours below
          focusWords: [],
        };
      }
      const themes = new Map<ThemeId, number>();
      let addressed = 0;
      for (const r of rs) {
        add(themes, Object.fromEntries(r.themes));
        if (r.addressed || r.question) addressed++;
      }
      themes.set('conversation', (themes.get('conversation') ?? 0) + 0.4 * addressed);
      // A section is read in the light of the whole song, so one stray word can't hijack it.
      const sectionThemes = rank(blend(rank(themes, 10, 0), songRanked, 0.3));

      const valence = clamp(
        mean(
          rs.flatMap((r) => r.valence),
          songValence * 0.5,
        ),
        -1,
        1,
      );
      const lexArousal = mean(
        rs.flatMap((r) => r.arousal),
        songArousal,
      );

      const wordCount = rs.reduce((n, r) => n + r.tokens.length, 0);
      const sungMs = Math.max(1000, lines[to - 1]!.endMs - lines[from]!.startMs);
      const density = clamp((wordCount / (sungMs / 1000) - 0.8) / 2.7, 0, 1);
      const energy = clamp(
        0.15 + 0.45 * density + 0.35 * lexArousal + KIND_ENERGY[s.kind] + 0.04 * s.occurrence,
        0,
        1,
      );
      const arousal = clamp(0.5 * lexArousal + 0.5 * energy, 0, 1);

      // Focus words: vivid, repeated, or the title.
      const score = new Map<string, number>();
      const original = new Map<string, string>();
      rs.forEach((r, k) => {
        const shown = lines[from + k]!.text.split(/\s+/).map((w) =>
          w.replace(/[^\p{L}\p{N}'’]/gu, ''),
        );
        r.tokens.forEach((t, i) => {
          if (stopwords.has(t) || t.length < 3) return;
          const s0 =
            (score.get(t) ?? 0) + 1 + (conceptByWord.has(t) ? 2 : 0) + (titleWords.has(t) ? 2 : 0);
          score.set(t, s0);
          if (!original.has(t)) original.set(t, shown[i] ?? t);
        });
      });
      const focusWords = [...score.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([t]) => original.get(t) ?? t);

      return {
        index,
        kind: s.kind,
        startMs: s.startMs,
        endMs: s.endMs,
        lines: [from, to] as const,
        group: s.group,
        occurrence: s.occurrence,
        themes: sectionThemes,
        mood: mood(valence, arousal),
        energy: Math.round(energy * 1000) / 1000,
        focusWords,
      };
    });

    // Sections without words (intro, breaks, tails) take a calmer version of their neighbours.
    sections.forEach((s, i) => {
      if (s.lines[0] !== s.lines[1]) return;
      const near = [sections[i - 1], sections[i + 1]].filter(
        (x): x is SectionPlan => !!x && x.lines[0] !== x.lines[1],
      );
      s.energy =
        Math.round(
          mean(
            near.map((x) => x.energy),
            0.3,
          ) *
            0.6 *
            1000,
        ) / 1000;
      if (near.length) s.themes = rank(blend(near[0]!.themes, songRanked, 0.5));
    });

    const sung = sections.filter((s) => s.lines[0] !== s.lines[1]);
    const energy = mean(
      sung.map((s) => s.energy),
      0.3,
    );
    return {
      trackKey: doc.trackKey,
      interpreter: this.id,
      durationMs,
      sections,
      themes: songRanked,
      mood: mood(songValence, songArousal),
      energy: Math.round(energy * 1000) / 1000,
    };
  },
};

const cache = new WeakMap<LyricsDocument, InterpretationPlan>();

/** Interpret with the local interpreter, once per lyrics document. */
export function interpret(
  doc: LyricsDocument,
  track: { title?: string; durationMs: number },
): InterpretationPlan {
  const hit = cache.get(doc);
  const durationMs = Math.max(track.durationMs, doc.lines.at(-1)?.endMs ?? 0);
  if (hit && hit.durationMs === durationMs) return hit;
  const plan = localInterpreter.interpret(doc, track);
  cache.set(doc, plan);
  return plan;
}
