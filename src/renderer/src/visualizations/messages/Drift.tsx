import { useMemo, useRef } from 'react';
import {
  Rig,
  ambient,
  applyTyping,
  clamp,
  enter,
  flowStack,
  hash01,
  makeField,
  mix,
  motePose,
  ramp,
  setData,
  setSteppedBlur,
  setStyle,
  setTransform,
  smoothstep,
  springs,
  transform,
  useTicker,
} from '@/engine';
import type { SceneProps } from '../types';
import { Bubble, TypingBubble, applyReaction, applySungWords, applyTypingDots } from './Bubble';
import { composeAt, type ConversationPlan, type PlannedMessage } from './plan';
import type { ConversationStructure } from './useConversation';

const KEEP = 7;
/** Per step back into the dark: rise (cqh), recede (px), blur (px), fade. */
const STEP = { y: 15, z: 260, blur: 1.5, fade: 0.2 };
const BOKEH = 14;

/**
 * Drift — no interface at all. Each line hangs in space as a large bubble; as new ones arrive
 * the older ones rise and recede into the dark, losing focus like a lens pulling past them.
 * The song's title opens the scene and is the first thing to recede.
 */
export function Drift({
  track,
  getTime,
  plan,
  structure,
  seed,
}: SceneProps & { plan: ConversationPlan; structure: ConversationStructure }) {
  const from = Math.max(0, structure.landed - KEEP + 1);
  const shown = useMemo(
    () => plan.messages.slice(from, structure.landed + 1),
    [plan, from, structure.landed],
  );
  const typing = plan.messages.find((m) => m.id === structure.typingId) ?? null;

  const spaceRef = useRef<HTMLDivElement>(null);
  const glowInRef = useRef<HTMLDivElement>(null);
  const glowOutRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const composeTextRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const bokehRef = useRef<HTMLDivElement>(null);
  const lastTyped = useRef('');

  const bokeh = useMemo(
    () =>
      makeField(seed, {
        count: BOKEH,
        minSize: 30,
        maxSize: 150,
        minPeriod: 26_000,
        maxPeriod: 56_000,
      }),
    [seed],
  );

  useTicker(() => {
    const t = getTime();
    const space = spaceRef.current;
    if (!space) return;
    const msgs = plan.messages;
    const last = structure.landed;

    // How deep each message sits = the sum of the arrivals newer than it (continuous, so the
    // recession animates). The next message — not landed yet — already starts pushing, and the
    // title card sits behind the oldest message.
    const next = msgs[last + 1];
    const column: (PlannedMessage | null)[] = [next ?? null, ...[...shown].reverse(), null];
    const depths = flowStack(column, {
      size: () => 0,
      presence: (m) => (m ? enter(t, m.appearAt, springs.glide) : 0),
    });
    const depthOf = (i: number) => depths[i]!.depth;

    shown.forEach((m, j) => {
      const el = space.querySelector<HTMLElement>(`[data-drift="${m.id}"]`);
      if (!el) return;
      const depth = depthOf(shown.length - j);
      const s = enter(t, m.appearAt, springs.land);
      const side = m.side === 'in' ? -1 : 1;
      // Each message gets its own seeded lateral position so the field never looks gridded.
      const x = side * (9 + hash01(m.index, seed) * 9) + (hash01(m.index, seed + 1) - 0.5) * 4;
      // Sent lines rise out of the glowing compose text at the bottom; received ones
      // arrive from just in front of the glass.
      const fromY = m.side === 'out' ? 30 : 5;
      const y = 8 - depth * STEP.y + (1 - s) * fromY;
      const z = -depth * STEP.z + (1 - s) * (m.side === 'out' ? 40 : 150);
      const rotY = side * -6 * (1 - Math.min(depth, 3) / 4);
      const scale = mix(m.side === 'out' ? 0.7 : 0.9, 1, s);
      setTransform(
        el,
        `translate3d(calc(${x.toFixed(2)}cqw - 50%), ${y.toFixed(2)}cqh, ${z.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      );
      setStyle(el, 'opacity', (ramp(t, m.appearAt, 160) * clamp(1 - depth * STEP.fade)).toFixed(3));
      // Blur in half-pixel steps, and none at all near the front, so the GPU only re-blurs
      // when a message actually moves back a step.
      setSteppedBlur(el, Math.max(0, depth - 0.25) * STEP.blur);
      applySungWords(el, m, t);
      applyReaction(el, m, t);
    });

    // The title card is the conversation's first "message": it recedes as lines arrive.
    const title = titleRef.current;
    if (title) {
      const d = from === 0 ? depthOf(column.length - 1) : 99;
      setTransform(
        title,
        transform({ x: '-50%', y: `${(-6 - d * STEP.y * 0.8).toFixed(2)}cqh`, z: -d * STEP.z }, 1),
      );
      setStyle(title, 'opacity', (smoothstep(0, 1400, t) * clamp(1 - d * 0.35)).toFixed(3));
      setSteppedBlur(title, d < 0.2 ? 0 : d * STEP.blur);
    }

    const tyEl = space.querySelector<HTMLElement>('[data-drift="typing"]');
    if (tyEl && typing) {
      const typedFrom = typing.typingFrom ?? 0;
      const x = -(9 + hash01(typing.index, seed) * 9);
      setTransform(
        tyEl,
        `translate3d(calc(${x.toFixed(2)}cqw - 50%), 12cqh, 0) scale(${(0.5 + 0.5 * enter(t, typedFrom, springs.pop)).toFixed(3)})`,
      );
      setStyle(tyEl, 'opacity', ramp(t, typedFrom, 120).toFixed(3));
      applyTypingDots(tyEl, t);
    }

    // The light in the room leans toward whoever spoke last (cross-fading two fixed lights).
    const lastMsg = msgs[last];
    const prevSide = msgs[last - 1]?.side ?? null;
    const k = lastMsg ? enter(t, lastMsg.appearAt, springs.settle) : 0;
    const weight = (side: 'in' | 'out') =>
      (lastMsg?.side === side ? k : 0) + (prevSide === side ? 1 - k : 0);
    setStyle(glowInRef.current, 'opacity', (0.25 + 0.75 * weight('in')).toFixed(3));
    setStyle(glowOutRef.current, 'opacity', (0.25 + 0.75 * weight('out')).toFixed(3));

    // Out-of-focus motes drifting slowly upward through the depth of the room.
    const now = ambient.now();
    const kids = bokehRef.current?.children;
    if (kids) {
      for (let i = 0; i < kids.length; i++) {
        const b = bokeh[i]!;
        const pose = motePose(b, i, now);
        const node = kids[i] as HTMLElement;
        setTransform(node, `translate3d(${pose.x.toFixed(2)}cqw, ${pose.y.toFixed(2)}cqh, 0)`);
        setStyle(node, 'opacity', ((0.18 + 0.3 * (1 - b.depth)) * pose.k).toFixed(3));
      }
    }

    // Outgoing lines appear as glowing typed text at the bottom of the frame.
    const c = composeAt(plan, t);
    applyTyping(
      composeTextRef.current,
      null,
      { text: c?.typed ?? null, arriving: false },
      t,
      lastTyped,
    );
    setData(composeRef.current, 'open', c ? '1' : '0');
  });

  return (
    <div className="msg-drift" data-testid="messages-drift">
      <div className="msg-drift__glow msg-drift__glow--in" ref={glowInRef} aria-hidden />
      <div className="msg-drift__glow msg-drift__glow--out" ref={glowOutRef} aria-hidden />
      <div className="msg-drift__bokeh" ref={bokehRef} aria-hidden>
        {bokeh.map((b, i) => (
          <i
            key={i}
            className={b.alt ? 'is-warm' : ''}
            style={{ width: b.size * (1 - b.depth * 0.6), height: b.size * (1 - b.depth * 0.6) }}
          />
        ))}
      </div>
      <Rig
        className="msg-drift__space"
        drift={{ rotX: 4, rotY: 0, ampY: 3.2, ampX: 1.4, ampLift: 10, phase: 1.7 }}
      >
        <div ref={spaceRef} className="msg-drift__field">
          <div className="drift-title" ref={titleRef}>
            <div className="drift-title__name">{track?.title ?? ''}</div>
            <div className="drift-title__artist caps">{track?.artists.join(', ') ?? ''}</div>
          </div>
          {shown.map((m) => (
            <div key={m.id} className={`drift-item side-${m.side}`} data-drift={m.id}>
              {m.separator && m.index > 0 && <div className="drift-sep caps">{m.separator}</div>}
              <Bubble m={m} tail />
            </div>
          ))}
          {typing && (
            <div className="drift-item side-in" data-drift="typing">
              <TypingBubble />
            </div>
          )}
        </div>
      </Rig>
      <div className="drift-compose" ref={composeRef} data-open="0">
        <span className="drift-compose__text" ref={composeTextRef} />
        <span className="drift-compose__caret" />
      </div>
    </div>
  );
}
