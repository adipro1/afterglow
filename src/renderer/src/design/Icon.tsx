import type { SVGProps } from 'react';

/** Hairline icon set. Drawn on a 16px grid with 1.25px strokes to match the edge-light weight. */
const paths = {
  minimize: <path d="M3.5 8h9" />,
  maximize: <rect x="3.5" y="3.5" width="9" height="9" rx="1.2" />,
  restore: (
    <>
      <rect x="3.5" y="5.5" width="7" height="7" rx="1.2" />
      <path d="M5.5 3.5h5.8c.7 0 1.2.5 1.2 1.2v5.8" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  play: (
    <path
      d="M5.2 3.6v8.8c0 .4.4.6.7.4l6.6-4.4c.3-.2.3-.6 0-.8L5.9 3.2c-.3-.2-.7 0-.7.4z"
      fill="currentColor"
      stroke="none"
    />
  ),
  pause: (
    <>
      <rect x="4.2" y="3.4" width="2.4" height="9.2" rx=".6" fill="currentColor" stroke="none" />
      <rect x="9.4" y="3.4" width="2.4" height="9.2" rx=".6" fill="currentColor" stroke="none" />
    </>
  ),
  next: (
    <>
      <path
        d="M3.5 4.2v7.6c0 .3.3.5.6.3l5.6-3.8c.2-.2.2-.5 0-.6L4.1 3.9c-.3-.2-.6 0-.6.3z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M12 3.8v8.4" />
    </>
  ),
  previous: (
    <>
      <path
        d="M12.5 4.2v7.6c0 .3-.3.5-.6.3L6.3 8.3a.4.4 0 010-.6l5.6-3.8c.3-.2.6 0 .6.3z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M4 3.8v8.4" />
    </>
  ),
  fullscreen: (
    <path d="M3 6V3.5c0-.3.2-.5.5-.5H6M10 3h2.5c.3 0 .5.2.5.5V6M13 10v2.5c0 .3-.2.5-.5.5H10M6 13H3.5c-.3 0-.5-.2-.5-.5V10" />
  ),
  exitFullscreen: (
    <path d="M6 3v2.5c0 .3-.2.5-.5.5H3M13 6h-2.5c-.3 0-.5-.2-.5-.5V3M10 13v-2.5c0-.3.2-.5.5-.5H13M3 10h2.5c.3 0 .5.2.5.5V13" />
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
