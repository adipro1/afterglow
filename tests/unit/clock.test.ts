import { describe, expect, it } from 'vitest';
import { PlaybackClock, type ClockEvent } from '@/playback/clock';
import type { TrackRef } from '@shared/lyrics';

const track = (key = 'a', durationMs = 200_000): TrackRef => ({
  key,
  title: key,
  artists: ['x'],
  durationMs,
});

const snap = (positionMs: number, sampledAt: number, isPlaying = true, t = track()) => ({
  track: t,
  isPlaying,
  positionMs,
  sampledAt,
});

describe('PlaybackClock', () => {
  it('extrapolates between reports while playing', () => {
    const c = new PlaybackClock();
    c.ingest(snap(10_000, 0), 0);
    expect(c.read(500).positionMs).toBe(10_500);
    expect(c.read(2000).positionMs).toBe(12_000);
  });

  it('accounts for report latency (sampledAt earlier than ingest time)', () => {
    const c = new PlaybackClock();
    c.ingest(snap(10_000, 0), 120);
    expect(c.read(120).positionMs).toBe(10_120);
  });

  it('holds position while paused', () => {
    const c = new PlaybackClock();
    c.ingest(snap(5000, 0, false), 0);
    expect(c.read(10_000).positionMs).toBe(5000);
  });

  it('glides out small drift instead of jumping', () => {
    const c = new PlaybackClock({ smoothingMs: 300 });
    c.ingest(snap(10_000, 0), 0);
    // Report says we are 200ms behind what we showed.
    c.ingest(snap(10_800, 1000), 1000);
    const right = c.read(1000).positionMs;
    expect(right).toBe(11_000); // still showing the old estimate at the instant of correction
    expect(c.read(3000).positionMs).toBeCloseTo(12_800, -1); // converged
  });

  it('never runs backwards while playing when it was ahead', () => {
    const c = new PlaybackClock({ smoothingMs: 300, seekThresholdMs: 1500 });
    c.ingest(snap(10_000, 0), 0);
    c.ingest(snap(10_000, 1000), 1000); // we showed 11_000, truth 10_000 → 1s ahead
    let prev = c.read(1000).positionMs;
    for (let t = 1016; t < 6000; t += 16) {
      const p = c.read(t).positionMs;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    // 1s of error shed at 0.5x → converged within ~2s.
    expect(c.read(3500).positionMs).toBeCloseTo(12_500, -1);
  });

  it('treats large corrections as seeks and snaps', () => {
    const c = new PlaybackClock();
    const events: ClockEvent[] = [];
    c.on((e) => events.push(e));
    c.ingest(snap(10_000, 0), 0);
    c.ingest(snap(60_000, 1000), 1000);
    expect(c.read(1000).positionMs).toBe(60_000);
    expect(events.some((e) => e.type === 'seek')).toBe(true);
  });

  it('emits track and play-state events', () => {
    const c = new PlaybackClock();
    const types: string[] = [];
    c.on((e) => types.push(e.type));
    c.ingest(snap(0, 0, true, track('a')), 0);
    c.ingest(snap(500, 500, false, track('a')), 500);
    c.ingest(snap(0, 600, true, track('b')), 600);
    expect(types).toEqual(['track', 'play-state', 'track']);
    expect(c.read(600).track?.key).toBe('b');
    expect(c.read(600).positionMs).toBe(0);
  });

  it('clamps to the track duration', () => {
    const c = new PlaybackClock();
    c.ingest(snap(9_000, 0, true, track('a', 10_000)), 0);
    expect(c.read(5000).positionMs).toBe(10_000);
  });
});
