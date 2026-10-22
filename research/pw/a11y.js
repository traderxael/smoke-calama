const { chromium } = require("playwright-core");
const path = require("path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:7845/";
const AXE = require.resolve("axe-core/axe.min.js");

async function audit(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const r = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"]
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 14).map((n) => ({
        target: n.target,
        html: n.html.slice(0, 180),
        summary: n.failureSummary
      })),
      count: v.nodes.length
    }));
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const out = {};
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(BASE, { waitUntil: "load", timeout: 45000 });
    await page.waitForFunction(() => !!window.__CALAMA_READY, null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2500);
    out[name] = await audit(page);
    out[name + "_markers"] = await page.evaluate(() =>
      [...document.querySelectorAll(".col-marker")].map((e) => ({
        tag: e.tagName,
        role: e.getAttribute("role"), label: (e.textContent||"").trim().slice(0,60),
        aria: e.getAttribute("aria-label"),
        title: e.getAttribute("title"),
        tab: e.getAttribute("tabindex"),
        text: e.textContent.trim().slice(0, 40),
        html: e.outerHTML.slice(0, 180)
      }))
    );
    if (name === "desktop") {
      await page.locator('.p-chip[data-pol="mp25"]').click();
      await page.waitForTimeout(500);
      out.desktop_mp25 = await audit(page);
      await page.locator("#sources-toggle").click();
      await page.locator(".col-marker.is-cluster").first().click();
      await page.waitForTimeout(700);
      out.desktop_card = await audit(page);
      await page.locator('.mode-btn[data-mode="tech"]').click();
      await page.locator('.seg-btn[data-tmode="anio"]').click();
      await page.waitForTimeout(700);
      out.desktop_tech = await audit(page);
      await page.locator('.mode-btn[data-mode="kid"]').click();
      await page.locator(".quiz-opt").first().click();
      await page.waitForTimeout(400);
      out.desktop_quiz = await audit(page);
      out.focus = await page.evaluate(() => {
        const order = [];
        const sel = 'a[href], button, input, summary, [tabindex="0"], [tabindex="-1"]';
        document.querySelectorAll(sel).forEach((e) => {
          const r = e.getBoundingClientRect();
          if (r.width && r.height && getComputedStyle(e).visibility !== "hidden") {
            order.push((e.getAttribute("aria-label") || e.textContent || e.id || e.className).trim().slice(0, 40));
          }
        });
        return order.slice(0, 40);
      });
    }
    await page.close();
  }
  require("fs").writeFileSync("C:/Users/USUARIO/Documents/Qoder/2026-10-22/7d8ed375/research/a11y.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => !k.includes("markers")).map(([k, v]) => [k, { count: v.length, rules: v.map((x) => `${x.id} (${x.impact}) x${x.count}`) }])), null, 2));
  console.log("markers", JSON.stringify(out.desktop_markers.slice(0, 2), null, 2));
  await browser.close();
})();
