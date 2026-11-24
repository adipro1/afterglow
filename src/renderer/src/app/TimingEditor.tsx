import { useEffect, useRef, useState } from 'react';
import { EdgePanel } from '@/design/EdgePanel';
import { Icon } from '@/design/Icon';
import { useTicker } from '@/engine/ticker';
import { editor, useEditor } from '@/lyrics/editor-store';
import { lineAt, timedCount, wordsTimed } from '@/lyrics/timing';
import { runtime, usePlayback } from '@/state/playback';
import { toast } from './toast-store';
import { useUi } from './ui';
import './panels.css';

function stamp(ms: number | null): string {
  if (ms === null) return '--:--.--';
  const t = Math.max(0, Math.round(ms / 10));
  const m = Math.floor(t / 6000);
  const s = Math.floor(t / 100) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`;
}

/**
 * The timing editor: play the song and tap Enter as each line (or word) begins. The stage
 * behind shows the result live. Keys are listed in the footer; everything can be undone.
 */
export function TimingEditor() {
  const open = useEditor((s) => s.open);
  const draft = useEditor((s) => s.draft);
  const cursor = useEditor((s) => s.cursor);
  const selected = useEditor((s) => s.selected);
  const mode = useEditor((s) => s.mode);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const track = usePlayback((s) => s.track);
  const [playing, setPlaying] = useState(-1);
  const playingRef = useRef(-1);
  const listRef = useRef<HTMLOListElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Which line is being sung right now (changes a few times per line, not every frame).
  useTicker(() => {
    const d = useEditor.getState().draft;
    const i = d ? lineAt(d, runtime.position()) : -1;
    if (i !== playingRef.current) {
      playingRef.current = i;
      setPlaying(i);
    }
  }, open);

  // The editor takes the Lyrics panel's place.
  useEffect(() => {
    if (open) useUi.getState().toggleLyricsPanel(false);
  }, [open]);

  // Keep the next line to tap in view.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor.line}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [cursor.line, open]);

  const save = async () => {
    if (await editor.save())
      toast('Timing saved. These lyrics now play with this song.', 'success');
    else toast('Tap at least one line before saving.', 'warning');
  };

  const exportLrc = async () => {
    const text = editor.lrc();
    if (!text || !track) return toast('Tap at least one line before exporting.', 'warning');
    const saved = await window.afterglow?.lyrics.export({
      fileName: `${track.artists[0] ?? 'Lyrics'} - ${track.title}.lrc`,
      text,
    });
    if (saved) toast('Lyrics exported.', 'success');
  };

  const close = () => {
    if (useEditor.getState().dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    setConfirmClose(false);
    editor.close();
  };

  // Editor keys win over the app's shortcuts while it's open (capture phase).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const at = runtime.position(e.timeStamp);
      const ctrl = e.ctrlKey || e.metaKey;
      let handled = true;
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (ctrl && (e.key === 'y' || e.key === 'Y')) editor.redo();
      else if (ctrl && (e.key === 's' || e.key === 'S')) void save();
      else if (ctrl || e.altKey) handled = false;
      else if (e.key === 'Enter' && !e.repeat) {
        if (e.shiftKey) editor.endTap(at);
        else editor.tap(at);
      } else if (e.key === 'Backspace') editor.back();
      else if (e.key === 'ArrowUp') editor.move(-1);
      else if (e.key === 'ArrowDown') editor.move(1);
      else if (e.key === '[') editor.nudge(e.shiftKey ? -250 : -50);
      else if (e.key === ']') editor.nudge(e.shiftKey ? 250 : 50);
      else if (e.key === '{') editor.nudge(-250);
      else if (e.key === '}') editor.nudge(250);
      else if (e.key === 'w' || e.key === 'W') editor.toggleMode();
      else if (e.key === 'Escape') close();
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  if (!open || !draft) return null;
  const timed = timedCount(draft);

  return (
    <EdgePanel
      className="side-panel timing-editor is-open"
      intensity="quiet"
      radius={14}
      data-testid="timing-editor"
    >
      <div className="side-panel__head">
        <span className="caps">Timing</span>
        <span className="te-title">{track?.title}</span>
        <div className="seg" role="group" aria-label="Tap mode">
          <button
            className={mode === 'lines' ? 'is-on' : ''}
            onClick={() => mode !== 'lines' && editor.toggleMode()}
          >
            Lines
          </button>
          <button
            className={mode === 'words' ? 'is-on' : ''}
            onClick={() => mode !== 'words' && editor.toggleMode()}
            data-testid="mode-words"
          >
            Words
          </button>
        </div>
      </div>
      <div className="te-status">
        <span data-testid="timed-count">
          {timed} of {draft.lines.length} lines timed
        </span>
        <span className={dirty ? 'te-dirty' : 'te-saved'}>{dirty ? 'Unsaved' : 'Saved'}</span>
      </div>

      {draft.lines.length === 0 ? (
        <p className="te-empty">
          No lyrics to time yet. Import a plain-text (.txt) file of the words from the Lyrics panel
          (<b>L</b>), then come back here.
        </p>
      ) : (
        <ol className="te-lines" ref={listRef} data-testid="timing-lines">
          {draft.lines.map((l, i) => {
            const isCursor = i === cursor.line;
            return (
              <li
                key={i}
                data-index={i}
                className={[
                  'te-line',
                  isCursor ? 'is-cursor' : '',
                  i === selected ? 'is-selected' : '',
                  i === playing ? 'is-playing' : '',
                  l.startMs === null ? 'is-untimed' : '',
                ].join(' ')}
                onClick={() => editor.select(i)}
              >
                <span className="te-time tabular">
                  {stamp(l.startMs === null ? null : l.startMs + draft.offsetMs)}
                </span>
                <span className="te-text">
                  {mode === 'words' && (isCursor || wordsTimed(l))
                    ? l.words.map((w, wi) => (
                        <span
                          key={wi}
                          className={`te-word ${w.startMs !== null ? 'is-timed' : ''} ${isCursor && wi === cursor.word ? 'is-next' : ''}`}
                        >
                          {w.text}{' '}
                        </span>
                      ))
                    : l.text}
                </span>
                {l.endMs !== null && (
                  <span className="te-end" title="Ends with a silence">
                    ⏎
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="te-offset">
        <span className="caps">Offset</span>
        <button
          className="iconbtn"
          aria-label="Lyrics earlier"
          onClick={() => editor.setOffset(draft.offsetMs - 100)}
        >
          −
        </button>
        <span className="tabular" data-testid="offset">
          {(draft.offsetMs >= 0 ? '+' : '') + (draft.offsetMs / 1000).toFixed(2)} s
        </span>
        <button
          className="iconbtn"
          aria-label="Lyrics later"
          onClick={() => editor.setOffset(draft.offsetMs + 100)}
        >
          +
        </button>
        <span className="te-offset__hint">moves every line</span>
      </div>

      <div className="te-keys">
        <span>
          <kbd>Enter</kbd> tap {mode === 'words' ? 'word' : 'line'}
        </span>
        <span>
          <kbd>⇧ Enter</kbd> line ends
        </span>
        <span>
          <kbd>⌫</kbd> back
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> move
        </span>
        <span>
          <kbd>[</kbd>
          <kbd>]</kbd> nudge
        </span>
        <span>
          <kbd>W</kbd> words
        </span>
        <span>
          <kbd>Space</kbd> play
        </span>
        <span>
          <kbd>Ctrl Z</kbd> undo
        </span>
      </div>

      <div className="te-foot">
        {confirmClose ? (
          <>
            <span className="te-confirm">Unsaved changes.</span>
            <button
              className="btn btn--primary"
              onClick={() => void save().then(() => editor.close())}
            >
              Save &amp; close
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => {
                setConfirmClose(false);
                editor.close();
              }}
            >
              Discard
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn--primary"
              onClick={() => void save()}
              disabled={!timed}
              data-testid="editor-save"
            >
              <Icon name="tap" size={14} /> Save
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => void exportLrc()}
              disabled={!timed || !window.afterglow}
            >
              Export .lrc
            </button>
            <button className="btn btn--quiet" onClick={() => editor.undo()} disabled={!canUndo}>
              Undo
            </button>
            <span className="te-spacer" />
            <button className="btn btn--quiet" onClick={close} data-testid="editor-close">
              Close
            </button>
          </>
        )}
      </div>
    </EdgePanel>
  );
}
