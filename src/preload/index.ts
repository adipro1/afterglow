import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IpcChannels,
  StoredLyricsSchema,
  WindowStateSchema,
  type AfterglowBridge,
  type WindowCommand,
  type WindowState,
} from '@shared/ipc';

const bridge: AfterglowBridge = {
  platform: process.platform,
  window: {
    command: (cmd: WindowCommand) => ipcRenderer.send(IpcChannels.windowCommand, cmd),
    getState: async () =>
      WindowStateSchema.parse(await ipcRenderer.invoke(IpcChannels.windowStateRequest)),
    onState: (cb: (state: WindowState) => void) => {
      const listener = (_e: IpcRendererEvent, raw: unknown) => {
        const parsed = WindowStateSchema.safeParse(raw);
        if (parsed.success) cb(parsed.data);
      };
      ipcRenderer.on(IpcChannels.windowState, listener);
      return () => ipcRenderer.removeListener(IpcChannels.windowState, listener);
    },
  },
  lyrics: {
    list: async () => {
      const raw: unknown = await ipcRenderer.invoke(IpcChannels.lyricsList);
      return StoredLyricsSchema.array().parse(raw);
    },
    save: async (entry) => {
      await ipcRenderer.invoke(IpcChannels.lyricsSave, entry);
    },
    remove: async (trackKey) => {
      await ipcRenderer.invoke(IpcChannels.lyricsRemove, trackKey);
    },
    export: async (file) => Boolean(await ipcRenderer.invoke(IpcChannels.lyricsExport, file)),
  },
};

contextBridge.exposeInMainWorld('afterglow', bridge);
