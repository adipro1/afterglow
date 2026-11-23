import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'node:path';
import { freezeAt, launch, selectScene, shots } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch());
  await selectScene(page, 'messages', 'thread');
});
test.afterAll(async () => app?.close());

/** Moments in "Delivered" that exercise every part of the thread. */
const moments: [string, number][] = [
  ['typing-before-first', 5200],
  ['first-message-singing', 8200],
  ['verse-stack', 21000],
  ['composing-chorus', 32400],
  ['chorus-sent-delivered', 36200],
  ['read-and-reply', 53500],
  ['second-voice', 62300],
  ['after-break-separator', 97500],
  ['ending', 143800],
];

test.describe('Messages · Thread', () => {
  for (const [name, ms] of moments) {
    test(`renders ${name} (${ms} ms)`, async () => {
      await freezeAt(page, ms);
      await expect(page.getByTestId('messages-thread')).toBeVisible();
      await page.screenshot({
        path: join(shots, `msg-thread-${String(ms).padStart(6, '0')}-${name}.png`),
      });
    });
  }

  test('typing indicator and status appear before an incoming message', async () => {
    await freezeAt(page, 5200);
    await expect(page.locator('.thread-head__status')).toHaveAttribute('data-typing', '1');
    await expect(page.locator('.bubble--typing')).toBeVisible();
  });

  test('outgoing lines are typed into the compose field as they are sung', async () => {
    await freezeAt(page, 32400);
    await expect(page.locator('.compose__text')).toHaveText(/^Delivered,/);
  });

  test('sent message shows Delivered, then Read once the other side replies', async () => {
    await freezeAt(page, 46000);
    await expect(page.locator('.thread-receipt').last()).toHaveAttribute('data-read', 'false');
    await freezeAt(page, 51500);
    await expect(page.locator('.thread-receipt').last()).toHaveAttribute('data-read', 'true');
  });

  test('seeking backwards rebuilds the conversation exactly', async () => {
    await freezeAt(page, 90000);
    const late = await page.locator('.thread-item--msg').count();
    await freezeAt(page, 12000);
    const early = await page.locator('.thread-item--msg').count();
    expect(early).toBeLessThan(late);
    expect(early).toBe(2);
  });
});

test.describe('Song changes', () => {
  const opening = {
    thread: '.thread-intro__name',
    lockscreen: '.lock-player__title',
    drift: '.drift-title__name',
  } as const;
  for (const [variation, selector] of Object.entries(opening)) {
    test(`${variation}: a new song opens on its own title card, never a blank screen`, async () => {
      await selectScene(page, 'messages', variation);
      await page.evaluate(() => window.__afterglowTest!.selectTrack(1));
      await freezeAt(page, 400, 1400);
      const expected = variation === 'thread' ? 'Afterglow Demo Session' : 'Long Way Round';
      await expect(page.locator(`.scene-layer[data-phase="live"] ${selector}`)).toHaveText(
        expected,
      );
      await expect(page.locator(`.scene-layer[data-phase="live"] ${selector}`)).toBeVisible();
      await page.screenshot({ path: join(shots, `msg-${variation}-new-song.png`) });
      await page.evaluate(() => window.__afterglowTest!.selectTrack(0));
      await page.waitForTimeout(1200);
    });
  }

  test('the old conversation hands over to the new one instead of cutting', async () => {
    await selectScene(page, 'messages', 'thread');
    await freezeAt(page, 30_000);
    await page.evaluate(() => window.__afterglowTest!.selectTrack(1));
    await page.waitForTimeout(150);
    // Mid-transition: the old song's thread (frozen) is still on screen as it leaves.
    await expect(
      page.locator('.scene-layer[data-phase="exit"] .thread-item--msg').first(),
    ).toBeVisible();
    await page.waitForTimeout(1400);
    await expect(page.locator('.scene-layer')).toHaveCount(1);
    await page.evaluate(() => window.__afterglowTest!.selectTrack(0));
    await page.waitForTimeout(1200);
  });
});

for (const variation of ['lockscreen', 'drift'] as const) {
  test.describe(`Messages · ${variation}`, () => {
    test.beforeAll(async () => selectScene(page, 'messages', variation));
    for (const [name, ms] of moments) {
      test(`renders ${name} (${ms} ms)`, async () => {
        await freezeAt(page, ms);
        await expect(page.getByTestId(`messages-${variation}`)).toBeVisible();
        await page.screenshot({
          path: join(shots, `msg-${variation}-${String(ms).padStart(6, '0')}-${name}.png`),
        });
      });
    }
  });
}
