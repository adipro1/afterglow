import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LyricLine, LyricsDocument, TrackRef } from '@shared/lyrics';
import { locate } from '@/lyrics/cursor';
import { useTicker } from '@/engine/ticker';
import { runtime, usePlayback } from '@/state/playback';
import { formatTime } from './hooks';

/**
 * Prelude — the shell's built-in lyric view (Phase 1). A restrained, typographic baseline that
 * proves sync end-to-end; the visualisation library (Phase 2+) renders into the same stage.
 *
 * Lines move between slots (-2 … +2 around the current line). Elements are keyed by line id,
 * so a line physically travels from "next" to "current" to "previous" with CSS transitions.
 * Per-frame work (word states, timecode) touches the DOM directly — no React re-render.
 */

interface Entry {
  key: string;
  index: number; // -1 = title card
  kind: 'title' | 'line';
  line?: LyricLine;
  track?: TrackRef;
}

const SLOT_SCALE = { far: 0.36, near: 0.44 };
const GAP_EM = 0.55;
/** A gap counts as an instrumental break once this long after a line ends… */
const BREAK_AFTER_MS = 1600;
/** …and stops counting this long before the next line, so the line "wakes" early. */
const BREAK_LEAD_MS = 900;

export function PreludeView() {
  const lyrics = usePlayback((s) => s.lyrics);
  const track = usePlayback((s) => s.track);
  const discontinuity = usePlayback((s) => s.discontinuity);
  const [anchor, setAnchor] = useState(-1);
  const anchorRef = useRef(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const lastSec = useRef(-1);

  const entries = useMemo(() => visibleEntries(lyrics, track, anchor), [lyrics, track, anchor]);

  useTicker(({ now }) => {
    const root = rootRef.current;
    if (!root) return;
    const t = runtime.position(now);

    const sec = Math.floor(t / 1000);
    if (sec !== lastSec.current && timeRef.current) {
      lastSec.current = sec;
      timeRef.current.textContent = formatTime(t);
    }
    if (!lyrics) return;

    const pos = locate(lyrics, t);
    if (pos.lastStartedIndex !== anchorRef.current) {
      anchorRef.current = pos.lastStartedIndex;
      setAnchor(pos.lastStartedIndex);
      return; // apply word states after React has rendered the new slots
    }

    const current = root.querySelector<HTMLElement>('[data-slot="0"]');
    if (!current) return;
    // Dim only in real instrumental breaks — not in the half-second breaths between lines.
    const prevLine = lyrics.lines[pos.lastStartedIndex];
    const inBreak =
      pos.lineIndex < 0 &&
      !!prevLine &&
      t - prevLine.endMs > BREAK_AFTER_MS &&
      pos.msToNextLine > BREAK_LEAD_MS;
    const active = !inBreak || current.classList.contains('pl--title');
    if (current.dataset['active'] !== String(active)) current.dataset['active'] = String(active);

    const words = current.querySelectorAll<HTMLElement>('.w');
    for (let i = 0; i < words.length; i++) {
      // Once the line has finished (gap or break), every word reads as sung.
      const state =
        pos.lineIndex < 0
          ? 'past'
          : i < pos.wordIndex
            ? 'past'
            : i === pos.wordIndex
              ? 'now'
              : 'next';
      const el = words[i]!;
      if (el.dataset['state'] !== state) el.dataset['state'] = state;
    }
  });

  // Seeks and track changes jump instead of animating through every intermediate line.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add('is-jump');
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('is-jump')),
    );
    return () => cancelAnimationFrame(id);
  }, [discontinuity]);

  // Position slots by measuring real line heights (lines wrap at different widths).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    layoutSlots(root);
    const ro = new ResizeObserver(() => layoutSlots(root));
    ro.observe(root);
    return () => ro.disconnect();
  }, [entries]);

  return (
    <div className="prelude" ref={rootRef} data-testid="prelude">
      <div className="prelude__header">
        <span className="caps">
          {track ? `${track.title} — ${track.artists.join(', ')}` : 'Waiting for playback'}
        </span>
        <span className="prelude__time tabular">
          <span ref={timeRef}>0:00</span>
          <span className="prelude__time-total"> / {formatTime(track?.durationMs ?? 0)}</span>
        </span>
      </div>
      <div className="prelude__lines">
        {entries.map((e) => (
          <div
            key={e.key}
            className={`pl pl--${e.kind}`}
            data-slot={e.index - anchor}
            data-active="true"
            data-testid={e.index - anchor === 0 ? 'current-line' : undefined}
          >
            {e.kind === 'title' ? (
              <>
                <span className="pl__eyebrow caps">Now playing</span>
                <span className="pl__text">{e.track?.title ?? ''}</span>
              </>
            ) : (
              <>
                {e.line?.singer === 'feat' && <span className="pl__eyebrow caps">feat.</span>}
                <span className="pl__text">
                  {(e.line!.words ?? [{ text: e.line!.text }]).map((w, i) => (
                    <span key={i}>
                      {i > 0 && ' '}
                      <span className="w" data-state="next">
                        {w.text}
                      </span>
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function visibleEntries(
  lyrics: LyricsDocument | null,
  track: TrackRef | null,
  anchor: number,
): Entry[] {
  const out: Entry[] = [];
  const lines = lyrics?.lines ?? [];
  for (let i = anchor - 2; i <= anchor + 2; i++) {
    if (i === -1 && track) out.push({ key: `title:${track.key}`, index: -1, kind: 'title', track });
    else if (i >= 0 && i < lines.length)
      out.push({ key: lines[i]!.id, index: i, kind: 'line', line: lines[i]! });
  }
  return out;
}

/** Stack lines around the current one using their measured (unscaled) heights. */
function layoutSlots(root: HTMLElement) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('.pl'));
  const bySlot = new Map<number, HTMLElement>();
  for (const el of els) bySlot.set(Number(el.dataset['slot']), el);
  const fontPx = parseFloat(getComputedStyle(root).getPropertyValue('--lyric-size')) || 64;
  const gap = GAP_EM * fontPx;

  const h = (slot: number) => bySlot.get(slot)?.offsetHeight ?? 0;
  const place = (slot: number, y: number, scale: number, opacity: number) => {
    const el = bySlot.get(slot);
    if (!el) return;
    el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale})`;
    el.style.opacity = String(opacity);
  };

  const h0 = h(0);
  place(0, -h0 / 2, 1, 1);

  const s1 = SLOT_SCALE.near;
  const yPrev = -h0 / 2 - gap - h(-1) * s1;
  place(-1, yPrev, s1, 0.32);
  place(-2, yPrev - gap * 0.6 - h(-2) * SLOT_SCALE.far, SLOT_SCALE.far, 0);

  const yNext = h0 / 2 + gap;
  place(1, yNext, s1, 0.2);
  place(2, yNext + h(1) * s1 + gap * 0.6, SLOT_SCALE.far, 0);
}
