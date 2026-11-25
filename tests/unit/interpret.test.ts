import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@shared/lyrics';
import { delivered, longWayRound } from '@/demo/songs';
import { interpret, localInterpreter, moodLabel, readLine } from '@/interpret/interpreter';
import { analyseStructure, lineSimilarity, normWords } from '@/interpret/structure';

/** Build timed lines from [startSeconds, durationSeconds, text]. Original test lyrics only. */
function lines(spec: [number, number, string][]): LyricLine[] {
  return spec.map(([s, d, text], i) => ({
    id: String(i),
    startMs: s * 1000,
    endMs: (s + d) * 1000,
    text,
  }));
}

const themesOf = (text: string) => Object.fromEntries(readLine(text).themes);

describe('reading a line', () => {
  it('finds themes from words', () => {
    expect(themesOf('Rain on the window of my room').water).toBeGreaterThan(0);
    expect(themesOf('Rain on the window of my room').home).toBeGreaterThan(0);
    expect(themesOf('Neon on the avenue')).toMatchObject({ city: expect.any(Number) });
  });

  it('phrases decide what words mean: a call that ends things is not a phone call', () => {
    const off = themesOf("Let's call it off tonight");
    expect(off.separation).toBeGreaterThan(0);
    expect(off.conversation ?? 0).toBe(0);
    const me = themesOf('Call me when you get home');
    expect(me.conversation).toBeGreaterThan(0);
  });

  it('metaphors weigh the feeling over the literal picture', () => {
    const t = themesOf("I'm drowning in your voice");
    expect(t.heartbreak).toBeGreaterThan(t.water ?? 0);
  });

  it('directions are travel, not leaving', () => {
    const t = themesOf('Turn left at the river');
    expect(t.travel).toBeGreaterThan(0);
    expect(t.separation ?? 0).toBe(0);
  });

  it('negation flips feeling and weakens the theme', () => {
    const lonely = readLine("I'm so alone");
    const notLonely = readLine("I'm not alone");
    expect(lonely.themes.get('isolation')!).toBeGreaterThan(0);
    expect(notLonely.themes.get('isolation')!).toBeLessThan(0);
    expect(lonely.valence[0]!).toBeLessThan(0);
    expect(notLonely.valence[0]!).toBeGreaterThan(0);
  });

  it('notices lines addressed to someone', () => {
    expect(readLine('Where did you go').addressed).toBe(true);
    expect(readLine('The road goes on').addressed).toBe(false);
  });

  it('mood labels cover the quadrants', () => {
    expect(moodLabel(0.6, 0.8)).toBe('euphoric');
    expect(moodLabel(-0.6, 0.8)).toBe('tense');
    expect(moodLabel(0.6, 0.2)).toBe('tender');
    expect(moodLabel(-0.6, 0.2)).toBe('melancholic');
    expect(moodLabel(0, 0.2)).toBe('reflective');
  });
});

describe('structure', () => {
  it('compares lines by their words', () => {
    expect(normWords("Don't — stop!")).toEqual(['dont', 'stop']);
    expect(
      lineSimilarity(
        normWords('Three dots, then nothing'),
        normWords('Three dots, then nothing again'),
      ),
    ).toBe(0.8);
    expect(lineSimilarity([], ['a'])).toBe(0);
  });

  it('finds the sections of "Delivered"', () => {
    const s = analyseStructure(
      delivered.lyrics.lines,
      delivered.track.durationMs,
      delivered.track.title,
    );
    expect(s.map((x) => x.kind)).toEqual([
      'intro',
      'verse',
      'chorus',
      'verse',
      'chorus',
      'instrumental',
      'bridge',
      'chorus',
      'outro',
    ]);
    const choruses = s.filter((x) => x.kind === 'chorus');
    expect(new Set(choruses.map((c) => c.group)).size).toBe(1);
    expect(choruses.map((c) => c.occurrence)).toEqual([0, 1, 2]);
  });

  it('covers the whole song with no gaps or overlaps', () => {
    for (const song of [delivered, longWayRound]) {
      const s = analyseStructure(song.lyrics.lines, song.track.durationMs, song.track.title);
      expect(s[0]!.startMs).toBe(0);
      expect(s.at(-1)!.endMs).toBe(song.track.durationMs);
      for (let i = 1; i < s.length; i++) expect(s[i]!.startMs).toBe(s[i - 1]!.endMs);
      // Every line belongs to exactly one section.
      const covered = s.flatMap((x) =>
        Array.from({ length: x.lines[1] - x.lines[0] }, (_, k) => x.lines[0] + k),
      );
      expect(covered).toEqual(song.lyrics.lines.map((_, i) => i));
    }
  });

  it('finds "Long Way Round": verse, pre-chorus, two choruses, instrumental tail', () => {
    const s = analyseStructure(
      longWayRound.lyrics.lines,
      longWayRound.track.durationMs,
      longWayRound.track.title,
    );
    expect(s.map((x) => x.kind)).toEqual([
      'intro',
      'verse',
      'pre-chorus',
      'chorus',
      'chorus',
      'outro',
    ]);
  });

  it('carves a chorus out of a block with no pause before it', () => {
    const l = lines([
      [1, 2, 'Walking down the shore alone'],
      [3, 2, 'Counting every stone I own'],
      [5, 2, 'Sing it loud and sing it free'],
      [7, 2, 'Sing it out for you and me'],
      [12, 2, 'Morning comes and finds me late'],
      [14, 2, 'Coffee cold beside the gate'],
      [16, 2, 'Sing it loud and sing it free'],
      [18, 2, 'Sing it out for you and me'],
    ]);
    const s = analyseStructure(l, 22_000).filter((x) => x.lines[0] !== x.lines[1]);
    expect(s.map((x) => x.kind)).toEqual(['verse', 'chorus', 'verse', 'chorus']);
  });

  it('a song with no repeats is all verses (and does not crash)', () => {
    const l = lines([
      [0, 2, 'One thing'],
      [2.5, 2, 'Another thing'],
      [8, 2, 'Something else'],
    ]);
    const s = analyseStructure(l, 12_000);
    expect(s.every((x) => x.kind === 'verse')).toBe(true);
  });

  it('no lyrics at all is one instrumental section', () => {
    expect(analyseStructure([], 60_000)).toEqual([
      {
        kind: 'instrumental',
        startMs: 0,
        endMs: 60_000,
        lines: [0, 0],
        group: null,
        occurrence: 0,
      },
    ]);
  });
});

describe('interpretation of the demo songs', () => {
  const d = interpret(delivered.lyrics, delivered.track);
  const w = interpret(longWayRound.lyrics, longWayRound.track);

  it('"Delivered" is about messages; its bridge turns to hope and reflection', () => {
    expect(d.themes[0]!.id).toBe('messages');
    const bridge = d.sections.find((s) => s.kind === 'bridge')!;
    expect(
      bridge.themes
        .slice(0, 2)
        .map((t) => t.id)
        .sort(),
    ).toEqual(['hope', 'reflection']);
    const chorus = d.sections.find((s) => s.kind === 'chorus')!;
    expect(chorus.mood.label).toBe('melancholic');
    expect(chorus.focusWords[0]).toBe('Delivered');
  });

  it('choruses carry more energy than the bridge, and build each time they return', () => {
    const ch = d.sections.filter((s) => s.kind === 'chorus');
    const bridge = d.sections.find((s) => s.kind === 'bridge')!;
    for (const c of ch) expect(c.energy).toBeGreaterThan(bridge.energy);
    expect(ch[2]!.energy).toBeGreaterThan(ch[0]!.energy);
  });

  it('"Long Way Round" is about travel', () => {
    expect(w.themes[0]!.id).toBe('travel');
    expect(
      w.sections.filter((s) => s.kind === 'chorus').every((s) => s.themes[0]!.id === 'travel'),
    ).toBe(true);
  });

  it('is deterministic and cached per lyrics document', () => {
    expect(localInterpreter.interpret(delivered.lyrics, delivered.track)).toEqual(d);
    expect(interpret(delivered.lyrics, delivered.track)).toBe(d);
  });

  it('every number stays in range', () => {
    for (const p of [d, w]) {
      for (const s of p.sections) {
        expect(s.energy).toBeGreaterThanOrEqual(0);
        expect(s.energy).toBeLessThanOrEqual(1);
        expect(Math.abs(s.mood.valence)).toBeLessThanOrEqual(1);
        for (const t of s.themes) expect(t.weight).toBeLessThanOrEqual(1);
      }
    }
  });
});
