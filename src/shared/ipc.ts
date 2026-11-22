import { z } from 'zod';

/** Every IPC channel name lives here so main, preload and renderer can't drift apart. */
export const IpcChannels = {
  windowCommand: 'window:command',
  windowState: 'window:state',
  windowStateRequest: 'window:state-request',
} as const;

export const WindowCommandSchema = z.enum([
  'minimize',
  'toggle-maximize',
  'close',
  'toggle-fullscreen',
]);
export type WindowCommand = z.infer<typeof WindowCommandSchema>;

export const WindowStateSchema = z.object({
  isMaximized: z.boolean(),
  isFullScreen: z.boolean(),
  isFocused: z.boolean(),
});
export type WindowState = z.infer<typeof WindowStateSchema>;

/** The narrow API the preload script exposes to the renderer as `window.afterglow`. */
export interface AfterglowBridge {
  platform: string;
  window: {
    command(cmd: WindowCommand): void;
    getState(): Promise<WindowState>;
    onState(cb: (state: WindowState) => void): () => void;
  };
}
