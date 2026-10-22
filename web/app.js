/* ============================================================
   CALAMA RESPIRA · v2
   Mapa 3D (MapLibre + relieve), motor de tiempo y modo niño.
   Datos: window.CALAMA (data/calama-data.js) — SMA / SINCA / MMA.
   ============================================================ */
(function () {
  "use strict";

  const DATA = window.CALAMA;
  if (!DATA) return;

  const T = DATA.time;
  const ST = DATA.stations;
  const P = DATA.pollutants;
  const IDS = Object.keys(ST);
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => (n < 10 ? "0" + n : String(n));
  const num = (v, d) => {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return String(Number(v).toFixed(d === undefined ? 1 : d)).replace(".", ",");
  };
  const int = (v) => {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /* texto legible sobre cualquier color de dato */
  function bestText(hex) {
    const h = String(hex).replace("#", "");
    const ch = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
    return L > 0.19 ? "#171310" : "#ffffff";
  }

  /* ---------- escalas y umbrales ---------- */
  const SCALE = { mp10: 140, mp25: 60, so2: 60 };
  const BANDS = {
    mp10: [
      { max: 15, id: "bueno", tech: "Bajo la guía OMS (15)", kid: "Aire más limpio" },
      { max: 50, id: "medio", tech: "Sobre la guía OMS, bajo la norma de 50", kid: "Un poco de polvo" },
      { max: 130, id: "alto", tech: "Sobre la norma anual de 50", kid: "Mucho polvo" },
      { max: Infinity, id: "critico", tech: "Sobre el límite diario de 130", kid: "Demasiado polvo" },
    ],
    mp25: [
      { max: 5, id: "bueno", tech: "Bajo la guía OMS (5)", kid: "Aire más limpio" },
      { max: 20, id: "medio", tech: "Sobre la guía OMS, bajo la norma de 20", kid: "Un poco de polvo" },
      { max: 50, id: "alto", tech: "Sobre la norma anual de 20", kid: "Mucho polvo" },
      { max: Infinity, id: "critico", tech: "Sobre el límite diario de 50", kid: "Demasiado polvo" },
    ],
    so2: [
      { max: 40, id: "bueno", tech: "Bajo la guía diaria OMS (40)", kid: "Aire más limpio" },
      { max: 150, id: "medio", tech: "Sobre la guía OMS, bajo la norma de 150", kid: "Algo de azufre" },
      { max: Infinity, id: "alto", tech: "Sobre la norma diaria de 150", kid: "Mucho azufre" },
    ],
  };
  const FILL = { bueno: "#2E8B5C", medio: "#E0A030", alto: "#D2622F", critico: "#B3261E", sin: "#C2B3A0" };
  const SERIES_COLORS = ["#B4552F", "#1D5A80", "#4E6B57", "#8A5A10", "#7A4E9B", "#6B6B6B"];
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MONTH_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const POL_LIST = ["mp10", "mp25", "so2", "metales"];
  const POL_SUB = { mp10: "Polvo respirable", mp25: "Polvo fino", so2: "Gas", metales: "Polvo en colegios" };
  const INIT = { center: [-68.88, -22.402], zoom: 11.3, pitch: 26, bearing: -10 };
  const VIEWS = {
    general: { center: [-68.88, -22.402], zoom: 11.3, pitch: 26, bearing: -10 },
    ciudad: { center: [-68.924, -22.438], zoom: 12.7, pitch: 20, bearing: -15 },
    red: { center: [-68.8, -22.402], zoom: 10.6, pitch: 12, bearing: -6 },
  };

  /* A escala general las cuatro estaciones urbanas caen a pocos píxeles entre sí:
     por eso arriba de cierto zoom se agrupan en una sola columna por zona. */
  const URBANAS = ["hospital", "cpvk", "cd23", "centro", "oasis"];
  const ZOOM_SPLIT = 12.3;
  const CLUSTERS = [
    {
      id: "ciudad",
      name: "La ciudad",
      members: URBANAS,
      lon: avg(URBANAS.map(function (i) { return ST[i].lon; })),
      lat: avg(URBANAS.map(function (i) { return ST[i].lat; })),
      view: "ciudad",
    },
    {
      id: "nueva",
      name: "Nueva Chiu Chiu",
      members: ["nueva"],
      lon: ST.nueva.lon,
      lat: ST.nueva.lat,
      view: null,
    },
  ];
  function avg(a) {
    return a.reduce(function (x, y) { return x + y; }, 0) / a.length;
  }

  /* ---------- estado ---------- */
  const state = {
    pol: "mp10",
    tmode: "dia",
    group: "enero",
    year: "26",
    frame: 18,
    station: null,
    sources: false,
    base: "mapa",
    view: "general",
    mode: "kid",
  };
  let FRAMES = [];
  let map = null;
  let mapReady = false;
  let COLS = {};
  let CLUST = {};
  let lastCluster = null;
  let SRC_MARKERS = [];
  let timer = null;

  /* ---------- URL ---------- */
  function readUrl() {
    const q = new URLSearchParams(location.search);
    if (POL_LIST.indexOf(q.get("capa")) >= 0) state.pol = q.get("capa");
    if (["dia", "mes", "anio"].indexOf(q.get("t")) >= 0) state.tmode = q.get("t");
    if (q.get("anio") === "25" || q.get("anio") === "26") state.year = q.get("anio");
    if (q.get("grupo")) state.group = q.get("grupo");
    if (q.get("k") !== null && !isNaN(+q.get("k"))) state.frame = +q.get("k");
    if (ST[q.get("estacion")]) state.station = q.get("estacion");
    if (["mapa", "satelite"].indexOf(q.get("fondo")) >= 0) state.base = q.get("fondo");
    if (["kid", "tech"].indexOf(q.get("modo")) >= 0) state.mode = q.get("modo");
    if (q.get("fuentes") === "1") state.sources = true;
    if (state.tmode === "dia" && !(T.hourly[state.pol] || {})[state.group]) state.group = "enero";
    if (state.tmode !== "dia" && isNaN(+state.group)) state.group = "9";
  }
  function syncUrl() {
    const q = new URLSearchParams();
    q.set("capa", state.pol);
    q.set("t", state.tmode);
    q.set("grupo", state.group);
    if (state.tmode !== "dia") q.set("anio", state.year);
    q.set("k", state.frame);
    if (state.station) q.set("estacion", state.station);
    if (state.base !== "mapa") q.set("fondo", state.base);
    if (state.mode !== "kid") q.set("modo", state.mode);
    if (state.sources) q.set("fuentes", "1");
    history.replaceState(null, "", location.pathname + "?" + q.toString());
  }

  /* ============================================================
     MOTOR DE TIEMPO
     ============================================================ */
  function hourlySource() {
    return ((T.hourly || {})[state.pol] || {})[state.group] || {};
  }
  function dayIndices(year, mm) {
    const labels = T.dayLabels[year] || [];
    const pre = pad(parseInt(mm, 10) + 1);
    const out = [];
    for (let i = 0; i < labels.length; i++) if (labels[i].slice(0, 2) === pre) out.push(i);
    return out;
  }
  function valueAt(series, station, i) {
    const arr = series[station];
    if (!arr || i >= arr.length) return null;
    const v = arr[i];
    return v === null || v === undefined ? null : v;
  }
  function buildFrames() {
    if (state.pol === "metales") {
      FRAMES = [{ key: "estudio", label: "2026", kid: "2026", values: {} }];
      state.frame = 0;
      return;
    }
    if (state.tmode === "dia") {
      const src = hourlySource();
      FRAMES = range(24).map((h) => {
        const values = {};
        Object.keys(src).forEach((s) => (values[s] = valueAt(src, s, h)));
        return { key: "h" + h, label: pad(h) + ":00", kid: hourKid(h), values: values };
      });
    } else if (state.tmode === "mes") {
      const src = ((T.daily || {})[state.pol] || {})[state.year] || {};
      const idx = dayIndices(state.year, state.group);
      const labels = T.dayLabels[state.year] || [];
      FRAMES = idx.map((di) => {
        const values = {};
        Object.keys(src).forEach((s) => (values[s] = valueAt(src, s, di)));
        const raw = labels[di] || "";
        return {
          key: "d" + di,
          label: raw,
          kid: dayKid(raw),
          values: values,
        };
      });
    } else {
      const src = ((T.monthly || {})[state.pol] || {})[state.year] || {};
      FRAMES = range(12).map((mi) => {
        const values = {};
        Object.keys(src).forEach((s) => (values[s] = valueAt(src, s, mi)));
        return { key: "m" + mi, label: MONTH_ABBR[mi] + " " + yearFull(), kid: MONTHS[mi], values: values };
      });
    }
    if (state.frame >= FRAMES.length) state.frame = FRAMES.length - 1;
    if (state.frame < 0) state.frame = 0;
  }
  function yearFull() {
    return state.year === "25" ? "2025" : "2026";
  }
  function hourKid(h) {
    if (h < 6) return "de madrugada";
    if (h < 12) return "en la mañana";
    if (h < 19) return "en la tarde";
    return "en la noche";
  }
  function dayKid(raw) {
    const p = String(raw).split("-");
    if (p.length !== 2) return raw;
    return Number(p[1]) + " de " + MONTHS[Number(p[0]) - 1];
  }
  function frame() {
    return FRAMES[clamp(state.frame, 0, FRAMES.length - 1)];
  }
  function groupLabel() {
    if (state.tmode === "dia") return T.hourlyMonths[state.group] || state.group;
    if (state.tmode === "mes") return MONTHS[parseInt(state.group, 10)] + " " + yearFull();
    return yearFull();
  }
  function seriesOf(station) {
    return FRAMES.map((f) => (station in f.values ? f.values[station] : null));
  }
  function stationsInFrame() {
    const set = {};
    FRAMES.forEach((f) => Object.keys(f.values).forEach((s) => (set[s] = true)));
    return Object.keys(ST).filter((s) => set[s]);
  }

  /* ============================================================
     MAPA 3D
     ============================================================ */
  const OSM = "https://tile.openstreetmap.de/{z}/{x}/{y}.png";
  const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

  function mapStyle() {
    return {
      version: 8,
      sources: {
        dem: { type: "raster-dem", tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: "terrarium" },
        osm: { type: "raster", tiles: [OSM], tileSize: 256, maxzoom: 19 },
        sat: { type: "raster", tiles: [SAT], tileSize: 256, maxzoom: 19 },
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#e7ded0" } },
        { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } },
        { id: "osm", type: "raster", source: "osm" },
        {
          id: "hs",
          type: "hillshade",
          source: "dem",
          minzoom: 8,
          paint: {
            "hillshade-exaggeration": 0.32,
            "hillshade-shadow-color": "#6b4a2a",
            "hillshade-highlight-color": "#fff6e6",
            "hillshade-accent-color": "#c08a4e",
          },
        },
      ],
    };
  }

  function initMap() {
    const box = $("#map");
    if (!box || typeof window.maplibregl === "undefined") return failMap();
    try {
      map = new window.maplibregl.Map({
        container: "map",
        style: mapStyle(),
        center: INIT.center,
        zoom: INIT.zoom,
        pitch: INIT.pitch,
        bearing: INIT.bearing,
        maxPitch: 72,
        minZoom: 9,
        maxZoom: 16,
        attributionControl: { compact: true },
      });
    } catch (e) {
      return failMap();
    }
    map.on("load", function () {
      try {
        map.setTerrain({ source: "dem", exaggeration: 1.35 });
      } catch (e) {
        /* si el dispositivo no puede con el relieve, el mapa sigue en 2D */
      }
      mapReady = true;
      window.__MAP = map;
      window.__CALAMA_READY = true;
      buildColumns();
      buildSourceMarkers();
      applyBase();
      renderColumns();
      fitPadding();
      applyView(false);
    });
    map.on("moveend", function () {
      /* fuera del ciclo de render: tocar el DOM aquí congelaba la cámara */
      setTimeout(applyZoomMode, 0);
    });
    map.on("error", function () {
      /* los errores de teselas no deben romper la interfaz */
    });
  }
  function failMap() {
    const f = $("#map-fallback");
    if (f) f.hidden = false;
  }

  function buildColumns() {
    IDS.forEach(function (id) {
      const st = ST[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "col-marker";
      btn.innerHTML =
        '<span class="col-chip"><span class="col-name">' +
        esc(st.short) +
        '</span><span class="col-value">—</span></span>' +
        '<span class="col-bar"></span><span class="col-shadow" aria-hidden="true"></span>';
      const value = $(".col-value", btn);
      const bar = $(".col-bar", btn);
      const sr = document.createElement("span");
      sr.className = "sr-only";
      btn.appendChild(sr);
      btn.addEventListener("click", function () {
        selectStation(state.station === id ? null : id);
      });
      const marker = new window.maplibregl.Marker({ element: btn, anchor: "bottom" }).setLngLat([st.lon, st.lat]).addTo(map);
      btn.removeAttribute("aria-label");
      COLS[id] = { btn: btn, value: value, bar: bar, sr: sr, marker: marker };
    });
    CLUSTERS.forEach(function (c) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "col-marker is-cluster";
      btn.innerHTML =
        '<span class="col-chip"><span class="col-name">' +
        esc(c.name) +
        '</span><span class="col-value">—</span></span>' +
        '<span class="col-bar"></span><span class="col-shadow" aria-hidden="true"></span>' +
        '<span class="col-more">4 estaciones</span>';
      const sr = document.createElement("span");
      sr.className = "sr-only";
      btn.appendChild(sr);
      btn.addEventListener("click", function () {
        openCluster(c);
      });
      const marker = new window.maplibregl.Marker({ element: btn, anchor: "bottom" }).setLngLat([c.lon, c.lat]).addTo(map);
      btn.removeAttribute("aria-label");
      CLUST[c.id] = {
        cfg: c,
        btn: btn,
        value: $(".col-value", btn),
        bar: $(".col-bar", btn),
        more: $(".col-more", btn),
        sr: sr,
        marker: marker,
      };
    });
    applyZoomMode();
  }

  function clustered() {
    return mapReady && map.getZoom() < ZOOM_SPLIT;
  }

  function applyZoomMode() {
    if (!mapReady) return;
    const on = clustered();
    if (on === lastCluster) return;
    lastCluster = on;
    IDS.forEach(function (id) {
      if (COLS[id]) COLS[id].btn.style.display = on ? "none" : "";
    });
    CLUSTERS.forEach(function (c) {
      if (CLUST[c.id]) CLUST[c.id].btn.style.display = on ? "" : "none";
    });
    renderColumns();
  }

  function openCluster(c) {
    const f = frame();
    let worst = null;
    let wv = -1;
    c.members.forEach(function (id) {
      const v = f.values[id];
      if (v !== null && v !== undefined && v > wv) {
        wv = v;
        worst = id;
      }
    });
    if (worst) selectStation(worst);
    /* la cámara va al final: selectStation puede cambiar el padding del mapa */
    if (c.view) {
      state.view = c.view;
      $$(".seg-btn[data-view]").forEach(function (x) {
        x.classList.toggle("is-on", x.dataset.view === c.view);
      });
      applyView(true);
    } else {
      map.easeTo({ center: [c.lon, c.lat], zoom: 13.2, pitch: 55, duration: REDUCED ? 0 : 900 });
    }
  }

  function buildSourceMarkers() {
    DATA.sources.forEach(function (s) {
      if (s.lat === null || s.lat === undefined) return;
      const el = document.createElement("div");
      el.className = "src-marker";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML =
        '<span class="src-dot"></span><span class="src-label">' +
        esc(s.name) +
        (s.tonnes ? " · " + int(s.tonnes) + " t" : "") +
        "</span>";
      const m = new window.maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([s.lon, s.lat]);
      s._marker = m;
      SRC_MARKERS.push(m);
    });
  }

  function applyBase() {
    if (!mapReady) return;
    map.setLayoutProperty("sat", "visibility", state.base === "satelite" ? "visible" : "none");
    map.setLayoutProperty("osm", "visibility", state.base === "satelite" ? "none" : "visible");
  }

  function applyView(animated) {
    if (!mapReady) return;
    const v = VIEWS[state.view] || VIEWS.general;
    const narrow = window.innerWidth < 700;
    map.easeTo({
      center: [v.center[0] - (narrow ? 0.007 : 0), v.center[1]],
      zoom: v.zoom - (narrow ? 0.35 : 0),
      pitch: v.pitch,
      bearing: v.bearing,
      duration: REDUCED || animated === false ? 0 : 1200,
    });
  }

  function paintColumn(c, v, pol, scale, label, f) {
    if (v === null || v === undefined) {
      c.bar.style.height = "10px";
      c.bar.style.setProperty("--fill", FILL.sin);
      c.btn.classList.add("is-nodata");
      c.value.textContent = "—";
      c.sr.textContent = label + ": sin datos para " + pol.name + " en " + f.label;
      return;
    }
    const band = bandOf(state.pol, v);
    c.bar.style.height = Math.round(14 + 118 * clamp(v / scale, 0, 1)) + "px";
    c.bar.style.setProperty("--fill", FILL[band.id]);
    c.btn.classList.remove("is-nodata");
    c.value.textContent = num(v, v < 10 ? 1 : 0);
    c.sr.textContent = label + ": " + num(v, 1) + " " + pol.unit + " de " + pol.name + ", " + band.kid + ", " + f.kid;
  }

  function renderColumns() {
    if (!mapReady) return;
    const f = frame();
    const pol = P[state.pol];
    const scale = SCALE[state.pol] || 140;
    IDS.forEach(function (id) {
      const c = COLS[id];
      if (!c) return;
      const has = state.pol !== "metales" && id in f.values;
      paintColumn(c, has ? f.values[id] : null, pol, scale, ST[id].short, f);
      c.btn.classList.toggle("is-active", state.station === id);
    });
    CLUSTERS.forEach(function (cfg) {
      const c = CLUST[cfg.id];
      if (!c) return;
      let v = null;
      cfg.members.forEach(function (id) {
        const x = f.values[id];
        if (x !== null && x !== undefined && (v === null || x > v)) v = x;
      });
      if (state.pol === "metales") v = null;
      paintColumn(c, v, pol, scale, cfg.name, f);
      c.more.textContent = cfg.members.length > 1 ? cfg.members.length + " estaciones agrupadas" : "toca para acercar";
      c.btn.classList.toggle("is-active", cfg.members.indexOf(state.station) >= 0);
    });
    SRC_MARKERS.forEach(function (m) {
      if (state.sources && !m._added) {
        m.addTo(map);
        m._added = true;
      } else if (!state.sources && m._added) {
        m.remove();
        m._added = false;
      }
    });
  }

  function bandOf(polId, v) {
    const bands = BANDS[polId] || BANDS.mp10;
    for (let i = 0; i < bands.length; i++) if (v <= bands[i].max) return bands[i];
    return bands[bands.length - 1];
  }

  /* ============================================================
     LEYENDA
     ============================================================ */
  function renderLegend() {
    const box = $("#map-legend");
    const extra = $("#hint-extra");
    if (!box) return;
    if (state.pol === "metales") {
      box.innerHTML =
        '<p class="legend-title">Metales en el polvo · 38 colegios</p>' +
        '<div class="legend-scale"><div class="legend-row"><span class="legend-swatch" style="background:#7A4A35"></span>' +
        '<span class="legend-label">Zona del estudio</span><span class="legend-range">mg/kg</span></div></div>';
      if (extra) extra.textContent = " El estudio no es una serie en el tiempo: mira los números en Colegios.";
      fitPadding();
      return;
    }
    const pol = P[state.pol];
    const bands = BANDS[state.pol];
    const rows = bands
      .map(function (b, i) {
        const lo = i === 0 ? 0 : bands[i - 1].max;
        const hi = b.max === Infinity ? "más" : b.max;
        return (
          '<div class="legend-row"><span class="legend-swatch" style="background:' +
          FILL[b.id] +
          '"></span><span class="legend-label">' +
          esc(state.mode === "kid" ? b.kid : b.tech) +
          '</span><span class="legend-range">' +
          lo + "–" +
          hi +
          "</span></div>"
        );
      })
      .join("");
    box.innerHTML =
      '<p class="legend-title">' +
      esc(pol.name) +
      " · " +
      esc(pol.unit) + " · " + esc(fLabel()) + "</p>" +
      '<div class="legend-scale">' +
      rows +
      "</div>";
    if (extra)
      extra.textContent =
        " La altura de cada columna crece con la concentración hasta " + (SCALE[state.pol] || 140) + " " + pol.unit + "." +
        (clustered() ? " Con esta distancia, las estaciones de la ciudad se agrupan en una sola columna: acércala para verlas una por una." : "");
    fitPadding();
  }

  /* el mapa centra las columnas por encima del dock y de la leyenda */
  let lastPad = "";
  function currentPad() {
    const dock = $("#time-dock");
    const leg = $("#map-legend");
    const shell = $("#map-shell");
    const legInMap = leg && leg.closest(".map-shell") && !leg.hidden;
    const bottom = (dock ? dock.offsetHeight : 0) + (legInMap ? leg.offsetHeight + 8 : 0) + 22;
    const cardRoom = window.innerWidth > 900 && shell && shell.classList.contains("has-card");
    return { top: 58, bottom: bottom, left: 10, right: cardRoom ? 352 : 10 };
  }
  function padKey(p) {
    return [p.top, p.bottom, p.left, p.right].join("-");
  }
  function fitPadding(force) {
    if (!mapReady) return;
    const p = currentPad();
    const k = padKey(p);
    /* la leyenda y la ficha se anclan desde CSS al alto real del dock */
    const dock = $("#time-dock");
    document.documentElement.style.setProperty("--dock-h", (dock ? dock.offsetHeight : 0) + 12 + "px");
    if (!force && k === lastPad) return;
    lastPad = k;
    map.setPadding(p);
  }
  function fLabel() {
    return groupLabel() + " · " + frame().label;
  }

  /* ============================================================
     ESTADO DEL AIRE (cara + número)
     ============================================================ */
  function faceSvg(status) {
    const c = FILL[status] || FILL.sin;
    let mouth = '<path d="M18 34c3.6 3.4 8.4 3.4 12 0" stroke="#2b2118" stroke-width="3" fill="none" stroke-linecap="round"/>';
    if (status === "medio") mouth = '<path d="M18 34h12" stroke="#2b2118" stroke-width="3" fill="none" stroke-linecap="round"/>';
    if (status === "alto") mouth = '<path d="M18 36c3.6-3.4 8.4-3.4 12 0" stroke="#2b2118" stroke-width="3" fill="none" stroke-linecap="round"/>';
    if (status === "critico")
      mouth =
        '<path d="M17 37c4-4.4 9-4.4 14 0" stroke="#2b2118" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
        '<path d="M14 20l7 3M34 20l-7 3" stroke="#2b2118" stroke-width="2.6" stroke-linecap="round"/>';
    if (status === "sin") mouth = '<path d="M18 33h12" stroke="#6b5f52" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 3"/>';
    const eyes =
      status === "critico"
        ? '<path d="M17 26l6 5M23 26l-6 5M25 31l6-5M31 31l-6-5" stroke="#2b2118" stroke-width="2.6" stroke-linecap="round"/>'
        : '<circle cx="20" cy="26" r="2.6" fill="#2b2118"/><circle cx="28" cy="26" r="2.6" fill="#2b2118"/>';
    return (
      '<svg viewBox="0 0 48 48" role="img" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="21" fill="' +
      c +
      '"/><circle cx="24" cy="24" r="21" fill="none" stroke="rgba(23,19,16,.35)" stroke-width="2"/>' +
      eyes +
      mouth +
      "</svg>"
    );
  }

  function renderAirCheck() {
    const f = frame();
    const kicker = $("#air-check-kicker");
    const value = $("#air-check-value");
    const unit = $("#air-check-unit");
    const note = $("#air-check-note");
    const vs = $("#air-check-vs");
    const face = $("#air-face");
    const card = $("#air-check");
    if (!card) return;

    if (state.pol === "metales") {
      card.setAttribute("data-status", "sin");
      face.innerHTML = faceSvg("sin");
      kicker.textContent = state.mode === "kid" ? "Polvo en los colegios" : "Estudio de polvo en aulas";
      value.textContent = "38";
      unit.textContent = "colegios";
      note.textContent =
        state.mode === "kid"
          ? "En los 38 colegios encontraron polvo con metales dentro de las salas."
          : "Mediana de arsénico en polvo interior: 247 mg/kg, cerca de 10 veces el fondo del desierto.";
      vs.innerHTML =
        '<b>Chile no tiene norma para estos metales en el polvo.</b> <a href="#colegios">Ver el estudio ↗</a>';
      return;
    }

    const pol = P[state.pol];
    let id = state.station;
    if (!id || f.values[id] === null || f.values[id] === undefined || !(id in f.values)) {
      id = worstStation(f);
    }
    const v = id && id in f.values ? f.values[id] : null;
    if (v === null || v === undefined) {
      card.setAttribute("data-status", "sin");
      face.innerHTML = faceSvg("sin");
      kicker.textContent = "Sin datos en este instante";
      value.textContent = "—";
      unit.textContent = pol.unit;
      note.textContent =
        "Ninguna estación de la red publicó un valor para " + pol.name + " en " + f.kid + ".";
      vs.innerHTML = "Prueba con otro contaminante o mueve el tiempo.";
      return;
    }
    const band = bandOf(state.pol, v);
    card.setAttribute("data-status", band.id);
    face.innerHTML = faceSvg(band.id);
    kicker.textContent = (id === state.station ? ST[id].short : "La estación más cargada") + " · " + f.kid;
    value.textContent = num(v, v < 10 ? 1 : 0);
    unit.textContent = pol.unit;
    note.textContent =
      state.mode === "kid"
        ? band.kid + ". " + ST[id].name + " está en " + ST[id].zone.toLowerCase() + "."
        : band.tech + ". Estación " + ST[id].name + " (" + ST[id].zone + ").";
    const ratioWho = pol.who ? v / pol.who : null;
    const ratioNorm = pol.norm ? v / pol.norm : null;
    vs.innerHTML =
      state.mode === "kid"
        ? "El límite de la norma es <b>" +
          pol.norm +
          "</b> y la guía sana de la OMS es <b>" +
          pol.who +
          "</b>. Este valor es <b>" +
          num(v, 0) +
          "</b>."
        : "vs. norma anual <b>" +
          (ratioNorm === null ? "—" : num(ratioNorm * 100, 0) + "%") +
          "</b> (" +
          pol.norm +
          " " +
          pol.unit +
          ") · vs. guía OMS <b>" +
          (ratioWho === null ? "—" : num(ratioWho, 1) + "×") +
          "</b> (" +
          pol.who +
          " " +
          pol.unit +
          ")";
  }

  function worstStation(f) {
    let best = null;
    let bv = -1;
    Object.keys(f.values).forEach(function (id) {
      const v = f.values[id];
      if (v !== null && v !== undefined && v > bv) {
        bv = v;
        best = id;
      }
    });
    return best;
  }

  /* ============================================================
     GRÁFICO PULSO
     ============================================================ */
  function niceMax(v) {
    if (v <= 0) return 10;
    const p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    const n = v / p;
    const step = n <= 1.2 ? 1.5 : n <= 2 ? 2.5 : n <= 3 ? 3 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
    return step * p;
  }

  function renderPulse() {
    const box = $("#chart-pulse");
    if (!box) return;
    const pol = P[state.pol];
    if (state.pol === "metales") {
      box.innerHTML = metalChart();
      $("#pulse-kicker").textContent = "Metales · mg/kg";
      $("#pulse-title").textContent = "Dentro y fuera del aula";
      $("#pulse-sub").textContent = "Mediana en polvo acumulado, 38 colegios.";
      $("#pulse-source").textContent = "Fuente: Zanetta-Colombo et al., Environment International, 2026.";
      $("#chart-pulse-legend").innerHTML =
        '<span><i style="--c:#7A4A35"></i>interior</span><span><i style="--c:#C2B3A0"></i>exterior</span>';
      $("#table-pulse").innerHTML = metalTable();
      return;
    }
    const stations = stationsInFrame();
    const W = 820;
    const H = 320;
    const pad = { l: 46, r: 16, t: 16, b: 34 };
    let max = 0;
    FRAMES.forEach(function (f) {
      stations.forEach(function (s) {
        const v = f.values[s];
        if (v !== null && v !== undefined && v > max) max = v;
      });
    });
    [pol.norm, pol.who].forEach(function (t) {
      if (t && t <= (SCALE[state.pol] || 140) * 1.05 && t > max) max = t;
    });
    const top = niceMax(max * 1.12);
    const n = FRAMES.length;
    const x = (i) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
    const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);

    let g = "";
    range(5).forEach(function (i) {
      const v = (top * i) / 4;
      g +=
        '<line x1="' +
        pad.l +
        '" x2="' +
        (W - pad.r) +
        '" y1="' +
        y(v).toFixed(1) +
        '" y2="' +
        y(v).toFixed(1) +
        '" stroke="#e2d6c2" stroke-width="1"/>' +
        '<text x="' +
        (pad.l - 8) +
        '" y="' +
        (y(v) + 4).toFixed(1) +
        '" text-anchor="end" font-size="11" fill="#5f5346" font-family="IBM Plex Mono, monospace">' +
        num(v, v < 10 ? 1 : 0) +
        "</text>";
    });
    if (pol.norm && pol.norm <= top) {
      g +=
        '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(pol.norm).toFixed(1) + '" y2="' + y(pol.norm).toFixed(1) +
        '" stroke="#1a1512" stroke-width="2" stroke-dasharray="7 5"/>' +
        '<text x="' + (W - pad.r) + '" y="' + (y(pol.norm) - 7).toFixed(1) + '" text-anchor="end" font-size="11" font-weight="700" fill="#1a1512">norma ' + pol.norm + "</text>";
    }
    if (pol.who && pol.who <= top) {
      g +=
        '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(pol.who).toFixed(1) + '" y2="' + y(pol.who).toFixed(1) +
        '" stroke="#1f6b42" stroke-width="2" stroke-dasharray="3 4"/>' +
        '<text x="' + (W - pad.r) + '" y="' + (y(pol.who) + 15).toFixed(1) + '" text-anchor="end" font-size="11" fill="#1f6b42">OMS ' + pol.who + "</text>";
    }

    stations.forEach(function (s, si) {
      const ser = seriesOf(s);
      let d = "";
      let pen = false;
      ser.forEach(function (v, i) {
        if (v === null || v === undefined) {
          pen = false;
          return;
        }
        d += (pen ? " L" : " M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
        pen = true;
      });
      const col = state.station === s ? SERIES_COLORS[si % SERIES_COLORS.length] : SERIES_COLORS[si % SERIES_COLORS.length];
      g +=
        '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (state.station === s ? 4 : 2.4) +
        '" stroke-linejoin="round" stroke-linecap="round" opacity="' + (state.station && state.station !== s ? 0.45 : 1) + '"/>';
    });

    const cx = x(state.frame);
    g += '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '" stroke="#1a1512" stroke-width="1.5" opacity=".5"/>';
    const fv = frame().values;
    stations.forEach(function (s, si) {
      const v = fv[s];
      if (v === null || v === undefined) return;
      g += '<circle cx="' + x(state.frame).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="5" fill="' + SERIES_COLORS[si % SERIES_COLORS.length] + '" stroke="#fffbf4" stroke-width="2"/>';
    });

    let ticks = "";
    const step = n > 24 ? 5 : n > 12 ? 3 : n > 6 ? 2 : 1;
    FRAMES.forEach(function (f, i) {
      if (i % step === 0 || i === n - 1)
        ticks += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#5f5346" font-family="IBM Plex Mono, monospace">' + esc(tickLabel(f)) + "</text>";
    });

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      esc(pulseAria(stations)) +
      '">' +
      g +
      ticks +
      "</svg>";

    $("#chart-pulse-legend").innerHTML = stations
      .map(function (s, i) {
        return (
          '<span><i style="--c:' +
          SERIES_COLORS[i % SERIES_COLORS.length] +
          '"></i>' +
          esc(ST[s].short) +
          "</span>"
        );
      })
      .join("");

    $("#pulse-kicker").textContent = pol.name + " · " + modeWord();
    $("#pulse-title").textContent = pulseTitle();
    $("#pulse-sub").textContent = pulseSub();
    $("#pulse-source").textContent =
      "Fuente: SINCA, registros publicados de la red Calama (" +
      (state.tmode === "dia" ? "promedio por hora de " + groupLabel() : groupLabel()) +
      "). Consulta 22.10.2026.";
    $("#table-pulse").innerHTML = pulseTable(stations);
    makeTablesScrollable();
  }
  function tickLabel(f) {
    if (state.tmode === "dia") return f.key === "h0" || f.key === "h6" || f.key === "h12" || f.key === "h18" || f.key === "h23" ? f.label : "";
    if (state.tmode === "anio") return f.label.split(" ")[0];
    return f.label.split("-")[1];
  }
  function modeWord() {
    return state.tmode === "dia" ? "perfil horario" : state.tmode === "mes" ? "serie diaria" : "promedio mensual";
  }
  function pulseTitle() {
    if (state.tmode === "dia") return "La tarde carga el polvo, la madrugada lo baja";
    if (state.tmode === "mes") return "Cada día del mes, uno por uno";
    return "El año completo, mes a mes";
  }
  function pulseSub() {
    const pol = P[state.pol];
    if (state.tmode === "dia")
      return "Promedio de cada hora del día en " + groupLabel() + ", en " + pol.unit + ". La línea vertical marca el instante del mapa.";
    if (state.tmode === "mes") return "Valor diario de " + groupLabel() + ", en " + pol.unit + ".";
    return "Promedio mensual de " + yearFull() + ", en " + pol.unit + ".";
  }
  function pulseAria(stations) {
    const pol = P[state.pol];
    return (
      "Gráfico de líneas: " +
      pol.name +
      " en " +
      modeWord() +
      " para " +
      stations.length +
      " estaciones, con la norma de " +
      pol.norm +
      " y la guía OMS de " +
      pol.who +
      " marcadas."
    );
  }

  /* ---------- lectura del pulso ---------- */
  function renderPulseRead() {
    const box = $("#pulso-read");
    if (!box) return;
    if (state.pol === "metales") {
      box.innerHTML = [
        ["As", "247 mg/kg dentro del aula, frente a 250 fuera: el polvo entra y se queda."],
        ["Cu", "936 mg/kg de cobre en el polvo interior, 5–6 veces el fondo del desierto."],
        ["Pb", "Sin norma chilena para plomo en polvo interior, aunque sí la hay en aire."],
      ]
        .map(function (r) {
          return (
            '<div class="read-row"><span class="read-mark">' +
            r[0] +
            "</span><div><h3>" +
            r[1].split(",")[0] +
            "</h3><p>" +
            r[1] +
            "</p></div></div>"
          );
        })
        .join("");
      $("#pulse-notes").innerHTML = "";
      return;
    }
    const pol = P[state.pol];
    const stations = stationsInFrame();
    const stats = [];
    stations.forEach(function (s) {
      const ser = seriesOf(s).filter(function (v) {
        return v !== null && v !== undefined;
      });
      if (!ser.length) return;
      const mx = Math.max.apply(null, ser);
      const mn = Math.min.apply(null, ser);
      const avg = ser.reduce(function (a, b) { return a + b; }, 0) / ser.length;
      const over = ser.filter(function (v) { return v > pol.norm; }).length;
      stats.push({ s: s, mx: mx, mn: mn, avg: avg, over: over, n: ser.length });
    });
    if (!stats.length) {
      box.innerHTML = '<div class="read-row"><span class="read-mark">—</span><div><h3>Sin datos</h3><p>Esta capa no tiene serie para el marco temporal elegido.</p></div></div>';
      $("#pulse-notes").innerHTML = "";
      return;
    }
    const hottest = stats.slice().sort(function (a, b) { return b.avg - a.avg; })[0];
    const cleanest = stats.slice().sort(function (a, b) { return a.avg - b.avg; })[0];
    const peak = stats.slice().sort(function (a, b) { return b.mx - a.mx; })[0];
    const overAll = stats.reduce(function (a, b) { return a + b.over; }, 0);
    const nAll = stats.reduce(function (a, b) { return a + b.n; }, 0);

    box.innerHTML = [
      ["1", "La más cargada", "<b>" + num(hottest.avg, 1) + " " + pol.unit + "</b> de promedio en " + ST[hottest.s].name + "."],
      ["2", "La más limpia", "<b>" + num(cleanest.avg, 1) + " " + pol.unit + "</b> en " + ST[cleanest.s].name + ", casi la mitad."],
      ["3", "El pico", "<b>" + num(peak.mx, 0) + " " + pol.unit + "</b> fue el valor más alto, en " + ST[peak.s].short + "."],
      ["4", "Sobre la norma", "<b>" + overAll + "</b> de " + nAll + " marcos superan los " + pol.norm + " " + pol.unit + "."],
    ]
      .map(function (r) {
        return (
          '<div class="read-row"><span class="read-mark">' +
          r[0] +
          "</span><div><h3>" +
          r[1] +
          "</h3><p>" +
          r[2] +
          "</p></div></div>"
        );
      })
      .join("");

    const hourPeak = peakHourLabel();
    $("#pulse-notes").innerHTML = [
      [
        "El polvo tiene horario",
        hourPeak ||
          "En " +
            groupLabel() +
            " el valor más alto aparece en el marco " +
            frame().label +
            ". Cambia el mes y mira si el pico se mueve.",
      ],
      [
        "Norma y guía no son lo mismo",
        "La norma chilena de " + pol.name + " es " + pol.norm + " " + pol.unit + " y la guía de la OMS es " + pol.who +
          ". Casi toda la ciudad pasa de la guía de la OMS aunque cumpla la norma.",
      ],
      [
        "El desierto no es parejo",
        "Nueva Chiu Chiu, la estación rural al este, mide polvo todo el año: el problema no es solo del centro urbano.",
      ],
    ]
      .map(function (r) {
        return '<div class="pulse-note"><h3>' + esc(r[0]) + "</h3><p>" + esc(r[1]) + "</p></div>";
      })
      .join("");
  }

  function peakHourLabel() {
    if (state.tmode !== "dia" || state.pol === "metales") return null;
    const stations = stationsInFrame();
    let best = null;
    let bv = -1;
    FRAMES.forEach(function (f, i) {
      let sum = 0;
      let c = 0;
      stations.forEach(function (s) {
        const v = f.values[s];
        if (v !== null && v !== undefined) {
          sum += v;
          c++;
        }
      });
      if (c && sum / c > bv) {
        bv = sum / c;
        best = i;
      }
    });
    if (best === null) return null;
    const h = Math.floor(best / 2);
    const when = h < 6 ? "de la madrugada" : h < 12 ? "de la mañana" : h < 19 ? "de la tarde" : "de la noche";
    return (
      "En " +
      groupLabel() +
      " el promedio de la red es más alto a las " +
      pad(best) +
      ":00 (" +
      num(bv, 1) +
      " " +
      P[state.pol].unit +
      "), y más bajo a las " +
      pad(lowestHour()) +
      ":00. Es el pulso del viento en la cuenca."
    );
  }
  function lowestHour() {
    let bi = 0;
    let bv = Infinity;
    FRAMES.forEach(function (f, i) {
      const v = f.values[worstKey()] ;
      if (v !== null && v !== undefined && v < bv) {
        bv = v;
        bi = i;
      }
    });
    return bi;
  }
  function worstKey() {
    const st = stationsInFrame();
    return st[0] || IDS[0];
  }

  function pulseTable(stations) {
    let h =
      '<div class="data-table"><table><caption>' +
      esc(P[state.pol].name) +
      " · " +
      esc(modeWord()) +
      " · " +
      esc(groupLabel()) +
      ' (µg/m³)</caption><thead><tr><th scope="col">' +
      esc(state.tmode === "anio" ? "Mes" : state.tmode === "mes" ? "Día" : "Hora") +
      "</th>";
    stations.forEach(function (s) {
      h += '<th scope="col">' + esc(ST[s].short) + "</th>";
    });
    h += "</tr></thead><tbody>";
    FRAMES.forEach(function (f, i) {
      h += "<tr" + (i === state.frame ? ' aria-current="true"' : "") + "><th scope=\"row\">" + esc(f.label) + "</th>";
      stations.forEach(function (s) {
        const v = f.values[s];
        h += "<td>" + (v === null || v === undefined ? "—" : num(v, 1)) + "</td>";
      });
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  function metalChart() {
    const m = DATA.study.metals;
    const W = 820;
    const H = 320;
    const pad = { l: 46, r: 16, t: 16, b: 40 };
    const max = 1300;
    const bw = (W - pad.l - pad.r) / m.length;
    let g = "";
    range(5).forEach(function (i) {
      const v = (max * i) / 4;
      const y = H - pad.b - (v / max) * (H - pad.t - pad.b);
      g +=
        '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#e2d6c2"/>' +
        '<text x="' + (pad.l - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#5f5346">' + int(v) + "</text>";
    });
    m.forEach(function (metal, i) {
      const x0 = pad.l + i * bw + bw * 0.18;
      const w = bw * 0.26;
      const hi = H - pad.b - (metal.indoor / max) * (H - pad.t - pad.b);
      const ho = H - pad.b - (metal.outdoor / max) * (H - pad.t - pad.b);
      g +=
        '<rect x="' + x0.toFixed(1) + '" y="' + hi.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (H - pad.b - hi).toFixed(1) +
        '" rx="5" fill="' + metal.color + '"/>' +
        '<rect x="' + (x0 + w + 6).toFixed(1) + '" y="' + ho.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (H - pad.b - ho).toFixed(1) +
        '" rx="5" fill="#C2B3A0"/>' +
        '<text x="' + (x0 + w + 3).toFixed(1) + '" y="' + (H - 18) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#1a1512">' + esc(metal.symbol) + "</text>" +
        '<text x="' + (x0 + w + 3).toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle" font-size="11" fill="#5f5346">' + esc(metal.factor) + " vs. fondo</text>";
    });
    return (
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      esc("Barras de metales en polvo: arsénico 247 dentro y 250 fuera; cobre 936 y 1.199; plomo 161 y 192; molibdeno 12,9 y 15,5 mg/kg.") +
      '">' + g + "</svg>"
    );
  }
  function metalTable() {
    let h =
      '<div class="data-table"><table><caption>Mediana de metales en polvo (mg/kg), 38 colegios</caption><thead><tr><th scope="col">Metal</th><th scope="col">Interior</th><th scope="col">Exterior</th><th scope="col">vs. fondo</th></tr></thead><tbody>';
    DATA.study.metals.forEach(function (m) {
      h +=
        "<tr><th scope=\"row\">" + esc(m.name) + "</th><td>" + num(m.indoor, m.indoor < 100 ? 1 : 0) + "</td><td>" + num(m.outdoor, m.outdoor < 100 ? 1 : 0) + "</td><td>" + esc(m.factor) + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }

  /* ============================================================
     FICHA DE ESTACIÓN
     ============================================================ */
  function selectStation(id) {
    state.station = id;
    renderColumns();
    renderCard();
    renderAirCheck();
    renderPulse();
    renderFrameTable();
    syncUrl();
    if (id) {
      const shell = $("#map-shell");
      if (shell && !REDUCED) shell.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const c = $("#station-card");
      if (c) c.focus();
    }
  }

  function renderCard() {
    const card = $("#station-card");
    if (!card) return;
    const id = state.station;
    if (!id) {
      card.hidden = true;
      card.innerHTML = "";
      $("#map-shell").classList.remove("has-card");
      fitPadding();
      return;
    }
    const st = ST[id];
    const pol = P[state.pol];
    const f = frame();
    const v = f.values[id];
    const band = v === null || v === undefined ? { id: "sin", tech: "Sin dato en este instante", kid: "Sin dato" } : bandOf(state.pol, v);
    const ser = seriesOf(id);
    const vals = ser.filter(function (x) { return x !== null && x !== undefined; });
    const avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
    const mx = vals.length ? Math.max.apply(null, vals) : null;
    const over = vals.filter(function (x) { return x > pol.norm; }).length;

    card.innerHTML =
      '<div class="card-head"><div><h3>' +
      esc(st.name) +
      "</h3><p>" +
      esc(st.zone) +
      (st.emrp.length ? " · EMRP " + st.emrp.map(function (e) { return P[e].name; }).join(", ") : " · sin EMRP") +
      '</p></div><button class="card-close" type="button" aria-label="Cerrar la ficha de ' +
      esc(st.name) +
      '">✕</button></div>' +
      '<p class="card-metric"><strong>' +
      (v === null || v === undefined ? "—" : num(v, v < 10 ? 1 : 0)) +
      "</strong><span>" +
      esc(pol.unit) +
      "</span><em>" +
      esc(pol.name + " · " + f.label) +
      '</em></p>' +
      '<p class="card-status" data-status="' +
      band.id +
      '">' +
      esc(state.mode === "kid" ? band.kid : band.tech) +
      "</p>" +
      '<div class="card-rows">' +
      row("Promedio del periodo", avg === null ? "—" : num(avg, 1) + " " + pol.unit) +
      row("Máximo del periodo", mx === null ? "—" : num(mx, 0) + " " + pol.unit) +
      row("Marcos sobre la norma", vals.length ? over + " de " + vals.length : "—") +
      row("Norma / guía OMS", pol.norm + " / " + pol.who + " " + pol.unit) +
      "</div>" +
      '<div class="card-mini">' +
      sparkline(ser, pol) +
      "</div>" +
      '<p class="card-note">' +
      esc(st.note) +
      "</p>" +
      '<div class="card-links"><a href="' +
      esc(st.page) +
      '" target="_blank" rel="noopener">Ficha en SINCA <span aria-hidden="true">↗</span></a>' +
      '<button type="button" data-focus="' +
      esc(id) +
      '">Centrar la columna</button></div>';

    card.hidden = false;
    $("#map-shell").classList.add("has-card");
    fitPadding();
    $(".card-close", card).addEventListener("click", function () {
      selectStation(null);
    });
    $("[data-focus]", card).addEventListener("click", function () {
      map.easeTo({ center: [st.lon, st.lat], zoom: 13.4, pitch: 55, duration: REDUCED ? 0 : 900 });
    });
  }
  function row(k, v) {
    return '<p class="card-row"><span>' + esc(k) + "</span><b>" + esc(v) + "</b></p>";
  }
  function sparkline(ser, pol) {
    const W = 300;
    const H = 70;
    let max = 0;
    ser.forEach(function (v) {
      if (v !== null && v > max) max = v;
    });
    max = Math.max(max, pol.norm || 0) * 1.1 || 10;
    const n = ser.length;
    const x = (i) => (n <= 1 ? 0 : (i * W) / (n - 1));
    const y = (v) => H - (v / max) * H;
    let d = "";
    let pen = false;
    ser.forEach(function (v, i) {
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += (pen ? " L" : " M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
      pen = true;
    });
    const ny = y(pol.norm || 0);
    const cy = x(state.frame).toFixed(1);
    return (
      '<svg viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' +
      '<rect width="' + W + '" height="' + H + '" fill="#f6efe3" rx="8"/>' +
      (pol.norm ? '<line x1="0" x2="' + W + '" y1="' + ny.toFixed(1) + '" y2="' + ny.toFixed(1) + '" stroke="#1a1512" stroke-dasharray="5 4" stroke-width="1.5" opacity=".6"/>' : "") +
      '<path d="' + d + '" fill="none" stroke="#B4552F" stroke-width="2.5"/>' +
      '<line x1="' + cy + '" x2="' + cy + '" y1="0" y2="' + H + '" stroke="#1a1512" stroke-width="1.5" opacity=".45"/>' +
      "</svg>"
    );
  }

  /* ============================================================
     TABLAS
     ============================================================ */
  function renderFrameTable() {
    const box = $("#frame-table");
    if (!box) return;
    const pol = P[state.pol];
    if (state.pol === "metales") {
      box.innerHTML = metalTable();
      $("#table-note").textContent = "Estudio de polvo en aulas: no es una serie horaria.";
      return;
    }
    const stations = stationsInFrame();
    const f = frame();
    let h =
      '<div class="data-table"><table><caption>Instante ' +
      esc(f.label) +
      " · " +
      esc(groupLabel()) +
      " · " +
      esc(pol.name) +
      "</caption><thead><tr><th scope=\"col\">Estación</th><th scope=\"col\">Zona</th><th scope=\"col\">" +
      esc(pol.unit) +
      "</th><th scope=\"col\">% de la norma</th><th scope=\"col\">Situación</th></tr></thead><tbody>";
    stations.forEach(function (id) {
      const v = f.values[id];
      const band = v === null || v === undefined ? null : bandOf(state.pol, v);
      h +=
        '<tr><th scope="row">' +
        esc(ST[id].name) +
        "</th><td>" +
        esc(ST[id].zone) +
        "</td><td>" +
        (v === null || v === undefined ? "—" : num(v, 1)) +
        "</td><td>" +
        (v === null || v === undefined ? "—" : num((v / pol.norm) * 100, 0) + "%") +
        "</td><td>" +
        (band ? esc(band.tech) : "sin dato") +
        "</td></tr>";
    });
    box.innerHTML = h + "</tbody></table></div>";
    $("#table-note").textContent =
      pol.name + " · " + modeWord() + " · " + groupLabel() + " · instante " + f.label;
    makeTablesScrollable();
  }

  function renderStationTable() {
    const box = $("#station-table");
    if (!box) return;
    let h =
      '<div class="data-table"><table><caption>Red de monitoreo de Calama</caption><thead><tr><th scope="col">Estación</th><th scope="col">Zona</th><th scope="col">Latitud</th><th scope="col">Longitud</th><th scope="col">EMRP para</th><th scope="col">SINCA</th></tr></thead><tbody>';
    IDS.forEach(function (id) {
      const st = ST[id];
      h +=
        '<tr><th scope="row">' +
        esc(st.name) +
        "</th><td>" +
        esc(st.zone) +
        "</td><td>" +
        num(st.lat, 5) +
        "</td><td>" +
        num(st.lon, 5) +
        "</td><td>" +
        (st.emrp.length ? esc(st.emrp.map(function (e) { return P[e].name; }).join(", ")) : "—") +
        '</td><td><a href="' +
        esc(st.page) +
        '" target="_blank" rel="noopener">ver ↗</a></td></tr>';
    });
    box.innerHTML = h + "</tbody></table></div>";
    makeTablesScrollable();
  }

  /* ============================================================
     CHIPS / SELECTORES
     ============================================================ */
  function renderChips() {
    const box = $("#pollutant-chips");
    if (!box) return;
    box.innerHTML = POL_LIST.map(function (id) {
      const p = P[id];
      return (
        '<button type="button" class="p-chip' +
        (state.pol === id ? " is-on" : "") +
        '" data-pol="' +
        id +
        '" aria-pressed="' +
        (state.pol === id) +
        '"><span class="dot" style="--sw:' +
        p.color +
        '"></span>' +
        esc(p.name) +
        "<small>" +
        esc(POL_SUB[id]) +
        "</small></button>"
      );
    }).join("");
  }

  function renderGroupOptions() {
    const sel = $("#frame-group");
    const wrap = $("#group-wrap");
    const ywrap = $("#year-wrap");
    if (!sel) return;
    if (state.pol === "metales") {
      wrap.hidden = true;
      ywrap.hidden = true;
      return;
    }
    if (state.tmode === "dia") {
      wrap.hidden = false;
      ywrap.hidden = true;
      $("#frame-group-label").textContent = "Mes";
      sel.innerHTML = Object.keys(T.hourly[state.pol] || {})
        .map(function (m) {
          return '<option value="' + m + '"' + (state.group === m ? " selected" : "") + ">" + esc(T.hourlyMonths[m] || m) + "</option>";
        })
        .join("");
      if (!sel.value) state.group = Object.keys(T.hourly[state.pol])[0];
    } else if (state.tmode === "mes") {
      wrap.hidden = false;
      ywrap.hidden = false;
      $("#frame-group-label").textContent = "Mes";
      sel.innerHTML = MONTHS.map(function (m, i) {
        const has = dayIndices(state.year, String(i)).length > 0;
        return '<option value="' + i + '"' + (String(state.group) === String(i) ? " selected" : "") + (has ? "" : " disabled") + ">" + esc(m) + "</option>";
      }).join("");
    } else {
      wrap.hidden = true;
      ywrap.hidden = false;
    }
  }

  function renderFrameLabel() {
    const el = $("#frame-label");
    if (!el) return;
    const f = frame();
    el.textContent = state.tmode === "anio" ? f.label : f.label;
    const scrub = $("#scrubber");
    scrub.max = String(FRAMES.length - 1);
    scrub.value = String(state.frame);
    scrub.setAttribute("aria-valuetext", f.kid + " · " + f.label);
    scrub.style.setProperty("--fill", (FRAMES.length <= 1 ? 0 : (state.frame / (FRAMES.length - 1)) * 100).toFixed(1) + "%");
    const ticks = $("#scrub-ticks");
    if (ticks) {
      const marks = FRAMES.length <= 1 ? [] : [0, Math.round((FRAMES.length - 1) / 2), FRAMES.length - 1];
      ticks.innerHTML = marks
        .filter(function (v, i, a) { return a.indexOf(v) === i; })
        .map(function (i) {
          return "<span>" + esc(FRAMES[i] ? tickLabel(FRAMES[i]) || FRAMES[i].label : "") + "</span>";
        })
        .join("");
    }
    const play = $("#play-btn");
    $(".play-label", play).textContent =
      playing() ? "Pausar" : state.tmode === "dia" ? "Animar el día" : state.tmode === "mes" ? "Animar el mes" : "Animar el año";
    play.setAttribute("aria-pressed", playing() ? "true" : "false");
    $("svg path", play).setAttribute("d", playing() ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5.5v13l11-6.5z");
  }

  /* ============================================================
     ANIMACIÓN
     ============================================================ */
  function playing() {
    return timer !== null;
  }
  function startTimer() {
    stopTimer();
    if (state.pol === "metales") return;
    const ms = parseInt($("#speed").value, 10);
    timer = setInterval(function () {
      state.frame = (state.frame + 1) % FRAMES.length;
      onFrame();
    }, ms);
  }
  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function togglePlay() {
    if (playing()) {
      stopTimer();
    } else {
      startTimer();
    }
    renderFrameLabel();
    syncUrl();
  }

  function onFrame() {
    renderColumns();
    renderAirCheck();
    renderFrameLabel();
    renderLegend();
    renderPulse();
    renderFrameTable();
    if (state.station) renderCard();
  }

  /* ============================================================
     RENDER GLOBAL
     ============================================================ */
  function rebuild(animated) {
    buildFrames();
    renderGroupOptions();
    if (animated === false) stopTimer();
    onFrame();
    renderPulse();
    renderPulseRead();
    renderChips();
    syncUrl();
  }

  /* ============================================================
     CONTENIDO ESTÁTICO
     ============================================================ */
  function renderPollutantCards() {
    const box = $("#pollutant-cards");
    if (!box) return;
    const kidSay = {
      mp10: "Es el polvo que se ve en el mueble y en el patio. Es el problema más grande de Calama.",
      mp25: "Es tan chiquito que no lo ves: entra hondo al pulmón y puede pasar a la sangre.",
      so2: "Es un gas que viene de fundir cobre. En la ciudad hoy hay poco, pero hay que mirarlo.",
      metales: "Son pedacitos de metal en el polvo. Se quedan en las salas y preocupan en los niños.",
    };
    box.innerHTML = POL_LIST.map(function (id) {
      const p = P[id];
      const dark = id === "so2" || id === "metales";
      return (
        '<article class="pollutant-card" style="--accent:' +
        p.color +
        ";--accent-text:" +
        (id === "mp10" ? "#A4471F" : id === "mp25" ? "#8A5A10" : id === "so2" ? "#4A5260" : "#6B3D2A") +
        '">' +
        '<div class="pollutant-top"><span class="pollutant-code">' +
        esc(id === "metales" ? "As · Pb · Cu · Mo" : p.name) +
        '</span><span class="pollutant-size">' +
        esc(p.size) +
        "</span></div>" +
        "<h3>" +
        esc(id === "metales" ? "Metales en el polvo" : p.longName) +
        "</h3>" +
        '<p class="pollutant-where">' +
        esc(p.where) +
        "</p>" +
        '<p class="pollutant-kid kid">' +
        esc(kidSay[id]) +
        "</p>" +
        "<p>" +
        esc(p.origin + " " + p.health) +
        "</p>" +
        '<dl class="pollutant-facts">' +
        "<div><dt>" +
        (p.norm ? esc(p.normLabel) : "Norma") +
        "</dt><dd>" +
        (p.norm ? esc(p.norm + " " + p.unit) : "Sin límite") +
        "</dd></div>" +
        "<div><dt>" +
        esc(p.whoLabel) +
        "</dt><dd>" +
        (p.who ? esc(p.who + " " + p.unit) : "Sin guía") +
        "</dd></div>" +
        "<div><dt>Origen</dt><dd>" +
        esc(id === "metales" ? "Partículas mineras" : id === "so2" ? "Fundición" : "Minería y ciudad") +
        "</dd></div>" +
        "</dl>" +
        '<button class="card-link" type="button" data-layer="' +
        id +
        '">Ver ' +
        esc(p.name) +
        " en el mapa <span aria-hidden=\"true\">↗</span></button>" +
        "</article>"
      );
    }).join("");
  }

  function renderNormRows() {
    const box = $("#norm-rows");
    if (!box) return;
    const rows = [
      ["MP10", 15, 50, 130, "µg/m³", "anual / diaria"],
      ["MP2,5", 5, 20, 50, "µg/m³", "anual / diaria"],
      ["SO₂", 40, 150, null, "µg/m³", "diaria"],
    ];
    box.innerHTML = rows
      .map(function (r) {
        const max = 160;
        const w = (v) => (v / max) * 100;
        return (
          '<div class="norm-row"><span class="norm-row-name">' +
          r[0] +
          '</span><div class="norm-track">' +
          '<span class="norm-seg who" style="left:0;width:' +
          w(r[1]).toFixed(1) +
          '%"></span>' +
          '<span class="norm-seg gap" style="left:' +
          w(r[1]).toFixed(1) +
          "%;width:" +
          (w(r[2]) - w(r[1])).toFixed(1) +
          '%"></span>' +
          '<span class="norm-mark" style="left:' +
          w(r[1]).toFixed(1) +
          '%"></span>' +
          '<span class="norm-mark" style="left:' +
          w(r[2]).toFixed(1) +
          '%"></span>' +
          '<span class="norm-seg-label" style="left:6px">OMS ' +
          r[1] +
          "</span>" +
          '<span class="norm-seg-label" style="left:' +
          (w(r[2]) + 1).toFixed(1) +
          '%">' +
          "Chile " +
          r[2] +
          "</span>" +
          "</div></div>"
        );
      })
      .join("");
  }

  function renderMetals() {
    const box = $("#metal-grid");
    if (!box) return;
    box.innerHTML = DATA.study.metals
      .map(function (m) {
        return (
          '<article class="metal-card" style="--metal:' +
          m.color +
          ';--metal-text:' +
          (m.id === "as" ? "#F2B98C" : m.id === "cu" ? "#F0C98A" : m.id === "pb" ? "#A8B3C2" : "#9FD3B3") +
          ";--symbol-text:" +
          bestText(m.color) +
          '"><span class="metal-symbol">' +
          esc(m.symbol) +
          "</span><h3>" +
          esc(m.name) +
          '</h3><p class="metal-value">' +
          num(m.indoor, m.indoor < 100 ? 1 : 0) +
          "<span>mg/kg</span></p><p class=\"metal-sub\">mediana interior · " +
          num(m.outdoor, m.outdoor < 100 ? 1 : 0) +
          " exterior</p><p class=\"metal-factor\">" +
          esc(m.factor) +
          " el fondo del desierto</p></article>"
        );
      })
      .join("");
  }

  function renderSources() {
    const box = $("#source-list");
    if (!box) return;
    const max = Math.max.apply(
      null,
      DATA.sources.map(function (s) {
        return s.tonnes || 0;
      })
    );
    box.innerHTML = DATA.sources
      .map(function (s) {
        const pct = s.tonnes ? (s.tonnes / max) * 100 : 0;
        return (
          '<button type="button" class="source-row" data-src="' +
          esc(s.id) +
          '"><span><span class="source-name">' +
          esc(s.name) +
          '</span><br><span class="source-kind">' +
          esc(s.kind) +
          "</span></span>" +
          '<span class="source-tonnes">' +
          (s.tonnes ? int(s.tonnes) : "—") +
          "<small>t/año de MP10</small></span>" +
          '<span class="source-bar"><i style="width:' +
          pct.toFixed(1) +
          '%"></i></span></button>'
        );
      })
      .join("");
  }

  function renderTimeline() {
    const box = $("#timeline");
    if (!box) return;
    box.innerHTML = DATA.timeline
      .map(function (t) {
        return (
          "<li" +
          (t.year === "2023" || t.year === "2026" ? ' class="is-key"' : "") +
          '><span class="timeline-year">' +
          esc(t.year) +
          "</span><div><h3>" +
          esc(t.title) +
          "</h3><p>" +
          esc(t.text) +
          "</p></div></li>"
        );
      })
      .join("");
  }

  function renderActions() {
    const box = $("#action-grid");
    if (!box) return;
    const items = [
      {
        kid: { t: "Mira el aire antes de salir", d: "Si el mapa está naranja o rojo, juega en el patio techado o adentro." },
        tech: {
          t: "Mira antes de salir",
          d: "Revisa el estado del aire en SINCA antes de hacer ejercicio al aire libre. En días de mayor concentración, prefiere interiores y actividades de menor intensidad.",
        },
        link: ["SINCA Antofagasta ↗", "https://sinca.mma.gob.cl/index.php/region/index/id/II"],
      },
      {
        kid: { t: "Cuídate en los días con polvo", d: "Los niños, las personas mayores y quienes tienen asma lo pasan peor." },
        tech: {
          t: "Protege a quien más lo necesita",
          d: "Niños y niñas, personas mayores, embarazadas y personas con asma o EPOC son más sensibles. Ajusta la exposición y consulta a la autoridad sanitaria si hay síntomas.",
        },
      },
      {
        kid: { t: "Limpia con paño húmedo", d: "Barrer en seco levanta el polvo otra vez. El paño mojado lo atrapa." },
        tech: {
          t: "Reduce el polvo en casa",
          d: "Limpia con paño húmedo, evita barrer en seco y sella rendijas. No quemes basura ni restos de poda. Si puedes, usa filtración de partículas en los espacios donde pasas más tiempo.",
        },
      },
      {
        kid: { t: "Pregunta por tu sala", d: "¿Cómo limpian tu sala? ¿Las ventanas cierran bien? Pregunta en tu colegio." },
        tech: {
          t: "Pide monitoreo en colegios",
          d: "El estudio de 2026 mostró metales en el polvo interior. Pregunta si tu colegio tiene protocolos de limpieza, sellos y ventilación con filtración.",
        },
      },
      {
        kid: { t: "Cuéntale a alguien", d: "Mostrar este mapa a tu curso o a tu familia ya es hacer algo." },
        tech: {
          t: "Participa en el nuevo PDA",
          d: "El plan de descontaminación se está elaborando de nuevo. La participación ciudadana y los datos abiertos son parte de la solución.",
        },
        link: ["Seguir el proceso ↗", "https://ppda.mma.gob.cl/antofagasta/plan-para-la-ciudad-de-calama-y-su-area-circundante/"],
      },
    ];
    box.innerHTML = items
      .map(function (a, i) {
        return (
          '<article class="action-card"><span class="action-num">' +
          pad(i + 1) +
          '</span><h3 class="kid">' +
          esc(a.kid.t) +
          "</h3><h3 class=\"tech\">" +
          esc(a.tech.t) +
          "</h3>" +
          '<p class="kid">' +
          esc(a.kid.d) +
          "</p><p class=\"tech\">" +
          esc(a.tech.d) +
          "</p>" +
          (a.link ? '<a href="' + a.link[1] + '" target="_blank" rel="noopener">' + esc(a.link[0]) + "</a>" : "") +
          "</article>"
        );
      })
      .join("");
  }

  function renderCitations() {
    const box = $("#citation-list");
    if (!box) return;
    box.innerHTML = DATA.citations
      .map(function (c) {
        return (
          '<li><span><em>' +
          esc(c.label) +
          "</em> — " +
          esc(c.publisher) + ", " +
          esc(c.year) + '. <a href="' +
          esc(c.url) +
          '" target="_blank" rel="noopener">abrir ↗</a></span></li>'
        );
      })
      .join("");
  }

  /* ---------- gráficos de la sección evidencia ---------- */
  function renderTrend() {
    const box = $("#chart-trend");
    if (!box) return;
    const tr = DATA.trend;
    const W = 760;
    const H = 300;
    const pad = { l: 42, r: 14, t: 14, b: 30 };
    const top = 60;
    const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (tr.years.length - 1);
    const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
    let g = "";
    [0, 15, 50].concat([30]).forEach(function (v) {
      if (v > top) return;
      g += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="' + (v === 50 ? "#1a1512" : v === 15 ? "#1f6b42" : "#e2d6c2") + '" stroke-width="' + (v === 50 || v === 15 ? 2 : 1) + '" ' + (v === 50 || v === 15 ? 'stroke-dasharray="7 5"' : "") + "/>";
    });
    g +=
      '<text x="' + (W - pad.r) + '" y="' + (y(50) - 6).toFixed(1) + '" text-anchor="end" font-size="11" font-weight="700" fill="#1a1512">norma 50</text>' +
      '<text x="' + (W - pad.r) + '" y="' + (y(15) - 6).toFixed(1) + '" text-anchor="end" font-size="11" fill="#1f6b42">OMS 15</text>';
    tr.years.forEach(function (yr, i) {
      g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#5f5346">' + yr + "</text>";
    });
    const keys = Object.keys(tr.mp10);
    keys.forEach(function (k, si) {
      const d = tr.mp10[k].map(function (v, i) { return (i ? " L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join("");
      g += '<path d="' + d + '" fill="none" stroke="' + SERIES_COLORS[si] + '" stroke-width="3" stroke-linejoin="round"/>';
      tr.mp10[k].forEach(function (v, i) {
        g += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.6" fill="' + SERIES_COLORS[si] + '"/>';
      });
    });
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '">' + g + "</svg>";
    $("#chart-trend-legend").innerHTML = keys
      .map(function (k, i) {
        return '<span><i style="--c:' + SERIES_COLORS[i] + '"></i>' + esc(ST[k].short) + "</span>";
      })
      .join("");
    let h =
      '<div class="data-table"><table><caption>Promedio anual de MP10 por estación (µg/m³)</caption><thead><tr><th scope="col">Estación</th>';
    tr.years.forEach(function (yr) {
      h += '<th scope="col">' + yr + "</th>";
    });
    h += "</tr></thead><tbody>";
    keys.forEach(function (k) {
      h += '<tr><th scope="row">' + esc(ST[k].short) + "</th>";
      tr.mp10[k].forEach(function (v) {
        h += "<td>" + num(v, 1) + "</td>";
      });
      h += "</tr>";
    });
    $("#table-trend").innerHTML = h + "</tbody></table></div>";
  }

  function renderEmissions() {
    const box = $("#chart-emissions");
    if (!box) return;
    const rows = DATA.sources.filter(function (s) {
      return s.tonnes;
    });
    const W = 700;
    const H = 300;
    const pad = { l: 150, r: 60, t: 10, b: 10 };
    const max = Math.max.apply(null, rows.map(function (s) { return s.tonnes; }));
    const bh = (H - pad.t - pad.b) / rows.length;
    let g = "";
    rows.forEach(function (s, i) {
      const y0 = pad.t + i * bh + 6;
      const w = ((s.tonnes / max) * (W - pad.l - pad.r)).toFixed(1);
      g +=
        '<text x="' + (pad.l - 10) + '" y="' + (y0 + bh * 0.42).toFixed(1) + '" text-anchor="end" font-size="12" fill="#1a1512">' +
        esc(s.name) + "</text>" +
        '<rect x="' + pad.l + '" y="' + y0.toFixed(1) + '" width="' + w + '" height="' + (bh * 0.6).toFixed(1) + '" rx="6" fill="#B4552F"/>' +
        '<text x="' + (pad.l + +w + 8).toFixed(1) + '" y="' + (y0 + bh * 0.42).toFixed(1) + '" font-size="12" font-family="IBM Plex Mono, monospace" fill="#5f5346">' +
        int(s.tonnes) + "</text>";
    });
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '">' + g + "</svg>";
    let h =
      '<div class="data-table"><table><caption>Emisiones de MP10 por faena, inventario 2016 (t/año)</caption><thead><tr><th scope="col">Fuente</th><th scope="col">Tipo</th><th scope="col">t/año</th></tr></thead><tbody>';
    rows.forEach(function (s) {
      h += '<tr><th scope="row">' + esc(s.name) + "</th><td>" + esc(s.kind) + "</td><td>" + int(s.tonnes) + "</td></tr>";
    });
    $("#table-emissions").innerHTML = h + "</tbody></table></div>";
  }

  function renderPm25() {
    const box = $("#chart-pm25");
    if (!box) return;
    const per = P.mp25.periods.filter(function (p) { return p.id === "norma"; })[0];
    const ids = Object.keys(per.values);
    const W = 700;
    const H = 300;
    const pad = { l: 42, r: 14, t: 16, b: 34 };
    const top = 22;
    const bw = (W - pad.l - pad.r) / ids.length;
    const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
    let g = "";
    [5, 20].forEach(function (v) {
      g +=
        '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) +
        '" stroke="' + (v === 20 ? "#1a1512" : "#1f6b42") + '" stroke-width="2" stroke-dasharray="7 5"/>' +
        '<text x="' + (W - pad.r) + '" y="' + (y(v) - 6).toFixed(1) + '" text-anchor="end" font-size="11" font-weight="700" fill="' +
        (v === 20 ? "#1a1512" : "#1f6b42") + '">' + (v === 20 ? "norma 20" : "OMS 5") + "</text>";
    });
    ids.forEach(function (id, i) {
      const v = per.values[id];
      const x0 = pad.l + i * bw + bw * 0.22;
      g +=
        '<rect x="' + x0.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + (bw * 0.56).toFixed(1) + '" height="' + (H - pad.b - y(v)).toFixed(1) +
        '" rx="8" fill="#C58A2E"/>' +
        '<text x="' + (x0 + bw * 0.28).toFixed(1) + '" y="' + (y(v) - 8).toFixed(1) + '" text-anchor="middle" font-size="13" font-family="IBM Plex Mono, monospace" fill="#1a1512">' + v + "</text>" +
        '<text x="' + (x0 + bw * 0.28).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="12" fill="#5f5346">' + esc(ST[id].short) + "</text>";
    });
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '">' + g + "</svg>";
    let h =
      '<div class="data-table"><table><caption>MP2,5 promedio trianual 2022–2024 (µg/m³)</caption><thead><tr><th scope="col">Estación</th><th scope="col">Valor</th><th scope="col">vs. OMS 5</th></tr></thead><tbody>';
    ids.forEach(function (id) {
      const v = per.values[id];
      h += '<tr><th scope="row">' + esc(ST[id].name) + "</th><td>" + v + "</td><td>" + num(v / 5, 1) + "×</td></tr>";
    });
    $("#table-pm25").innerHTML = h + "</tbody></table></div>";
  }

  function renderSo2Strip() {
    const box = $("#so2-strip");
    if (!box) return;
    const per = P.so2.periods.filter(function (p) { return p.id === "2026"; })[0];
    const ids = Object.keys(per.values);
    box.innerHTML =
      ids
        .map(function (id) {
          const v = per.values[id];
          return (
            '<div class="so2-bar"><span>' +
            esc(ST[id].short) +
            '</span><span class="so2-track"><i class="so2-fill" style="width:' +
            ((v / 150) * 100).toFixed(1) +
            '%"></i></span><b>' +
            num(v, 1) +
            "</b></div>"
          );
        })
        .join("") +
      '<p class="so2-norm">La barra completa son 150 µg/m³, la norma diaria chilena. Ninguna estación urbana pasa de un 15%.</p>';
  }

  function renderInsightMini() {
    const box = $("#insight-mini");
    if (!box) return;
    const per = P.mp10.periods.filter(function (p) { return p.id === "norma"; })[0];
    const ids = Object.keys(per.values);
    const W = 300;
    const H = 120;
    const bw = W / ids.length;
    let g = "";
    ids.forEach(function (id, i) {
      const v = per.values[id];
      const h = (v / 60) * (H - 26);
      const over = v > 50;
      g +=
        '<rect x="' + (i * bw + 6).toFixed(1) + '" y="' + (H - 20 - h).toFixed(1) + '" width="' + (bw - 12).toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="6" fill="' + (over ? "#D2622F" : "#4E6B57") + '"/>' +
        '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H - 24 - h).toFixed(1) + '" text-anchor="middle" font-size="12" font-family="IBM Plex Mono, monospace" fill="#f6efe3">' + v + "</text>" +
        '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle" font-size="10.5" fill="#c9b8a2">' + esc(ST[id].short) + "</text>";
    });
    g += '<line x1="0" x2="' + W + '" y1="' + (H - 20 - (50 / 60) * (H - 26)).toFixed(1) + '" y2="' + (H - 20 - (50 / 60) * (H - 26)).toFixed(1) + '" stroke="#f6efe3" stroke-dasharray="5 4" stroke-width="1.5"/>';
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' + g + "</svg>";
  }

  /* ============================================================
     QUIZ
     ============================================================ */
  const QUIZ = [
    {
      q: { kid: "¿Qué contaminante tiene a Calama con problemas hace años?", tech: "¿Cuál es el contaminante que declaró a Calama como zona saturada en 2009?" },
      opts: [
        { t: "El MP10 (polvo respirable)", ok: true },
        { t: "El SO₂ (dióxido de azufre)", ok: false },
        { t: "El ozono de verano", ok: false },
      ],
      why: {
        kid: "El MP10 es el polvo finito del desierto y de la minería. El D.S. 57/2009 declaró zona saturada a Calama por MP10.",
        tech: "El D.S. 57/2009 declaró zona saturada por MP10. El SO₂ urbano está hoy muy por debajo de su norma diaria.",
      },
    },
    {
      q: { kid: "En el gráfico del día, ¿a qué hora sube más el polvo?", tech: "En el perfil horario de MP10, ¿en qué franja aparece el máximo de la red?" },
      opts: [
        { t: "A primera hora de la mañana", ok: false },
        { t: "En la tarde y entrada la noche", ok: true },
        { t: "A medianoche", ok: false },
      ],
      why: {
        kid: "Mira la línea: sube en la tarde y baja de madrugada. El viento de la cuenca hace ese trabajo.",
        tech: "El promedio horario de la red alcanza su máximo entre las 18:00 y las 21:00 y su mínimo entre las 04:00 y las 06:00, coherente con la circulación anabática/catabática del valle.",
      },
    },
    {
      q: { kid: "¿De dónde viene casi todo el polvo que se emite por el aire?", tech: "Según el inventario de emisiones del plan (base 2016), ¿qué fuente aporta cerca del 98% del MP10 emitido?" },
      opts: [
        { t: "Los autos y micros", ok: false },
        { t: "Las faenas mineras", ok: true },
        { t: "Las estufas a leña", ok: false },
      ],
      why: {
        kid: "El inventario dice que la minería emite el 98% del MP10 de la zona. La ciudad aporta el resto.",
        tech: "El D.S. 5/2022 consigna 33.942 t/año de MP10 en las cuatro faenas del área del plan, el 98% del total inventariado.",
      },
    },
    {
      q: { kid: "La norma de Chile para el polvo fino (MP2,5) es 20. La guía sana de la OMS es 5. ¿Cuál es más estricta?", tech: "Si el promedio anual de MP2,5 es 11 µg/m³, ¿cómo se evalúa contra la norma chilena (20) y la guía anual de la OMS (5)?" },
      opts: [
        { t: "Cumple la norma chilena, pero pasa la guía de la OMS", ok: true },
        { t: "Cumple las dos, no hay problema", ok: false },
        { t: "No cumple ninguna de las dos", ok: false },
      ],
      why: {
        kid: "Un número más chico es más estricto. La OMS dice 5 y Chile dice 20.",
        tech: "11 µg/m³ está bajo la norma chilena de 20 y más del doble sobre la guía anual de la OMS (5). Es el patrón de las cuatro estaciones urbanas en 2022–2024.",
      },
    },
  ];
  let qIndex = 0;
  let qScore = 0;
  let qAnswered = false;

  function renderQuiz() {
    const box = $("#quiz");
    if (!box) return;
    if (qIndex >= QUIZ.length) return renderQuizScore();
    const q = QUIZ[qIndex];
    box.innerHTML =
      '<div class="quiz-card"><div class="quiz-progress"><span>Pregunta ' +
      (qIndex + 1) +
      " de " +
      QUIZ.length +
      '</span><span class="quiz-steps">' +
      QUIZ.map(function (_, i) {
        return '<span class="quiz-step' + (i < qIndex ? " is-done" : i === qIndex ? " is-now" : "") + '"></span>';
      }).join("") +
      '</span></div><h3 class="quiz-q"><span class="kid">' +
      esc(q.q.kid) +
      '</span><span class="tech">' +
      esc(q.q.tech) +
      "</span></h3>" +
      '<div class="quiz-opts" role="group" aria-label="Respuestas">' +
      q.opts
        .map(function (o, i) {
          return (
            '<button type="button" class="quiz-opt" data-i="' +
            i +
            '"><span class="opt-mark">' +
            "ABC"[i] +
            "</span><span>" +
            esc(o.t) +
            '</span><span class="opt-icon" aria-hidden="true"></span></button>'
          );
        })
        .join("") +
      "</div>" +
      '<div class="quiz-feedback" id="quiz-feedback" hidden></div>' +
      '<div class="quiz-nav"><button type="button" class="btn btn-dark" id="quiz-next" hidden>Siguiente pregunta <span aria-hidden="true">→</span></button>' +
      '<button type="button" class="btn btn-ghost" id="quiz-restart">Empezar de nuevo</button></div></div>';

    $$(".quiz-opt", box).forEach(function (b) {
      b.addEventListener("click", function () {
        answer(parseInt(b.dataset.i, 10));
      });
    });
    $("#quiz-restart").addEventListener("click", function () {
      qIndex = 0;
      qScore = 0;
      renderQuiz();
    });
  }

  function answer(i) {
    if (qAnswered) return;
    qAnswered = true;
    const q = QUIZ[qIndex];
    const opts = $$(".quiz-opt");
    opts.forEach(function (b, bi) {
      b.disabled = true;
      if (q.opts[bi].ok) {
        b.classList.add("is-right");
        $(".opt-icon", b).textContent = "✓";
      } else if (bi === i) {
        b.classList.add("is-wrong");
        $(".opt-icon", b).textContent = "✕";
      }
    });
    const ok = q.opts[i].ok;
    if (ok) qScore++;
    const fb = $("#quiz-feedback");
    fb.hidden = false;
    fb.setAttribute("data-ok", ok ? "yes" : "no");
    fb.innerHTML =
      "<strong>" +
      (ok ? "¡Correcto!" : "Casi. La respuesta buena es otra.") +
      "</strong><p>" +
      esc(state.mode === "kid" ? q.why.kid : q.why.tech) +
      "</p>";
    const next = $("#quiz-next");
    next.hidden = false;
    next.textContent = qIndex === QUIZ.length - 1 ? "Ver mi resultado" : "Siguiente pregunta →";
    next.addEventListener("click", function () {
      qAnswered = false;
      qIndex++;
      renderQuiz();
    });
    next.focus();
  }

  function renderQuizScore() {
    const box = $("#quiz");
    const msg =
      qScore === QUIZ.length
        ? "Perfecto: ya puedes explicarle a tu curso por qué el aire de Calama tiene polvo de más."
        : qScore >= 2
        ? "Muy bien. Vuelve al mapa, mueve el tiempo y comprueba cada respuesta con tus ojos."
        : "Repasa el mapa y la sección de evidencia: ahí están todas las respuestas.";
    box.innerHTML =
      '<div class="quiz-score"><strong>' +
      qScore +
      "/" +
      QUIZ.length +
      "</strong><p>" +
      esc(msg) +
      '</p><button type="button" class="btn btn-light" id="quiz-again">Jugar otra vez</button></div>';
    $("#quiz-again").addEventListener("click", function () {
      qIndex = 0;
      qScore = 0;
      qAnswered = false;
      renderQuiz();
    });
  }

  /* las tablas con scroll horizontal deben poder recorrerse con teclado */
  function makeTablesScrollable() {
    $$(".data-table").forEach(function (d) {
      if (d.getAttribute("tabindex") === "0") return;
      d.setAttribute("tabindex", "0");
      d.setAttribute("role", "region");
      d.setAttribute("aria-label", "Tabla con desplazamiento horizontal");
    });
  }

  /* ============================================================
     CSV
     ============================================================ */
  function csvDownload() {
    const pol = P[state.pol];
    const stations = stationsInFrame();
    const rows = [["contaminante", "modo", "grupo", "anio", "marco", "estacion", "zona", "valor", "unidad"]];
    FRAMES.forEach(function (f) {
      stations.forEach(function (s) {
        const v = f.values[s];
        rows.push([
          pol.name,
          state.tmode,
          groupLabel(),
          state.tmode === "dia" ? "2025" : yearFull(),
          f.label,
          ST[s].name,
          ST[s].zone,
          v === null || v === undefined ? "" : String(v).replace(".", ","),
          pol.unit,
        ]);
      });
    });
    const csv = rows
      .map(function (r) {
        return r
          .map(function (c) {
            return '"' + String(c).replace(/"/g, '""') + '"';
          })
          .join(";");
      })
      .join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const slug = (state.pol + "-" + state.tmode + "-" + groupLabel())
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .toLowerCase();
    a.href = URL.createObjectURL(blob);
    a.download = "calama-" + slug + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  /* ============================================================
     MODO / EVENTOS
     ============================================================ */
  function setMode(m) {
    state.mode = m;
    document.body.setAttribute("data-mode", m);
    $$(".mode-btn").forEach(function (b) {
      const on = b.dataset.mode === m;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderLegend();
    renderAirCheck();
    renderCard();
    syncUrl();
  }

  /* en pantallas chicas la leyenda vive debajo del mapa: gana altura útil */
  function relocateLegend() {
    const leg = $("#map-legend");
    const row = $(".picker-row");
    if (!leg || !row) return;
    if (window.innerWidth <= 760 && leg.closest(".map-shell")) {
      document.querySelector(".hero").insertBefore(leg, row);
      leg.classList.add("legend-below");
    }
  }

  function bind() {
    $$(".mode-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        setMode(b.dataset.mode);
      });
    });
    $$(".seg-btn[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.dataset.view;
        $$(".seg-btn[data-view]").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        applyView(true);
      });
    });
    $$(".seg-btn[data-base]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.base = b.dataset.base;
        $$(".seg-btn[data-base]").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        applyBase();
        syncUrl();
      });
    });
    $$(".seg-btn[data-tmode]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.tmode = b.dataset.tmode;
        $$(".seg-btn[data-tmode]").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        if (state.tmode === "dia") {
          state.group = Object.keys(T.hourly[state.pol] || {})[0] || "enero";
          state.frame = 18;
        } else {
          state.group = "9";
          state.frame = Math.min(state.frame, state.tmode === "mes" ? 30 : 9);
        }
        stopTimer();
        rebuild();
      });
    });
    $("#frame-group").addEventListener("change", function (e) {
      state.group = e.target.value;
      state.frame = 0;
      stopTimer();
      rebuild();
    });
    $("#frame-year").addEventListener("change", function (e) {
      state.year = e.target.value;
      stopTimer();
      rebuild();
    });
    $("#speed").addEventListener("change", function () {
      if (playing()) startTimer();
    });
    $("#scrubber").addEventListener("input", function (e) {
      state.frame = parseInt(e.target.value, 10);
      stopTimer();
      onFrame();
      syncUrl();
    });
    $("#play-btn").addEventListener("click", togglePlay);
    $("#sources-toggle").addEventListener("click", function () {
      state.sources = !state.sources;
      $("#sources-toggle").setAttribute("aria-pressed", state.sources ? "true" : "false");
      $("#sources-toggle").textContent = state.sources ? "Ocultar fuentes de polvo" : "Mostrar fuentes de polvo";
      renderColumns();
      syncUrl();
    });
    $("#show-sources").addEventListener("click", function () {
      state.sources = true;
      $("#sources-toggle").setAttribute("aria-pressed", "true");
      $("#sources-toggle").textContent = "Ocultar fuentes de polvo";
      state.view = "general";
      $$(".seg-btn[data-view]").forEach(function (x) { x.classList.toggle("is-on", x.dataset.view === "general"); });
      renderColumns();
      applyView(true);
      $("#mapa").scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
    });
    $("#csv-btn").addEventListener("click", csvDownload);
    $("#pollutant-chips").addEventListener("click", function (e) {
      const b = e.target.closest("[data-pol]");
      if (b) setPollutant(b.dataset.pol);
    });
    document.addEventListener("click", function (e) {
      const b = e.target.closest("[data-layer]");
      if (!b) return;
      setPollutant(b.dataset.layer);
      $("#mapa").scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
    });
    $$(".source-row").forEach(function (b) {
      b.addEventListener("click", function () {
        const s = DATA.sources.filter(function (x) { return x.id === b.dataset.src; })[0];
        if (!s || s.lat === null) return;
        state.sources = true;
        $("#sources-toggle").setAttribute("aria-pressed", "true");
        renderColumns();
        map.easeTo({ center: [s.lon, s.lat], zoom: 12.2, pitch: 55, duration: REDUCED ? 0 : 900 });
        $("#mapa").scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.station) selectStation(null);
      if (e.key === " " && e.target === $("#map")) {
        e.preventDefault();
        togglePlay();
      }
    });
    window.addEventListener("resize", function () {
      if (!mapReady) return;
      renderPulse();
      fitPadding();
    });
  }

  function setPollutant(id) {
    if (state.pol === id) return;
    state.pol = id;
    stopTimer();
    if (id === "metales") {
      state.frame = 0;
    } else if (state.tmode === "dia") {
      state.group = Object.keys(T.hourly[id] || {})[0] || "enero";
    }
    if (!ST[state.station] || (id !== "metales" && !(state.station in frame().values))) state.station = null;
    rebuild();
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  function init() {
    readUrl();
    document.body.setAttribute("data-mode", state.mode);
    $$(".mode-btn").forEach(function (b) {
      const on = b.dataset.mode === state.mode;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (state.tmode === "anio") state.frame = Math.min(state.frame, 9);
    if (window.innerWidth < 700 && !new URLSearchParams(location.search).has("vista")) {
      state.view = "ciudad";
      $$(".seg-btn[data-view]").forEach(function (x) { x.classList.toggle("is-on", x.dataset.view === "ciudad"); });
    }
    buildFrames();
    renderChips();
    renderGroupOptions();
    renderPollutantCards();
    renderNormRows();
    renderMetals();
    renderSources();
    renderTimeline();
    renderActions();
    renderCitations();
    renderTrend();
    renderEmissions();
    renderPm25();
    renderSo2Strip();
    renderInsightMini();
    renderQuiz();
    renderStationTable();
    makeTablesScrollable();
    relocateLegend();
    initMap();
    bind();
    if (state.sources) {
      $("#sources-toggle").setAttribute("aria-pressed", "true");
      $("#sources-toggle").textContent = "Ocultar fuentes de polvo";
    }
    $$(".seg-btn[data-base]").forEach(function (x) { x.classList.toggle("is-on", x.dataset.base === state.base); });
    $$(".seg-btn[data-view]").forEach(function (x) { x.classList.toggle("is-on", x.dataset.view === state.view); });
    onFrame();
    renderPulse();
    renderPulseRead();
    renderLegend();
    if (state.station) {
      selectStation(state.station);
      setTimeout(function () {
        const shell = $("#map-shell");
        if (shell) shell.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
      }, 700);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
