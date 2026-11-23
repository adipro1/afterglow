import type { VisualizationEntry } from './types';
import { messagesMeta } from './messages/meta';
import { preludeMeta } from './prelude/meta';

/**
 * Every visualisation is listed here with its metadata. Scene code is lazily imported, so only
 * the active visualisation (and one incoming during a transition) is ever loaded.
 */
export const registry: readonly VisualizationEntry[] = [
  { meta: messagesMeta, load: () => import('./messages').then((m) => m.default) },
  { meta: preludeMeta, load: () => import('./prelude').then((m) => m.default) },
];

export function findEntry(id: string): VisualizationEntry | undefined {
  return registry.find((e) => e.meta.id === id);
}
