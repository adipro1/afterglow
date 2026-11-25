import { Icon } from '@/design/Icon';
import { useDirector } from '@/director/store';
import { usePlayback } from '@/state/playback';
import { windowCommand } from './hooks';
import { useUi } from './ui';

const sourceLabel = { demo: 'Demo', 'local-file': 'Local file', spotify: 'Spotify' } as const;
const syncLabel = { word: 'Word-synced', line: 'Line-synced', none: 'Unsynced' } as const;

export function StatusCluster({
  isFullScreen,
  hidden,
}: {
  isFullScreen: boolean;
  hidden: boolean;
}) {
  const sourceKind = usePlayback((s) => s.sourceKind);
  const sync = usePlayback((s) => s.lyrics?.sync);
  const origin = usePlayback((s) => s.lyricsOrigin);
  const mode = useDirector((s) => s.mode);
  const section = useDirector((s) =>
    s.sectionIndex >= 0 ? s.interpretation?.sections[s.sectionIndex] : undefined,
  );
  const sectionName = section
    ? section.kind.charAt(0).toUpperCase() +
      section.kind.slice(1) +
      (section.occurrence ? ` ${section.occurrence + 1}` : '')
    : null;

  return (
    <div className={`status ${hidden ? 'is-hidden' : ''}`} data-testid="status">
      <dl className="status__list">
        <div>
          <dt className="caps">Source</dt>
          <dd>{sourceLabel[sourceKind]}</dd>
        </div>
        <div>
          <dt className="caps">Lyrics</dt>
          <dd>
            <button
              className="status__link"
              onClick={() => useUi.getState().toggleLyricsPanel()}
              data-testid="status-lyrics"
            >
              {sync ? syncLabel[sync] : 'None'}
              {origin === 'imported' ? ' · yours' : origin === 'draft' ? ' · editing' : ''}
            </button>
          </dd>
        </div>
        <div>
          <dt className="caps">Director</dt>
          <dd>
            <button
              className="status__link"
              onClick={() => useDirector.getState().toggleMode()}
              data-testid="status-director"
              title="A: director on/off"
            >
              {mode === 'auto' ? `Auto${sectionName ? ` · ${sectionName}` : ''}` : 'Manual'}
            </button>
          </dd>
        </div>
      </dl>
      <button
        className="iconbtn"
        aria-label={isFullScreen ? 'Exit fullscreen' : 'Fullscreen'}
        onClick={() => windowCommand('toggle-fullscreen')}
      >
        <Icon name={isFullScreen ? 'exitFullscreen' : 'fullscreen'} />
      </button>
    </div>
  );
}
