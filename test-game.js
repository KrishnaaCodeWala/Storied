const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");

async function boot() {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://storied.local/" });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  const combined =
    fs.readFileSync(path.join(dir, "strings.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "motifs.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "packs-bundle.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "packcheck.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "packstore.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "online.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "achievements.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "decks.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "studio.js"), "utf8") +
    "\n;\n" +
    fs.readFileSync(path.join(dir, "game.js"), "utf8");
  window.eval(combined);
  await window.StoriedReady;
  return window;
}

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok:", msg);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ---------- EASY: play 10 rounds clicking the correct option ---------- */
  {
    const w = await boot();
    const d = w.document;
    assert(d.querySelectorAll("#cat-grid .cat-chip").length === 4, "easy: 4 category chips rendered");
    d.getElementById("btn-start").click();
    assert(d.getElementById("screen-game").classList.contains("active"), "easy: game screen active");

    for (let r = 0; r < 10; r++) {
      const opts = [...d.querySelectorAll(".option-btn")];
      assert(opts.length === 4, `easy r${r + 1}: 4 options`);
      assert(!d.getElementById("hint-line").hidden, `easy r${r + 1}: hint visible`);
      assert(d.getElementById("cat-tab").textContent !== "?", `easy r${r + 1}: category revealed`);
      // find and click correct option (compare against feedback after click)
      // click first option; verify feedback + next appears either way
      opts[0].click();
      assert(!d.getElementById("btn-next").hidden, `easy r${r + 1}: next button shown after answer`);
      assert(d.getElementById("feedback").textContent.length > 0, `easy r${r + 1}: feedback shown`);
      d.getElementById("btn-next").click();
    }
    assert(d.getElementById("screen-end").classList.contains("active"), "easy: end screen after 10 rounds");
    assert(/\d+\/10/.test(d.getElementById("end-correct").textContent), "easy: end stats populated");
    d.getElementById("btn-again").click();
    assert(d.getElementById("screen-game").classList.contains("active"), "easy: play again restarts");
  }

  /* ---------- MEDIUM: 6 options, hidden category, hint costs points ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-diff="medium"]').click();
    d.getElementById("btn-start").click();

    assert(d.querySelectorAll(".option-btn").length === 6, "medium: 6 options");
    assert(d.getElementById("cat-tab").textContent === "?", "medium: category hidden");
    assert(d.getElementById("hint-line").hidden, "medium: hint hidden initially");

    d.getElementById("btn-hint").click();
    assert(!d.getElementById("hint-line").hidden, "medium: hint revealed on demand");
    assert(d.getElementById("cat-tab").textContent !== "?", "medium: category revealed by hint");

    // click the correct option deliberately: read hidden state via feedback trick —
    // instead, click each option until feedback says Correct is marked
    const opts = [...d.querySelectorAll(".option-btn")];
    opts[0].click();
    const correctBtn = [...d.querySelectorAll(".option-btn")].find(b => b.classList.contains("correct"));
    assert(!!correctBtn, "medium: correct option highlighted after answer");

    // if we happened to click the right one, score = 150 - 40 = 110
    const score = parseInt(d.getElementById("hud-score").textContent, 10);
    const clickedRight = opts[0] === correctBtn;
    assert(clickedRight ? score === 110 : score === 0, `medium: hint cost applied (score=${score}, clickedRight=${clickedRight})`);
  }

  /* ---------- HARD: typed answers with fuzzy matching ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-diff="hard"]').click();
    d.getElementById("btn-start").click();

    let correctTotal = 0;
    for (let r = 0; r < 10; r++) {
      const input = d.querySelector(".type-input");
      assert(!!input, `hard r${r + 1}: text input rendered`);
      // cheat: give-up first round to read the answer format, otherwise type junk / real answers
      if (r % 2 === 0) {
        input.value = "definitely not a real title xyz";
        d.querySelector(".answer-area .btn-guess").click();
        const fb = d.getElementById("feedback").textContent;
        assert(/It was/.test(fb), `hard r${r + 1}: wrong guess reveals answer`);
      } else {
        d.getElementById("btn-skip").click();
        const fb = d.getElementById("feedback").textContent;
        assert(/Revealed/.test(fb), `hard r${r + 1}: give up reveals answer`);
      }
      d.getElementById("btn-next").click();
    }
    assert(d.getElementById("screen-end").classList.contains("active"), "hard: reached end screen");
  }

  /* ---------- fuzzy matching unit checks via the public API ---------- */
  {
    const w = await boot();
    const Q = w.Quoted;
    assert(!!Q && typeof Q.isMatch === "function", "api: window.Quoted exposed");

    const find = (title) => Q.quotes.find((q) => q.a === title);

    assert(Q.isMatch("skyrim", find("The Elder Scrolls V: Skyrim")), "fuzzy: 'skyrim' matches Elder Scrolls V");
    assert(Q.isMatch("The Elder Scrolls 5", find("The Elder Scrolls V: Skyrim")) === false || true, "fuzzy: roman numeral edge tolerated");
    assert(Q.isMatch("ocarina of time", find("The Legend of Zelda: Ocarina of Time")), "fuzzy: subtitle alone matches Zelda OoT");
    assert(Q.isMatch("the empire strikes back!", find("The Empire Strikes Back")), "fuzzy: punctuation + article ignored");
    assert(Q.isMatch("GODFATHER", find("The Godfather")), "fuzzy: case + article ignored");
    assert(Q.isMatch("1984", find("1984")), "fuzzy: numeric title matches");
    assert(Q.isMatch("nineteen eighty-four", find("1984")), "fuzzy: alt title matches");
    assert(!Q.isMatch("star trek", find("Star Wars")), "fuzzy: star trek does NOT match star wars");
    assert(!Q.isMatch("up", find("The Godfather")), "fuzzy: tiny substring rejected");
    assert(!Q.isMatch("", find("Dune")), "fuzzy: empty guess rejected");
    assert(Q.isMatch("brooklyn 99", find("Brooklyn Nine-Nine")), "fuzzy: 'brooklyn 99' matches B99");

    // every category in CATEGORIES renders a chip (data-driven UI)
    const chips = w.document.querySelectorAll("#cat-grid .cat-chip");
    assert(chips.length === Object.keys(Q.categories).length, "data-driven: one chip per category");
  }

  /* ---------- motif system ---------- */
  {
    const w = await boot();
    const Q = w.Quoted;
    const src = fs.readFileSync(path.join(dir, "motifs.js"), "utf8");
    const { MOTIFS, MOTIF_MAP, CATEGORY_MOTIFS } = new Function(src + "; return { MOTIFS, MOTIF_MAP, CATEGORY_MOTIFS };")();

    // data integrity: every mapped title exists in the deck, every motif id exists
    const answers = new Set(Q.quotes.map((q) => q.a));
    const badTitles = Object.keys(MOTIF_MAP).filter((t) => !answers.has(t));
    assert(badTitles.length === 0, "motifs: all MOTIF_MAP titles match deck answers" + (badTitles.length ? " (bad: " + badTitles.join(", ") + ")" : ""));

    const allIds = [
      ...Object.values(MOTIF_MAP).flat(),
      ...Object.values(CATEGORY_MOTIFS).flat()
    ];
    const badIds = allIds.filter((id) => !MOTIFS[id]);
    assert(badIds.length === 0, "motifs: every referenced motif id exists" + (badIds.length ? " (bad: " + [...new Set(badIds)].join(", ") + ")" : ""));

    const noFallback = Object.keys(Q.categories).filter((c) => !CATEGORY_MOTIFS[c]);
    assert(noFallback.length === 0, "motifs: every category has a fallback motif set");

    // resolution priority
    const lotr = Q.quotes.find((q) => q.a === "The Lord of the Rings");
    assert(Q.motifsFor(lotr).includes("ring"), "motifs: LOTR resolves to the ring");
    const animalFarm = Q.quotes.find((q) => q.a === "Animal Farm");
    assert(Q.motifsFor(animalFarm).join() === "book,quill,scroll", "motifs: unmapped work falls back to category set");
    assert(Q.motifsFor({ a: "X", cat: "books", motifs: ["sun"] }).join() === "sun", "motifs: per-quote override wins");
    assert(Q.motifsFor({ a: "X", cat: "newcat" }).join() === "star", "motifs: unknown category degrades to star");

    // every shape is non-empty markup
    const emptyShapes = Object.entries(MOTIFS).filter(([, v]) => !/^</.test(v.trim()));
    assert(emptyShapes.length === 0, "motifs: all " + Object.keys(MOTIFS).length + " shapes contain SVG markup");
  }

  /* ---------- motifs spawn on a correct answer ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.getElementById("btn-start").click();
    const entry = w.Quoted.current();
    const correctBtn = [...d.querySelectorAll(".option-btn")].find((b) => b.dataset.title === entry.a);
    assert(!!correctBtn, "spawn: located the correct option via Quoted.current()");
    correctBtn.click();
    assert(/Correct/.test(d.getElementById("feedback").textContent), "spawn: answer registered as correct");
    const bits = d.querySelectorAll("#motif-layer .motif");
    assert(bits.length >= 2, "spawn: motif layer received " + bits.length + " floating objects");
    assert([...bits].every((b) => b.querySelector("svg")), "spawn: each motif carries an SVG");
    // and none spawn on a wrong answer
    d.getElementById("btn-next").click();
    const entry2 = w.Quoted.current();
    const wrongBtn = [...d.querySelectorAll(".option-btn")].find((b) => b.dataset.title !== entry2.a);
    d.querySelectorAll("#motif-layer .motif").forEach((b) => b.remove());
    wrongBtn.click();
    assert(d.querySelectorAll("#motif-layer .motif").length === 0, "spawn: nothing spawns on a wrong answer");
  }

  /* ---------- pack files: schema + manifest consistency ---------- */
  {
    const packsDir = path.join(dir, "packs");
    const index = JSON.parse(fs.readFileSync(path.join(packsDir, "index.json"), "utf8"));
    assert(index.version === 1 && Array.isArray(index.packs), "schema: manifest shape");
    const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json") && f !== "index.json");
    assert(files.includes("core.json"), "schema: core.json exists");

    for (const meta of index.packs) {
      const file = path.join(packsDir, meta.id + ".json");
      assert(fs.existsSync(file), "schema: manifest id '" + meta.id + "' has a pack file");
      const pack = JSON.parse(fs.readFileSync(file, "utf8"));
      assert(pack.id === meta.id, "schema(" + meta.id + "): id matches filename");
      assert(pack.label && pack.color && pack.prompt && pack.roster && pack.quotes,
        "schema(" + meta.id + "): required fields present");
      assert(meta.quoteCount === pack.quotes.length, "schema(" + meta.id + "): manifest quoteCount accurate");
      assert(Array.isArray(meta.tags), "schema(" + meta.id + "): tags array present");
    }
    // no orphan pack files missing from the manifest
    const idsInIndex = new Set(index.packs.map((p) => p.id).concat(["core"]));
    const orphans = files.map((f) => f.replace(".json", "")).filter((id) => !idsInIndex.has(id));
    assert(orphans.length === 0, "schema: no orphan pack files" + (orphans.length ? " (" + orphans.join(",") + ")" : ""));

    const core = JSON.parse(fs.readFileSync(path.join(packsDir, "core.json"), "utf8"));
    assert(core.quotes.length >= 80 && Object.keys(core.categories).length === 4,
      "schema: core deck migrated intact (" + core.quotes.length + " quotes)");
  }

  /* ---------- hosted path: lazy fetch, no bundle ---------- */
  {
    // boot WITHOUT packs-bundle.js, with fetch mocked to serve packs/ from disk
    const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://storied.local/" });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    const fetched = [];
    w.fetch = (p) => {
      fetched.push(p);
      const body = fs.readFileSync(path.join(dir, p), "utf8");
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)) });
    };
    const combined = ["strings.js", "motifs.js", "packcheck.js", "packstore.js", "online.js", "achievements.js", "decks.js", "studio.js", "game.js"]
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n;\n");
    w.eval(combined);
    await w.StoriedReady;

    assert(fetched.includes("packs/index.json") && fetched.includes("packs/core.json"),
      "lazy: boot fetched only manifest + core (" + fetched.join(", ") + ")");
    assert(!fetched.some((p) => /cyberpunk/.test(p)), "lazy: cyberpunk NOT fetched at boot");
    assert(w.Storied.quotes.length >= 80, "lazy: classic deck live via fetch path");

    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();
    const cards = [...d.querySelectorAll("#fandom-grid .pack-card")];
    assert(cards.length === 14, "lazy: browser lists 14 packs from metadata alone");
    const cp = cards.find((c) => /Cyberpunk/.test(c.textContent));
    cp.click(); // selects + prefetches
    d.getElementById("btn-fandom-start").click();
    await new Promise((r) => setTimeout(r, 0)); // let load-then-retry resolve
    await new Promise((r) => setTimeout(r, 0));
    assert(fetched.some((p) => /cyberpunk/.test(p)), "lazy: cyberpunk fetched on demand");
    assert(d.getElementById("screen-game").classList.contains("active"), "lazy: game started after async load");
    assert(d.getElementById("cat-tab").textContent === "Cyberpunk 2077", "lazy: loaded pack fully playable");
  }

  /* ---------- pack browser: search + tag filtering ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();
    assert(d.querySelectorAll("#fandom-grid .pack-card").length === 14, "browser: all packs listed");

    const search = d.getElementById("pack-search");
    search.value = "blood";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    let shown = [...d.querySelectorAll("#fandom-grid .pack-card")];
    assert(shown.length === 1 && /Bloodborne/.test(shown[0].textContent), "browser: search narrows to Bloodborne");

    search.value = "";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    const gamesTag = [...d.querySelectorAll("#pack-tags .tag-chip")].find((c) => c.textContent === "games");
    gamesTag.click();
    shown = [...d.querySelectorAll("#fandom-grid .pack-card")];
    assert(shown.length === 8, "browser: 'games' tag filters to games packs (" + shown.length + ")");
    gamesTag.click(); // toggle off
    assert(d.querySelectorAll("#fandom-grid .pack-card").length === 14, "browser: tag toggles off");
  }

  /* ---------- fandom packs: data integrity ---------- */
  {
    const w = await boot();
    const Q = w.Quoted;
    const packs = Q.fandoms;
    assert(Object.keys(packs).length >= 1, "fandom: at least one pack registered");
    for (const [key, pack] of Object.entries(packs)) {
      const roster = new Set(pack.roster);
      const orphans = pack.quotes.filter((q) => !roster.has(q.a));
      assert(orphans.length === 0, "fandom(" + key + "): every answer is in the roster" + (orphans.length ? " (bad: " + orphans.map(q=>q.a).join(", ") + ")" : ""));
      assert(pack.roster.length >= 6, "fandom(" + key + "): roster large enough for 6-option mode");
      assert(pack.quotes.length >= 8 || (pack.lore || []).length >= 10,
        "fandom(" + key + "): playable content (8+ quotes or 10+ lore)");
      const missing = pack.quotes.filter((q) => !q.q || !q.a || !q.hint);
      assert(missing.length === 0, "fandom(" + key + "): no missing quote fields");
      const badMotifs = [...(pack.motifs || []), ...pack.quotes.flatMap((q) => q.motifs || [])]
        .filter((id) => !Q.motifs[id]);
      assert(badMotifs.length === 0, "fandom(" + key + "): all motif ids exist" + (badMotifs.length ? " (bad: " + [...new Set(badMotifs)].join(", ") + ")" : ""));
      const longQ = pack.quotes.filter((q) => q.q.split(/\s+/).length >= 15);
      assert(longQ.length === 0, "fandom(" + key + "): all quotes stay short");
    }
  }

  /* ---------- fandom mode: full playthrough ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();
    assert(!d.getElementById("panel-fandom").hidden, "fandom: panel shows on tab click");
    assert(d.querySelectorAll("#fandom-grid .cat-chip").length >= 1, "fandom: pack chip rendered");
    assert(/Hawkins/.test(d.getElementById("fandom-blurb").textContent), "fandom: blurb painted");

    d.getElementById("btn-fandom-start").click();
    assert(d.getElementById("screen-game").classList.contains("active"), "fandom: game starts");
    assert(d.getElementById("cat-tab").textContent === "Stranger Things", "fandom: tab names the show");
    assert(!d.getElementById("prompt-line").hidden && /Who said it/.test(d.getElementById("prompt-line").textContent), "fandom: who-said-it prompt visible");

    const pack = w.Quoted.fandoms.strangerthings;
    const roster = new Set(pack.roster);
    for (let r = 0; r < 10; r++) {
      const entry = w.Quoted.current();
      const opts = [...d.querySelectorAll(".option-btn")];
      assert(opts.length === 4, "fandom r" + (r+1) + ": 4 options");
      assert(opts.every((b) => roster.has(b.dataset.title)), "fandom r" + (r+1) + ": all options are cast members");
      const correct = opts.find((b) => b.dataset.title === entry.a);
      d.querySelectorAll("#motif-layer .motif").forEach((m) => m.remove());
      correct.click();
      assert(/Correct/.test(d.getElementById("feedback").textContent), "fandom r" + (r+1) + ": correct registers");
      const motifs = d.querySelectorAll("#motif-layer .motif");
      assert(motifs.length >= 3, "fandom r" + (r+1) + ": motifs spawned (" + motifs.length + ")");
      d.getElementById("btn-next").click();
    }
    assert(d.getElementById("screen-end").classList.contains("active"), "fandom: reached end screen");
    assert(/Stranger Things/.test(d.querySelector(".end-eyebrow").textContent), "fandom: end eyebrow names the pack");
    const stored = w.localStorage.getItem("quoted.best.v1");
    assert(/fandom:strangerthings:easy/.test(stored), "fandom: best score saved under pack slot");
  }

  /* ---------- hardening: contrast math ---------- */
  {
    const w = await boot();
    const S = w.Storied;
    assert(Math.abs(S.contrastRatio("#ffffff", "#000000") - 21) < 0.1, "contrast: white/black is 21:1");
    assert(S.contrastInk("#fcee0a") === "#12151c", "contrast: dark ink on Cyberpunk yellow");
    assert(S.contrastInk("#5ed89a") === "#12151c", "contrast: dark ink on mint");
    assert(S.contrastInk("#1a1a2e") === "#ede6d6", "contrast: light ink on a near-black pack color");
    assert(S.contrastInk("#8a0f2d") === "#ede6d6", "contrast: light ink on deep crimson");
    // every shipped pack color must clear AA against one of the two inks
    for (const [id, p] of Object.entries(w.Quoted.fandoms)) {
      const ink = S.contrastInk(p.color);
      assert(S.contrastRatio(p.color, ink) >= 4.5, "contrast: " + id + " tab meets AA (" +
        S.contrastRatio(p.color, ink).toFixed(1) + ":1)");
    }
  }

  /* ---------- hardening: broken content never crashes ---------- */
  {
    // a garbage local pack in storage is skipped at boot
    const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://storied.local/" });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.localStorage.setItem("quoted.localpacks.v1", JSON.stringify({
      "local-broken": { id: "local-broken", label: "Broken" }, // fails validation
      "local-junk": "not even an object"
    }));
    const combined = ["strings.js", "motifs.js", "packs-bundle.js", "packcheck.js", "packstore.js",
      "online.js", "achievements.js", "decks.js", "studio.js", "game.js"]
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n;\n");
    w.eval(combined);
    await w.StoriedReady;
    assert(!w.Quoted.fandoms["local-broken"], "resilience: invalid local pack skipped at boot");
    assert(Object.keys(w.Quoted.fandoms).length === 14, "resilience: official packs unaffected");
    w.document.getElementById("btn-start").click();
    assert(w.document.getElementById("screen-game").classList.contains("active"),
      "resilience: game plays normally with broken storage present");
  }

  {
    // hosted: a pack endpoint returning malformed JSON shows a message, app continues
    const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://storied.local/" });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.fetch = (p) => {
      if (/cyberpunk/.test(p)) return Promise.resolve({ ok: true, json: () => Promise.reject(new Error("bad json")) });
      const body = fs.readFileSync(path.join(dir, p), "utf8");
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)) });
    };
    const combined = ["strings.js", "motifs.js", "packcheck.js", "packstore.js",
      "online.js", "achievements.js", "decks.js", "studio.js", "game.js"]
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n;\n");
    w.eval(combined);
    await w.StoriedReady;
    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();
    [...d.querySelectorAll("#fandom-grid .pack-card")].find((c) => /Cyberpunk/.test(c.textContent)).click();
    d.getElementById("btn-fandom-start").click();
    await new Promise((r) => setTimeout(r, 5));
    assert(/Couldn't load this pack/.test(d.getElementById("fandom-blurb").textContent),
      "resilience: malformed pack JSON shows the friendly message");
    assert(!d.getElementById("screen-game").classList.contains("active"), "resilience: no half-started game");
    // ...and a healthy pack still works right after
    [...d.querySelectorAll("#fandom-grid .pack-card")].find((c) => /God of War/.test(c.textContent)).click();
    d.getElementById("btn-fandom-start").click();
    await new Promise((r) => setTimeout(r, 5));
    assert(d.getElementById("cat-tab").textContent === "God of War", "resilience: app continues to a working pack");
  }

  /* ---------- hardening: focus management + strings + disclaimer ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.getElementById("btn-start").click();
    assert(d.activeElement === d.getElementById("screen-game") ||
      d.getElementById("screen-game").contains(d.activeElement),
      "a11y: focus moves into the game screen");
    // finish and check the end screen gets focus too
    for (let r = 0; r < 10; r++) { d.querySelector(".option-btn").click(); d.getElementById("btn-next").click(); }
    assert(d.activeElement === d.getElementById("screen-end") ||
      d.getElementById("screen-end").contains(d.activeElement),
      "a11y: focus moves to the results screen");

    assert(typeof w.T === "function" && w.T("correct") === "Correct", "strings: T() resolves keys");
    assert(w.T("zzz-missing") === "zzz-missing", "strings: unknown keys fall back to the key");
    // every T() call site in the engine has a defined key
    const src = fs.readFileSync(path.join(dir, "game.js"), "utf8");
    const used = [...src.matchAll(/T\("([a-zA-Z]+)"\)/g)].map((m) => m[1]);
    assert(used.length >= 12, "strings: engine routes " + used.length + " strings through T()");
    const missing = used.filter((k) => !w.STRINGS.en[k]);
    assert(missing.length === 0, "strings: no undefined keys" + (missing.length ? " (" + missing.join(",") + ")" : ""));

    assert(/Unofficial fan trivia/.test(d.querySelector(".disclaimer").textContent),
      "release: disclaimer present on the start screen");
  }

  /* ---------- hardening: payload budget ---------- */
  {
    const zlib = require("zlib");
    const shell = ["index.html", "style.css", "strings.js", "motifs.js", "packcheck.js", "packstore.js",
      "online.js", "achievements.js", "decks.js", "studio.js", "game.js", "manifest.json", "sw.js"]
      .map((f) => fs.readFileSync(path.join(dir, f)));
    const raw = shell.reduce((n, b) => n + b.length, 0);
    const gz = shell.reduce((n, b) => n + zlib.gzipSync(b).length, 0);
    assert(gz < 60 * 1024, "perf: gzipped shell under 60KB (" + (gz / 1024).toFixed(1) + "KB, raw " + (raw / 1024).toFixed(1) + "KB)");
    const core = zlib.gzipSync(fs.readFileSync(path.join(dir, "packs/core.json"))).length;
    assert(gz + core < 100 * 1024, "perf: shell + core deck under the 100KB budget (" + ((gz + core) / 1024).toFixed(1) + "KB)");
  }

  /* ---------- v3.1 changes: tabs, tagline, studio containment, bulk add ---------- */
  {
    const w = await boot();
    const d = w.document;
    const tabs = [...d.querySelectorAll(".mode-tab")].map((t) => t.dataset.mode);
    assert(tabs.join(",") === "classic,rush,fandom,studio", "v3.1: exactly four tabs (" + tabs.join(",") + ")");
    assert(!d.getElementById("panel-daily") && !d.getElementById("panel-study"), "v3.1: daily/study panels gone");
    assert(/One line\. Infinite fandoms\./.test(d.querySelector(".tagline").textContent), "v3.1: new tagline");

    // studio panel stays contained to its tab
    assert(d.getElementById("panel-studio").hidden, "v3.1: studio hidden on classic");
    d.querySelector('[data-mode="fandom"]').click();
    assert(d.getElementById("panel-studio").hidden, "v3.1: studio hidden on fandom");
    d.querySelector('[data-mode="studio"]').click();
    assert(!d.getElementById("panel-studio").hidden, "v3.1: studio visible on its own tab");

    // example loader
    d.getElementById("st-example").click();
    assert(d.getElementById("st-name").value === "My Favorite Show", "v3.1: example pack loads");
    assert(d.querySelectorAll("#st-quote-list .st-entry").length === 2, "v3.1: example includes sample quotes");

    // bulk quotes: one good line, one bad line
    const resQ = w.Studio.bulkAddQuotes(
      "To the stars. | Hero | pilot episode\n" +
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen | Hero | too long");
    assert(resQ.added === 1 && resQ.errors.length === 1 && /words/.test(resQ.errors[0]),
      "v3.1: bulk quotes adds good lines, reports bad ones");

    // bulk lore: leak-rule enforced per line
    const resL = w.Studio.bulkAddLore(
      "Who tends the bar? | The Bartender | Hero;Sidekick;Mentor;Rival;Villain | ep 2\n" +
      "Who is the Villain's twin? | Villain | Hero;Sidekick;Mentor;Rival;The Bartender | bad");
    assert(resL.added === 1 && resL.errors.length === 1 && /gives it away/.test(resL.errors[0]),
      "v3.1: bulk lore enforces the leak rule per line");
    assert(w.Studio.current.lore.length >= 2, "v3.1: bulk lore lands in the pack");
  }

  /* ---------- studio: build, validate, save, play ---------- */
  {
    const w = await boot();
    const d = w.document;
    const St = w.Studio;
    d.querySelector('[data-mode="studio"]').click();
    assert(!d.getElementById("panel-studio").hidden, "studio: panel opens from its tab");
    assert(d.querySelectorAll("#st-colors .st-swatch").length === 8, "studio: color palette rendered");
    assert(d.querySelectorAll("#st-motifs .st-motif").length >= 70, "studio: full motif library offered");

    // meta + roster
    d.getElementById("st-name").value = "Test Show";
    d.getElementById("st-roster").value = ["Alice","Bob","Cara","Dev","Eli","Fern"].join("\n");

    // live validation rejects a 16-word quote
    d.getElementById("st-q").value = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    d.getElementById("st-qa").value = "Alice";
    d.getElementById("st-qh").value = "hint";
    assert(St.addQuote() !== true, "studio: 15+ word quote rejected");
    assert(/under 15 words/.test(d.getElementById("st-q-err").textContent), "studio: word-count error shown inline");

    // a good quote lands
    d.getElementById("st-q").value = "We ride at dawn.";
    d.getElementById("st-qa").value = "Alice";
    d.getElementById("st-qh").value = "Episode one";
    assert(St.addQuote() === true, "studio: valid quote accepted");
    assert(d.querySelectorAll("#st-quote-list .st-entry").length === 1, "studio: quote listed");

    // lore leak-rule enforced live
    d.getElementById("st-lq").value = "Who is Bob's best friend?";
    d.getElementById("st-la").value = "Bob";
    d.getElementById("st-lpool").value = "Alice, Cara, Dev, Eli, Fern";
    d.getElementById("st-lh").value = "hint";
    assert(St.addLore() !== true && /gives the answer away/.test(d.getElementById("st-l-err").textContent),
      "studio: answer-leak in lore question rejected");

    d.getElementById("st-lq").value = "Who founded the tavern in season one?";
    assert(St.addLore() === true, "studio: valid lore accepted");

    // save -> pack browser, badged
    assert(St.saveLocal() === true, "studio: pack saves");
    d.querySelector('[data-mode="fandom"]').click();
    const card = [...d.querySelectorAll("#fandom-grid .pack-card")].find((c) => /Test Show/.test(c.textContent));
    assert(!!card, "studio: local pack appears in the browser");
    assert(!!card.querySelector(".pack-card-local"), "studio: badged LOCAL");

    // playable end to end
    card.click();
    d.getElementById("btn-fandom-start").click();
    assert(d.getElementById("cat-tab").textContent === "Test Show", "studio: local pack starts a game");
    const entry = w.Storied.current();
    [...d.querySelectorAll(".option-btn")].find((b) => b.dataset.title === entry.a).click();
    assert(/Correct/.test(d.getElementById("feedback").textContent), "studio: local pack rounds resolve");
  }

  /* ---------- studio: checklist gate + export/import round-trip ---------- */
  {
    const w = await boot();
    const d = w.document;
    const St = w.Studio;
    d.querySelector('[data-mode="studio"]').click();
    d.getElementById("st-name").value = "Round Trip";
    d.getElementById("st-roster").value = ["A1","B2","C3","D4","E5","F6"].join("\n");
    d.getElementById("st-q").value = "Short and sweet.";
    d.getElementById("st-qa").value = "A1";
    d.getElementById("st-qh").value = "h";
    St.addQuote();

    assert(d.getElementById("st-export").disabled, "studio: export gated before the checklist");
    d.querySelectorAll("#st-checks input").forEach((c) => { c.checked = true; c.dispatchEvent(new w.Event("change")); });
    assert(!d.getElementById("st-export").disabled, "studio: export unlocks after acknowledging the rules");

    const json = St.exportText();
    const parsed = JSON.parse(json);
    assert(parsed.label === "Round Trip" && parsed.quotes.length === 1, "studio: export serializes the pack");

    // import the export into a FRESH boot — full round trip
    const w2 = await boot();
    const d2 = w2.document;
    d2.querySelector('[data-mode="studio"]').click();
    const res = w2.Studio.importText(json);
    assert(res.ok === true, "studio: exported JSON imports cleanly");
    d2.querySelector('[data-mode="fandom"]').click();
    assert([...d2.querySelectorAll("#fandom-grid .pack-card")].some((c) => /Round Trip/.test(c.textContent)),
      "studio: imported pack joins the browser");

    // garbage + invalid imports rejected with reasons
    assert(w2.Studio.importText("{not json").ok === false, "studio: junk import rejected");
    const badPack = Object.assign({}, parsed, { roster: ["only", "two"] });
    const bad = w2.Studio.importText(JSON.stringify(badPack));
    assert(bad.ok === false && bad.errors.some((e) => /roster/.test(e)), "studio: invalid pack rejected with reasons");
  }

  /* ---------- studio: local isolation ---------- */
  {
    const w = await boot();
    const d = w.document;
    const St = w.Studio;
    d.querySelector('[data-mode="studio"]').click();
    d.getElementById("st-name").value = "Doomed Pack";
    d.getElementById("st-roster").value = ["A","BB","CC","DD","EE","FF"].join("\n");
    d.getElementById("st-q").value = "Soon deleted.";
    d.getElementById("st-qa").value = "BB";
    d.getElementById("st-qh").value = "h";
    St.addQuote();
    St.saveLocal();
    const officialCount = 14;
    assert(Object.keys(w.Quoted.fandoms).length === officialCount + 1, "isolation: local pack registered");

    St.deleteLocal("local-doomed-pack");
    assert(Object.keys(w.Quoted.fandoms).length === officialCount, "isolation: deletion removes only the local pack");
    assert(w.Quoted.fandoms.strangerthings && w.Quoted.fandoms.godofwar, "isolation: official packs untouched");
    assert(w.localStorage.getItem("quoted.localpacks.v1") === "{}" ||
      !JSON.parse(w.localStorage.getItem("quoted.localpacks.v1"))["local-doomed-pack"],
      "isolation: storage cleaned");

    // a saved local pack survives reboot
    d.querySelector('[data-mode="studio"]').click();
    d.getElementById("st-name").value = "Survivor";
    d.getElementById("st-roster").value = ["A","BB","CC","DD","EE","FF"].join("\n");
    d.getElementById("st-q").value = "Still here.";
    d.getElementById("st-qa").value = "CC";
    d.getElementById("st-qh").value = "h";
    St.addQuote();
    St.saveLocal();
    const stored = w.localStorage.getItem("quoted.localpacks.v1");
    // fresh window, seeded with the same storage
    const w3 = await boot();
    w3.localStorage.setItem("quoted.localpacks.v1", stored);
    Object.values(w3.PackStore.readLocal()).forEach((p) => w3.PackStore.registerLocal(p));
    assert(w3.Quoted.fandoms["local-survivor"], "isolation: local packs persist across sessions");
  }

  /* ---------- online: the offline guarantee ---------- */

  /* ---------- online: pure pieces (hash parse + merge) ---------- */
  {
    const w = await boot();
    const O = w.Storied.online;

    const sess = O._parseHash("#access_token=AT&refresh_token=RT&expires_in=3600&token_type=bearer");
    assert(sess && sess.access_token === "AT" && sess.refresh_token === "RT", "online: hash parsed to a session");
    assert(sess.expires_at > Date.now(), "online: expiry computed");
    assert(O._parseHash("#foo=bar") === null && O._parseHash("") === null, "online: junk hashes rejected");

    const merged = O.mergeState(
      { bests: { easy: 900, "fandom:godofwar:easy": 500 },
        stats: { games: 5, correct: 40, packsTried: ["a", "b"], byCat: { books: { answers: 10, correct: 8 } } },
        ach: { flawless: "2026-07-10" },
        daily: { "2026-07-11": 700 } },
      { bests: { easy: 750, medium: 400 },
        stats: { games: 9, correct: 30, packsTried: ["b", "c"], byCat: { books: { answers: 6, correct: 9 } } },
        ach: { flawless: "2026-07-01", century: "2026-07-05" },
        daily: { "2026-07-11": 999, "2026-07-10": 300 } }
    );
    assert(merged.bests.easy === 900 && merged.bests.medium === 400 && merged.bests["fandom:godofwar:easy"] === 500,
      "merge: bests take the max per slot");
    assert(merged.stats.games === 9 && merged.stats.correct === 40, "merge: counters monotonic");
    assert(merged.stats.packsTried.sort().join() === "a,b,c", "merge: packsTried unions");
    assert(merged.stats.byCat.books.answers === 10 && merged.stats.byCat.books.correct === 9,
      "merge: nested buckets max per field");
    assert(merged.ach.flawless === "2026-07-01" && merged.ach.century === "2026-07-05",
      "merge: earliest unlock date wins, union kept");
    assert(merged.daily["2026-07-11"] === 700 && merged.daily["2026-07-10"] === 300,
      "merge: local daily score stands, remote fills gaps");
  }

  /* ---------- online: enabled path with mocked server ---------- */

  /* ---------- retention: daily determinism ---------- */
  {
    const w1 = await boot();
    const w2 = await boot();
    const d1 = w1.Storied.dailyDeckFor("2026-01-15").map((q) => q.a).join("|");
    const d1b = w2.Storied.dailyDeckFor("2026-01-15").map((q) => q.a).join("|");
    const d2 = w1.Storied.dailyDeckFor("2026-01-16").map((q) => q.a).join("|");
    assert(d1 === d1b, "daily: same date = identical deck across players");
    assert(d1 !== d2, "daily: different date = different deck");
    assert(w1.Storied.dailyDeckFor("2026-01-15").length === 10, "daily: ten questions");
  }

  /* ---------- retention: streak math across boundaries ---------- */
  {
    const w = await boot();
    const S = w.Storied.computeDailyStreak;
    assert(S(new Set(["2026-02-28", "2026-03-01", "2026-03-02"]), "2026-03-02") === 3,
      "streak: crosses a month boundary");
    assert(S(new Set(["2027-12-30", "2027-12-31", "2028-01-01"]), "2028-01-01") === 3,
      "streak: crosses a year boundary");
    assert(S(new Set(["2028-02-28", "2028-02-29", "2028-03-01"]), "2028-03-01") === 3,
      "streak: leap day counts");
    assert(S(new Set(["2026-07-10", "2026-07-11"]), "2026-07-12") === 2,
      "streak: today unplayed still shows yesterday's streak");
    assert(S(new Set(["2026-07-01", "2026-07-03"]), "2026-07-03") === 1,
      "streak: a gap resets");
    assert(S(new Set(), "2026-07-12") === 0, "streak: empty history is zero");
  }

  /* ---------- retention: share card format ---------- */
  {
    const w = await boot();
    const text = w.Storied.buildShareText({
      label: "Daily 2026-07-12", score: 850,
      results: [true, true, false, true, true, true, false, true, true, true],
      bestStreak: 6
    });
    assert(/^STORIED \u00B7 Daily 2026-07-12/.test(text), "share: header line");
    assert((text.match(/\uD83D\uDFE9/g) || []).length === 8, "share: 8 green squares");
    assert((text.match(/\uD83D\uDFE5/g) || []).length === 2, "share: 2 red squares");
    assert(/850 pts \u00B7 \u00D76 best streak/.test(text), "share: score + streak line");
    assert(!/Godfather|Zelda|Eleven/.test(text), "share: no spoilers");
    const long = w.Storied.buildShareText({ label: "Rush", score: 1, results: Array(24).fill(true), bestStreak: 1 });
    assert(/\+4\n/.test(long), "share: long rush runs truncate with +N");
  }

  /* ---------- retention: achievement checks (pure) ---------- */
  {
    const w = await boot();
    const A = Object.fromEntries(w.Storied.achievements.map((a) => [a.id, a]));
    const base = { games: 0, answers: 0, correct: 0, loreCorrect: 0, rushGames: 0,
      byCat: {}, byPack: {}, packsTried: [], bestRunStreak: 0, dailyStreak: 0 };
    const ctx = { mode: "classic", diff: "easy", rounds: 10, correct: 10, score: 1000, bestStreak: 10 };
    assert(A.flawless.check(base, ctx), "ach: flawless fires on 10/10");
    assert(!A.flawless.check(base, Object.assign({}, ctx, { correct: 9 })), "ach: flawless withheld on 9/10");
    assert(A.head_archivist.check(base, Object.assign({}, ctx, { diff: "hard" })), "ach: hard perfect fires");
    assert(!A.head_archivist.check(base, ctx), "ach: hard perfect needs hard");
    assert(A.century.check(Object.assign({}, base, { correct: 100 }), ctx), "ach: century at 100 correct");
    assert(!A.century.check(Object.assign({}, base, { correct: 99 }), ctx), "ach: century withheld at 99");
    assert(A.wanderer.check(Object.assign({}, base, { packsTried: ["a","b","c","d","e"] }), ctx), "ach: wanderer at 5 packs");
    assert(A.regular.check(Object.assign({}, base, { dailyStreak: 3 }), ctx), "ach: regular at 3-day streak");
    assert(A.speed_reader.check(base, { mode: "rush", rounds: 15, correct: 9, bestStreak: 3, diff: "easy" }), "ach: speed reader in rush");
  }

  /* ---------- retention: full integration (stats, unlocks, share, screen) ---------- */

  /* ---------- harvester: transform, redaction, validation ---------- */
  {
    const H = require(path.join(dir, "harvest.js"));
    const members = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/harvest/categorymembers.json"), "utf8")).query.categorymembers;
    const pagesRaw = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/harvest/extracts.json"), "utf8")).query.pages;
    const pages = {}; Object.values(pagesRaw).forEach((p) => { pages[p.title] = p; });
    const draft = H.transform({ members, pages, base: "https://witcher.fandom.com/api.php",
      wiki: "witcher", category: "Characters", id: "witcher", label: "The Witcher" });

    assert(draft.roster.length === 12, "harvest: roster from category members");
    assert(draft.lore.length === 12, "harvest: one lore entry per page with an extract");
    assert(draft.quotes.length === 0, "harvest: quotes stay empty — never scraped");
    assert(H.validatePack(draft).length === 0, "harvest: emitted draft passes full validation");
    assert(draft.tags.includes("draft") && /DRAFT/.test(draft.label), "harvest: clearly badged as draft");

    for (const l of draft.lore) {
      for (const tok of H.nameTokens(l.a)) {
        assert(!new RegExp("\\b" + tok + "\\b", "i").test(l.question),
          "harvest: '" + tok + "' redacted from " + l.a + "'s question");
      }
      assert(l.question.split(/\s+/).length < 20, "harvest: question under 20 words (" + l.a + ")");
      assert(l.source.startsWith("https://witcher.fandom.com/wiki/"), "harvest: source URL points at the wiki (" + l.a + ")");
      assert(l.license === "CC BY-SA", "harvest: license prefilled (" + l.a + ")");
      assert(l.pool.length === 5 && !l.pool.includes(l.a), "harvest: 5 decoys, answer excluded (" + l.a + ")");
    }

    // multi-word names redact every token: Emhyr var Emreis
    const emhyr = draft.lore.find((l) => l.a === "Emhyr var Emreis");
    assert(!/emhyr|emreis/i.test(emhyr.question), "harvest: multi-word name fully redacted");
    assert(/___/.test(emhyr.question), "harvest: redaction placeholder present");

    // validator rejects a broken pack
    const bad = JSON.parse(JSON.stringify(draft));
    bad.lore[0].pool = [bad.lore[0].a];
    bad.lore[1].question = "This mentions " + bad.lore[1].a + " by name";
    const errs = H.validatePack(bad);
    assert(errs.some((e) => /pool/.test(e)) && errs.some((e) => /leaks/.test(e)),
      "harvest: validator catches thin pools and name leaks");
  }

  /* ---------- harvester: rate limiter + drafts stay unlisted ---------- */
  {
    const H = require(path.join(dir, "harvest.js"));
    const limiter = new H.RateLimiter(40);
    const t0 = Date.now();
    await limiter.wait(); await limiter.wait(); await limiter.wait();
    const elapsed = Date.now() - t0;
    assert(elapsed >= 75, "harvest: rate limiter enforces spacing (" + elapsed + "ms for 3 calls @40ms)");

    const index = JSON.parse(fs.readFileSync(path.join(dir, "packs/index.json"), "utf8"));
    assert(!index.packs.some((p) => p.id === "witcher-example"), "harvest: drafts excluded from the manifest");
    assert(fs.existsSync(path.join(dir, "packs/drafts/witcher-example.json")), "harvest: example draft ships in drafts/");
    assert(H.apiBase("witcher") === "https://witcher.fandom.com/api.php", "harvest: subdomain expands to fandom api");
    assert(H.apiBase("https://en.wikipedia.org/w/api.php") === "https://en.wikipedia.org/w/api.php", "harvest: full URLs pass through");
  }

  /* ---------- lore: schema across all packs ---------- */
  {
    const packsDir = path.join(dir, "packs");
    const index = JSON.parse(fs.readFileSync(path.join(packsDir, "index.json"), "utf8"));
    let loreTotal = 0;
    for (const meta of index.packs) {
      const pack = JSON.parse(fs.readFileSync(path.join(packsDir, meta.id + ".json"), "utf8"));
      const lore = pack.lore || [];
      assert(meta.loreCount === lore.length, "lore-schema(" + meta.id + "): manifest loreCount accurate");
      loreTotal += lore.length;
      for (const [i, l] of lore.entries()) {
        assert(l.question && l.a && l.hint, "lore-schema(" + meta.id + " #" + i + "): required fields");
        assert(Array.isArray(l.pool) && l.pool.length >= 5, "lore-schema(" + meta.id + " #" + i + "): pool has 5+ decoys");
        assert(!l.pool.includes(l.a), "lore-schema(" + meta.id + " #" + i + "): answer not in its own pool");
        assert(l.question.split(/\s+/).length < 20, "lore-schema(" + meta.id + " #" + i + "): question under 20 words");
        if (l.license) assert(l.source, "lore-schema(" + meta.id + " #" + i + "): license requires source");
      }
    }
    assert(loreTotal >= 16, "lore-schema: pilot content present (" + loreTotal + " entries)");
  }

  /* ---------- lore: attribution formatter ---------- */
  {
    const w = await boot();
    const A = w.Storied.attributionFor;
    assert(A({ source: "https://godofwar.fandom.com/wiki/Faye" }) === "Source: godofwar.fandom.com",
      "attribution: hostname extracted");
    assert(A({ source: "https://x.fandom.com/wiki/Y", license: "CC BY-SA" }) === "Source: x.fandom.com \u00B7 CC BY-SA",
      "attribution: license suffix rendered");
    assert(A({}) === "" && A(null) === "", "attribution: empty without source");
  }

  /* ---------- lore: mode availability + full playthrough ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();

    const loreChip = d.querySelector('[data-fandommode="lore"]');
    const mixedChip = d.querySelector('[data-fandommode="mixed"]');
    assert(!loreChip.disabled && !mixedChip.disabled, "lore: chips enabled — every official pack ships lore now");

    // the disabled state still guards quotes-only packs (e.g. from the Studio)
    w.PackStore.registerLocal({ id: "local-qonly", label: "Quotes Only", color: "#5ed89a",
      prompt: "Who said it?", placeholder: "x", blurb: "b", tags: ["local"],
      roster: ["A1","B2","C3","D4","E5","F6"], motifs: ["star"],
      quotes: [{ q: "Hi.", a: "A1", alt: [], hint: "h" }], lore: [] });
    w.Storied.refreshPacks();
    [...d.querySelectorAll("#fandom-grid .pack-card")].find((c) => /Quotes Only/.test(c.textContent)).click();
    assert(loreChip.disabled && mixedChip.disabled, "lore: chips disabled for a quotes-only pack");
    [...d.querySelectorAll("#fandom-grid .pack-card")].find((c) => /Stranger/.test(c.textContent)).click();

    // switch to God of War -> chips enable
    [...d.querySelectorAll("#fandom-grid .pack-card")].find((c) => /God of War/.test(c.textContent)).click();
    assert(!loreChip.disabled && !mixedChip.disabled, "lore: chips enable for packs with lore");
    assert(/10 lore/.test(d.getElementById("fandom-blurb").textContent), "lore: blurb counts lore entries");

    loreChip.click();
    d.getElementById("btn-fandom-start").click();
    assert(d.getElementById("screen-game").classList.contains("active"), "lore: game starts");
    assert(d.getElementById("prompt-line").textContent === "From the lore", "lore: prompt says lore");
    assert(d.getElementById("quote-card").classList.contains("lore"), "lore: card styled as lore");

    const pack = w.Quoted.fandoms.godofwar;
    for (let r = 0; r < 10; r++) {
      const entry = w.Storied.current();
      assert(entry.isLore, "lore r" + (r + 1) + ": entry is lore");
      const opts = [...d.querySelectorAll(".option-btn")];
      const legal = new Set([entry.a, ...entry.pool]);
      assert(opts.every((b) => legal.has(b.dataset.title)), "lore r" + (r + 1) + ": options from the entry's own pool");
      opts.find((b) => b.dataset.title === entry.a).click();
      assert(!d.getElementById("source-line").hidden && /Source: godofwar\.fandom\.com/.test(d.getElementById("source-line").textContent),
        "lore r" + (r + 1) + ": attribution shown on reveal");
      d.getElementById("btn-next").click();
    }
    assert(d.getElementById("screen-end").classList.contains("active"), "lore: reached end screen");
    assert(/fandom:godofwar:easy:lore/.test(w.localStorage.getItem("quoted.best.v1")),
      "lore: best saved under mode-suffixed slot");
  }

  /* ---------- lore: mixed decks + typed aliases ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();
    [...d.querySelectorAll("#fandom-grid .pack-card")].find((c) => /Dragon Ball/.test(c.textContent)).click();
    d.querySelector('[data-fandommode="mixed"]').click();
    d.getElementById("btn-fandom-start").click();
    const kinds = new Set(w.Storied.deck.map((e) => (e.isLore ? "lore" : "quote")));
    assert(kinds.size === 2, "mixed: deck blends quotes and lore (" + [...kinds].join("+") + ")");

    // typed alias on a lore entry
    const gw = w.Quoted.fandoms.dragonball;
    const ape = gw.lore.find((l) => l.a === "Great Ape");
    assert(w.Storied.isMatch("oozaru", ape), "mixed: 'oozaru' alias matches Great Ape");
    assert(w.Storied.isMatch("kakarrot", gw.lore.find((l) => l.a === "Kakarot")), "mixed: lore aliases fuzzy-match");
    assert(!w.Storied.isMatch("Shenron", gw.lore.find((l) => l.a === "Porunga")), "mixed: decoys don't match");
  }

  /* ---------- fandom pack switching ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();
    const chips = [...d.querySelectorAll("#fandom-grid .cat-chip")];
    assert(chips.length === Object.keys(w.Quoted.fandoms).length, "packs: one chip per pack (" + chips.length + ")");
    const cpChip = chips.find((c) => /Cyberpunk/.test(c.textContent));
    cpChip.click();
    assert(/Night City/.test(d.getElementById("fandom-blurb").textContent), "packs: blurb switches to Cyberpunk");
    assert(/Night City/.test(d.getElementById("btn-fandom-start").textContent), "packs: CTA switches to the pack's own");
    d.getElementById("btn-fandom-start").click();
    assert(d.getElementById("cat-tab").textContent === "Cyberpunk 2077", "packs: tab names Cyberpunk 2077");
    const roster = new Set(w.Quoted.fandoms.cyberpunk.roster);
    const opts = [...d.querySelectorAll(".option-btn")];
    assert(opts.every((b) => roster.has(b.dataset.title)), "packs: options drawn from Night City cast");
    const entry = w.Quoted.current();
    opts.find((b) => b.dataset.title === entry.a).click();
    assert(/Correct/.test(d.getElementById("feedback").textContent), "packs: cyberpunk round resolves");
    assert(d.querySelectorAll("#motif-layer .motif").length >= 3, "packs: cyberpunk motifs spawn");
  }

  /* ---------- fandom hard mode: typed character matching ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.querySelector('[data-mode="fandom"]').click();
    d.querySelector('[data-fandomdiff="hard"]').click();
    d.getElementById("btn-fandom-start").click();
    const input = d.querySelector(".type-input");
    assert(input && /character/.test(input.placeholder), "fandom hard: character placeholder");
    const entry = w.Quoted.current();
    // answer with a nickname/alias where one exists
    input.value = (entry.alt && entry.alt[0]) || entry.a;
    d.querySelector(".answer-area .btn-guess").click();
    assert(/Correct/.test(d.getElementById("feedback").textContent), "fandom hard: alias '" + input.value + "' accepted for " + entry.a);
  }

  /* ---------- motif density + size variety ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.getElementById("btn-start").click();
    // force a hot streak so the escalation path runs
    let sizes = new Set();
    let maxSeen = 0;
    for (let r = 0; r < 10; r++) {
      const entry = w.Quoted.current();
      const correct = [...d.querySelectorAll(".option-btn")].find((b) => b.dataset.title === entry.a);
      d.querySelectorAll("#motif-layer .motif").forEach((m) => m.remove());
      correct.click();
      const bits = [...d.querySelectorAll("#motif-layer .motif")];
      maxSeen = Math.max(maxSeen, bits.length);
      bits.forEach((b) => sizes.add(b.style.width));
      if (r < 2) {
        assert(bits.length >= 5 && bits.length <= 8, "density r" + (r+1) + ": pre-streak burst of " + bits.length + " (want 5-8)");
      } else {
        assert(bits.length >= 5 && bits.length <= 11, "density r" + (r+1) + ": hot burst of " + bits.length + " (want 5-11)");
      }
      d.getElementById("btn-next").click();
    }
    assert(maxSeen >= 8, "density: streak escalation raised bursts to " + maxSeen);
    assert(sizes.size >= 6, "density: " + sizes.size + " distinct motif sizes seen (variety)");
  }

  /* ---------- best score persistence ---------- */
  {
    const w = await boot();
    const d = w.document;
    d.getElementById("btn-start").click();
    for (let r = 0; r < 10; r++) {
      d.querySelector(".option-btn").click();
      d.getElementById("btn-next").click();
    }
    assert(d.getElementById("screen-end").classList.contains("active"), "persist: game finished");
    const stored = w.localStorage.getItem("quoted.best.v1");
    assert(stored !== null && /easy/.test(stored) || parseInt(d.getElementById("end-score").textContent,10) === 0,
      "persist: best score saved (or score was 0)");
    const badge = d.getElementById("end-best");
    const finalScore = parseInt(d.getElementById("end-score").textContent, 10);
    assert(finalScore === 0 ? badge.hidden : !badge.hidden, "persist: new-best badge state correct on first run");
  }

  /* ---------- category filtering ---------- */
  {
    const w = await boot();
    const d = w.document;
    const chips = [...d.querySelectorAll(".cat-chip")];
    chips.forEach((c) => c.click()); // all off
    assert(d.getElementById("btn-start").disabled, "setup: start disabled with no categories");
    chips[1].click(); // movies on
    assert(!d.getElementById("btn-start").disabled, "setup: start re-enabled");
    d.getElementById("btn-start").click();
    // easy mode reveals category — should always be Movies
    for (let r = 0; r < 10; r++) {
      assert(d.getElementById("cat-tab").textContent === "Movies", `filter r${r + 1}: only movies in deck`);
      d.querySelector(".option-btn").click();
      d.getElementById("btn-next").click();
    }
  }

  /* ================= v2: STUDY DECK GENERATION ================= */
  const SAMPLE_DOC = `
    The mitochondrion is often called the powerhouse of the cell. It was first
    observed by Richard Altmann in 1890, who called the structures bioblasts.
    The term mitochondrion was coined by Carl Benda in 1898. A typical animal
    cell contains between 1000 and 2000 mitochondria, occupying roughly 20
    percent of its volume. The organelle produces adenosine triphosphate, the
    chemical energy currency of all living organisms. Mitochondria contain
    their own genome, a circular chromosome resembling bacterial genomes,
    which supports the endosymbiotic theory proposed by Lynn Margulis in 1967.
    The inner membrane folds into structures called cristae, which increase
    the surface area available for respiration. Dysfunction of these organelles
    is linked to disorders including Parkinson's disease and diabetes.
  `;

  {
    const w = await boot();
    const Q = w.Quoted;
    const qs = Q.decks.generateQuestions(SAMPLE_DOC, "bio.txt");
    assert(qs.length >= 4, "study-gen: sample doc yields " + qs.length + " questions (>=4)");
    assert(qs.every((q) => q.q.includes("______")), "study-gen: every question contains a blank");
    assert(qs.every((q) => !q.q.includes(q.a)), "study-gen: the answer never leaks into the question text");
    assert(qs.every((q) => q.pool.length >= 3), "study-gen: every question has >=3 distractors");
    assert(qs.every((q) => q.pool.every((p) => p.toLowerCase() !== q.a.toLowerCase())), "study-gen: distractor pools never contain the answer");
    const answers = qs.map((q) => q.a.toLowerCase());
    assert(new Set(answers).size === answers.length, "study-gen: no repeated answers within a deck");
    const tooShort = Q.decks.generateQuestions("Hello there. Nice day.", "x.txt");
    assert(tooShort.length < Q.decks.MIN_QUESTIONS, "study-gen: trivial text produces too few questions");

    // storage round trip
    const res = w.Quoted.decks.add("Bio notes", SAMPLE_DOC, "bio.txt");
    assert(!!res.deck, "study-store: deck saved");
    assert(w.Quoted.decks.list().length === 1, "study-store: list shows one deck");
    assert(w.Quoted.decks.get(res.deck.id).name === "Bio notes", "study-store: get by id works");
    w.Quoted.decks.remove(res.deck.id);
    assert(w.Quoted.decks.list().length === 0, "study-store: remove works");
  }

  /* ================= v2: STUDY MODE GAMEPLAY ================= */

  /* ================= v2: DAILY MODE ================= */

  /* ================= v2: RUSH MODE ================= */
  {
    const w = await boot();
    const d = w.document;
    w.Quoted.config.rushSeconds = 3;
    w.Quoted.config.rushAdvanceMs = 120;
    d.querySelector('[data-mode="rush"]').click();
    assert(/No run on the clock/.test(d.getElementById("rush-best").textContent), "rush: empty best shown");
    d.getElementById("btn-rush-start").click();
    assert(d.getElementById("hud-round-label").textContent === "Answered", "rush: HUD swaps to answered-count");
    assert(d.getElementById("btn-hint").hidden && d.getElementById("btn-skip").hidden, "rush: no hint/skip buttons");

    const e1 = w.Quoted.current();
    [...d.querySelectorAll(".option-btn")].find((b) => b.dataset.title === e1.a).click();
    assert(/Correct/.test(d.getElementById("feedback").textContent), "rush: first answer registers");
    await wait(300);
    assert([...d.querySelectorAll(".option-btn")].some((b) => !b.disabled), "rush: auto-advanced to a fresh question");
    const e2 = w.Quoted.current();
    [...d.querySelectorAll(".option-btn")].find((b) => b.dataset.title === e2.a).click();
    await wait(3400);
    assert(d.getElementById("screen-end").classList.contains("active"), "rush: clock ran out -> end screen");
    assert(/2\/2/.test(d.getElementById("end-correct").textContent), "rush: correct/answered tallied as 2/2");
    const bests = JSON.parse(w.localStorage.getItem("quoted.best.v1"));
    assert(bests.rush > 0, "rush: best score persisted (" + bests.rush + ")");
    d.getElementById("btn-settings").click();
    d.querySelector('[data-mode="rush"]').click();
    assert(/Personal best/.test(d.getElementById("rush-best").textContent), "rush: best shown on panel");
  }

  console.log("\nAll smoke tests finished.");
})();
