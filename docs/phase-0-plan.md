# AFTERGLOW — Phase 0: Research & Plan

_Status: draft for owner review · 23 Nov 2026_

This document is the output of Phase 0. It records what was found, what was decided and why, and what needs the owner's decision before Phase 1 starts. Plain-language summaries are at the top of each section; detail follows.

---

## 0. The short version

1. **The visual product is very buildable.** Electron + React + Three.js on this laptop (Intel Iris Xe, 32 GB RAM) can run everything planned, if we design for the GPU carefully.
2. **Spotify is the big risk — not technically, but legally.** Spotify's current developer rules explicitly list _"syncing sound recordings accessed via the Spotify Platform with … lyrics"_ as a disallowed use case. AFTERGLOW's core idea is exactly that. No Spotify approval document was found in the project. Per the brief, Spotify playback sync stays **disabled** until this is resolved, and the engine is built on a local playback source first. See §3.
3. **There is no affordable licensed source of synced lyrics for an individual.** Musixmatch (the only realistic commercial provider with word-level sync) is quote-based and historically enterprise-priced. Free databases like LRCLIB are crowd-sourced with no licences, so the brief rules them out. Realistic v1 lyrics source: **user-imported `.lrc` / `.srt` files + a built-in timing editor**, with the provider interface ready for Musixmatch later. See §4.
4. **Spotify also forbids feeding its content into AI models and cropping/modifying album art.** The interpretation engine must work on the lyrics (from a non-Spotify source), never on Spotify data, and the reference video 2's circular-cropped album art is not allowed. See §3.3.
5. **Spotify no longer gives audio analysis (beats, tempo, energy) to new apps.** The "audio spectrum" look in reference video 2 cannot be driven by real Spotify audio data. Rhythm will be derived from lyric timing (word onsets, line density), or from real audio only in local-file mode.

---

## 1. Environment audit

| Item | Found | Notes |
|---|---|---|
| OS | Windows 11 Home 26200 | |
| CPU / RAM | i7‑1265U (12 threads) / 32 GB | |
| GPU | **Intel Iris Xe**, 1920×1200 @ 60 Hz | The "ordinary laptop" baseline. Every scene must hit 60 fps at Balanced here. |
| Node / npm | v26.13.1 / 11.20.0 | Electron bundles its own Node; fine. |
| Git / GitHub CLI | 2.55 / 2.102, logged in as `adipro1` (repo, workflow scopes) | Can create the repo. |
| Python | 3.12.5 | Used only for tooling (frame extraction). |
| ffmpeg | **Missing** | Not needed for the app. Used a scratch OpenCV venv for frame analysis instead. |
| MCP / automation | Playwright, built-in browser, Claude in Chrome, computer-use, Figma | Playwright will drive Electron for visual QA. |
| Disk | 142 GB free | |

**Project location risk:** the project lives in a **OneDrive-synced** folder. `node_modules` (~100k files) and build output will churn OneDrive sync, slow installs, and can cause file-lock errors during builds. Recommendation: move the project to `C:\dev\afterglow` (GitHub becomes the backup). Needs owner decision.

**Reference folder:** it is named `refrences/` (typo). Left as-is; it is git-ignored because the clips contain third-party copyrighted artwork and must not be committed.

---

## 2. Reference video analysis

Both clips are 12–13 s, 720×1280 phone recordings of a monitor in a dark room. Colours are approximate (camera capture), so the palette below is a designed interpretation, not a pixel copy.

### 2.1 Reference 1 — "floating windows" (primary UI direction)

What happens:
- 0–2 s: a near-black frameless window floats in a black void. A now-playing card (square album art with soft radius, two-line title, small artist line, pill transport controls, a "Lyrics" pill, a quiet bottom toolbar) sits centred with huge negative space.
- The window edge is **not a uniform border**: a thin line whose glow is brightest at corners/one edge and fades to nothing along the run — magenta (#ff2d8a-ish) shading into violet (#7b3cff-ish). It reads like light leaking from the window's edge, not a CSS outline. A small **notch tab** breaks the top edge.
- 2–5 s: camera swings; the player blurs out and lyrics take over as **message bubbles**. First bubble carries a **location chip** ("Shibuya Crossing, Tokyo") — a metadata line that turns a lyric into a "sent from somewhere" moment. The active bubble gets an outline ring; incoming words land with a **motion-blurred ghost** (double exposure) before settling.
- 5–13 s: a second window (album artwork, large, slightly rotated in perspective, same magenta edge on its bottom) appears to the lower right — two windows at different depths. Bubbles alternate: sent (desaturated slate-blue #6f86b8) vs received (warm, dark, album-tinted #2a1c10 with amber text). Old bubbles drift up and fade; never more than 2–3 on screen.

Design language extracted:
- **Darkness as material.** Background is pure near-black; panels are only ~2–4% lighter. Light comes from accents, not surfaces.
- **One accent, used sparingly.** Magenta→violet only on edges. Content colour comes from the album art.
- **Album-derived tint.** Bubble text and fills pick up the cover's warm palette (amber/rust). We extract a palette from the art and use it around the art — the art itself is never altered (Spotify rule).
- **Typography:** SF-Pro-like grotesque for UI; the overlay caption uses a condensed grotesque. Body at modest size, generous tracking at small sizes, tight at large sizes.
- **Motion:** slow, weighted camera drift; short, crisp element entrances (~250–400 ms) with motion blur; long, soft exits. Perspective tilt of whole windows rather than wobbly elements.
- **Composition:** one focal element; everything else is negative space or out-of-focus depth.

### 2.2 Reference 2 — "cinematic environment"

What happens:
- A photoreal Earth limb fills the top of frame against black space; a sliver of atmosphere glow.
- Lyrics are **3D extruded, heavy condensed caps** with **mixed hierarchy inside a line** — "WHATEVER I'VE" large and bright, "DONE" smaller, dimmer, offset below; "MINUTES ARE RACIN'" with "ARE" small and stacked. Strong camera-facing perspective, slight bevel, soft shadow.
- Centre: circular album art with a **radial bar spectrum** (warm white/gold bars) pulsing.
- A clock (23:11, light weight) and a compact now-playing list sit at the edges like a HUD.

Design language extracted:
- **Scale contrast** (huge planet vs small UI) creates the cinema feel.
- **Word-level hierarchy** — emphasis words big, function words small. This is a reusable typographic system for many of our scenes.
- **Warm core vs cool environment** — warm art/spectrum against cold blue-grey planet.

What we will _not_ copy: the circular crop of album art (prohibited — §3.3) and the audio spectrum driven by Spotify audio (not available — §3.4). We'll keep the idea with a lyric-driven "pulse ring" around an unmodified square cover.

### 2.3 Combined direction

- **Shell & 2D scenes** follow Reference 1: black void, floating panels at depth, magenta-violet edge light, album-tinted content, one focal element.
- **Immersive scenes** follow Reference 2: a single big environmental object, heavy expressive type with in-line hierarchy, warm/cool contrast.
- The two meet through shared rules: same black, same edge-light treatment on any "window", same type families, same motion curves, same camera behaviour.

Draft tokens (refined in Phase 1):

| Token | Value | Use |
|---|---|---|
| `ink-0` | #040306 | void |
| `ink-1` | #0b0a0f | panel |
| `ink-2` | #15131b | raised panel |
| `edge-a` | #ff2d8a | edge light start |
| `edge-b` | #7b3cff | edge light end |
| `text-hi` | #f4f1ec | primary text |
| `text-lo` | #8d8794 | secondary |
| `tint-*` | from album art | per-track content colour |
| ease `out-expo` | cubic-bezier(.16,1,.3,1) | entrances |
| ease `in-out-sine` | cubic-bezier(.37,0,.63,1) | camera drift |

---

## 3. Spotify: what's allowed today

### 3.1 Technical facts (current as of Nov 2026)
- **Auth:** Authorization Code with **PKCE** is required (implicit grant is gone). Redirect URI must be a loopback IP literal like `http://127.0.0.1:PORT/callback` — `localhost` is rejected. The port may be dynamic. → Electron main process opens the system browser, runs a tiny one-shot loopback server, exchanges the code. No client secret needed.
- **Scopes:** only `user-read-currently-playing` and `user-read-playback-state`. No playback control (controlling playback would make AFTERGLOW a "streaming app" with stricter rules).
- **Endpoint:** `GET /v1/me/player/currently-playing` (progress_ms, is_playing, item, timestamp). Poll adaptively: ~1 s while playing near transitions, 3–5 s steady state, back off when paused/idle, respect `Retry-After` on 429. Between polls, interpolate locally with `performance.now()`.
- **Development Mode (Feb 2026 rules, updated July 2026):** app owner needs **Spotify Premium**; max **5 allow-listed users**; per-developer quota. Extended quota is effectively for established businesses. → AFTERGLOW with Spotify is realistically a personal app for the owner + 4 friends unless Spotify grants more.
- **Audio features / audio analysis** endpoints are unavailable to new apps (since Nov 2024). No beat/tempo/energy data.
- **Tokens:** refresh token stored in the main process only, encrypted with Electron `safeStorage` (Windows DPAPI). Never in the renderer, never in logs.

### 3.2 The policy problem
Spotify Developer Policy (effective 15 May 2025), §III.6: _"Do not synchronize any sound recordings with any visual media…"_.
Spotify Compliance Tips, "Disallowed Use Cases → Synchronization": _"Syncing sound recordings accessed via the Spotify Platform with other recordings, lyrics, or video."_

AFTERGLOW doesn't touch the audio stream, but it times lyric visuals to Spotify's playback position. A plain reading of the Compliance Tips puts that in the disallowed bucket. Forum answers from Spotify staff on similar questions have been unhelpful/ambiguous.

**Consequence (per the brief):** the Spotify integration is built behind a feature flag and stays **off** unless the owner has written approval from Spotify covering this use. The rest of the product does not depend on it.

### 3.3 Other Spotify rules that shape the design
- **No AI on Spotify content** (Policy §III.14): track title/artist/art from Spotify must not be sent to any AI model. The interpretation engine only sees lyrics from the (non-Spotify) lyrics provider and only if that provider's licence allows it.
- **No analysing Spotify content** (§III.13): no derived stats.
- **Artwork:** "do not modify, crop or adjust artwork". Show covers square, unfiltered, unrotated in 2D. (3D perspective placement is a grey area — we keep covers flat-on to camera to be safe.) Colour sampling for surrounding UI is fine; tinting the art itself is not.
- **Attribution:** Spotify logo/mark + a link back to the track on Spotify wherever metadata or art is shown.
- **Non-commercial** for this tier of access.

### 3.4 Workarounds we will not use
No unofficial APIs, no reading Spotify's client memory/cache, no audio loopback capture, no scraping. (Note: Windows' own media-session API can read "now playing" from any player, including Spotify desktop — it's a public OS API, but using it to route around Spotify's policy would be against the spirit of the brief. Listed in open questions, not planned.)

---

## 4. Lyrics: what's available

| Source | Word-level sync | Licensed | Cost | Verdict |
|---|---|---|---|---|
| **Musixmatch API** | Yes (richsync) on paid tiers | Yes | Quote-based; historic figures in the ~$25k/yr range for full lyrics (unverified) | Target provider if owner ever licenses it. Free tier = 30% of lyrics, no sync → useless. |
| LyricFind | Line-level | Yes | Enterprise only | Same bucket. |
| LRCLIB / NetEase / Genius scraping | Varies | **No** | Free | **Excluded** by the brief. |
| **User-imported `.lrc` / `.srt`** | Line-level (enhanced LRC has word tags) | The user's responsibility (their files) | Free | **v1 primary source.** |
| **Built-in timing editor** | Word + line | User's own work | Free | **v1.** Tap-to-time while listening. |
| Original demo songs | Word | We write them | Free | Mock data for development & gallery. |

Design: `LyricsProvider` interface with `search(trackRef) → LyricsDocument | null`, each provider declares capabilities (`wordSync`, `lineSync`, `plain`, `aiProcessingAllowed`). Imported lyrics are stored per track in the user's app-data folder, never in the repo.

---

## 5. Lyric interpretation engine

Goal: pick a visual _direction per song section_ from meaning, not keywords.

Pipeline:
1. **Structure pass (deterministic):** split into sections using timing gaps, repeated line groups (chorus detection by similarity), instrumental gaps (>6 s without lines).
2. **Feature pass (deterministic, local):** curated lexicon of concepts → themes (with phrase patterns, negation and metaphor handling rules, e.g. "call" + "missed/late/home" vs "call it off"), emotional valence/arousal from a small local lexicon, narrative markers (2nd-person address → conversation scenes), repetition weight.
3. **Optional model pass:** a pluggable `Interpreter` that can be (a) local deterministic only, (b) a local small model later, or (c) a permitted external model (e.g. Claude API) — **opt-in, shows exactly what text is sent, and only for lyrics whose licence allows it.** Never Spotify data.
4. **Output:** `InterpretationPlan` = per-section `{ themes: weighted[], mood, energy, focusWords[] }`, cached per track.

The deterministic path must produce good results on its own; the model only refines.

## 6. Adaptive visualisation director

- Input: `InterpretationPlan` + playback clock + user overrides.
- Chooses a scene per **section**, not per line. Minimum dwell (e.g. ≥ 1 section or ≥ 20 s), hysteresis so near-ties don't flip.
- Repeated sections (chorus 2) return to the same scene with an escalated variation — this makes songs feel authored.
- Transitions are chosen by the outgoing/incoming pair (shared "window" → camera push; 2D → 3D → depth dissolve, etc.).
- Overrides: lock scene, lock variation, skip, manual-only mode, preferred-style weights, back to auto.

---

## 7. Architecture

### 7.1 Stack decisions

| Choice | Why |
|---|---|
| **Electron** (+ electron-vite) | Required Windows desktop features (frameless, always-on-top, opacity, fullscreen), Chromium GPU path for WebGL, mature installer story. Tauri's WebView2 is lighter but its WebGL performance/consistency is less predictable for heavy 3D. |
| **React 19 + TypeScript (strict)** | Shell UI and settings. Scenes do **not** re-render through React per frame. |
| **Three.js + React Three Fiber + drei** | 3D scenes. R3F for declarative scene setup; per-frame work in `useFrame` mutating refs. |
| **Own lightweight 2D path (DOM/CSS transforms + Canvas2D)** first; **PixiJS only if a scene needs it** | Messages, Email, Editorial etc. are typography-heavy; real DOM text gives the best kerning/hinting. PixiJS is added only when a scene needs thousands of sprites (Arcade, particles). |
| **GSAP** | Timelines with seek/scrub — essential because lyric visuals must jump when the user seeks. Framer Motion only for shell UI micro-interactions (may drop it entirely to save a dependency). |
| **Zustand** | Small stores, selector subscriptions → no needless re-renders. Per-frame clock lives _outside_ React. |
| **Zod** | Validate everything crossing IPC, imported LRC/SRT, Spotify responses, settings files. |
| **Vitest + Playwright (`_electron`)** | Unit tests for sync/parsing/director; screenshot-based visual checks of every scene at fixed timestamps. |
| **electron-builder (NSIS)** | Windows installer + uninstaller; electron-updater later for updates via GitHub Releases. |

### 7.2 Process model

```
┌──────────── main process (Node) ─────────────┐
│ window mgr · settings store · safeStorage    │
│ spotify/  OAuth PKCE, token refresh, poller  │
│ lyrics/   file import, provider adapters     │
│ local audio file access (user-chosen files)  │
└───────────────▲──────────────────────────────┘
                │ typed IPC (Zod-validated), contextIsolation on, no nodeIntegration
┌───────────────┴─── preload ──────────────────┐
│ exposes a narrow `afterglow` API             │
└───────────────▲──────────────────────────────┘
┌───────────────┴──── renderer ────────────────┐
│ playback/  PlaybackSource → PlaybackClock    │
│ lyrics/    LyricsDocument, sync cursor       │
│ interpretation/  Interpreter → plan          │
│ director/  scene selection + transitions     │
│ animation/ clock, timelines, easing, springs │
│ visualizations/<id>/  self-contained plugins │
│ shell/     UI, gallery, settings             │
└──────────────────────────────────────────────┘
```

### 7.3 Key contracts (sketch)

```ts
// One source of truth for "where are we in the song"
interface PlaybackSource {
  id: 'mock' | 'local-file' | 'spotify';
  subscribe(cb: (s: PlaybackSnapshot) => void): Unsubscribe;
}
interface PlaybackSnapshot {
  track: TrackRef | null; isPlaying: boolean;
  positionMs: number; sampledAt: number; // monotonic ms
  durationMs: number;
}
// PlaybackClock smooths snapshots: interpolates, corrects drift by easing
// (never jumps backwards < 250 ms), snaps only on real seeks / track change.

interface Visualization {
  meta: { id; name; category; description; variations: VariationMeta[]; themes: ThemeId[] };
  create(host: SceneHost, opts: SceneOptions): SceneInstance; // lazy-imported
}
interface SceneInstance {
  setLyrics(doc: LyricsDocument, section: SectionPlan): void;
  update(frame: FrameContext): void;   // called by engine, not React
  seek(ms: number): void;               // must be deterministic
  enter(t: Transition): Promise<void>;
  exit(t: Transition): Promise<void>;
  setQuality(q: QualityLevel): void;
  dispose(): void;                      // free GPU/DOM resources
}
```

Determinism rule: a scene's visual state must be a function of (lyrics, section, time, variation, seed). That makes seeking, paused-frame beauty, gallery previews, and screenshot tests all work.

---

## 8. Animation engine

- Single `requestAnimationFrame` loop owned by the engine; scenes get `FrameContext { songMs, dt, beatish, quality }`.
- **Time-addressable timelines** (GSAP timelines driven by song time, not wall time) so pause/seek just set the playhead.
- Library: easing set, critically-damped springs (for camera and window drift), staggered text splitting (grapheme-safe via `Intl.Segmenter` for non-Latin scripts), word/line cue scheduler, depth-of-field/motion-blur helpers, shared camera rig, transition registry.
- "Rhythm" without audio data: a **pulse signal** derived from word onsets and line density (spotify mode) or real FFT (local-file mode only).

## 9. Performance plan (baseline: Iris Xe @ 1920×1200)

- Only the active scene (and, during a transition, the incoming one) is mounted; others are not imported until needed.
- Render loop stops when paused and nothing animates; drops to 30 fps when window hidden/minimised → 0.
- Quality tiers: **Performance** (DPR 1, no post-processing, ≤ 2 windows of depth), **Balanced** (DPR ≤ 1.5, light bloom), **Quality** (DPR native, DOF, motion blur, shadows). Auto-recommend from WebGL renderer string + a 3-second warm-up benchmark; user override.
- Reduced-motion mode: no camera drift, crossfades only.
- Built-in perf HUD (fps, frame time, GPU memory estimate, draw calls) in a debug overlay.

## 10. Project structure (planned)

```
afterglow/
  src/
    main/            window, ipc, settings, spotify/, lyrics-store/
    preload/
    renderer/
      app/           shell, routes, gallery, settings UI
      design/        tokens, type, edge-light, panel primitives
      playback/      sources, clock
      lyrics/        model, parsers (lrc, srt), sync cursor, editor
      interpretation/
      director/
      animation/
      visualizations/<id>/  index.ts, scene, variations, tests, README
    shared/          types + zod schemas shared across processes
  assets/ (fonts — OFL-licensed only, textures we create/own)
  demo-songs/        original lyrics written for this project
  docs/  tests/  scripts/  .github/workflows/
```

Fonts: only openly licensed (SIL OFL) families, e.g. Inter / Inter Display, a condensed grotesque such as Barlow Condensed or Archivo, JetBrains Mono for terminal scenes, plus scene-specific OFL faces. No Apple SF Pro (licence restricts use to Apple platforms).

---

## 11. Roadmap (each phase ends with owner approval)

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **1 Foundation** | Electron/React/TS/Vite app, lint/format/test/CI, frameless window with custom controls, design tokens + edge-light panel primitive, PlaybackClock with mock source | Window launches, `npm test` + Playwright smoke pass, screenshot reviewed |
| **2 Messages** | First scene: bubbles, location chips, typing indicators, 3 compositions, perspective windows, word-level reveal, transitions; driven by an original demo song | Looks excellent paused at 10 sampled timestamps; 60 fps on Iris Xe Balanced |
| **3 Animation engine** | Extract reusable timeline/spring/text/camera/transition systems from Phase 2 | Messages rebuilt on top of it with no regression |
| **4 Lyrics & interpretation** | LRC/SRT import, timing editor, structure + theme analysis, director | Unit tests on parsers/edge cases; director produces sensible plans for demo songs |
| **5 Spotify** | PKCE auth, poller, clock integration — **only if approval exists**; otherwise built and tested against a fake server, flag off | Pause/seek/skip/expiry handled |
| **6 Library** | Remaining scenes in batches of 3–4, each reviewed | Each meets the Phase 2 bar |
| **7 App experience** | Fullscreen, desktop widget mode, gallery, settings, perf controls | |
| **8 QA & polish** | Full test matrix, memory soak test | |
| **9 Release** | NSIS installer, updater, docs, private release | Install/uninstall/update tested |

## 12. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Spotify policy forbids lyric sync | Core feature unusable with Spotify | Feature flag off; local-file mode is first-class; owner may seek written approval |
| Dev-mode limit (5 users, Premium owner) | Can't distribute widely even if allowed | Treat Spotify as personal/power-user feature |
| No affordable licensed synced lyrics | Users must bring own LRC files | Excellent import + timing editor UX; Musixmatch adapter stub ready |
| Iris Xe GPU budget | Jank in 3D scenes | Tiered quality, budgets per scene, perf HUD, test on this machine |
| OneDrive sync + node_modules | Slow/broken builds | Move project out of OneDrive |
| Font licensing | Legal | OFL fonts only |
| 25 scenes × quality bar | Time | Phase gating; quality over count |
| "AI-looking" design drift | Product feels generic | Reference-driven tokens, per-scene art direction notes, paused-frame reviews |

## 13. Sources
- Spotify Developer Policy — https://developer.spotify.com/policy/
- Spotify Compliance Tips — https://developer.spotify.com/compliance-tips
- Feb 2026 Dev Mode migration guide — https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- July 2026 quota update — https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- TechCrunch on Dev Mode changes — https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/
- Redirect URI rules — https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
- Security requirements blog — https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify
- Musixmatch (third-party summary; pricing unverified) — https://freeapihub.com/apis/musixmatch
