/**
 * Ambient time drives motion that isn't tied to the song — camera breathing, idle drift.
 * It follows wall-clock time, but can be frozen so screenshot tests are pixel-stable.
 */
let frozenAt: number | null = null;

export const ambient = {
  now(): number {
    return frozenAt ?? performance.now();
  },
  freeze(at = 0): void {
    frozenAt = at;
  },
  unfreeze(): void {
    frozenAt = null;
  },
};
