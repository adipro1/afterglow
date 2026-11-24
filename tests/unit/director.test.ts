import { describe, expect, it } from 'vitest';
import type { InterpretationPlan, SectionPlan } from '@shared/interpretation';
import type { LyricLine } from '@shared/lyrics';
import { delivered, longWayRound } from '@/demo/songs';
import { cueIndexAt, directSong, DIRECTOR, scoreScene, sectionIndexAt } from '@/director/director';
import { interpret } from '@/interpret/interpreter';
import { registry } from '@/visualizations/registry';
import type { VisualizationMeta } from '@/visualizations/types';

const catalog = registry.map((e) => e.meta);
const plan = (song = delivered, opts = {}) =>
  directSong(interpret(song.lyrics, song.track), song.lyrics.lines, catalog, opts);

describe('director on the demo songs', () => {
  it('"Delivered": thread, escalating choruses, a calm bridge', () => {
    const p = plan();
    expect(p.cues.map((c) => [c.sceneId, c.variation, c.transition])).toEqual([
      ['messages', 'thread', 'sink'],
      ['messages', 'lockscreen', 'push'],
      ['prelude', 'window', 'fade'],
      ['messages', 'drift', 'push'],
    ]);
  });

  it('cues tile the song from start to end', () => {
    for (const song of [delivered, longWayRound]) {
      const p = plan(song);
      expect(p.cues[0]!.atMs).toBe(0);
      expect(p.cues.at(-1)!.endMs).toBe(song.track.durationMs);
      for (let i = 1; i < p.cues.length; i++) expect(p.cues[i]!.atMs).toBe(p.cues[i - 1]!.endMs);
    }
  });

  it('every scene stays at least a full section or the minimum dwell', () => {
    const interp = interpret(delivered.lyrics, delivered.track);
    for (const c of plan().cues.slice(0, -1)) {
      const longest = Math.max(
        ...c.sections.map((i) => interp.sections[i]!.endMs - interp.sections[i]!.startMs),
      );
      expect(c.endMs - c.atMs >= DIRECTOR.minDwellMs || longest >= DIRECTOR.minSectionMs).toBe(
        true,
      );
    }
  });

  it('switches just before a section starts, never in the middle of a sung line', () => {
    const lines = delivered.lyrics.lines;
    for (const c of plan().cues.slice(1)) {
      const singing = lines.find((l) => l.startMs < c.atMs && c.atMs < l.endMs);
      expect(singing).toBeUndefined();
      const next = lines.find((l) => l.startMs >= c.atMs)!;
      expect(next.startMs - c.atMs).toBeLessThanOrEqual(DIRECTOR.leadMs);
    }
  });

  it('"Long Way Round" stays in one calm scene (no travel scene exists yet)', () => {
    const p = plan(longWayRound);
    expect(p.cues).toHaveLength(1);
    expect(p.cues[0]!.sceneId).toBe('prelude');
  });

  it('is deterministic', () => {
    expect(plan()).toEqual(plan());
  });
});

describe('overrides', () => {
  it('lock scene', () => {
    const p = plan(delivered, { lockScene: 'prelude' });
    expect(new Set(p.cues.map((c) => c.sceneId))).toEqual(new Set(['prelude']));
  });

  it('lock variation', () => {
    const p = plan(delivered, { lockVariation: 'drift' });
    expect(
      p.cues.filter((c) => c.sceneId === 'messages').every((c) => c.variation === 'drift'),
    ).toBe(true);
  });

  it('skipping a scene for a section picks the next best there only', () => {
    const bridge = interpret(delivered.lyrics, delivered.track).sections.find(
      (s) => s.kind === 'bridge',
    )!;
    const p = plan(delivered, { excluded: { [bridge.index]: ['prelude'] } });
    expect(p.cues.some((c) => c.sceneId === 'prelude')).toBe(false);
    expect(p.cues.at(-1)!.variation).toBe('drift');
  });

  it('preferences tip the balance', () => {
    const p = plan(longWayRound, { preferences: { messages: 1, prelude: -1 } });
    expect(p.cues[0]!.sceneId).toBe('messages');
  });
});

describe('scoring and lookups', () => {
  const section = (over: Partial<SectionPlan>): SectionPlan => ({
    index: 0,
    kind: 'verse',
    startMs: 0,
    endMs: 20000,
    lines: [0, 4],
    group: null,
    occurrence: 0,
    themes: [{ id: 'travel', weight: 1 }],
    mood: { valence: 0, arousal: 0.5, label: 'reflective' },
    energy: 0.5,
    focusWords: [],
    ...over,
  });
  const scene = (over: Partial<VisualizationMeta>): VisualizationMeta => ({
    id: 'x',
    name: 'X',
    description: '',
    category: 'cinematic',
    variations: [{ id: 'a', name: 'A', description: '' }],
    themes: [],
    ...over,
  });

  it('a matching theme beats no match; energy outside the range costs', () => {
    const s = section({});
    expect(scoreScene(scene({ themes: ['travel'] }), s)).toBeGreaterThan(
      scoreScene(scene({ themes: ['fire'] }), s),
    );
    expect(scoreScene(scene({ energy: [0, 0.6] }), s)).toBeGreaterThan(
      scoreScene(scene({ energy: [0.9, 1] }), s),
    );
  });

  it('a new scene fit for travel would take over "Long Way Round"', () => {
    const road = scene({ id: 'road', themes: ['travel', 'longing'], energy: [0.3, 0.9] });
    const interp = interpret(longWayRound.lyrics, longWayRound.track);
    const p = directSong(interp, longWayRound.lyrics.lines, [...catalog, road]);
    expect(p.cues.map((c) => c.sceneId)).toContain('road');
  });

  it('finds the cue and section at any time', () => {
    const interp: InterpretationPlan = interpret(delivered.lyrics, delivered.track);
    const p = plan();
    expect(cueIndexAt(p, 0)).toBe(0);
    expect(cueIndexAt(p, 76_000)).toBe(1);
    expect(cueIndexAt(p, 1e9)).toBe(p.cues.length - 1);
    expect(interp.sections[sectionIndexAt(interp, 101_000)]!.kind).toBe('bridge');
    expect(cueIndexAt({ trackKey: 'x', cues: [] }, 5)).toBe(-1);
  });

  it('a song without lyrics gets no cues', () => {
    const interp = interpret(
      { trackKey: 'k', sync: 'line', lines: [] as LyricLine[], source: { provider: 'test' } },
      { durationMs: 60_000 },
    );
    expect(directSong(interp, [], catalog).cues).toEqual([]);
  });
});
