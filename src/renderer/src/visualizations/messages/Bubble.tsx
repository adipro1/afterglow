import { memo } from 'react';
import { clamp } from '@/animation/easing';
import { spring, springs } from '@/animation/spring';
import type { PlannedMessage, Reaction } from './plan';

const TAIL = 'M0 0 C0 8 3 13 11 15.5 C5 16.5 1.5 15 0 13 Z';

/**
 * One message bubble. Words are individual spans so the line can light up as it's sung.
 * The tail is drawn in SVG (not a CSS border hack) so it stays crisp at any scale.
 * Memoised: bubbles never change after they're created, so re-rendering the thread is cheap.
 */
export const Bubble = memo(function Bubble({
  m,
  tail = m.lastInGroup,
  className = '',
}: {
  m: PlannedMessage;
  tail?: boolean;
  className?: string;
}) {
  const shape = `${m.firstInGroup ? 'is-first' : ''} ${m.lastInGroup ? 'is-last' : ''}`;
  return (
    <div className={`bubble bubble--${m.side} ${shape} ${className}`} data-msg={m.id}>
      <span className="bubble__text">
        {m.words.map((w, i) => (
          <span key={i}>
            {i > 0 && ' '}
            <span className="bw" data-sung={m.side === 'out' ? '1' : '0'}>
              {w.text}
            </span>
          </span>
        ))}
      </span>
      {tail && (
        <svg className="bubble__tail" viewBox="0 0 12 16" aria-hidden>
          <path d={TAIL} />
        </svg>
      )}
      {m.reaction && <Tapback kind={m.reaction.kind} />}
    </div>
  );
});

/** iMessage-style tapback badge, perched on the bubble's top corner. */
function Tapback({ kind }: { kind: Reaction }) {
  return (
    <span className="tapback" data-kind={kind} aria-hidden>
      <span className="tapback__dot tapback__dot--lg" />
      <span className="tapback__dot tapback__dot--sm" />
      <span className="tapback__face">
        {kind === 'heart' ? (
          <svg viewBox="0 0 24 24">
            <path d="M12 20.6s-7.6-4.6-9.6-9.4C1 7.8 3.2 4.4 6.6 4.4c2.1 0 3.6 1.2 4.4 2.6.8-1.4 2.3-2.6 4.4-2.6 3.4 0 5.6 3.4 4.2 6.8-2 4.8-9.6 9.4-9.6 9.4Z" />
          </svg>
        ) : (
          <b>!!</b>
        )}
      </span>
    </span>
  );
}

export function TypingBubble({ className = '' }: { className?: string }) {
  return (
    <div className={`bubble bubble--in bubble--typing is-first is-last ${className}`}>
      <span className="typing-dots">
        <i />
        <i />
        <i />
      </span>
      <span className="typing-tail" aria-hidden>
        <i />
        <i />
      </span>
    </div>
  );
}

/**
 * The three dots brighten in a rolling wave, the way the real indicator does, on a
 * deterministic phase so a paused frame always looks the same. Each dot is its own compositor
 * layer, so this never repaints the bubble.
 */
export function applyTypingDots(root: Element | null, t: number) {
  if (!root) return;
  const dots = root.querySelectorAll<HTMLElement>('.typing-dots i');
  for (let i = 0; i < dots.length; i++) {
    const phase = (((t / 1300 - i * 0.18) % 1) + 1) % 1;
    const k = phase < 0.5 ? Math.sin((phase / 0.5) * Math.PI) ** 2 : 0;
    const d = dots[i]!;
    d.style.transform = `translateY(${(-1.6 * k).toFixed(2)}px) scale(${(0.86 + 0.18 * k).toFixed(3)})`;
    d.style.opacity = (0.34 + 0.56 * k).toFixed(3);
  }
}

/** Light up the words of message `m` that have been sung by time t. */
export function applySungWords(el: Element | null, m: PlannedMessage, t: number) {
  if (!el || m.side === 'out') return;
  const spans = el.querySelectorAll<HTMLElement>('.bw');
  for (let i = 0; i < spans.length; i++) {
    const w = m.words[i];
    const sung = !w || t >= w.startMs - 40 ? '1' : '0';
    const span = spans[i]!;
    if (span.dataset['sung'] !== sung) span.dataset['sung'] = sung;
  }
}

/** Pop the tapback in with a bouncy spring once its moment comes. */
export function applyReaction(el: Element | null, m: PlannedMessage, t: number) {
  if (!el || !m.reaction) return;
  const tb = el.querySelector<HTMLElement>('.tapback');
  if (!tb) return;
  const age = t - m.reaction.at;
  if (age <= 0) {
    if (tb.style.opacity !== '0') {
      tb.style.opacity = '0';
      tb.style.transform = 'scale(0.2)';
    }
    return;
  }
  const s = spring(age, springs.pop);
  tb.style.opacity = clamp(age / 90).toFixed(3);
  tb.style.transform = `scale(${(0.2 + 0.8 * s).toFixed(4)}) rotate(${((1 - s) * -24).toFixed(2)}deg)`;
}
