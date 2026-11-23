import { useMemo, useRef } from 'react';
import { EdgePanel } from '@/design/EdgePanel';
import { FloatingRig } from '@/design/FloatingRig';
import { Artwork } from '@/design/Artwork';
import { Icon } from '@/design/Icon';
import { useTicker } from '@/engine/ticker';
import { clamp, envelope } from '@/animation/easing';
import { spring, springs } from '@/animation/spring';
import type { SceneProps } from '../types';
import { Bubble, TypingBubble, applySungWords, applyTypingDots } from './Bubble';
import { composeAt, type ConversationPlan, type PlannedMessage } from './plan';
import type { ConversationStructure } from './useConversation';
import { useHeights } from './useHeights';

/** How many landed messages stay mounted (older ones have scrolled out of view). */
const KEEP = 9;

type Item =
  | { kind: 'sep'; key: string; m: PlannedMessage; label: string }
  | { kind: 'msg'; key: string; m: PlannedMessage }
  | { kind: 'receipt'; key: string; m: PlannedMessage; hideAt: number }
  | { kind: 'typing'; key: string; m: PlannedMessage };

function buildItems(plan: ConversationPlan, s: ConversationStructure): Item[] {
  const items: Item[] = [];
  const msgs = plan.messages;
  const from = Math.max(0, s.landed - KEEP + 1);
  for (let i = from; i <= s.landed; i++) {
    const m = msgs[i]!;
    if (m.separator) items.push({ kind: 'sep', key: `sep:${m.id}`, m, label: m.separator });
    items.push({ kind: 'msg', key: m.id, m });
    if (m.side === 'out') {
      const nextOut = msgs.slice(i + 1).find((n) => n.side === 'out');
      items.push({ kind: 'receipt', key: `rc:${m.id}`, m, hideAt: nextOut?.appearAt ?? Infinity });
    }
  }
  // The typing indicator for the next incoming message, or the one that just landed
  // (kept briefly so it can collapse smoothly as the real bubble grows in its place).
  const next = msgs[s.landed + 1];
  const just = msgs[s.landed];
  const typingFor =
    next && next.typingFrom !== null && s.typingId === next.id
      ? next
      : just && just.typingFrom !== null
        ? just
        : null;
  if (typingFor) {
    const at = typingFor === just ? items.findIndex((it) => it.key === just.id) : items.length;
    items.splice(at, 0, { kind: 'typing', key: `ty:${typingFor.id}`, m: typingFor });
  }
  return items;
}

/** Layout weight (0..1) of an item at time t — how much vertical space it currently claims. */
function presence(it: Item, t: number): number {
  switch (it.kind) {
    case 'sep':
    case 'msg':
      return spring(t - it.m.appearAt, springs.glide);
    case 'receipt':
      return (
        spring(t - it.m.appearAt - 260, springs.glide) * (1 - spring(t - it.hideAt, springs.glide))
      );
    case 'typing':
      return (
        spring(t - (it.m.typingFrom ?? 0), springs.glide) *
        (1 - spring(t - it.m.appearAt, springs.snap))
      );
  }
}

function gapAfter(it: Item, next: Item | undefined): number {
  if (!next) return 0;
  if (it.kind === 'sep') return 14;
  if (next.kind === 'receipt') return 5;
  if (next.kind === 'sep') return 22;
  if (it.kind === 'msg' && next.kind === 'msg' && next.m.group === it.m.group) return 3;
  return 12;
}

export function Thread({
  track,
  getTime,
  plan,
  structure,
}: SceneProps & { plan: ConversationPlan; structure: ConversationStructure }) {
  const items = useMemo(() => buildItems(plan, structure), [plan, structure]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const composeTextRef = useRef<HTMLSpanElement>(null);
  const sendRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const lastTyped = useRef('');

  // Natural heights of every item, tracked as they re-wrap or the window resizes.
  const heights = useHeights(scrollRef, 'item', [items]);

  useTicker(() => {
    const root = scrollRef.current;
    if (!root) return;
    const t = getTime();
    const els = new Map<string, HTMLElement>();
    root
      .querySelectorAll<HTMLElement>('[data-item]')
      .forEach((el) => els.set(el.dataset['item']!, el));

    // Stack from the bottom: each item sits above everything newer, weighted by presence.
    // Gaps are measured to the nearest item that is actually present, so collapsed
    // placeholders (a finished typing indicator, an old receipt) leave no hole.
    let y = 0;
    let below: Item | undefined;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      const el = els.get(it.key);
      const p = presence(it, t);
      const h = heights.current.get(it.key) ?? 0;
      // The gap between this item and the one below it opens as this item arrives.
      if (below) y += gapAfter(it, below) * p;
      if (el) {
        let extraY = 0;
        let scale = 1;
        let opacity = clamp(p * 1.6);
        if (it.kind === 'msg') {
          const age = t - it.m.appearAt;
          const s = spring(age, springs.land);
          scale = 0.84 + 0.16 * s;
          opacity = clamp(age / 140);
          // Sent messages rise out of the compose field; received ones drop in from their tail.
          extraY = (1 - s) * (it.m.side === 'out' ? 34 : 8);
          applySungWords(el, it.m, t);
        } else if (it.kind === 'typing') {
          scale = 0.7 + 0.3 * p;
          // Vanish almost instantly once the real message lands in the same spot.
          opacity = clamp(p * 1.3) * (1 - clamp((t - it.m.appearAt) / 70));
          applyTypingDots(el, t);
        }
        el.style.transform = `translate3d(0, ${(-y + extraY).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible';
      }
      y += h * p;
      if (p > 0.02) below = it;
    }

    // Compose field: the outgoing line is typed in as it's sung.
    const c = composeAt(plan, t);
    const typed = c?.typed ?? '';
    if (typed !== lastTyped.current && composeTextRef.current) {
      lastTyped.current = typed;
      composeTextRef.current.textContent = typed;
    }
    const field = composeRef.current;
    if (field) {
      field.dataset['state'] = typed ? 'typing' : 'empty';
      const caret = field.querySelector<HTMLElement>('.compose__caret');
      if (caret) {
        const active = c && c.wordProgress < 0.6;
        caret.style.opacity = active ? '1' : Math.floor(t / 530) % 2 ? '0' : '1';
      }
    }
    // The send button pulses at the moment of sending.
    if (sendRef.current) {
      const sent = plan.messages.find(
        (m) => m.side === 'out' && t >= m.appearAt && t < m.appearAt + 420,
      );
      const k = sent ? envelope((t - sent.appearAt) / 420, 0.35) : 0;
      sendRef.current.style.transform = `scale(${(1 + 0.14 * k).toFixed(3)})`;
      sendRef.current.dataset['active'] = typed || sent ? '1' : '0';
    }
    if (statusRef.current) {
      const typing = structure.typingId !== null;
      statusRef.current.dataset['typing'] = typing ? '1' : '0';
    }
  });

  const contact = track?.artists[0] ?? 'Unknown';

  return (
    <div className="msg-thread">
      <div className="scene-floor" aria-hidden />
      {/* The artwork hangs further back in the room, like a second screen. */}
      <FloatingRig
        className="msg-thread__art"
        drift={{ rotY: -16, rotX: 2, z: -260, ampY: 1.2, ampX: 0.5, ampLift: 6, phase: 2.1 }}
      >
        <EdgePanel intensity="quiet" radius={10} lightAngle={-25}>
          <div className="msg-thread__art-inner">
            <Artwork track={track} />
          </div>
        </EdgePanel>
      </FloatingRig>

      <FloatingRig className="msg-thread__rig" drift={{ rotY: 5, rotX: 1.6, ampY: 1.4 }}>
        <EdgePanel
          className="msg-thread__window"
          radius={18}
          notch={{ width: 120, depth: 8, at: 0.5 }}
          breathe
          lightAngle={-8}
          data-testid="messages-thread"
        >
          <header className="thread-head">
            <div className="thread-head__who">
              <div className="thread-head__avatar">
                <Artwork track={track} size={34} />
              </div>
              <div>
                <div className="thread-head__name">{contact}</div>
                <div className="thread-head__status" ref={statusRef} data-typing="0">
                  <span className="thread-head__sub">{track?.album ?? track?.title ?? ''}</span>
                  <span className="thread-head__typing">typing…</span>
                </div>
              </div>
            </div>
            <div className="thread-head__actions" aria-hidden>
              <Icon name="phone" />
              <Icon name="video" />
              <Icon name="info" />
            </div>
          </header>

          <div className="thread-body" ref={scrollRef}>
            {items.map((it) => (
              <div
                key={it.key}
                className={`thread-item thread-item--${it.kind} ${
                  it.kind !== 'sep' ? `side-${it.m.side}` : ''
                }`}
                data-item={it.key}
                style={{ visibility: 'hidden' }}
              >
                {it.kind === 'sep' && <Separator label={it.label} />}
                {it.kind === 'msg' && <Bubble m={it.m} />}
                {it.kind === 'typing' && <TypingBubble />}
                {it.kind === 'receipt' && <Receipt m={it.m} getTime={getTime} />}
              </div>
            ))}
          </div>

          <footer className="compose">
            <div className="compose__plus" aria-hidden>
              <Icon name="plus" />
            </div>
            <div className="compose__field" ref={composeRef} data-state="empty">
              <span className="compose__placeholder">Message</span>
              <span className="compose__text" ref={composeTextRef} />
              <span className="compose__caret" />
            </div>
            <div className="compose__send" ref={sendRef} data-active="0" aria-hidden>
              <Icon name="arrowUp" size={14} />
            </div>
          </footer>
        </EdgePanel>
      </FloatingRig>
    </div>
  );
}

function Separator({ label }: { label: string }) {
  const [day, ...rest] = label.split(' ');
  const isDay = day === 'Today';
  return (
    <div className="thread-sep">
      {isDay ? (
        <>
          <b>{day}</b> {rest.join(' ')}
        </>
      ) : (
        label
      )}
    </div>
  );
}

/** "Delivered" until the other side starts replying, then "Read <time>". */
function Receipt({ m, getTime }: { m: PlannedMessage; getTime: () => number }) {
  const ref = useRef<HTMLDivElement>(null);
  useTicker(() => {
    const el = ref.current;
    if (!el) return;
    const read = m.readAt !== null && getTime() >= m.readAt;
    if (el.dataset['read'] !== String(read)) el.dataset['read'] = String(read);
  });
  return (
    <div className="thread-receipt" ref={ref} data-read="false">
      <span className="thread-receipt__delivered">Delivered</span>
      <span className="thread-receipt__read">Read</span>
    </div>
  );
}
