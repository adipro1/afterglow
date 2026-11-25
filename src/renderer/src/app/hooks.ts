import { useEffect, useState } from 'react';
import type { WindowState } from '@shared/ipc';
import { runtime } from '@/state/playback';
import { isControllable } from '@/playback/types';
import { useDirector } from '@/director/store';
import { editor } from '@/lyrics/editor-store';
import { useScene } from '@/state/scene';
import { useUi } from './ui';

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
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
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
          // Picking yourself hands the stage to you (A gives it back to the director).
          useDirector.getState().setMode('manual');
          useScene.getState().cycleVariation(e.shiftKey ? -1 : 1);
          return;
        case 's':
        case 'S':
          useDirector.getState().setMode('manual');
          useScene.getState().cycleScene(e.shiftKey ? -1 : 1);
          return;
        case 'a':
        case 'A':
          useDirector.getState().toggleMode();
          return;
        case 'x':
        case 'X':
          useDirector.getState().skip(useScene.getState().sceneId);
          return;
        case 'l':
        case 'L':
          useUi.getState().toggleLyricsPanel();
          return;
        case 't':
        case 'T':
          useUi.getState().toggleLyricsPanel(false);
          editor.openForCurrent();
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
          src.next?.();
          break;
        case 'p':
        case 'P':
          src.previous?.();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullScreen]);
}

export { formatTime } from './format';
