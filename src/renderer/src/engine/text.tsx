/**
 * Text systems: lyrics rendered word by word, so each word can light up as it is sung, and
 * typed text with a caret. Words are separate spans, created once; per frame only their
 * `data-*` state changes, which restyles the word without re-laying-out the line.
 */
import { memo } from 'react';
import type { LyricWord } from '@shared/lyrics';
import { setData, setStyle, setText } from './style';
import { blink } from './timeline';

export type WordState = 'past' | 'now' | 'next';

/**
 * Renders words as `<span class={wordClass} data-{attr}={initial}>` separated by spaces.
 * Memoised on the word list: lines never change after they are created.
 */
export const Words = memo(function Words({
  words,
  wordClass,
  attr,
  initial,
}: {
  words: readonly Pick<LyricWord, 'text'>[];
  wordClass: string;
  /** The data attribute (without `data-`) that carries the word's state. */
  attr: string;
  initial: string;
}) {
  const data = { [`data-${attr}`]: initial };
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span className={wordClass} {...data}>
            {w.text}
          </span>
        </span>
      ))}
    </>
  );
});

/** Has word `w` been sung by time t? `leadMs` lights it slightly early so it never lags the voice. */
export const isSung = (w: Pick<LyricWord, 'startMs'> | undefined, t: number, leadMs = 40) =>
  !w || t >= w.startMs - leadMs;

/**
 * Write a state to every word span under `root` matching `selector`. `stateOf(i)` returns the
 * state for word i. Unchanged states cost nothing (see `setData`).
 */
export function applyWordStates(
  root: Element | null | undefined,
  selector: string,
  attr: string,
  stateOf: (index: number) => string,
) {
  if (!root) return;
  const spans = root.querySelectorAll<HTMLElement>(selector);
  for (let i = 0; i < spans.length; i++) setData(spans[i], attr, stateOf(i));
}

/**
 * A typed line: shows `text` (kept after typing stops, so it can fade out with the field) and
 * a caret that is solid while words are arriving and blinks while waiting.
 * Returns the text actually shown.
 */
export function applyTyping(
  textEl: HTMLElement | null | undefined,
  caretEl: HTMLElement | null | undefined,
  state: { text: string | null; arriving: boolean },
  t: number,
  last: { current: string },
  keepLast = true,
): string {
  const shown = state.text ?? (keepLast ? last.current : '');
  last.current = shown;
  setText(textEl, shown);
  if (caretEl) setStyle(caretEl, 'opacity', state.arriving || blink(t) ? '1' : '0');
  return shown;
}
