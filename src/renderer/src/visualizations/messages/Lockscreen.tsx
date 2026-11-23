import { useMemo, useRef } from 'react';
import { Artwork } from '@/design/Artwork';
import { FloatingRig } from '@/design/FloatingRig';
import { Icon } from '@/design/Icon';
import { useTicker } from '@/engine/ticker';
import { clamp, hash01, mix, smoothstep } from '@/animation/easing';
import { spring, springs } from '@/animation/spring';
import { formatTime } from '@/app/format';
import type { SceneProps } from '../types';
import { applySungWords } from './Bubble';
import { clockLabel, composeAt, type ConversationPlan, type PlannedMessage } from './plan';
import type { ConversationStructure } from './useConversation';
import { useSizes } from './useSizes';

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
  let wake = Math.max(0.1, smoothstep(0, 500, t) * (1 - smoothstep(5000, 10_000, t)));
  for (const m of plan.messages) {
    if (m.appearAt > t) break;
    const age = t - m.appearAt;
    if (age > 9000) continue;
    const rise = smoothstep(0, 260, age);
    const fall = age < 3500 ? 1 : 1 - smoothstep(3500, 9000, age);
    wake = Math.max(wake, rise * fall);
  }
  return wake;
}

/** A phone buzzing on a table: a short, fast, decaying shake (px) — incoming messages only. */
function buzz(plan: ConversationPlan, landed: number, t: number): { x: number; r: number } {
  const m = plan.messages[landed];
  if (!m || m.side !== 'in') return { x: 0, r: 0 };
  const age = t - m.appearAt;
  if (age < 0 || age > 520) return { x: 0, r: 0 };
  const env = Math.exp(-age / 150) * smoothstep(0, 30, age);
  const w = Math.sin((age / 44) * Math.PI * 2);
  const w2 = Math.sin((age / 61) * Math.PI * 2 + 1.1);
  return { x: 1.5 * env * w, r: 0.16 * env * w2 };
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
  const shown = useRef({ clock: '', elapsed: '', reply: '' });

  const date = useMemo(() => {
    const d = Math.floor(hash01(seed, 21) * 7);
    const mo = Math.floor(hash01(seed, 22) * 12);
    const day = 1 + Math.floor(hash01(seed, 23) * 28);
    return `${DAYS[d]} ${day} ${MONTHS[mo]}`;
  }, [seed]);

  const { sizes, els } = useSizes(listRef, 'card', [cards]);

  useTicker(() => {
    const t = getTime();

    // ── Notifications: newest on top, older ones slide down; beyond VISIBLE they tuck into a
    //    pile behind, peeking out as thin layered edges.
    let y = 0;
    let depth = 0; // continuous: how many newer cards have (partly) arrived above this one
    for (let rank = 0; rank < cards.length; rank++) {
      const m = cards[rank]!;
      const el = els.current.get(m.id);
      const age = t - m.appearAt;
      const s = spring(age, springs.land);
      // The stack makes room in step with the arriving card, so they never overlap.
      const p = s;
      const h = sizes.current.get(m.id)?.h ?? 0;
      const piled = Math.max(0, depth - (VISIBLE - 1));
      if (el) {
        const tuck = Math.min(piled, 1);
        const pileIndex = Math.min(piled, 2.2);
        const scale = (1 - pileIndex * 0.05) * mix(0.9, 1, s);
        const opacity = clamp(age / 40) * (1 - smoothstep(1.4, 2.2, piled));
        // Once tucked, a card hides behind the one above, showing only a sliver of its edge.
        const pileY = -tuck * (h + GAP) + pileIndex * 9;
        el.style.transform = `translate3d(0, ${(y + pileY).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
        // The arriving card unfolds downward exactly as fast as the stack below makes room, so it
        // never covers the card beneath it (or the player above). Clip is in pre-scale pixels.
        const room = (h + GAP) * s - GAP;
        const cut = rank === 0 && h > 0 ? h - Math.max(0, room) / scale : 0;
        const clip = cut > 0.5 ? `inset(0 0 ${cut.toFixed(1)}px 0 round 6cqw)` : '';
        if (el.style.clipPath !== clip) el.style.clipPath = clip;
        // While half-unfolded it is still faint, so cut-off text never reads as a glitch.
        const shownFrac = h > 0 ? 1 - Math.max(0, cut) / h : 1;
        el.style.opacity = (opacity * smoothstep(0.15, 0.8, shownFrac)).toFixed(3);
        el.style.zIndex = String(100 - rank);
        const vis = opacity < 0.002 ? 'hidden' : 'visible';
        if (el.style.visibility !== vis) el.style.visibility = vis;
        // Piled cards dim slightly, like the real stack.
        el.dataset['piled'] = piled > 0.5 ? '1' : '0';
        applySungWords(el, m, t);
      }
      if (piled <= 0) y += (h + GAP) * p;
      depth += p;
    }

    // ── The screen wakes with each notification: brightness, the wallpaper's settle-zoom,
    //    and its light spilling onto the table. All compositor-only.
    const wake = screenWake(plan, t);
    if (dimRef.current) dimRef.current.style.opacity = (0.72 * (1 - wake)).toFixed(3);
    if (wallRef.current)
      wallRef.current.style.transform = `scale(${(1.1 - 0.1 * smoothstep(0, 1, wake)).toFixed(4)})`;
    if (contentRef.current)
      contentRef.current.style.transform = `scale(${(1.025 - 0.025 * wake).toFixed(4)})`;
    if (floorRef.current) floorRef.current.style.opacity = (0.28 + wake * 0.72).toFixed(3);

    const b = buzz(plan, structure.landed, t);
    if (phoneRef.current)
      phoneRef.current.style.transform = `translate3d(${b.x.toFixed(2)}px, 0, 0) rotate(${b.r.toFixed(3)}deg)`;

    const sh = shown.current;
    const label = clockLabel(t, seed).replace(/ (AM|PM)$/, '');
    if (label !== sh.clock && clockRef.current) clockRef.current.textContent = sh.clock = label;

    // ── Now Playing widget.
    if (fillRef.current && track)
      fillRef.current.style.transform = `scaleX(${clamp(t / track.durationMs).toFixed(4)})`;
    const el = formatTime(t);
    if (el !== sh.elapsed && elapsedRef.current) elapsedRef.current.textContent = sh.elapsed = el;
    if (playerRef.current) {
      // It steps back a little while the conversation is busy, like a widget losing focus.
      const busy = cards.length ? spring(t - cards[cards.length - 1]!.appearAt, springs.settle) : 0;
      playerRef.current.style.opacity = (1 - 0.35 * busy).toFixed(3);
    }

    // ── Outgoing lines are typed as a quick reply at the bottom.
    const c = composeAt(plan, t);
    const reply = replyRef.current;
    if (reply) {
      // Keep the last words while the field fades away after sending.
      const typed = c?.typed ?? sh.reply;
      if (typed !== sh.reply && replyTextRef.current)
        replyTextRef.current.textContent = sh.reply = typed;
      const open = c ? '1' : '0';
      if (reply.dataset['open'] !== open) reply.dataset['open'] = open;
      if (caretRef.current) {
        const on = (c && c.wordProgress < 0.6) || Math.floor(t / 530) % 2 === 0;
        caretRef.current.style.opacity = on ? '1' : '0';
      }
    }
  });

  const contact = track?.artists[0] ?? 'Unknown';

  return (
    <div className="msg-lock">
      <div className="msg-lock__floor" ref={floorRef} aria-hidden />
      <FloatingRig
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
      </FloatingRig>
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
          {m.words.map((w, i) => (
            <span key={i}>
              {i > 0 && ' '}
              <span className="bw" data-sung={out ? '1' : '0'}>
                {w.text}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
