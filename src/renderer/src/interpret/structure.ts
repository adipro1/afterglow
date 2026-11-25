import type { LyricLine } from '@shared/lyrics';
import type { SectionKind } from '@shared/interpretation';

/**
 * Structure pass: split a song into sections (intro, verses, choruses, bridge, outro,
 * instrumental breaks) using only timing and repetition. Deterministic and language-agnostic.
 */

export const STRUCTURE = {
  /** A silence this many times the song's median line gap separates two lyric blocks… */
  blockGapFactor: 2,
  /** …but never less than this. */
  minBlockGapMs: 1500,
  /** A silence at least this long is an instrumental section of its own. */
  instrumentalGapMs: 6000,
  /** Lyrics starting later than this get an intro section. */
  introMinMs: 1500,
  /** Two lines are "the same line" at or above this similarity. */
  lineSimilarity: 0.8,
  /** Two blocks are "the same section" when this share of the shorter one's lines recur. */
  blockSimilarity: 0.6,
} as const;

export interface RawSection {
  kind: SectionKind;
  startMs: number;
  endMs: number;
  /** Indices into the input lines, [from, to). */
  lines: [number, number];
  group: number | null;
  occurrence: number;
}

/** Lowercase words without punctuation (apostrophes dropped: "don't" → "dont"). */
export const normWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Overlap of two word lists as a share of the longer one (order-insensitive, counts repeats). */
export function lineSimilarity(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of b) {
    const c = counts.get(w) ?? 0;
    if (c > 0) {
      shared++;
      counts.set(w, c - 1);
    }
  }
  return shared / Math.max(a.length, b.length);
}

/** Every word of `part` appears in `whole` — "Never read" is a fragment of "Delivered, but never read". */
const isFragmentOf = (part: readonly string[], whole: readonly string[]) =>
  part.length > 0 && part.length < whole.length && part.every((w) => whole.includes(w));

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

interface Block {
  from: number;
  to: number;
}

export function analyseStructure(
  lines: readonly LyricLine[],
  durationMs: number,
  title?: string,
): RawSection[] {
  const n = lines.length;
  const end = Math.max(durationMs, lines.at(-1)?.endMs ?? 0);
  if (!n)
    return [
      { kind: 'instrumental', startMs: 0, endMs: end, lines: [0, 0], group: null, occurrence: 0 },
    ];

  const words = lines.map((l) => normWords(l.text));
  const gaps = lines.slice(1).map((l, i) => l.startMs - lines[i]!.endMs);
  const blockGap = Math.max(STRUCTURE.minBlockGapMs, median(gaps) * STRUCTURE.blockGapFactor);

  // 1) Lyric blocks from silences.
  let blocks: Block[] = [];
  let from = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || gaps[i - 1]! >= blockGap) {
      blocks.push({ from, to: i });
      from = i;
    }
  }

  // Which lines recur somewhere outside their own block?
  const blockOf = (i: number) => blocks.findIndex((b) => i >= b.from && i < b.to);
  const recursElsewhere = (i: number) =>
    words.some(
      (w, j) =>
        j !== i &&
        blockOf(j) !== blockOf(i) &&
        lineSimilarity(words[i]!, w) >= STRUCTURE.lineSimilarity,
    );

  // 2) Carve long blocks where a recurring run (a chorus with no pause before it) begins or ends.
  blocks = blocks.flatMap((b) => {
    if (b.to - b.from < 4) return [b];
    const rec = Array.from({ length: b.to - b.from }, (_, k) => recursElsewhere(b.from + k));
    const out: Block[] = [];
    let start = b.from;
    for (let k = 1; k < rec.length; k++) {
      const at = b.from + k;
      if (rec[k] !== rec[k - 1] && at - start >= 2 && b.to - at >= 2) {
        out.push({ from: start, to: at });
        start = at;
      }
    }
    out.push({ from: start, to: b.to });
    return out;
  });

  // 3) Group blocks that are the same section heard again.
  const blockSim = (a: Block, b: Block) => {
    const [s, l] = a.to - a.from <= b.to - b.from ? [a, b] : [b, a];
    if ((s.to - s.from) / (l.to - l.from) < 0.5) return 0;
    let hit = 0;
    for (let i = s.from; i < s.to; i++) {
      for (let j = l.from; j < l.to; j++) {
        if (lineSimilarity(words[i]!, words[j]!) >= STRUCTURE.lineSimilarity) {
          hit++;
          break;
        }
      }
    }
    return hit / (s.to - s.from);
  };
  const groupOf = blocks.map((_, i) => i);
  const root = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = root(groupOf[i]!)));
  for (let a = 0; a < blocks.length; a++) {
    for (let b = a + 1; b < blocks.length; b++) {
      if (blockSim(blocks[a]!, blocks[b]!) >= STRUCTURE.blockSimilarity) groupOf[root(b)] = root(a);
    }
  }
  const members = new Map<number, number[]>();
  blocks.forEach((_, i) => members.set(root(i), [...(members.get(root(i)) ?? []), i]));

  // 4) The chorus: the most-repeated group, favouring lines that repeat inside it and the title.
  const titleWords = normWords(title ?? '');
  const scoreGroup = (ids: number[]) => {
    let s = ids.length * 2;
    for (const id of ids) {
      const b = blocks[id]!;
      for (let i = b.from; i < b.to; i++) {
        for (let j = i + 1; j < b.to; j++) {
          if (lineSimilarity(words[i]!, words[j]!) >= STRUCTURE.lineSimilarity) s += 0.5;
        }
        if (titleWords.length && titleWords.every((w) => words[i]!.includes(w))) s += 0.75;
      }
    }
    return s;
  };
  let chorusRoot: number | null = null;
  let best = 0;
  for (const [r, ids] of members) {
    if (ids.length < 2) continue;
    const s = scoreGroup(ids);
    if (s > best) {
      best = s;
      chorusRoot = r;
    }
  }
  // No repeated block: a single block that repeats a line over and over is still a hook.
  if (chorusRoot === null) {
    let bestHook = 0;
    blocks.forEach((b, id) => {
      const s = scoreGroup([id]) - 2;
      if (s >= 1 && s > bestHook) {
        bestHook = s;
        chorusRoot = root(id);
      }
    });
  }

  const isChorus = (id: number) => chorusRoot !== null && root(id) === chorusRoot;
  const chorusIds = blocks.map((_, i) => i).filter(isChorus);
  const lastChorus = chorusIds.at(-1) ?? -Infinity;
  const chorusWords = chorusIds.flatMap((id) => {
    const b = blocks[id]!;
    return words.slice(b.from, b.to);
  });

  // 5) Label everything else from where it sits relative to the choruses.
  const kinds: SectionKind[] = blocks.map((b, id) => {
    if (isChorus(id)) return 'chorus';
    const len = b.to - b.from;
    const fragmentary =
      chorusWords.length > 0 &&
      words
        .slice(b.from, b.to)
        .every((w) =>
          chorusWords.some(
            (c) => isFragmentOf(w, c) || lineSimilarity(w, c) >= STRUCTURE.lineSimilarity,
          ),
        );
    if (
      id > lastChorus &&
      lastChorus >= 0 &&
      (fragmentary || (id === blocks.length - 1 && len <= 2))
    ) {
      return 'outro';
    }
    const nextIsChorus = id + 1 < blocks.length && isChorus(id + 1);
    const group = members.get(root(id))!;
    if (nextIsChorus && len <= 3 && id > 0 && !isChorus(id - 1)) return 'pre-chorus';
    if (
      nextIsChorus &&
      group.length > 1 &&
      group.every((g) => g + 1 < blocks.length && isChorus(g + 1))
    ) {
      return 'pre-chorus';
    }
    const chorusesBefore = chorusIds.filter((c) => c < id).length;
    // Something new after the song has already come round twice: the bridge.
    if (group.length === 1 && chorusesBefore >= 2 && id < lastChorus) return 'bridge';
    if (
      group.length === 1 &&
      chorusIds.length >= 2 &&
      id > lastChorus &&
      id === blocks.length - 1
    ) {
      return len <= 4 ? 'outro' : 'bridge';
    }
    return 'verse';
  });

  // 6) Merge neighbours that belong together: consecutive outro pieces, and stray single lines.
  const merged: { block: Block; kind: SectionKind; root: number }[] = [];
  blocks.forEach((b, id) => {
    const prev = merged.at(-1);
    const single =
      b.to - b.from === 1 && members.get(root(id))!.length === 1 && kinds[id] !== 'chorus';
    const gapBefore = prev ? lines[b.from]!.startMs - lines[prev.block.to - 1]!.endMs : Infinity;
    if (
      prev &&
      gapBefore < STRUCTURE.instrumentalGapMs &&
      ((kinds[id] === 'outro' && prev.kind === 'outro') || (single && prev.kind !== 'chorus'))
    ) {
      prev.block = { from: prev.block.from, to: b.to };
      return;
    }
    merged.push({ block: { ...b }, kind: kinds[id]!, root: root(id) });
  });

  // 7) Repeat groups and occurrences (only for sections heard more than once).
  const rootCount = new Map<number, number>();
  for (const m of merged) rootCount.set(m.root, (rootCount.get(m.root) ?? 0) + 1);
  const groupIds = new Map<number, number>();
  const seen = new Map<number, number>();

  // 8) Lay sections on the timeline, covering it end to end with no holes.
  const out: RawSection[] = [];
  const firstStart = lines[0]!.startMs;
  if (firstStart >= STRUCTURE.introMinMs) {
    out.push({
      kind: 'intro',
      startMs: 0,
      endMs: firstStart,
      lines: [0, 0],
      group: null,
      occurrence: 0,
    });
  }
  merged.forEach((m, k) => {
    const start = k === 0 && !out.length ? 0 : lines[m.block.from]!.startMs;
    const prev = out.at(-1);
    if (prev && prev.endMs < start) {
      const gap = start - prev.endMs;
      if (gap >= STRUCTURE.instrumentalGapMs && prev.kind !== 'intro') {
        out.push({
          kind: 'instrumental',
          startMs: prev.endMs,
          endMs: start,
          lines: [m.block.from, m.block.from],
          group: null,
          occurrence: 0,
        });
      } else prev.endMs = start;
    }
    let group: number | null = null;
    let occurrence = 0;
    if ((rootCount.get(m.root) ?? 0) > 1) {
      if (!groupIds.has(m.root)) groupIds.set(m.root, groupIds.size);
      group = groupIds.get(m.root)!;
      occurrence = seen.get(m.root) ?? 0;
      seen.set(m.root, occurrence + 1);
    }
    out.push({
      kind: m.kind,
      startMs: start,
      endMs: lines[m.block.to - 1]!.endMs,
      lines: [m.block.from, m.block.to],
      group,
      occurrence,
    });
  });
  const lastSection = out.at(-1)!;
  if (end - lastSection.endMs >= STRUCTURE.instrumentalGapMs) {
    out.push({
      kind: 'outro',
      startMs: lastSection.endMs,
      endMs: end,
      lines: [n, n],
      group: null,
      occurrence: 0,
    });
  } else lastSection.endMs = end;
  return out;
}
