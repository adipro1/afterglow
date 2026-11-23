import { useMemo, useRef } from 'react';
import { FloatingRig } from '@/design/FloatingRig';
import { useTicker } from '@/engine/ticker';
import { clamp, hash01 } from '@/animation/easing';
import { spring, springs } from '@/animation/spring';
import type { SceneProps } from '../types';
import { Bubble, TypingBubble, applySungWords, applyTypingDots } from './Bubble';
import { composeAt, type ConversationPlan } from './plan';
import type { ConversationStructure } from './useConversation';

const KEEP = 7;
/** Per step back into the dark: rise, recede, blur. */
const STEP = { y: 15, z: 260, blur: 1.6, fade: 0.2 };

/**
 * Drift — no interface at all. Each line hangs in space as a large bubble; as new ones arrive
 * the older ones rise and recede into the dark, losing focus like a lens pulling past them.
 */
export function Drift({
  getTime,
  plan,
  structure,
  seed,
}: SceneProps & { plan: ConversationPlan; structure: ConversationStructure }) {
  const shown = useMemo(() => {
    const from = Math.max(0, structure.landed - KEEP + 1);
    return plan.messages.slice(from, structure.landed + 1);
  }, [plan, structure.landed]);
  const typing = plan.messages.find((m) => m.id === structure.typingId) ?? null;

  const spaceRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const blurCache = useRef(new Map<string, string>());

  useTicker(() => {
    const t = getTime();
    const space = spaceRef.current;
    if (!space) return;

    shown.forEach((m) => {
      const el = space.querySelector<HTMLElement>(`[data-drift="${m.id}"]`);
      if (!el) return;
      // Continuous depth: how many newer messages have (partly) arrived since this one.
      const depth = plan.messages
        .slice(m.index + 1, structure.landed + 2)
        .reduce((d, n) => d + spring(t - n.appearAt, springs.glide), 0);
      const age = t - m.appearAt;
      const s = spring(age, springs.land);
      // Each message gets its own seeded lateral position so the field never looks gridded.
      const side = m.side === 'in' ? -1 : 1;
      const x = side * (9 + hash01(m.index, seed) * 9) + (hash01(m.index, seed + 1) - 0.5) * 4;
      const y = 8 - depth * STEP.y + (1 - s) * 6;
      const z = -depth * STEP.z + (1 - s) * 120;
      const rotY = side * -6 * (1 - Math.min(depth, 3) / 4);
      el.style.transform = `translate3d(calc(${x.toFixed(2)}cqw - 50%), ${y.toFixed(2)}cqh, ${z.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg)`;
      el.style.opacity = (clamp(age / 200) * clamp(1 - depth * STEP.fade)).toFixed(3);
      // Blur only changes in quarter-pixel steps so the GPU isn't re-blurring every frame.
      const blur = `blur(${(Math.round(depth * STEP.blur * 4) / 4).toFixed(2)}px)`;
      if (blurCache.current.get(m.id) !== blur) {
        blurCache.current.set(m.id, blur);
        el.style.filter = blur;
      }
      applySungWords(el, m, t);
    });

    const tyEl = space.querySelector<HTMLElement>('[data-drift="typing"]');
    if (tyEl && typing) {
      const p = spring(t - (typing.typingFrom ?? 0), springs.snap);
      const x = -(9 + hash01(typing.index, seed) * 9);
      tyEl.style.transform = `translate3d(calc(${x.toFixed(2)}cqw - 50%), 12cqh, 0) scale(${(0.6 + 0.4 * p).toFixed(3)})`;
      tyEl.style.opacity = p.toFixed(3);
      applyTypingDots(tyEl, t);
    }

    // The light in the room follows whoever spoke last.
    const last = plan.messages[structure.landed];
    if (glowRef.current) {
      const k = last ? clamp((t - last.appearAt) / 600) : 0;
      glowRef.current.dataset['side'] = last?.side ?? 'none';
      glowRef.current.style.opacity = (0.55 + 0.45 * k).toFixed(3);
    }

    const c = composeAt(plan, t);
    const compose = composeRef.current;
    if (compose) {
      const txt = compose.querySelector<HTMLElement>('.drift-compose__text');
      if (txt && txt.textContent !== (c?.typed ?? '')) txt.textContent = c?.typed ?? '';
      compose.dataset['open'] = c ? '1' : '0';
    }
  });

  return (
    <div className="msg-drift" data-testid="messages-drift">
      <div className="msg-drift__glow" ref={glowRef} aria-hidden />
      <FloatingRig
        className="msg-drift__space"
        drift={{ rotX: 4, rotY: 0, ampY: 3.2, ampX: 1.4, ampLift: 10, phase: 1.7 }}
      >
        <div ref={spaceRef} className="msg-drift__field">
          {shown.map((m) => (
            <div key={m.id} className={`drift-item side-${m.side}`} data-drift={m.id}>
              {m.separator && <div className="drift-sep caps">{m.separator}</div>}
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
        <span className="drift-compose__text" />
        <span className="drift-compose__caret" />
      </div>
    </div>
  );
}
