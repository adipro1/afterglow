/**
 * Flow stack: lays out a list of items one after another, where each item claims space in
 * proportion to how present it is (0..1). As an item's presence springs from 0 to 1 the items
 * beyond it glide out of the way, continuously — no layout jumps, no reflow.
 *
 * Items are given in stacking order, starting at the anchor (e.g. newest message first for a
 * chat that grows upward from the compose field, or newest notification first for a list that
 * grows down from the top).
 */

export interface StackSlot {
  /** Distance from the anchor to this item's near edge (px, along the stack direction). */
  offset: number;
  /** Sum of the presences of all items before this one — "how many items are in front". */
  depth: number;
  /** This item's own presence, as given. */
  presence: number;
}

export interface StackSpec<T> {
  /** Natural size along the stack direction (px). */
  size: (item: T, index: number) => number;
  /** 0..1 — how much of its space the item currently claims. */
  presence: (item: T, index: number) => number;
  /**
   * Gap between `item` and the nearest *present* item before it. Measuring to the nearest
   * present item means collapsed placeholders never leave a hole. Scaled by presence.
   */
  gap?: (item: T, previous: T) => number;
  /**
   * Whether the item takes up room at all, given how deep it sits (e.g. notifications tucked
   * into a pile stop pushing the list). Defaults to always.
   */
  occupies?: (item: T, depth: number) => boolean;
  /** Below this presence an item doesn't count as "present" for gap purposes. */
  threshold?: number;
}

export function flowStack<T>(items: readonly T[], spec: StackSpec<T>): StackSlot[] {
  const { size, presence, gap, occupies, threshold = 0.02 } = spec;
  const out: StackSlot[] = new Array(items.length);
  let acc = 0;
  let depth = 0;
  let prev: T | undefined;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const p = presence(it, i);
    if (gap && prev !== undefined) acc += gap(it, prev) * p;
    out[i] = { offset: acc, depth, presence: p };
    if (!occupies || occupies(it, depth)) acc += size(it, i) * p;
    depth += p;
    if (p > threshold) prev = it;
  }
  return out;
}
