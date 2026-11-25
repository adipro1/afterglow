import { z } from 'zod';
import { LyricsDocumentSchema } from './lyrics';

/** Every IPC channel name lives here so main, preload and renderer can't drift apart. */
export const IpcChannels = {
  windowCommand: 'window:command',
  windowState: 'window:state',
  windowStateRequest: 'window:state-request',
  lyricsList: 'lyrics:list',
  lyricsSave: 'lyrics:save',
  lyricsRemove: 'lyrics:remove',
  lyricsExport: 'lyrics:export',
} as const;

export const WindowCommandSchema = z.enum([
  'minimize',
  'toggle-maximize',
  'close',
  'toggle-fullscreen',
]);
export type WindowCommand = z.infer<typeof WindowCommandSchema>;

export const WindowStateSchema = z.object({
  isMaximized: z.boolean(),
  isFullScreen: z.boolean(),
  isFocused: z.boolean(),
});
export type WindowState = z.infer<typeof WindowStateSchema>;

/** Lyrics the user imported or timed, kept in their app-data folder (never in the repo). */
export const StoredLyricsSchema = z.object({
  doc: LyricsDocumentSchema.extend({
    trackKey: z.string().min(1).max(512),
    lines: LyricsDocumentSchema.shape.lines.max(5000),
  }),
  savedAt: z.number(),
  /** The file it came from, for display ("my-song.lrc"). Name only — never a path. */
  fileName: z.string().max(260).optional(),
});
export type StoredLyrics = z.infer<typeof StoredLyricsSchema>;

export const TrackKeySchema = z.string().min(1).max(512);

export const LyricsExportSchema = z.object({
  fileName: z.string().min(1).max(260),
  text: z.string().max(2_000_000),
});
export type LyricsExport = z.infer<typeof LyricsExportSchema>;

/** The narrow API the preload script exposes to the renderer as `window.afterglow`. */
export interface AfterglowBridge {
  platform: string;
  window: {
    command(cmd: WindowCommand): void;
    getState(): Promise<WindowState>;
    onState(cb: (state: WindowState) => void): () => void;
  };
  lyrics: {
    list(): Promise<StoredLyrics[]>;
    save(entry: StoredLyrics): Promise<void>;
    remove(trackKey: string): Promise<void>;
    /** Asks the user where to save; resolves false if they cancel. */
    export(file: LyricsExport): Promise<boolean>;
  };
}
