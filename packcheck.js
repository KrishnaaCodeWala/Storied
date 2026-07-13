/* ============================================================
   STORIED — pack validation rules (shared)
   ------------------------------------------------------------
   One rulebook, three consumers: the test suite, the harvester
   CLI (node), and the in-app Pack Studio (browser). No imports,
   no DOM — pure functions only.
   ============================================================ */

const PACK_STOPWORDS = new Set(["of", "the", "and", "von", "van", "var", "de", "la", "le"]);

function nameTokens(title) {
  return String(title).replace(/\(.*?\)/g, "").split(/[\s,]+/)
    .filter((t) => t.length >= 3 && !PACK_STOPWORDS.has(t.toLowerCase()));
}

function wordCount(s) { return String(s).trim().split(/\s+/).length; }

function validatePack(pack) {
  const errs = [];
  if (pack.id === "core") {
    // the classic deck: categorized quotes + category definitions
    if (!pack.categories || Object.keys(pack.categories).length < 1) errs.push("core: missing categories");
    (pack.quotes || []).forEach((q, i) => {
      if (!q.q || !q.a || !q.hint || !q.cat) errs.push("core quote #" + i + ": missing q/a/hint/cat");
      else if (!q.pd && wordCount(q.q) >= 15) errs.push("core quote #" + i + ": 15+ words");
      else if (q.cat && pack.categories && !pack.categories[q.cat]) errs.push("core quote #" + i + ": unknown cat " + q.cat);
    });
    return errs;
  }
  const need = ["id", "label", "color", "prompt", "blurb"];
  need.forEach((f) => { if (!pack[f]) errs.push("missing field: " + f); });
  if (!Array.isArray(pack.roster) || pack.roster.length < 6) errs.push("roster needs 6+ entries");
  if (!Array.isArray(pack.quotes)) errs.push("quotes must be an array");
  (pack.quotes || []).forEach((q, i) => {
    if (!q.q || !q.a || !q.hint) errs.push("quote #" + i + ": missing q/a/hint");
    else if (!q.pd && wordCount(q.q) >= 15) errs.push("quote #" + i + ": 15+ words");
  });
  (pack.lore || []).forEach((l, i) => {
    if (!l.question || !l.a || !l.hint) errs.push("lore #" + i + ": missing question/a/hint");
    if (!Array.isArray(l.pool) || l.pool.length < 5) errs.push("lore #" + i + ": pool needs 5+ decoys");
    else if (l.pool.includes(l.a)) errs.push("lore #" + i + ": answer inside its own pool");
    if (l.question && wordCount(l.question) >= 20) errs.push("lore #" + i + ": question 20+ words");
    if (l.license && !l.source) errs.push("lore #" + i + ": license requires source");
    // redaction: no meaningful token of the answer may survive in the question
    if (l.question && l.a) {
      for (const tok of nameTokens(l.a)) {
        if (new RegExp("\\b" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(l.question)) {
          errs.push("lore #" + i + ": answer token '" + tok + "' leaks into the question");
        }
      }
    }
  });
  return errs;
}


if (typeof module !== "undefined") {
  module.exports = { validatePack, nameTokens, wordCount };
}
