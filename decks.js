/* ============================================================
   STORIED — study decks
   ------------------------------------------------------------
   Turns any pasted or uploaded text into a playable quiz deck,
   entirely on-device (nothing is uploaded anywhere).

   HOW GENERATION WORKS
   1. The text is split into sentences.
   2. Each sentence is scanned for "blank-able" candidates:
        proper  capitalized names/places (not sentence-initial)
        number  years, amounts, percentages
        term    long, rare words specific to this document
   3. The best sentences become fill-in-the-blank questions; the
      answer is removed and wrong options are drawn from OTHER
      candidates of the same kind in the same document — so the
      choices feel plausible, not random.

   Everything is exposed as DECKS.* and persisted in
   localStorage under "quoted.decks.v1".
   ============================================================ */

const DECKS = (function () {
  "use strict";

  const STORE = "quoted.decks.v1";
  const MAX_QUESTIONS = 20;
  const MIN_QUESTIONS = 4;
  const BLANK = "\u2007______\u2007";

  const STOPWORDS = new Set(("the a an and or but if then else when while of in on at to for from by with " +
    "about into over after under again further once here there all any both each few more most other some such " +
    "no nor not only own same so than too very can will just don should now is are was were be been being have " +
    "has had do does did having it its it's this that these those i you he she we they them his her their our your " +
    "as because until against between through during before above below up down out off why how what which who whom " +
    "mr mrs ms dr st chapter page").split(/\s+/));

  /* ---------- text -> sentences ---------- */

  function toPlainText(raw, filename) {
    let text = String(raw || "");
    if (/\.html?$/i.test(filename || "") || /<\/?[a-z][\s\S]*>/i.test(text.slice(0, 2000))) {
      const div = document.createElement("div");
      div.innerHTML = text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
      text = div.textContent || "";
    }
    // markdown-ish cleanup
    return text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^#+\s+/gm, "")
      .replace(/[*_`>|]/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  }

  function splitSentences(text) {
    return text
      .replace(/\r/g, "")
      .split(/\n{2,}/)                       // paragraphs first
      .flatMap((p) => p.replace(/\n/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"\u201C])/))
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length >= 40 && s.length <= 240 && /\s/.test(s));
  }

  /* ---------- candidate extraction ---------- */

  function cleanToken(t) {
    return t.replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9%]+$/g, "");
  }

  function docFrequencies(sentences) {
    const freq = Object.create(null);
    sentences.forEach((s) =>
      s.toLowerCase().split(/\s+/).forEach((t) => {
        const w = cleanToken(t);
        if (w) freq[w] = (freq[w] || 0) + 1;
      })
    );
    return freq;
  }

  function candidatesIn(sentence, freq) {
    const tokens = sentence.split(/\s+/);
    const out = [];
    tokens.forEach((tok, i) => {
      const w = cleanToken(tok);
      if (!w || STOPWORDS.has(w.toLowerCase())) return;
      if (/^\$?\d[\d,.:%-]*$/.test(w) && w.length >= 2) {
        out.push({ word: w, type: "number", index: i });
      } else if (i > 0 && /^[A-Z][A-Za-z'-]{2,}$/.test(w)) {
        out.push({ word: w, type: "proper", index: i });
      } else if (/^[a-z][a-z-]{7,}$/.test(w) && (freq[w.toLowerCase()] || 0) <= 3) {
        out.push({ word: w, type: "term", index: i });
      }
    });
    return out;
  }

  const TYPE_RANK = { proper: 3, number: 2, term: 1 };

  /* ---------- generation ---------- */

  function generateQuestions(rawText, filename) {
    const sentences = splitSentences(toPlainText(rawText, filename));
    const freq = docFrequencies(sentences);

    // gather the document-wide pools distractors are drawn from
    const pools = { proper: new Set(), number: new Set(), term: new Set() };
    const scored = sentences.map((s) => {
      const cands = candidatesIn(s, freq).sort((a, b) => TYPE_RANK[b.type] - TYPE_RANK[a.type]);
      cands.forEach((c) => pools[c.type].add(c.word));
      return { s, cands };
    }).filter((x) => x.cands.length > 0);

    // prefer variety: don't blank the same answer twice
    const usedAnswers = new Set();
    const questions = [];

    for (const { s, cands } of scored) {
      if (questions.length >= MAX_QUESTIONS) break;
      const pick = cands.find((c) => !usedAnswers.has(c.word.toLowerCase()));
      if (!pick) continue;
      usedAnswers.add(pick.word.toLowerCase());

      const tokens = s.split(/\s+/);
      tokens[pick.index] = tokens[pick.index].replace(pick.word, BLANK);
      const qText = tokens.join(" ");
      if (!qText.includes(BLANK)) continue;

      // distractors: same-type words from elsewhere in the document
      let pool = [...pools[pick.type]].filter(
        (w) => w.toLowerCase() !== pick.word.toLowerCase()
      );
      if (pool.length < 3) {
        const spare = [...pools.proper, ...pools.term, ...pools.number]
          .filter((w) => w.toLowerCase() !== pick.word.toLowerCase() && !pool.includes(w));
        pool = pool.concat(spare);
      }
      // keep a shuffled sample of up to 7 so play stays varied
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      questions.push({ q: qText, a: pick.word, type: pick.type, pool: pool.slice(0, 7) });
    }
    return questions;
  }

  /* ---------- persistence ---------- */

  function list() {
    try { return JSON.parse(localStorage.getItem(STORE)) || []; }
    catch (e) { return []; }
  }

  function persist(decks) {
    try { localStorage.setItem(STORE, JSON.stringify(decks)); return true; }
    catch (e) { return false; }
  }

  function add(name, rawText, filename) {
    const questions = generateQuestions(rawText, filename);
    if (questions.length < MIN_QUESTIONS) {
      return { error: "Couldn't find enough quizzable material — try a longer or more detailed text (need at least " + MIN_QUESTIONS + " good sentences)." };
    }
    const deck = {
      id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: (name || "Untitled deck").trim().slice(0, 40),
      created: Date.now(),
      questions
    };
    const decks = list();
    decks.unshift(deck);
    persist(decks);
    return { deck };
  }

  function remove(id) {
    persist(list().filter((d) => d.id !== id));
  }

  function get(id) {
    return list().find((d) => d.id === id) || null;
  }

  return { generateQuestions, list, add, remove, get, BLANK, MIN_QUESTIONS };
})();
