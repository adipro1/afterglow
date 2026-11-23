# AFTERGLOW — working notes for Claude

Premium real-time lyric visualiser for Windows (Electron + React + TypeScript). The owner has
limited programming experience: explain decisions plainly, and wait for approval before moving
to the next phase (see `docs/phase-0-plan.md` §11 for the roadmap).

## Commands

- `npm run dev` — run the app with hot reload (development build: React debug mode, noticeably slower — never judge smoothness here)
- `npm start` — build and run the optimised production app (use this to judge smoothness)
- `npm run check` — public-safety scan + typecheck + lint + format check + unit tests (run before every commit)
- `npm run test:e2e` — build, launch the real Electron app with Playwright, save screenshots to `test-results/screens/` (app launched with `AFTERGLOW_TEST=1` exposes `window.__afterglowTest` for exact-time freezes)
- Electron binary downloads lazily: if missing, `node node_modules/electron/install.js`

## Architecture rules

- `src/main` (Node) · `src/preload` (sandboxed bridge) · `src/renderer` (UI) · `src/shared` (types + zod schemas used by all).
- Renderer has no Node access. Everything crossing IPC is declared in `src/shared/ipc.ts` and validated with zod.
- The preload is sandboxed: it may only `require('electron')`. Any npm dep it uses must be bundled (see `electron.vite.config.ts`).
- Per-frame work goes through the single `ticker` (`src/renderer/src/engine/ticker.ts`) and mutates DOM/refs directly. Never put song position in React state.
- Song time comes only from `runtime.clock` (`PlaybackClock`): smooth, monotonic while playing, snaps on real seeks. It averages out report jitter and bends time by at most ~6 %; never make it chase individual reports.
- Sample time once per frame: `runtime.position()` / `ambient.now()` default to `ticker.now()` (the frame timestamp). Never use `performance.now()` for animation.
- Visual state must be a pure function of (lyrics, time, variation, seed) so seeking, paused frames and screenshot tests work.

## Visualisation plugins

- Each lives in `src/renderer/src/visualizations/<id>/` with `meta.ts` (registered in `registry.ts`) and a lazily-imported `index.tsx` default-exporting `{ meta, Scene }`.
- Scenes get `SceneProps`; read time with `getTime()` inside `useTicker`. Import everything from the motion engine `@/engine` (`src/renderer/src/engine/`, overview in its `index.ts` and `docs/phase-3-engine.md`) — never stateful per-frame tweens, never raw `el.style` writes.
- Engine building blocks: `enter`/`presence`/`ramp`/`flash`/`pulse`/`wave` (timeline), `flowStack` (items making room for each other), `useMeasure` (sizes without reflow), `Words`/`applyWordStates`/`applyTyping` (text), `Rig`/`breathe`/`shake`/`nudge`/`move` (camera), `revealClip` + `sceneTransitions` (transitions), `makeField`/`motePose` (particles), and the cached writers `setTransform`/`setOpacity`/`setStyle`/`setData`/`setText` + `transform()`.
- New reusable motion goes into the engine (with a unit test in `tests/unit/engine.test.ts`), not into a scene.
- Ambient (non-musical) motion uses `ambient.now()` so tests can freeze it.
- Size compositions with container units (`cqw`/`cqh`) — the scene layer is a size container.
- Add screenshot moments to `tests/e2e/<id>.spec.ts` and run `tests/e2e/perf.spec.ts` (must hold ~60 fps on the Iris Xe, on battery). Review motion with frame bursts (`tests/e2e/motion.spec.ts`). Frozen screenshots are pixel-exact between runs (looping CSS animations are held, the test window always fits the screen), so a refactor can be proven regression-free by diffing screenshots before/after.
- GPU budget: animate only `transform` and `opacity` on elements with `will-change`. No per-frame changes to `filter`, `backdrop-filter`, `mask`, `clip-path` on large elements, CSS variables inherited by big subtrees, or `mix-blend-mode`. Static effects are fine; animated ones need a compositor-only equivalent (cross-fade pre-drawn layers, overlays).
- Springs: use `springs.*` / `appleSpring(response, dampingFraction)`; in CSS use `--ease-spring` / `--ease-spring-soft`.

## Design rules

- Tokens in `src/renderer/src/styles/tokens.css`. Darkness is the material; the only chrome accent is the magenta→violet edge light (`EdgePanel`).
- Content colour comes from artwork (`--tint-*`). Never modify, crop or filter album art itself.
- Fonts: OFL-licensed only (Inter, Barlow Condensed, JetBrains Mono so far). No SF Pro.
- Review every visual change with a real screenshot, not just code.

## Public-safe at all times

The repo must always be safe to make public — treat every commit as if it were published.

- Never commit: secrets/tokens/keys (Spotify client secret, refresh/access tokens, signing certificates), `.env` files, personal details (real name, personal email, `C:\Users\<name>` paths), `refrences/` (third-party clips), user lyrics/audio, copyrighted lyrics, art or fonts we have no licence for. Demo songs in `src/renderer/src/demo/` are original.
- Secrets live only on the user's machine (OS credential store via Electron `safeStorage`, or a git-ignored `.env`); ship a `.env.example` with empty values. Spotify uses PKCE, so there is no client secret at all.
- Logs, error messages, test output, screenshots and CI artifacts must never contain tokens or personal data (they can become public too). E2E tests use demo songs only.
- Guard: `scripts/public-safety.mjs` runs in `npm run check`, in the pre-commit hook (`.githooks/`, installed by `npm install`) and over the whole history in CI. Never bypass it (`--no-verify`); fix the cause. Personal words to block live in git-ignored `.public-safety.local`.
- Commits use the GitHub noreply address (`git config user.email`), never a personal email.
