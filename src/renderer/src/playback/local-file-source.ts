import type { TrackRef } from '@shared/lyrics';
import type { ControllablePlaybackSource, PlaybackSnapshot, Unsubscribe } from './types';

/** The parts of an <audio> element this source uses (so tests can pass a fake). */
export interface MediaLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  removeAttribute?(name: string): void;
  load?(): void;
}

export interface LocalAudioFile {
  name: string;
  size: number;
  /** A blob: URL for the file's bytes (the renderer never sees a disk path). */
  url: string;
}

export interface LocalFileOptions {
  createMedia?: () => MediaLike;
  revoke?: (url: string) => void;
  reportIntervalMs?: number;
  now?: () => number;
}

/** Small, stable hash for track keys (FNV-1a). */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** "Artist - Title.mp3" → { title, artists }. Anything else → the file name as the title. */
export function trackFromFile(
  file: Pick<LocalAudioFile, 'name' | 'size'>,
  durationMs: number,
): TrackRef {
  const base = file.name
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/_/g, ' ')
    .trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
  return {
    key: `local:${fnv(`${file.name}|${file.size}`)}`,
    title: (m ? m[2]! : base) || 'Untitled',
    artists: m ? [m[1]!] : ['Local file'],
    durationMs: Math.max(1, Math.round(durationMs)),
  };
}

/**
 * Plays audio files the user opened (or dropped) — so imported lyrics can be checked and timed
 * against the real song. Reports like any other source; the clock smooths the reports.
 */
export class LocalFilePlaybackSource implements ControllablePlaybackSource {
  readonly kind = 'local-file' as const;
  /** Resolves once the first file is ready to play (rejects if it can't be decoded). */
  readonly ready: Promise<void>;
  private readonly media: MediaLike;
  private readonly listeners = new Set<(s: PlaybackSnapshot) => void>();
  private readonly tracks: (TrackRef | null)[];
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly interval: number;
  private readonly now: () => number;
  private readonly revoke: (url: string) => void;
  private readonly off: (() => void)[] = [];
  private resolveReady!: () => void;
  private rejectReady!: (e: Error) => void;
  private settled = false;

  constructor(
    private readonly files: readonly LocalAudioFile[],
    opts: LocalFileOptions = {},
  ) {
    if (!files.length) throw new Error('LocalFilePlaybackSource needs at least one file');
    this.media = (opts.createMedia ?? (() => new Audio() as MediaLike))();
    this.revoke = opts.revoke ?? ((url) => URL.revokeObjectURL(url));
    this.interval = opts.reportIntervalMs ?? 250;
    this.now = opts.now ?? (() => performance.now());
    this.tracks = files.map(() => null);
    this.ready = new Promise((res, rej) => {
      this.resolveReady = res;
      this.rejectReady = rej;
    });
    // Don't leave an unobserved rejection lying around if nobody awaits `ready`.
    this.ready.catch(() => undefined);

    const on = (type: string, fn: () => void) => {
      this.media.addEventListener(type, fn);
      this.off.push(() => this.media.removeEventListener(type, fn));
    };
    on('loadedmetadata', () => {
      const f = this.files[this.index]!;
      const d = this.media.duration;
      this.tracks[this.index] = trackFromFile(f, Number.isFinite(d) && d > 0 ? d * 1000 : 1);
      if (!this.settled) {
        this.settled = true;
        this.resolveReady();
      }
      this.publish(true);
    });
    on('error', () => {
      if (!this.settled) {
        this.settled = true;
        this.rejectReady(new Error(`"${this.files[this.index]!.name}" can't be played.`));
      }
    });
    on('play', () => this.publish(true));
    on('pause', () => this.publish(true));
    on('seeked', () => this.publish(true));
    on('ended', () => {
      if (this.index < this.files.length - 1) {
        this.select(this.index + 1);
        void this.media.play();
      } else this.publish(true);
    });
    this.load(0);
  }

  get track(): TrackRef | null {
    return this.tracks[this.index] ?? null;
  }

  subscribe(cb: (s: PlaybackSnapshot) => void): Unsubscribe {
    this.listeners.add(cb);
    if (this.track) cb(this.snapshot(true));
    if (!this.timer) this.timer = setInterval(() => this.publish(false), this.interval);
    return () => {
      this.listeners.delete(cb);
      if (!this.listeners.size) this.stopTimer();
    };
  }

  play(): void {
    void Promise.resolve(this.media.play()).catch(() => undefined);
  }

  pause(): void {
    this.media.pause();
  }

  seek(ms: number): void {
    const max = this.track?.durationMs ?? 0;
    this.media.currentTime = Math.max(0, Math.min(ms, max)) / 1000;
    this.publish(true);
  }

  next(): void {
    if (this.files.length > 1) this.select((this.index + 1) % this.files.length);
  }

  previous(): void {
    if (this.media.currentTime > 3) this.seek(0);
    else if (this.files.length > 1)
      this.select((this.index - 1 + this.files.length) % this.files.length);
    else this.seek(0);
  }

  select(index: number): void {
    const wasPlaying = !this.media.paused;
    this.load(Math.max(0, Math.min(index, this.files.length - 1)));
    if (wasPlaying) this.play();
  }

  dispose(): void {
    this.stopTimer();
    this.listeners.clear();
    this.media.pause();
    for (const off of this.off) off();
    this.media.removeAttribute?.('src');
    this.media.load?.();
    for (const f of this.files) this.revoke(f.url);
  }

  private load(index: number) {
    this.index = index;
    this.media.src = this.files[index]!.url;
    this.media.load?.();
  }

  private snapshot(exact: boolean): PlaybackSnapshot {
    return {
      track: this.track,
      isPlaying: !this.media.paused,
      positionMs: this.media.currentTime * 1000,
      sampledAt: this.now(),
      exact,
    };
  }

  private publish(exact: boolean) {
    if (!this.track) return;
    const s = this.snapshot(exact);
    for (const l of this.listeners) l(s);
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
