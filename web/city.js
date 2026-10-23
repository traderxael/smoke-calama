/* ============================================================
   CALAMA EN 3D — modelo de edificios + contaminación por sector
   Datos: window.CALAMA (SINCA/SMA) y window.CALAMA_CITY (OSM + Blender)
   ============================================================ */
(function () {
  "use strict";

  const D = window.CALAMA;
  const C = window.CALAMA_CITY;
  if (!D || !C) return;

  const T = D.time;
  const META = C.meta;
  const O = META.origin;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => (n < 10 ? "0" + n : String(n));
  const num = (v, d) => (v === null || v === undefined || isNaN(v) ? "—" : String(Number(v).toFixed(d === undefined ? 1 : d)).replace(".", ","));
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const POLS = ["mp10", "mp25", "so2"];
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  const BANDS = {
    mp10: [[15, "bueno"], [50, "medio"], [130, "alto"], [Infinity, "critico"]],
    mp25: [[5, "bueno"], [20, "medio"], [50, "alto"], [Infinity, "critico"]],
    so2: [[40, "bueno"], [150, "medio"], [Infinity, "alto"]],
  };
  const BAND_LABEL = {
    bueno: "Bajo la guía OMS",
    medio: "Sobre la OMS, bajo la norma",
    alto: "Sobre la norma anual",
    critico: "Sobre el límite diario",
    sin: "Sin dato",
  };
  const FILL = { bueno: "#3E7A5C", medio: "#C08A33", alto: "#B6552F", critico: "#8E1F19", sin: "#B9AD9B" };
  const LEGEND_FILL = { bueno: "#2E8B5C", medio: "#E0A030", alto: "#D2622F", critico: "#B3261E", sin: "#C2B3A0" };

  const state = { pol: "mp10", tmode: "dia", group: "enero", year: "26", frame: 18 };
  let FRAMES = [];
  let map = null;
  let ready = false;
  let timer = null;
  let markers = [];

  const bandOf = (pol, v) => {
    const b = BANDS[pol];
    for (let i = 0; i < b.length; i++) if (v <= b[i][0]) return b[i][1];
    return b[b.length - 1][1];
  };

  /* ---------- proyección local -> lon/lat ---------- */
  const lonOf = (x) => O.lon + x / O.mx;
  const latOf = (y) => O.lat + y / O.my;

  function toGeoJSON() {
    const feats = C.b.map((b, i) => {
      const flat = b[2];
      const ring = [];
      for (let k = 0; k < flat.length; k += 2) ring.push([+lonOf(flat[k]).toFixed(6), +latOf(flat[k + 1]).toFixed(6)]);
      ring.push(ring[0]);
      return {
        type: "Feature",
        id: i,
        properties: { s: b[0], h: b[1] },
        geometry: { type: "Polygon", coordinates: [ring] },
      };
    });
    return { type: "FeatureCollection", features: feats };
  }

  function zonesGeoJSON() {
    const feats = META.sectors.map(function (s, i) {
      const poly = META.areas[s.id] || [];
      const ring = poly.map(function (p) { return [+lonOf(p[0]).toFixed(6), +latOf(p[1]).toFixed(6)]; });
      if (ring.length) ring.push(ring[0]);
      return { type: "Feature", properties: { s: i }, geometry: { type: "Polygon", coordinates: [ring] } };
    });
    return { type: "FeatureCollection", features: feats };
  }

  /* ---------- motor de tiempo (igual que el mapa principal) ---------- */
  function dayIndices(year, mm) {
    const labels = T.dayLabels[year] || [];
    const pre = pad(parseInt(mm, 10) + 1);
    const out = [];
    for (let i = 0; i < labels.length; i++) if (labels[i].slice(0, 2) === pre) out.push(i);
    return out;
  }
  function buildFrames() {
    if (state.tmode === "dia") {
      const src = ((T.hourly || {})[state.pol] || {})[state.group] || {};
      FRAMES = range(24).map((h) => ({ label: pad(h) + ":00", station: (s) => src[s] ? src[s][h] : null }));
    } else if (state.tmode === "mes") {
      const src = ((T.daily || {})[state.pol] || {})[state.year] || {};
      const idx = dayIndices(state.year, state.group);
      FRAMES = idx.map((di) => ({
        label: (T.dayLabels[state.year][di] || "").slice(5),
        station: (s) => (src[s] && src[s][di] !== undefined ? src[s][di] : null),
      }));
    } else {
      const src = ((T.monthly || {})[state.pol] || {})[state.year] || {};
      FRAMES = range(12).map((mi) => ({
        label: ABBR[mi],
        station: (s) => (src[s] && src[s][mi] !== undefined ? src[s][mi] : null),
      }));
    }
    state.frame = clamp(state.frame, 0, FRAMES.length - 1);
  }
  const frame = () => FRAMES[state.frame] || { label: "—", station: () => null };

  function groupLabel() {
    if (state.tmode === "dia") return T.hourlyMonths[state.group] || state.group;
    if (state.tmode === "mes") return MONTHS[parseInt(state.group, 10)] + " " + (state.year === "25" ? "2025" : "2026");
    return state.year === "25" ? "2025" : "2026";
  }

  /* ---------- mapa ---------- */
  function initMap() {
    try {
      map = new maplibregl.Map({
        container: "map",
        style: {
          version: 8,
          sources: {
            osm: { type: "raster", tiles: ["https://tile.openstreetmap.de/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 },
            sat: {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256,
              maxzoom: 19,
            },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#e7ded0" } },
            { id: "sat", type: "raster", source: "sat", paint: { "raster-opacity": 0.92 } },
            { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
          ],
        },
        center: [-68.9325, -22.4565],
        zoom: 14.1,
        pitch: 60,
        bearing: -20,
        maxPitch: 75,
        minZoom: 10.5,
        maxZoom: 17.5,
        attributionControl: { compact: true },
      });
    } catch (e) {
      const f = $("#city-fallback");
      if (f) f.hidden = false;
      return;
    }

    map.on("load", function () {
      map.addSource("city", { type: "geojson", data: toGeoJSON() });
      map.addSource("zones", { type: "geojson", data: zonesGeoJSON() });
      map.addLayer({
        id: "zones",
        type: "fill",
        source: "zones",
        paint: {
          "fill-color": ["match", ["get", "s"], 0, "#B9AD9B", 1, "#B9AD9B", 2, "#B9AD9B", 3, "#B9AD9B", 4, "#B9AD9B", "#B9AD9B"],
          "fill-opacity": 0.26,
        },
      });
      map.addLayer({
        id: "zones-line",
        type: "line",
        source: "zones",
        paint: { "line-color": "rgba(26,21,18,.35)", "line-width": 1.2, "line-dasharray": [3, 3] },
      });
      map.addLayer({
        id: "city-shadow",
        type: "fill",
        source: "city",
        paint: { "fill-color": "#1a1512", "fill-opacity": 0.12, "fill-translate": [4, 6] },
      });
      map.addLayer({
        id: "city-outline",
        type: "line",
        source: "city",
        paint: { "line-color": "rgba(26,21,18,.45)", "line-width": 0.5 },
      });
      map.addLayer({
        id: "city",
        type: "fill-extrusion",
        source: "city",
        paint: {
          "fill-extrusion-color": ["match", ["get", "s"], 0, "#B9AD9B", 1, "#B9AD9B", 2, "#B9AD9B", 3, "#B9AD9B", 4, "#B9AD9B", "#B9AD9B"],
          "fill-extrusion-height": ["*", ["get", "h"], 2],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.94,
          "fill-extrusion-vertical-gradient": true,
        },
      });

      map.on("click", "city", function (e) {
        const f = e.features && e.features[0];
        if (!f) return;
        const s = META.sectors[f.properties.s];
        const v = withFallback(sectorValues())[s.id];
        new maplibregl.Popup({ closeButton: true, offset: 8, maxWidth: "240px" })
          .setLngLat(e.lngLat)
          .setHTML(
            "<strong>" + esc(s.name) + "</strong><br><span style='font-size:12px;color:#5f5346'>" +
            esc(s.zone) + " · edificio de " + num(f.properties.h, 0) + " m</span><br>" +
            "<span style='font-family:IBM Plex Mono,monospace;font-size:15px'>" + num(v.v, 1) + " µg/m³</span> " +
            "<span style='font-size:12px'>de " + esc(D.pollutants[state.pol].name) +
            (v.from ? " · dato de " + esc(v.from.short) : "") + "</span>"
          )
          .addTo(map);
      });
      map.on("mouseenter", "city", function () { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "city", function () { map.getCanvas().style.cursor = ""; });

      ready = true;
      window.__CITY_MAP = map;
      window.__CITY_READY = true;
      buildStationMarkers();
      update();
    });
    map.on("error", function () {});
  }

  function buildStationMarkers() {
    META.sectors.forEach(function (s) {
      const el = document.createElement("div");
      el.className = "city-marker";
      el.innerHTML = '<span class="city-marker-dot"></span><span class="city-marker-label">' + esc(s.short) + "</span>";
      el.setAttribute("aria-hidden", "true");
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(map);
      markers.push({ el: el, m: m, s: s });
    });
  }

  /* ---------- colores + UI ---------- */
  function sectorValues() {
    const f = frame();
    const out = {};
    META.sectors.forEach(function (s) {
      const v = f.station(s.id);
      out[s.id] = v === null || v === undefined || isNaN(v) ? null : v;
    });
    return out;
  }

  function withFallback(vals) {
    const out = {};
    META.sectors.forEach(function (s) {
      if (vals[s.id] !== null && vals[s.id] !== undefined) {
        out[s.id] = { v: vals[s.id], from: null };
        return;
      }
      let best = null;
      let bd = Infinity;
      META.sectors.forEach(function (o) {
        if (vals[o.id] === null || vals[o.id] === undefined) return;
        const d = Math.hypot((s.mx || 0) - (o.mx || 0), (s.my || 0) - (o.my || 0));
        if (d < bd) { bd = d; best = o; }
      });
      out[s.id] = best ? { v: vals[best.id], from: best } : { v: null, from: null };
    });
    return out;
  }

  function colorExpression(vals) {
    const expr = ["match", ["get", "s"]];
    META.sectors.forEach(function (s, i) {
      const v = vals[s.id] ? vals[s.id].v : null;
      const band = v === null ? "sin" : bandOf(state.pol, v);
      expr.push(i, FILL[band]);
    });
    expr.push(FILL.sin);
    return expr;
  }

  function update() {
    const pol = D.pollutants[state.pol];
    const vals = withFallback(sectorValues());
    const f = frame();
    $("#city-frame").textContent = f.label + " · " + groupLabel();
    const scrub = $("#city-scrub");
    scrub.max = String(FRAMES.length - 1);
    scrub.value = String(state.frame);
    scrub.style.setProperty("--fill", (FRAMES.length <= 1 ? 0 : (state.frame / (FRAMES.length - 1)) * 100).toFixed(1) + "%");
    scrub.setAttribute("aria-valuetext", f.label + " · " + groupLabel());
    $("#city-scrub-from").textContent = FRAMES[0] ? FRAMES[0].label : "";
    $("#city-scrub-to").textContent = FRAMES.length ? FRAMES[FRAMES.length - 1].label : "";

    if (ready) {
      map.setPaintProperty("city", "fill-extrusion-color", colorExpression(vals));
      map.setPaintProperty("zones", "fill-color", colorExpression(vals));
    }

    // panel
    const worst = META.sectors
      .map(function (s) { return { s: s, v: vals[s.id].v }; })
      .filter(function (x) { return x.v !== null; })
      .sort(function (a, b) { return b.v - a.v; })[0];
    const rows = META.sectors
      .map(function (s) {
        const w = vals[s.id];
        const v = w.v;
        const band = v === null ? "sin" : bandOf(state.pol, v);
        return (
          '<div class="city-sec-row"><span class="city-dot" style="background:' + FILL[band] + '"></span>' +
          '<span class="city-sec-name">' + esc(s.short) +
          '<span class="city-sec-zone">' + (w.from ? "sin dato propio · usa " + esc(w.from.short) : esc(s.zone)) + "</span></span>" +
          '<span class="city-sec-val">' + num(v, v !== null && v < 10 ? 1 : 0) + "<small>" + esc(pol.unit) + "</small></span></div>"
        );
      })
      .join("");
    $("#city-panel").innerHTML =
      "<h3>" + esc(pol.name) + " por sector · " + esc(f.label) + "</h3>" + rows +
      '<p class="city-panel-note">Cada edificio toma el valor de la estación más cercana. Es una estimación por cercanía, no una medición en ese punto ni una simulación de dispersión.</p>' +
      (worst ? '<span class="city-badge">Sector más cargado: ' + esc(worst.s.short) + "</span>" : "");

    // leyenda
    const bands = BANDS[state.pol];
    $("#city-legend").innerHTML =
      '<p class="legend-title">' + esc(pol.name) + " · " + esc(pol.unit) + "</p>" +
      '<div class="legend-scale">' +
      bands
        .map(function (b, i) {
          const lo = i === 0 ? 0 : bands[i - 1][0];
          const hi = b[0] === Infinity ? "más" : b[0];
          return (
            '<div class="legend-row"><span class="legend-swatch" style="background:' + LEGEND_FILL[b[1]] + '"></span>' +
            '<span class="legend-label">' + esc(BAND_LABEL[b[1]]) + '</span><span class="legend-range">' + lo + "–" + hi + "</span></div>"
          );
        })
        .join("") +
      "</div>";

    // marcadores de estación
    markers.forEach(function (mk) {
      const v = vals[mk.s.id].v;
      const band = v === null ? "sin" : bandOf(state.pol, v);
      mk.el.style.setProperty("--c", FILL[band]);
      $(".city-marker-label", mk.el).textContent = mk.s.short + " " + (v === null ? "—" : num(v, v < 10 ? 1 : 0));
    });

    // tarjetas de sector
    const counts = {};
    META.sectors.forEach(function (s) { counts[s.id] = s.count; });
    $("#city-sector-grid").innerHTML = META.sectors
      .map(function (s) {
        const w = vals[s.id];
        const v = w.v;
        const band = v === null ? "sin" : bandOf(state.pol, v);
        return (
          '<article class="city-sector-card" style="--c:' + LEGEND_FILL[band] + '">' +
          "<h3>" + esc(s.name) + '</h3><p class="zone">' + esc(s.zone) + " · " + esc(s.id.toUpperCase()) + "</p>" +
          '<p class="val">' + num(v, v !== null && v < 10 ? 1 : 0) + " <small>" + esc(pol.unit) + "</small></p>" +
          '<p class="count">' + counts[s.id] + " edificios · " + esc(BAND_LABEL[band]) +
          (w.from ? " · dato de " + esc(w.from.short) : "") + "</p></article>"
        );
      })
      .join("");

    // botones
    $$(".seg-btn[data-pol]").forEach(function (b) {
      const on = b.dataset.pol === state.pol;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $$(".seg-btn[data-tmode]").forEach(function (b) {
      const on = b.dataset.tmode === state.tmode;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const play = $("#city-play");
    play.setAttribute("aria-pressed", timer ? "true" : "false");
    $(".play-label", play).textContent = timer ? "Pausar" : "Animar";
    $("svg path", play).setAttribute("d", timer ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5.5v13l11-6.5z");
  }

  /* ---------- controles ---------- */
  function bind() {
    $$(".seg-btn[data-pol]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (state.pol === b.dataset.pol) return;
        state.pol = b.dataset.pol;
        state.frame = 0;
        buildFrames();
        update();
      });
    });
    $$(".seg-btn[data-tmode]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.tmode = b.dataset.tmode;
        if (state.tmode === "dia") {
          state.group = Object.keys(T.hourly[state.pol] || {})[0] || "enero";
          state.frame = 18;
        } else {
          state.group = "9";
          state.frame = 0;
        }
        stop();
        buildFrames();
        update();
      });
    });
    $$(".seg-btn[data-base]").forEach(function (b) {
      b.addEventListener("click", function () {
        const sat = b.dataset.base === "satelite";
        map.setLayoutProperty("sat", "visibility", sat ? "visible" : "none");
        map.setLayoutProperty("osm", "visibility", sat ? "none" : "visible");
        $$(".seg-btn[data-base]").forEach(function (x) {
          x.classList.toggle("is-on", x === b);
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
      });
    });
    $("#city-scrub").addEventListener("input", function (e) {
      state.frame = parseInt(e.target.value, 10);
      stop();
      update();
    });
    $("#city-play").addEventListener("click", function () {
      if (timer) return stop();
      timer = setInterval(function () {
        state.frame = (state.frame + 1) % FRAMES.length;
        update();
      }, 700);
      update();
    });
    window.addEventListener("resize", function () { if (ready) map.resize(); });
  }
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    update();
  }

  /* ---------- arranque ---------- */
  function init() {
    buildFrames();
    initMap();
    bind();
    update();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
