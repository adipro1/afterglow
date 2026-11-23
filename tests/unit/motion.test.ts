import { describe, expect, it } from 'vitest';
import { settleTime, spring, springs } from '@/animation/spring';
import { easeOutBack, easeOutExpo, envelope, hash01, progress } from '@/animation/easing';

describe('spring', () => {
  it('starts at 0 and settles at 1 for every preset', () => {
    for (const cfg of Object.values(springs)) {
      expect(spring(0, cfg)).toBe(0);
      expect(spring(-50, cfg)).toBe(0);
      expect(spring(settleTime(cfg) + 50, cfg)).toBeCloseTo(1, 2);
    }
  });

  it('overshoots when underdamped and not when critically/over-damped', () => {
    let max = 0;
    for (let t = 0; t < 1500; t += 5) max = Math.max(max, spring(t, springs.land));
    expect(max).toBeGreaterThan(1);
    let max2 = 0;
    for (let t = 0; t < 3000; t += 5)
      max2 = Math.max(max2, spring(t, { stiffness: 100, damping: 30 }));
    expect(max2).toBeLessThanOrEqual(1);
  });

  it('is deterministic (pure function of time)', () => {
    expect(spring(123, springs.glide)).toBe(spring(123, springs.glide));
  });
});

describe('easing', () => {
  it('maps endpoints', () => {
    for (const e of [easeOutExpo, easeOutBack()]) {
      expect(e(0)).toBeCloseTo(0);
      expect(e(1)).toBeCloseTo(1);
    }
  });
  it('progress and envelope', () => {
    expect(progress(50, 0, 100)).toBe(0.5);
    expect(progress(-1, 0, 100)).toBe(0);
    expect(envelope(0.5)).toBe(1);
    expect(envelope(0)).toBe(0);
    expect(envelope(1.2)).toBe(0);
  });
  it('hash01 is stable and in range', () => {
    const a = hash01(7, 3);
    expect(a).toBe(hash01(7, 3));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(hash01(7, 3)).not.toBe(hash01(8, 3));
  });
});
