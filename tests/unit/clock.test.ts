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

  it('glides out small drift instead of jumping, without visibly bending time', () => {
    const c = new PlaybackClock();
    c.ingest(snap(10_000, 0), 0);
    // A real drift (not jitter): from now on every report says we are 200 ms ahead.
    // Never more than a few percent off real speed between frames.
    let prev = c.read(0).positionMs;
    for (let t = 16; t < 9008; t += 16) {
      if (t % 1008 === 0) c.ingest(snap(10_000 + t - 200, t), t);
      const p = c.read(t).positionMs;
      const rate = (p - prev) / 16;
      expect(rate).toBeGreaterThan(0.85);
      expect(rate).toBeLessThan(1.15);
      prev = p;
    }
    // ...and it has converged onto the reports.
    expect(Math.abs(c.read(9008).positionMs - (10_000 + 9008 - 200))).toBeLessThan(15);
  });

  it('averages out reporting jitter instead of chasing it', () => {
    const c = new PlaybackClock();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    c.ingest(snap(0, 0, true, track('a', 1e9)), 0);
    let prev = 0;
    let worst = 0;
    let maxErr = 0;
    for (let t = 16; t < 60_000; t += 16) {
      if (t % 1008 === 0) c.ingest(snap(t + rand() * 120, t, true, track('a', 1e9)), t);
      const p = c.read(t).positionMs;
      worst = Math.max(worst, Math.abs((p - prev) / 16 - 1));
      if (t > 5000) maxErr = Math.max(maxErr, Math.abs(p - t));
      prev = p;
    }
    expect(worst).toBeLessThan(0.07); // speed stays within ~6 % of real time
    expect(maxErr).toBeLessThan(90); // and close to the truth
  });

  it('snaps to exact reports from user actions', () => {
    const c = new PlaybackClock();
    c.ingest(snap(10_000, 0), 0);
    c.ingest({ ...snap(10_600, 500), exact: true }, 500);
    expect(c.read(500).positionMs).toBe(10_600);
  });

  it('never runs backwards while playing when it was ahead', () => {
    const c = new PlaybackClock({ seekThresholdMs: 1500 });
    c.ingest(snap(10_000, 0), 0);
    c.ingest(snap(10_000, 1000), 1000); // we showed 11_000, truth 10_000 → 1s ahead
    let prev = c.read(1000).positionMs;
    for (let t = 1016; t < 9000; t += 16) {
      const p = c.read(t).positionMs;
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
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
