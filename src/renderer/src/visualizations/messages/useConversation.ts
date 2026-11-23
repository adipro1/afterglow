import { useMemo, useRef, useState } from 'react';
import type { LyricsDocument } from '@shared/lyrics';
import { useTicker } from '@/engine/ticker';
import { composeAt, lastLanded, planConversation, typingAt, type ConversationPlan } from './plan';

export interface ConversationStructure {
  /** Index of the last landed message (-1 = none). */
  landed: number;
  /** Message id whose typing indicator is showing, if any. */
  typingId: string | null;
  /** Outgoing message id currently being composed, if any. */
  composeId: string | null;
}

const EMPTY: ConversationPlan = { messages: [], contactSeed: 0 };

/**
 * Shared by all Messages compositions: builds the plan once per song and tracks the
 * *structural* state (which messages exist) in React — it changes only a few times per line.
 * Continuous motion is left to each composition's own ticker callback.
 */
export function useConversation(
  lyrics: LyricsDocument | null,
  seed: number,
  getTime: () => number,
): { plan: ConversationPlan; structure: ConversationStructure } {
  const plan = useMemo(() => (lyrics ? planConversation(lyrics, seed) : EMPTY), [lyrics, seed]);
  const [structure, setStructure] = useState<ConversationStructure>({
    landed: -1,
    typingId: null,
    composeId: null,
  });
  const ref = useRef(structure);

  useTicker(() => {
    const t = getTime();
    const next: ConversationStructure = {
      landed: lastLanded(plan, t),
      typingId: typingAt(plan, t)?.id ?? null,
      composeId: composeAt(plan, t)?.message.id ?? null,
    };
    const cur = ref.current;
    if (
      next.landed !== cur.landed ||
      next.typingId !== cur.typingId ||
      next.composeId !== cur.composeId
    ) {
      ref.current = next;
      setStructure(next);
    }
  });

  return { plan, structure };
}
