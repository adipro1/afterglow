import { runtime, usePlayback, createDemoSource } from '@/state/playback';
import { LocalFilePlaybackSource } from '@/playback/local-file-source';
import { editor, useEditor } from './editor-store';
import { MAX_LYRICS_BYTES, parseLyricsFile, toLyricsDocument } from './formats';
import { lyricsLibrary } from './library';

/**
 * Bringing the user's own files in: lyrics files (attached to the song that's playing) and
 * audio files (played by AFTERGLOW itself). Files are read in the renderer from what the user
 * picked or dropped — no disk paths are involved — and lyrics are saved to their app-data folder.
 */

export interface ImportResult {
  ok: boolean;
  message: string;
  warnings: string[];
}

const LYRIC_EXT = /\.(lrc|elrc|srt|vtt|txt)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|webm)$/i;

export const isLyricsFile = (f: { name: string }) => LYRIC_EXT.test(f.name);
export const isAudioFile = (f: { name: string; type?: string }) =>
  AUDIO_EXT.test(f.name) || (f.type ?? '').startsWith('audio/');

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export async function importLyricsText(fileName: string, text: string): Promise<ImportResult> {
  const track = usePlayback.getState().track;
  if (!track)
    return { ok: false, message: 'Play a song first, then add its lyrics.', warnings: [] };
  if (text.length > MAX_LYRICS_BYTES) {
    return { ok: false, message: `"${fileName}" is too large to be a lyrics file.`, warnings: [] };
  }
  const parsed = parseLyricsFile(fileName, text, track.key);
  if (parsed.sync === 'none') {
    if (!parsed.untimed.length) {
      return { ok: false, message: `No lyrics found in "${fileName}".`, warnings: parsed.warnings };
    }
    editor.openWith({ lines: parsed.untimed }, fileName);
    return {
      ok: true,
      message: `${plural(parsed.untimed.length, 'line')} without timing — tap along to time them.`,
      warnings: parsed.warnings,
    };
  }
  const doc = toLyricsDocument(parsed, track.key, { provider: 'imported', attribution: fileName });
  await lyricsLibrary.save(doc, fileName);
  const sync = parsed.sync === 'word' ? 'word-synced' : 'line-synced';
  return {
    ok: true,
    message: `${plural(doc.lines.length, 'line')}, ${sync}, for “${track.title}”.`,
    warnings: parsed.warnings,
  };
}

export async function importLyricsFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_LYRICS_BYTES) {
    return { ok: false, message: `"${file.name}" is too large to be a lyrics file.`, warnings: [] };
  }
  return importLyricsText(file.name, await file.text());
}

/** Play the user's own audio files (in the order given). */
export async function openAudioFiles(files: readonly File[]): Promise<ImportResult> {
  const audio = files.filter(isAudioFile);
  if (!audio.length) return { ok: false, message: 'No audio files there.', warnings: [] };
  const src = new LocalFilePlaybackSource(
    audio.map((f) => ({ name: f.name, size: f.size, url: URL.createObjectURL(f) })),
  );
  try {
    await src.ready;
  } catch (err) {
    src.dispose();
    return { ok: false, message: (err as Error).message, warnings: [] };
  }
  if (useEditor.getState().open) editor.close();
  runtime.setSource(src);
  src.play();
  const track = src.track!;
  const own = lyricsLibrary.get(track.key);
  return {
    ok: true,
    message: own
      ? `Playing “${track.title}” with your saved lyrics.`
      : `Playing “${track.title}”. Add its lyrics: drop an .lrc file or press L.`,
    warnings: [],
  };
}

export function backToDemo(): void {
  if (runtime.source.kind === 'demo') return;
  if (useEditor.getState().open) editor.close();
  runtime.setSource(createDemoSource());
}

/** Files dropped on the window: audio plays, lyrics attach to the song. */
export async function importDropped(files: readonly File[]): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const audio = files.filter(isAudioFile);
  if (audio.length) results.push(await openAudioFiles(audio));
  const lyric = files.filter(isLyricsFile);
  if (lyric.length) results.push(await importLyricsFile(lyric[0]!));
  if (!audio.length && !lyric.length) {
    results.push({
      ok: false,
      message: 'Drop an audio file, or a lyrics file (.lrc, .srt or .txt).',
      warnings: [],
    });
  }
  return results;
}
