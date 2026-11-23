import { useEffect, useState } from 'react';
import type { WindowState } from '@shared/ipc';
import { runtime } from '@/state/playback';
import { isControllable } from '@/playback/types';
import { DemoPlaybackSource } from '@/playback/demo-source';
import { useScene } from '@/state/scene';

const initialWindowState: WindowState = {
  isMaximized: false,
  isFullScreen: false,
  isFocused: true,
};

/** Native window state (maximised / fullscreen / focus), pushed from the main process. */
export function useWindowState(): WindowState {
  const [state, setState] = useState(initialWindowState);
  useEffect(() => {
    const bridge = window.afterglow;
    if (!bridge) return;
    void bridge.window.getState().then(setState);
    return bridge.window.onState(setState);
  }, []);
  return state;
}

export const windowCommand = (
  cmd: Parameters<NonNullable<Window['afterglow']>['window']['command']>[0],
) => window.afterglow?.window.command(cmd);

/** True after `ms` without pointer movement. Used to fade chrome away in fullscreen. */
export function useIdle(ms: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer);
      setIdle(false);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [ms, enabled]);
  return enabled && idle;
}

/** Global keyboard shortcuts. */
export function useShortcuts(isFullScreen: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const src = runtime.source;
      switch (e.key) {
        case 'F11':
        case 'f':
        case 'F':
          e.preventDefault();
          windowCommand('toggle-fullscreen');
          return;
        case 'Escape':
          if (isFullScreen) windowCommand('toggle-fullscreen');
          return;
        case 'v':
        case 'V':
          useScene.getState().cycleVariation(e.shiftKey ? -1 : 1);
          return;
        case 's':
        case 'S':
          useScene.getState().cycleScene(e.shiftKey ? -1 : 1);
          return;
      }
      if (!isControllable(src)) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (runtime.clock.read(performance.now()).isPlaying) src.pause();
          else src.play();
          break;
        case 'ArrowLeft':
          src.seek(runtime.position() - 5000);
          break;
        case 'ArrowRight':
          src.seek(runtime.position() + 5000);
          break;
        case 'n':
        case 'N':
          if (src instanceof DemoPlaybackSource) src.next();
          break;
        case 'p':
        case 'P':
          if (src instanceof DemoPlaybackSource) src.previous();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullScreen]);
}

export { formatTime } from './format';
