/* ============================================================
   STORIED — pack store
   ------------------------------------------------------------
   All game content lives in packs/*.json. This module fills the
   same globals the engine has always read:

     QUOTES        the classic categorized deck (packs/core.json)
     CATEGORIES    category definitions (from core.json)
     FANDOM_PACKS  fandom packs, keyed by id

   Two loading strategies, picked automatically:

   HOSTED (http/https, incl. the Capacitor app):
     fetch packs/index.json at boot, then fetch each pack's JSON
     only when the player picks it. Initial load stays tiny no
     matter how many packs exist.

   BUNDLED (single-file standalone, file://, tests):
     build.js generates packs-bundle.js defining PACKS_BUNDLE with
     every pack inlined. When present — or when fetch is
     unavailable — everything loads eagerly and synchronously
     from it. On file:// the bundle script is injected on demand.

   The engine never needs to know which path ran.
   ============================================================ */

let QUOTES = [];
let CATEGORIES = {};
const FANDOM_PACKS = {};

const PackStore = {
  index: null,
  cache: {},

  _bundle() {
    return typeof PACKS_BUNDLE !== "undefined" ? PACKS_BUNDLE : null;
  },

  /* file:// fallback: pull in packs-bundle.js at runtime */
  _injectBundle() {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "packs-bundle.js";
      s.onload = () => resolve(this._bundle());
      s.onerror = () => reject(new Error("packs-bundle.js not found"));
      document.head.appendChild(s);
    });
  },

  async _fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(path + " -> " + res.status);
    return res.json();
  },

  /** Load the manifest + core deck; register pack metadata.
      With a bundle present, every pack loads eagerly here. */
  async init() {
    let bundle = this._bundle();

    if (!bundle) {
      const canFetch = typeof fetch === "function" &&
        !(typeof location !== "undefined" && location.protocol === "file:");
      if (canFetch) {
        try {
          this.index = await this._fetchJson("packs/index.json");
        } catch (e) {
          bundle = await this._injectBundle();
        }
      } else {
        bundle = await this._injectBundle();
      }
    }

    if (bundle) {
      this.index = bundle.index;
      // everything is already in memory — load it all, keep the engine sync
      for (const [id, data] of Object.entries(bundle.packs)) {
        this.cache[id] = data;
        if (id !== "core") FANDOM_PACKS[id] = Object.assign({ loaded: true }, data);
      }
    } else {
      for (const meta of this.index.packs) {
        if (meta.id !== "core") FANDOM_PACKS[meta.id] = Object.assign({ loaded: false }, meta);
      }
    }

    // player-made packs from the Studio join the roster — broken ones
    // (hand-edited storage, bad imports from old versions) are skipped
    Object.values(this.readLocal()).forEach((p) => {
      try {
        if (!p || !p.id || (typeof validatePack === "function" && validatePack(p).length)) {
          console.warn("storied: skipping broken local pack", p && p.id);
          return;
        }
        this.registerLocal(p);
      } catch (e) { /* one bad pack never takes the app down */ }
    });

    const core = await this.load("core");
    QUOTES = core.quotes;
    CATEGORIES = core.categories;
    return this.index;
  },

  /** Fetch one pack (network path) or return it from cache/bundle.
      Merges the full pack into its FANDOM_PACKS entry. */
  async load(id) {
    if (this.cache[id]) return this.cache[id];
    const bundle = this._bundle();
    const data = bundle ? bundle.packs[id] : await this._fetchJson("packs/" + id + ".json");
    if (!data) throw new Error("Unknown pack: " + id);
    this.cache[id] = data;
    if (id !== "core" && FANDOM_PACKS[id]) {
      Object.assign(FANDOM_PACKS[id], data, { loaded: true });
    }
    return data;
  },

  /* ---------------- local packs (Pack Studio) ---------------- */

  LOCAL_KEY: "quoted.localpacks.v1",

  readLocal() {
    try { return JSON.parse(localStorage.getItem(this.LOCAL_KEY)) || {}; }
    catch (e) { return {}; }
  },

  registerLocal(pack) {
    this.cache[pack.id] = pack;
    FANDOM_PACKS[pack.id] = Object.assign({ loaded: true, local: true }, pack);
  },

  saveLocalPack(pack) {
    const all = this.readLocal();
    all[pack.id] = pack;
    try { localStorage.setItem(this.LOCAL_KEY, JSON.stringify(all)); } catch (e) {}
    this.registerLocal(pack);
  },

  deleteLocalPack(id) {
    const all = this.readLocal();
    delete all[id];
    try { localStorage.setItem(this.LOCAL_KEY, JSON.stringify(all)); } catch (e) {}
    delete this.cache[id];
    delete FANDOM_PACKS[id]; // official packs never live in localStorage, so
                             // deleting a local pack cannot touch them
  },

  /** Fire-and-forget warm-up, used when a pack card is selected. */
  prefetch(id) {
    if (!this.cache[id]) this.load(id).catch(() => {});
  }
};

if (typeof window !== "undefined") window.PackStore = PackStore;
