import { Icon } from '@/design/Icon';
import { usePlayback } from '@/state/playback';
import { windowCommand } from './hooks';

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

  return (
    <div className={`status ${hidden ? 'is-hidden' : ''}`} data-testid="status">
      <dl className="status__list">
        <div>
          <dt className="caps">Source</dt>
          <dd>{sourceLabel[sourceKind]}</dd>
        </div>
        <div>
          <dt className="caps">Lyrics</dt>
          <dd>{sync ? syncLabel[sync] : 'None'}</dd>
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
