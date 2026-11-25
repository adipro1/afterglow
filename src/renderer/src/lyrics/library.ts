import type { LyricsDocument } from '@shared/lyrics';
import type { StoredLyrics } from '@shared/ipc';

/**
 * The user's own lyrics, mirrored in memory so looking them up is instant (a song change must
 * know its lyrics in the same moment). Persisted by the main process in the app-data folder.
 * Outside Electron (plain browser preview) it simply lives in memory.
 */

const entries = new Map<string, StoredLyrics>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const bridge = () => (typeof window === 'undefined' ? undefined : window.afterglow);

export const lyricsLibrary = {
  async load(): Promise<void> {
    const b = bridge();
    if (!b) return;
    try {
      for (const e of await b.lyrics.list()) entries.set(e.doc.trackKey, e);
    } catch (err) {
      console.warn('[lyrics] could not load saved lyrics', err);
    }
    notify();
  },

  get(trackKey: string): StoredLyrics | undefined {
    return entries.get(trackKey);
  },

  async save(doc: LyricsDocument, fileName?: string): Promise<void> {
    const entry: StoredLyrics = { doc, savedAt: Date.now(), ...(fileName ? { fileName } : {}) };
    entries.set(doc.trackKey, entry);
    notify();
    await bridge()?.lyrics.save(entry);
  },

  async remove(trackKey: string): Promise<void> {
    entries.delete(trackKey);
    notify();
    await bridge()?.lyrics.remove(trackKey);
  },

  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
