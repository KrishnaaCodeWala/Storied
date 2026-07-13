#!/usr/bin/env node
/* ============================================================
   STORIED — wiki harvester (build-time tool, never ships to app)
   ------------------------------------------------------------
   Drafts fandom packs from any MediaWiki-based wiki (Fandom
   wikis, Wikipedia) using only stable core API modules.

   USAGE
     node harvest.js --wiki witcher --category Characters \
                     --limit 20 --out packs/drafts/witcher.json
     node harvest.js --wiki https://en.wikipedia.org/w/api.php ...
     node harvest.js --fixtures fixtures/harvest --out packs/drafts/x.json
     node harvest.js --validate packs

   WHAT IT EMITS
     A draft pack: roster from category members; lore entries as
     name-redacted "Who is this?" questions built from page intro
     extracts, each with source URL + "CC BY-SA" license prefilled.
     quotes is ALWAYS empty — quotes are curated by hand, never
     scraped. Drafts live in packs/drafts/ and are excluded from
     the manifest until a human curates and moves them.

   POLITENESS
     Identifying User-Agent, batched title requests, ~1 request
     per second, and a disk cache (.harvest-cache/) so re-runs
     cost the wiki nothing.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validatePack, nameTokens, wordCount } = require("./packcheck.js");

const UA = "StoriedHarvester/1.0 (fan trivia pack drafting; one-person hobby project)";
const CACHE_DIR = path.join(__dirname, ".harvest-cache");
const SNIPPET_WORDS = 15;   // redacted extract snippet length
const MIN_EXTRACT = 40;     // skip pages with thinner intros
const STOPWORDS = new Set(["of", "the", "and", "von", "van", "var", "de", "la", "le"]);

/* ---------------- rate limiter ---------------- */

class RateLimiter {
  constructor(intervalMs) { this.intervalMs = intervalMs; this.last = 0; }
  async wait() {
    const gap = Date.now() - this.last;
    if (gap < this.intervalMs) {
      await new Promise((r) => setTimeout(r, this.intervalMs - gap));
    }
    this.last = Date.now();
  }
}

/* ---------------- polite cached client ---------------- */

function cachePath(url) {
  return path.join(CACHE_DIR, crypto.createHash("sha1").update(url).digest("hex") + ".json");
}

async function apiGet(url, limiter) {
  const cp = cachePath(url);
  if (fs.existsSync(cp)) return JSON.parse(fs.readFileSync(cp, "utf8"));
  await limiter.wait();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("API " + res.status + " for " + url);
  const data = await res.json();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cp, JSON.stringify(data));
  return data;
}

/* ---------------- fetch steps ---------------- */

function apiBase(wiki) {
  return /^https?:/.test(wiki) ? wiki : "https://" + wiki + ".fandom.com/api.php";
}

async function fetchMembers(base, category, limit, limiter) {
  const members = [];
  let cont = "";
  while (members.length < limit) {
    const url = base + "?action=query&list=categorymembers&format=json&cmtype=page" +
      "&cmtitle=Category:" + encodeURIComponent(category) +
      "&cmlimit=" + Math.min(50, limit - members.length) + cont;
    const data = await apiGet(url, limiter);
    members.push(...(data.query?.categorymembers || []));
    if (!data.continue?.cmcontinue) break;
    cont = "&cmcontinue=" + encodeURIComponent(data.continue.cmcontinue);
  }
  return members.slice(0, limit);
}

async function fetchExtracts(base, titles, limiter) {
  const pages = {};
  for (let i = 0; i < titles.length; i += 20) { // batch politely
    const batch = titles.slice(i, i + 20);
    const url = base + "?action=query&prop=extracts%7Cpageprops&exintro=1&explaintext=1" +
      "&exsectionformat=plain&format=json&titles=" +
      batch.map(encodeURIComponent).join("%7C");
    const data = await apiGet(url, limiter);
    Object.values(data.query?.pages || {}).forEach((p) => { pages[p.title] = p; });
  }
  return pages;
}

/* ---------------- transform: API data -> draft pack ---------------- */

function redact(text, title) {
  let out = text;
  for (const tok of nameTokens(title)) {
    out = out.replace(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "___");
  }
  return out.replace(/(___\s*)+/g, "___ ");
}

function snippet(text, words) {
  const parts = text.trim().split(/\s+/);
  return parts.slice(0, words).join(" ") + (parts.length > words ? "\u2026" : "");
}

function pageUrl(base, title) {
  return base.replace(/api\.php$/, "wiki/") + encodeURIComponent(title.replace(/ /g, "_"));
}

function transform({ members, pages, base, wiki, category, id, label }) {
  const roster = members.map((m) => m.title);
  const lore = [];
  members.forEach((m, i) => {
    const page = pages[m.title];
    if (!page || !page.extract || page.extract.length < MIN_EXTRACT) return;
    const red = snippet(redact(page.extract, m.title), SNIPPET_WORDS);
    const pool = [];
    for (let k = 1; pool.length < 5 && k <= roster.length; k++) {
      const cand = roster[(i + k) % roster.length];
      if (cand !== m.title) pool.push(cand);
    }
    if (pool.length < 5) return; // roster too small for decoys
    lore.push({
      question: "Who is this? \u201C" + red + "\u201D",
      a: m.title,
      alt: [],
      pool,
      hint: "A wiki profile with the name blanked out",
      source: pageUrl(base, m.title),
      license: "CC BY-SA"
    });
  });

  return {
    id,
    tags: ["draft"],
    label: label + " (DRAFT)",
    color: "#9aa0b0",
    cta: "Test the draft",
    prompt: "Who is this?",
    placeholder: "Type the name\u2026",
    blurb: "DRAFT harvested from " + new URL(base).hostname +
      " \u2014 curate every entry before shipping.",
    roster,
    motifs: ["book", "quill", "scroll"],
    quotes: [], // TODO (human): quotes are curated by hand, never scraped
    lore,
    _draft: {
      harvestedAt: new Date().toISOString(),
      wiki, category,
      note: "Move out of packs/drafts/ only after human curation. " +
        "Rewrite hints, add alt spellings, verify every fact, and add hand-picked quotes."
    }
  };
}

function validateDir(root) {
  const targets = [];
  const top = fs.readdirSync(root).filter((f) => f.endsWith(".json") && f !== "index.json");
  targets.push(...top.map((f) => path.join(root, f)));
  const drafts = path.join(root, "drafts");
  if (fs.existsSync(drafts)) {
    targets.push(...fs.readdirSync(drafts).filter((f) => f.endsWith(".json")).map((f) => path.join(drafts, f)));
  }
  let failed = 0;
  for (const file of targets) {
    let errs;
    try { errs = validatePack(JSON.parse(fs.readFileSync(file, "utf8"))); }
    catch (e) { errs = ["invalid JSON: " + e.message]; }
    if (errs.length) { failed++; console.error("FAIL " + file + "\n  - " + errs.join("\n  - ")); }
    else console.log("ok   " + file);
  }
  return failed;
}

/* ---------------- CLI ---------------- */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.validate) {
    const failed = validateDir(typeof args.validate === "string" ? args.validate : "packs");
    process.exit(failed ? 1 : 0);
  }

  const out = args.out || "packs/drafts/draft.json";
  const id = path.basename(out, ".json");
  let members, pages, base, wiki, category;

  if (args.fixtures) {
    // offline mode: recorded API responses (also what the tests use)
    base = "https://witcher.fandom.com/api.php";
    wiki = "fixtures"; category = args.category || "Characters";
    members = JSON.parse(fs.readFileSync(path.join(args.fixtures, "categorymembers.json"), "utf8")).query.categorymembers;
    pages = {};
    Object.values(JSON.parse(fs.readFileSync(path.join(args.fixtures, "extracts.json"), "utf8")).query.pages)
      .forEach((p) => { pages[p.title] = p; });
  } else {
    if (!args.wiki || !args.category) {
      console.error("usage: node harvest.js --wiki <name|api url> --category <name> [--limit n] [--out file]\n" +
                    "       node harvest.js --fixtures <dir> --out <file>\n" +
                    "       node harvest.js --validate [dir]");
      process.exit(1);
    }
    wiki = args.wiki; category = args.category;
    base = apiBase(wiki);
    const limiter = new RateLimiter(1100);
    members = await fetchMembers(base, category, parseInt(args.limit || "25", 10), limiter);
    pages = await fetchExtracts(base, members.map((m) => m.title), limiter);
  }

  const label = args.label || (id.charAt(0).toUpperCase() + id.slice(1));
  const pack = transform({ members, pages, base, wiki, category, id, label });
  const errs = validatePack(pack);
  if (errs.length) {
    console.error("Draft failed validation:\n  - " + errs.join("\n  - "));
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(pack, null, 2));
  console.log("drafted " + out + ": " + pack.roster.length + " cast, " +
    pack.lore.length + " lore entries. Curate before shipping.");
}

module.exports = { RateLimiter, transform, validatePack, redact, snippet, nameTokens, apiBase };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
