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
  phone: (
    <path d="M5.6 2.8l1.2 2.6c.1.3 0 .6-.2.8l-1 .8c.7 1.5 1.9 2.7 3.4 3.4l.8-1c.2-.2.5-.3.8-.2l2.6 1.2c.3.1.5.5.4.8l-.4 1.5c-.1.4-.5.6-.9.6C7.6 13 3 8.4 3.2 3.7c0-.4.3-.8.6-.9l1.5-.4c.3-.1.6.1.8.4z" />
  ),
  video: (
    <>
      <rect x="2.5" y="4.5" width="8" height="7" rx="1.6" />
      <path d="M10.5 7l3-1.8v5.6l-3-1.8" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.3v3.4M8 5.2v.1" />
    </>
  ),
  plus: <path d="M8 4v8M4 8h8" />,
  lyrics: <path d="M3 4.5h10M3 8h7M3 11.5h8.5" />,
  note: (
    <>
      <path d="M6.5 11.5V3.8l6-1.3v7.4" />
      <circle cx="5" cy="11.6" r="1.6" />
      <circle cx="11" cy="10" r="1.6" />
    </>
  ),
  tap: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <circle cx="8" cy="8" r="5.3" strokeOpacity={0.45} />
    </>
  ),
  arrowUp: <path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7" strokeWidth={1.6} />,
  bubble: (
    <path
      d="M8 2.6c3.2 0 5.8 2.1 5.8 4.8S11.2 12.2 8 12.2c-.6 0-1.2-.1-1.8-.2L3.4 13.4l.7-2.4C3 10.1 2.2 8.8 2.2 7.4 2.2 4.7 4.8 2.6 8 2.6z"
      fill="currentColor"
      stroke="none"
    />
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
