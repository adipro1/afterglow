import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { IpcChannels, type WindowState } from '@shared/ipc';
import type { WindowBounds } from '@shared/settings';
import type { SettingsStore } from './settings-store';

const DEFAULT_SIZE = { width: 1440, height: 900 };
const INK_0 = '#040306';

/** Only restore saved bounds if they still land on a connected display. */
function visibleBounds(saved: WindowBounds | undefined) {
  if (!saved) return undefined;
  const fits = screen.getAllDisplays().some(({ workArea: a }) => {
    return (
      saved.x + 80 < a.x + a.width &&
      saved.x + saved.width - 80 > a.x &&
      saved.y >= a.y - 8 &&
      saved.y + 40 < a.y + a.height
    );
  });
  return fits ? saved : undefined;
}

export function getWindowState(win: BrowserWindow): WindowState {
  return {
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
    isFocused: win.isFocused(),
  };
}

export function createMainWindow(settings: SettingsStore): BrowserWindow {
  const saved = visibleBounds(settings.get().window);

  const win = new BrowserWindow({
    ...(saved
      ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
      : DEFAULT_SIZE),
    minWidth: 960,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: INK_0,
    title: 'AFTERGLOW',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  if (saved?.maximized) win.maximize();

  win.once('ready-to-show', () => win.show());

  // Never let the renderer navigate away or open arbitrary windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  const sendState = () => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.windowState, getWindowState(win));
  };
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('enter-full-screen', sendState);
  win.on('leave-full-screen', sendState);
  win.on('focus', sendState);
  win.on('blur', sendState);

  const persistBounds = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const b = win.getNormalBounds();
    settings.update({ window: { ...b, maximized: win.isMaximized() } });
  };
  win.on('resized', persistBounds);
  win.on('moved', persistBounds);
  win.on('maximize', persistBounds);
  win.on('unmaximize', persistBounds);
  win.on('close', persistBounds);

  // Test runs get a renderer-side hook for deterministic screenshots (never in normal use).
  const query: Record<string, string> = process.env['AFTERGLOW_TEST'] === '1' ? { test: '1' } : {};
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) void win.loadURL(`${devUrl}${query['test'] ? '?test=1' : ''}`);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { query });

  return win;
}
