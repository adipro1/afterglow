import { useRef, useState, type ChangeEvent } from 'react';
import type { SectionPlan } from '@shared/interpretation';
import { EdgePanel } from '@/design/EdgePanel';
import { Icon } from '@/design/Icon';
import { useDirector } from '@/director/store';
import { editor } from '@/lyrics/editor-store';
import { backToDemo, importLyricsFile, openAudioFiles, type ImportResult } from '@/lyrics/importer';
import { toLrc } from '@/lyrics/formats';
import { lyricsLibrary } from '@/lyrics/library';
import { runtime, usePlayback } from '@/state/playback';
import { findEntry } from '@/visualizations/registry';
import { formatTime } from './format';
import { toast } from './toast-store';
import { useUi } from './ui';
import './panels.css';

const syncLabel = { word: 'Word-synced', line: 'Line-synced', none: 'Not timed' } as const;

const kindLabel = (s: SectionPlan) =>
  s.kind === 'pre-chorus'
    ? 'Pre-chorus'
    : s.kind.charAt(0).toUpperCase() +
      s.kind.slice(1) +
      (s.occurrence ? ` ${s.occurrence + 1}` : '');

function sceneName(sceneId: string, variation: string): string {
  const meta = findEntry(sceneId)?.meta;
  if (!meta) return sceneId;
  const v = meta.variations.find((x) => x.id === variation);
  return meta.variations.length > 1 && v ? `${meta.name} · ${v.name}` : meta.name;
}

/** Report an import to the user: one line, plus any warnings as detail. */
export function report(r: ImportResult): void {
  toast(
    r.message,
    r.ok ? (r.warnings.length ? 'warning' : 'success') : 'error',
    r.warnings.join(' ') || null,
  );
}

export function LyricsPanel() {
  const open = useUi((s) => s.lyricsPanel);
  const track = usePlayback((s) => s.track);
  const lyrics = usePlayback((s) => s.lyrics);
  const origin = usePlayback((s) => s.lyricsOrigin);
  const fileName = usePlayback((s) => s.lyricsFileName);
  const sourceKind = usePlayback((s) => s.sourceKind);
  const interp = useDirector((s) => s.interpretation);
  const plan = useDirector((s) => s.plan);
  const sectionIndex = useDirector((s) => s.sectionIndex);
  const mode = useDirector((s) => s.mode);
  const lyricInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onLyricFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    report(await importLyricsFile(file));
    setBusy(false);
  };
  const onAudioFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    report(await openAudioFiles(files));
    setBusy(false);
  };
  const exportLrc = async () => {
    if (!lyrics || !track) return;
    const text = toLrc(lyrics, {
      title: track.title,
      artist: track.artists.join(', '),
      album: track.album,
      lengthMs: track.durationMs,
    });
    const saved = await window.afterglow?.lyrics.export({
      fileName: `${track.artists[0] ?? 'Lyrics'} - ${track.title}.lrc`,
      text,
    });
    if (saved) toast('Lyrics exported.', 'success');
  };

  const cueFor = (i: number) => plan?.cues.find((c) => c.sections.includes(i));

  return (
    <EdgePanel
      className={`side-panel lyrics-panel ${open ? 'is-open' : ''}`}
      intensity="quiet"
      radius={14}
      data-testid="lyrics-panel"
    >
      <div className="side-panel__head">
        <span className="caps">Lyrics</span>
        <button
          className="iconbtn"
          aria-label="Close lyrics panel"
          onClick={() => useUi.getState().toggleLyricsPanel(false)}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="side-panel__scroll">
        <section className="lp-block">
          <div className="lp-track">{track?.title ?? 'Nothing playing'}</div>
          <div className="lp-sub">
            {origin === 'imported'
              ? `Your lyrics${fileName ? ` · ${fileName}` : ''}`
              : origin === 'demo'
                ? 'Demo lyrics'
                : origin === 'draft'
                  ? 'Being timed'
                  : 'No lyrics for this song yet'}
            {lyrics && lyrics.lines.length > 0 && (
              <>
                {' · '}
                <span data-testid="lyrics-sync">{syncLabel[lyrics.sync]}</span> ·{' '}
                {lyrics.lines.length} lines
              </>
            )}
          </div>
          <div className="lp-actions">
            <button
              className="btn"
              disabled={!track || busy}
              onClick={() => lyricInput.current?.click()}
              data-testid="import-lyrics"
            >
              <Icon name="lyrics" size={14} /> Import lyrics…
            </button>
            <button
              className="btn"
              disabled={!track}
              onClick={() => {
                useUi.getState().toggleLyricsPanel(false);
                editor.openForCurrent();
              }}
              data-testid="open-editor"
            >
              <Icon name="tap" size={14} /> {lyrics?.lines.length ? 'Adjust timing' : 'Time lyrics'}
            </button>
            {lyrics && lyrics.lines.length > 0 && window.afterglow && (
              <button className="btn btn--quiet" onClick={() => void exportLrc()}>
                Export .lrc
              </button>
            )}
            {origin === 'imported' && track && (
              <button
                className="btn btn--quiet"
                onClick={() =>
                  void lyricsLibrary
                    .remove(track.key)
                    .then(() => toast('Your lyrics for this song were removed.'))
                }
              >
                Remove mine
              </button>
            )}
          </div>
          <p className="lp-hint">
            .lrc, .srt or plain text. Your lyrics stay on this computer. Plain text opens the timing
            editor so you can tap along.
          </p>
        </section>

        <section className="lp-block">
          <div className="caps lp-label">Audio</div>
          <div className="lp-actions">
            <button
              className="btn"
              disabled={busy}
              onClick={() => audioInput.current?.click()}
              data-testid="open-audio"
            >
              <Icon name="note" size={14} /> Open audio file…
            </button>
            {sourceKind !== 'demo' && (
              <button className="btn btn--quiet" onClick={backToDemo}>
                Back to demo songs
              </button>
            )}
          </div>
          <p className="lp-hint">Or drop files anywhere on the window.</p>
        </section>

        {interp && (
          <section className="lp-block">
            <div className="lp-row-head">
              <span className="caps lp-label">Song map</span>
              <div className="seg" role="group" aria-label="Director">
                <button
                  className={mode === 'auto' ? 'is-on' : ''}
                  onClick={() => useDirector.getState().setMode('auto')}
                  data-testid="director-auto"
                >
                  Auto
                </button>
                <button
                  className={mode === 'manual' ? 'is-on' : ''}
                  onClick={() => useDirector.getState().setMode('manual')}
                >
                  Manual
                </button>
              </div>
            </div>
            <ol className="song-map" data-testid="song-map-list">
              {interp.sections.map((s) => {
                const cue = cueFor(s.index);
                const starts = cue && cue.sections[0] === s.index;
                return (
                  <li
                    key={s.index}
                    className={`song-map__row ${s.index === sectionIndex ? 'is-now' : ''}`}
                    data-kind={s.kind}
                    onClick={() => {
                      const src = runtime.source;
                      if ('seek' in src && typeof src.seek === 'function') src.seek(s.startMs);
                    }}
                  >
                    <span className="song-map__time tabular">{formatTime(s.startMs)}</span>
                    <span className="song-map__kind">{kindLabel(s)}</span>
                    <span className="song-map__what">
                      {s.themes
                        .slice(0, 2)
                        .map((t) => t.id)
                        .join(', ') || '—'}
                      <em> · {s.mood.label}</em>
                    </span>
                    <span className="song-map__scene">
                      {starts && cue ? sceneName(cue.sceneId, cue.variation) : ''}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="lp-hint">
              <b>S</b> / <b>V</b> pick a scene yourself · <b>A</b> director on/off · <b>X</b> skip
              this scene here
            </p>
          </section>
        )}
      </div>

      <input
        ref={lyricInput}
        type="file"
        hidden
        accept=".lrc,.elrc,.srt,.vtt,.txt,text/plain"
        onChange={(e) => void onLyricFile(e)}
        data-testid="lyrics-file-input"
      />
      <input
        ref={audioInput}
        type="file"
        hidden
        multiple
        accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus"
        onChange={(e) => void onAudioFiles(e)}
        data-testid="audio-file-input"
      />
    </EdgePanel>
  );
}
