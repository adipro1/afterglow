import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'node:path';
import { launch, selectScene, shots } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch());
  // These shell tests use the Prelude view, whose current line is easy to assert on.
  await selectScene(page, 'prelude');
});

test.afterAll(async () => {
  await app?.close();
});

test('launches a frameless, secured window', async () => {
  const info = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    // getLastWebPreferences exists at runtime but is missing from Electron's typings.
    const prefs = (
      w.webContents as unknown as { getLastWebPreferences(): Electron.WebPreferences | null }
    ).getLastWebPreferences();
    return {
      title: w.getTitle(),
      contextIsolation: prefs?.contextIsolation,
      nodeIntegration: prefs?.nodeIntegration,
      sandbox: prefs?.sandbox,
    };
  });
  expect(info.title).toBe('AFTERGLOW');
  expect(info.contextIsolation).toBe(true);
  expect(info.nodeIntegration).toBe(false);
  expect(info.sandbox).toBe(true);
  expect(
    await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
  ).toBe('undefined');
  // The preload bridge must load under the sandbox (regression: unbundled deps broke it).
  expect(await page.evaluate(() => typeof window.afterglow?.window.command)).toBe('function');
});

test('custom window controls maximise and restore', async () => {
  const isMax = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized());
  await page.getByRole('button', { name: 'Maximise' }).click();
  await expect.poll(isMax).toBe(true);
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect.poll(isMax).toBe(false);
});

test('shows the shell and the demo track', async () => {
  await expect(page.getByTestId('titlebar')).toBeVisible();
  await expect(page.getByTestId('stage-window')).toBeVisible();
  await expect(page.getByTestId('track-title')).toHaveText('Delivered');
  await expect(page.getByTestId('current-line')).toContainText('Delivered');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, '01-idle-title-card.png') });
});

test('plays and advances lyrics in sync', async () => {
  await page.getByTestId('play-toggle').click();
  // Seek to 30s (6 × 5 s) — just before the first chorus at 31 s.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('current-line')).toContainText('Delivered, but never read', {
    timeout: 4000,
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(shots, '02-chorus-word-sync.png') });

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(shots, '03-chorus-later.png') });
});

test('pauses and resumes', async () => {
  await page.keyboard.press(' ');
  const a = await page.getByTestId('now-playing').locator('.dock__time').first().textContent();
  await page.waitForTimeout(1500);
  const b = await page.getByTestId('now-playing').locator('.dock__time').first().textContent();
  expect(a).toBe(b);
  await page.keyboard.press(' ');
});

test('skips to the next track', async () => {
  await page.keyboard.press('n');
  await expect(page.getByTestId('track-title')).toHaveText('Long Way Round');
  await page.waitForTimeout(5200);
  await page.screenshot({ path: join(shots, '04-second-track.png') });
});

test('survives resizing to the minimum size', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(shots, '05-min-size.png') });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('enters and leaves fullscreen', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
  await page.keyboard.press('f');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen()),
    )
    .toBe(true);
  await expect(page.getByTestId('titlebar')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(shots, '06-fullscreen.png') });
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen()),
    )
    .toBe(false);
});

test('switches scene and variation from the keyboard', async () => {
  await page.keyboard.press('s');
  await expect(page.getByTestId('stage')).toHaveAttribute('data-scene', 'messages');
  const before = await page.getByTestId('stage').getAttribute('data-variation');
  await page.keyboard.press('v');
  await expect(page.getByTestId('stage')).not.toHaveAttribute('data-variation', before!);
  // Only the incoming scene survives the transition — the old one is unmounted.
  await page.waitForTimeout(1300);
  await expect(page.locator('.scene-layer')).toHaveCount(1);
});
