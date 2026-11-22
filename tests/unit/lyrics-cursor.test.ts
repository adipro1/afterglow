import { describe, expect, it } from 'vitest';
import { lastStartedAt, locate } from '@/lyrics/cursor';
import { distributeWords } from '@/demo/build';
import { demoSongs, delivered } from '@/demo/songs';
import { LyricsDocumentSchema } from '@shared/lyrics';

const doc = {
  lines: [
    { id: '0', startMs: 1000, endMs: 2000, text: 'a b', words: distributeWords('a b', 1000, 2000) },
    { id: '1', startMs: 3000, endMs: 4000, text: 'c' },
  ],
};

describe('lastStartedAt', () => {
  it('binary-searches the last started item', () => {
    const items = [{ startMs: 0 }, { startMs: 10 }, { startMs: 20 }];
    expect(lastStartedAt(items, -1)).toBe(-1);
    expect(lastStartedAt(items, 0)).toBe(0);
    expect(lastStartedAt(items, 15)).toBe(1);
    expect(lastStartedAt(items, 99)).toBe(2);
  });
});

describe('locate', () => {
  it('is empty before the first line', () => {
    const p = locate(doc, 500);
    expect(p.lineIndex).toBe(-1);
    expect(p.msToNextLine).toBe(500);
  });

  it('finds the active line and word', () => {
    const p = locate(doc, 1100);
    expect(p.lineIndex).toBe(0);
    expect(p.wordIndex).toBe(0);
    expect(p.lineProgress).toBeCloseTo(0.1);
  });

  it('reports gaps between lines (instrumental sections)', () => {
    const p = locate(doc, 2500);
    expect(p.lineIndex).toBe(-1);
    expect(p.lastStartedIndex).toBe(0);
    expect(p.msToNextLine).toBe(500);
  });

  it('handles line-level-only lyrics', () => {
    const p = locate(doc, 3500);
    expect(p.lineIndex).toBe(1);
    expect(p.wordIndex).toBe(-1);
  });
});

describe('demo songs', () => {
  it('are valid, sorted and non-overlapping with in-bounds word timings', () => {
    for (const song of demoSongs) {
      expect(() => LyricsDocumentSchema.parse(song.lyrics)).not.toThrow();
      song.lyrics.lines.forEach((line, i, all) => {
        expect(line.endMs).toBeGreaterThan(line.startMs);
        if (i > 0) expect(line.startMs).toBeGreaterThanOrEqual(all[i - 1]!.endMs);
        expect(line.endMs).toBeLessThanOrEqual(song.track.durationMs);
        for (const w of line.words ?? []) {
          expect(w.startMs).toBeGreaterThanOrEqual(line.startMs);
          expect(w.endMs).toBeLessThanOrEqual(line.endMs);
        }
      });
    }
  });

  it('keeps unicode words intact', () => {
    const words = distributeWords('café — 東京 night', 0, 1000);
    expect(words.map((w) => w.text)).toEqual(['café', '—', '東京', 'night']);
  });

  it('has the expected shape', () => {
    expect(delivered.lyrics.lines.length).toBeGreaterThan(20);
  });
});
