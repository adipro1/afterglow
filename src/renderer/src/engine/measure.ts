import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';

export interface Size {
  /** Height of the keyed element itself. */
  h: number;
  /** Width of its first child (the bubble/card), for shape morphs. */
  w: number;
}

/**
 * Natural (untransformed) sizes of keyed children, kept up to date as they change — text that
 * re-wraps, fonts settling, the window resizing — plus a cache of the elements themselves, so
 * per-frame code reads both from maps without querying the DOM or forcing layout.
 */
export function useMeasure(
  rootRef: RefObject<HTMLElement | null>,
  attr: string,
  deps: DependencyList,
) {
  const sizes = useRef(new Map<string, Size>());
  const els = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = (el: HTMLElement) => {
      const key = el.dataset[attr];
      if (!key) return;
      const inner = el.firstElementChild as HTMLElement | null;
      sizes.current.set(key, { h: el.offsetHeight, w: inner?.offsetWidth ?? el.offsetWidth });
    };
    const list = Array.from(root.querySelectorAll<HTMLElement>(`[data-${attr}]`));
    els.current = new Map(list.map((el) => [el.dataset[attr]!, el]));
    list.forEach(read);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) read(e.target as HTMLElement);
    });
    list.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { sizes, els };
}

/** An element's inner height, tracked in a ref (no re-render) as it resizes. */
export function useClientHeight(ref: RefObject<HTMLElement | null>) {
  const h = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => (h.current = el.clientHeight));
    ro.observe(el);
    h.current = el.clientHeight;
    return () => ro.disconnect();
  }, [ref]);
  return h;
}
