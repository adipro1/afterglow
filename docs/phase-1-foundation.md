# Phase 1 — Foundation

_Completed 23 Nov 2026_

## Owner decisions recorded

- **Project location:** moved out of OneDrive to `C:\dev\afterglow` (GitHub is the backup).
- **Spotify:** the owner confirmed on 23 Nov 2026 that Spotify has given full permission for AFTERGLOW. The Spotify integration will therefore be built **enabled** in Phase 5, not behind an off-switch. The approval document itself is not in the repo; keep it with the owner's records.
  - Some limits are enforced by Spotify's servers whatever the approval says, and the code will handle them gracefully: rate limiting (HTTP 429), the user allow-list of the app's quota mode unless Spotify has raised it, and the unavailability of audio-analysis/audio-features endpoints. Those are technical facts the app must cope with, not policy choices.

## What was built

| Area          | Files                                                                                                            | Notes                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain     | `package.json`, `electron.vite.config.ts`, `tsconfig.*.json`                                                     | Electron 45, React 19, Vite 8 via electron-vite 6, TypeScript 6 (strict, `noUncheckedIndexedAccess`). TS 7 skipped for now: typescript-eslint doesn't support it yet.                                 |
| Quality       | `eslint.config.mjs`, `.prettierrc.json`, `vitest.config.mts`, `playwright.config.ts`, `.github/workflows/ci.yml` | `npm run check` and `npm run test:e2e`; CI runs both on Windows.                                                                                                                                      |
| Main process  | `src/main/*`                                                                                                     | Frameless window, single instance, bounds memory (validated, clamped to connected monitors), atomic settings file, navigation lock-down.                                                              |
| Security      | `src/preload/index.ts`, `src/shared/ipc.ts`, CSP in `index.html`                                                 | `contextIsolation`, `sandbox`, no `nodeIntegration`; narrow typed bridge; all IPC zod-validated.                                                                                                      |
| Design system | `styles/tokens.css`, `design/EdgePanel.tsx`, `design/edge-path.ts`                                               | Ink palette, edge-light accent, motion curves, OFL fonts, static film grain. `EdgePanel` draws the reference-1 window: light pooling on one edge, bloom, notch tab, slow light swing.                 |
| Playback      | `playback/clock.ts`, `playback/demo-source.ts`                                                                   | See below.                                                                                                                                                                                            |
| Lyrics        | `shared/lyrics.ts`, `lyrics/cursor.ts`                                                                           | Zod-typed `LyricsDocument` (word/line/none sync, singer), O(log n) position lookup.                                                                                                                   |
| Demo content  | `demo/songs.ts`                                                                                                  | Two **original** songs written for AFTERGLOW (messages theme, travel theme) with word timings.                                                                                                        |
| Shell         | `app/*`                                                                                                          | Title bar with custom window controls, floating stage window with perspective drift, now-playing dock with seekable progress, status cluster, fullscreen with auto-hiding chrome, keyboard shortcuts. |
| Prelude view  | `app/PreludeView.tsx`                                                                                            | The shell's own lyric view: lines travel between slots, word-by-word reveal tinted from the artwork, title card, instrumental-break dimming, no animation on seek.                                    |

## The playback clock (why it matters)

External players report position irregularly and slightly wrong (Spotify is polled about once a second). Displaying those numbers directly makes lyrics stutter or jump backwards. `PlaybackClock`:

- fills the gaps between reports with the local high-precision clock;
- glides out small errors instead of jumping, and when it's been running ahead it slows down (never below half speed) instead of going backwards;
- treats big differences (>1.5 s) as a real seek and snaps immediately;
- announces track changes, seeks and play/pause.

The demo source deliberately reports like Spotify (1 s intervals, ±120 ms error), so this path runs all the time during development.

## Tests

- **Unit (Vitest), 20 tests:** clock extrapolation, latency, pause, smoothing, never-backwards, seek detection, events, clamping; lyric lookup incl. gaps and line-only lyrics; demo-song validity; demo source play/pause/seek/next/previous.
- **End-to-end (Playwright driving the real Electron app), 8 tests:** secure window settings and preload bridge, maximise/restore buttons, title card, word sync into the first chorus, pause/resume, next track, minimum window size without overflow, fullscreen in and out. Screenshots saved to `test-results/screens/` and reviewed.

## Bug found and fixed during testing

The sandboxed preload couldn't load because it tried to `require('zod')`; window buttons silently did nothing. Fixed by bundling zod into the preload, and an e2e test now guards it.

## Known gaps (by design, later phases)

- No visualisation library yet — Phase 2 starts with Messages.
- No settings UI, gallery, quality tiers or always-on-top/opacity window mode yet (Phase 7).
- No Spotify, lyrics import or local audio files yet (Phases 4–5).
- Not yet measured: frame-time budget on this Iris Xe under load (measured from Phase 2 on, when scenes get heavier).
