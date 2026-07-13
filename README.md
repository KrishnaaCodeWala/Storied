# STORIED — the fandom knowledge game

A maximalist browser trivia game. Guess where iconic quotes came from — or
feed it your own documents and let it quiz you on those. Runs anywhere a
browser runs: no install, no server, no account, nothing leaves your device.

## Running it

**Desktop (Windows / Mac / Linux):** unzip anywhere, double-click
`index.html`. No install, no server, works offline.

**Android — quick way:** copy the single file `storied-standalone.html` to
your phone (email it to yourself, Drive, USB, whatever). In your file
manager, tap it and choose **Open with → Chrome** (or Firefox). That one
file contains the whole game and runs fully offline. Don't use the built-in
"HTML Viewer" — it doesn't run JavaScript. Heads-up: opened this way,
Android may not persist best scores between sessions; the install route
below fixes that.

**Android — as a real app (recommended):** host the folder anywhere with
HTTPS — e.g. drag the unzipped folder onto **Netlify Drop**
(app.netlify.com/drop) or push it to **GitHub Pages**; both are free and
take about a minute. Open the URL on your phone once, then Chrome menu →
**Add to Home Screen → Install**. You get a real app icon, fullscreen
launch, offline play (the service worker caches everything on first visit),
and persistent best scores and study decks.

Regenerate the standalone file after any edit with `node build.js`.

## The five modes

| Mode | What it is |
|------|------------|
| **Classic** | 10 quotes from your chosen shelves at Curator (4 choices + hints), Buff (6 choices, category hidden), or Archivist (type the title — forgiving matching) difficulty. |
| **Daily** | The same seeded 10-quote deck for every player on Earth, reshuffled at midnight. Buff rules. First finish of the day goes on the board; replays are practice. |
| **Rush** | 60 seconds, 4 choices, auto-advancing. Wrong answers just cost time. Personal best is tracked. |
| **Fandom** | Deep-dive packs with a per-pack **Quotes / Lore / Mixed** toggle — quotes ask *who said it*, lore quizzes facts from the world (each lore answer reveals a source link to the fandom's wiki). Packs, each with its own theming, cast roster for wrong options, and floating motifs: **Stranger Things**, **Cyberpunk 2077**, **God of War**, **Bloodborne**, **Dragon Ball**, and **Jump Street** (21 + 22). Aliases count in typed mode — "El", "Kakarot", "Dex", or "Brad McQuaid" all work. Bests saved per pack + difficulty. |
| **Stats & streaks** | Not a mode but a screen (button under the masthead): daily-challenge calendar, current/best streaks, accuracy by shelf, and nine unlockable achievements that celebrate with motif bursts. Every finished game offers a spoiler-free emoji share card. |
| **Study** | Upload or paste any text — the game builds a quiz from it (see below). |

Everywhere: streaks add +25/answer up to +100 (×3 sets the counter on fire),
hints cost 40 points, correct answers burst confetti and float abstract
motifs of the work up the screen edges. Keyboard: `1`–`6` pick, `H` hint,
`Enter` submit.

## Study Mode — quiz your own documents

Drop a `.txt`, `.md` or `.html` file (or paste text) and STORIED builds a
fill-in-the-blank deck from it, entirely on-device:

1. The text is split into sentences.
2. Each sentence is scanned for blank-worthy material — **names & places**,
   **numbers & dates**, and **rare document-specific terms**.
3. The richest sentences become questions; the key term is blanked, and the
   wrong options are other candidates *of the same kind from the same
   document*, so the choices are plausible instead of random.

Decks are saved in your browser, replayable at 4-choice, 6-choice, or
type-the-answer style, and deletable. Generation is heuristic (no AI, no
network) — the generator lives in `decks.js` as one documented function, so
swapping in an API-backed generator later is a one-function change.

## Making it yours

- **Quotes & categories** — `quotes.js`. Add a quote by copying a line; add
  a whole category (with its color) to `CATEGORIES` and every part of the
  UI themes itself automatically.
- **Floating motif art** — `motifs.js`: a 72-shape SVG library, an
  answer→motifs map, and per-category fallbacks. Keep additions at the level
  of objects and symbols, not recognizable character designs (those are
  protected IP even as silhouettes).
- **Motif density** — the `MOTIF_DENSITY` block in `game.js`: burst counts
  per correct answer (desktop/mobile), extra pieces while the streak is on
  fire, the on-screen cap, and three size tiers — most motifs flutter small,
  the occasional one looms large and ghostly behind them.
- **Fandom packs** — every pack is a JSON file in `packs/`. Copy any
  existing pack file, change the id/label/color/roster/quotes, run
  `node build.js`, and it appears in the pack browser automatically —
  the manifest (`packs/index.json`) and offline bundle are generated,
  never hand-edited. Hosted, packs load lazily on selection; offline and
  in the standalone they're bundled. The browser's search and tag
  filters are built to stay usable at hundreds of packs.
- **Rules** — the `CONFIG` block at the top of `game.js`: rounds, rush
  clock, points, streaks, hint cost.
- **Modes** — the `MODES` table in `game.js`; modes are data, not special
  cases.
- **Console API** — `Quoted.*`: the fuzzy matcher, the deck generator,
  `Quoted.buildDailyDeck("2026-12-25")` to preview a future daily,
  `Quoted.spawnMotifs(Quoted.quotes[4])` to rain rings on demand.

## Pack Studio — make your own packs

The **Studio** tab builds packs in the app: name and color, a cast roster,
quote and lore entries with live validation (the same rulebook as the
harvester and CI — word caps, decoy pools, the answer-leak check), a motif
picker with a live burst preview, and a content checklist that gates
export. Saved packs live on your device, appear in the pack browser badged
**LOCAL**, play in every mode and difficulty, and survive deletion of
nothing but themselves. Export produces a pack JSON anyone can paste into
their own Studio's import box — sharing packs is copy-paste.

## Going online (optional, off by default)

`online.js` holds a complete accounts + sync + leaderboard layer for
Supabase, implemented as plain HTTP (no SDK) and **disabled by default**.
The app is fully playable without it, offline, forever. To activate:
create a Supabase project, run the Phase 5 SQL schema (tables
`player_state` and `daily_scores` with the RLS policies), fill in
`ONLINE_CONFIG` at the top of `online.js`, and set `enabled: true`.
You get passwordless magic-link sign-in (from the Stats screen),
background cross-device sync of bests/streaks/achievements (field-wise
monotonic merge — nothing ever goes backwards), and a global top-100
daily leaderboard on the Daily panel. Every network failure degrades
silently to normal offline play.

## Content policy of the built-in deck

Only very short, widely-known catchphrases and public-domain lines. Song
lyrics are deliberately excluded — even one lyric line is protected content
— so a music shelf should use titles or trivia as prompts, not lyric text.

## Files

```
storied/
├── index.html               # the page
├── style.css                # the look
├── game.js                  # engine: modes, scoring, effects (CONFIG on top)
├── quotes.js                # built-in deck + categories (edit me!)
├── motifs.js                # floating-object art + mappings (edit me!)
├── decks.js                 # study-mode generator + local deck storage
├── build.js                 # `node build.js` -> storied-standalone.html
├── storied-standalone.html   # single-file build for phones
├── manifest.json, sw.js     # PWA install + offline (when hosted)
└── icon-192/512.png         # app icons
```
