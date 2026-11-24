import { describe, expect, it } from 'vitest';
import {
  LocalFilePlaybackSource,
  trackFromFile,
  type MediaLike,
} from '@/playback/local-file-source';
import type { PlaybackSnapshot } from '@/playback/types';

/** A stand-in for <audio>: we drive its events by hand. */
class FakeMedia implements MediaLike {
  src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  private handlers = new Map<string, Set<() => void>>();
  play() {
    this.paused = false;
    this.emit('play');
  }
  pause() {
    this.paused = true;
    this.emit('pause');
  }
  load() {}
  removeAttribute() {
    this.src = '';
  }
  addEventListener(t: string, fn: () => void) {
    if (!this.handlers.has(t)) this.handlers.set(t, new Set());
    this.handlers.get(t)!.add(fn);
  }
  removeEventListener(t: string, fn: () => void) {
    this.handlers.get(t)?.delete(fn);
  }
  emit(t: string) {
    for (const fn of this.handlers.get(t) ?? []) fn();
  }
  listenerCount() {
    return [...this.handlers.values()].reduce((n, s) => n + s.size, 0);
  }
}

function setup(files = [{ name: 'Band - Song.mp3', size: 100, url: 'blob:1' }]) {
  const media = new FakeMedia();
  const revoked: string[] = [];
  const src = new LocalFilePlaybackSource(files, {
    createMedia: () => media,
    revoke: (u) => revoked.push(u),
    now: () => 1000,
    reportIntervalMs: 1e9,
  });
  return { media, src, revoked };
}

describe('local audio files', () => {
  it('names tracks from "Artist - Title" file names, with stable keys', () => {
    const t = trackFromFile({ name: 'Some Band - Night_Drive.flac', size: 5 }, 180_000);
    expect(t).toMatchObject({ title: 'Night Drive', artists: ['Some Band'], durationMs: 180_000 });
    expect(trackFromFile({ name: 'demo.wav', size: 5 }, 1000)).toMatchObject({
      title: 'demo',
      artists: ['Local file'],
    });
    expect(t.key).toBe(trackFromFile({ name: 'Some Band - Night_Drive.flac', size: 5 }, 1).key);
    expect(t.key).not.toBe(trackFromFile({ name: 'Some Band - Night_Drive.flac', size: 6 }, 1).key);
  });

  it('becomes ready when the file is decoded, and reports exact positions', async () => {
    const { media, src } = setup();
    const seen: PlaybackSnapshot[] = [];
    src.subscribe((s) => seen.push(s));
    expect(seen).toHaveLength(0); // nothing to report before metadata
    media.duration = 200;
    media.emit('loadedmetadata');
    await src.ready;
    expect(src.track).toMatchObject({ title: 'Song', durationMs: 200_000 });
    src.play();
    media.currentTime = 12.5;
    src.seek(30_000);
    const last = seen.at(-1)!;
    expect(last).toMatchObject({ isPlaying: true, positionMs: 30_000, exact: true });
    src.seek(1e9);
    expect(seen.at(-1)!.positionMs).toBe(200_000);
  });

  it('rejects when the file cannot be played', async () => {
    const { media, src } = setup([{ name: 'broken.mp3', size: 1, url: 'blob:x' }]);
    media.emit('error');
    await expect(src.ready).rejects.toThrow(/can't be played/);
  });

  it('moves through a queue and cleans up after itself', () => {
    const { media, src, revoked } = setup([
      { name: 'a.mp3', size: 1, url: 'blob:a' },
      { name: 'b.mp3', size: 2, url: 'blob:b' },
    ]);
    media.duration = 10;
    media.emit('loadedmetadata');
    src.next();
    expect(media.src).toBe('blob:b');
    media.emit('loadedmetadata');
    expect(src.track!.title).toBe('b');
    src.dispose();
    expect(revoked).toEqual(['blob:a', 'blob:b']);
    expect(media.listenerCount()).toBe(0);
  });
});
