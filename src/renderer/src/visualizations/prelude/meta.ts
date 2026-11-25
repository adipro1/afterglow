import type { VisualizationMeta } from '../types';

export const preludeMeta: VisualizationMeta = {
  id: 'prelude',
  name: 'Prelude',
  description: 'A single floating window of pure typography. The calm baseline.',
  category: 'typographic',
  variations: [
    { id: 'window', name: 'Window', description: 'Lyrics in one floating, edge-lit window.' },
  ],
  themes: ['reflection', 'isolation', 'hope', 'dreams', 'night', 'time'],
  energy: [0, 0.55],
  moods: ['reflective', 'melancholic', 'tender'],
  baseline: true,
};
