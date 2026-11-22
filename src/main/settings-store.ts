import { app } from 'electron';
import { promises as fs, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SettingsSchema, defaultSettings, type Settings } from '@shared/settings';

/**
 * Small JSON settings store in the user's app-data folder.
 * Reads synchronously once at startup; writes are debounced and atomic (write temp, then rename).
 */
export class SettingsStore {
  private data: Settings;
  private readonly file: string;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(dir = app.getPath('userData')) {
    this.file = join(dir, 'settings.json');
    this.data = this.load();
  }

  get(): Settings {
    return this.data;
  }

  update(patch: Partial<Settings>): void {
    this.data = { ...this.data, ...patch };
    this.scheduleWrite();
  }

  flush(): Promise<void> {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    return this.write();
  }

  private load(): Settings {
    try {
      const parsed = SettingsSchema.safeParse(JSON.parse(readFileSync(this.file, 'utf8')));
      return parsed.success ? parsed.data : { ...defaultSettings };
    } catch {
      return { ...defaultSettings };
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => void this.write(), 400);
  }

  private async write(): Promise<void> {
    const tmp = `${this.file}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      await fs.rename(tmp, this.file);
    } catch (err) {
      console.error('[settings] write failed', err);
    }
  }
}
