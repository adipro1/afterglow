import { useMemo, useRef } from 'react';
import { Artwork } from '@/design/Artwork';
import { Icon } from '@/design/Icon';
import {
  Rig,
  Words,
  applyTyping,
  clamp,
  enter,
  flowStack,
  hash01,
  mix,
  pulse,
  ramp,
  revealClip,
  setData,
  setStyle,
  setText,
  setTransform,
  shake,
  smoothstep,
  springs,
  transform,
  useMeasure,
  useTicker,
} from '@/engine';
import { formatTime } from '@/app/format';
import type { SceneProps } from '../types';
import { applySungWords } from './Bubble';
import { clockLabel, composeAt, type ConversationPlan, type PlannedMessage } from './plan';
import type { ConversationStructure } from './useConversation';

/** Notifications fully shown before older ones tuck into the pile behind. */
const VISIBLE = 3;
const KEEP = 7;
const GAP = 8;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** How lit the screen is: it wakes on each arrival and fades back down, like a real phone. */
function screenWake(plan: ConversationPlan, t: number): number {
  // Music starting wakes the phone too; it dozes off again if nothing arrives.
  let wake = Math.max(0.1, pulse(t, 0, 500, 5000, 5000));
  for (const m of plan.messages) {
    if (m.appearAt > t) break;
    wake = Math.max(wake, pulse(t, m.appearAt, 260, 3500, 5500));
  }
  return wake;
}

/** A phone buzzing on a table — incoming messages only. */
function buzz(plan: ConversationPlan, landed: number, t: number) {
  const m = plan.messages[landed];
  if (!m || m.side !== 'in') return { x: 0, rot: 0 };
  return shake(t - m.appearAt, { amp: 1.5, rot: 0.16 });
}

export function Lockscreen({
  track,
  getTime,
  plan,
  structure,
  seed,
}: SceneProps & { plan: ConversationPlan; structure: ConversationStructure }) {
  const cards = useMemo(() => {
    const from = Math.max(0, structure.landed - KEEP + 1);
    return plan.messages.slice(from, structure.landed + 1).reverse(); // newest first
  }, [plan, structure.landed]);

  const listRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const replyTextRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const lastReply = useRef('');

  const date = useMemo(() => {
    const d = Math.floor(hash01(seed, 21) * 7);
    const mo = Math.floor(hash01(seed, 22) * 12);
    const day = 1 + Math.floor(hash01(seed, 23) * 28);
    return `${DAYS[d]} ${day} ${MONTHS[mo]}`;
  }, [seed]);

  const { sizes, els } = useMeasure(listRef, 'card', [cards]);

  useTicker(() => {
    const t = getTime();

    // ── Notifications: newest on top, older ones slide down; beyond VISIBLE they tuck into a
    //    pile behind, peeking out as thin layered edges. The stack makes room in step with the
    //    arriving card (same spring), so they never overlap.
    const arrive = (m: PlannedMessage) => enter(t, m.appearAt, springs.land);
    const height = (m: PlannedMessage) => sizes.current.get(m.id)?.h ?? 0;
    const slots = flowStack(cards, {
      size: (m) => height(m) + GAP,
      presence: arrive,
      occupies: (_, depth) => depth <= VISIBLE - 1,
    });
    cards.forEach((m, rank) => {
      const el = els.current.get(m.id);
      if (!el) return;
      const { offset: y, depth, presence: s } = slots[rank]!;
      const h = height(m);
      const piled = Math.max(0, depth - (VISIBLE - 1));
      const tuck = Math.min(piled, 1);
      const pileIndex = Math.min(piled, 2.2);
      const scale = (1 - pileIndex * 0.05) * mix(0.9, 1, s);
      const opacity = ramp(t, m.appearAt, 40) * (1 - smoothstep(1.4, 2.2, piled));
      // Once tucked, a card hides behind the one above, showing only a sliver of its edge.
      const pileY = -tuck * (h + GAP) + pileIndex * 9;
      setTransform(el, transform({ y: y + pileY, scale }));
      // The arriving card unfolds downward exactly as fast as the stack below makes room, so it
      // never covers the card beneath it (or the player above). Clip is in pre-scale pixels.
      const room = Math.max(0, (h + GAP) * s - GAP) / scale;
      const unfolding = rank === 0 && h > 0;
      const clip = unfolding
        ? revealClip({ w: 0, h }, { w: 0, h: room }, { anchor: 'top', radius: '6cqw' })
        : '';
      setStyle(el, 'clipPath', clip);
      // While half-unfolded it is still faint, so cut-off text never reads as a glitch.
      const shownFrac = unfolding ? Math.min(1, room / h) : 1;
      setStyle(el, 'opacity', (opacity * smoothstep(0.15, 0.8, shownFrac)).toFixed(3));
      setStyle(el, 'visibility', opacity < 0.002 ? 'hidden' : 'visible');
      setStyle(el, 'zIndex', String(100 - rank));
      // Piled cards dim slightly, like the real stack.
      setData(el, 'piled', piled > 0.5 ? '1' : '0');
      applySungWords(el, m, t);
    });

    // ── The screen wakes with each notification: brightness, the wallpaper's settle-zoom,
    //    and its light spilling onto the table. All compositor-only.
    const wake = screenWake(plan, t);
    setStyle(dimRef.current, 'opacity', (0.72 * (1 - wake)).toFixed(3));
    setTransform(wallRef.current, `scale(${(1.1 - 0.1 * smoothstep(0, 1, wake)).toFixed(4)})`);
    setTransform(contentRef.current, `scale(${(1.025 - 0.025 * wake).toFixed(4)})`);
    setStyle(floorRef.current, 'opacity', (0.28 + wake * 0.72).toFixed(3));

    const b = buzz(plan, structure.landed, t);
    setTransform(phoneRef.current, transform({ x: b.x, rotateZ: b.rot }));

    setText(clockRef.current, clockLabel(t, seed).replace(/ (AM|PM)$/, ''));

    // ── Now Playing widget.
    if (track) setTransform(fillRef.current, `scaleX(${clamp(t / track.durationMs).toFixed(4)})`);
    setText(elapsedRef.current, formatTime(t));
    // It steps back a little while the conversation is busy, like a widget losing focus.
    const oldest = cards[cards.length - 1];
    const busy = oldest ? enter(t, oldest.appearAt, springs.settle) : 0;
    setStyle(playerRef.current, 'opacity', (1 - 0.35 * busy).toFixed(3));

    // ── Outgoing lines are typed as a quick reply at the bottom; the last words stay while
    //    the field fades away after sending.
    const c = composeAt(plan, t);
    applyTyping(
      replyTextRef.current,
      caretRef.current,
      { text: c?.typed ?? null, arriving: !!c && c.wordProgress < 0.6 },
      t,
      lastReply,
    );
    setData(replyRef.current, 'open', c ? '1' : '0');
  });

  const contact = track?.artists[0] ?? 'Unknown';

  return (
    <div className="msg-lock">
      <div className="msg-lock__floor" ref={floorRef} aria-hidden />
      <Rig
        className="msg-lock__rig"
        drift={{ rotX: 24, rotY: -7, rotZ: -9, ampY: 1.2, ampX: 0.8, ampLift: 3, phase: 0.7 }}
      >
        <div className="phone" ref={phoneRef} data-testid="messages-lockscreen">
          <div className="phone__screen">
            <div className="phone__wall" ref={wallRef} aria-hidden />
            <div className="phone__content" ref={contentRef}>
              <div className="phone__island" aria-hidden />
              <div className="lock-head">
                <div className="lock-head__date">{date}</div>
                <div className="lock-head__clock tabular" ref={clockRef} />
              </div>
              <div className="lock-player" ref={playerRef}>
                <div className="lock-player__art">
                  <Artwork track={track} />
                </div>
                <div className="lock-player__meta">
                  <div className="lock-player__title">{track?.title ?? ''}</div>
                  <div className="lock-player__artist">{contact}</div>
                  <div className="lock-player__bar">
                    <div className="lock-player__fill" ref={fillRef} />
                  </div>
                  <div className="lock-player__times tabular">
                    <span ref={elapsedRef} />
                    <span>{track ? formatTime(track.durationMs) : ''}</span>
                  </div>
                </div>
              </div>
              <div className="lock-list" ref={listRef}>
                {cards.map((m) => (
                  <NotificationCard key={m.id} m={m} contact={contact} />
                ))}
              </div>
              <div className="lock-reply" ref={replyRef} data-open="0">
                <span className="lock-reply__text" ref={replyTextRef} />
                <span className="lock-reply__caret" ref={caretRef} />
                <span className="lock-reply__send">
                  <Icon name="arrowUp" size={12} />
                </span>
              </div>
              <div className="phone__home" aria-hidden />
            </div>
            {/* A sleeping screen is nearly black; this lifts as it wakes. */}
            <div className="phone__dim" ref={dimRef} aria-hidden />
          </div>
        </div>
      </Rig>
    </div>
  );
}

function NotificationCard({ m, contact }: { m: PlannedMessage; contact: string }) {
  const out = m.side === 'out';
  return (
    <div className={`lock-card ${out ? 'is-out' : ''}`} data-card={m.id}>
      <div className="lock-card__icon">
        <Icon name="bubble" size={15} />
      </div>
      <div className="lock-card__main">
        <div className="lock-card__row">
          <span className="lock-card__who">{out ? 'You' : contact}</span>
          <span className="lock-card__when">{out ? 'Delivered' : 'now'}</span>
        </div>
        <div className="lock-card__text">
          <Words words={m.words} wordClass="bw" attr="sung" initial={out ? '1' : '0'} />
        </div>
      </div>
    </div>
  );
}
