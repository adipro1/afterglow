# AFTERGLOW

Real-time lyric visualisation for Windows: turns the meaning of a song into cinematic, art-directed visual scenes that stay in sync with playback.

**Status:** Phase 4 complete — your own lyrics (.lrc / .srt / text) and audio files, a tap-along timing editor, song analysis (sections, themes, mood) and the adaptive director that picks a scene for each part of a song. Next: Phase 5, Spotify.

- Plan, research and roadmap: [docs/phase-0-plan.md](docs/phase-0-plan.md)
- Phase 1 notes: [docs/phase-1-foundation.md](docs/phase-1-foundation.md)
- Phase 2 notes: [docs/phase-2-messages.md](docs/phase-2-messages.md)
- Phase 3 notes: [docs/phase-3-engine.md](docs/phase-3-engine.md)
- Phase 4 notes: [docs/phase-4-lyrics-director.md](docs/phase-4-lyrics-director.md)

## Running it

Requirements: Windows 10/11, Node.js 22+.

```powershell
npm install
node node_modules/electron/install.js   # first time only: downloads the Electron runtime
npm run dev
```

Shortcuts: `Space` play/pause · `←/→` seek 5 s · `N`/`P` next/previous track · `F` or `F11` fullscreen · `Esc` leave fullscreen · `L` lyrics panel · `T` timing editor · `A` director on/off · `X` skip this scene here · `V` next variation · `S` next visualisation (hold `Shift` to go back; both switch the director to manual).

The demo songs have lyrics and timing but no audio. To hear music, open or drop your own audio file (press `L`), then import or time its lyrics. Your files and lyrics stay on your computer.

## Checks

```powershell
npm run check      # types, lint, formatting, unit tests
npm run test:e2e   # launches the real app and saves screenshots to test-results/screens
```

Private project.
