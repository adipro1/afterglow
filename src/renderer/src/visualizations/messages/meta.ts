import type { VisualizationMeta } from '../types';

export const messagesMeta: VisualizationMeta = {
  id: 'messages',
  name: 'Messages',
  description: 'The song becomes a conversation — typing, sending, waiting to be read.',
  category: 'interface',
  variations: [
    {
      id: 'thread',
      name: 'Thread',
      description: 'A desktop conversation window floating in the dark, artwork at depth.',
    },
    {
      id: 'lockscreen',
      name: 'Lock Screen',
      description: 'Lines arrive as notifications on a phone left face-up at night.',
    },
    {
      id: 'drift',
      name: 'Drift',
      description: 'No interface — just the bubbles, suspended in space and receding.',
    },
  ],
  themes: ['messages', 'conversation', 'longing', 'separation', 'technology'],
};
