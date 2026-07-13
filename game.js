/* ============================================================
   STORIED — game engine
   ------------------------------------------------------------
   Config knobs live just below. Modes are data: add a new mode
   by adding an entry to MODES and a start button that calls
   startGame("yourmode").
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- config ---------------- */

  const CONFIG = {
    rounds: 10,               // quotes per classic/daily/study game
    rushSeconds: 60,          // rush mode clock
    rushAdvanceMs: 700,       // pause on feedback before auto-next
    hintCost: 40,
    streakStep: 25,           // bonus per consecutive correct
    streakCap: 100,
    basePoints: { easy: 100, medium: 150, hard: 200 },
    optionCount: { easy: 4, medium: 6 }
  };

  /* How busy the floating-motif bursts are. All tunable. */
  const MOTIF_DENSITY = {
    burst:   { desktop: [5, 8], mobile: [3, 5] },  // [min, max] per correct answer
    hotExtra: 3,          // bonus motifs while the streak is on fire (>=3)
    maxOnScreen: 18,      // hard cap so long streaks never wallpaper the page
    // three size tiers: most motifs small/medium, the odd one looms large
    sizes: [
      { chance: 0.45, min: 24,  max: 44  },   // small
      { chance: 0.35, min: 44,  max: 74  },   // medium
      { chance: 0.20, min: 74,  max: 120 }    // large
    ],
    mobileScale: 0.62
  };

  /* Per-mode rules. `diff` of null means "use the player's pick". */
  const MODES = {
    classic: { label: "Classic", diff: null,     timed: false, autoAdvance: false },
    daily:   { label: "Daily",   diff: "medium", timed: false, autoAdvance: false },
    rush:    { label: "Rush",    diff: "easy",   timed: true,  autoAdvance: true  },
    fandom:  { label: "Fandom",  diff: null,     timed: false, autoAdvance: false },
    study:   { label: "Study",   diff: null,     timed: false, autoAdvance: false },
    studio:  { label: "Studio",  diff: null,     timed: false, autoAdvance: false }
  };

  const EXTRA_COLORS = { study: "#63c8ff" };

  function catColor(cat) {
    return (CATEGORIES[cat] && CATEGORIES[cat].color) ||
      (typeof FANDOM_PACKS !== "undefined" && FANDOM_PACKS[cat] && FANDOM_PACKS[cat].color) ||
      EXTRA_COLORS[cat] || "#9aa0b0";
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- a11y: color contrast ---------------- */

  function relLuminance(hex) {
    const c = hex.replace("#", "");
    const chan = (i) => {
      let v = parseInt(c.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
  }

  function contrastRatio(a, b) {
    const l1 = relLuminance(a), l2 = relLuminance(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Ink color that meets WCAG AA (4.5:1) on the given background —
      pack colors are arbitrary once the Studio and imports exist. */
  function contrastInk(bg) {
    try {
      return contrastRatio(bg, "#12151c") >= 4.5 ? "#12151c" : "#ede6d6";
    } catch (e) { return "#12151c"; }
  }

  /* ---------------- persistent stores ---------------- */

  const BEST_KEY = "quoted.best.v1";
  const DAILY_KEY = "quoted.daily.v1";
  const STATS_KEY = "quoted.stats.v1";
  const ACH_KEY = "quoted.ach.v1";

  /* Lifetime stats shape (all counters, never reset):
     { games, answers, correct, loreCorrect, rushGames,
       byCat: {cat:{answers,correct}}, byPack: {id:{answers,correct,games}},
       packsTried: [], bestRunStreak, dailyStreak } */
  function readStats() {
    const s = readStore(STATS_KEY);
    return Object.assign({ games: 0, answers: 0, correct: 0, loreCorrect: 0,
      rushGames: 0, byCat: {}, byPack: {}, packsTried: [], bestRunStreak: 0,
      dailyStreak: 0 }, s);
  }

  /** Consecutive daily-challenge days ending today (or yesterday if
      today is still unplayed). Pure — month/year boundaries handled
      by real date math. */
  function computeDailyStreak(datesSet, today) {
    const dayMs = 86400000;
    let t = Date.parse(today + "T00:00:00Z");
    if (!datesSet.has(today)) t -= dayMs; // grace: today not played yet
    let streak = 0;
    while (datesSet.has(new Date(t).toISOString().slice(0, 10))) {
      streak++;
      t -= dayMs;
    }
    return streak;
  }

  /** Spoiler-free share card: label, emoji grid, score. */
  function buildShareText(g) {
    const cells = g.results.slice(0, 20).map((r) => (r ? "\uD83D\uDFE9" : "\uD83D\uDFE5")).join("");
    const extra = g.results.length > 20 ? " +" + (g.results.length - 20) : "";
    return "STORIED \u00B7 " + g.label + "\n" + cells + extra + "\n" +
      g.score + " pts \u00B7 \u00D7" + g.bestStreak + " best streak";
  }

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch (e) { return {}; }
  }

  function writeStore(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  function saveBest(slot, value) {
    const bests = readStore(BEST_KEY);
    if (value > 0 && (!bests[slot] || value > bests[slot])) {
      bests[slot] = value;
      writeStore(BEST_KEY, bests);
      return true;
    }
    return false;
  }

  function paintBests() {
    const bests = readStore(BEST_KEY);
    document.querySelectorAll(".diff-best").forEach((span) => {
      const b = bests[span.dataset.best];
      span.hidden = !b;
      if (b) span.textContent = "Best: " + b;
    });
    el.rushBest.textContent = bests.rush
      ? "Personal best: " + bests.rush + " pts"
      : "No run on the clock yet.";
  }

  /* ---------------- daily seed ---------------- */

  function todayKey() {
    const d = new Date();
    return d.getUTCFullYear() + "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(d.getUTCDate()).padStart(2, "0");
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededShuffle(arr, seedStr) {
    const rand = mulberry32(hashString(seedStr));
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildDailyDeck(dateStr) {
    return seededShuffle(QUOTES, "quoted-" + dateStr).slice(0, CONFIG.rounds);
  }

  /* ---------------- state ---------------- */

  const settings = {
    mode: "classic",
    difficulty: "easy",       // classic pick
    studyDifficulty: "easy",  // study pick
    fandomDifficulty: "easy", // fandom pick
    fandomMode: "quotes",     // quotes | lore | mixed
    fandomId: null,           // set at boot from the pack manifest
    cats: [],                 // set at boot from core categories
    deckId: null
  };

  let deck = [];              // entries for this game (rush: a repeating queue)
  let round = 0;
  let answeredCount = 0;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctCount = 0;
  let hintsUsed = 0;
  let hintUsedThisRound = false;
  let answered = false;
  let typer = null;
  let rushTimer = null;
  let rushEndsAt = 0;
  let activeDiff = "easy";    // resolved difficulty for the running game
  let activeDeckName = "";

  /* ---------------- dom ---------------- */

  const $ = (id) => document.getElementById(id);

  const screens = { start: $("screen-start"), game: $("screen-game"), end: $("screen-end"), stats: $("screen-stats") };

  const el = {
    catGrid: $("cat-grid"),
    btnStart: $("btn-start"),
    btnDaily: $("btn-daily-start"),
    btnRush: $("btn-rush-start"),
    dailyStatus: $("daily-status"),
    endAch: $("end-ach"),
    dailyBoard: $("daily-board"),
    accountLabel: $("account-label"),
    accountBox: $("account-box"),
    btnShare: $("btn-share"),
    btnStats: $("btn-stats"),
    btnStatsBack: $("btn-stats-back"),
    statsTotals: $("stats-totals"),
    calMonth: $("cal-month"),
    calGrid: $("cal-grid"),
    statsCats: $("stats-cats"),
    achGrid: $("ach-grid"),
    dailyDate: $("daily-date"),
    rushBest: $("rush-best"),
    fandomGrid: $("fandom-grid"),
    packSearch: $("pack-search"),
    packTags: $("pack-tags"),
    packMore: $("pack-more"),
    fandomBlurb: $("fandom-blurb"),
    fandomBest: $("fandom-best"),
    fandomModeRow: $("fandom-mode-row"),
    sourceLine: $("source-line"),
    btnFandomStart: $("btn-fandom-start"),
    dropzone: $("dropzone"),
    fileInput: $("file-input"),
    pasteArea: $("paste-area"),
    deckName: $("deck-name"),
    btnMakeDeck: $("btn-make-deck"),
    deckMsg: $("deck-msg"),
    deckList: $("deck-list"),
    hudRoundLabel: $("hud-round-label"),
    hudRound: $("hud-round"),
    hudScore: $("hud-score"),
    hudStreak: $("hud-streak"),
    progressFill: $("progress-fill"),
    confettiLayer: $("confetti-layer"),
    motifLayer: $("motif-layer"),
    card: $("quote-card"),
    spine: $("card-spine"),
    catTab: $("cat-tab"),
    quoteText: $("quote-text"),
    hintLine: $("hint-line"),
    promptLine: $("prompt-line"),
    answerArea: $("answer-area"),
    feedback: $("feedback"),
    btnHint: $("btn-hint"),
    btnSkip: $("btn-skip"),
    btnQuit: $("btn-quit"),
    btnNext: $("btn-next"),
    endEyebrow: $("end-eyebrow"),
    endRank: $("end-rank"),
    endBest: $("end-best"),
    endScore: $("end-score"),
    endCorrect: $("end-correct"),
    endStreak: $("end-streak"),
    endHints: $("end-hints"),
    btnAgain: $("btn-again"),
    btnSettings: $("btn-settings")
  };

  /* ---------------- helpers ---------------- */

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
    // move keyboard/screen-reader focus with the view change
    screens[name].setAttribute("tabindex", "-1");
    try { screens[name].focus({ preventScroll: true }); } catch (e) {}
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function normalize(s) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\b(the|a|an)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function answerForms(entry) {
    const forms = new Set();
    [entry.a, ...(entry.alt || [])].forEach((title) => {
      forms.add(normalize(title));
      if (title.includes(":")) {
        title.split(":").forEach((part) => {
          const n = normalize(part);
          if (n.length >= 4) forms.add(n);
        });
      }
    });
    forms.delete("");
    return [...forms];
  }

  function isMatch(guess, entry) {
    const g = normalize(guess);
    if (g.length < 2) return false;
    return answerForms(entry).some((f) => {
      if (f === g) return true;
      if (g.length >= 5 && f.includes(g)) return true;
      if (f.length >= 5 && g.includes(f)) return true;
      return false;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------------- setup screen ---------------- */

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".mode-tab").forEach((t) => {
        t.classList.remove("selected");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("selected");
      tab.setAttribute("aria-selected", "true");
      settings.mode = tab.dataset.mode;
      document.querySelectorAll(".mode-panel").forEach((p) => {
        p.hidden = p.id !== "panel-" + settings.mode;
      });
      if (settings.mode === "daily") paintDaily();
      if (settings.mode === "study") paintDecks();
      if (settings.mode === "fandom") paintFandom();
      if (settings.mode === "studio" && typeof Studio !== "undefined") Studio.open();
    });
  });

  function buildCatChips() {
    el.catGrid.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([key, meta]) => {
      const btn = document.createElement("button");
      btn.className = "cat-chip" + (settings.cats.includes(key) ? " on" : "");
      btn.style.setProperty("--chip-color", catColor(key));
      btn.setAttribute("aria-pressed", settings.cats.includes(key));
      btn.innerHTML = '<span class="dot"></span>' + escapeHtml(meta.label);
      btn.addEventListener("click", () => {
        const i = settings.cats.indexOf(key);
        if (i >= 0) settings.cats.splice(i, 1); else settings.cats.push(key);
        btn.classList.toggle("on");
        btn.setAttribute("aria-pressed", btn.classList.contains("on"));
        el.btnStart.disabled = settings.cats.length === 0;
      });
      el.catGrid.appendChild(btn);
    });
  }

  document.querySelectorAll(".diff-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".diff-card").forEach((c) => {
        c.classList.remove("selected");
        c.setAttribute("aria-checked", "false");
      });
      card.classList.add("selected");
      card.setAttribute("aria-checked", "true");
      settings.difficulty = card.dataset.diff;
    });
  });

  document.querySelectorAll("[data-studydiff]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-studydiff]").forEach((c) => {
        c.classList.remove("selected");
        c.setAttribute("aria-checked", "false");
      });
      chip.classList.add("selected");
      chip.setAttribute("aria-checked", "true");
      settings.studyDifficulty = chip.dataset.studydiff;
    });
  });

  /* ---------------- fandom setup ---------------- */

  /* The pack browser: search + tag filters + a capped card list.
     Built to stay usable at hundreds of packs. */
  const browser = { query: "", tag: null, cap: 60 };

  function buildPackBrowser() {
    if (!el.fandomGrid) return;
    // tag chips from the union of all pack tags
    const tags = [...new Set(Object.values(FANDOM_PACKS).flatMap((p) => p.tags || []))].sort();
    el.packTags.innerHTML = "";
    tags.forEach((tag) => {
      const chip = document.createElement("button");
      chip.className = "chip tag-chip";
      chip.textContent = tag;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        browser.tag = browser.tag === tag ? null : tag;
        el.packTags.querySelectorAll(".tag-chip").forEach((c) => {
          const on = c.textContent === browser.tag;
          c.classList.toggle("selected", on);
          c.setAttribute("aria-pressed", on);
        });
        renderPackList();
      });
      el.packTags.appendChild(chip);
    });
    el.packSearch.addEventListener("input", () => {
      browser.query = el.packSearch.value.trim().toLowerCase();
      renderPackList();
    });
    renderPackList();
  }

  function renderPackList() {
    const bests = readStore(BEST_KEY);
    const all = Object.entries(FANDOM_PACKS).filter(([, p]) => {
      if (browser.tag && !(p.tags || []).includes(browser.tag)) return false;
      if (browser.query &&
          !p.label.toLowerCase().includes(browser.query) &&
          !(p.tags || []).some((t) => t.includes(browser.query))) return false;
      return true;
    });
    el.fandomGrid.innerHTML = "";
    all.slice(0, browser.cap).forEach(([key, pack]) => {
      const btn = document.createElement("button");
      btn.className = "cat-chip pack-card" + (settings.fandomId === key ? " on" : "");
      btn.style.setProperty("--chip-color", pack.color);
      btn.setAttribute("aria-pressed", settings.fandomId === key);
      const count = pack.quoteCount != null ? pack.quoteCount : (pack.quotes || []).length;
      const best = bests["fandom:" + key + ":" + settings.fandomDifficulty +
        (settings.fandomMode === "quotes" ? "" : ":" + settings.fandomMode)];
      btn.innerHTML =
        '<span class="dot"></span>' +
        '<span class="pack-card-main"><span class="pack-card-label">' + escapeHtml(pack.label) + "</span>" +
        '<span class="pack-card-meta">' + count + " quotes" +
        ((pack.tags || []).length ? " \u00B7 " + pack.tags.join(", ") : "") + "</span></span>" +
        (pack.local ? '<span class="pack-card-local">LOCAL</span>' : "") +
        (best ? '<span class="pack-card-best">' + best + "</span>" : "");
      btn.addEventListener("click", () => {
        settings.fandomId = key;
        PackStore.prefetch(key); // warm the pack while they read the blurb
        el.fandomGrid.querySelectorAll(".pack-card").forEach((c) => {
          c.classList.toggle("on", c === btn);
          c.setAttribute("aria-pressed", c === btn);
        });
        paintFandom();
      });
      el.fandomGrid.appendChild(btn);
    });
    el.packMore.hidden = all.length <= browser.cap;
    if (!el.packMore.hidden) {
      el.packMore.textContent = "Showing " + browser.cap + " of " + all.length + " packs \u2014 refine your search.";
    }
  }

  /** Best-score slot: quotes mode keeps the legacy key so existing
      player bests survive; lore/mixed get suffixed slots. */
  function fandomSlot() {
    return "fandom:" + settings.fandomId + ":" + settings.fandomDifficulty +
      (settings.fandomMode === "quotes" ? "" : ":" + settings.fandomMode);
  }

  function attributionFor(entry) {
    if (!entry || !entry.source) return "";
    let host = entry.source;
    try { host = new URL(entry.source).hostname.replace(/^www\./, ""); } catch (e) {}
    return "Source: " + host + (entry.license ? " \u00B7 " + entry.license : "");
  }

  function paintFandom() {
    if (typeof FANDOM_PACKS === "undefined") return;
    const pack = FANDOM_PACKS[settings.fandomId];
    if (!pack) return;
    const qCount = pack.quoteCount != null ? pack.quoteCount : (pack.quotes || []).length;
    const lCount = pack.loreCount != null ? pack.loreCount : (pack.lore || []).length;
    el.fandomBlurb.textContent = pack.blurb + " (" + qCount + " quotes" +
      (lCount ? " \u00B7 " + lCount + " lore" : "") + " \u00B7 " + pack.prompt + ")";
    el.btnFandomStart.textContent = pack.cta || "Start the pack";

    // lore/mixed only offered when the pack has lore content
    if (lCount === 0 && settings.fandomMode !== "quotes") settings.fandomMode = "quotes";
    el.fandomModeRow.querySelectorAll("[data-fandommode]").forEach((c) => {
      const m = c.dataset.fandommode;
      c.disabled = m !== "quotes" && lCount === 0;
      const on = settings.fandomMode === m;
      c.classList.toggle("selected", on);
      c.setAttribute("aria-checked", on);
    });

    const b = readStore(BEST_KEY)[fandomSlot()];
    el.fandomBest.textContent = b ? "Personal best: " + b + " pts" : "No run logged for this pack yet.";
  }

  document.querySelectorAll("[data-fandommode]").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.disabled) return;
      settings.fandomMode = chip.dataset.fandommode;
      paintFandom();
      renderPackList();
    });
  });

  document.querySelectorAll("[data-fandomdiff]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-fandomdiff]").forEach((c) => {
        c.classList.remove("selected");
        c.setAttribute("aria-checked", "false");
      });
      chip.classList.add("selected");
      chip.setAttribute("aria-checked", "true");
      settings.fandomDifficulty = chip.dataset.fandomdiff;
      paintFandom();
    });
  });

  /* ---------------- daily panel ---------------- */

  function paintDaily() {
    if (!el.btnDaily || !el.dailyStatus) return; // Daily UI removed (dormant)
    const key = todayKey();
    el.dailyDate.textContent = "Deck of " + key + " \u2014 identical for every player.";
    const played = readStore(DAILY_KEY)[key];
    el.dailyStatus.innerHTML = played !== undefined
      ? "Today's score on the board: <strong>" + played + " pts</strong>. Extra runs are practice."
      : "You haven't played today's deck yet.";
    el.btnDaily.textContent = played !== undefined ? T("practiceToday") : T("playToday");
    paintDailyBoard();
  }

  /* ---------------- study panel ---------------- */

  function readFileToDeck(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const name = el.deckName.value.trim() || file.name.replace(/\.[^.]+$/, "");
      makeDeck(name, String(reader.result), file.name);
    };
    reader.onerror = () => setDeckMsg("Couldn't read that file.", true);
    reader.readAsText(file);
  }

  function makeDeck(name, text, filename) {
    const res = DECKS.add(name, text, filename);
    if (res.error) { setDeckMsg(res.error, true); return; }
    setDeckMsg("Built \u201C" + res.deck.name + "\u201D \u2014 " + res.deck.questions.length + " questions.", false);
    el.pasteArea.value = "";
    el.deckName.value = "";
    paintDecks();
  }

  function setDeckMsg(msg, isError) {
    el.deckMsg.textContent = msg;
    el.deckMsg.classList.toggle("error", !!isError);
  }

  function paintDecks() {
    if (!el.btnMakeDeck && !document.getElementById("deck-list")) return; // Study UI removed (dormant)
    const decks = DECKS.list();
    el.deckList.innerHTML = "";
    if (!decks.length) {
      el.deckList.innerHTML = '<p class="deck-empty">No decks yet \u2014 feed me a document.</p>';
      return;
    }
    decks.forEach((d) => {
      const row = document.createElement("div");
      row.className = "deck-row";
      row.innerHTML =
        '<div class="deck-meta"><span class="deck-title">' + escapeHtml(d.name) + "</span>" +
        '<span class="deck-count">' + d.questions.length + " questions</span></div>";
      const play = document.createElement("button");
      play.className = "btn-guess";
      play.textContent = "Play";
      play.addEventListener("click", () => { settings.deckId = d.id; startGame("study"); });
      const del = document.createElement("button");
      del.className = "btn-ghost deck-del";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        DECKS.remove(d.id);
        paintDecks();
        setDeckMsg("Deleted \u201C" + d.name + "\u201D.", false);
      });
      const actions = document.createElement("div");
      actions.className = "deck-actions";
      actions.append(play, del);
      row.appendChild(actions);
      el.deckList.appendChild(row);
    });
  }

  if (el.dropzone && el.fileInput) { // Study UI removed (dormant)
    el.dropzone.addEventListener("click", () => el.fileInput.click());
    el.dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.fileInput.click(); }
    });
    el.fileInput.addEventListener("change", () => {
      if (el.fileInput.files[0]) readFileToDeck(el.fileInput.files[0]);
      el.fileInput.value = "";
    });
    ["dragover", "dragenter"].forEach((ev) =>
      el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.add("over"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.remove("over"); })
    );
    el.dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFileToDeck(f);
    });

  }

  if (el.btnMakeDeck) el.btnMakeDeck.addEventListener("click", () => {
    const text = el.pasteArea.value;
    if (text.trim().length < 200) {
      setDeckMsg("Paste a bit more \u2014 a few solid paragraphs at least.", true);
      return;
    }
    makeDeck(el.deckName.value || "Pasted notes", text, "pasted.txt");
  });

  /* ---------------- game flow ---------------- */

  function studyEntries(deckObj) {
    return deckObj.questions.map((qq) => ({
      q: qq.q,
      a: qq.a,
      alt: [],
      cat: "study",
      hint: "From your deck \u201C" + deckObj.name + "\u201D",
      pool: qq.pool,
      tabLabel: deckObj.name.slice(0, 16)
    }));
  }

  function startGame(mode) {
    roundResults = [];
    settings.mode = mode || settings.mode;
    const m = MODES[settings.mode];

    if (settings.mode === "classic") {
      activeDiff = settings.difficulty;
      const pool = QUOTES.filter((q) => settings.cats.includes(q.cat));
      deck = shuffle(pool).slice(0, Math.min(CONFIG.rounds, pool.length));
    } else if (settings.mode === "daily") {
      activeDiff = m.diff;
      deck = buildDailyDeck(todayKey());
    } else if (settings.mode === "rush") {
      activeDiff = m.diff;
      deck = shuffle(QUOTES); // repeating queue
    } else if (settings.mode === "fandom") {
      const pack = FANDOM_PACKS[settings.fandomId];
      if (!pack) return;
      if (!pack.loaded) {
        // hosted path: fetch the pack, then start for real
        el.fandomBlurb.textContent = T("loadingPack") + " " + pack.label + "\u2026";
        PackStore.load(settings.fandomId)
          .then(() => startGame("fandom"))
          .catch(() => { el.fandomBlurb.textContent = T("packLoadFailed"); });
        return;
      }
      activeDiff = settings.fandomDifficulty;
      activeDeckName = pack.label;
      const stampQuote = (q) => Object.assign({}, q, {
        cat: settings.fandomId,
        tabLabel: pack.label,
        pool: pack.roster,
        placeholder: pack.placeholder,
        motifs: q.motifs || pack.motifs
      });
      const stampLore = (l) => Object.assign({}, l, {
        q: l.question,
        cat: settings.fandomId,
        tabLabel: pack.label,
        pool: l.pool, // lore questions bring their own wrong answers
        placeholder: "Type the answer\u2026",
        motifs: l.motifs || pack.motifs,
        isLore: true
      });
      const src =
        settings.fandomMode === "lore" ? (pack.lore || []).map(stampLore) :
        settings.fandomMode === "mixed" ? pack.quotes.map(stampQuote).concat((pack.lore || []).map(stampLore)) :
        pack.quotes.map(stampQuote);
      deck = shuffle(src).slice(0, CONFIG.rounds);
      if (!deck.length) { el.fandomBlurb.textContent = T("packEmpty"); return; }
    } else if (settings.mode === "study") {
      activeDiff = settings.studyDifficulty;
      const deckObj = DECKS.get(settings.deckId);
      if (!deckObj) return;
      activeDeckName = deckObj.name;
      deck = shuffle(studyEntries(deckObj)).slice(0, CONFIG.rounds);
    }
    if (!deck.length) return;

    round = 0; answeredCount = 0; score = 0; streak = 0;
    bestStreak = 0; correctCount = 0; hintsUsed = 0;

    el.hudRoundLabel.textContent = m.timed ? "Answered" : "Quote";
    show("game");

    if (m.timed) {
      rushEndsAt = Date.now() + CONFIG.rushSeconds * 1000;
      clearInterval(rushTimer);
      rushTimer = setInterval(tickRush, 100);
    }
    renderRound();
  }

  function tickRush() {
    const left = Math.max(0, rushEndsAt - Date.now());
    el.progressFill.style.width = (left / (CONFIG.rushSeconds * 1000)) * 100 + "%";
    el.hudRound.textContent = answeredCount + " \u00B7 " + Math.ceil(left / 1000) + "s";
    if (left <= 0) {
      clearInterval(rushTimer);
      endGame();
    }
  }

  function current() {
    return MODES[settings.mode].timed ? deck[round % deck.length] : deck[round];
  }

  function totalRounds() {
    return MODES[settings.mode].timed ? Infinity : deck.length;
  }

  function renderRound() {
    const entry = current();
    const m = MODES[settings.mode];
    answered = false;
    hintUsedThisRound = false;

    if (!m.timed) {
      el.hudRound.textContent = (round + 1) + "/" + deck.length;
      el.progressFill.style.width = (round / deck.length) * 100 + "%";
    }
    el.hudScore.textContent = score;
    el.hudStreak.textContent = "\u00D7" + streak;
    el.hudStreak.classList.toggle("hot", streak >= 3);

    el.feedback.className = "feedback";
    el.feedback.innerHTML = "";
    el.btnNext.hidden = true;
    el.btnSkip.hidden = m.autoAdvance;
    el.btnSkip.disabled = false;

    const showAll = activeDiff === "easy";
    el.btnHint.hidden = showAll || m.autoAdvance;
    el.btnHint.disabled = false;

    const fandomPack = settings.mode === "fandom" && typeof FANDOM_PACKS !== "undefined"
      ? FANDOM_PACKS[settings.fandomId] : null;
    if (showAll || fandomPack) revealCategory(entry); else hideCategory();
    el.promptLine.hidden = !fandomPack;
    if (fandomPack) {
      el.promptLine.textContent = entry.isLore ? T("fromTheLore") : fandomPack.prompt;
      el.promptLine.style.color = catColor(entry.cat);
    }
    el.card.classList.toggle("lore", !!entry.isLore);
    el.sourceLine.hidden = true;
    el.hintLine.hidden = !showAll;
    if (showAll) el.hintLine.innerHTML = T("hintPrefix") + " <strong>" + escapeHtml(entry.hint) + "</strong>";

    buildAnswerArea(entry);
    typeQuote(entry.q);
  }

  function revealCategory(entry) {
    const color = catColor(entry.cat);
    el.card.style.setProperty("--spine-color", color);
    el.catTab.style.setProperty("--tab-color", color);
    el.catTab.classList.add("revealed");
    el.catTab.style.color = contrastInk(color);
    el.catTab.textContent = entry.tabLabel ||
      (CATEGORIES[entry.cat] ? CATEGORIES[entry.cat].label : entry.cat);
  }

  function hideCategory() {
    el.card.style.setProperty("--spine-color", "var(--ink-dim)");
    el.catTab.style.removeProperty("--tab-color");
    el.catTab.classList.remove("revealed");
    el.catTab.textContent = "?";
  }

  /* ---------------- quote typewriter ---------------- */

  function typeQuote(text) {
    clearInterval(typer);
    if (reducedMotion || MODES[settings.mode].timed) { // rush: no time to type
      el.quoteText.textContent = text;
      return;
    }
    el.quoteText.innerHTML = '<span class="typed"></span><span class="caret"></span>';
    const typed = el.quoteText.querySelector(".typed");
    let i = 0;
    typer = setInterval(() => {
      i++;
      typed.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(typer);
        const caret = el.quoteText.querySelector(".caret");
        if (caret) caret.remove();
      }
    }, 24);
  }

  function finishTyping() {
    clearInterval(typer);
    el.quoteText.textContent = current().q;
  }

  /* ---------------- answer area ---------------- */

  function buildAnswerArea(entry) {
    el.answerArea.innerHTML = "";

    if (activeDiff === "hard") {
      const row = document.createElement("div");
      row.className = "type-row";
      const input = document.createElement("input");
      input.className = "type-input";
      input.type = "text";
      input.placeholder = entry.placeholder ||
        (entry.pool ? "Type the missing word\u2026" : "Type the title\u2026");
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Your answer");
      const btn = document.createElement("button");
      btn.className = "btn-guess";
      btn.textContent = "Guess";
      const submit = () => {
        if (answered || !input.value.trim()) return;
        resolveRound(isMatch(input.value, entry), input.value.trim());
      };
      btn.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      row.append(input, btn);
      el.answerArea.appendChild(row);
      input.focus();
      return;
    }

    const options = buildOptions(entry, CONFIG.optionCount[activeDiff] || 4);
    const grid = document.createElement("div");
    grid.className = "options-grid";
    options.forEach((title, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.dataset.title = title;
      btn.innerHTML = '<span class="key">' + (i + 1) + "</span>" + escapeHtml(title);
      btn.addEventListener("click", () => {
        if (answered) return;
        resolveRound(title === entry.a, title, btn);
      });
      grid.appendChild(btn);
    });
    el.answerArea.appendChild(grid);
  }

  function buildOptions(entry, count) {
    const seen = new Set([normalize(entry.a)]);
    const picks = [entry.a];

    const addTitles = (titles) => {
      for (const t of shuffle(titles)) {
        if (picks.length >= count) break;
        const key = normalize(t);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        picks.push(t);
      }
    };

    if (entry.pool) {
      // study question: distractors come from the player's own document
      addTitles(entry.pool);
      addTitles(QUOTES.map((q) => q.a)); // emergency pad, rarely reached
      return shuffle(picks);
    }

    const addFrom = (list) => {
      for (const q of shuffle(list)) {
        if (picks.length >= count) break;
        const key = normalize(q.a);
        if (seen.has(key) || isMatch(q.a, entry)) continue;
        seen.add(key);
        picks.push(q.a);
      }
    };
    if (activeDiff === "easy") {
      if (entry.franchise) addFrom(QUOTES.filter((q) => q.franchise === entry.franchise && q !== entry));
      addFrom(QUOTES.filter((q) => q.cat === entry.cat && q !== entry));
    } else {
      addFrom(QUOTES.filter((q) => settings.mode !== "classic" || settings.cats.includes(q.cat)).filter((q) => q !== entry));
    }
    addFrom(QUOTES.filter((q) => q !== entry));
    return shuffle(picks);
  }

  /* ---------------- resolution + scoring ---------------- */

  let roundResults = [];

  function resolveRound(correct, guess, clickedBtn) {
    answered = true;
    roundResults.push(!!correct);
    {
      const st = readStats();
      st.answers++;
      if (correct) st.correct++;
      if (correct && current().isLore) st.loreCorrect++;
      const cat = current().cat;
      st.byCat[cat] = st.byCat[cat] || { answers: 0, correct: 0 };
      st.byCat[cat].answers++;
      if (correct) st.byCat[cat].correct++;
      if (settings.mode === "fandom") {
        const id = settings.fandomId;
        st.byPack[id] = st.byPack[id] || { answers: 0, correct: 0, games: 0 };
        st.byPack[id].answers++;
        if (correct) st.byPack[id].correct++;
      }
      writeStore(STATS_KEY, st);
    }
    answeredCount++;
    finishTyping();
    revealCategory(current());
    el.btnHint.disabled = true;
    el.btnSkip.disabled = true;
    el.hintLine.hidden = false;
    el.hintLine.innerHTML = T("hintPrefix") + " <strong>" + escapeHtml(current().hint) + "</strong>";
    if (current().source) {
      el.sourceLine.hidden = false;
      el.sourceLine.innerHTML = attributionFor(current()).replace(
        /^Source: ([^\s\u00B7]+)/,
        'Source: <a href="' + escapeHtml(current().source) + '" target="_blank" rel="noopener">$1</a>'
      );
    }

    document.querySelectorAll(".option-btn").forEach((b) => {
      b.disabled = true;
      if (b.dataset.title === current().a) b.classList.add("correct");
      else if (b === clickedBtn) b.classList.add("wrong");
      else b.classList.add("faded");
    });
    const input = el.answerArea.querySelector(".type-input");
    if (input) input.disabled = true;
    const guessBtn = el.answerArea.querySelector(".btn-guess");
    if (guessBtn) guessBtn.disabled = true;

    if (correct) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      correctCount++;
      const base = CONFIG.basePoints[activeDiff];
      const hintCost = hintUsedThisRound ? CONFIG.hintCost : 0;
      const bonus = Math.min((streak - 1) * CONFIG.streakStep, CONFIG.streakCap);
      const gained = Math.max(base - hintCost, 20) + bonus;
      score += gained;
      setFeedback("good", "Correct",
        "+" + gained + " pts \u2014 <strong>" + escapeHtml(current().a) + "</strong>" +
        (bonus ? " (streak bonus +" + bonus + ")" : "") +
        (hintCost ? " (hint \u2212" + hintCost + ")" : ""));
      el.card.style.setProperty("--spine-color", "var(--c-correct)");
      popScore();
      burstConfetti(catColor(current().cat));
      spawnMotifs(current());
    } else {
      streak = 0;
      setFeedback("bad", guess ? "Not quite" : "Revealed",
        (guess ? "You said \u201C" + escapeHtml(guess) + "\u201D. " : "") +
        "It was <strong>" + escapeHtml(current().a) + "</strong>.");
      el.card.style.setProperty("--spine-color", "var(--c-wrong)");
    }

    el.hudScore.textContent = score;
    el.hudStreak.textContent = "\u00D7" + streak;
    el.hudStreak.classList.toggle("hot", streak >= 3);

    const m = MODES[settings.mode];
    if (m.autoAdvance) {
      setTimeout(() => {
        if (screens.game.classList.contains("active") && Date.now() < rushEndsAt) nextRound();
      }, CONFIG.rushAdvanceMs);
      return;
    }
    el.progressFill.style.width = ((round + 1) / deck.length) * 100 + "%";
    el.btnNext.hidden = false;
    el.btnNext.textContent = round + 1 >= totalRounds() ? "See results \u2192" : "Next quote \u2192";
    el.btnNext.focus();
  }

  function setFeedback(kind, verdict, detailHtml) {
    el.feedback.className = "feedback " + kind;
    el.feedback.innerHTML =
      '<span class="verdict">' + verdict + '</span><br><span class="detail">' + detailHtml + "</span>";
  }

  function useHint() {
    if (answered || hintUsedThisRound || activeDiff === "easy") return;
    hintUsedThisRound = true;
    hintsUsed++;
    revealCategory(current());
    el.hintLine.hidden = false;
    el.hintLine.innerHTML = T("hintPrefix") + " <strong>" + escapeHtml(current().hint) + "</strong>";
    if (current().source) {
      el.sourceLine.hidden = false;
      el.sourceLine.innerHTML = attributionFor(current()).replace(
        /^Source: ([^\s\u00B7]+)/,
        'Source: <a href="' + escapeHtml(current().source) + '" target="_blank" rel="noopener">$1</a>'
      );
    }
    el.btnHint.disabled = true;
    setFeedback("", "", "Hint revealed \u2014 " + CONFIG.hintCost + " points will come off this quote.");
  }

  function nextRound() {
    round++;
    if (round >= totalRounds()) endGame();
    else renderRound();
  }

  /* ---------------- juice: motifs, confetti, score pop ---------------- */

  function motifsFor(entry) {
    const ids =
      (entry.motifs && entry.motifs.length && entry.motifs) ||
      MOTIF_MAP[entry.a] ||
      CATEGORY_MOTIFS[entry.cat] ||
      ["star"];
    return ids.filter((id) => MOTIFS[id]);
  }

  function pickSize() {
    const roll = Math.random();
    let acc = 0;
    for (const tier of MOTIF_DENSITY.sizes) {
      acc += tier.chance;
      if (roll <= acc) return tier.min + Math.random() * (tier.max - tier.min);
    }
    const last = MOTIF_DENSITY.sizes[MOTIF_DENSITY.sizes.length - 1];
    return last.min + Math.random() * (last.max - last.min);
  }

  function spawnMotifs(entry) {
    if (reducedMotion || !el.motifLayer) return;
    const ids = shuffle(motifsFor(entry));
    if (!ids.length) return;

    const narrow = window.innerWidth < 620;
    const range = narrow ? MOTIF_DENSITY.burst.mobile : MOTIF_DENSITY.burst.desktop;
    let count = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
    if (streak >= 3) count += MOTIF_DENSITY.hotExtra; // fire streak = busier sky
    count = Math.min(count, Math.max(0, MOTIF_DENSITY.maxOnScreen - el.motifLayer.childElementCount));
    if (count <= 0) return;

    const gutter = Math.max(Math.min(window.innerWidth * 0.14, 130), 52);
    const color = catColor(entry.cat);

    for (let i = 0; i < count; i++) {
      const shape = MOTIFS[ids[i % ids.length]];
      let size = pickSize();
      if (narrow) size *= MOTIF_DENSITY.mobileScale;

      const wrap = document.createElement("div");
      wrap.className = "motif";
      wrap.style.color = color;
      wrap.style.width = wrap.style.height = size + "px";
      // big pieces hug the screen edge and drift slower, small ones flutter
      const x = Math.random() * Math.max(gutter - size * 0.55, 6);
      wrap.style[i % 2 === 0 ? "left" : "right"] = x - size * 0.18 + "px";
      wrap.style.top = 8 + Math.random() * 70 + "vh";
      wrap.style.zIndex = size > 74 ? 0 : 1; // small ones float over big ones
      wrap.innerHTML =
        '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="' +
        (size > 74 ? 4 : 5.5) + '" stroke-linecap="round" stroke-linejoin="round">' + shape + "</svg>";
      el.motifLayer.appendChild(wrap);

      const big = size > 74;
      const rise = (big ? 40 : 70) + Math.random() * (big ? 60 : 110);
      const sway = (Math.random() - 0.5) * (big ? 26 : 54);
      const rot = (Math.random() - 0.5) * (big ? 14 : 32);
      const life = (big ? 3400 : 2400) + Math.random() * 1600;
      const peak = big ? 0.5 : 0.85; // large pieces stay ghostly

      if (wrap.animate) {
        wrap.animate(
          [
            { opacity: 0, transform: "translate(0, 28px) rotate(0deg) scale(0.72)" },
            { opacity: peak, offset: 0.14 },
            { opacity: peak, offset: 0.68 },
            { opacity: 0, transform: "translate(" + sway + "px, -" + rise + "px) rotate(" + rot + "deg) scale(1.08)" }
          ],
          { duration: life, easing: "ease-out", delay: i * 90 }
        ).onfinish = () => wrap.remove();
      } else {
        setTimeout(() => wrap.remove(), life);
      }
    }
  }

  function popScore() {
    el.hudScore.classList.remove("pop");
    void el.hudScore.offsetWidth;
    el.hudScore.classList.add("pop");
  }

  function burstConfetti(color) {
    if (reducedMotion || !el.confettiLayer.animate) return;
    const colors = [color, "#ede6d6", "var(--c-books)"];
    const rect = el.card.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    for (let i = 0; i < 26; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti-bit";
      bit.style.background = colors[i % colors.length];
      bit.style.left = originX + "px";
      bit.style.top = originY + "px";
      el.confettiLayer.appendChild(bit);
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 190;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 60;
      const rot = (Math.random() - 0.5) * 720;
      bit.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: "translate(" + dx + "px, " + (dy + 140) + "px) rotate(" + rot + "deg)", opacity: 0 }
        ],
        { duration: 750 + Math.random() * 450, easing: "cubic-bezier(.15,.65,.35,1)" }
      ).onfinish = () => bit.remove();
    }
  }

  /* ---------------- end screen ---------------- */

  function rankFor(pct) {
    if (pct >= 0.9) return "Head Archivist";
    if (pct >= 0.7) return "Senior Curator";
    if (pct >= 0.5) return "Reference Librarian";
    if (pct >= 0.3) return "Casual Browser";
    return "Lost in the Stacks";
  }

  function endGame() {
    clearInterval(rushTimer);
    const m = MODES[settings.mode];
    const denom = m.timed ? answeredCount : deck.length;
    const pct = denom ? correctCount / denom : 0;

    el.endEyebrow.textContent =
      settings.mode === "daily" ? "Daily " + todayKey() :
      settings.mode === "rush" ? "Time's up" :
      settings.mode === "fandom" ? activeDeckName + " \u00B7 " + (FANDOM_PACKS[settings.fandomId] || {}).prompt :
      settings.mode === "study" ? "Deck: " + activeDeckName :
      "Round complete";
    el.endRank.textContent = m.timed && answeredCount === 0 ? "Blink and you missed it" : rankFor(pct);
    el.endScore.textContent = score;
    el.endCorrect.textContent = correctCount + "/" + denom;
    el.endStreak.textContent = "\u00D7" + bestStreak;
    el.endHints.textContent = hintsUsed;

    let newBest = false;
    if (settings.mode === "classic") newBest = saveBest(activeDiff, score);
    if (settings.mode === "rush") newBest = saveBest("rush", score);
    if (settings.mode === "fandom") newBest = saveBest(fandomSlot(), score);
    if (settings.mode === "daily") {
      const daily = readStore(DAILY_KEY);
      if (daily[todayKey()] === undefined) {
        daily[todayKey()] = score;
        writeStore(DAILY_KEY, daily);
        newBest = true;
        Online.submitDaily(todayKey(), score, playerHandle()); // fire-and-forget
      }
    }
    el.endBest.hidden = !newBest;
    el.endBest.textContent = settings.mode === "daily" ? T("onBoard") : T("newBest");

    // lifetime stats for this finished game
    const st = readStats();
    st.games++;
    if (settings.mode === "rush") st.rushGames++;
    st.bestRunStreak = Math.max(st.bestRunStreak, bestStreak);
    if (settings.mode === "fandom" && !st.packsTried.includes(settings.fandomId)) {
      st.packsTried.push(settings.fandomId);
    }
    st.dailyStreak = computeDailyStreak(new Set(Object.keys(readStore(DAILY_KEY))), todayKey());
    writeStore(STATS_KEY, st);

    // achievements: check, persist, celebrate
    lastGame = { label: el.endEyebrow.textContent, score: score,
      results: roundResults.slice(), bestStreak: bestStreak };
    const ctx = { mode: settings.mode, diff: activeDiff, rounds: denom,
      correct: correctCount, score: score, bestStreak: bestStreak,
      fandomMode: settings.fandomMode, packId: settings.fandomId };
    const unlocked = readStore(ACH_KEY);
    const fresh = ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.check(st, ctx));
    if (fresh.length) {
      fresh.forEach((a) => { unlocked[a.id] = todayKey(); });
      writeStore(ACH_KEY, unlocked);
      el.endAch.hidden = false;
      el.endAch.textContent = T("unlockedPrefix") + " " + fresh.map((a) => a.name).join(" \u00B7 ");
      fresh.forEach((a, i) => setTimeout(() =>
        spawnMotifs({ cat: "books", motifs: [a.motif] }), 350 * i));
    } else {
      el.endAch.hidden = true;
    }

    Online.scheduleSync(ONLINE_IO); // background, debounced, silent
    paintBests();
    show("end");
  }

  let lastGame = null;

  function shareResult() {
    if (!lastGame) return;
    const text = buildShareText(lastGame);
    const done = () => {
      el.btnShare.textContent = T("copied");
      setTimeout(() => { el.btnShare.textContent = T("shareResult"); }, 1800);
    };
    if (navigator.share) {
      navigator.share({ text: text }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {});
    }
  }

  /* ---------------- stats screen ---------------- */

  function renderStats() {
    const st = readStats();
    const daysPlayed = Object.keys(readStore(DAILY_KEY));
    const streak = computeDailyStreak(new Set(daysPlayed), todayKey());
    const acc = st.answers ? Math.round((st.correct / st.answers) * 100) : 0;

    el.statsTotals.innerHTML = "";
    [["Games", st.games], ["Accuracy", acc + "%"], ["Daily streak", "\u00D7" + streak],
     ["Best run", "\u00D7" + st.bestRunStreak]].forEach(([label, value]) => {
      const div = document.createElement("div");
      div.className = "end-stat";
      div.innerHTML = '<span class="hud-label">' + label + '</span><span class="hud-value">' + value + "</span>";
      el.statsTotals.appendChild(div);
    });

    // calendar: current UTC month
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    el.calMonth.textContent = now.toLocaleString("en", { month: "long", timeZone: "UTC" }) + " " + y;
    el.calGrid.innerHTML = "";
    const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const played = new Set(daysPlayed);
    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-cell blank";
      el.calGrid.appendChild(blank);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const cell = document.createElement("div");
      cell.className = "cal-cell" + (played.has(key) ? " played" : "") + (key === todayKey() ? " today" : "");
      cell.textContent = d;
      el.calGrid.appendChild(cell);
    }

    // accuracy bars per category
    el.statsCats.innerHTML = "";
    Object.entries(CATEGORIES).forEach(([key, meta]) => {
      const b = st.byCat[key] || { answers: 0, correct: 0 };
      const pct = b.answers ? Math.round((b.correct / b.answers) * 100) : 0;
      const row = document.createElement("div");
      row.className = "stat-bar-row";
      row.style.setProperty("--bar-color", catColor(key));
      row.innerHTML = '<span class="bar-label">' + meta.label + "</span>" +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="bar-pct">' + (b.answers ? pct + "%" : "\u2014") + "</span>";
      el.statsCats.appendChild(row);
    });

    // achievements grid
    const unlocked = readStore(ACH_KEY);
    el.achGrid.innerHTML = "";
    ACHIEVEMENTS.forEach((a) => {
      const card = document.createElement("div");
      card.className = "ach-card" + (unlocked[a.id] ? "" : " locked");
      card.innerHTML =
        '<span class="ach-icon"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" ' +
        'stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' + (MOTIFS[a.motif] || "") + "</svg></span>" +
        '<span><span class="ach-name">' + a.name + '</span><br><span class="ach-desc">' +
        a.desc + (unlocked[a.id] ? " \u2014 unlocked " + unlocked[a.id] : "") + "</span></span>";
      el.achGrid.appendChild(card);
    });
  }

  /* ---------------- online integration ---------------- */

  const HANDLE_KEY = "quoted.handle.v1";

  /** Read/write bridge handed to Online.sync so online.js stays
      decoupled from storage keys. */
  const ONLINE_IO = {
    readBests: () => readStore(BEST_KEY),
    readStats: readStats,
    readAch: () => readStore(ACH_KEY),
    readDaily: () => readStore(DAILY_KEY),
    writeAll: (m) => {
      writeStore(BEST_KEY, m.bests);
      writeStore(STATS_KEY, m.stats);
      writeStore(ACH_KEY, m.ach);
      writeStore(DAILY_KEY, m.daily);
      paintBests();
      paintDaily();
    }
  };

  function playerHandle() {
    return (readStore(HANDLE_KEY).h || "player");
  }

  function paintAccount() {
    const on = Online.available();
    el.accountLabel.hidden = !on;
    el.accountBox.hidden = !on;
    if (!on) return;

    if (!Online.session || !Online.session.user) {
      el.accountBox.innerHTML =
        '<div class="acct-row"><input type="email" id="acct-email" placeholder="you@example.com" ' +
        'aria-label="Email for magic link"><button class="btn-guess" id="acct-send">Send link</button></div>' +
        '<p class="acct-note">Passwordless sign-in: we email you a magic link. Syncs your bests, ' +
        "streaks, and achievements across devices, and puts you on the daily leaderboard. " +
        "The game works fully without it.</p>";
      const send = $("acct-send");
      send.addEventListener("click", async () => {
        const email = $("acct-email").value.trim();
        if (!email) return;
        send.disabled = true;
        const ok = await Online.requestLink(email).catch(() => false);
        el.accountBox.querySelector(".acct-note").textContent = ok
          ? "Link sent \u2014 check your inbox, then reopen this page from it."
          : "Couldn't reach the server \u2014 try again later.";
        send.disabled = false;
      });
    } else {
      const email = Online.session.user.email || "signed in";
      el.accountBox.innerHTML =
        '<div class="acct-row">Signed in as <strong>' + escapeHtml(email) + "</strong></div>" +
        '<div class="acct-row"><input id="acct-handle" maxlength="24" aria-label="Leaderboard name" value="' +
        escapeHtml(playerHandle()) + '"><button class="btn-guess" id="acct-sync">Sync now</button>' +
        '<button class="btn-guess" id="acct-out">Sign out</button></div>' +
        '<p class="acct-note" id="acct-status">' +
        (Online.lastSync ? "Last synced " + Online.lastSync.toLocaleTimeString() : "Not synced yet this session.") + "</p>";
      $("acct-handle").addEventListener("change", () => {
        writeStore(HANDLE_KEY, { h: $("acct-handle").value.trim().slice(0, 24) || "player" });
      });
      $("acct-sync").addEventListener("click", async () => {
        $("acct-status").textContent = "Syncing\u2026";
        const ok = await Online.sync(ONLINE_IO);
        $("acct-status").textContent = ok ? "Synced just now." : "Sync failed \u2014 will retry after your next game.";
      });
      $("acct-out").addEventListener("click", () => { Online.signOut(); paintAccount(); paintDaily(); });
    }
  }

  async function paintDailyBoard() {
    if (!el.dailyBoard) return; // lived on the Daily panel (dormant)
    const on = Online.available();
    el.dailyBoard.hidden = !on;
    if (!on) return;
    el.dailyBoard.innerHTML = '<p class="board-title">Global top 100 \u00B7 ' + todayKey() + "</p>Loading\u2026";
    const rows = await Online.fetchLeaderboard(todayKey());
    if (!rows) {
      el.dailyBoard.innerHTML = '<p class="board-title">Global top 100</p>' +
        '<span class="acct-note">Leaderboard unreachable \u2014 playing offline is just fine.</span>';
      return;
    }
    const me = Online.session && Online.session.user ? Online.session.user.id : null;
    let html = '<p class="board-title">Global top 100 \u00B7 ' + todayKey() + "</p>";
    if (!rows.length) html += '<span class="acct-note">No scores yet \u2014 be the first on the board.</span>';
    rows.slice(0, 10).forEach((r, i) => {
      html += '<div class="board-row' + (me && r.user_id === me ? " me" : "") + '">' +
        '<span class="rank">' + (i + 1) + '</span><span class="handle">' + escapeHtml(r.handle) +
        '</span><span class="pts">' + r.score + "</span></div>";
    });
    const myIdx = me ? rows.findIndex((r) => r.user_id === me) : -1;
    if (myIdx >= 10) {
      html += '<div class="board-row me"><span class="rank">' + (myIdx + 1) +
        '</span><span class="handle">you</span><span class="pts">' + rows[myIdx].score + "</span></div>";
    }
    el.dailyBoard.innerHTML = html;
  }

  /* ---------------- keyboard shortcuts ---------------- */

  document.addEventListener("keydown", (e) => {
    if (!screens.game.classList.contains("active")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (answered && (e.key === "Enter" || e.key === " ")) return;
    const n = parseInt(e.key, 10);
    if (!answered && n >= 1 && n <= 6) {
      const btns = el.answerArea.querySelectorAll(".option-btn");
      if (btns[n - 1]) btns[n - 1].click();
    }
    if (!answered && e.key.toLowerCase() === "h") useHint();
  });

  /* ---------------- wiring ---------------- */

  el.btnStart.addEventListener("click", () => startGame("classic"));
  if (el.btnDaily) el.btnDaily.addEventListener("click", () => startGame("daily"));
  el.btnRush.addEventListener("click", () => startGame("rush"));
  el.btnFandomStart.addEventListener("click", () => startGame("fandom"));
  el.btnHint.addEventListener("click", useHint);
  el.btnSkip.addEventListener("click", () => { if (!answered) resolveRound(false, ""); });
  el.btnQuit.addEventListener("click", () => { clearInterval(rushTimer); clearInterval(typer); show("start"); });
  el.btnNext.addEventListener("click", nextRound);
  el.btnAgain.addEventListener("click", () => startGame(settings.mode));
  el.btnSettings.addEventListener("click", () => { paintDaily(); show("start"); });
  el.btnShare.addEventListener("click", shareResult);
  el.btnStats.addEventListener("click", () => { renderStats(); paintAccount(); show("stats"); });
  el.btnStatsBack.addEventListener("click", () => show("start"));

  /* Boot: content loads first (lazy JSON when hosted, eager bundle
     offline), then defaults and UI. Await window.StoriedReady before
     interacting programmatically. */
  window.StoriedReady = (async () => {
    await PackStore.init();
    settings.cats = Object.keys(CATEGORIES);
    settings.fandomId = (PackStore.index.packs[0] || {}).id || null;
    buildCatChips();
    buildPackBrowser();
    paintDaily();
    paintDecks();
    paintFandom();
    paintBests();
    Online.init();
    paintAccount();
    if (typeof Studio !== "undefined") Studio.init();
    if (Online.session) Online.sync(ONLINE_IO); // resume sessions sync on load
  })();

  /* PWA: only meaningful when served over http(s) — harmless otherwise */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  /* Public surface for tinkering and tests */
  window.Storied = window.Quoted = {
    version: "3.0.0",
    config: CONFIG,
    modes: MODES,
    isMatch: isMatch,
    normalize: normalize,
    get quotes() { return QUOTES; },
    get deck() { return deck; },
    attributionFor: attributionFor,
    buildShareText: buildShareText,
    computeDailyStreak: computeDailyStreak,
    dailyDeckFor: buildDailyDeck,
    stats: readStats,
    achievements: ACHIEVEMENTS,
    online: Online,
    onlineIO: ONLINE_IO,
    refreshPacks: () => { renderPackList(); paintFandom(); },
    contrastInk: contrastInk,
    contrastRatio: contrastRatio,
    get categories() { return CATEGORIES; },
    packs: PackStore,
    motifs: MOTIFS,
    motifsFor: motifsFor,
    spawnMotifs: spawnMotifs,
    fandoms: typeof FANDOM_PACKS !== "undefined" ? FANDOM_PACKS : {},
    decks: DECKS,
    buildDailyDeck: buildDailyDeck,
    startGame: startGame,
    current: () => (deck.length ? current() : undefined)
  };
})();
