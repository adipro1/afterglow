import { useMemo, useRef } from 'react';
import { EdgePanel } from '@/design/EdgePanel';
import { Artwork } from '@/design/Artwork';
import { Icon } from '@/design/Icon';
import {
  Rig,
  applyTyping,
  clamp,
  enter,
  flash,
  flowStack,
  mix,
  nudge,
  presence,
  ramp,
  revealClip,
  setData,
  setOpacity,
  setStyle,
  setTransform,
  smoothstep,
  springs,
  transform,
  useClientHeight,
  useMeasure,
  useTicker,
  type Box,
} from '@/engine';
import type { SceneProps } from '../types';
import { Bubble, TypingBubble, applyReaction, applySungWords, applyTypingDots } from './Bubble';
import { clockLabel, composeAt, type ConversationPlan, type PlannedMessage } from './plan';
import type { ConversationStructure } from './useConversation';

/** How many landed messages stay mounted (older ones have scrolled out of view). */
const KEEP = 9;
/** Distance (px) from a new bubble's resting place down to the compose field it rises from. */
const RISE_PX = 52;
/** Typing indicator size, until measured. */
const TYPING_FALLBACK = { w: 62, h: 38 };

type Item =
  | { kind: 'intro'; key: string }
  | { kind: 'sep'; key: string; m: PlannedMessage; label: string }
  | { kind: 'msg'; key: string; m: PlannedMessage }
  | { kind: 'receipt'; key: string; m: PlannedMessage; hideAt: number }
  | { kind: 'typing'; key: string; m: PlannedMessage };

function buildItems(plan: ConversationPlan, s: ConversationStructure): Item[] {
  const items: Item[] = [];
  const msgs = plan.messages;
  const from = Math.max(0, s.landed - KEEP + 1);
  // The conversation opens with the contact's card, until it has scrolled far away.
  if (from === 0) items.push({ kind: 'intro', key: 'intro' });
  for (let i = from; i <= s.landed; i++) {
    const m = msgs[i]!;
    if (m.separator && i > 0)
      items.push({ kind: 'sep', key: `sep:${m.id}`, m, label: m.separator });
    items.push({ kind: 'msg', key: m.id, m });
    if (m.side === 'out') {
      const nextOut = msgs.slice(i + 1).find((n) => n.side === 'out');
      items.push({ kind: 'receipt', key: `rc:${m.id}`, m, hideAt: nextOut?.appearAt ?? Infinity });
    }
  }
  // The typing indicator for the next incoming message, or the one that just landed
  // (kept briefly so it can hand over smoothly to the real bubble growing in its place).
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
function weight(it: Item, t: number): number {
  switch (it.kind) {
    case 'intro':
      return 1;
    case 'sep':
    case 'msg':
      return enter(t, it.m.appearAt, springs.glide);
    case 'receipt':
      return presence(t, it.m.appearAt + 240, it.hideAt, springs.glide);
    case 'typing':
      return presence(t, it.m.typingFrom ?? 0, it.m.appearAt, springs.snap);
  }
}

function gapAfter(it: Item, next: Item | undefined): number {
  if (!next) return 0;
  if (it.kind === 'intro') return 28;
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
  seed,
}: SceneProps & { plan: ConversationPlan; structure: ConversationStructure }) {
  const items = useMemo(() => buildItems(plan, structure), [plan, structure]);
  // The thread grows upward from the compose field: lay it out newest-first.
  const stackOrder = useMemo(() => [...items].reverse(), [items]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const composeTextRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const sendRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<SVGSVGElement>(null);
  const kickRef = useRef<HTMLDivElement>(null);
  const typingSize = useRef<Box>(TYPING_FALLBACK);
  const lastTyped = useRef('');

  // Natural sizes of every item, tracked as they re-wrap or the window resizes.
  const { sizes, els } = useMeasure(scrollRef, 'item', [items]);
  const bodyH = useClientHeight(scrollRef);

  useTicker(() => {
    const t = getTime();

    // ── The stack, from the bottom up. Each item sits above everything newer, weighted by how
    //    present it is, so arrivals push older messages up smoothly.
    const typing = items.find((it) => it.kind === 'typing');
    const ts = typing && sizes.current.get(typing.key);
    if (ts && ts.w > 0) typingSize.current = ts;
    const slots = flowStack(stackOrder, {
      size: (it) => sizes.current.get(it.key)?.h ?? 0,
      presence: (it) => weight(it, t),
      gap: gapAfter,
    });

    stackOrder.forEach((it, i) => {
      const el = els.current.get(it.key);
      if (!el) return;
      const { offset: y, presence: p } = slots[i]!;
      const size = sizes.current.get(it.key);
      let extraY = 0;
      let scale = 1;
      let opacity = clamp(p * 1.6);
      if (it.kind === 'msg') {
        const m = it.m;
        const s = enter(t, m.appearAt, springs.land);
        if (m.side === 'out') {
          // Sent: the bubble — text and all — lifts out of the compose field into place.
          extraY = (1 - s) * RISE_PX;
          scale = mix(0.92, 1, s);
          opacity = ramp(t, m.appearAt, 60);
        } else if (m.typingFrom !== null && size && size.w > 0) {
          // Received after typing: the typing bubble grows into the message.
          morph(el, t - m.appearAt, s, size, typingSize.current);
          opacity = 1;
        } else {
          scale = mix(0.86, 1, s);
          extraY = (1 - s) * 10;
          opacity = ramp(t, m.appearAt, 120);
        }
        applySungWords(el, m, t);
        applyReaction(el, m, t);
      } else if (it.kind === 'typing') {
        const from = it.m.typingFrom ?? 0;
        scale = mix(0.5, 1, enter(t, from, springs.pop));
        // Gone the instant the real message takes its place.
        opacity = ramp(t, from, 120) * (t >= it.m.appearAt ? 0 : 1);
        applyTypingDots(el, t);
      } else if (it.kind === 'intro') {
        // Rest in the middle of the empty thread; get pushed up once messages fill it.
        const centre = Math.max(0, (bodyH.current - (size?.h ?? 0)) / 2 - 18);
        extraY = -Math.max(0, centre - y);
        opacity = 1;
      }
      setTransform(el, transform({ y: -y + extraY, scaleX: scale, scaleY: scale }));
      setOpacity(el, opacity);
    });

    // ── Compose field: the outgoing line is typed as it's sung; on send the text leaves
    //    inside the bubble, so the field simply clears.
    const c = composeAt(plan, t);
    applyTyping(
      composeTextRef.current,
      caretRef.current,
      { text: c?.typed ?? null, arriving: !!c && c.wordProgress < 0.6 },
      t,
      lastTyped,
      false,
    );
    setData(composeRef.current, 'state', c ? 'typing' : 'empty');

    // ── Send button pulses at the moment of sending; the window answers with a tiny nudge,
    //    and the edge light flares whenever anything arrives.
    const last = plan.messages[structure.landed];
    const lastAge = last ? t - last.appearAt : Infinity;
    const sent = last?.side === 'out';
    const pulse = sent ? nudge(lastAge, 110) : 0;
    setTransform(sendRef.current, `scale(${(1 + 0.16 * pulse).toFixed(3)})`);
    setData(sendRef.current, 'active', c || (sent && lastAge < 300) ? '1' : '0');
    const k = nudge(lastAge, 160) * (sent ? 1 : 0.5);
    setTransform(kickRef.current, transform({ y: -2.2 * k, scale: 1 + 0.0035 * k }));
    setStyle(flashRef.current, 'opacity', (0.65 * flash(lastAge, 90, 650)).toFixed(3));
    setData(statusRef.current, 'typing', structure.typingId !== null ? '1' : '0');
  });

  const contact = track?.artists[0] ?? 'Unknown';
  const opened = plan.messages[0]?.separator ?? `Today ${clockLabel(0, seed)}`;

  return (
    <div className="msg-thread">
      <div className="scene-floor" aria-hidden />
      {/* The artwork hangs further back in the room, like a second screen. */}
      <Rig
        className="msg-thread__art"
        drift={{ rotY: -16, rotX: 2, z: -260, ampY: 1.2, ampX: 0.5, ampLift: 6, phase: 2.1 }}
      >
        <EdgePanel intensity="quiet" radius={10} lightAngle={-25}>
          <div className="msg-thread__art-inner">
            <Artwork track={track} />
          </div>
        </EdgePanel>
      </Rig>

      <Rig className="msg-thread__rig" drift={{ rotY: 5, rotX: 1.6, ampY: 1.4 }}>
        <div className="msg-thread__kick" ref={kickRef}>
          <EdgePanel
            className="msg-thread__window"
            radius={18}
            notch={{ width: 120, depth: 8, at: 0.5 }}
            breathe
            flashRef={flashRef}
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
                    it.kind === 'msg' || it.kind === 'typing' || it.kind === 'receipt'
                      ? `side-${it.m.side}`
                      : ''
                  }`}
                  data-item={it.key}
                  style={{ visibility: 'hidden' }}
                >
                  {it.kind === 'intro' && (
                    <div className="thread-intro">
                      <div className="thread-intro__avatar">
                        <Artwork track={track} size={64} />
                      </div>
                      <div className="thread-intro__name">{contact}</div>
                      <div className="thread-intro__meta">iMessage · {opened}</div>
                    </div>
                  )}
                  {it.kind === 'sep' && <Separator label={it.label} />}
                  {it.kind === 'msg' && <Bubble m={it.m} />}
                  {it.kind === 'typing' && <TypingBubble />}
                  {it.kind === 'receipt' && <Receipt m={it.m} getTime={getTime} seed={seed} />}
                </div>
              ))}
              <div className="thread-fade" aria-hidden />
            </div>

            <footer className="compose">
              <div className="compose__plus" aria-hidden>
                <Icon name="plus" />
              </div>
              <div className="compose__field" ref={composeRef} data-state="empty">
                <span className="compose__placeholder">iMessage</span>
                <span className="compose__text" ref={composeTextRef} />
                <span className="compose__caret" ref={caretRef} />
              </div>
              <div className="compose__send" ref={sendRef} data-active="0" aria-hidden>
                <Icon name="arrowUp" size={14} />
              </div>
            </footer>
          </EdgePanel>
        </div>
      </Rig>
    </div>
  );
}

/** Reveal an incoming bubble through a rounded window growing out of the typing bubble. */
function morph(el: HTMLElement, age: number, s: number, size: Box, from: Box) {
  const bubble = el.firstElementChild as HTMLElement | null;
  if (!bubble) return;
  const text = bubble.firstElementChild as HTMLElement | null;
  if (age > 900) {
    setStyle(bubble, 'clipPath', '');
    setStyle(text, 'opacity', '');
    return;
  }
  const shown = {
    w: mix(Math.min(size.w, from.w), size.w, s),
    h: mix(Math.min(size.h, from.h), size.h, s),
  };
  // Anchored bottom-left like the typing bubble; the bleed keeps the tail visible.
  const clip = revealClip(size, shown, {
    anchor: 'bottom-left',
    radius: Math.min(shown.h / 2, 19),
    bleed: 12,
  });
  setStyle(bubble, 'clipPath', clip);
  setStyle(text, 'opacity', smoothstep(60, 260, age).toFixed(3));
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
function Receipt({ m, getTime, seed }: { m: PlannedMessage; getTime: () => number; seed: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useTicker(() => {
    setData(ref.current, 'read', String(m.readAt !== null && getTime() >= m.readAt));
  });
  return (
    <div className="thread-receipt" ref={ref} data-read="false">
      <span className="thread-receipt__delivered">Delivered</span>
      <span className="thread-receipt__read">
        <b>Read</b> {m.readAt !== null ? clockLabel(m.readAt, seed) : ''}
      </span>
    </div>
  );
}
