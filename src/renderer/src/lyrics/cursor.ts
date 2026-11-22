import type { LyricLine, LyricsDocument } from '@shared/lyrics';

export interface LyricPosition {
  /** Index of the line currently being sung, or -1 when between/before lines. */
  lineIndex: number;
  /** Index of the most recent line that has started (useful during gaps). */
  lastStartedIndex: number;
  /** 0..1 progress through the active line, 0 when no line is active. */
  lineProgress: number;
  /** Index of the active word within the active line, -1 if none/unsynced. */
  wordIndex: number;
  /** 0..1 progress through the active word. */
  wordProgress: number;
  /** ms until the next line starts, Infinity if none. */
  msToNextLine: number;
}

/** Largest index whose startMs <= t, or -1. Lines must be sorted by startMs. */
export function lastStartedAt<T extends { startMs: number }>(
  items: readonly T[],
  t: number,
): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.startMs <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Pure lookup: where are we in the lyrics at song time `t` (ms)? O(log n). */
export function locate(doc: Pick<LyricsDocument, 'lines'>, t: number): LyricPosition {
  const lines = doc.lines;
  const last = lastStartedAt(lines, t);
  const next: LyricLine | undefined = lines[last + 1];
  const msToNextLine = next ? next.startMs - t : Infinity;

  const line = last >= 0 ? lines[last] : undefined;
  if (!line || t >= line.endMs) {
    return {
      lineIndex: -1,
      lastStartedIndex: last,
      lineProgress: 0,
      wordIndex: -1,
      wordProgress: 0,
      msToNextLine,
    };
  }

  const lineProgress = clamp01((t - line.startMs) / Math.max(1, line.endMs - line.startMs));
  let wordIndex = -1;
  let wordProgress = 0;
  if (line.words && line.words.length) {
    wordIndex = lastStartedAt(line.words, t);
    const w = wordIndex >= 0 ? line.words[wordIndex] : undefined;
    if (w) wordProgress = clamp01((t - w.startMs) / Math.max(1, w.endMs - w.startMs));
  }
  return {
    lineIndex: last,
    lastStartedIndex: last,
    lineProgress,
    wordIndex,
    wordProgress,
    msToNextLine,
  };
}
