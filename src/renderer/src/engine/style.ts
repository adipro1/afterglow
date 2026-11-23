/**
 * The only way per-frame code should touch the DOM.
 *
 * Every write is remembered per element and skipped when the value hasn't changed, so a scene
 * can describe its whole state every frame ("this bubble is here, this opaque") while the
 * browser only does work for the things that actually moved. Settled elements cost nothing.
 *
 * Only compositor-friendly properties get first-class helpers (transform, opacity). Anything
 * else goes through `setStyle`, and should change rarely (see the GPU budget in CLAUDE.md).
 */

const cache = new WeakMap<Element, Map<string, string>>();

function remember(el: Element, key: string, value: string): boolean {
  let m = cache.get(el);
  if (!m) cache.set(el, (m = new Map()));
  if (m.get(key) === value) return false;
  m.set(key, value);
  return true;
}

/** Set any inline style property (camelCase or custom `--prop`), skipping no-op writes. */
export function setStyle(
  el: HTMLElement | SVGElement | null | undefined,
  prop: string,
  value: string,
) {
  if (!el || !remember(el, prop, value)) return;
  if (prop.startsWith('--')) el.style.setProperty(prop, value);
  else (el.style as unknown as Record<string, string>)[prop] = value;
}

/** Set a `data-*` attribute, skipping no-op writes (attribute selectors restyle on every write). */
export function setData(
  el: HTMLElement | SVGElement | null | undefined,
  key: string,
  value: string,
) {
  if (!el || !remember(el, `data-${key}`, value)) return;
  el.dataset[key] = value;
}

/** Replace an element's text, skipping no-op writes. */
export function setText(el: HTMLElement | null | undefined, text: string) {
  if (!el || !remember(el, '#text', text)) return;
  el.textContent = text;
}

export function setTransform(el: HTMLElement | SVGElement | null | undefined, tf: string) {
  setStyle(el, 'transform', tf);
}

/**
 * Opacity, with `visibility: hidden` below a threshold so fully transparent layers drop out of
 * hit-testing and compositing entirely.
 */
export function setOpacity(
  el: HTMLElement | SVGElement | null | undefined,
  v: number,
  { digits = 3, hideBelow = 0.001 }: { digits?: number; hideBelow?: number | null } = {},
) {
  if (!el) return;
  setStyle(el, 'opacity', v.toFixed(digits));
  if (hideBelow !== null) setStyle(el, 'visibility', v <= hideBelow ? 'hidden' : 'visible');
}

/**
 * Blur quantised to `step` px, and `none` below `from`, so a slowly receding element only
 * re-rasterises when it crosses a step — never every frame.
 */
export function setSteppedBlur(
  el: HTMLElement | null | undefined,
  px: number,
  { step = 0.5, from = 0 }: { step?: number; from?: number } = {},
) {
  const b = px <= from ? 0 : Math.round(px / step) * step;
  setStyle(el, 'filter', b > 0 ? `blur(${b.toFixed(1)}px)` : 'none');
}

/** Forget remembered values (e.g. after something outside the engine rewrote an element). */
export function forget(el: Element) {
  cache.delete(el);
}

// ── Transform strings ───────────────────────────────────────────────────────────────────────

export interface Transform {
  /** Translation; numbers are px. Strings pass through (e.g. `calc(12cqw - 50%)`, `8cqh`). */
  x?: number | string;
  y?: number | string;
  z?: number | string;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  /** Uniform scale, or separate axes. */
  scale?: number;
  scaleX?: number;
  scaleY?: number;
}

const len = (v: number | string | undefined, digits: number) =>
  v === undefined ? '0' : typeof v === 'number' ? `${v.toFixed(digits)}px` : v;

/**
 * Build a transform string in a fixed order: translate → rotate (X, Y, Z) → scale.
 * Always uses translate3d so the element stays on its own compositor layer.
 */
export function transform(t: Transform, digits = 2): string {
  let s = `translate3d(${len(t.x, digits)}, ${len(t.y, digits)}, ${len(t.z, digits)})`;
  if (t.rotateX !== undefined) s += ` rotateX(${t.rotateX.toFixed(3)}deg)`;
  if (t.rotateY !== undefined) s += ` rotateY(${t.rotateY.toFixed(3)}deg)`;
  if (t.rotateZ !== undefined) s += ` rotate(${t.rotateZ.toFixed(3)}deg)`;
  if (t.scaleX !== undefined || t.scaleY !== undefined)
    s += ` scale(${(t.scaleX ?? 1).toFixed(4)}, ${(t.scaleY ?? 1).toFixed(4)})`;
  else if (t.scale !== undefined) s += ` scale(${t.scale.toFixed(4)})`;
  return s;
}
