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
}

export function isControllable(s: PlaybackSource): s is ControllablePlaybackSource {
  return typeof (s as ControllablePlaybackSource).play === 'function';
}
