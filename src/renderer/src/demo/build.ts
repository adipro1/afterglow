import type { LyricLine, LyricsDocument, TrackRef } from '@shared/lyrics';
import { distributeWords } from '@/lyrics/words';

export { distributeWords };

/** [startSeconds, durationSeconds, text, singer?] — compact authoring format for demo songs. */
export type DemoLine = readonly [number, number, string, string?];

export interface DemoSong {
  track: TrackRef;
  lyrics: LyricsDocument;
}

export function buildDemoSong(
  meta: Omit<TrackRef, 'durationMs'> & { durationSec: number },
  lines: readonly DemoLine[],
): DemoSong {
  const { durationSec, ...rest } = meta;
  const track: TrackRef = { ...rest, durationMs: durationSec * 1000 };
  const built: LyricLine[] = lines.map(([start, dur, text, singer], i) => {
    const startMs = Math.round(start * 1000);
    const endMs = Math.round((start + dur) * 1000);
    return {
      id: `${meta.key}-${i}`,
      startMs,
      endMs,
      text,
      words: distributeWords(text, startMs, endMs),
      ...(singer ? { singer } : {}),
    };
  });
  return {
    track,
    lyrics: {
      trackKey: meta.key,
      sync: 'word',
      language: 'en',
      lines: built,
      source: { provider: 'demo', attribution: 'Original demo lyrics written for AFTERGLOW' },
    },
  };
}
