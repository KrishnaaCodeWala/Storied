
const fs = require("fs"); const { JSDOM } = require("jsdom");
const html = fs.readFileSync("storied-standalone.html", "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
  beforeParse(w){ w.matchMedia = () => ({matches:false,addListener(){},removeListener(){}}); }});
const d = dom.window.document;
setTimeout(async () => {
  await dom.window.StoriedReady;
  d.querySelector('[data-mode="fandom"]').click();
  d.getElementById("btn-fandom-start").click();
  const ok1 = d.getElementById("screen-game").classList.contains("active");
  const ok2 = d.getElementById("cat-tab").textContent === "Stranger Things";
  const entry = dom.window.Quoted.current();
  const correct = [...d.querySelectorAll(".option-btn")].find(b => b.dataset.title === entry.a);
  correct.click();
  const ok3 = /Correct/.test(d.getElementById("feedback").textContent);
  const ok4 = d.querySelectorAll("#motif-layer .motif").length >= 3;
  console.log(ok1 && ok2 && ok3 && ok4 ? "STANDALONE OK (fandom boots, motifs spawn)" : "STANDALONE BROKEN " + [ok1,ok2,ok3,ok4]);
  process.exit(ok1 && ok2 && ok3 && ok4 ? 0 : 1);
}, 50);
