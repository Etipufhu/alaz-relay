/* global maplibregl */
// Map, fire layers and area-of-interest drawing tools.
import { cellsInBBox, MONTHS } from "./data.js";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const MERC_LAT = 85.0511;
const CELL_ZOOM = 4.5; // from this zoom on, real 0.1° fire cells replace the overview picture

// colour ramp shared by the cells layer and the map legend (inferno-like, matches the calendar)
// the zoomed-out overview picture uses the warm ramp written by export_web.py
const OV_RAMP = ["rgba(120,10,30,.6)", "#dc3c14", "#ffaa28", "#fff0a0"];
const RAMP = [
  [0, "#3b0f70"], [0.15, "#8c2981"], [0.4, "#de4968"], [0.7, "#fe9f6d"], [1, "#fcfdbf"],
];

/** Brighten CARTO dark-matter so land, water, borders and place names are readable. */
function brighten(map) {
  const set = (id, prop, v) => { if (map.getLayer(id)) try { map.setPaintProperty(id, prop, v); } catch { /* layer without prop */ } };
  set("background", "background-color", "#1d2026");
  for (const id of ["landcover", "park_national_park", "park_nature_reserve", "landuse"]) set(id, "fill-color", "#22262d");
  set("landuse_residential", "fill-color", "rgba(255,255,255,0.03)");
  set("water", "fill-color", "#0c1520");
  set("waterway", "line-color", "#1a2a3a");
  set("boundary_country_inner", "line-color", "#7a808c");
  set("boundary_country_outline", "line-color", "#3a404a");
  set("boundary_state", "line-color", "#4a505c");
  for (const l of map.getStyle().layers) {
    if (l.type === "line" && /^(road|bridge|tunnel)_.*fill/.test(l.id)) set(l.id, "line-color", "#3a3f49");
    if (l.type === "symbol") {
      set(l.id, "text-color", /water|ocean|sea|lake/.test(l.id) ? "#5f7a92" : "#c3c7cf");
      set(l.id, "text-halo-color", "#111317");
    }
  }
}

export function createMap(container, onArea) {
  const map = new maplibregl.Map({
    container, style: STYLE, center: [10, 15], zoom: 1.3, attributionControl: { compact: true },
    dragRotate: false, pitchWithRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  // ---- what the fire layer shows: a chosen month, or the average year
  const view = { month: null, mode: "avg" }; // mode: "month" | "avg"
  const legend = document.createElement("div");
  legend.className = "maplegend";
  container.append(legend);

  map.on("load", () => {
    brighten(map);
    const firstSymbol = map.getStyle().layers.find(l => l.type === "symbol")?.id;
    // overview: average year everywhere (two halves - one image cannot span 360 deg)
    for (const [k, w, e] of [["w", -180, 0], ["e", 0, 180]]) {
      map.addSource(`ov_${k}`, { type: "image", url: `data/overview_${k}.png`,
        coordinates: [[w, MERC_LAT], [e, MERC_LAT], [e, -MERC_LAT], [w, -MERC_LAT]] });
      map.addLayer({ id: `ov_${k}`, type: "raster", source: `ov_${k}`, maxzoom: CELL_ZOOM + 0.5,
        paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], CELL_ZOOM - 0.3, 1, CELL_ZOOM + 0.3, 0.15],
                 "raster-resampling": "nearest", "raster-fade-duration": 0 } }, firstSymbol);
    }
    map.addSource("cells", { type: "geojson", data: empty() });
    map.addLayer({ id: "cells", type: "fill", source: "cells", minzoom: CELL_ZOOM - 0.3,
      paint: { "fill-color": ["interpolate", ["linear"], ["get", "t"], ...RAMP.flat()],
               "fill-opacity": ["interpolate", ["linear"], ["zoom"], CELL_ZOOM - 0.3, 0, CELL_ZOOM + 0.2, 0.9] } }, firstSymbol);
    map.addSource("aoi", { type: "geojson", data: empty() });
    map.addLayer({ id: "aoi-fill", type: "fill", source: "aoi", paint: { "fill-color": "#ffb25c", "fill-opacity": 0.05 } });
    map.addLayer({ id: "aoi-line", type: "line", source: "aoi", paint: { "line-color": "#ffc163", "line-width": 2.2 } });
    map.addSource("draft", { type: "geojson", data: empty() });
    map.addLayer({ id: "draft-line", type: "line", source: "draft",
      paint: { "line-color": "#ffc163", "line-width": 1.5, "line-dasharray": [2, 2] } });
    refreshCells();
  });

  // ---- fire cells for the current view
  let reqId = 0, lastInfo = null;
  async function refreshCells() {
    const id = ++reqId;
    if (!map.getSource("cells")) return;
    if (map.getZoom() < CELL_ZOOM - 0.3) { lastInfo = null; renderLegend(); return; }
    const b = map.getBounds();
    const res = await cellsInBBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], view.mode === "month" ? view.month : null);
    if (id !== reqId) return; // a newer request superseded this one
    lastInfo = res;
    map.getSource("cells").setData(res ? res.fc : empty());
    renderLegend();
  }
  let t = null;
  map.on("moveend", () => { clearTimeout(t); t = setTimeout(refreshCells, 120); });

  function renderLegend() {
    const zoomedOut = map.getZoom() < CELL_ZOOM - 0.3;
    const monthTxt = view.month != null ? `${MONTHS[view.month % 12]} ${2000 + Math.floor(view.month / 12)}` : null;
    const what = zoomedOut || view.mode === "avg" ? "an average year (2003–2025)" : monthTxt;
    const max = !zoomedOut && lastInfo ? lastInfo.max : null;
    const unit = view.mode === "month" && !zoomedOut ? "fire cell-days in the month" : "fire cell-days per year";
    legend.innerHTML = `
      <div class="ml-title">Fires on the map: <b>${what}</b></div>
      <div class="ml-ramp"><span>low</span><i style="background:linear-gradient(90deg,${(zoomedOut ? OV_RAMP : RAMP.map(r => r[1])).join(",")})"></i><span>${max ? `${max}+` : "high"}</span></div>
      <div class="ml-note">${zoomedOut ? "Zoom in to see each 10 km square" : `${unit} per 10 km square`}${lastInfo?.tooMany ? " · zoom in further for detail" : ""}</div>
      ${monthTxt ? `<div class="ml-seg"><button data-m="month" class="${view.mode === "month" ? "on" : ""}">${monthTxt}</button><button data-m="avg" class="${view.mode === "avg" ? "on" : ""}">Average year</button></div>` : ""}`;
    legend.querySelectorAll("button").forEach(btn => (btn.onclick = () => { view.mode = btn.dataset.m; refreshCells(); renderLegend(); }));
  }
  renderLegend();

  // hover: value of the cell under the mouse
  const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "cellpop", offset: 10 });
  map.on("mousemove", "cells", e => {
    const f = e.features?.[0];
    if (!f || tool) return;
    const v = f.properties.v;
    const when = view.mode === "month" && view.month != null ? `in ${MONTHS[view.month % 12]} ${2000 + Math.floor(view.month / 12)}` : "per year, on average (2003–2025)";
    pop.setLngLat(e.lngLat).setHTML(`<b>${v < 10 ? v.toFixed(1) : Math.round(v)}</b> fire cell-days ${when}<br><span>10 km square at ${f.properties.lat.toFixed(1)}°, ${f.properties.lon.toFixed(1)}°</span>`).addTo(map);
  });
  map.on("mouseleave", "cells", () => pop.remove());

  // ---- drawing state
  let tool = null, start = null, verts = [];
  const canvas = map.getCanvasContainer();
  const setDraft = ring => map.getSource("draft")?.setData(ring ? poly(ring) : empty());
  const finish = ring => {
    setTool(null);
    setDraft(null);
    if (ring && ring.length >= 4) onArea({ ring, name: "Drawn area" });
  };

  function setTool(t) {
    tool = t; start = null; verts = [];
    document.getElementById("toolRect").classList.toggle("on", t === "rect");
    document.getElementById("toolPoly").classList.toggle("on", t === "poly");
    canvas.style.cursor = t ? "crosshair" : "";
    if (t) { map.dragPan.disable(); map.doubleClickZoom.disable(); pop.remove(); } else { map.dragPan.enable(); map.doubleClickZoom.enable(); }
  }

  map.on("mousedown", e => {
    if (tool !== "rect") return;
    e.preventDefault();
    start = e.lngLat;
  });
  map.on("mousemove", e => {
    if (tool === "rect" && start) setDraft(rect(start, e.lngLat));
    if (tool === "poly" && verts.length) setDraft([...verts, [e.lngLat.lng, e.lngLat.lat], verts[0]]);
  });
  map.on("mouseup", e => {
    if (tool !== "rect" || !start) return;
    const r = rect(start, e.lngLat);
    start = null;
    if (Math.abs(r[0][0] - r[2][0]) < 0.05 || Math.abs(r[0][1] - r[2][1]) < 0.05) return; // ignore clicks
    finish(r);
  });
  map.on("click", e => {
    if (tool !== "poly") return;
    verts.push([e.lngLat.lng, e.lngLat.lat]);
  });
  map.on("dblclick", e => {
    if (tool !== "poly") return;
    e.preventDefault();
    // the dblclick also fired two clicks; drop the duplicate vertex
    const ring = verts.slice(0, -1);
    if (ring.length >= 3) finish([...ring, ring[0]]); else setTool(null);
  });

  document.getElementById("toolRect").onclick = () => setTool(tool === "rect" ? null : "rect");
  document.getElementById("toolPoly").onclick = () => setTool(tool === "poly" ? null : "poly");
  addEventListener("keydown", e => { if (e.key === "Escape") { setTool(null); setDraft(null); } });

  return {
    map,
    showArea(ring) {
      const apply = () => map.getSource("aoi").setData(poly(ring));
      map.isStyleLoaded() && map.getSource("aoi") ? apply() : map.once("load", apply);
    },
    clearArea() { map.getSource("aoi")?.setData(empty()); },
    fit(bbox) { map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 900, maxZoom: 9 }); },
    /** Show this month's fires on the map (null = average year). */
    setMonth(m) {
      view.month = m;
      view.mode = m == null ? "avg" : "month";
      refreshCells();
      renderLegend();
    },
  };
}

const empty = () => ({ type: "FeatureCollection", features: [] });
const poly = ring => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} });
function rect(a, b) {
  const w = Math.min(a.lng, b.lng), e = Math.max(a.lng, b.lng), s = Math.min(a.lat, b.lat), n = Math.max(a.lat, b.lat);
  return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}
