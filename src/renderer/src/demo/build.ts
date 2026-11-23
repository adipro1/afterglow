import type { LyricLine, LyricWord, LyricsDocument, TrackRef } from '@shared/lyrics';

/** [startSeconds, durationSeconds, text, singer?] — compact authoring format for demo songs. */
export type DemoLine = readonly [number, number, string, string?];

export interface DemoSong {
  track: TrackRef;
  lyrics: LyricsDocument;
}

/**
 * Spread word timings across a line, weighted by word length, the way a singer
 * stretches longer words. Demo-only: real songs get word timings from the provider or editor.
 */
export function distributeWords(text: string, startMs: number, endMs: number): LyricWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = (endMs - startMs) * 0.86; // the last word rings out
  const words: LyricWord[] = [];
  let t = startMs;
  tokens.forEach((w, i) => {
    const d = (span * weights[i]!) / total;
    words.push({ text: w, startMs: Math.round(t), endMs: Math.round(t + d) });
    t += d;
  });
  words[words.length - 1]!.endMs = endMs;
  return words;
}

export function buildDemoSong(
  meta: Omit<TrackRef, 'durationMs'> & { durationSec: number },
  lines: readonly DemoLine[],
): DemoSong {
  const { durationSec, ...rest } = meta;
  const track: TrackRef = { ...rest, durationMs: durationSec * 1000 };
  const built: LyricLine[] = lines.map(([start, dur, text, singer], i) => {
    const startMs = Math.round(start * 1000);
    const endMs = Math.round((start + dur) * 1000);
    return {
      id: `${meta.key}-${i}`,
      startMs,
      endMs,
      text,
      words: distributeWords(text, startMs, endMs),
      ...(singer ? { singer } : {}),
    };
  });
  return {
    track,
    lyrics: {
      trackKey: meta.key,
      sync: 'word',
      language: 'en',
      lines: built,
      source: { provider: 'demo', attribution: 'Original demo lyrics written for AFTERGLOW' },
    },
  };
}
