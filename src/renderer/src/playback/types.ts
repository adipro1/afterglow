import type { TrackRef } from '@shared/lyrics';

/**
 * What a playback source reports. `sampledAt` is the local monotonic time
 * (performance.now) at which `positionMs` was true. Sources that receive
 * server timestamps must convert them before emitting.
 */
export interface PlaybackSnapshot {
  track: TrackRef | null;
  isPlaying: boolean;
  positionMs: number;
  sampledAt: number;
  /**
   * True when the position is known exactly — e.g. it comes straight from a user action
   * (seek, play, pause, track change) on a source we control. The clock snaps to exact reports
   * instead of averaging them with earlier, noisier ones.
   */
  exact?: boolean;
}

export type Unsubscribe = () => void;

export type PlaybackSourceKind = 'demo' | 'local-file' | 'spotify';

export interface PlaybackSource {
  readonly kind: PlaybackSourceKind;
  subscribe(cb: (snapshot: PlaybackSnapshot) => void): Unsubscribe;
  dispose(): void;
}

/** Sources that AFTERGLOW itself controls (demo and local files). Spotify is read-only. */
export interface ControllablePlaybackSource extends PlaybackSource {
  play(): void;
  pause(): void;
  seek(ms: number): void;
  /** Sources with a queue (demo songs, several opened files). */
  next?(): void;
  previous?(): void;
}

export function isControllable(s: PlaybackSource): s is ControllablePlaybackSource {
  return typeof (s as ControllablePlaybackSource).play === 'function';
}
