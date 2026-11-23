/**
 * Renderer hooks available only when the app is launched by the test harness (`?test=1`).
 * Declared in shared so both the renderer and the Playwright tests are typed against it.
 */
export interface AfterglowTestHooks {
  /** Jump to an exact song time and hold there (paused), with ambient motion frozen. */
  freezeAt(ms: number): void;
  play(): void;
  pause(): void;
  selectTrack(index: number): void;
  selectScene(sceneId: string, variation?: string): void;
  /** Song position, optionally at a given performance.now() timestamp. */
  position(at?: number): number;
  resetPerf(): void;
  perf(): { fps: number; p95FrameMs: number; avgScriptMs: number; frames: number };
}

declare global {
  interface Window {
    __afterglowTest?: AfterglowTestHooks;
  }
}
