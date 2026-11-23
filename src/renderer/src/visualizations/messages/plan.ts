import type { LyricLine, LyricWord, LyricsDocument } from '@shared/lyrics';
import { hash01 } from '@/animation/easing';

/**
 * Conversation planning — turns timed lyrics into a believable message thread.
 * Pure and deterministic: the same lyrics and seed always produce the same conversation,
 * and every visual state can be derived from (plan, time).
 */

export type Side = 'in' | 'out';

export interface PlannedMessage {
  index: number;
  lineIndex: number;
  id: string;
  side: Side;
  text: string;
  words: LyricWord[];
  startMs: number;
  endMs: number;
  stanza: number;
  /** Consecutive messages from the same side within a stanza share a group. */
  group: number;
  firstInGroup: boolean;
  lastInGroup: boolean;
  /** When the bubble lands in the thread. */
  appearAt: number;
  /** Incoming only: the "typing…" indicator shows over [typingFrom, appearAt). */
  typingFrom: number | null;
  /** Outgoing only: words are typed into the compose field from here until `appearAt`. */
  composeFrom: number | null;
  /** A timestamp separator is shown above this message. */
  separator: string | null;
  /** Outgoing only: when the other side "reads" it (receipt flips Delivered → Read). */
  readAt: number | null;
  /** A tapback "you" leave on an incoming line once it has been sung, if any. */
  reaction: { kind: Reaction; at: number } | null;
}

export type Reaction = 'heart' | 'emphasis';

export interface ConversationPlan {
  messages: PlannedMessage[];
  contactSeed: number;
}

export const PLAN = {
  /** A silence this many times the song's median line gap starts a new stanza… */
  stanzaGapFactor: 1.8,
  /** …but never less than this. */
  minStanzaGapMs: 1200,
  /** A silence at least this long gets a timestamp separator. */
  separatorGapMs: 6000,
  typingLeadMs: 1500,
  minTypingMs: 500,
  /** Outgoing messages are sent this long after their last word starts. */
  sendAfterLastWordMs: 320,
  /** Share of verse-closing incoming lines that get a tapback, and how long after the line. */
  reactionChance: 0.7,
  reactionDelayMs: 450,
} as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();

/** Fictional local time for a song position — a night-time clock seeded per track. */
export function clockLabel(ms: number, seed: number): string {
  const baseMin = 23 * 60 + 12 + Math.floor(hash01(seed, 11) * 170); // 23:12 … 02:02
  const total = (baseMin + Math.floor(ms / 60_000)) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function wordsOf(line: LyricLine): LyricWord[] {
  if (line.words?.length) return line.words;
  // Line-synced lyrics: spread words evenly so typing/reveal still has a rhythm.
  const tokens = line.text.split(/\s+/).filter(Boolean);
  const span = Math.max(1, line.endMs - line.startMs) * 0.9;
  return tokens.map((text, i) => ({
    text,
    startMs: Math.round(line.startMs + (span * i) / tokens.length),
    endMs: Math.round(line.startMs + (span * (i + 1)) / tokens.length),
  }));
}

export function planConversation(doc: Pick<LyricsDocument, 'lines'>, seed = 0): ConversationPlan {
  const lines = doc.lines.filter((l) => l.text.trim().length > 0);

  // 1) Stanzas from silences — relative to this song's own breathing, since singers leave
  //    very different gaps between lines from song to song.
  const gaps = lines.slice(1).map((l, i) => l.startMs - lines[i]!.endMs);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const stanzaGap = Math.max(PLAN.minStanzaGapMs, median * PLAN.stanzaGapFactor);
  const stanzaOf: number[] = [];
  let stanza = 0;
  lines.forEach((l, i) => {
    if (i > 0 && gaps[i - 1]! >= stanzaGap) stanza++;
    stanzaOf.push(stanza);
  });

  // 2) Sides. Lines the song repeats (its refrain) are what "you" keep sending — outgoing.
  //    Everything else is the other side of the conversation. A song with no refrain at all
  //    simply alternates stanza by stanza.
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(norm(l.text), (counts.get(norm(l.text)) ?? 0) + 1);
  const hasRefrain = [...counts.values()].some((c) => c > 1);
  const stanzaSide = new Map<number, Side>();
  let alt: Side = hash01(seed, 3) < 0.5 ? 'in' : 'out';
  for (let s = 0; s <= stanza; s++) {
    const own = lines.filter((_, i) => stanzaOf[i] === s);
    if (hasRefrain) {
      const repeated = own.filter((l) => (counts.get(norm(l.text)) ?? 0) > 1).length;
      stanzaSide.set(s, repeated * 2 >= own.length ? 'out' : 'in');
    } else {
      stanzaSide.set(s, alt);
      alt = alt === 'in' ? 'out' : 'in';
    }
  }

  // 3) Messages with timing.
  const messages: PlannedMessage[] = lines.map((line, i) => {
    let side = stanzaSide.get(stanzaOf[i]!)!;
    if (line.singer === 'feat') side = side === 'in' ? 'out' : 'in'; // a second voice answers
    const words = wordsOf(line);
    const lastWordStart = words.at(-1)?.startMs ?? line.startMs;
    const appearAt =
      side === 'out'
        ? Math.min(
            line.endMs,
            Math.max(line.startMs + 200, lastWordStart + PLAN.sendAfterLastWordMs),
          )
        : line.startMs - 60;
    return {
      index: i,
      lineIndex: doc.lines.indexOf(line),
      id: line.id,
      side,
      text: line.text,
      words,
      startMs: line.startMs,
      endMs: line.endMs,
      stanza: stanzaOf[i]!,
      group: 0,
      firstInGroup: false,
      lastInGroup: false,
      appearAt,
      typingFrom: null,
      composeFrom: side === 'out' ? line.startMs : null,
      separator: null,
      readAt: null,
      reaction: null,
    };
  });

  // 4) Groups, typing indicators, separators.
  let group = -1;
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || prev.side !== m.side || prev.stanza !== m.stanza) group++;
    m.group = group;
    m.firstInGroup = !prev || prev.group !== group;
    if (prev && prev.group !== group) prev.lastInGroup = true;

    const gapBefore = prev ? m.startMs - prev.endMs : Infinity;
    if (!prev || gapBefore >= PLAN.separatorGapMs) {
      m.separator = `${i === 0 ? 'Today' : ''} ${clockLabel(m.startMs, seed)}`.trim();
    }

    if (m.side === 'in') {
      const earliest = prev ? prev.appearAt + 350 : m.appearAt - PLAN.typingLeadMs;
      const from = Math.max(earliest, m.appearAt - PLAN.typingLeadMs);
      if (m.appearAt - from >= PLAN.minTypingMs) m.typingFrom = from;
    }
  });
  if (messages.length) messages[messages.length - 1]!.lastInGroup = true;

  // 5) Read receipts: an outgoing message is "read" when the other side starts replying.
  messages.forEach((m, i) => {
    if (m.side !== 'out') return;
    const reply = messages.slice(i + 1).find((n) => n.side === 'in');
    if (reply) m.readAt = Math.max(m.appearAt + 400, (reply.typingFrom ?? reply.appearAt) - 200);
  });

  // 6) Tapbacks: now and then "you" react to the line that closes one of their verses —
  //    a beat after it has been sung, while it still hangs there.
  messages.forEach((m, i) => {
    if (m.side !== 'in' || !m.lastInGroup || m.firstInGroup) return;
    if (hash01(i, seed + 5) > PLAN.reactionChance) return;
    const at = m.endMs + PLAN.reactionDelayMs;
    const next = messages[i + 1];
    if (next && next.appearAt < at + 900) return; // no room: the thread has moved on
    m.reaction = { kind: hash01(i, seed + 6) < 0.25 ? 'emphasis' : 'heart', at };
  });

  return { messages, contactSeed: seed };
}

/* ───────────── Time queries (all pure) ───────────── */

/** Index of the last message that has landed by time t, or -1. */
export function lastLanded(plan: ConversationPlan, t: number): number {
  let lo = 0;
  let hi = plan.messages.length - 1;
  let found = -1;
  // appearAt is monotonic in practice; binary search with a linear safety pass.
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (plan.messages[mid]!.appearAt <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  while (found + 1 < plan.messages.length && plan.messages[found + 1]!.appearAt <= t) found++;
  return found;
}

export interface ComposeState {
  message: PlannedMessage;
  /** Words typed so far (sung so far). */
  typed: string;
  /** 0..1 through the current word — drives the caret glow. */
  wordProgress: number;
}

/** What's in the compose field at time t (outgoing line being "typed" as it's sung). */
export function composeAt(plan: ConversationPlan, t: number): ComposeState | null {
  for (const m of plan.messages) {
    if (m.side !== 'out' || m.composeFrom === null) continue;
    if (t >= m.composeFrom && t < m.appearAt) {
      const sung = m.words.filter((w) => w.startMs <= t);
      const cur = sung.at(-1);
      const wp = cur ? Math.min(1, (t - cur.startMs) / Math.max(1, cur.endMs - cur.startMs)) : 0;
      return { message: m, typed: sung.map((w) => w.text).join(' '), wordProgress: wp };
    }
    if (m.composeFrom > t) break;
  }
  return null;
}

/** The incoming message whose typing indicator is showing at t, if any. */
export function typingAt(plan: ConversationPlan, t: number): PlannedMessage | null {
  for (const m of plan.messages) {
    if (m.typingFrom !== null && t >= m.typingFrom && t < m.appearAt) return m;
    if ((m.typingFrom ?? m.appearAt) > t) break;
  }
  return null;
}

/** Index of the word being sung in message m at time t (-1 before, words.length after). */
export function sungWordIndex(m: PlannedMessage, t: number): number {
  if (t < m.startMs) return -1;
  if (t >= m.endMs) return m.words.length;
  let idx = -1;
  for (let i = 0; i < m.words.length; i++) if (m.words[i]!.startMs <= t) idx = i;
  return idx;
}
