import type { LyricWord } from '@shared/lyrics';

/** Split a lyric line into words (whitespace-separated, punctuation kept on the word). */
export const tokenize = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/**
 * Spread word timings across a line, weighted by word length, the way a singer stretches
 * longer words. Used when a source only has line timing, and for the demo songs.
 */
export function distributeWords(text: string, startMs: number, endMs: number): LyricWord[] {
  const tokens = tokenize(text);
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

/**
 * How long a line of `words` words is probably sung for, when the source only says when it
 * starts. Roughly 2.4 words a second plus a held last note, within sensible bounds.
 */
export function estimateLineMs(wordCount: number): number {
  return Math.max(1200, Math.min(7000, 600 + wordCount * 420));
}
