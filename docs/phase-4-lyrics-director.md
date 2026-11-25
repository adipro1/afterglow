# Phase 4 — Lyrics, interpretation and the director

_Completed 24 Nov 2026_

Until now AFTERGLOW could only play its two silent demo songs, and you picked the scene by hand.
Phase 4 adds four things:

- **Your own songs and lyrics.** Open or drop an audio file and it plays. Import its lyrics
  (`.lrc`, `.srt` or plain text), or time them yourself.
- **A timing editor.** Play the song and tap <kbd>Enter</kbd> as each line (or each word)
  begins. The stage shows the result live.
- **Song analysis.** Each song is split into intro, verses, choruses, pre-chorus, bridge,
  instrumental breaks and outro. Each section gets themes, a mood, an energy level and focus
  words.
- **The adaptive director.** It picks a scene and variation for each section and chooses how one
  hands over to the next. You can take over at any time.

Everything runs on this computer. Nothing is sent anywhere, and your lyrics and audio are never
part of the project's files.

## Trying it

| Key / action           | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| **L** or Lyrics status | Lyrics panel: import, time, export, open audio, and the song map      |
| **T**                  | Timing editor for the song that's playing                             |
| **A** or Director      | Director on/off (Auto ↔ Manual)                                       |
| **X**                  | "Not this scene here": the director picks the next best for this part |
| **S / V**              | Pick a scene / variation yourself (switches the director to Manual)   |
| Drop files             | Audio files play; a lyrics file attaches to the song that's playing   |

**Timing editor keys:**

- <kbd>Enter</kbd> taps the next line, or the next word in Words mode.
- <kbd>Shift+Enter</kbd> marks that the line just sung has ended (a silence follows).
- <kbd>Backspace</kbd> steps back and clears the last tap.
- <kbd>↑</kbd>/<kbd>↓</kbd> move to another line without timing anything.
- <kbd>[</kbd> / <kbd>]</kbd> nudge the selected line by 50 ms. Hold Shift for 250 ms.
- <kbd>W</kbd> switches between line and word mode.
- <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> undo and redo.
- <kbd>Ctrl+S</kbd> saves.
- Clicking a line jumps to just before it, so you can hear it again.
- **Offset** moves every line at once.
- Taps use the moment the key went down, not the next screen refresh.

Saved lyrics play automatically whenever that song plays again. "Export .lrc" writes a standard
LRC file. It is enhanced LRC, with a timestamp before each word, when every word is timed.

## Lyric files (`src/renderer/src/lyrics/formats.ts`)

**LRC:**

- Timestamps can be `mm:ss`, `mm:ss.x`, `mm:ss.xx`, `mm:ss.xxx` or `mm:ss:xx`.
- A line can have several timestamps (a chorus written once).
- Supported tags: `[offset]` (positive = sooner, as the format defines), `[ti]`, `[ar]`, `[al]`
  and `[length]`.
- Comments and a BOM are skipped, and any line endings work.
- Enhanced word tags (`<mm:ss.xx>`) are read.
- Duet voice markers are recognised: `v1:`/`v2:`/`M:`/`F:`/`D:`.
- An empty timestamp is a deliberate silence.

**SRT and WebVTT:**

- Wrapped cues are joined into one line.
- Markup is stripped, including `<i>`, `{\an8}` and HTML entities.
- Overlapping cues are trimmed so only one line shows at a time.

**Plain text:** lyric-sheet labels like `[Chorus]` are dropped, and the editor opens so you can
time the words.

**Errors:**

- Nothing throws. A file with problems still imports what it can, and explains the rest in a
  message, for example "2 lines had no timestamp and were left out".
- Files over 1 MB or 5000 lines are refused, because they are not lyrics.

LRC only says when a line _starts_. The reader also works out when each line plausibly _ends_,
from its word count, so real silences in the song survive for the structure analysis.

## Song analysis (`src/renderer/src/interpret/`)

1. **Structure** (`structure.ts`). This uses only timing and repetition, so it works in any
   language.
   - Silences split the lyrics into blocks, measured against the song's own pacing.
   - A block that runs straight from a verse into a chorus is split where the repeated lines
     begin.
   - Blocks with the same lyrics are grouped: they are the same section heard again.
   - The chorus is the most-repeated group. Lines that repeat inside it, and the song title,
     count in its favour.
   - The other sections are named from where they sit relative to the choruses: pre-chorus,
     bridge (something new after the second chorus) and outro.
   - Silences of 6 seconds or more become instrumental sections.
2. **Meaning** (`lexicon.ts`, `interpreter.ts`). A small, curated vocabulary maps words to
   themes, feelings (dark ↔ bright) and intensity (still ↔ intense).
   - **Phrase rules decide what words mean in context:**

     | Lyric                   | Read as                      |
     | ----------------------- | ---------------------------- |
     | "call it off"           | a break-up, not a phone call |
     | "call me when you land" | conversation and travel      |
     | "drowning in you"       | heartbreak more than water   |
     | "turn left"             | travel, not leaving          |

   - **Negation:** "not alone" flips the feeling and weakens the "isolation" theme.
   - **Addressing someone** ("you", or questions) leans a section towards conversation scenes.
   - **Context:** each section is read with 30 % of the whole song's themes, so a single stray
     word can't take a section over.
   - **Energy** comes from how densely the words are sung, how intense the vocabulary is, and the
     kind of section. Choruses are higher, and each return of a chorus builds a little.

   The interpreter is behind an `Interpreter` interface. A model-based pass, such as a local
   model or the Claude API, could later _refine_ a plan, but never replace it. It would be
   opt-in, show exactly what text would be sent, and run only for lyrics whose licence allows
   it. None of that is built: it would cost money and needs your decision.

## The director (`src/renderer/src/director/`)

**Choosing a scene:**

- Each section is scored against every visualisation on four things:
  - the themes it declares (strongest first);
  - the moods it carries;
  - the energy range it is comfortable with;
  - your preferences.
- A scene stays for at least a full section or 20 seconds.
- A challenger has to win clearly, so near-ties never flip.
- Bridges are the exception: a bridge is the song's own change of scenery, so contrast is
  welcome there.
- Scenes change only at section boundaries, about a second before the first line, and never
  while a line is being sung.

**When a section returns:** chorus 2 and chorus 3 go back to the chorus's scene, one step
further along its _escalation_. For Messages that is Thread → Lock Screen → Drift. This is what
makes a song feel authored rather than random.

**Transitions** are chosen from the pair of scenes:

| From → to                     | Transition |
| ----------------------------- | ---------- |
| Same scene, new variation     | push       |
| A quiet section after a break | fade       |
| A jump in energy              | push       |
| A change of category          | sink       |
| Anything else                 | pan        |

**Overrides:**

- Manual mode (S / V / A).
- Skip a scene for this part of the song (X).
- Lock a scene or a variation, and style preferences. These are built and tested, and get their
  controls in Settings in Phase 7.

**Determinism:** the plan is a pure function of the song and the options. Seeking straight to
any moment shows the scene the song would have reached, which is what makes screenshot tests and
paused frames reliable.

### What it decides for the demo songs

**Delivered:**

| Time        | Sections                          | Scene                  | Transition |
| ----------- | --------------------------------- | ---------------------- | ---------- |
| 0:00        | intro, verse 1, chorus 1, verse 2 | Messages · Thread      | —          |
| 1:08.8      | chorus 2, instrumental break      | Messages · Lock Screen | push       |
| 1:34.8      | bridge (hope, reflection; quiet)  | Prelude                | fade       |
| 1:52.8–2:30 | chorus 3 and outro                | Messages · Drift       | push       |

**Long Way Round** is about travel. There is no travel scene yet, so the director stays in the
calm Prelude baseline for the whole song rather than forcing Messages onto it. A unit test
checks that a scene declaring `travel` would take over as soon as one exists.

A new visualisation needs nothing more than `themes`, `energy`, `moods` and `escalation` in its
`meta.ts` for the director to start using it.

## Other changes

- **Stage hand-off.** When a song change also changes scene, the old song now leaves on the
  outgoing layer and the new song arrives in the new scene, in one move. Layers already on their
  way out finish their exit undisturbed.
- **Status area.** It now shows the director (for example "Auto · Chorus 2"). The Lyrics and
  Director items can be clicked.
- **Dock.** It shows the song's shape on the progress bar: section marks, with choruses lit.
- **Security:**
  - Saved lyrics live under the app-data folder, one file per song. File names are a hash of the
    song's key, so nothing the window sends can choose a path. Everything is validated with zod
    in both directions.
  - Audio is played from in-memory blob links. No disk path ever reaches the visualisation code.
  - Export uses the Windows save dialog. Only a sanitised file name is suggested.

## Tests

- **Unit: 156 tests (72 new).**
  - File readers and edge cases: precision variants, offsets, multiple timestamps, enhanced LRC,
    duets, BOM/CRLF, junk, overlaps, WebVTT, round trips.
  - Structure, themes, phrases and negation.
  - Director rules and overrides.
  - The timing editor model.
  - The local audio player (with a stand-in audio element).
- **End-to-end: `tests/e2e/lyrics.spec.ts`.**
  - The director's plan and scenes at four moments of "Delivered".
  - Manual and auto mode, and skipping a scene.
  - The lyrics panel.
  - Importing an LRC file, and plain text opening the editor.
  - Tapping, undo, nudge, offset, word mode and saving.
  - Playing a generated audio file.
  - All lyrics and audio in the tests are original or generated.

## Performance — still to confirm at full power

The director adds one small lookup per frame (a binary search, plus a write only when the section
changes). All the analysis happens once per song, not per frame.

The speed test was run on 24 Nov with the laptop **on battery at 25 % → 18 %**, with other apps
using about half the CPU. Windows was clearly slowing everything down. To check fairly, the
**unchanged Phase 3 code** was measured at the same moment:

| Scene       | Phase 3 code, same moment | Phase 4 code       | Phase 3 code, 23 Nov (plugged in) |
| ----------- | ------------------------- | ------------------ | --------------------------------- |
| Thread      | 54.7 fps · 0.95 ms        | 56.7 fps · 0.82 ms | 60.0 fps · 0.37 ms                |
| Lock Screen | 43.9 fps · 0.72 ms        | 49.1 fps · 0.71 ms | 60.0 fps · 0.29 ms                |
| Drift       | 45.3 fps · 3.89 ms        | 41.9 fps · 1.20 ms | 60.0 fps · 0.41 ms                |
| Prelude     | 50.8 fps · 0.92 ms        | 37.8 fps · 0.53 ms | 60.0 fps · 0.17 ms                |

(ms = the app's own work per frame.)

Phase 4 does no more work per frame than Phase 3 under the same conditions. The frame rate
varied run to run, in both directions, because the computer was throttled. The 60 fps check
(`npx playwright test tests/e2e/perf.spec.ts`) must be re-run on mains power before Phase 4 is
called done.

Two screenshot tests also stalled for minutes during that session, one of them in code Phase 4
doesn't touch. This is consistent with Windows turning the display off on battery, which stops
the window drawing. Re-run on their own, the motion tests passed. The song-change hand-off was
also checked without screenshots: it stayed responsive and logged no errors.
