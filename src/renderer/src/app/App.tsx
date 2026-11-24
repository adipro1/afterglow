import { useEffect } from 'react';
import { paletteFor } from '@/design/Artwork';
import { usePlayback } from '@/state/playback';
import { DropTarget } from './DropTarget';
import { LyricsPanel } from './LyricsPanel';
import { NowPlayingDock } from './NowPlayingDock';
import { Stage } from './Stage';
import { StatusCluster } from './StatusCluster';
import { TimingEditor } from './TimingEditor';
import { TitleBar } from './TitleBar';
import { Toast } from './Toast';
import { useIdle, useShortcuts, useWindowState } from './hooks';
import './app.css';

export function App() {
  const win = useWindowState();
  const track = usePlayback((s) => s.track);
  const idle = useIdle(2800, win.isFullScreen);
  useShortcuts(win.isFullScreen);

  // Content tint follows the artwork; the chrome never changes colour.
  useEffect(() => {
    const p = paletteFor(track);
    const root = document.documentElement.style;
    root.setProperty('--tint-1', p.tint1);
    root.setProperty('--tint-2', p.tint2);
  }, [track]);

  const chromeHidden = win.isFullScreen && idle;

  return (
    <div
      className={`app ${win.isFullScreen ? 'is-fullscreen' : ''} ${win.isFocused ? '' : 'is-blurred'} ${chromeHidden ? 'is-idle' : ''}`}
    >
      {!win.isFullScreen && <TitleBar isMaximized={win.isMaximized} hidden={false} />}
      <Stage />
      <NowPlayingDock hidden={chromeHidden} />
      <StatusCluster isFullScreen={win.isFullScreen} hidden={chromeHidden} />
      <LyricsPanel />
      <TimingEditor />
      <Toast />
      <DropTarget />
      <div className="grain" aria-hidden />
    </div>
  );
}
