const { chromium } = require("playwright-core");
const AXE = require.resolve("axe-core/axe.min.js");
(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:7845/", { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(2000);
  await page.addScriptTag({ path: AXE });
  const ids = ["top", "mapa", "pulso", "evidencia", "contaminantes", "colegios", "fuentes", "planes", "historia", "juego", "actua", "metodologia"];
  const out = {};
  for (const id of ids) {
    await page.evaluate((i) => {
      const el = i === "top" ? document.body : document.getElementById(i);
      const y = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, y - 60));
    }, id);
    await page.waitForTimeout(500);
    out[id] = await page.evaluate(async () => {
      const r = await axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations"] });
      return r.violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary, html: n.html.slice(0, 140) })));
    });
    console.log(id, out[id].length);
    for (const n of out[id].slice(0, 8)) console.log("  ", n.target, "|", n.summary.replace(/\n/g, " ").slice(0, 180));
  }
  require("fs").writeFileSync("../contrast.json", JSON.stringify(out, null, 2));
  await browser.close();
})();
