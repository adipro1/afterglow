import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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
  const cx = size.w / 2;
  const cy = size.h / 2;

  return (
    <div
      ref={ref}
      className={`edge-panel edge-panel--${intensity} ${className ?? ''}`}
      style={{ ...style, ['--edge-radius' as string]: `${radius}px` }}
      data-testid={rest['data-testid']}
    >
      <div className="edge-panel__body">{children}</div>
      {d && intensity !== 'none' && (
        <svg
          className="edge-panel__light"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          aria-hidden
        >
          <defs>
            <linearGradient
              id={`g${uid}`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={size.w}
              y2={size.h}
              gradientTransform={`rotate(${lightAngle} ${cx} ${cy})`}
            >
              {breathe && !reducedMotion && (
                // Light slowly swings along the edge like a camera moving past a lit window.
                <animateTransform
                  attributeName="gradientTransform"
                  type="rotate"
                  values={`${lightAngle - 14} ${cx} ${cy};${lightAngle + 10} ${cx} ${cy};${lightAngle - 14} ${cx} ${cy}`}
                  keyTimes="0;0.5;1"
                  calcMode="spline"
                  keySplines="0.37 0 0.63 1;0.37 0 0.63 1"
                  dur="22s"
                  repeatCount="indefinite"
                />
              )}
              <stop offset="0" stopColor="var(--edge-b)" stopOpacity="0" />
              <stop offset="0.38" stopColor="var(--edge-b)" stopOpacity="0" />
              <stop offset="0.6" stopColor="var(--edge-b)" stopOpacity="0.85" />
              <stop offset="0.8" stopColor="var(--edge-a)" stopOpacity="1" />
              <stop offset="1" stopColor="var(--edge-a)" stopOpacity="0.9" />
            </linearGradient>
            <filter id={`b${uid}`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>
          {/* faint full outline so the shape still reads where the light doesn't reach */}
          <path d={d} className="edge-panel__hairline" />
          <path
            d={d}
            className="edge-panel__bloom"
            stroke={`url(#g${uid})`}
            filter={`url(#b${uid})`}
          />
          <path d={d} className="edge-panel__line" stroke={`url(#g${uid})`} />
        </svg>
      )}
    </div>
  );
}
