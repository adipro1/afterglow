import { describe, expect, it } from 'vitest';
import {
  clockLabel,
  composeAt,
  lastLanded,
  planConversation,
  sungWordIndex,
  typingAt,
} from '@/visualizations/messages/plan';
import { delivered, longWayRound } from '@/demo/songs';

const plan = planConversation(delivered.lyrics, 7);

describe('planConversation', () => {
  it('creates one message per non-empty line, in order', () => {
    expect(plan.messages).toHaveLength(delivered.lyrics.lines.length);
    plan.messages.forEach((m, i) => {
      if (i > 0) expect(m.appearAt).toBeGreaterThanOrEqual(plan.messages[i - 1]!.appearAt);
    });
  });

  it('is deterministic for the same seed', () => {
    expect(planConversation(delivered.lyrics, 7)).toEqual(plan);
  });

  it('uses both sides of the conversation', () => {
    const sides = new Set(plan.messages.map((m) => m.side));
    expect(sides).toEqual(new Set(['in', 'out']));
  });

  it('keeps a repeated chorus on the same side every time', () => {
    const chorus = plan.messages.filter((m) => m.text === 'Every word I should have said');
    expect(chorus.length).toBe(3);
    expect(new Set(chorus.map((m) => m.side)).size).toBe(1);
  });

  it('marks group boundaries consistently', () => {
    plan.messages.forEach((m, i) => {
      const next = plan.messages[i + 1];
      expect(m.lastInGroup).toBe(!next || next.group !== m.group);
    });
  });

  it('only outgoing messages are composed, only incoming ones show typing', () => {
    for (const m of plan.messages) {
      if (m.side === 'out') {
        expect(m.composeFrom).not.toBeNull();
        expect(m.typingFrom).toBeNull();
        expect(m.appearAt).toBeLessThanOrEqual(m.endMs);
      } else {
        expect(m.composeFrom).toBeNull();
        expect(m.appearAt).toBeLessThan(m.startMs);
      }
    }
  });

  it('puts a timestamp before the first message and after long breaks', () => {
    expect(plan.messages[0]!.separator).toMatch(/^Today \d{1,2}:\d{2} (AM|PM)$/);
    const bridge = plan.messages.find((m) => m.text === "Maybe you're asleep somewhere")!;
    expect(bridge.separator).not.toBeNull();
  });

  it('reads outgoing messages only after they were sent', () => {
    for (const m of plan.messages)
      if (m.readAt !== null) expect(m.readAt).toBeGreaterThan(m.appearAt);
  });

  it('handles line-synced lyrics (no word timings)', () => {
    const lineOnly = {
      lines: longWayRound.lyrics.lines.map(({ words: _w, ...rest }) => rest),
    };
    const p = planConversation(lineOnly, 1);
    expect(p.messages.every((m) => m.words.length > 0)).toBe(true);
  });

  it('handles empty lyrics', () => {
    expect(planConversation({ lines: [] }).messages).toEqual([]);
  });
});

describe('time queries', () => {
  it('lastLanded tracks arrivals', () => {
    expect(lastLanded(plan, 0)).toBe(-1);
    const m = plan.messages[3]!;
    expect(lastLanded(plan, m.appearAt)).toBeGreaterThanOrEqual(3);
    expect(lastLanded(plan, 1e9)).toBe(plan.messages.length - 1);
  });

  it('composeAt types an outgoing line word by word', () => {
    const out = plan.messages.find((m) => m.side === 'out')!;
    const mid = out.words[1]!.startMs + 10;
    const c = composeAt(plan, mid)!;
    expect(c.message.id).toBe(out.id);
    expect(c.typed).toBe(`${out.words[0]!.text} ${out.words[1]!.text}`);
    expect(composeAt(plan, out.appearAt)).toBeNull();
  });

  it('typingAt shows before incoming messages', () => {
    const inc = plan.messages.find((m) => m.side === 'in' && m.typingFrom !== null)!;
    expect(typingAt(plan, inc.typingFrom! + 1)?.id).toBe(inc.id);
    expect(typingAt(plan, inc.appearAt)?.id).not.toBe(inc.id);
  });

  it('sungWordIndex', () => {
    const m = plan.messages[0]!;
    expect(sungWordIndex(m, m.startMs - 1)).toBe(-1);
    expect(sungWordIndex(m, m.words[2]!.startMs)).toBe(2);
    expect(sungWordIndex(m, m.endMs)).toBe(m.words.length);
  });

  it('clockLabel formats a 12-hour time', () => {
    expect(clockLabel(0, 7)).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });
});
