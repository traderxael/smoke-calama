const { chromium } = require("playwright-core");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:7845/ciudad.html";
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

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 140)); });
  page.on("requestfailed", (r) => {
    const err = (r.failure() && r.failure().errorText) || "";
    if (err === "net::ERR_ABORTED" || /gstatic|fonts\.googleapis/.test(r.url())) return;
    errs.push("REQFAIL " + r.url().slice(0, 80) + " " + err);
  });

  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => !!window.__CITY_READY, null, { timeout: 35000 }).catch(() => {});
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const m = window.__CITY_MAP;
    const src = m && m.getSource("city");
    const data = src && src._data;
    return {
      ready: !!window.__CITY_READY,
      buildings: window.CALAMA_CITY ? window.CALAMA_CITY.b.length : 0,
      sectors: window.CALAMA_CITY ? window.CALAMA_CITY.meta.sectors.length : 0,
      features: data && data.features ? data.features.length : 0,
      layer: m ? m.getLayer("city") && m.getLayer("city").type : null,
      paint: m ? JSON.stringify(m.getPaintProperty("city", "fill-extrusion-color")) : "",
      markers: document.querySelectorAll(".city-marker").length,
      panelRows: document.querySelectorAll(".city-sec-row").length,
      cards: document.querySelectorAll(".city-sector-card").length,
      frame: (document.querySelector("#city-frame") || {}).textContent,
      legend: (document.querySelector("#city-legend") || {}).textContent,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
  check("página 3D lista", info.ready === true);
  check("1.385 edificios en el dataset", info.buildings === 1385, "n=" + info.buildings);
  check("5 sectores", info.sectors === 5, "n=" + info.sectors);
  check("fuente geojson con 1.385 features", info.features === 1385, "n=" + info.features);
  check("capa de extrusión", info.layer === "fill-extrusion", String(info.layer));
  check("5 marcadores de estación", info.markers === 5, "n=" + info.markers);
  check("panel con 5 filas", info.panelRows === 5, "n=" + info.panelRows);
  check("leyenda con valores", /MP10/.test(info.legend || ""), (info.legend || "").slice(0, 50));
  check("5 tarjetas de sector", info.cards === 5, "n=" + info.cards);
  check("sin overflow horizontal", info.scrollW <= info.clientW + 1, info.scrollW + " / " + info.clientW);
  check("sin errores de consola", errs.length === 0, errs.slice(0, 3).join(" | "));

  await page.screenshot({ path: S + "city-desktop.png" });
  await page.locator(".city-stage").screenshot({ path: S + "city-stage.png" });

  /* el color cambia con el tiempo */
  const before = await page.evaluate(() => JSON.stringify(window.__CITY_MAP.getPaintProperty("city", "fill-extrusion-color")));
  await page.locator("#city-scrub").evaluate((el) => {
    el.value = "4";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => JSON.stringify(window.__CITY_MAP.getPaintProperty("city", "fill-extrusion-color")));
  check("el color por sector cambia con la hora", before !== after);
  check("la etiqueta de instante se actualiza", /04:00/.test(await page.locator("#city-frame").textContent()), await page.locator("#city-frame").textContent());

  /* contaminante */
  await page.locator('.seg-btn[data-pol="mp25"]').click();
  await page.waitForTimeout(600);
  const mp25 = await page.evaluate(() => ({
    paint: JSON.stringify(window.__CITY_MAP.getPaintProperty("city", "fill-extrusion-color")),
    legend: document.querySelector("#city-legend").textContent,
    panel: document.querySelector("#city-panel").textContent,
  }));
  check("cambiar a MP2,5 cambia los valores del panel", /MP2,5/.test(mp25.panel) && !/MP10/.test(mp25.panel), mp25.panel.slice(0, 60));
  check("leyenda MP2,5", /MP2,5/.test(mp25.legend), mp25.legend.slice(0, 40));

  /* clic en un edificio */
  const box = await page.locator("#map").boundingBox();
  const pt = await page.evaluate(() => {
    const b = window.CALAMA_CITY;
    const m = window.CALAMA_CITY.meta.origin;
    /* centroide del edificio más grande del sector centro */
    let best = null;
    b.b.forEach((x) => {
      if (x[0] !== 3) return;
      if (!best || x[2].length > best[2].length) best = x;
    });
    const flat = best[2];
    let sx = 0, sy = 0, n = flat.length / 2;
    for (let i = 0; i < flat.length; i += 2) { sx += flat[i]; sy += flat[i + 1]; }
    const lon = m.lon + (sx / n) / m.mx;
    const lat = m.lat + (sy / n) / m.my;
    return window.__CITY_MAP.project([lon, lat]);
  });
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await page.waitForTimeout(900);
  const popup = await page.evaluate(() => {
    const p = document.querySelector(".maplibregl-popup-content");
    return p ? p.textContent.slice(0, 120) : null;
  });
  check("clic en un edificio abre ficha", !!popup && /µg\/m³/.test(popup), String(popup).slice(0, 60));

  /* modos de tiempo */
  for (const [mode, expect] of [["mes", 19], ["anio", 12], ["dia", 24]]) {
    await page.locator(`.seg-btn[data-tmode="${mode}"]`).click();
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({
      max: Number(document.querySelector("#city-scrub").max),
      frame: document.querySelector("#city-frame").textContent,
    }));
    check("modo " + mode + " → " + expect + " marcos", r.max === expect - 1, "max=" + r.max + " frame=" + r.frame);
  }

  /* play */
  await page.locator("#city-play").click();
  await page.waitForTimeout(1500);
  const playing = await page.locator("#city-play").getAttribute("aria-pressed");
  await page.locator("#city-play").click();
  check("animación funciona", playing === "true", String(playing));

  /* descargas */
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a[download]")].map((a) => a.getAttribute("href"))
  );
  const heads = [];
  for (const l of links) {
    const r = await page.request.get(new URL(l, BASE).toString());
    heads.push([l, r.status(), (await r.body()).length]);
  }
  check("descargas GLB/DXF/JSON responden 200", heads.every((h) => h[1] === 200 && h[2] > 1000), JSON.stringify(heads));

  /* móvil */
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mErrs = [];
  m.on("pageerror", (e) => mErrs.push(e.message));
  await m.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await m.waitForFunction(() => !!window.__CITY_READY, null, { timeout: 35000 }).catch(() => {});
  await m.waitForTimeout(3500);
  const mi = await m.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    mapH: Math.round(document.querySelector("#map").getBoundingClientRect().height),
    panel: !!document.querySelector(".city-panel"),
    cards: document.querySelectorAll(".city-sector-card").length,
  }));
  check("móvil sin overflow", mi.sw <= mi.cw + 1, mi.sw + " / " + mi.cw);
  check("móvil con mapa visible", mi.mapH > 300, "h=" + mi.mapH);
  check("móvil con panel y tarjetas", mi.panel && mi.cards === 5, JSON.stringify(mi));
  check("móvil sin errores", mErrs.length === 0, mErrs.join("|"));
  await m.screenshot({ path: S + "city-mobile.png", fullPage: false });

  await browser.close();
  console.log("\nPASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log("HARNESS FAIL", e.message);
  process.exit(2);
});
