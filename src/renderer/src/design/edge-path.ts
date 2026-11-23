export interface NotchSpec {
  /** Width of the notch tab at its mouth, px. */
  width: number;
  /** How far the notch dips into the panel, px. */
  depth: number;
  /** Horizontal centre as 0..1 of the panel width. */
  at?: number;
}

/**
 * Outline path for a floating window: rounded rectangle, optionally with a small
 * notch tab cut into the top edge (a detail lifted from reference 1).
 * Inset by half the stroke so a centred stroke stays inside the box.
 */
export function edgePath(
  w: number,
  h: number,
  radius: number,
  notch?: NotchSpec,
  inset = 0.75,
): string {
  const x0 = inset;
  const y0 = inset;
  const x1 = Math.max(x0, w - inset);
  const y1 = Math.max(y0, h - inset);
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  const f = (n: number) => +n.toFixed(2);

  const parts: string[] = [`M ${f(x0 + r)} ${f(y0)}`];
  if (notch && notch.width > 0 && notch.depth > 0) {
    const cx = x0 + (x1 - x0) * (notch.at ?? 0.5);
    const half = notch.width / 2;
    const d = notch.depth;
    const k = Math.min(d, 6); // corner softness of the notch
    const left = Math.max(x0 + r + k, cx - half);
    const right = Math.min(x1 - r - k, cx + half);
    parts.push(
      `L ${f(left - k)} ${f(y0)}`,
      `Q ${f(left)} ${f(y0)} ${f(left + k * 0.4)} ${f(y0 + d * 0.5)}`,
      `Q ${f(left + k)} ${f(y0 + d)} ${f(left + k * 2)} ${f(y0 + d)}`,
      `L ${f(right - k * 2)} ${f(y0 + d)}`,
      `Q ${f(right - k)} ${f(y0 + d)} ${f(right - k * 0.4)} ${f(y0 + d * 0.5)}`,
      `Q ${f(right)} ${f(y0)} ${f(right + k)} ${f(y0)}`,
    );
  }
  parts.push(
    `L ${f(x1 - r)} ${f(y0)}`,
    `Q ${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}`,
    `L ${f(x1)} ${f(y1 - r)}`,
    `Q ${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)}`,
    `L ${f(x0 + r)} ${f(y1)}`,
    `Q ${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - r)}`,
    `L ${f(x0)} ${f(y0 + r)}`,
    `Q ${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}`,
    'Z',
  );
  return parts.join(' ');
}
