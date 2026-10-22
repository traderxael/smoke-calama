const { chromium } = require("playwright-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:7845/";
const SHOTS = "C:/Users/USUARIO/Documents/Qoder/2026-10-22/7d8ed375/research/shots/";

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  if (ok) {
    pass++;
    console.log("  ok   " + name);
  } else {
    fail++;
    console.log("  FAIL " + name + (extra ? "  [" + extra + "]" : ""));
  }
}

async function boot(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, acceptDownloads: true });
  const errs = [];
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 140));
  });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/fonts\.gstatic|tile\.openstreetmap|arcgisonline|terrarium/.test(u)) return;
    errs.push("REQFAIL " + u.slice(0, 90));
  });
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".col-marker").length > 0 && !!window.__CALAMA_READY,
    null,
    { timeout: 25000 }
  ).catch(() => {});
  await page.waitForTimeout(4000);
  page.__errs = errs;
  return page;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });

  /* ---------- desktop ---------- */
  const page = await boot(browser, 1440, 1000);
  console.log("\n== desktop ==");
  const info = await page.evaluate(() => {
    const cols = [...document.querySelectorAll(".col-marker")];
    return {
      ready: !!window.__CALAMA_READY,
      cols: cols.length,
      visible: cols.filter((c) => c.offsetParent !== null).map((c) => c.querySelector(".col-name").textContent),
      visHeights: cols.filter((c) => c.offsetParent !== null).map((c) => c.querySelector(".col-bar").style.height),
      visValues: cols.filter((c) => c.offsetParent !== null).map((c) => c.querySelector(".col-value").textContent),
      heights: cols.map((c) => c.querySelector(".col-bar").style.height),
      values: cols.map((c) => c.querySelector(".col-value").textContent),
      terrain: (() => {
        try {
          return !!window.__MAP.getTerrain();
        } catch (e) {
          return "n/a";
        }
      })(),
      legend: (document.querySelector("#map-legend") || {}).textContent,
      frame: (document.querySelector("#frame-label") || {}).textContent,
      air: (document.querySelector("#air-check-value") || {}).textContent,
      airNote: (document.querySelector("#air-check-note") || {}).textContent,
      chips: [...document.querySelectorAll(".p-chip")].map((b) => b.textContent.trim()),
      pulsePaths: document.querySelectorAll("#chart-pulse path").length,
      pulseRows: document.querySelectorAll("#table-pulse tbody tr").length,
      quizOpts: document.querySelectorAll(".quiz-opt").length,
      frames: document.querySelectorAll("#frame-table tbody tr").length,
      stationRows: document.querySelectorAll("#station-table tbody tr").length,
      citations: document.querySelectorAll("#citation-list li").length,
      pollutantCards: document.querySelectorAll(".pollutant-card").length,
      metalCards: document.querySelectorAll(".metal-card").length,
      timeline: document.querySelectorAll("#timeline li").length,
      actions: document.querySelectorAll(".action-card").length,
      recovery: document.querySelectorAll(".recovery-card").length,
      planRows: document.querySelectorAll(".plan-table-wrap tbody tr").length,
      trendSvg: document.querySelectorAll("#chart-trend path").length,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
  check("mapa listo (window.__CALAMA_READY)", info.ready === true, JSON.stringify(info.ready));
  check("8 marcadores en total (6 + 2 agrupados)", info.cols === 8, "cols=" + info.cols);
  check("vista general agrupa en 2 columnas", info.visible.length === 2, info.visible.join(","));
  check("columnas agrupadas con valor", info.visValues.filter((v) => v !== "—").length === 2, info.visValues.join(","));
  check("terreno 3D activo", info.terrain === true, String(info.terrain));
  check("columnas agrupadas con altura", info.visHeights.every((h) => h && h !== "10px"), info.visHeights.join(","));
  check("leyenda pintada", /MP10/.test(info.legend || ""), (info.legend || "").slice(0, 60));
  check("marco temporal visible", /18:00/.test(info.frame || ""), info.frame);
  check("air-check con valor", info.air !== "—" && !!info.air, info.air);
  check("4 chips de contaminante", info.chips.length === 4, info.chips.join("|"));
  check("gráfico pulso con líneas", info.pulsePaths >= 4, "paths=" + info.pulsePaths);
  check("tabla del pulso con 24 horas", info.pulseRows === 24, "rows=" + info.pulseRows);
  check("tabla de instante poblada", info.frames >= 4, "rows=" + info.frames);
  check("red de monitoreo 6 filas", info.stationRows === 6, "rows=" + info.stationRows);
  check("quiz con 3 opciones", info.quizOpts === 3, "opts=" + info.quizOpts);
  check("citas renderizadas", info.citations >= 10, "n=" + info.citations);
  check("4 fichas de contaminante", info.pollutantCards === 4);
  check("4 fichas de metales", info.metalCards === 4);
  check("7 hitos de cronología", info.timeline === 7, "n=" + info.timeline);
  check("5 acciones", info.actions === 5);
  check("4 tarjetas de recuperación", info.recovery === 4, "n=" + info.recovery);
  check("6 instrumentos en la tabla de planes", info.planRows === 6, "n=" + info.planRows);
  check("sin overflow horizontal", info.scrollW <= info.clientW + 1, info.scrollW + " vs " + info.clientW);
  check("sin errores de consola", page.__errs.length === 0, page.__errs.slice(0, 4).join(" || "));

  await page.screenshot({ path: SHOTS + "v2-desktop.png" });
  await page.locator("#map-shell").screenshot({ path: SHOTS + "v2-map.png" });

  /* ---------- interacción ---------- */
  await page.locator("#map-shell").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator(".col-marker.is-cluster").first().click();
  await page.waitForTimeout(2200);
  const zoomed = await page.evaluate(() => ({
    zoom: Math.round(window.__MAP.getZoom() * 10) / 10,
    visible: [...document.querySelectorAll(".col-marker")].filter((c) => c.offsetParent !== null).map((c) => (c.querySelector(".col-name") || {}).textContent),
    card: !document.querySelector("#station-card").hidden,
  }));
  check("tocar el grupo acerca a la ciudad", zoomed.zoom >= 12.5, JSON.stringify(zoomed));
  check("al acercar aparecen las 6 estaciones", zoomed.visible.length === 6, zoomed.visible.join(","));
  check("el grupo abre la ficha de la peor estación", zoomed.card === true);
  await page.locator("#map-shell").screenshot({ path: SHOTS + "v2-ciudad.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.locator('.col-marker:not(.is-cluster)').nth(1).click();
  await page.waitForTimeout(600);
  const card = await page.evaluate(() => {
    const c = document.querySelector("#station-card");
    return { hidden: c.hidden, h: (c.querySelector("h3") || {}).textContent, metric: (c.querySelector(".card-metric strong") || {}).textContent, spark: !!c.querySelector(".card-mini svg") };
  });
  check("ficha abre al tocar columna", card.hidden === false && !!card.h, JSON.stringify(card));
  check("ficha con mini gráfico", card.spark === true);
  await page.locator("#map-shell").screenshot({ path: SHOTS + "v2-card.png" });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape cierra la ficha", (await page.evaluate(() => document.querySelector("#station-card").hidden)) === true);

  const before = await page.evaluate(() => document.querySelector("#frame-label").textContent);
  await page.locator("#play-btn").click();
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => document.querySelector("#frame-label").textContent);
  check("play avanza el tiempo", before !== after, before + " -> " + after);
  await page.locator("#play-btn").click();

  /* ---------- modos de tiempo ---------- */
  for (const [mode, expect] of [["mes", 19], ["anio", 12], ["dia", 24]]) {
    await page.locator(`.seg-btn[data-tmode="${mode}"]`).click();
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => ({
      rows: document.querySelectorAll("#table-pulse tbody tr").length,
      frame: document.querySelector("#frame-label").textContent,
      scrubMax: document.querySelector("#scrubber").max,
      heights: [...document.querySelectorAll(".col-marker")].filter((m) => m.offsetParent !== null).map((m) => m.querySelector(".col-bar").style.height),
    }));
    check("modo " + mode + " → " + expect + " marcos", r.rows === expect, "rows=" + r.rows + " frame=" + r.frame);
    check("modo " + mode + " → scrubber coherente", Number(r.scrubMax) === expect - 1, "max=" + r.scrubMax);
    check("modo " + mode + " → columnas con datos", r.heights.filter((h) => h && h !== "10px").length >= 3, r.heights.join(","));
  }

  /* ---------- contaminantes ---------- */
  for (const pol of ["mp25", "so2", "metales", "mp10"]) {
    await page.locator(`.p-chip[data-pol="${pol}"]`).click();
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({
      legend: document.querySelector("#map-legend").textContent,
      air: document.querySelector("#air-check-value").textContent,
      frame: document.querySelector("#frame-label").textContent,
      url: location.search,
    }));
    check("capa " + pol + " → leyenda cambia", r.legend.length > 40, r.legend.slice(0, 40));
    check("capa " + pol + " → url con capa", r.url.includes("capa=" + pol), r.url);
  }

  /* ---------- modo adulto ---------- */
  await page.locator('.mode-btn[data-mode="tech"]').click();
  await page.waitForTimeout(500);
  const tech = await page.evaluate(() => ({
    mode: document.body.dataset.mode,
    kidVisible: [...document.querySelectorAll(".kid")].some((e) => e.offsetParent !== null),
    techVisible: [...document.querySelectorAll(".tech")].filter((e) => e.offsetParent !== null).length,
    note: document.querySelector("#air-check-note").textContent,
  }));
  check("modo adulto oculta el texto kid", tech.kidVisible === false);
  check("modo adulto muestra texto técnico", tech.techVisible > 5, "n=" + tech.techVisible);
  check("air-check técnico", /norma|guía/.test(tech.note), tech.note);
  await page.screenshot({ path: SHOTS + "v2-tech.png" });
  await page.locator('.mode-btn[data-mode="kid"]').click();

  /* ---------- vistas de cámara ---------- */
  for (const v of ["ciudad", "red", "general"]) {
    await page.locator(`.seg-btn[data-view="${v}"]`).click();
    await page.waitForTimeout(1400);
    const cam = await page.evaluate(() => {
      const c = window.__MAP.getCenter();
      return [Math.round(c.lng * 1000) / 1000, Math.round(c.lat * 1000) / 1000];
    });
    const want = { ciudad: [-68.924, -22.438], red: [-68.8, -22.402], general: [-68.88, -22.402] }[v];
    check("vista " + v + " mueve la cámara", Math.abs(cam[0] - want[0]) < 0.02 && Math.abs(cam[1] - want[1]) < 0.02, JSON.stringify(cam));
  }
  await page.locator("#map-shell").screenshot({ path: SHOTS + "v2-general.png" });

  /* ---------- satélite + fuentes ---------- */
  await page.locator('.seg-btn[data-base="satelite"]').click();
  await page.waitForTimeout(2500);
  const sat = await page.evaluate(() => {
    const m = window.__MAP;
    return { sat: m.getLayoutProperty("sat", "visibility"), osm: m.getLayoutProperty("osm", "visibility") };
  });
  check("satélite enciende capa sat", sat.sat === "visible" && sat.osm === "none", JSON.stringify(sat));
  await page.locator("#map-shell").screenshot({ path: SHOTS + "v2-satelite.png" });
  await page.locator('.seg-btn[data-base="mapa"]').click();
  await page.waitForTimeout(800);

  await page.locator("#sources-toggle").click();
  await page.waitForTimeout(600);
  const src = await page.evaluate(() => ({
    markers: document.querySelectorAll(".src-marker").length,
    pressed: document.querySelector("#sources-toggle").getAttribute("aria-pressed"),
  }));
  check("fuentes aparecen en el mapa", src.markers >= 3 && src.pressed === "true", JSON.stringify(src));
  await page.locator("#map-shell").screenshot({ path: SHOTS + "v2-fuentes.png" });

  /* ---------- quiz ---------- */
  await page.locator("#juego").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.locator(".quiz-opt").first().click();
  await page.waitForTimeout(300);
  const q1 = await page.evaluate(() => ({
    fb: document.querySelector("#quiz-feedback").hidden,
    right: document.querySelectorAll(".quiz-opt.is-right").length,
    next: document.querySelector("#quiz-next").hidden,
  }));
  check("quiz da retroalimentación", q1.fb === false && q1.right === 1 && q1.next === false, JSON.stringify(q1));
  for (let i = 0; i < 4; i++) {
    const next = page.locator("#quiz-next");
    if (await next.isVisible()) {
      await next.click();
      await page.waitForTimeout(350);
    }
    const opt = page.locator(".quiz-opt:not([disabled])").nth(1);
    if ((await opt.count()) === 0) break;
    await opt.click();
    await page.waitForTimeout(300);
  }
  const score = await page.evaluate(() => (document.querySelector(".quiz-score") || {}).textContent || "");
  check("quiz llega al resultado", /\/4/.test(score), score.slice(0, 40));

  /* ---------- CSV ---------- */
  await page.locator("#datos").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const dlPromise = page.waitForEvent("download", { timeout: 6000 }).then((d) => d.suggestedFilename()).catch(() => null);
  await page.locator("#csv-btn").click();
  const dl = await dlPromise;
  check("CSV se descarga", !!dl, String(dl));

  /* ---------- deep link ---------- */
  const page2 = await boot(browser, 1440, 1000);
  await page2.goto(BASE + "?capa=so2&t=anio&anio=25&k=6&estacion=cd23&modo=tech&fuentes=1", { waitUntil: "load" });
  await page2.waitForTimeout(5000);
  const deep = await page2.evaluate(() => ({
    mode: document.body.dataset.mode,
    chip: document.querySelector(".p-chip.is-on").dataset.pol,
    frame: document.querySelector("#frame-label").textContent,
    card: !document.querySelector("#station-card").hidden,
    src: document.querySelectorAll(".src-marker").length,
    rows: document.querySelectorAll("#table-pulse tbody tr").length,
  }));
  check("deep link: modo adulto", deep.mode === "tech");
  check("deep link: capa so2", deep.chip === "so2", deep.chip);
  check("deep link: año 12 marcos", deep.rows === 12, "rows=" + deep.rows);
  check("deep link: julio", /jul/i.test(deep.frame), deep.frame);
  check("deep link: ficha abierta", deep.card === true);
  check("deep link: fuentes activas", deep.src >= 3, "n=" + deep.src);
  await page2.close();

  /* ---------- móvil ---------- */
  const m = await boot(browser, 390, 844);
  console.log("\n== móvil 390 ==");
  const mi = await m.evaluate(() => {
    const shell = document.querySelector("#map-shell");
    const r = shell.getBoundingClientRect();
    const dock = document.querySelector("#time-dock").getBoundingClientRect();
    const leg = document.querySelector("#map-legend").getBoundingClientRect();
    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      cols: [...document.querySelectorAll(".col-marker")].filter((c) => c.offsetParent !== null).length,
      shellH: Math.round(r.height),
      dockH: Math.round(dock.height),
      legBottom: Math.round(leg.bottom),
      legBelow: !document.querySelector("#map-legend").closest(".map-shell"),
      legVisible: leg.height > 20,
      dockTop: Math.round(dock.top),
      mapVisible: r.width > 200 && r.height > 300,
      h1: getComputedStyle(document.querySelector("#hero-title .kid")).display,
      tech: getComputedStyle(document.querySelector("#hero-title .tech")).display,
    };
  });
  check("móvil sin overflow", mi.scrollW <= mi.clientW + 1, mi.scrollW + " vs " + mi.clientW);
  check("móvil con columnas visibles", mi.cols >= 2, "cols=" + mi.cols);
  check("móvil mapa visible", mi.mapVisible, "h=" + mi.shellH);
  check("móvil leyenda fuera del mapa", mi.legBelow === true && mi.legVisible === true, JSON.stringify(mi));
  check("móvil modo kid activo", mi.h1 !== "none" && mi.tech === "none", mi.h1 + "/" + mi.tech);
  await m.locator("#mapa").scrollIntoViewIfNeeded();
  await m.waitForTimeout(2500);
  await m.screenshot({ path: SHOTS + "v2-mobile.png" });
  await m.locator("#map-shell").scrollIntoViewIfNeeded();
  await m.waitForTimeout(900);
  await m.locator(".col-marker:visible").first().click();
  await m.waitForTimeout(700);
  await m.screenshot({ path: SHOTS + "v2-mobile-card.png" });
  const mcard = await m.evaluate(() => {
    const c = document.querySelector("#station-card").getBoundingClientRect();
    const d = document.querySelector("#time-dock").getBoundingClientRect();
    return { top: Math.round(c.top), bottom: Math.round(c.bottom), dockTop: Math.round(d.top), hidden: document.querySelector("#station-card").hidden };
  });
  check("ficha móvil no tapa el dock", mcard.hidden === false && mcard.bottom <= mcard.dockTop + 4, JSON.stringify(mcard));
  check("sin errores en móvil", m.__errs.length === 0, m.__errs.slice(0, 3).join(" || "));

  await page.close();
  await m.close();
  await browser.close();
  console.log("\nPASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log("HARNESS FAIL", e.message);
  process.exit(2);
});
