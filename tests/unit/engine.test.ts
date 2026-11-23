import { describe, expect, it } from 'vitest';
import {
  blink,
  breathe,
  enter,
  flash,
  flowStack,
  lastBefore,
  layerStyle,
  makeField,
  motePose,
  move,
  nudge,
  poseTransform,
  presence,
  pulse,
  ramp,
  REST,
  revealClip,
  sceneTransitions,
  shake,
  springs,
  transform,
  wave,
} from '@/engine';
import { isSung } from '@/engine/text';

describe('timeline', () => {
  it('enter is 0 before its moment and settles at 1', () => {
    expect(enter(999, 1000, springs.land)).toBe(0);
    expect(enter(1000 + 5000, 1000, springs.land)).toBe(1);
  });

  it('presence rises, holds and leaves', () => {
    const p = (t: number) => presence(t, 1000, 5000, springs.glide);
    expect(p(500)).toBe(0);
    expect(p(4000)).toBeCloseTo(1, 3);
    expect(p(9000)).toBeCloseTo(0, 3);
    // No exit time = stays.
    expect(presence(9000, 1000, Infinity, springs.glide)).toBeCloseTo(1, 3);
  });

  it('ramp, flash and pulse are bounded and zero outside their window', () => {
    expect(ramp(50, 0, 100)).toBe(0.5);
    expect(ramp(-1, 0, 100)).toBe(0);
    expect(flash(-1, 90, 650)).toBe(0);
    expect(flash(90, 90, 650)).toBe(1);
    expect(flash(5000, 90, 650)).toBeLessThan(0.01);
    expect(pulse(-1, 0, 200, 1000, 500)).toBe(0);
    expect(pulse(600, 0, 200, 1000, 500)).toBe(1);
    expect(pulse(1600, 0, 200, 1000, 500)).toBe(0);
  });

  it('blink and wave are periodic and deterministic', () => {
    expect(blink(0)).toBe(true);
    expect(blink(600)).toBe(false);
    expect(blink(1060)).toBe(true);
    expect(wave(0, 0, 1300, 0.18)).toBe(wave(1300, 0, 1300, 0.18));
    for (let t = 0; t < 3000; t += 37) {
      const v = wave(t, 1, 1300, 0.18);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('lastBefore finds the last cue that has happened', () => {
    const cues = [100, 200, 300];
    expect(lastBefore(cues, 50)).toBe(-1);
    expect(lastBefore(cues, 200)).toBe(1);
    expect(lastBefore(cues, 1e9)).toBe(2);
  });
});

describe('flow stack', () => {
  const items = [{ h: 40 }, { h: 30 }, { h: 20 }];

  it('stacks fully present items edge to edge with gaps', () => {
    const slots = flowStack(items, { size: (i) => i.h, presence: () => 1, gap: () => 10 });
    expect(slots.map((s) => s.offset)).toEqual([0, 50, 90]);
    expect(slots.map((s) => s.depth)).toEqual([0, 1, 2]);
  });

  it('an arriving item pushes the rest in proportion to its presence', () => {
    const slots = flowStack(items, { size: (i) => i.h, presence: (_, i) => (i === 0 ? 0.5 : 1) });
    expect(slots[1]!.offset).toBe(20);
    expect(slots[1]!.depth).toBe(0.5);
  });

  it('absent items leave no gap behind', () => {
    const slots = flowStack(items, {
      size: (i) => i.h,
      presence: (_, i) => (i === 1 ? 0 : 1),
      gap: () => 10,
    });
    // Item 2 measures its gap to item 0, not to the absent item 1.
    expect(slots[2]!.offset).toBe(50);
  });

  it('items that stop occupying (a pile) stop pushing', () => {
    const slots = flowStack([10, 10, 10, 10], {
      size: (h) => h,
      presence: () => 1,
      occupies: (_, depth) => depth <= 1,
    });
    expect(slots.map((s) => s.offset)).toEqual([0, 10, 20, 20]);
  });
});

describe('text', () => {
  it('a word lights up slightly before it is sung', () => {
    expect(isSung({ startMs: 1000 }, 959)).toBe(false);
    expect(isSung({ startMs: 1000 }, 960)).toBe(true);
    expect(isSung(undefined, 0)).toBe(true);
  });
});

describe('camera', () => {
  it('breathe at amount 0 is the resting pose', () => {
    const p = breathe(12_345, { rotX: 2, rotY: -5, z: -260 }, 0);
    expect(p).toMatchObject({ z: -260, rotX: 2, rotY: -5 });
    expect(Math.abs(p.y)).toBe(0);
  });

  it('breathing stays within its amplitudes', () => {
    for (let t = 0; t < 120_000; t += 997) {
      const p = breathe(t, { rotY: 5, ampY: 1.4, ampLift: 4 });
      expect(Math.abs(p.rotY - 5)).toBeLessThanOrEqual(1.4 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('shake starts and ends at rest', () => {
    expect(shake(0, { amp: 1.5, rot: 0.16 })).toEqual({ x: 0, rot: 0 });
    expect(shake(600, { amp: 1.5, rot: 0.16 })).toEqual({ x: 0, rot: 0 });
    const peak = Math.max(
      ...Array.from({ length: 50 }, (_, i) => Math.abs(shake(i * 10, { amp: 1.5, rot: 0.16 }).x)),
    );
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1.5);
  });

  it('nudge peaks at its peak time', () => {
    expect(nudge(160, 160)).toBeCloseTo(1, 6);
    expect(nudge(0, 160)).toBe(0);
  });

  it('move goes from one pose to the other', () => {
    const b = { ...REST, z: -400, rotY: 20 };
    expect(move(0, 100, REST, b)).toEqual(REST);
    const end = move(100_000, 100, REST, b);
    expect(end.z).toBeCloseTo(-400, 3);
    expect(end.rotY).toBeCloseTo(20, 3);
  });

  it('poseTransform matches the rig format', () => {
    expect(poseTransform(breathe(0, { rotY: 5, rotX: 1.6 }, 0))).toBe(
      'translate3d(0, 0.00px, 0px) rotateX(1.600deg) rotateY(5.000deg) rotateZ(0deg)',
    );
  });
});

describe('style strings', () => {
  it('transform builds translate → rotate → scale', () => {
    expect(transform({ y: -12.345, scale: 0.9 })).toBe('translate3d(0, -12.35px, 0) scale(0.9000)');
    expect(transform({ x: 1.5, rotateZ: 0.1234 })).toBe(
      'translate3d(1.50px, 0, 0) rotate(0.123deg)',
    );
    expect(transform({ x: '-50%', y: '3cqh', z: -10 }, 1)).toBe('translate3d(-50%, 3cqh, -10.0px)');
    expect(transform({ scaleX: 1, scaleY: 0.5 })).toBe(
      'translate3d(0, 0, 0) scale(1.0000, 0.5000)',
    );
  });
});

describe('transitions', () => {
  it('revealClip clears itself once fully shown', () => {
    expect(
      revealClip({ w: 100, h: 50 }, { w: 100, h: 50 }, { anchor: 'top', radius: '6cqw' }),
    ).toBe('');
    expect(
      revealClip({ w: 100, h: 50 }, { w: 100, h: 20 }, { anchor: 'top', radius: '6cqw' }),
    ).toBe('inset(0 0 30.0px 0 round 6cqw)');
    expect(
      revealClip(
        { w: 200, h: 60 },
        { w: 60, h: 38 },
        { anchor: 'bottom-left', radius: 19, bleed: 12 },
      ),
    ).toBe('inset(22.0px 140.0px 0 -12px round 19.0px)');
  });

  it('every scene transition has an enter pose, an exit pose and a rest', () => {
    for (const tr of Object.values(sceneTransitions)) {
      expect(layerStyle(tr, 'enter').transition).toBe('none');
      expect(layerStyle(tr, 'live')).toMatchObject({ opacity: 1, transform: 'none' });
      expect(layerStyle(tr, 'exit').opacity).toBe(0);
      expect(tr.totalMs).toBeGreaterThanOrEqual(tr.exit.opacityMs);
    }
  });
});

describe('particle field', () => {
  it('is deterministic per seed and stays in bounds', () => {
    const a = makeField(7, {
      count: 14,
      minSize: 30,
      maxSize: 150,
      minPeriod: 26e3,
      maxPeriod: 56e3,
    });
    const b = makeField(7, {
      count: 14,
      minSize: 30,
      maxSize: 150,
      minPeriod: 26e3,
      maxPeriod: 56e3,
    });
    expect(a).toEqual(b);
    for (const [i, m] of a.entries()) {
      expect(m.size).toBeGreaterThanOrEqual(30);
      expect(m.size).toBeLessThanOrEqual(150);
      const p = motePose(m, i, 40_000);
      expect(p.k).toBeGreaterThanOrEqual(0);
      expect(p.k).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(-10);
      expect(p.y).toBeLessThanOrEqual(110);
    }
  });
});
