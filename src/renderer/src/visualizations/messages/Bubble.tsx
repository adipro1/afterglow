import type { PlannedMessage } from './plan';

/**
 * One message bubble. Words are individual spans so the line can light up as it's sung.
 * The tail is drawn in SVG (not a CSS border hack) so it stays crisp at any scale.
 */
export function Bubble({
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
          <path d="M0 0 C0 8 3 13 11 15.5 C5 16.5 1.5 15 0 13 Z" />
        </svg>
      )}
    </div>
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
      <svg className="bubble__tail" viewBox="0 0 12 16" aria-hidden>
        <path d="M0 0 C0 8 3 13 11 15.5 C5 16.5 1.5 15 0 13 Z" />
      </svg>
    </div>
  );
}

/** Dots bounce on a deterministic phase so a paused frame always looks the same. */
export function applyTypingDots(root: Element | null, t: number) {
  if (!root) return;
  const dots = root.querySelectorAll<HTMLElement>('.typing-dots i');
  dots.forEach((d, i) => {
    const phase = (((t / 1150 - i * 0.16) % 1) + 1) % 1;
    const k = phase < 0.4 ? Math.sin((phase / 0.4) * Math.PI) : 0;
    d.style.transform = `translateY(${(-3.2 * k).toFixed(2)}px)`;
    d.style.opacity = (0.38 + 0.5 * k).toFixed(3);
  });
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
