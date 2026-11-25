import { create } from 'zustand';
import type { LyricsDocument, TrackRef } from '@shared/lyrics';
import { PlaybackClock } from '@/playback/clock';
import { ticker } from '@/engine/ticker';
import { DemoPlaybackSource } from '@/playback/demo-source';
import type { PlaybackSource, PlaybackSourceKind } from '@/playback/types';
import { demoSongs } from '@/demo/songs';
import { lyricsLibrary } from '@/lyrics/library';

/** Where the lyrics on screen came from. */
export type LyricsOrigin = 'demo' | 'imported' | 'draft';

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
  lyricsOrigin: LyricsOrigin | null;
  /** Name of the file imported lyrics came from, if known. */
  lyricsFileName: string | null;
  /** Increments on every seek/track change so views can skip transitions. */
  discontinuity: number;
}

export const usePlayback = create<PlaybackState>(() => ({
  sourceKind: 'demo',
  track: null,
  isPlaying: false,
  lyrics: null,
  lyricsOrigin: null,
  lyricsFileName: null,
  discontinuity: 0,
}));

const demoLyrics = new Map(demoSongs.map((s) => [s.track.key, s.lyrics]));

/** Lyrics being edited in the timing editor: shown live instead of the saved ones. */
let draft: LyricsDocument | null = null;

/**
 * The lyrics providers, in priority order: the timing editor's draft, then the user's own
 * imported lyrics, then the built-in demo lyrics. All lookups are synchronous (the library is
 * mirrored in memory), so a song change and its lyrics always arrive together.
 */
function lyricsFor(
  track: TrackRef | null,
): Pick<PlaybackState, 'lyrics' | 'lyricsOrigin' | 'lyricsFileName'> {
  const none = { lyrics: null, lyricsOrigin: null, lyricsFileName: null };
  if (!track) return none;
  if (draft && draft.trackKey === track.key) {
    return { lyrics: draft, lyricsOrigin: 'draft', lyricsFileName: null };
  }
  const own = lyricsLibrary.get(track.key);
  if (own) {
    return { lyrics: own.doc, lyricsOrigin: 'imported', lyricsFileName: own.fileName ?? null };
  }
  const demo = demoLyrics.get(track.key);
  return demo ? { lyrics: demo, lyricsOrigin: 'demo', lyricsFileName: null } : none;
}

function refreshLyrics() {
  const s = usePlayback.getState();
  const next = lyricsFor(s.track);
  if (next.lyrics !== s.lyrics || next.lyricsOrigin !== s.lyricsOrigin) usePlayback.setState(next);
}

/** Show `doc` live while it is being edited (null: back to the saved lyrics). */
export function setDraftLyrics(doc: LyricsDocument | null): void {
  draft = doc;
  refreshLyrics();
}

lyricsLibrary.subscribe(refreshLyrics);
void lyricsLibrary.load();

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
          ...lyricsFor(e.track),
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

/**
 * The demo player. Reports like a polled external player (1 s cadence, ±120 ms error) so the
 * smoothing path is exercised in development, not just in tests.
 */
export function createDemoSource(): DemoPlaybackSource {
  return new DemoPlaybackSource(
    demoSongs.map((s) => s.track),
    { reportIntervalMs: 1000, jitterMs: 120 },
  );
}

export const runtime = new PlaybackRuntime(createDemoSource());
