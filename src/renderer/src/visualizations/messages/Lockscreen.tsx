import { useMemo, useRef } from 'react';
import { FloatingRig } from '@/design/FloatingRig';
import { Icon } from '@/design/Icon';
import { useTicker } from '@/engine/ticker';
import { clamp, hash01 } from '@/animation/easing';
import { spring, springs } from '@/animation/spring';
import type { SceneProps } from '../types';
import { applySungWords } from './Bubble';
import { clockLabel, composeAt, type ConversationPlan, type PlannedMessage } from './plan';
import type { ConversationStructure } from './useConversation';
import { useHeights } from './useHeights';

const VISIBLE = 4;
const KEEP = 7;
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
  let wake = 0.08;
  for (const m of plan.messages) {
    if (m.appearAt > t) break;
    const age = t - m.appearAt;
    if (age > 9000) continue;
    const rise = clamp(age / 220);
    const fall = age < 3500 ? 1 : 1 - clamp((age - 3500) / 5500);
    wake = Math.max(wake, rise * fall);
  }
  return wake;
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
  const screenRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const lastClock = useRef('');

  const date = useMemo(() => {
    const d = Math.floor(hash01(seed, 21) * 7);
    const mo = Math.floor(hash01(seed, 22) * 12);
    const day = 1 + Math.floor(hash01(seed, 23) * 28);
    return `${DAYS[d]} ${day} ${MONTHS[mo]}`;
  }, [seed]);

  const heights = useHeights(listRef, 'card', [cards]);

  useTicker(() => {
    const t = getTime();
    const root = listRef.current;

    // Newest notification on top; older ones slide down. Beyond VISIBLE they tuck into a pile.
    if (root) {
      let y = 0;
      cards.forEach((m, rank) => {
        const el = root.querySelector<HTMLElement>(`[data-card="${m.id}"]`);
        const age = t - m.appearAt;
        const s = spring(age, springs.land);
        const p = spring(age, springs.glide);
        const h = heights.current.get(m.id) ?? 0;
        // How far down the pile this card is, continuously (so the shuffle animates).
        const depth = cards
          .slice(0, rank)
          .reduce((d, newer) => d + spring(t - newer.appearAt, springs.glide), 0);
        const piled = Math.max(0, depth - (VISIBLE - 1));
        const scale = (1 - Math.min(piled, 2) * 0.05) * (0.92 + 0.08 * s);
        const opacity = clamp(age / 160) * clamp(1 - Math.max(0, piled - 1.6) / 0.8);
        if (el) {
          const enterY = (1 - s) * -28;
          const pileY = Math.min(piled, 2) * 9 - (piled > 0 ? (h + 10) * Math.min(piled, 1) : 0);
          el.style.transform = `translate3d(0, ${(y + enterY + pileY).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
          el.style.opacity = opacity.toFixed(3);
          el.style.zIndex = String(100 - rank);
          el.style.visibility = opacity < 0.002 ? 'hidden' : 'visible';
          applySungWords(el, m, t);
        }
        if (piled <= 0) y += (h + 10) * p;
      });
    }

    // The screen wakes with each notification and the light spills onto the table.
    const wake = screenWake(plan, t);
    screenRef.current?.style.setProperty('--wake', wake.toFixed(3));
    floorRef.current?.style.setProperty('--wake', wake.toFixed(3));

    const label = clockLabel(t, seed).replace(/ (AM|PM)$/, '');
    if (label !== lastClock.current && clockRef.current) {
      lastClock.current = label;
      clockRef.current.textContent = label;
    }

    // Outgoing lines are typed as a quick reply under the newest notification.
    const reply = replyRef.current;
    if (reply) {
      const c = composeAt(plan, t);
      const text = reply.querySelector<HTMLElement>('.lock-reply__text');
      if (text && text.textContent !== (c?.typed ?? '')) text.textContent = c?.typed ?? '';
      reply.dataset['open'] = c ? '1' : '0';
      const caret = reply.querySelector<HTMLElement>('.lock-reply__caret');
      if (caret)
        caret.style.opacity = c && c.wordProgress < 0.6 ? '1' : Math.floor(t / 530) % 2 ? '0' : '1';
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
        <div className="phone" data-testid="messages-lockscreen">
          <div className="phone__screen" ref={screenRef}>
            <div className="phone__island" aria-hidden />
            <div className="lock-head">
              <div className="lock-head__date">{date}</div>
              <div className="lock-head__clock tabular" ref={clockRef} />
            </div>
            <div className="lock-list" ref={listRef}>
              {cards.map((m) => (
                <NotificationCard key={m.id} m={m} contact={contact} />
              ))}
            </div>
            <div className="lock-reply" ref={replyRef} data-open="0">
              <span className="lock-reply__text" />
              <span className="lock-reply__caret" />
              <span className="lock-reply__send">
                <Icon name="arrowUp" size={12} />
              </span>
            </div>
            <div className="phone__home" aria-hidden />
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
