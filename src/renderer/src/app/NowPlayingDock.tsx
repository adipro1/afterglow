import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { EdgePanel } from '@/design/EdgePanel';
import { Artwork } from '@/design/Artwork';
import { Icon } from '@/design/Icon';
import { useTicker } from '@/engine/ticker';
import { runtime, usePlayback } from '@/state/playback';
import { isControllable } from '@/playback/types';
import { DemoPlaybackSource } from '@/playback/demo-source';
import { formatTime } from './hooks';

export function NowPlayingDock({ hidden }: { hidden: boolean }) {
  const track = usePlayback((s) => s.track);
  const isPlaying = usePlayback((s) => s.isPlaying);
  const fillRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lastSecond = useRef(-1);
  const scrubbing = useRef<number | null>(null);

  const duration = track?.durationMs ?? 0;
  const src = runtime.source;
  const controllable = isControllable(src);

  useTicker(({ now }) => {
    const pos = scrubbing.current ?? runtime.position(now);
    const p = duration ? pos / duration : 0;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;
    if (barRef.current)
      barRef.current.setAttribute('aria-valuenow', String(Math.round(pos / 1000)));
    const sec = Math.floor(pos / 1000);
    if (sec !== lastSecond.current && elapsedRef.current) {
      lastSecond.current = sec;
      elapsedRef.current.textContent = formatTime(pos);
    }
  });

  const posFromPointer = (e: ReactPointerEvent) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
  };

  const onDown = (e: ReactPointerEvent) => {
    if (!controllable) return;
    barRef.current!.setPointerCapture(e.pointerId);
    scrubbing.current = posFromPointer(e);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (scrubbing.current !== null) scrubbing.current = posFromPointer(e);
  };
  const onUp = () => {
    if (scrubbing.current === null || !controllable) return;
    src.seek(scrubbing.current);
    scrubbing.current = null;
  };

  return (
    <EdgePanel
      className={`dock ${hidden ? 'is-hidden' : ''}`}
      intensity="quiet"
      radius={12}
      data-testid="now-playing"
    >
      <div className="dock__row">
        <Artwork track={track} size={46} />
        <div className="dock__meta">
          <div className="dock__title" data-testid="track-title">
            {track?.title ?? 'Nothing playing'}
          </div>
          <div className="dock__artist">{track?.artists.join(', ') ?? '—'}</div>
        </div>
        {controllable && (
          <div className="dock__transport">
            <button
              className="iconbtn"
              aria-label="Previous"
              onClick={() => src instanceof DemoPlaybackSource && src.previous()}
            >
              <Icon name="previous" size={14} />
            </button>
            <button
              className="iconbtn iconbtn--primary"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              data-testid="play-toggle"
              onClick={() => (isPlaying ? src.pause() : src.play())}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
            </button>
            <button
              className="iconbtn"
              aria-label="Next"
              onClick={() => src instanceof DemoPlaybackSource && src.next()}
            >
              <Icon name="next" size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="dock__progress">
        <span ref={elapsedRef} className="dock__time tabular">
          0:00
        </span>
        <div
          ref={barRef}
          className={`dock__bar ${controllable ? 'is-seekable' : ''}`}
          role="slider"
          tabIndex={controllable ? 0 : -1}
          aria-label="Song position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration / 1000)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => (scrubbing.current = null)}
        >
          <div className="dock__track" />
          <div ref={fillRef} className="dock__fill" />
        </div>
        <span className="dock__time dock__time--total tabular">{formatTime(duration)}</span>
      </div>
    </EdgePanel>
  );
}
