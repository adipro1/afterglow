import type { VisualizationMeta } from '../types';

export const preludeMeta: VisualizationMeta = {
  id: 'prelude',
  name: 'Prelude',
  description: 'A single floating window of pure typography. The calm baseline.',
  category: 'typographic',
  variations: [
    { id: 'window', name: 'Window', description: 'Lyrics in one floating, edge-lit window.' },
  ],
  themes: ['isolation', 'reflection'],
};
