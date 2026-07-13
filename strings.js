/* ============================================================
   STORIED — UI strings (localization scaffolding)
   ------------------------------------------------------------
   UI chrome strings live here (not game content — packs carry
   their own language). Ship English; add a locale by copying
   the `en` block. T(key) falls back to English, then the key.

   Migration is incremental: dynamic strings the engine builds
   at runtime route through T() first; static HTML text migrates
   as locales actually arrive. When adding engine text, ALWAYS
   add it here and use T().
   ============================================================ */

const STRINGS = {
  en: {
    correct: "Correct",
    notQuite: "Not quite",
    revealed: "Revealed",
    nextQuote: "Next quote \u2192",
    seeResults: "See results \u2192",
    hintPrefix: "Hint:",
    sourcePrefix: "Source:",
    fromTheLore: "From the lore",
    loadingPack: "Loading",
    packLoadFailed: "Couldn't load this pack \u2014 check your connection.",
    packEmpty: "This pack has no playable content for that mode.",
    packBroken: "This pack is broken \u2014 it was skipped.",
    shareResult: "Share result",
    copied: "Copied!",
    playToday: "Play today's ten",
    practiceToday: "Practice today's ten",
    newBest: "New personal best!",
    onBoard: "On the board for today!",
    unlockedPrefix: "Unlocked:",
    hintReveal: "Hint revealed \u2014 40 points will come off this quote.",
    disclaimer: "Unofficial fan trivia \u2014 not affiliated with or endorsed by any franchise."
  }
};

let LOCALE = "en";

function T(key) {
  return (STRINGS[LOCALE] && STRINGS[LOCALE][key]) || STRINGS.en[key] || key;
}

if (typeof window !== "undefined") { window.T = T; window.STRINGS = STRINGS; }
