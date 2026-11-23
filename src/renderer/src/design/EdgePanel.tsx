import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { edgePath, type NotchSpec } from './edge-path';
import { useReducedMotion } from './useReducedMotion';
import './edge-panel.css';

export type EdgeIntensity = 'hero' | 'quiet' | 'none';

interface EdgePanelProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  radius?: number;
  notch?: NotchSpec;
  intensity?: EdgeIntensity;
  /**
   * Angle (deg) the light comes from. 0 = light pooled on the bottom-right, as in reference 1.
   * Animated slowly by CSS unless reduced motion is on.
   */
  lightAngle?: number;
  /** Slowly swing the light along the edge. */
  breathe?: boolean;
  /**
   * Optional extra, brighter copy of the light (opacity 0 by default) that a scene can pulse —
   * e.g. when a message arrives. Driving its opacity is compositor-only, so it costs nothing.
   */
  flashRef?: Ref<SVGSVGElement>;
  'data-testid'?: string;
}

/**
 * A floating window in the void. Its edge is not a border: it's a thin line of light that
 * is brightest where it "catches" (bottom/right by default) and fades to nothing elsewhere,
 * with a soft bloom underneath. Shape is drawn in SVG so it can carry the notch tab.
 */
export function EdgePanel({
  children,
  className,
  style,
  radius = 14,
  notch,
  intensity = 'hero',
  lightAngle = 0,
  breathe = false,
  flashRef,
  ...rest
}: EdgePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const uid = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) =>
        Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = size.w > 0 ? edgePath(size.w, size.h, radius, notch) : '';

  // Each light layer is a static SVG, rasterised once. "Breathing" cross-fades two layers lit
  // from slightly different angles (opacity runs on the compositor), instead of re-drawing a
  // blurred, window-sized SVG every frame.
  const light = (angle: number, key: string, cls = '', ref?: Ref<SVGSVGElement>) => {
    const id = `${uid}${key}`;
    const cx = size.w / 2;
    const cy = size.h / 2;
    return (
      <svg
        key={key}
        ref={ref}
        className={`edge-panel__light ${cls}`}
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        aria-hidden
      >
        <defs>
          <linearGradient
            id={`g${id}`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={size.w}
            y2={size.h}
            gradientTransform={`rotate(${angle} ${cx} ${cy})`}
          >
            <stop offset="0" stopColor="var(--edge-b)" stopOpacity="0" />
            <stop offset="0.38" stopColor="var(--edge-b)" stopOpacity="0" />
            <stop offset="0.6" stopColor="var(--edge-b)" stopOpacity="0.85" />
            <stop offset="0.8" stopColor="var(--edge-a)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--edge-a)" stopOpacity="0.9" />
          </linearGradient>
          <filter id={`b${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        {!cls && <path d={d} className="edge-panel__hairline" />}
        <path d={d} className="edge-panel__bloom" stroke={`url(#g${id})`} filter={`url(#b${id})`} />
        <path d={d} className="edge-panel__line" stroke={`url(#g${id})`} />
      </svg>
    );
  };

  const lit = d && intensity !== 'none';
  return (
    <div
      ref={ref}
      className={`edge-panel edge-panel--${intensity} ${className ?? ''}`}
      style={{ ...style, ['--edge-radius' as string]: `${radius}px` }}
      data-testid={rest['data-testid']}
    >
      <div className="edge-panel__body">{children}</div>
      {lit && light(lightAngle, 'a')}
      {lit && breathe && !reducedMotion && light(lightAngle + 26, 'b', 'edge-panel__light--alt')}
      {lit && flashRef && light(lightAngle + 8, 'f', 'edge-panel__light--flash', flashRef)}
    </div>
  );
}
