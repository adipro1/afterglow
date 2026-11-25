import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'node:path';
import { freezeAt, launch, shots } from './launch';

/*
 * Phase 4: the director choosing scenes, the lyrics panel, importing lyrics, the timing
 * editor and playing a local audio file. Lyrics and audio here are original test material.
 */

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch());
});
test.afterAll(async () => app?.close());

const shot = (name: string) => page.screenshot({ path: join(shots, `p4-${name}.png`) });
const director = () => page.evaluate(() => window.__afterglowTest!.director());

/** A short original LRC (enhanced on the first two lines) for "Long Way Round". */
const LRC = [
  '[ti:Long Way Round]',
  '[ar:Afterglow Demo Session]',
  '[offset:0]',
  '[00:04.00]<00:04.00>Paper <00:04.60>moon <00:05.20>over <00:05.80>the <00:06.20>runway <00:07.20>',
  '[00:08.00]<00:08.00>Counting <00:08.80>the <00:09.10>lights <00:09.80>below <00:11.00>',
  '[00:12.00]Every mile a little softer',
  '[00:16.20]Every turn a little slow',
  '[00:20.00]',
  '[00:24.00]Hold the map up to the window',
  '[00:28.00]Hold the map up to the window',
].join('\n');

/** A few seconds of quiet sine tone as a WAV file (generated, so nothing licensed is needed). */
function toneWav(seconds = 4, rate = 8000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 800), 44 + i * 2);
  return buf;
}

test.describe('Director', () => {
  test('plans "Delivered" section by section', async () => {
    const d = await director();
    expect(d.mode).toBe('auto');
    expect(d.sections.map((s) => s.kind)).toEqual([
      'intro',
      'verse',
      'chorus',
      'verse',
      'chorus',
      'instrumental',
      'bridge',
      'chorus',
      'outro',
    ]);
    expect(d.cues.map((c) => `${c.sceneId}/${c.variation}`)).toEqual([
      'messages/thread',
      'messages/lockscreen',
      'prelude/window',
      'messages/drift',
    ]);
  });

  const moments: [string, number, string, string][] = [
    ['verse-thread', 21000, 'messages', 'thread'],
    ['chorus2-lockscreen', 76000, 'messages', 'lockscreen'],
    ['bridge-prelude', 101000, 'prelude', 'window'],
    ['chorus3-drift', 119000, 'messages', 'drift'],
  ];
  for (const [name, ms, scene, variation] of moments) {
    test(`shows ${scene} · ${variation} at ${ms} ms`, async () => {
      await freezeAt(page, ms, 1600);
      const stage = page.getByTestId('stage');
      await expect(stage).toHaveAttribute('data-scene', scene);
      await expect(stage).toHaveAttribute('data-variation', variation);
      await shot(`director-${name}`);
    });
  }

  test('status shows the section; A hands control back and forth', async () => {
    await freezeAt(page, 76000);
    await expect(page.getByTestId('status-director')).toHaveText('Auto · Chorus 2');
    await page.keyboard.press('a');
    await expect(page.getByTestId('status-director')).toHaveText('Manual');
    // In manual mode the scene stays put even when the director would change it.
    await freezeAt(page, 101000, 1300);
    await expect(page.getByTestId('stage')).toHaveAttribute('data-scene', 'messages');
    await page.keyboard.press('a');
    await page.waitForTimeout(1300);
    await expect(page.getByTestId('stage')).toHaveAttribute('data-scene', 'prelude');
  });

  test('X skips the current scene for this part of the song', async () => {
    await freezeAt(page, 101000, 1300);
    await page.keyboard.press('x');
    await page.waitForTimeout(1300);
    await expect(page.getByTestId('stage')).toHaveAttribute('data-scene', 'messages');
    expect((await director()).mode).toBe('auto');
  });
});

test.describe('Lyrics panel', () => {
  test('shows the song map and the director plan', async () => {
    await freezeAt(page, 76000);
    await page.keyboard.press('l');
    await expect(page.getByTestId('lyrics-panel')).toHaveClass(/is-open/);
    await expect(page.locator('.song-map__row')).toHaveCount(9);
    await expect(page.locator('.song-map__row.is-now .song-map__kind')).toHaveText('Chorus 2');
    await page.waitForTimeout(700);
    await shot('lyrics-panel');
  });

  test('imports an LRC file for the playing song and saves it', async () => {
    await page.evaluate(() => window.__afterglowTest!.selectTrack(1));
    await freezeAt(page, 9000);
    await page.getByTestId('lyrics-file-input').setInputFiles({
      name: 'long-way-round.lrc',
      mimeType: 'text/plain',
      buffer: Buffer.from(LRC, 'utf8'),
    });
    await expect(page.getByTestId('toast')).toContainText('6 lines');
    const lyrics = await page.evaluate(() => window.__afterglowTest!.lyrics());
    expect(lyrics).toEqual({ origin: 'imported', sync: 'line', lines: 6 });
    await expect(page.locator('.lp-sub')).toContainText('long-way-round.lrc');
    await page.waitForTimeout(500);
    await shot('imported-lrc');
  });

  test('plain text opens the timing editor', async () => {
    const r = await page.evaluate(() =>
      window.__afterglowTest!.importLyrics(
        'notes.txt',
        '[Verse]\nFirst line of the test\nSecond line of the test\n\n(Chorus)\nThird line, louder',
      ),
    );
    expect(r.ok).toBe(true);
    await expect(page.getByTestId('timing-editor')).toBeVisible();
    await expect(page.getByTestId('timed-count')).toHaveText('0 of 3 lines timed');
  });
});

test.describe('Timing editor', () => {
  test('Enter times lines at the playback position; Backspace undoes', async () => {
    await freezeAt(page, 5000, 300);
    await page.keyboard.press('Enter');
    await freezeAt(page, 9000, 300);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('timed-count')).toHaveText('2 of 3 lines timed');
    await expect(page.locator('.te-line').nth(0).locator('.te-time')).toHaveText('00:05.00');
    await expect(page.locator('.te-line').nth(1).locator('.te-time')).toHaveText('00:09.00');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('timed-count')).toHaveText('1 of 3 lines timed');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('timed-count')).toHaveText('2 of 3 lines timed');
    // Live preview: the stage plays the draft.
    expect((await page.evaluate(() => window.__afterglowTest!.lyrics())).origin).toBe('draft');
  });

  test('nudges and offsets', async () => {
    await page.keyboard.press(']');
    await expect(page.locator('.te-line').nth(1).locator('.te-time')).toHaveText('00:09.05');
    await page.getByRole('button', { name: 'Lyrics later' }).click();
    await expect(page.getByTestId('offset')).toHaveText('+0.10 s');
    await expect(page.locator('.te-line').nth(0).locator('.te-time')).toHaveText('00:05.10');
  });

  test('word mode times words', async () => {
    await page.keyboard.press('w');
    await freezeAt(page, 13000, 300);
    await page.keyboard.press('Enter');
    await expect(page.locator('.te-line.is-cursor .te-word.is-timed')).toHaveCount(1);
    await page.waitForTimeout(400);
    await shot('timing-editor');
  });

  test('saves to the library and closes', async () => {
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('toast')).toContainText('Timing saved');
    await page.getByTestId('editor-close').click();
    await expect(page.getByTestId('timing-editor')).toHaveCount(0);
    const lyrics = await page.evaluate(() => window.__afterglowTest!.lyrics());
    expect(lyrics.origin).toBe('imported');
    expect(lyrics.lines).toBe(2); // only timed lines play
  });
});

test.describe('Local audio', () => {
  test('plays a dropped-in audio file as its own source', async () => {
    await page.keyboard.press('l');
    await expect(page.getByTestId('lyrics-panel')).toHaveClass(/is-open/);
    await page.getByTestId('audio-file-input').setInputFiles({
      name: 'Test Tone - Four Seconds.wav',
      mimeType: 'audio/wav',
      buffer: toneWav(),
    });
    await expect(page.getByTestId('track-title')).toHaveText('Four Seconds');
    await expect(page.getByTestId('toast')).toContainText('Playing “Four Seconds”');
    await expect(page.getByTestId('status')).toContainText('Local file');
    await expect
      .poll(() => page.evaluate(() => window.__afterglowTest!.position()), { timeout: 5000 })
      .toBeGreaterThan(300);
    await page.getByRole('button', { name: 'Back to demo songs' }).click();
    await expect(page.getByTestId('status')).toContainText('Demo');
  });
});
