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
  /** Pick a scene as the user would (switches the director to manual). */
  selectScene(sceneId: string, variation?: string): void;
  setDirector(mode: 'auto' | 'manual'): void;
  director(): {
    mode: 'auto' | 'manual';
    sceneId: string;
    variation: string;
    cues: { atMs: number; sceneId: string; variation: string }[];
    sections: { kind: string; startMs: number }[];
  };
  /** Import a lyrics file's text for the current song, as the Lyrics panel does. */
  importLyrics(
    fileName: string,
    text: string,
  ): Promise<{ ok: boolean; message: string; warnings: string[] }>;
  lyrics(): { origin: string | null; sync: string | null; lines: number };
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
