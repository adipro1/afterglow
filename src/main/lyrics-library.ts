import { app } from 'electron';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { StoredLyricsSchema, type StoredLyrics } from '@shared/ipc';

/**
 * The user's own lyrics (imported files and timing-editor work), one JSON file per song in the
 * app-data folder. File names are a hash of the track key, so nothing the renderer sends can
 * choose a path. Everything is validated on the way in and on the way out.
 */
export class LyricsLibrary {
  private readonly dir: string;

  constructor(base = app.getPath('userData')) {
    this.dir = join(base, 'lyrics');
  }

  private fileFor(trackKey: string): string {
    return join(
      this.dir,
      `${createHash('sha256').update(trackKey).digest('hex').slice(0, 32)}.json`,
    );
  }

  async list(): Promise<StoredLyrics[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const out: StoredLyrics[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const parsed = StoredLyricsSchema.safeParse(
          JSON.parse(await fs.readFile(join(this.dir, name), 'utf8')),
        );
        if (parsed.success) out.push(parsed.data);
        else console.warn('[lyrics] skipped an unreadable entry');
      } catch {
        console.warn('[lyrics] skipped an unreadable entry');
      }
    }
    return out;
  }

  async save(entry: StoredLyrics): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.fileFor(entry.doc.trackKey);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry), 'utf8');
    await fs.rename(tmp, file);
  }

  async remove(trackKey: string): Promise<void> {
    await fs.rm(this.fileFor(trackKey), { force: true });
  }
}
