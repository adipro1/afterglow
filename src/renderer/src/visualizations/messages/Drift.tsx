import { useMemo, useRef } from 'react';
import { FloatingRig } from '@/design/FloatingRig';
import { ambient } from '@/engine/ambient';
import { useTicker } from '@/engine/ticker';
import { clamp, hash01, mix, smoothstep } from '@/animation/easing';
import { spring, springs } from '@/animation/spring';
import type { SceneProps } from '../types';
import { Bubble, TypingBubble, applyReaction, applySungWords, applyTypingDots } from './Bubble';
import { composeAt, type ConversationPlan } from './plan';
import type { ConversationStructure } from './useConversation';

const KEEP = 7;
/** Per step back into the dark: rise (cqh), recede (px), blur (px), fade. */
const STEP = { y: 15, z: 260, blur: 1.5, fade: 0.2 };
const BOKEH = 14;
const TAU = Math.PI * 2;

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
  const blurCache = useRef(new Map<string, string>());
  const lastTyped = useRef('');

  const bokeh = useMemo(
    () =>
      Array.from({ length: BOKEH }, (_, i) => ({
        x: hash01(i, seed + 31) * 100,
        y: hash01(i, seed + 32) * 100,
        size: 30 + hash01(i, seed + 33) * 120,
        depth: hash01(i, seed + 34),
        period: 26_000 + hash01(i, seed + 35) * 30_000,
        warm: hash01(i, seed + 36) < 0.5,
      })),
    [seed],
  );

  useTicker(() => {
    const t = getTime();
    const space = spaceRef.current;
    if (!space) return;
    const msgs = plan.messages;
    const last = structure.landed;

    // Arrival progress of every message from `from` to the next one, and how deep each
    // message sits = the sum of arrivals newer than it (continuous, so recession animates).
    const arrive = (i: number) =>
      i < msgs.length ? spring(t - msgs[i]!.appearAt, springs.glide) : 0;
    let newer = arrive(last + 1);
    const depthOf = new Map<number, number>();
    for (let i = last; i >= from; i--) {
      depthOf.set(i, newer);
      newer += arrive(i);
    }

    shown.forEach((m) => {
      const el = space.querySelector<HTMLElement>(`[data-drift="${m.id}"]`);
      if (!el) return;
      const depth = depthOf.get(m.index) ?? 0;
      const age = t - m.appearAt;
      const s = spring(age, springs.land);
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
      el.style.transform = `translate3d(calc(${x.toFixed(2)}cqw - 50%), ${y.toFixed(2)}cqh, ${z.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      el.style.opacity = (clamp(age / 160) * clamp(1 - depth * STEP.fade)).toFixed(3);
      // Blur in half-pixel steps, and none at all near the front, so the GPU only re-blurs
      // when a message actually moves back a step.
      const b = Math.round(Math.max(0, depth - 0.25) * STEP.blur * 2) / 2;
      const blur = b > 0 ? `blur(${b.toFixed(1)}px)` : 'none';
      if (blurCache.current.get(m.id) !== blur) {
        blurCache.current.set(m.id, blur);
        el.style.filter = blur;
      }
      applySungWords(el, m, t);
      applyReaction(el, m, t);
    });

    // The title card is the conversation's first "message": it recedes as lines arrive.
    if (titleRef.current) {
      const d = from === 0 ? newer : 99;
      const intro = smoothstep(0, 1400, t);
      titleRef.current.style.transform = `translate3d(-50%, ${(-6 - d * STEP.y * 0.8).toFixed(2)}cqh, ${(-d * STEP.z).toFixed(1)}px)`;
      titleRef.current.style.opacity = (intro * clamp(1 - d * 0.35)).toFixed(3);
      const tb = d < 0.2 ? 'none' : `blur(${(Math.round(d * STEP.blur * 2) / 2).toFixed(1)}px)`;
      if (blurCache.current.get('title') !== tb) {
        blurCache.current.set('title', tb);
        titleRef.current.style.filter = tb;
      }
    }

    const tyEl = space.querySelector<HTMLElement>('[data-drift="typing"]');
    if (tyEl && typing) {
      const age = t - (typing.typingFrom ?? 0);
      const p = spring(age, springs.pop);
      const x = -(9 + hash01(typing.index, seed) * 9);
      tyEl.style.transform = `translate3d(calc(${x.toFixed(2)}cqw - 50%), 12cqh, 0) scale(${(0.5 + 0.5 * p).toFixed(3)})`;
      tyEl.style.opacity = clamp(age / 120).toFixed(3);
      applyTypingDots(tyEl, t);
    }

    // The light in the room leans toward whoever spoke last (cross-fading two fixed lights).
    const lastMsg = msgs[last];
    const prevSide = msgs[last - 1]?.side ?? null;
    const k = lastMsg ? spring(t - lastMsg.appearAt, springs.settle) : 0;
    const weight = (side: 'in' | 'out') =>
      (lastMsg?.side === side ? k : 0) + (prevSide === side ? 1 - k : 0);
    if (glowInRef.current)
      glowInRef.current.style.opacity = (0.25 + 0.75 * weight('in')).toFixed(3);
    if (glowOutRef.current)
      glowOutRef.current.style.opacity = (0.25 + 0.75 * weight('out')).toFixed(3);

    // Out-of-focus motes drifting slowly upward through the depth of the room.
    const now = ambient.now();
    const kids = bokehRef.current?.children;
    if (kids) {
      for (let i = 0; i < kids.length; i++) {
        const b = bokeh[i]!;
        const ph = (now / b.period + b.depth) % 1;
        const yy = 110 - ph * 120;
        const xx = b.x + Math.sin(ph * TAU * 2 + i) * 2;
        const twinkle = 0.5 + 0.5 * Math.sin(now / 2300 + i * 1.7);
        const fade = smoothstep(0, 0.15, ph) * (1 - smoothstep(0.85, 1, ph));
        const node = kids[i] as HTMLElement;
        node.style.transform = `translate3d(${xx.toFixed(2)}cqw, ${yy.toFixed(2)}cqh, 0)`;
        node.style.opacity = ((0.18 + 0.3 * (1 - b.depth)) * fade * (0.7 + 0.3 * twinkle)).toFixed(
          3,
        );
      }
    }

    // Outgoing lines appear as glowing typed text at the bottom of the frame.
    const c = composeAt(plan, t);
    const compose = composeRef.current;
    if (compose) {
      // Keep the last words while the text fades away after sending.
      const typed = c?.typed ?? lastTyped.current;
      if (typed !== lastTyped.current && composeTextRef.current)
        composeTextRef.current.textContent = lastTyped.current = typed;
      const open = c ? '1' : '0';
      if (compose.dataset['open'] !== open) compose.dataset['open'] = open;
    }
  });

  return (
    <div className="msg-drift" data-testid="messages-drift">
      <div className="msg-drift__glow msg-drift__glow--in" ref={glowInRef} aria-hidden />
      <div className="msg-drift__glow msg-drift__glow--out" ref={glowOutRef} aria-hidden />
      <div className="msg-drift__bokeh" ref={bokehRef} aria-hidden>
        {bokeh.map((b, i) => (
          <i
            key={i}
            className={b.warm ? 'is-warm' : ''}
            style={{ width: b.size * (1 - b.depth * 0.6), height: b.size * (1 - b.depth * 0.6) }}
          />
        ))}
      </div>
      <FloatingRig
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
      </FloatingRig>
      <div className="drift-compose" ref={composeRef} data-open="0">
        <span className="drift-compose__text" ref={composeTextRef} />
        <span className="drift-compose__caret" />
      </div>
    </div>
  );
}
