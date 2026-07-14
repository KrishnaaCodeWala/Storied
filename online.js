/* ============================================================
   STORIED — online layer (Phase 5)
   ------------------------------------------------------------
   Optional accounts, cross-device sync, and a global daily
   leaderboard via Supabase — implemented as plain HTTP against
   Supabase's REST endpoints (GoTrue auth + PostgREST). No SDK,
   no dependency, nothing loads unless enabled.

   TO GO LIVE (owner):
     1. Create the Supabase project + run the Phase 5 SQL schema
        (tables player_state + daily_scores with RLS policies).
     2. Fill in ONLINE_CONFIG below (Settings -> API in Supabase).
     3. Set enabled: true. Ship.

   GUARANTEE: with enabled=false — or offline, or from file://,
   or on any network failure — the app behaves byte-for-byte as
   it always has. Every call here degrades silently.

   SYNC MERGE RULE (documented for future sessions):
   field-wise monotonic merge, safer than last-write-wins:
     - bests: max per slot
     - stats: max per counter; packsTried union; byCat/byPack
       max per bucket field
     - achievements: union, earliest unlock date wins
     - daily scores: union, existing (first) score wins
   ============================================================ */

const ONLINE_CONFIG = {
  enabled: true,    // LIVE
  url: "https://pbhhbhuwpcxhtwstulra.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaGhiaHV3cGN4aHR3c3R1bHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzE1MDgsImV4cCI6MjA5OTU0NzUwOH0.9j9llzX7zhQrg_eMkAJvd6TUiTLRjsLtKmo2JQVpHVU"
};

const Online = {
  config: ONLINE_CONFIG, // exposed for tests and console tinkering
  SESSION_KEY: "quoted.session.v1",
  session: null,
  lastSync: null,
  _syncTimer: null,

  available() {
    return !!(ONLINE_CONFIG.enabled && ONLINE_CONFIG.url && ONLINE_CONFIG.anonKey &&
      typeof fetch === "function" &&
      typeof location !== "undefined" && /^https?:$/.test(location.protocol));
  },

  /* ---------------- http helpers ---------------- */

  _headers(auth) {
    const h = { "apikey": ONLINE_CONFIG.anonKey, "Content-Type": "application/json" };
    if (auth && this.session) h["Authorization"] = "Bearer " + this.session.access_token;
    return h;
  },

  async _req(path, opts) {
    const res = await fetch(ONLINE_CONFIG.url + path, opts);
    if (!res.ok && res.status !== 409) throw new Error("online " + res.status + " " + path);
    return res;
  },

  /* ---------------- auth (magic link, implicit flow) ---------------- */

  async requestLink(email) {
    await this._req("/auth/v1/otp", {
      method: "POST",
      headers: this._headers(false),
      body: JSON.stringify({ email: email, create_user: true })
    });
    return true;
  },

  /** Parse the #access_token=... hash Supabase redirects back with. Pure. */
  _parseHash(hash) {
    if (!hash || hash.indexOf("access_token=") === -1) return null;
    const p = new URLSearchParams(hash.replace(/^#/, ""));
    if (!p.get("access_token")) return null;
    return {
      access_token: p.get("access_token"),
      refresh_token: p.get("refresh_token") || "",
      expires_at: Date.now() + (parseInt(p.get("expires_in") || "3600", 10) * 1000)
    };
  },

  _storeSession(s) {
    this.session = s;
    try {
      if (s) localStorage.setItem(this.SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(this.SESSION_KEY);
    } catch (e) { /* private mode — session lives for this tab only */ }
  },

  _restoreSession() {
    try { this.session = JSON.parse(localStorage.getItem(this.SESSION_KEY)); }
    catch (e) { this.session = null; }
  },

  async _refreshIfNeeded() {
    if (!this.session) return;
    if (Date.now() < (this.session.expires_at || 0) - 60000) return;
    if (!this.session.refresh_token) { this._storeSession(null); return; }
    try {
      const res = await this._req("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: this._headers(false),
        body: JSON.stringify({ refresh_token: this.session.refresh_token })
      });
      const data = await res.json();
      this._storeSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || this.session.refresh_token,
        expires_at: Date.now() + ((data.expires_in || 3600) * 1000),
        user: data.user || this.session.user
      });
    } catch (e) { this._storeSession(null); }
  },

  async _whoAmI() {
    if (!this.session) return null;
    try {
      const res = await this._req("/auth/v1/user", { headers: this._headers(true) });
      const user = await res.json();
      this.session.user = { id: user.id, email: user.email };
      this._storeSession(this.session);
      return this.session.user;
    } catch (e) { return null; }
  },

  signOut() {
    this._storeSession(null);
    this.lastSync = null;
  },

  /* ---------------- state sync ---------------- */

  /** Field-wise monotonic merge — pure, unit-tested. */
  mergeState(local, remote) {
    const out = { bests: {}, stats: {}, ach: {}, daily: {} };
    const L = local || {}, R = remote || {};

    const bests = Object.assign({}, R.bests, L.bests);
    Object.keys(bests).forEach((k) => {
      out.bests[k] = Math.max((L.bests || {})[k] || 0, (R.bests || {})[k] || 0);
    });

    const ls = L.stats || {}, rs = R.stats || {};
    const stats = Object.assign({}, rs, ls);
    Object.keys(stats).forEach((k) => {
      if (typeof ls[k] === "number" || typeof rs[k] === "number") {
        out.stats[k] = Math.max(ls[k] || 0, rs[k] || 0);
      } else if (Array.isArray(ls[k]) || Array.isArray(rs[k])) {
        out.stats[k] = [...new Set([...(ls[k] || []), ...(rs[k] || [])])];
      } else { // nested buckets (byCat / byPack)
        out.stats[k] = {};
        const keys = new Set([...Object.keys(ls[k] || {}), ...Object.keys(rs[k] || {})]);
        keys.forEach((b) => {
          out.stats[k][b] = {};
          const fields = new Set([
            ...Object.keys((ls[k] || {})[b] || {}), ...Object.keys((rs[k] || {})[b] || {})
          ]);
          fields.forEach((f) => {
            out.stats[k][b][f] = Math.max(((ls[k] || {})[b] || {})[f] || 0, ((rs[k] || {})[b] || {})[f] || 0);
          });
        });
      }
    });

    const ach = Object.assign({}, R.ach, L.ach);
    Object.keys(ach).forEach((id) => {
      const a = (L.ach || {})[id], b = (R.ach || {})[id];
      out.ach[id] = a && b ? (a < b ? a : b) : (a || b); // earliest date wins
    });

    Object.assign(out.daily, L.daily, R.daily); // remote fills gaps...
    Object.assign(out.daily, R.daily, L.daily); // ...but first/local score stands
    return out;
  },

  _localSnapshot(io) {
    return { bests: io.readBests(), stats: io.readStats(), ach: io.readAch(), daily: io.readDaily() };
  },

  /** Pull remote, merge, write both ways. `io` is injected by game.js
      (read/write fns for the four stores) to avoid circular coupling. */
  async sync(io) {
    if (!this.available() || !this.session) return false;
    try {
      await this._refreshIfNeeded();
      if (!this.session) return false;
      if (!this.session.user) await this._whoAmI();
      if (!this.session || !this.session.user) return false;

      const res = await this._req("/rest/v1/player_state?select=data&user_id=eq." + this.session.user.id, {
        headers: this._headers(true)
      });
      const rows = await res.json();
      const remote = rows.length ? rows[0].data : {};
      const merged = this.mergeState(this._localSnapshot(io), remote);
      io.writeAll(merged);

      await this._req("/rest/v1/player_state", {
        method: "POST",
        headers: Object.assign(this._headers(true), { "Prefer": "resolution=merge-duplicates" }),
        body: JSON.stringify({ user_id: this.session.user.id, data: merged, updated_at: new Date().toISOString() })
      });
      this.lastSync = new Date();
      return true;
    } catch (e) { return false; } // degrade silently, always
  },

  scheduleSync(io) {
    if (!this.available() || !this.session) return;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => { this.sync(io); }, 4000);
  },

  /* ---------------- daily leaderboard ---------------- */

  async submitDaily(day, score, handle) {
    if (!this.available() || !this.session) return false;
    try {
      await this._refreshIfNeeded();
      if (!this.session) return false;
      if (!this.session.user) await this._whoAmI();
      await this._req("/rest/v1/daily_scores", {
        method: "POST",
        headers: this._headers(true), // 409 (already submitted) is treated as ok
        body: JSON.stringify({ user_id: this.session.user.id, day: day, score: score,
          handle: (handle || "player").slice(0, 24) })
      });
      return true;
    } catch (e) { return false; }
  },

  async fetchLeaderboard(day) {
    if (!this.available()) return null;
    try {
      const res = await this._req(
        "/rest/v1/daily_scores?day=eq." + day +
        "&select=user_id,handle,score&order=score.desc,created_at.asc&limit=100",
        { headers: this._headers(this.session ? true : false) });
      return await res.json();
    } catch (e) { return null; }
  },

  /* ---------------- boot ---------------- */

  init() {
    if (!this.available()) return false;
    this._restoreSession();
    const fromHash = this._parseHash(location.hash);
    if (fromHash) {
      this._storeSession(fromHash);
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      this._whoAmI();
    }
    return true;
  }
};

/* ============================================================
   STORIED — open leaderboard (Option A, no accounts)
   ------------------------------------------------------------
   Anyone can post a name + score after any game; anyone can read
   the board. No sign-in. Uses the same public anon key. This is
   intentionally open — it's a fun hobby board, not a ranked
   ladder. The DB still bounds scores (0..5000) and name length.

   Requires the `scores` table + policies (see SQL in the repo /
   the activation notes). Independent of the account-based sync
   layer above, which stays dormant.
   ============================================================ */

const Leaderboard = {
  cfg: ONLINE_CONFIG,
  HANDLE_KEY: "quoted.handle.v1",

  available() {
    return !!(this.cfg.enabled && this.cfg.url && this.cfg.anonKey &&
      typeof fetch === "function" &&
      typeof location !== "undefined" && /^https?:$/.test(location.protocol));
  },

  rememberName(name) {
    try { localStorage.setItem(this.HANDLE_KEY, JSON.stringify({ h: (name || "").slice(0, 24) })); } catch (e) {}
  },
  lastName() {
    try { return (JSON.parse(localStorage.getItem(this.HANDLE_KEY)) || {}).h || ""; }
    catch (e) { return ""; }
  },

  _headers() {
    return { "apikey": this.cfg.anonKey, "Authorization": "Bearer " + this.cfg.anonKey,
      "Content-Type": "application/json" };
  },

  /** Post a score. Fire-and-forget; never throws. Returns bool. */
  async submit(name, score, mode, pack) {
    if (!this.available()) return false;
    const clean = (name || "player").trim().slice(0, 24) || "player";
    this.rememberName(clean);
    try {
      const res = await fetch(this.cfg.url + "/rest/v1/scores", {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({
          handle: clean,
          score: Math.max(0, Math.min(5000, Math.round(score))),
          mode: (mode || "classic").slice(0, 16),
          pack: (pack || "").slice(0, 40)
        })
      });
      return res.ok;
    } catch (e) { return false; }
  },

  /** Top scores, optionally filtered to a mode. Returns array or null. */
  async top(opts) {
    if (!this.available()) return null;
    opts = opts || {};
    let q = "/rest/v1/scores?select=handle,score,mode,pack,created_at" +
      "&order=score.desc,created_at.asc&limit=" + (opts.limit || 20);
    if (opts.mode) q += "&mode=eq." + encodeURIComponent(opts.mode);
    try {
      const res = await fetch(this.cfg.url + q, { headers: this._headers() });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }
};

if (typeof window !== "undefined") window.Leaderboard = Leaderboard;
if (typeof module !== "undefined") module.exports = { Online, Leaderboard };
