import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import {
  IpcChannels,
  LyricsExportSchema,
  StoredLyricsSchema,
  TrackKeySchema,
  WindowCommandSchema,
  type WindowState,
} from '@shared/ipc';
import { LyricsLibrary } from './lyrics-library';
import { SettingsStore } from './settings-store';
import { createMainWindow, getWindowState } from './window';

// Tests isolate app data so they never touch the owner's real settings.
const userDataOverride = process.env['AFTERGLOW_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

// Never let Windows/Chromium demote the renderer to a low-priority "background" process when
// the window loses focus — the visualisation keeps playing and must stay smooth.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.afterglow.app');
    const settings = new SettingsStore();

    ipcMain.on(IpcChannels.windowCommand, (event, raw: unknown) => {
      const cmd = WindowCommandSchema.safeParse(raw);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!cmd.success || !win) return;
      switch (cmd.data) {
        case 'minimize':
          win.minimize();
          break;
        case 'toggle-maximize':
          if (win.isMaximized()) win.unmaximize();
          else win.maximize();
          break;
        case 'toggle-fullscreen':
          win.setFullScreen(!win.isFullScreen());
          break;
        case 'close':
          win.close();
          break;
      }
    });

    ipcMain.handle(IpcChannels.windowStateRequest, (event): WindowState | null => {
      const win = BrowserWindow.fromWebContents(event.sender);
      return win ? getWindowState(win) : null;
    });

    const library = new LyricsLibrary();
    ipcMain.handle(IpcChannels.lyricsList, () => library.list());
    ipcMain.handle(IpcChannels.lyricsSave, (_e, raw: unknown) => {
      const entry = StoredLyricsSchema.safeParse(raw);
      if (!entry.success) throw new Error('Those lyrics could not be saved (invalid data).');
      return library.save(entry.data);
    });
    ipcMain.handle(IpcChannels.lyricsRemove, (_e, raw: unknown) => {
      const key = TrackKeySchema.safeParse(raw);
      if (key.success) return library.remove(key.data);
    });
    ipcMain.handle(IpcChannels.lyricsExport, async (event, raw: unknown) => {
      const file = LyricsExportSchema.safeParse(raw);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!file.success || !win) return false;
      // Only a name is suggested; the user picks the folder in the system dialog.
      const name = [...file.data.fileName]
        .map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch))
        .join('')
        .slice(0, 200);
      const result = await dialog.showSaveDialog(win, {
        title: 'Export lyrics',
        defaultPath: name.endsWith('.lrc') ? name : `${name}.lrc`,
        filters: [{ name: 'LRC lyrics', extensions: ['lrc'] }],
      });
      if (result.canceled || !result.filePath) return false;
      await fs.writeFile(result.filePath, file.data.text, 'utf8');
      return true;
    });

    mainWindow = createMainWindow(settings);
    mainWindow.on('closed', () => (mainWindow = null));

    app.on('before-quit', () => void settings.flush());
  });

  app.on('window-all-closed', () => app.quit());
}
