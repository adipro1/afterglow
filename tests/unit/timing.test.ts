import { describe, expect, it } from 'vitest';
import {
  clearLine,
  draftFromDocument,
  draftFromText,
  draftToDocument,
  endLine,
  lineAt,
  setOffset,
  shiftLine,
  stampLine,
  stampWord,
  timedCount,
} from '@/lyrics/timing';
import { parseLrc } from '@/lyrics/formats';

const src = { provider: 'test' };
const fresh = () => draftFromText('k', ['First line here', 'Second line', '', 'Third'], src);

describe('timing editor model', () => {
  it('starts untimed, skipping blank lines', () => {
    const d = fresh();
    expect(d.lines.map((l) => l.text)).toEqual(['First line here', 'Second line', 'Third']);
    expect(timedCount(d)).toBe(0);
    expect(draftToDocument(d).sync).toBe('none');
  });

  it('tapping lines makes a line-synced document; untimed lines are left out', () => {
    let d = stampLine(fresh(), 0, 1000);
    d = stampLine(d, 1, 4000);
    const doc = draftToDocument(d, 60_000);
    expect(doc.sync).toBe('line');
    expect(doc.lines.map((l) => [l.startMs, l.text])).toEqual([
      [1000, 'First line here'],
      [4000, 'Second line'],
    ]);
    expect(doc.lines[0]!.endMs).toBeLessThanOrEqual(4000);
    expect(doc.lines[0]!.words).toBeUndefined();
  });

  it('an explicit end makes a silence', () => {
    let d = stampLine(fresh(), 0, 1000);
    d = endLine(d, 0, 2000);
    d = stampLine(d, 1, 9000);
    expect(draftToDocument(d).lines[0]!.endMs).toBe(2000);
    expect(lineAt(d, 1500)).toBe(0);
  });

  it('re-tapping a line moves its word taps with it', () => {
    let d = stampWord(fresh(), 0, 0, 1000);
    d = stampWord(d, 0, 1, 1400);
    d = stampLine(d, 0, 2000);
    expect(d.lines[0]!.words.map((w) => w.startMs)).toEqual([2000, 2400, null]);
  });

  it('word taps fill in the words between them', () => {
    let d = stampWord(fresh(), 0, 0, 1000);
    d = stampWord(d, 0, 2, 2000);
    const words = draftToDocument(d, 60_000).lines[0]!.words!;
    expect(words.map((w) => w.text)).toEqual(['First', 'line', 'here']);
    expect(words[0]!.startMs).toBe(1000);
    expect(words[1]!.startMs).toBeGreaterThan(1000);
    expect(words[1]!.startMs).toBeLessThan(2000);
    expect(words[2]!.startMs).toBe(2000);
  });

  it('every word tapped on every line → word-synced', () => {
    let d = draftFromText('k', ['a b', 'c'], src);
    d = stampWord(d, 0, 0, 100);
    d = stampWord(d, 0, 1, 300);
    d = stampWord(d, 1, 0, 900);
    expect(draftToDocument(d).sync).toBe('word');
  });

  it('tapping an earlier word clears later taps that are now out of order', () => {
    let d = stampWord(fresh(), 0, 2, 3000);
    d = stampWord(d, 0, 0, 3500);
    expect(d.lines[0]!.words.map((w) => w.startMs)).toEqual([3500, null, null]);
  });

  it('nudge, offset and clear', () => {
    let d = stampLine(fresh(), 0, 1000);
    d = shiftLine(d, 0, 50);
    expect(d.lines[0]!.startMs).toBe(1050);
    d = shiftLine(d, 0, -5000); // never before zero
    expect(d.lines[0]!.startMs).toBe(0);
    d = setOffset(stampLine(d, 0, 1000), 250);
    expect(draftToDocument(d).lines[0]!.startMs).toBe(1250);
    expect(timedCount(clearLine(d, 0))).toBe(0);
  });

  it('edits never mutate the draft they were given (undo relies on it)', () => {
    const d = fresh();
    const before = JSON.stringify(d);
    stampLine(d, 0, 1000);
    stampWord(d, 1, 0, 2000);
    shiftLine(d, 0, 10);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('opening an imported file keeps its real timing, and only real word timing', () => {
    const lrc = parseLrc('[00:01.00]<00:01.00>Word <00:01.50>timed <00:02.00>\n[00:04.00]Plain');
    const d = draftFromDocument({ trackKey: 'k', sync: lrc.sync, lines: lrc.lines, source: src });
    expect(d.lines[0]!.startMs).toBe(1000);
    // The file is line-synced overall, so its words are treated as untimed.
    expect(d.lines[0]!.words.every((w) => w.startMs === null)).toBe(true);
    const back = draftToDocument(d);
    expect(back.lines.map((l) => [l.startMs, l.endMs])).toEqual(
      lrc.lines.map((l) => [l.startMs, l.endMs]),
    );
  });

  it('lines tapped out of order still play in time order', () => {
    let d = stampLine(fresh(), 1, 1000);
    d = stampLine(d, 0, 5000);
    expect(draftToDocument(d).lines.map((l) => l.text)).toEqual(['Second line', 'First line here']);
  });
});
