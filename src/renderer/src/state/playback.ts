import { create } from 'zustand';
import type { LyricsDocument, TrackRef } from '@shared/lyrics';
import { PlaybackClock } from '@/playback/clock';
import { ticker } from '@/engine/ticker';
import { DemoPlaybackSource } from '@/playback/demo-source';
import type { PlaybackSource, PlaybackSourceKind } from '@/playback/types';
import { demoSongs } from '@/demo/songs';

/**
 * Low-frequency playback state for React (track, play state, lyrics).
 * Per-frame song position is NOT in here — read it from `runtime.clock` inside the ticker,
 * so the UI tree doesn't re-render 60 times a second.
 */
interface PlaybackState {
  sourceKind: PlaybackSourceKind;
  track: TrackRef | null;
  isPlaying: boolean;
  lyrics: LyricsDocument | null;
  /** Increments on every seek/track change so views can skip transitions. */
  discontinuity: number;
}

export const usePlayback = create<PlaybackState>(() => ({
  sourceKind: 'demo',
  track: null,
  isPlaying: false,
  lyrics: null,
  discontinuity: 0,
}));

const demoLyrics = new Map(demoSongs.map((s) => [s.track.key, s.lyrics]));

function lyricsFor(track: TrackRef | null): LyricsDocument | null {
  // Phase 4 replaces this with the lyrics-provider registry.
  return track ? (demoLyrics.get(track.key) ?? null) : null;
}

class PlaybackRuntime {
  readonly clock = new PlaybackClock();
  source: PlaybackSource;
  private unsub: (() => void) | null = null;

  constructor(source: PlaybackSource) {
    this.source = source;
    this.clock.on((e) => {
      if (e.type === 'track') {
        usePlayback.setState((s) => ({
          track: e.track,
          lyrics: lyricsFor(e.track),
          discontinuity: s.discontinuity + 1,
        }));
      } else if (e.type === 'seek') {
        usePlayback.setState((s) => ({ discontinuity: s.discontinuity + 1 }));
      } else {
        usePlayback.setState({ isPlaying: e.isPlaying });
      }
    });
    this.attach();
  }

  private attach() {
    usePlayback.setState({ sourceKind: this.source.kind });
    this.unsub = this.source.subscribe((snap) => {
      this.clock.ingest(snap, performance.now());
      if (usePlayback.getState().isPlaying !== snap.isPlaying) {
        usePlayback.setState({ isPlaying: snap.isPlaying });
      }
    });
  }

  setSource(source: PlaybackSource) {
    this.unsub?.();
    this.source.dispose();
    this.clock.reset();
    this.source = source;
    this.attach();
  }

  /** Song position at `now` — by default the current frame's timestamp (see `ticker.now`). */
  position(now = ticker.now()): number {
    return this.clock.read(now).positionMs;
  }
}

export const runtime = new PlaybackRuntime(
  new DemoPlaybackSource(
    demoSongs.map((s) => s.track),
    // Report like a polled external player (1 s cadence, ±120 ms error) so the
    // smoothing path is exercised in development, not just in tests.
    { reportIntervalMs: 1000, jitterMs: 120 },
  ),
);
