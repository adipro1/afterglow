/** Frame bursts around key moments, for reviewing motion as contact sheets (test-results/motion). */
import { test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, selectScene, shots } from './launch';

let app: ElectronApplication;
let page: Page;
test.beforeAll(async () => {
  ({ app, page } = await launch());
});
test.afterAll(async () => app?.close());

const bursts: [string, string, number, number, number][] = [
  // variation, name, start ms, step, count
  ['thread', 'incoming-morph', 10090, 40, 12],
  ['thread', 'send', 37700, 45, 12],
  ['thread', 'tapback', 29830, 40, 12],
  ['lockscreen', 'arrival-buzz', 10120, 30, 12],
  ['drift', 'send', 37700, 60, 12],
  ['drift', 'incoming', 14500, 60, 12],
];

for (const [v, name, start, step, count] of bursts) {
  test(`burst ${v} ${name}`, async () => {
    test.setTimeout(120_000);
    await selectScene(page, 'messages', v);
    const dir = join(shots, '..', 'motion', `${v}-${name}`);
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < count; i++) {
      const t = start + i * step;
      await page.evaluate((ms) => window.__afterglowTest!.freezeAt(ms), t);
      await page.waitForTimeout(i === 0 ? 900 : 120);
      await page.screenshot({ path: join(dir, `${String(i).padStart(2, '0')}-${t}.png`) });
    }
  });
}
