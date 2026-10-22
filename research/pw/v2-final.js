const { chromium } = require("playwright-core");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:7845/";
const S = "C:/Users/USUARIO/Documents/Qoder/2026-10-22/7d8ed375/research/shots/";
let pass = 0;
let fail = 0;
const check = (n, ok, d) => {
  if (ok) { pass++; console.log("  ok   " + n); }
  else { fail++; console.log("  FAIL " + n + (d ? "  [" + d + "]" : "")); }
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });

  /* ---- 320 px ---- */
  const tiny = await browser.newPage({ viewport: { width: 320, height: 800 } });
  const tinyErrs = [];
  tiny.on("pageerror", (e) => tinyErrs.push(e.message));
  await tiny.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await tiny.waitForTimeout(4000);
  const t = await tiny.evaluate(() => {
    const overflow = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > document.documentElement.clientWidth + 2 && getComputedStyle(e).position !== "fixed";
      })
      .slice(0, 6)
      .map((e) => (e.id || e.className || e.tagName).toString().slice(0, 40));
    return { vw: innerWidth, sw: document.documentElement.scrollWidth, overflow };
  });
  check("320 sin scroll horizontal", t.sw <= t.vw + 1, JSON.stringify(t));
  check("320 sin errores", tinyErrs.length === 0, tinyErrs.join("|"));
  await tiny.screenshot({ path: S + "v2-320.png" });
  await tiny.close();

  /* ---- teclado ---- */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  page.on("requestfailed", (r) => {
    const err = (r.failure() && r.failure().errorText) || "";
    /* MapLibre cancela teselas fuera de vista: ERR_ABORTED es normal */
    if (err === "net::ERR_ABORTED") return;
    if (/gstatic|fonts.googleapis/.test(r.url())) return;
    errs.push("REQFAIL " + r.url().slice(0, 70) + " " + err);
  });
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!window.__CALAMA_READY, null, { timeout: 25000 });
  await page.waitForTimeout(3500);

  await page.locator("#map-shell").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const focusStart = await page.evaluate(() => document.activeElement.tagName + "#" + document.activeElement.id);
  await page.keyboard.press("Tab");
  let hops = 0;
  let onMarker = false;
  while (hops < 25 && !onMarker) {
    await page.keyboard.press("Tab");
    hops++;
    onMarker = await page.evaluate(() => !!document.activeElement.closest(".col-marker"));
  }
  check("tabulación llega a una columna del mapa", onMarker, "hops=" + hops);
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { name: (el.textContent || "").trim().slice(0, 60), outline: cs.outlineWidth + " " + cs.outlineColor };
  });
  check("columna enfocada anuncia su dato", /\d/.test(focused.name), focused.name);
  check("foco visible en la columna", parseInt(focused.outline, 10) >= 2, focused.outline);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  check("Enter abre la ficha", (await page.evaluate(() => document.querySelector("#station-card").hidden)) === false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check("Escape cierra la ficha", (await page.evaluate(() => document.querySelector("#station-card").hidden)) === true);

  await page.locator("#scrubber").focus();
  const before = await page.evaluate(() => document.querySelector("#frame-label").textContent);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.querySelector("#frame-label").textContent);
  check("flechas del scrubber mueven el tiempo", before !== after, before + " -> " + after);
  const vt = await page.evaluate(() => document.querySelector("#scrubber").getAttribute("aria-valuetext"));
  check("scrubber anuncia su valor", /:|de /.test(vt || ""), vt);

  /* ---- enlaces e imágenes ---- */
  const links = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll("a[href]").forEach((a) => {
      const h = a.getAttribute("href");
      if (/^https?:/.test(h)) {
        if (a.target !== "_blank" || !/noopener/.test(a.rel || "")) bad.push("sin noopener: " + h.slice(0, 40));
      } else if (h.startsWith("#") && h.length > 1 && !document.querySelector(h)) bad.push("ancla rota: " + h);
      if (!a.textContent.trim() && !a.getAttribute("aria-label")) bad.push("sin nombre: " + h.slice(0, 30));
    });
    return bad;
  });
  check("todos los enlaces son válidos y seguros", links.length === 0, links.join(" | "));
  await page.locator("#colegios").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  const imgs = await page.evaluate(() => [...document.images].map((i) => ({ src: i.src.split("/").pop(), ok: i.complete && i.naturalWidth > 0, alt: i.alt.length > 10 })));
  check("imágenes cargadas con alt", imgs.length > 0 && imgs.every((i) => i.ok && i.alt), JSON.stringify(imgs));

  /* ---- prefers-reduced-motion ---- */
  const rm = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await rm.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await rm.waitForFunction(() => !!window.__CALAMA_READY, null, { timeout: 25000 });
  await rm.waitForTimeout(2500);
  await rm.locator("#play-btn").click();
  await rm.waitForTimeout(1500);
  const rmz = await rm.evaluate(() => document.querySelector("#frame-label").textContent);
  await rm.waitForTimeout(1200);
  const rmz2 = await rm.evaluate(() => document.querySelector("#frame-label").textContent);
  check("con reduce-motion la animación sigue avanzando", rmz !== rmz2, rmz + " / " + rmz2);
  const trans = await rm.evaluate(() => getComputedStyle(document.querySelector(".col-bar")).transitionDuration);
  check("con reduce-motion sin transiciones largas", parseFloat(trans) < 0.01, trans);
  await rm.close();

  check("página sin errores de red ni script", errs.length === 0, errs.slice(0, 3).join(" | "));

  /* ---- peso del sitio ---- */
  const bytes = await page.evaluate(async () => {
    const entries = performance.getEntriesByType("resource");
    let total = 0;
    entries.forEach((e) => (total += e.transferSize || e.decodedBodySize || 0));
    return { n: entries.length, kb: Math.round(total / 1024) };
  });
  check("recursos de la página cargados", bytes.n > 6, JSON.stringify(bytes));
  console.log("  info recursos:", JSON.stringify(bytes));

  await page.close();
  await browser.close();
  console.log("\nPASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log("HARNESS FAIL", e.message);
  process.exit(2);
});
