import type { LyricLine, LyricWord, LyricsDocument } from '@shared/lyrics';
import { estimateLineMs, tokenize } from './words';

/**
 * The timing editor's model. Pure functions over a `Draft`: every edit returns a new draft, so
 * undo is just keeping the previous one. A draft can be half-timed; `draftToDocument` turns
 * whatever is timed into a playable `LyricsDocument` at any moment (that's the live preview).
 */

export interface DraftWord {
  text: string;
  /** null = not tapped yet. */
  startMs: number | null;
}

export interface DraftLine {
  text: string;
  startMs: number | null;
  /** An explicit end (a silence after the line). null = until the next line / plausibly sung. */
  endMs: number | null;
  words: DraftWord[];
  singer?: string;
}

export interface Draft {
  trackKey: string;
  lines: DraftLine[];
  /** Shifts every time on export/preview. Positive = lyrics later. */
  offsetMs: number;
  source: LyricsDocument['source'];
}

const MIN_LINE_MS = 120;

/* ───────────── Building drafts ───────────── */

export function draftFromDocument(doc: LyricsDocument): Draft {
  return {
    trackKey: doc.trackKey,
    offsetMs: 0,
    source: doc.source,
    lines: doc.lines.map((l) => ({
      text: l.text,
      startMs: l.startMs,
      endMs: l.endMs,
      // Only real word timing is kept; estimated words would look tapped when they weren't.
      words:
        doc.sync === 'word' && l.words?.length
          ? l.words.map((w) => ({ text: w.text, startMs: w.startMs }))
          : tokenize(l.text).map((text) => ({ text, startMs: null })),
      ...(l.singer ? { singer: l.singer } : {}),
    })),
  };
}

export function draftFromText(
  trackKey: string,
  lines: readonly string[],
  source: LyricsDocument['source'],
): Draft {
  return {
    trackKey,
    offsetMs: 0,
    source,
    lines: lines
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({
        text,
        startMs: null,
        endMs: null,
        words: tokenize(text).map((w) => ({ text: w, startMs: null })),
      })),
  };
}

/* ───────────── Edits ───────────── */

const withLine = (d: Draft, i: number, fn: (l: DraftLine) => DraftLine): Draft => {
  const line = d.lines[i];
  if (!line) return d;
  const lines = d.lines.slice();
  lines[i] = fn(line);
  return { ...d, lines };
};

const round = (t: number) => Math.max(0, Math.round(t));

/** Set when line i starts. Word taps already made move with it. */
export function stampLine(d: Draft, i: number, t: number): Draft {
  return withLine(d, i, (l) => {
    const at = round(t);
    const delta = l.startMs === null ? 0 : at - l.startMs;
    return {
      ...l,
      startMs: at,
      endMs: l.endMs !== null && l.endMs + delta > at ? l.endMs + delta : null,
      words: l.words.map((w) => ({
        ...w,
        startMs: w.startMs === null ? null : round(w.startMs + delta),
      })),
    };
  });
}

/** Mark that line i has finished (a silence follows). */
export function endLine(d: Draft, i: number, t: number): Draft {
  return withLine(d, i, (l) =>
    l.startMs === null ? l : { ...l, endMs: Math.max(l.startMs + MIN_LINE_MS, round(t)) },
  );
}

export function clearLine(d: Draft, i: number): Draft {
  return withLine(d, i, (l) => ({
    ...l,
    startMs: null,
    endMs: null,
    words: l.words.map((w) => ({ ...w, startMs: null })),
  }));
}

/** Set when word wi of line li is sung. The first word also starts the line. */
export function stampWord(d: Draft, li: number, wi: number, t: number): Draft {
  return withLine(d, li, (l) => {
    if (!l.words[wi]) return l;
    const at = round(t);
    const words = l.words.slice();
    words[wi] = { ...words[wi]!, startMs: at };
    // Later words tapped earlier than this one are now wrong: clear them.
    for (let k = wi + 1; k < words.length; k++) {
      if (words[k]!.startMs !== null && words[k]!.startMs! < at)
        words[k] = { ...words[k]!, startMs: null };
    }
    const startMs = wi === 0 ? at : Math.min(l.startMs ?? at, at);
    return { ...l, words, startMs };
  });
}

export function clearWord(d: Draft, li: number, wi: number): Draft {
  return withLine(d, li, (l) => {
    if (!l.words[wi]) return l;
    const words = l.words.slice();
    words[wi] = { ...words[wi]!, startMs: null };
    return { ...l, words };
  });
}

/** Nudge line i (and its words and end) earlier/later. */
export function shiftLine(d: Draft, i: number, deltaMs: number): Draft {
  return withLine(d, i, (l) => {
    if (l.startMs === null) return l;
    const delta = Math.max(-l.startMs, Math.round(deltaMs));
    return {
      ...l,
      startMs: l.startMs + delta,
      endMs: l.endMs === null ? null : l.endMs + delta,
      words: l.words.map((w) => ({ ...w, startMs: w.startMs === null ? null : w.startMs + delta })),
    };
  });
}

export function setOffset(d: Draft, offsetMs: number): Draft {
  return { ...d, offsetMs: Math.round(offsetMs) };
}

/* ───────────── Queries ───────────── */

export const isTimed = (l: DraftLine) => l.startMs !== null;
export const timedCount = (d: Draft) => d.lines.filter(isTimed).length;
export const wordsTimed = (l: DraftLine) =>
  l.words.length > 0 && l.words.every((w) => w.startMs !== null);

/** The line playing at time t (by its tapped start), for highlighting. */
export function lineAt(d: Draft, t: number): number {
  let found = -1;
  let best = -Infinity;
  d.lines.forEach((l, i) => {
    if (l.startMs !== null && l.startMs + d.offsetMs <= t && l.startMs > best) {
      best = l.startMs;
      found = i;
    }
  });
  return found;
}

/* ───────────── To a playable document ───────────── */

/** Fill untapped words between tapped neighbours, weighted by word length. */
function fillWords(words: DraftWord[], start: number, end: number): LyricWord[] {
  const known = words.map((w, i) => (i === 0 && w.startMs === null ? start : w.startMs));
  const weight = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5;
  let i = 0;
  while (i < words.length) {
    if (known[i] !== null) {
      i++;
      continue;
    }
    const a = i - 1; // known (index 0 is always known)
    let b = i;
    while (b < words.length && known[b] === null) b++;
    const from = known[a]!;
    const to = b < words.length ? known[b]! : from + (end - from) * 0.86;
    const ws = words.slice(a, b).map((w) => weight(w.text));
    const total = ws.reduce((x, y) => x + y, 0);
    let acc = 0;
    for (let k = a + 1; k < b; k++) {
      acc += ws[k - a - 1]!;
      known[k] = Math.round(from + ((to - from) * acc) / total);
    }
    i = b;
  }
  return words.map((w, k) => {
    const s = Math.min(known[k]!, end);
    const next = k + 1 < words.length ? Math.min(known[k + 1]!, end) : end;
    return { text: w.text, startMs: s, endMs: Math.max(s, next) };
  });
}

export function draftToDocument(d: Draft, durationMs = Infinity): LyricsDocument {
  const timed = d.lines
    .filter(isTimed)
    .map((l) => ({ l, start: Math.max(0, l.startMs! + d.offsetMs) }))
    .sort((a, b) => a.start - b.start);

  const lines: LyricLine[] = timed.map(({ l, start }, i) => {
    const next = timed[i + 1]?.start ?? durationMs;
    const tapped = l.words.filter((w) => w.startMs !== null);
    const lastTapped = tapped.length
      ? Math.max(...tapped.map((w) => w.startMs! + d.offsetMs))
      : null;
    const sungUntil =
      lastTapped !== null && tapped.length === l.words.length
        ? lastTapped + 600
        : start + estimateLineMs(l.words.length);
    let end = l.endMs !== null ? l.endMs + d.offsetMs : Math.min(next, sungUntil);
    end = Math.min(
      Math.max(end, start + MIN_LINE_MS),
      Number.isFinite(durationMs) ? durationMs : end,
    );
    if (end <= start) end = start + MIN_LINE_MS;
    const hasWordTiming = tapped.length > 0;
    const words = hasWordTiming
      ? fillWords(
          l.words.map((w) => ({
            ...w,
            startMs: w.startMs === null ? null : w.startMs + d.offsetMs,
          })),
          start,
          end,
        )
      : undefined;
    return {
      id: `${d.trackKey}-t${i}`,
      startMs: start,
      endMs: end,
      text: l.text,
      ...(words ? { words } : {}),
      ...(l.singer ? { singer: l.singer } : {}),
    };
  });

  const fullyWordTimed = timed.length > 0 && timed.every(({ l }) => wordsTimed(l));
  return {
    trackKey: d.trackKey,
    sync: lines.length === 0 ? 'none' : fullyWordTimed ? 'word' : 'line',
    lines,
    source: d.source,
  };
}
