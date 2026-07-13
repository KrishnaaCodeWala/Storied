/* ============================================================
   STORIED — Pack Studio (Phase 6)
   ------------------------------------------------------------
   Build a pack in the app: meta, roster, quotes, lore, motifs.
   Live-validated with the same rulebook as the harvester and
   the test suite (packcheck.js). Packs save to localStorage as
   "local packs" (badged in the browser), export/import as JSON,
   and export is gated by a content checklist.
   ============================================================ */

const STUDIO_PALETTE = ["#e8b44c", "#ff6b5e", "#5ed89a", "#a78bff",
  "#63c8ff", "#ff4554", "#fcee0a", "#ffa028"];

const Studio = {
  current: null,

  blank() {
    return { id: "", tags: ["local"], label: "", color: STUDIO_PALETTE[0],
      cta: "Play the pack", prompt: "Who said it?",
      placeholder: "Type the answer\u2026", blurb: "",
      roster: [], motifs: [], quotes: [], lore: [] };
  },

  $(id) { return document.getElementById(id); },

  /* ---------------- open / paint ---------------- */

  open() {
    if (!this.current) this.current = this.blank();
    this.paintPalette();
    this.paintMotifs();
    this.paintLoadRow();
    this.paintEntries();
    this.validateLive();
  },

  paintPalette() {
    const row = this.$("st-colors");
    row.innerHTML = "";
    STUDIO_PALETTE.forEach((c) => {
      const b = document.createElement("button");
      b.className = "st-swatch" + (this.current.color === c ? " on" : "");
      b.style.background = c;
      b.setAttribute("aria-label", "Pack color " + c);
      b.addEventListener("click", () => { this.current.color = c; this.paintPalette(); });
      row.appendChild(b);
    });
  },

  paintMotifs() {
    const grid = this.$("st-motifs");
    grid.innerHTML = "";
    Object.keys(MOTIFS).sort().forEach((id) => {
      const b = document.createElement("button");
      b.className = "st-motif" + (this.current.motifs.includes(id) ? " on" : "");
      b.title = id;
      b.innerHTML = '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + MOTIFS[id] + "</svg>";
      b.addEventListener("click", () => {
        const i = this.current.motifs.indexOf(id);
        if (i >= 0) this.current.motifs.splice(i, 1);
        else if (this.current.motifs.length < 5) this.current.motifs.push(id);
        this.paintMotifs();
      });
      grid.appendChild(b);
    });
  },

  paintLoadRow() {
    const sel = this.$("st-load");
    const locals = Object.keys(PackStore.readLocal());
    sel.innerHTML = '<option value="">My packs\u2026</option>' +
      locals.map((id) => '<option value="' + id + '">' + id + "</option>").join("");
    sel.parentElement.hidden = locals.length === 0 && !this.current.id;
  },

  paintEntries() {
    const ql = this.$("st-quote-list");
    ql.innerHTML = "";
    this.current.quotes.forEach((q, i) => ql.appendChild(this.entryRow(
      "\u201C" + q.q + "\u201D \u2014 " + q.a, "quotes", i)));
    const ll = this.$("st-lore-list");
    ll.innerHTML = "";
    this.current.lore.forEach((l, i) => ll.appendChild(this.entryRow(
      l.question + " \u2192 " + l.a, "lore", i)));
  },

  entryRow(text, kind, i) {
    const row = document.createElement("div");
    row.className = "st-entry";
    row.innerHTML = '<span class="st-entry-text"></span>';
    row.querySelector(".st-entry-text").textContent = text;
    const del = document.createElement("button");
    del.className = "st-del";
    del.textContent = "\u00D7";
    del.setAttribute("aria-label", "Remove entry");
    del.addEventListener("click", () => {
      this.current[kind].splice(i, 1);
      this.paintEntries();
      this.validateLive();
    });
    row.appendChild(del);
    return row;
  },

  /* ---------------- form -> pack ---------------- */

  slug(label) {
    return "local-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  },

  collect() {
    const p = this.current;
    p.label = this.$("st-name").value.trim();
    // id follows the label until the pack has been saved/loaded (then it's pinned,
    // so renaming an existing pack doesn't orphan its best scores)
    if (!p._keepId) p.id = this.slug(p.label || "pack");
    p.prompt = this.$("st-prompt").value.trim() || "Who said it?";
    p.blurb = this.$("st-blurb").value.trim() || ("A local pack: " + p.label);
    p.roster = this.$("st-roster").value.split("\n").map((r) => r.trim()).filter(Boolean);
    if (!p.motifs.length) p.motifs = ["star"];
    return p;
  },

  fieldError(id, msg) {
    this.$(id).textContent = msg || "";
    return !msg;
  },

  addQuote() {
    const q = this.$("st-q").value.trim();
    const a = this.$("st-qa").value.trim();
    const hint = this.$("st-qh").value.trim();
    if (!q || !a || !hint) return this.fieldError("st-q-err", "Quote, answer, and hint are all required.");
    if (wordCount(q) >= 15) return this.fieldError("st-q-err", "Quotes must stay under 15 words (this is " + wordCount(q) + ").");
    this.fieldError("st-q-err", "");
    this.current.quotes.push({ q: q, a: a, alt: [], hint: hint });
    ["st-q", "st-qa", "st-qh"].forEach((id) => { this.$(id).value = ""; });
    this.paintEntries();
    this.validateLive();
    return true;
  },

  addLore() {
    const question = this.$("st-lq").value.trim();
    const a = this.$("st-la").value.trim();
    const pool = this.$("st-lpool").value.split(",").map((x) => x.trim()).filter(Boolean);
    const hint = this.$("st-lh").value.trim();
    const source = this.$("st-lsrc").value.trim();
    if (!question || !a || !hint) return this.fieldError("st-l-err", "Question, answer, and hint are required.");
    if (wordCount(question) >= 20) return this.fieldError("st-l-err", "Lore questions must stay under 20 words.");
    if (pool.length < 5) return this.fieldError("st-l-err", "Give at least 5 comma-separated wrong answers.");
    if (pool.includes(a)) return this.fieldError("st-l-err", "The right answer can't hide among the wrong ones.");
    const leak = nameTokens(a).find((t) => new RegExp("\\b" + t + "\\b", "i").test(question));
    if (leak) return this.fieldError("st-l-err", "\u201C" + leak + "\u201D gives the answer away \u2014 reword the question.");
    this.fieldError("st-l-err", "");
    const entry = { question: question, a: a, alt: [], pool: pool, hint: hint };
    if (source) { entry.source = source; entry.license = "CC BY-SA"; }
    this.current.lore.push(entry);
    ["st-lq", "st-la", "st-lpool", "st-lh", "st-lsrc"].forEach((id) => { this.$(id).value = ""; });
    this.paintEntries();
    this.validateLive();
    return true;
  },

  validateLive() {
    const errs = validatePack(this.collect());
    const box = this.$("st-status");
    if (!this.current.quotes.length && !this.current.lore.length) {
      box.className = "st-status";
      box.textContent = "Add at least one quote or lore entry.";
    } else if (errs.length) {
      box.className = "st-status bad";
      box.textContent = errs.join(" \u00B7 ");
    } else {
      box.className = "st-status good";
      box.textContent = "Pack is valid \u2014 " + this.current.quotes.length + " quotes, " +
        this.current.lore.length + " lore, " + this.current.roster.length + " cast.";
    }
    this.$("st-save").disabled = errs.length > 0;
    this.gateExport();
    return errs;
  },

  /* ---------------- checklist + save/export/import ---------------- */

  checklistDone() {
    return [...document.querySelectorAll("#st-checks input")].every((c) => c.checked);
  },

  gateExport() {
    this.$("st-export").disabled = !this.checklistDone() || validatePack(this.collect()).length > 0;
  },

  saveLocal() {
    const errs = this.validateLive();
    if (errs.length) return false;
    const clean = JSON.parse(JSON.stringify(this.current));
    delete clean._keepId;
    PackStore.saveLocalPack(clean);
    this.current._keepId = true;
    this.paintLoadRow();
    if (window.Storied && window.Storied.refreshPacks) window.Storied.refreshPacks();
    this.$("st-status").textContent = "Saved \u2014 \u201C" + this.current.label +
      "\u201D is in your pack browser now.";
    return true;
  },

  exportText() {
    const clean = JSON.parse(JSON.stringify(this.collect()));
    delete clean._keepId;
    return JSON.stringify(clean, null, 2);
  },

  exportFile() {
    if (this.$("st-export").disabled) return;
    const text = this.exportText();
    try {
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = this.current.id + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { /* environments without Blob/object URLs */ }
  },

  importText(text) {
    let pack;
    try { pack = JSON.parse(text); }
    catch (e) { return { ok: false, errors: ["That isn't valid JSON."] }; }
    pack.id = pack.id && String(pack.id).startsWith("local-")
      ? pack.id : this.slug(pack.label || "imported");
    pack.tags = [...new Set([...(pack.tags || []), "local"])];
    const errs = validatePack(pack);
    if (errs.length) return { ok: false, errors: errs };
    PackStore.saveLocalPack(pack);
    if (window.Storied && window.Storied.refreshPacks) window.Storied.refreshPacks();
    this.paintLoadRow();
    return { ok: true, id: pack.id };
  },

  loadLocal(id) {
    const pack = PackStore.readLocal()[id];
    if (!pack) return;
    this.current = JSON.parse(JSON.stringify(pack));
    this.current._keepId = true;
    this.$("st-name").value = this.current.label || "";
    this.$("st-prompt").value = this.current.prompt || "";
    this.$("st-blurb").value = this.current.blurb || "";
    this.$("st-roster").value = (this.current.roster || []).join("\n");
    this.open();
  },

  deleteLocal(id) {
    PackStore.deleteLocalPack(id);
    if (this.current && this.current.id === id) {
      this.current = this.blank();
      ["st-name", "st-prompt", "st-blurb", "st-roster"].forEach((f) => { this.$(f).value = ""; });
    }
    if (window.Storied && window.Storied.refreshPacks) window.Storied.refreshPacks();
    this.open();
  },

  /* ---------------- bulk add + example ---------------- */

  /** Parse "quote | who | hint" lines. Returns {added, errors[]}. */
  bulkAddQuotes(text) {
    const errors = [];
    let added = 0;
    text.split("\n").map((l) => l.trim()).filter(Boolean).forEach((line, n) => {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        errors.push("Line " + (n + 1) + ": needs quote | who | hint");
        return;
      }
      if (wordCount(parts[0]) >= 15) {
        errors.push("Line " + (n + 1) + ": quote is " + wordCount(parts[0]) + " words (max 14)");
        return;
      }
      this.current.quotes.push({ q: parts[0], a: parts[1], alt: [], hint: parts[2] });
      added++;
    });
    this.paintEntries();
    this.validateLive();
    return { added, errors };
  },

  /** Parse "question | answer | wrong;wrong;... | hint | source?" lines. */
  bulkAddLore(text) {
    const errors = [];
    let added = 0;
    text.split("\n").map((l) => l.trim()).filter(Boolean).forEach((line, n) => {
      const p = line.split("|").map((x) => x.trim());
      if (p.length < 4 || !p[0] || !p[1] || !p[2] || !p[3]) {
        errors.push("Line " + (n + 1) + ": needs question | answer | wrongs | hint");
        return;
      }
      const pool = p[2].split(";").map((x) => x.trim()).filter(Boolean);
      if (pool.length < 5) { errors.push("Line " + (n + 1) + ": give 5 wrong answers, ;-separated"); return; }
      if (pool.includes(p[1])) { errors.push("Line " + (n + 1) + ": the answer is in the wrong list"); return; }
      if (wordCount(p[0]) >= 20) { errors.push("Line " + (n + 1) + ": question too long (max 19 words)"); return; }
      const leak = nameTokens(p[1]).find((t) => new RegExp("\\b" + t + "\\b", "i").test(p[0]));
      if (leak) { errors.push("Line " + (n + 1) + ": \u201C" + leak + "\u201D gives it away"); return; }
      const entry = { question: p[0], a: p[1], alt: [], pool, hint: p[3] };
      if (p[4]) { entry.source = p[4]; entry.license = "CC BY-SA"; }
      this.current.lore.push(entry);
      added++;
    });
    this.paintEntries();
    this.validateLive();
    return { added, errors };
  },

  loadExample() {
    this.current = this.blank();
    this.current.label = "My Favorite Show";
    this.current.blurb = "An example pack \u2014 replace everything with your fandom.";
    this.current.roster = ["Hero", "Sidekick", "Mentor", "Rival", "Villain", "The Bartender"];
    this.current.motifs = ["star", "bolt", "book"];
    this.current.quotes = [
      { q: "We ride at dawn.", a: "Hero", alt: [], hint: "Season one, episode one" },
      { q: "That's not part of the plan.", a: "Sidekick", alt: [], hint: "Said at least once per episode" }
    ];
    this.current.lore = [
      { question: "Who runs the tavern everyone meets in?", a: "The Bartender", alt: [],
        pool: ["Hero", "Sidekick", "Mentor", "Rival", "Villain"], hint: "Knows everything, says little" }
    ];
    this.$("st-name").value = this.current.label;
    this.$("st-prompt").value = this.current.prompt;
    this.$("st-blurb").value = this.current.blurb;
    this.$("st-roster").value = this.current.roster.join("\n");
    this.open();
  },

  /* ---------------- wiring ---------------- */

  init() {
    this.current = this.blank();
    this.$("st-add-quote").addEventListener("click", () => this.addQuote());
    this.$("st-example").addEventListener("click", () => this.loadExample());
    this.$("st-bulk-q-add").addEventListener("click", () => {
      const res = this.bulkAddQuotes(this.$("st-bulk-q").value);
      this.$("st-bulk-q-err").textContent = (res.added ? "Added " + res.added + ". " : "") + res.errors.join(" \u00B7 ");
      if (!res.errors.length) this.$("st-bulk-q").value = "";
    });
    this.$("st-bulk-l-add").addEventListener("click", () => {
      const res = this.bulkAddLore(this.$("st-bulk-l").value);
      this.$("st-bulk-l-err").textContent = (res.added ? "Added " + res.added + ". " : "") + res.errors.join(" \u00B7 ");
      if (!res.errors.length) this.$("st-bulk-l").value = "";
    });
    this.$("st-add-lore").addEventListener("click", () => this.addLore());
    this.$("st-save").addEventListener("click", () => this.saveLocal());
    this.$("st-export").addEventListener("click", () => this.exportFile());
    this.$("st-preview").addEventListener("click", () => {
      if (window.Storied && window.Storied.spawnMotifs) {
        window.Storied.spawnMotifs({ cat: "books", motifs: this.current.motifs.length ? this.current.motifs : ["star"] });
      }
    });
    ["st-name", "st-prompt", "st-blurb", "st-roster"].forEach((id) => {
      this.$(id).addEventListener("input", () => this.validateLive());
    });
    document.querySelectorAll("#st-checks input").forEach((c) => {
      c.addEventListener("change", () => this.gateExport());
    });
    this.$("st-import-btn").addEventListener("click", () => {
      const res = this.importText(this.$("st-import").value);
      const box = this.$("st-status");
      box.className = "st-status " + (res.ok ? "good" : "bad");
      box.textContent = res.ok ? "Imported \u201C" + res.id + "\u201D into your pack browser."
        : "Import failed: " + res.errors.join(" \u00B7 ");
      if (res.ok) this.$("st-import").value = "";
    });
    this.$("st-load").addEventListener("change", (e) => { if (e.target.value) this.loadLocal(e.target.value); });
    this.$("st-delete").addEventListener("click", () => {
      const id = this.$("st-load").value || (this.current && this.current.id);
      if (id) this.deleteLocal(id);
    });
  }
};

if (typeof window !== "undefined") window.Studio = Studio;
