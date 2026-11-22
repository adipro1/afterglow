import type { AfterglowBridge } from '../shared/ipc';

declare global {
  interface Window {
    /** Undefined when the renderer runs outside Electron (e.g. plain browser preview). */
    afterglow?: AfterglowBridge;
  }
}

export {};
