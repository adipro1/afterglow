import { app, BrowserWindow, ipcMain } from 'electron';
import { IpcChannels, WindowCommandSchema, type WindowState } from '@shared/ipc';
import { SettingsStore } from './settings-store';
import { createMainWindow, getWindowState } from './window';

// Tests isolate app data so they never touch the owner's real settings.
const userDataOverride = process.env['AFTERGLOW_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

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

    mainWindow = createMainWindow(settings);
    mainWindow.on('closed', () => (mainWindow = null));

    app.on('before-quit', () => void settings.flush());
  });

  app.on('window-all-closed', () => app.quit());
}
