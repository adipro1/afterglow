# AFTERGLOW

Real-time lyric visualisation for Windows: turns the meaning of a song into cinematic, art-directed visual scenes that stay in sync with playback.

**Status:** Phase 1 (foundation) complete — desktop shell, design system, playback clock and a word-synced lyric view running on original demo songs. Next: Phase 2, the Messages visualisation.

- Plan, research and roadmap: [docs/phase-0-plan.md](docs/phase-0-plan.md)
- Phase 1 notes: [docs/phase-1-foundation.md](docs/phase-1-foundation.md)

## Running it

Requirements: Windows 10/11, Node.js 22+.

```powershell
npm install
node node_modules/electron/install.js   # first time only: downloads the Electron runtime
npm run dev
```

Shortcuts: `Space` play/pause · `←/→` seek 5 s · `N`/`P` next/previous track · `F` or `F11` fullscreen · `Esc` leave fullscreen.

## Checks

```powershell
npm run check      # types, lint, formatting, unit tests
npm run test:e2e   # launches the real app and saves screenshots to test-results/screens
```

Private project.
