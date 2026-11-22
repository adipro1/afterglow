import { Icon } from '@/design/Icon';
import { windowCommand } from './hooks';

export function TitleBar({ isMaximized, hidden }: { isMaximized: boolean; hidden: boolean }) {
  return (
    <header className={`titlebar ${hidden ? 'is-hidden' : ''}`} data-testid="titlebar">
      <div className="titlebar__brand">
        <span className="titlebar__glint" aria-hidden />
        <span className="caps">Afterglow</span>
      </div>
      <div className="titlebar__controls">
        <button className="winbtn" aria-label="Minimise" onClick={() => windowCommand('minimize')}>
          <Icon name="minimize" />
        </button>
        <button
          className="winbtn"
          aria-label={isMaximized ? 'Restore' : 'Maximise'}
          onClick={() => windowCommand('toggle-maximize')}
        >
          <Icon name={isMaximized ? 'restore' : 'maximize'} />
        </button>
        <button
          className="winbtn winbtn--close"
          aria-label="Close"
          onClick={() => windowCommand('close')}
        >
          <Icon name="close" />
        </button>
      </div>
    </header>
  );
}
