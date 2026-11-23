# AFTERGLOW

Real-time lyric visualisation for Windows: turns the meaning of a song into cinematic, art-directed visual scenes that stay in sync with playback.

**Status:** Phase 2 complete — the first visualisation, **Messages** (three compositions: Thread, Lock Screen, Drift), on top of the Phase 1 shell. Next: Phase 3, the reusable animation engine.

- Plan, research and roadmap: [docs/phase-0-plan.md](docs/phase-0-plan.md)
- Phase 1 notes: [docs/phase-1-foundation.md](docs/phase-1-foundation.md)
- Phase 2 notes: [docs/phase-2-messages.md](docs/phase-2-messages.md)

## Running it

Requirements: Windows 10/11, Node.js 22+.

```powershell
npm install
node node_modules/electron/install.js   # first time only: downloads the Electron runtime
npm run dev
```

Shortcuts: `Space` play/pause · `←/→` seek 5 s · `N`/`P` next/previous track · `F` or `F11` fullscreen · `Esc` leave fullscreen · `V` next variation · `S` next visualisation (hold `Shift` to go back).

The demo songs have lyrics and timing but no audio yet — playback is silent until local-file playback (Phase 4) or Spotify (Phase 5).

## Checks

```powershell
npm run check      # types, lint, formatting, unit tests
npm run test:e2e   # launches the real app and saves screenshots to test-results/screens
```

Private project.
