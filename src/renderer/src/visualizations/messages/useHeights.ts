import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';

/**
 * Natural (untransformed) heights of keyed children, kept up to date as they change —
 * text that re-wraps, fonts settling, the window resizing. Each child is observed individually,
 * so the per-frame layout code can read heights from a map without forcing browser layout.
 */
export function useHeights(
  rootRef: RefObject<HTMLElement | null>,
  attr: string,
  deps: DependencyList,
) {
  const heights = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = (el: HTMLElement) => {
      const key = el.dataset[attr];
      if (key) heights.current.set(key, el.offsetHeight);
    };
    const els = Array.from(root.querySelectorAll<HTMLElement>(`[data-${attr}]`));
    els.forEach(read);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) read(e.target as HTMLElement);
    });
    els.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return heights;
}
