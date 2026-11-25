import { create } from 'zustand';
import type { LyricsDocument } from '@shared/lyrics';
import { runtime, setDraftLyrics, usePlayback } from '@/state/playback';
import { toLrc } from './formats';
import { lyricsLibrary } from './library';
import {
  clearLine,
  clearWord,
  draftFromDocument,
  draftFromText,
  draftToDocument,
  endLine,
  lineAt,
  setOffset,
  shiftLine,
  stampLine,
  stampWord,
  timedCount,
  type Draft,
} from './timing';

export type TapMode = 'lines' | 'words';

interface EditorState {
  open: boolean;
  draft: Draft | null;
  /** Next line (and word, in word mode) a tap will time. */
  cursor: { line: number; word: number };
  /** The line nudges apply to — the last one tapped or clicked. */
  selected: number;
  mode: TapMode;
  dirty: boolean;
  /** File name the lyrics came from (kept when saving). */
  fileName: string | null;
  past: Draft[];
  future: Draft[];
}

const HISTORY = 200;

export const useEditor = create<EditorState>(() => ({
  open: false,
  draft: null,
  cursor: { line: 0, word: 0 },
  selected: -1,
  mode: 'lines',
  dirty: false,
  fileName: null,
  past: [],
  future: [],
}));

const durationMs = () => usePlayback.getState().track?.durationMs ?? Infinity;

/** Show the draft live on the stage, exactly as it would play. */
function preview(d: Draft | null) {
  setDraftLyrics(d ? draftToDocument(d, durationMs()) : null);
}

function commit(next: Draft, patch: Partial<EditorState> = {}) {
  const s = useEditor.getState();
  if (!s.draft || next === s.draft) {
    if (Object.keys(patch).length) useEditor.setState(patch);
    return;
  }
  useEditor.setState({
    draft: next,
    past: [...s.past.slice(-HISTORY + 1), s.draft],
    future: [],
    dirty: true,
    ...patch,
  });
  preview(next);
}

/**
 * Song time to stamp. Callers pass the key event's own timestamp (`runtime.position(e.timeStamp)`)
 * so a tap counts when the key went down, not when the next frame happened to run.
 */
const now = () => runtime.position(performance.now());

export const editor = {
  /** Open the editor on existing lyrics (to adjust them) or on untimed text (to time it). */
  openWith(source: { doc: LyricsDocument } | { lines: string[] }, fileName: string | null = null) {
    const track = usePlayback.getState().track;
    if (!track) return;
    const draft =
      'doc' in source
        ? { ...draftFromDocument(source.doc), trackKey: track.key }
        : draftFromText(track.key, source.lines, {
            provider: 'imported',
            ...(fileName ? { attribution: fileName } : {}),
          });
    const firstUntimed = draft.lines.findIndex((l) => l.startMs === null);
    useEditor.setState({
      open: true,
      draft,
      cursor: { line: firstUntimed < 0 ? 0 : firstUntimed, word: 0 },
      selected: -1,
      mode: 'lines',
      dirty: 'lines' in source,
      fileName,
      past: [],
      future: [],
    });
    preview(draft);
  },

  /** Open on whatever the current song has (or an empty draft if nothing). */
  openForCurrent() {
    const { lyrics, lyricsFileName } = usePlayback.getState();
    if (lyrics && lyrics.lines.length) editor.openWith({ doc: lyrics }, lyricsFileName);
    else editor.openWith({ lines: [] });
  },

  close() {
    useEditor.setState({ open: false, draft: null, past: [], future: [], dirty: false });
    preview(null);
  },

  /** Enter: time the next line (or word). */
  tap(t = now()) {
    const { draft, cursor, mode } = useEditor.getState();
    if (!draft) return;
    const line = draft.lines[cursor.line];
    if (!line) return;
    // Taps are stored without the offset (the offset is applied on top, on playback/export).
    t -= draft.offsetMs;
    if (mode === 'lines' || line.words.length === 0) {
      commit(stampLine(draft, cursor.line, t), {
        selected: cursor.line,
        cursor: { line: Math.min(cursor.line + 1, draft.lines.length), word: 0 },
      });
      return;
    }
    const next =
      cursor.word + 1 < line.words.length
        ? { line: cursor.line, word: cursor.word + 1 }
        : { line: Math.min(cursor.line + 1, draft.lines.length), word: 0 };
    commit(stampWord(draft, cursor.line, cursor.word, t), { selected: cursor.line, cursor: next });
  },

  /** Shift+Enter: the line being sung has ended (a silence follows). */
  endTap(t = now()) {
    const { draft } = useEditor.getState();
    if (!draft) return;
    const i = lineAt(draft, t);
    if (i >= 0) commit(endLine(draft, i, t - draft.offsetMs), { selected: i });
  },

  /** Backspace: step back and clear the last tap. */
  back() {
    const { draft, cursor, mode } = useEditor.getState();
    if (!draft) return;
    if (mode === 'words' && cursor.word > 0) {
      const word = cursor.word - 1;
      commit(clearWord(draft, cursor.line, word), { cursor: { line: cursor.line, word } });
      return;
    }
    const line = Math.max(0, cursor.line - 1);
    if (mode === 'words') {
      const last = Math.max(0, (draft.lines[line]?.words.length ?? 1) - 1);
      commit(clearWord(draft, line, last), { cursor: { line, word: last }, selected: line });
    } else {
      commit(clearLine(draft, line), { cursor: { line, word: 0 }, selected: line });
    }
  },

  /** Move the tap cursor without timing anything. */
  move(delta: number) {
    const { draft, cursor } = useEditor.getState();
    if (!draft) return;
    const line = Math.max(0, Math.min(draft.lines.length - 1, cursor.line + delta));
    useEditor.setState({ cursor: { line, word: 0 }, selected: line });
  },

  /** Click a line: select it, aim the cursor at it, and hear it from just before. */
  select(i: number) {
    const { draft } = useEditor.getState();
    const line = draft?.lines[i];
    if (!draft || !line) return;
    useEditor.setState({ selected: i, cursor: { line: i, word: 0 } });
    if (line.startMs !== null) {
      const src = runtime.source;
      if ('seek' in src && typeof src.seek === 'function') {
        src.seek(Math.max(0, line.startMs + draft.offsetMs - 2000));
      }
    }
  },

  /** [ / ]: nudge the selected line. */
  nudge(deltaMs: number) {
    const { draft, selected } = useEditor.getState();
    if (!draft || selected < 0) return;
    commit(shiftLine(draft, selected, deltaMs));
  },

  setOffset(ms: number) {
    const { draft } = useEditor.getState();
    if (draft) commit(setOffset(draft, ms));
  },

  toggleMode() {
    const s = useEditor.getState();
    useEditor.setState({
      mode: s.mode === 'lines' ? 'words' : 'lines',
      cursor: { line: s.cursor.line, word: 0 },
    });
  },

  undo() {
    const s = useEditor.getState();
    const prev = s.past.at(-1);
    if (!prev || !s.draft) return;
    useEditor.setState({
      draft: prev,
      past: s.past.slice(0, -1),
      future: [s.draft, ...s.future],
      dirty: true,
    });
    preview(prev);
  },

  redo() {
    const s = useEditor.getState();
    const next = s.future[0];
    if (!next || !s.draft) return;
    useEditor.setState({
      draft: next,
      past: [...s.past, s.draft],
      future: s.future.slice(1),
      dirty: true,
    });
    preview(next);
  },

  /** Save to the user's library: these lyrics now play for this song. */
  async save(): Promise<boolean> {
    const { draft, fileName } = useEditor.getState();
    if (!draft || timedCount(draft) === 0) return false;
    const doc = draftToDocument(draft, durationMs());
    await lyricsLibrary.save(
      { ...doc, source: { provider: 'imported', ...(fileName ? { attribution: fileName } : {}) } },
      fileName ?? undefined,
    );
    useEditor.setState({ dirty: false });
    return true;
  },

  /** The draft as LRC text (enhanced LRC when every word is timed). */
  lrc(): string | null {
    const { draft } = useEditor.getState();
    const track = usePlayback.getState().track;
    if (!draft || timedCount(draft) === 0) return null;
    return toLrc(draftToDocument(draft, durationMs()), {
      title: track?.title,
      artist: track?.artists.join(', '),
      album: track?.album,
      lengthMs: track?.durationMs,
    });
  },
};
