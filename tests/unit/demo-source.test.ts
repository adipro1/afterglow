import { describe, expect, it } from 'vitest';
import { DemoPlaybackSource } from '@/playback/demo-source';
import type { PlaybackSnapshot } from '@/playback/types';
import type { TrackRef } from '@shared/lyrics';

const tracks: TrackRef[] = [
  { key: 'a', title: 'A', artists: ['x'], durationMs: 10_000 },
  { key: 'b', title: 'B', artists: ['x'], durationMs: 5_000 },
];

function setup() {
  let now = 0;
  const src = new DemoPlaybackSource(tracks, { now: () => now, reportIntervalMs: 1e9 });
  const got: PlaybackSnapshot[] = [];
  const unsub = src.subscribe((s) => got.push(s));
  return { src, got, unsub, advance: (ms: number) => (now += ms) };
}

describe('DemoPlaybackSource', () => {
  it('emits immediately on subscribe, paused at 0', () => {
    const { got, unsub } = setup();
    expect(got[0]).toMatchObject({ isPlaying: false, positionMs: 0 });
    unsub();
  });

  it('plays, pauses and seeks', () => {
    const { src, got, advance, unsub } = setup();
    src.play();
    advance(2000);
    src.pause();
    expect(got.at(-1)).toMatchObject({ isPlaying: false, positionMs: 2000 });
    advance(5000);
    expect(src.truePosition()).toBe(2000);
    src.seek(7000);
    expect(got.at(-1)?.positionMs).toBe(7000);
    unsub();
  });

  it('advances to the next track at the end', () => {
    const { src, advance, unsub } = setup();
    src.play();
    advance(10_500);
    src.tick();
    expect(src.track.key).toBe('b');
    expect(src.truePosition()).toBe(0);
    unsub();
  });

  it('previous restarts the track when past 3s', () => {
    const { src, advance, unsub } = setup();
    src.play();
    advance(4000);
    src.previous();
    expect(src.track.key).toBe('a');
    expect(src.truePosition()).toBe(0);
    unsub();
  });
});
