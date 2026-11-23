# Phase 3 — The motion engine

_Completed 23 Nov 2026_

Phase 2 proved how AFTERGLOW should move. Phase 3 takes everything Messages invented and turns
it into a shared **motion engine** (`src/renderer/src/engine/`), so the next 24 visualisations
start from the same building blocks instead of re-inventing them. Messages, Prelude and the
scene stage have been rebuilt on top of it, and screenshots prove nothing changed (see
"No regression" below).

## What's in the engine

Everything is imported from one place: `import { … } from '@/engine'`.

| System          | What it does                                                                                                                                                                                                    | Used by                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Time**        | One frame loop for the whole app (`ticker`), ambient time for non-musical motion (`ambient`).                                                                                                                   | everything                                                                    |
| **Timeline**    | Answers "how far along is this moment?" for song time t: `enter`, `presence` (in _and_ out), `ramp`, `flash`, `pulse`, `wave`, `blink`, `lastBefore`.                                                           | arrivals, receipts, typing dots, edge flare, screen wake, carets              |
| **Physics**     | Apple-style springs (`springs.land/glide/snap/pop/settle/camera`, `appleSpring`) and easing curves.                                                                                                             | everything                                                                    |
| **Output**      | The only way per-frame code touches the screen: `setTransform`, `setOpacity`, `setStyle`, `setData`, `setText`, `setSteppedBlur`, and `transform()` to build transforms. Unchanged values are skipped for free. | everything                                                                    |
| **Layout**      | `flowStack` — items that make room for each other as they arrive (and stop pushing once piled). `useMeasure` / `useClientHeight` — sizes without slow layout reads.                                             | Thread's message column, Lock Screen's notification stack, Drift's depth      |
| **Text**        | `Words` renders a line word-by-word; `applyWordStates` lights words as they're sung; `applyTyping` handles typed text and the caret.                                                                            | bubbles, notifications, Prelude lyrics, compose fields                        |
| **Camera**      | `Rig` (the floating, breathing window), `breathe`, `shake` (phone buzz), `nudge` (a push that settles), `move` (spring camera moves between poses).                                                             | every composition                                                             |
| **Transitions** | `revealClip` — shapes that grow open with perfectly round corners. `sceneTransitions` — how one scene hands over to the next: **sink** (default), **push**, **pan**, **fade** (reduced motion).                 | typing bubble → message, notification unfolding, scene/variation/song changes |
| **Field**       | `makeField` / `motePose` — seeded, drifting particles (bokeh, dust, embers).                                                                                                                                    | Drift's background lights                                                     |

The rules that make AFTERGLOW smooth are now built in: every animation is a pure function of song
time (so seeking and pausing are exact), only `transform` and `opacity` change per frame, and
nothing is written to the screen unless it actually changed.

## What else changed

- **Scene transitions are data.** The stage picks a transition from the engine's library instead
  of fixed CSS. The adaptive director (Phase 4) will choose between them per song section. With
  _reduced motion_ turned on in Windows, scene changes now cross-fade instead of moving.
- **Tests are pixel-exact between runs.** Looping CSS animations (the edge light breathing) are
  held still during frozen screenshots, and the test window is always smaller than the screen.
  The laptop's screen (1280×800 at 150 % scaling) is smaller than the old 1440×900 test window,
  so Windows sometimes trimmed it mid-run and screenshots came out at different sizes.
- **GitHub checks fixed.** GitHub's test machines have no graphics chip, so no app can reach
  60 fps there. On GitHub the speed test now checks only the app's own work per frame (which is
  what we control). The full 60 fps check still runs on this laptop. One retry absorbs Electron's
  slow first start on those machines.

## No regression — how it was proven

The exit criterion for this phase was "Messages rebuilt on the engine with no regression". To
check it objectively rather than by eye:

1. The unchanged Phase 2 code was checked out separately and photographed: 30 key moments
   across the three compositions plus 72 animation frames (six bursts).
2. The same moments were photographed twice on the old code, to measure how much identical code
   differs between runs (sub-pixel text smoothing only).
3. The rebuilt code was photographed the same way and compared pixel by pixel.

Results are in the table below.

| Comparison                   | Images | Largest difference | Where                                               |
| ---------------------------- | ------ | ------------------ | --------------------------------------------------- |
| Old code vs old code (noise) | 102    | 0.061 % of pixels  | letter edges (sub-pixel text smoothing)             |
| Old code vs **engine** code  | 102    | 0.069 % of pixels  | the same letter edges; bubbles and motion identical |

Every image is within the noise floor of running identical code twice. Work per frame went
slightly _down_ (the engine skips writes that wouldn't change anything):

| Scene       | fps  | Slowest 5 % of frames | Script per frame (before → after) |
| ----------- | ---- | --------------------- | --------------------------------- |
| Thread      | 60.0 | 16.9 ms               | 0.38 → 0.37 ms                    |
| Lock Screen | 60.0 | 16.8 ms               | 0.37 → 0.29 ms                    |
| Drift       | 60.0 | 16.8 ms               | 0.44 → 0.41 ms                    |
| Prelude     | 60.0 | 16.8 ms               | 0.13 → 0.17 ms                    |

## Tests

- Unit: 20 engine tests (timeline, stack, text, camera, transform strings, transitions, particles) on top
  of the existing suites — 84 in total.
- End-to-end: 54 passed, including frame rate on this laptop.
