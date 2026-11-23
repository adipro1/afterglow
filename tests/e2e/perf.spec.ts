import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, selectScene, shots } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch());
});
test.afterAll(async () => app?.close());

const results: Record<string, unknown> = {};

for (const [scene, variation] of [
  ['messages', 'thread'],
  ['messages', 'lockscreen'],
  ['messages', 'drift'],
  ['prelude', 'window'],
] as const) {
  test(`frame rate while playing: ${scene}/${variation}`, async () => {
    await selectScene(page, scene, variation);
    // Play through a busy stretch (verse into first chorus) and sample ~4 s of frames.
    await page.evaluate(() => {
      window.__afterglowTest!.freezeAt(20_000);
      window.__afterglowTest!.play();
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__afterglowTest!.resetPerf());
    await page.waitForTimeout(4200);
    const stats = await page.evaluate(() => window.__afterglowTest!.perf());
    results[`${scene}/${variation}`] = stats;
    console.log(`${scene}/${variation}`, JSON.stringify(stats));
    // Budget for an ordinary laptop: hold ~60 fps with headroom.
    expect(stats.fps).toBeGreaterThan(50);
    expect(stats.avgScriptMs).toBeLessThan(4);
  });
}

test.afterAll(() => {
  writeFileSync(join(shots, '..', 'perf.json'), JSON.stringify(results, null, 2));
});
