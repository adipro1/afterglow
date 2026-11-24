import type { LyricLine, LyricWord, LyricsDocument, LyricsSyncLevel } from '@shared/lyrics';
import { estimateLineMs, tokenize } from './words';

/**
 * Readers for the lyric files people actually have: LRC (including "enhanced" LRC with
 * per-word timing), SRT subtitles (and WebVTT, which is close enough), and plain text.
 * Everything here is pure and never throws on bad input: problems become `warnings`.
 */

export type LyricsFormat = 'lrc' | 'srt' | 'text';

export interface ParsedLyrics {
  format: LyricsFormat;
  sync: LyricsSyncLevel;
  /** Timed lines, sorted by start. Empty for plain text. */
  lines: LyricLine[];
  /** Lines without any timing (plain text, or an LRC with no timestamps at all). */
  untimed: string[];
  meta: { title?: string; artist?: string; album?: string; lengthMs?: number; offsetMs?: number };
  warnings: string[];
}

/** Anything bigger is not a lyrics file. */
export const MAX_LYRICS_BYTES = 1_000_000;
export const MAX_LINES = 5000;

/* ───────────── shared helpers ───────────── */

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const splitLines = (s: string) => stripBom(s).split(/\r\n|\r|\n/);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "mm:ss", "mm:ss.x", "mm:ss.xx", "mm:ss.xxx" or "mm:ss:xx" → ms. Minutes may exceed 59. */
function lrcTime(tag: string): number | null {
  const m = /^\s*(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\s*$/.exec(tag);
  if (!m) return null;
  const sec = Number(m[2]);
  if (sec >= 60) return null;
  const frac = m[3] ? Number(m[3]) * 10 ** (3 - m[3].length) : 0;
  return Number(m[1]) * 60_000 + sec * 1000 + frac;
}

/** Vocalist markers used by duet LRC files ("v1:", "v2:", "M:", "F:", "D:"). */
function takeSinger(text: string): { text: string; singer?: string } {
  const m = /^(v\d{1,2}|[MFD]):\s*/.exec(text);
  if (!m) return { text };
  const tag = m[1]!;
  const singer = tag === 'v1' || tag === 'M' ? 'lead' : tag === 'D' ? 'duet' : 'feat';
  return { text: text.slice(m[0].length), singer };
}

/**
 * Give every line an end time. Explicit ends win; otherwise a line lasts until the next one
 * starts or until it has plausibly been sung, whichever is sooner — so real silences survive
 * (the song analysis relies on them).
 */
function finishLines(
  raw: { startMs: number; endMs?: number; text: string; words?: LyricWord[]; singer?: string }[],
  breaks: number[],
  idPrefix: string,
  lengthMs?: number,
): LyricLine[] {
  const sorted = [...raw].sort((a, b) => a.startMs - b.startMs);
  const sortedBreaks = [...breaks].sort((a, b) => a - b);
  return sorted.map((l, i) => {
    const next = sorted[i + 1]?.startMs ?? lengthMs ?? Infinity;
    const brk = sortedBreaks.find((b) => b > l.startMs) ?? Infinity;
    const lastWord = l.words?.at(-1);
    const sungUntil = lastWord
      ? Math.max(lastWord.endMs, lastWord.startMs + 400)
      : l.startMs + estimateLineMs(tokenize(l.text).length);
    let endMs = l.endMs ?? Math.min(next, brk, sungUntil);
    // Two lines sharing a timestamp (or a break right on it): keep the line visible briefly.
    if (endMs <= l.startMs) endMs = l.startMs + 300;
    const words = l.words?.map((w, wi, ws) => ({
      ...w,
      endMs: Math.max(w.startMs, Math.min(w.endMs, ws[wi + 1]?.startMs ?? endMs, endMs)),
    }));
    return {
      id: `${idPrefix}-${i}`,
      startMs: l.startMs,
      endMs,
      text: l.text,
      ...(words?.length ? { words } : {}),
      ...(l.singer ? { singer: l.singer } : {}),
    };
  });
}

function syncOf(lines: LyricLine[]): LyricsSyncLevel {
  if (!lines.length) return 'none';
  return lines.every((l) => l.words?.length) ? 'word' : 'line';
}

/* ───────────── LRC ───────────── */

const META_KEYS: Record<string, 'title' | 'artist' | 'album'> = {
  ti: 'title',
  ar: 'artist',
  al: 'album',
};

/** Parse the text of a line that may carry enhanced word tags: "<00:01.00>Hello <00:01.50>world". */
function parseWordTags(
  body: string,
  lineStart: number,
  offset: number,
): { text: string; words?: LyricWord[] } {
  if (!/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/.test(body)) return { text: clean(body) };
  const parts = body.split(/<(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)>/);
  // parts = [before, time, text, time, text, …]
  const words: LyricWord[] = [];
  const lead = clean(parts[0] ?? '');
  if (lead)
    for (const w of tokenize(lead)) words.push({ text: w, startMs: lineStart, endMs: lineStart });
  for (let i = 1; i < parts.length; i += 2) {
    const t = lrcTime(parts[i]!);
    if (t === null) continue;
    const at = Math.max(0, t - offset);
    // A tag followed by nothing marks the end of the previous word.
    const tokens = tokenize(parts[i + 1] ?? '');
    if (!tokens.length) {
      const prev = words.at(-1);
      if (prev) prev.endMs = Math.max(prev.startMs, at);
      continue;
    }
    // Several words after one tag share it (rare, but seen in the wild).
    for (const w of tokens) words.push({ text: w, startMs: at, endMs: at });
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const next = words[i + 1];
    if (w.endMs <= w.startMs) w.endMs = next ? Math.max(w.startMs, next.startMs) : w.startMs + 500;
  }
  return { text: words.map((w) => w.text).join(' '), words: words.length ? words : undefined };
}

export function parseLrc(input: string, idPrefix = 'lrc'): ParsedLyrics {
  const warnings: string[] = [];
  const meta: ParsedLyrics['meta'] = {};
  const tagged: { times: number[]; body: string }[] = [];
  const untimed: string[] = [];
  let offset = 0;

  for (const rawLine of splitLines(input)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const times: number[] = [];
    let rest = line;
    let isMeta = false;
    // Leading tags: any number of [mm:ss.xx] and/or one [key:value].
    for (let m = /^\[([^\]]*)\]/.exec(rest); m; m = /^\[([^\]]*)\]/.exec(rest)) {
      const inner = m[1]!;
      const t = lrcTime(inner);
      if (t !== null) times.push(t);
      else {
        const kv = /^([A-Za-z#]+)\s*:(.*)$/.exec(inner);
        if (!kv) break; // "[Chorus]" etc. — leave it in the text
        isMeta = true;
        const key = kv[1]!.toLowerCase();
        const value = kv[2]!.trim();
        if (key in META_KEYS) meta[META_KEYS[key]!] = value;
        else if (key === 'offset') {
          const n = Number(value);
          if (Number.isFinite(n)) offset = n;
          else warnings.push(`Ignored an offset tag that isn't a number ("${value}").`);
        } else if (key === 'length') {
          const len = lrcTime(value);
          if (len !== null) meta.lengthMs = len;
        }
      }
      rest = rest.slice(m[0].length);
    }
    if (times.length) tagged.push({ times, body: rest });
    else if (!isMeta && rest.trim()) untimed.push(clean(rest));
  }

  if (offset) meta.offsetMs = offset;
  if (!tagged.length) {
    return { format: 'lrc', sync: 'none', lines: [], untimed, meta, warnings };
  }
  if (untimed.length) {
    warnings.push(
      `${untimed.length} line${untimed.length > 1 ? 's' : ''} had no timestamp and ${untimed.length > 1 ? 'were' : 'was'} left out.`,
    );
  }

  // "+offset" makes lyrics appear sooner (the LRC convention).
  const raw: Parameters<typeof finishLines>[0] = [];
  const breaks: number[] = [];
  let outOfOrder = false;
  let last = -1;
  for (const { times, body } of tagged) {
    for (const t of times) {
      const startMs = Math.max(0, t - offset);
      if (startMs < last) outOfOrder = true;
      last = startMs;
      const { text: withoutSinger, singer } = takeSinger(body.trim());
      const parsed = parseWordTags(withoutSinger, startMs, offset);
      // A timestamp with no words is a deliberate silence: it ends the line before it.
      if (!parsed.text) breaks.push(startMs);
      else raw.push({ startMs, text: parsed.text, words: parsed.words, singer });
    }
  }
  if (outOfOrder && tagged.every((t) => t.times.length === 1)) {
    warnings.push('Some lines were out of order and have been sorted by time.');
  }
  if (raw.length > MAX_LINES) {
    warnings.push(`Only the first ${MAX_LINES} lines were kept.`);
    raw.length = MAX_LINES;
  }
  const lines = finishLines(raw, breaks, idPrefix, meta.lengthMs);
  return { format: 'lrc', sync: syncOf(lines), lines, untimed: [], meta, warnings };
}

/* ───────────── SRT / WebVTT ───────────── */

/** "hh:mm:ss,mmm", "hh:mm:ss.mmm" or "mm:ss.mmm" → ms. */
function srtTime(s: string): number | null {
  const m = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/.exec(s.trim());
  if (!m) return null;
  const frac = m[4] ? Number(m[4]) * 10 ** (3 - m[4].length) : 0;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + frac;
}

/** Subtitle markup that isn't part of the words: <i>, <font …>, {\an8}, speaker labels in VTT. */
const stripMarkup = (s: string) =>
  s
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

export function parseSrt(input: string, idPrefix = 'srt'): ParsedLyrics {
  const warnings: string[] = [];
  const raw: Parameters<typeof finishLines>[0] = [];
  const blocks = stripBom(input)
    .replace(/\r\n|\r/g, '\n')
    .split(/\n\s*\n/);
  let skipped = 0;
  for (const block of blocks) {
    const rows = block.split('\n').map((r) => r.trim());
    const ti = rows.findIndex((r) => r.includes('-->'));
    if (ti < 0) {
      if (rows.some((r) => r && !/^\d+$/.test(r) && !/^WEBVTT|^NOTE|^STYLE/.test(r))) skipped++;
      continue;
    }
    const [a, b] = rows[ti]!.split('-->');
    const startMs = srtTime(a ?? '');
    // Cue settings may follow the end time ("00:00:05.000 align:start").
    const endMs = srtTime((b ?? '').trim().split(/\s+/)[0] ?? '');
    const text = clean(stripMarkup(rows.slice(ti + 1).join(' ')));
    if (startMs === null || endMs === null) {
      skipped++;
      continue;
    }
    if (!text) continue;
    raw.push({ startMs, endMs: Math.max(endMs, startMs + 1), text });
  }
  if (skipped)
    warnings.push(`${skipped} block${skipped > 1 ? 's' : ''} couldn't be read and were left out.`);
  if (raw.length > MAX_LINES) {
    warnings.push(`Only the first ${MAX_LINES} lines were kept.`);
    raw.length = MAX_LINES;
  }
  // Overlapping cues would put two lines on screen at once; trim each to the next start.
  const sorted = raw.sort((x, y) => x.startMs - y.startMs);
  let overlaps = 0;
  sorted.forEach((l, i) => {
    const next = sorted[i + 1];
    if (next && l.endMs! > next.startMs) {
      l.endMs = Math.max(l.startMs + 1, next.startMs);
      overlaps++;
    }
  });
  if (overlaps)
    warnings.push(`${overlaps} overlapping line${overlaps > 1 ? 's were' : ' was'} shortened.`);
  const lines = finishLines(sorted, [], idPrefix);
  return {
    format: 'srt',
    sync: lines.length ? 'line' : 'none',
    lines,
    untimed: [],
    meta: {},
    warnings,
  };
}

/* ───────────── Plain text ───────────── */

/** "[Chorus]", "(Verse 2)", "Pre-Chorus:" — lyric-sheet labels, not lyrics. */
const SECTION_LABEL =
  /^\s*[[(]?\s*(intro|verse|pre-?chorus|chorus|post-?chorus|bridge|hook|refrain|outro|interlude|breakdown|instrumental)\b[^\])]*[\])]?\s*:?\s*$/i;

export function parsePlainText(input: string): ParsedLyrics {
  const untimed = splitLines(input)
    .map(clean)
    .filter((l) => l && !SECTION_LABEL.test(l))
    .slice(0, MAX_LINES);
  return { format: 'text', sync: 'none', lines: [], untimed, meta: {}, warnings: [] };
}

/* ───────────── Detection ───────────── */

export function detectFormat(fileName: string, text: string): LyricsFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (ext === 'lrc' || ext === 'elrc') return 'lrc';
  if (ext === 'srt' || ext === 'vtt') return 'srt';
  if (ext === 'txt') return 'text';
  if (/^\s*\[\d{1,3}:\d{1,2}/m.test(text)) return 'lrc';
  if (/\d{1,2}:\d{2}[,.]\d{1,3}\s*-->/.test(text)) return 'srt';
  return 'text';
}

export function parseLyricsFile(fileName: string, text: string, idPrefix?: string): ParsedLyrics {
  switch (detectFormat(fileName, text)) {
    case 'lrc':
      return parseLrc(text, idPrefix);
    case 'srt':
      return parseSrt(text, idPrefix);
    default:
      return parsePlainText(text);
  }
}

export function toLyricsDocument(
  parsed: ParsedLyrics,
  trackKey: string,
  source: LyricsDocument['source'],
): LyricsDocument {
  return { trackKey, sync: parsed.sync, lines: parsed.lines, source };
}

/* ───────────── Writing LRC ───────────── */

function fmt(ms: number): string {
  const t = Math.max(0, Math.round(ms / 10));
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Write a document as LRC. With word timing it becomes enhanced LRC ("<mm:ss.xx>" before each
 * word). Silences longer than a second get an empty timestamp so line ends survive a round trip.
 */
export function toLrc(
  doc: Pick<LyricsDocument, 'lines' | 'sync'>,
  meta: { title?: string; artist?: string; album?: string; lengthMs?: number } = {},
): string {
  const out: string[] = [];
  if (meta.title) out.push(`[ti:${meta.title}]`);
  if (meta.artist) out.push(`[ar:${meta.artist}]`);
  if (meta.album) out.push(`[al:${meta.album}]`);
  if (meta.lengthMs) out.push(`[length:${fmt(meta.lengthMs).slice(0, 5)}]`);
  out.push('[re:AFTERGLOW]');
  doc.lines.forEach((l, i) => {
    const singer =
      l.singer === 'lead'
        ? 'v1: '
        : l.singer === 'feat'
          ? 'v2: '
          : l.singer === 'duet'
            ? 'D: '
            : '';
    const words = doc.sync === 'word' && l.words?.length ? l.words : null;
    const body = words
      ? words.map((w) => `<${fmt(w.startMs)}>${w.text}`).join(' ') + ` <${fmt(l.endMs)}>`
      : l.text;
    out.push(`[${fmt(l.startMs)}]${singer}${body}`);
    const next = doc.lines[i + 1];
    if (!next || next.startMs - l.endMs >= 1000) out.push(`[${fmt(l.endMs)}]`);
  });
  return out.join('\n') + '\n';
}
