import { z } from 'zod';

/** A single timed word (or grapheme cluster group) inside a line. Times are song-relative ms. */
export const LyricWordSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});
export type LyricWord = z.infer<typeof LyricWordSchema>;

export const LyricLineSchema = z.object({
  id: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string(),
  /** Present only when the source has word-level timing. */
  words: z.array(LyricWordSchema).optional(),
  /** Optional vocalist id, e.g. 'lead', 'feat', 'bg'. */
  singer: z.string().optional(),
});
export type LyricLine = z.infer<typeof LyricLineSchema>;

export const LyricsSyncLevelSchema = z.enum(['word', 'line', 'none']);
export type LyricsSyncLevel = z.infer<typeof LyricsSyncLevelSchema>;

export const LyricsDocumentSchema = z.object({
  trackKey: z.string(),
  sync: LyricsSyncLevelSchema,
  language: z.string().optional(),
  lines: z.array(LyricLineSchema),
  source: z.object({ provider: z.string(), attribution: z.string().optional() }),
});
export type LyricsDocument = z.infer<typeof LyricsDocumentSchema>;

export const TrackRefSchema = z.object({
  key: z.string(),
  title: z.string(),
  artists: z.array(z.string()),
  album: z.string().optional(),
  durationMs: z.number().positive(),
  artworkUrl: z.string().optional(),
  externalUrl: z.string().optional(),
});
export type TrackRef = z.infer<typeof TrackRefSchema>;
