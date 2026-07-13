/* ============================================================
   STORIED — achievements
   ------------------------------------------------------------
   Pure data + pure checks. Each entry:
     id     stable key (stored in localStorage on unlock)
     name   shown on the end screen + stats screen
     desc   how to earn it
     motif  shape id from motifs.js — the unlock celebrates with
            a burst of these
     check(stats, ctx) -> boolean
       stats: lifetime totals (see STATS shape in game.js)
       ctx:   the game that just ended
              { mode, diff, rounds, correct, score, bestStreak,
                fandomMode, packId }

   Add a new achievement by adding a row. Never remove or rename
   ids — players keep unlocks forever.
   ============================================================ */

const ACHIEVEMENTS = [
  { id: "origin_story", name: "Origin Story",
    desc: "Finish your first game.",
    motif: "book",
    check: (s) => s.games >= 1 },

  { id: "flawless", name: "Flawless Run",
    desc: "A perfect 10 out of 10 in any full round.",
    motif: "star",
    check: (s, c) => c.rounds >= 10 && c.correct === c.rounds },

  { id: "hot_hand", name: "On Fire",
    desc: "Hit a \u00D78 answer streak in a single game.",
    motif: "flame",
    check: (s, c) => c.bestStreak >= 8 },

  { id: "head_archivist", name: "Head Archivist",
    desc: "A perfect round with typed answers (Archivist difficulty).",
    motif: "magnifier",
    check: (s, c) => c.diff === "hard" && c.rounds >= 10 && c.correct === c.rounds },

  { id: "century", name: "Century",
    desc: "100 correct answers, lifetime.",
    motif: "crown",
    check: (s) => s.correct >= 100 },

  { id: "wanderer", name: "Wanderer",
    desc: "Play five different fandom packs.",
    motif: "arrow",
    check: (s) => (s.packsTried || []).length >= 5 },

  { id: "regular", name: "The Regular",
    desc: "A three-day daily-challenge streak.",
    motif: "clock",
    check: (s) => (s.dailyStreak || 0) >= 3 },

  { id: "loremaster", name: "Loremaster",
    desc: "10 correct lore answers, lifetime.",
    motif: "scroll",
    check: (s) => (s.loreCorrect || 0) >= 10 },

  { id: "speed_reader", name: "Speed Reader",
    desc: "Answer 15+ quotes in a single Rush minute.",
    motif: "bolt",
    check: (s, c) => c.mode === "rush" && c.rounds >= 15 }
];
