import '../../src/shared/test-hooks';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const root = resolve(__dirname, '../..');
export const shots = join(root, 'test-results', 'screens');

export async function launch(size = { width: 1440, height: 900 }) {
  mkdirSync(shots, { recursive: true });
  const app: ElectronApplication = await electron.launch({
    args: [root],
    cwd: root,
    env: {
      ...process.env,
      AFTERGLOW_TEST: '1',
      // Fresh, throwaway app-data so tests never read or write the owner's settings.
      AFTERGLOW_USER_DATA: mkdtempSync(join(tmpdir(), 'afterglow-e2e-')),
    },
  });
  const page: Page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !!window.__afterglowTest);
  // Never as large as the screen: Windows trims oversized windows at unpredictable moments,
  // which would make screenshots inconsistent. Clamped once, so a run is consistent throughout.
  await app.evaluate(({ BrowserWindow, screen }, s) => {
    const area = screen.getPrimaryDisplay().workAreaSize;
    const win = BrowserWindow.getAllWindows()[0];
    // A margin too: Windows also adjusts windows that exactly fill the screen.
    win?.setSize(Math.min(s.width, area.width - 40), Math.min(s.height, area.height - 40));
    win?.center();
  }, size);
  return { app, page };
}

/** Freeze the app at an exact song time and let layout settle. */
export async function freezeAt(page: Page, ms: number, settle = 900) {
  await page.evaluate((t) => window.__afterglowTest!.freezeAt(t), ms);
  await page.waitForTimeout(settle);
}

export async function selectScene(page: Page, id: string, variation?: string) {
  await page.evaluate(([i, v]) => window.__afterglowTest!.selectScene(i!, v), [id, variation]);
  await page.waitForTimeout(1300); // scene transition
}
