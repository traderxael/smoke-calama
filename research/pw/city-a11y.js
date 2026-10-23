const { chromium } = require("playwright-core");
const AXE = require.resolve("axe-core/axe.min.js");
(async () => {
  const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const out = {};
  for (const [name, w, h] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto("http://127.0.0.1:7845/ciudad.html", { waitUntil: "load", timeout: 60000 });
    await p.waitForFunction(() => !!window.__CITY_READY, null, { timeout: 35000 }).catch(() => {});
    await p.waitForTimeout(3500);
    await p.addScriptTag({ path: AXE });
    const audit = async () => p.evaluate(async () => {
      const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"] }, resultTypes: ["violations"] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ t: n.target, s: (n.failureSummary||"").replace(/\n+/g," ").slice(0,180) })) }));
    });
    out[name] = await audit();
    if (name === "desktop") {
      await p.locator('.seg-btn[data-t="mp25"]').count();
      await p.locator('.seg-btn[data-pol="so2"]').click();
      await p.waitForTimeout(600);
      out.desktop_so2 = await audit();
      await p.locator('.seg-btn[data-tmode="anio"]').click();
      await p.waitForTimeout(700);
      out.desktop_anio = await audit();
    }
    await p.close();
  }
  for (const [k, v] of Object.entries(out)) {
    console.log(k, v.length, v.map(x => x.id + " x" + x.nodes.length).join(", "));
    v.slice(0, 3).forEach(x => x.nodes.slice(0, 4).forEach(n => console.log("   ", n.t.join(" "), "::", n.s.slice(0, 130))));
  }
  await b.close();
})();
