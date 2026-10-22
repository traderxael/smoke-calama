from pathlib import Path

p = Path('web/app.js')
t = p.read_text(encoding='utf-8')


def rep(old, new, count=1):
    global t
    n = t.count(old)
    assert n == count, f'{old[:80]!r}: expected {count}, got {n}'
    t = t.replace(old, new)


rep('''  function applyUrlState() {''', '''  const REDUCED_MOTION =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function applyUrlState() {''', 1)

rep('''      zoomSnap: 0.25,
      zoomDelta: 0.5
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);''', '''      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomAnimation: !REDUCED_MOTION,
      fadeAnimation: !REDUCED_MOTION,
      markerZoomAnimation: !REDUCED_MOTION
    });

    L.control.zoom({
      position: "bottomright",
      zoomInTitle: "Acercar",
      zoomOutTitle: "Alejar"
    }).addTo(map);''', 1)

rep('''    map.fitBounds(pts, { padding: [38, 38], maxZoom: 13.5, animate: true, duration: 0.7 });''', '''    map.fitBounds(pts, {
      padding: [38, 38],
      maxZoom: 13.5,
      animate: !REDUCED_MOTION,
      duration: REDUCED_MOTION ? 0 : 0.7
    });''', 1)

rep('''    map.flyToBounds(b, { padding: [24, 24], duration: 1.1 });''', '''    map.flyToBounds(b, {
      padding: [24, 24],
      animate: !REDUCED_MOTION,
      duration: REDUCED_MOTION ? 0 : 1.1
    });''', 1)

rep('''        map.flyTo([st.lat, st.lon], Math.max(map.getZoom(), 12.5), { duration: 0.8 });''', '''        map.flyTo([st.lat, st.lon], Math.max(map.getZoom(), 12.5), {
          animate: !REDUCED_MOTION,
          duration: REDUCED_MOTION ? 0 : 0.8
        });''', 1)

rep('''          `<button type="button" data-period="${esc(x.id)}" aria-pressed="${x.id === state.period}">${esc(
            x.label
          )}<span class="tag">${esc(x.tag)}</span></button>`''', '''          `<button type="button" data-period="${esc(x.id)}" aria-pressed="${x.id === state.period}" aria-label="${esc(
            x.label + " · " + x.tag
          )}">${esc(x.label)}<span class="tag">${esc(x.tag)}</span></button>`''', 1)

rep('''      wrap.innerHTML = `<button class="station-row" type="button" data-station="study">''', '''      wrap.innerHTML = `<button class="station-row" type="button" data-station="study" aria-label="Estudio de polvo en 38 colegios, Environment International 2026">''', 1)

rep('''        const pct = Math.min(100, (value / (p.norm * 1.25)) * 100);
        return `<button class="station-row ${state.station === id ? "is-active" : ""}" type="button" data-station="${id}">''', '''        const pct = Math.min(100, (value / (p.norm * 1.25)) * 100);
        const pctNorm = pctOf(value, p.norm);
        return `<button class="station-row ${state.station === id ? "is-active" : ""}" type="button" data-station="${id}" aria-label="${esc(
          `${st.name}: ${num(value)} ${p.unit}, ${STATUS[status].label}, ${pctNorm}% de la norma`
        )}">''', 1)

rep('''      marker.on("click", () => selectStation(id));
      marker.addTo(stationLayer);
    });''', '''      marker.on("click", () => selectStation(id));
      marker.addTo(stationLayer);
      const markerEl = marker.getElement();
      if (markerEl) {
        markerEl.setAttribute(
          "aria-label",
          `${st.name}: ${num(value)} ${p.unit}, ${meta.label}`
        );
      }
    });''', 1)

rep('''      marker.addTo(sourceLayer);
    });
    sourceLayer.addTo(map);''', '''      marker.addTo(sourceLayer);
      const sourceEl = marker.getElement();
      if (sourceEl) {
        sourceEl.setAttribute(
          "aria-label",
          `${s.name}, ${s.kind}${s.tonnes ? `, ${int(s.tonnes)} toneladas al año de MP10` : ""}`
        );
      }
    });
    sourceLayer.addTo(map);''', 1)

rep('''      L.marker([DATA.meta.lat, DATA.meta.lon], {
        interactive: true,
        icon: L.divIcon({
          className: "",
          html: '<div class="study-label"><strong>38 colegios</strong><span>estudio de polvo · 2026</span></div>',
          iconSize: [150, 42],
          iconAnchor: [75, 21]
        })
      })
        .on("click", () => {
          state.station = "study";
          renderAll();
        })
        .addTo(studyLayer);
      studyLayer.addTo(map);''', '''      const studyMarker = L.marker([DATA.meta.lat, DATA.meta.lon], {
        interactive: true,
        icon: L.divIcon({
          className: "",
          html: '<div class="study-label"><strong>38 colegios</strong><span>estudio de polvo · 2026</span></div>',
          iconSize: [150, 42],
          iconAnchor: [75, 21]
        })
      });
      studyMarker.on("click", () => {
        state.station = "study";
        renderAll();
      });
      studyMarker.addTo(studyLayer);
      const studyEl = studyMarker.getElement();
      if (studyEl) studyEl.setAttribute("aria-label", "Estudio de polvo en 38 colegios, 2026");
      studyLayer.addTo(map);''', 1)

rep('''    const card = $("#station-card");
    if (!state.station) {
      card.hidden = true;
      return;
    }
    card.hidden = false;''', '''    const card = $("#station-card");
    if (!state.station) {
      card.hidden = true;
      return;
    }
    const wasHidden = card.hidden;
    card.hidden = false;''', 1)

rep('''      <div class="card-links">
        <a class="card-link" href="${esc(st.page)}" target="_blank" rel="noopener">Ficha SINCA ↗</a>
        <button class="card-link" type="button" data-fit>Centrar ciudad</button>
        <span class="card-source">${esc(per.validated ? "SMA" : "SINCA")}</span>
      </div>`;

    const chartEl = $("#card-chart");
    requestAnimationFrame(() => drawCardChart(chartEl, st, per));''', '''      <div class="card-links">
        <a class="card-link" href="${esc(st.page)}" target="_blank" rel="noopener">Ficha SINCA ↗</a>
        <button class="card-link" type="button" data-fit>Centrar ciudad</button>
        <span class="card-source">${esc(per.validated ? "SMA" : "SINCA")}</span>
      </div>`;

    const chartEl = $("#card-chart");
    requestAnimationFrame(() => drawCardChart(chartEl, st, per));
    if (wasHidden) requestAnimationFrame(() => card.focus({ preventScroll: true }));''', 1)

rep('''  function closeCard() {
    state.station = null;
    renderMap();
    renderStationList();
    renderCard();
    syncUrl();
  }''', '''  function closeCard() {
    const previous = state.station;
    state.station = null;
    renderMap();
    renderStationList();
    renderCard();
    syncUrl();
    const target = previous ? $(`#station-list [data-station="${previous}"]`) : null;
    (target || $("#map-insight")).focus({ preventScroll: true });
  }''', 1)

rep('''    $("#csv-button").addEventListener("click", csvDownload);''', '''    $("#csv-button").addEventListener("click", csvDownload);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.station) closeCard();
    });''', 1)

rep('#766B5D', '#655A4C', 9)
rep('fill: "#B4552F" });', 'fill: "#9A4523" });', 1)
rep('fill: t === 20 ? "#17130F" : "#B4552F" });', 'fill: t === 20 ? "#17130F" : "#9A4523" });', 1)
rep('''      "font-size": 9,
      "font-weight": 600,
      fill: color
    });''', '''      "font-size": 9,
      "font-weight": 600,
      fill: "#17130F"
    });''', 1)

p.write_text(t, encoding='utf-8')
print('js patched')

h = Path('web/index.html')
s = h.read_text(encoding='utf-8')
old = '<aside class="station-card" id="station-card" hidden aria-live="polite"></aside>'
new = '<aside class="station-card" id="station-card" hidden aria-live="polite" aria-label="Ficha de la estación" tabindex="-1"></aside>'
assert s.count(old) == 1
s = s.replace(old, new)
h.write_text(s, encoding='utf-8')
print('html card patched')
