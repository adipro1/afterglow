# Phase 2 — Messages, the first visualisation

_Completed 23 Nov 2026_

Messages is the quality benchmark for every visualisation that follows. It turns a song into a
conversation: lines are typed, sent, delivered, read and answered — all in time with the lyrics.

## How a song becomes a conversation

`visualizations/messages/plan.ts` builds a **conversation plan** from the timed lyrics. It is a
pure function: the same lyrics always give the same conversation, and the picture at any moment
is computed from (plan, song time). That's why seeking, pausing and screenshot tests are exact.

1. **Stanzas** — the song is split at silences that are long _for that song_ (1.8× its typical
   gap between lines, never under 1.2 s), because singers breathe very differently.
2. **Who's speaking** — lines the song repeats (its refrain) are what _you_ keep sending:
   outgoing, blue, on the right. The rest arrives from the other person. Songs without a refrain
   alternate stanza by stanza. A featured vocalist answers from the opposite side.
3. **Timing** —
   - Incoming lines land just as they're sung; a _typing…_ indicator shows up to 1.5 s before.
     Their words light up one by one inside the bubble.
   - Outgoing lines are _typed into the compose field_ word by word as they're sung, then sent
     ~0.3 s after the last word starts.
4. **Realism details** — grouped bubbles tuck their corners; a timestamp separator opens the
   thread and returns after long instrumental breaks (on a fictional night-time clock); your
   latest message shows _Delivered_ and flips to _Read_ when the reply starts.

For "Delivered" (the demo song) this produces: the verses arrive from them, the chorus
"Delivered, but never read" is what you keep sending — with real "Delivered" receipts under it —
and the song ends on an incoming "Never read".

## Three compositions

| Variation       | Idea                                                                                                                           | Notable details                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thread**      | A desktop conversation window floating in the void, the album artwork hanging further back like a second screen (reference 1). | Edge-lit window with notch; header avatar, contact, _typing…_ status; centred column with older messages dissolving into the dark; compose bar with live typing and a send pulse.                                     |
| **Lock Screen** | A phone lying face-up on a dark table at night. Each line arrives as a notification.                                           | Screen sleeps nearly black and _wakes_ on each arrival, its light spilling onto the table; big thin clock; notifications stack newest-first and tuck into a pile; outgoing lines typed as a quick reply.              |
| **Drift**       | No interface — just bubbles suspended in space.                                                                                | Each new line pushes older ones up and back into the dark with increasing blur (a lens pulling past them); the room's light shifts toward whoever spoke last; outgoing lines are typed as glowing text at the bottom. |

Switch with **V** (variation) and **S** (scene). The name of the new scene shows briefly at the top.

## New engine pieces (seeds of Phase 3)

- `animation/spring.ts` — closed-form springs: a spring's position is computed directly from
  elapsed time, so animations are seek-safe and need no per-frame state.
- `animation/easing.ts` — easing curves, envelopes, and a seeded hash for deterministic variety.
- `visualizations/types.ts` + `registry.ts` — the plugin contract. Each visualisation provides
  metadata (name, category, variations, themes for the future adaptive director) and a lazily
  loaded `Scene`. Only the active scene's code is loaded.
- `app/Stage.tsx` — scene host: the outgoing scene sinks back and blurs while the new one surfaces,
  then the old one is unmounted. At most two scenes are ever alive.
- `design/FloatingRig.tsx` — reusable "window hanging in the void" camera drift.
- `engine/ambient.ts` — the clock for non-musical motion; frozen in tests for pixel-stable shots.
- Prelude (Phase 1's lyric view) is now a plugin like any other.

## Testing

- **Unit:** 44 tests (+24) — the conversation planner (sides, chorus consistency, grouping,
  typing/compose windows, separators, receipts, line-only and empty lyrics) and motion maths.
- **End-to-end:** 54 tests, including song-change tests (never a blank screen; the old conversation hands over) and motion frame bursts. 27 screenshots of the three compositions at nine moments of the song,
  behaviour checks (typing status, compose field, Delivered→Read, seeking backwards rebuilds the
  thread exactly), and the shell tests.
- **Motion:** frame bursts 80 ms apart around a send and a reply, reviewed as contact sheets
  (this caught the typing dots briefly overlapping a newly landed reply — fixed).
- **Performance on this laptop (Intel Iris Xe, 150 % scaling, 1440×900 window), while playing:**

  | Scene                  | Average fps | 95th-percentile frame | Script per frame |
  | ---------------------- | ----------- | --------------------- | ---------------- |
  | Messages · Thread      | 58.1        | 17.0 ms               | 0.9 ms           |
  | Messages · Lock Screen | 60.0        | 16.9 ms               | 1.0 ms           |
  | Messages · Drift       | 60.0        | 16.9 ms               | 1.3 ms           |
  | Prelude                | 60.0        | 17.0 ms               | 0.5 ms           |

  Prelude initially dropped frames (95th percentile 33 ms) because of a blur animation on its
  very large text; replacing the blur with a lift fixed it.

## Polish round (owner feedback: "not smooth enough", "do more", skipping showed a blank screen)

**Why it felt laggy — measured, then fixed:**

| Cause                                                                                                                                                                                         | Fix                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Song time sped up and slowed down by up to ±50 % as it chased each imprecise once-a-second position report                                                                                    | The clock now averages recent reports (jitter cancels out) and corrects by at most ~6 % speed — measured ±2–3 %, invisible              |
| Every animated element read the clock at a slightly different moment within the frame (a few ms of random error)                                                                              | All animation samples the frame's own timestamp (`ticker.now()`), like Core Animation                                                   |
| GPU passes every frame: per-word blur filters, a re-drawn animated SVG edge light, a blended grain overlay, frosted-glass cards, a mask, a filter-based screen dimmer, blurred scene switches | Each replaced with a compositor-only equivalent that looks the same (pre-drawn light layers that cross-fade, solid materials, overlays) |
| The window was demoted to low priority when unfocused                                                                                                                                         | Background throttling off — a visualiser often plays unfocused                                                                          |
| Testing with `npm run dev` (React debug build)                                                                                                                                                | `npm start` runs the optimised build                                                                                                    |

The remaining occasional long frames were traced to the laptop itself (on battery, the app's thread waited for the CPU: 77 ms wall time for 8.6 ms of work).

**Skipping songs:** the old conversation now sinks away frozen on its last frame while the new one rises, and every variation opens a song with something to look at — Thread: the contact's card ("iMessage · Today 1:49 AM"); Lock Screen: the phone wakes with a Now Playing widget; Drift: the song title, which then recedes into the dark as the first "message".

**More animation:** springs retuned to Apple's response/damping model; the typing bubble grows into the incoming message (revealed through a rounded window so the corners never distort); sent bubbles rise out of the compose field carrying their text; iMessage-style tapbacks (♥ / ‼) pop onto some verse-closing lines; "Read 1:52 AM" receipts; the edge light flares on each arrival and the window gives a tiny nudge on send; the phone buzzes on the table for incoming messages and its wallpaper settles as the screen wakes; notification pile with layered edges; Drift gains drifting out-of-focus light motes and a room light that cross-fades toward whoever spoke last.

## Known limitations

- Who sends which line is decided from song structure (refrain vs verse). Phase 4's
  interpretation engine will make this smarter (e.g. reading "you"/"I" and narrative turns).
- The contact name is the artist; the clock and date are fictional and seeded per song.
- Quality levels don't change these scenes yet (they already run at 60 fps on Balanced hardware);
  Performance mode will drop Drift's blur and the lock screen's backdrop blur in Phase 7.
