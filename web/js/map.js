/* global maplibregl */
// Map, overview layer and area-of-interest drawing tools.

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const MERC_LAT = 85.0511;

export function createMap(container, onArea) {
  const map = new maplibregl.Map({
    container, style: STYLE, center: [10, 15], zoom: 1.3, attributionControl: { compact: true },
    dragRotate: false, pitchWithRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  map.on("load", () => {
    map.addSource("overview", {
      type: "image", url: "data/overview.png",
      coordinates: [[-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT]],
    });
    const firstSymbol = map.getStyle().layers.find(l => l.type === "symbol")?.id;
    map.addLayer({ id: "overview", type: "raster", source: "overview",
      paint: { "raster-opacity": 0.9, "raster-resampling": "nearest", "raster-fade-duration": 0 } }, firstSymbol);
    map.addSource("aoi", { type: "geojson", data: empty() });
    map.addLayer({ id: "aoi-fill", type: "fill", source: "aoi", paint: { "fill-color": "#ff8a3d", "fill-opacity": 0.12 } });
    map.addLayer({ id: "aoi-line", type: "line", source: "aoi", paint: { "line-color": "#ffc163", "line-width": 2 } });
    map.addSource("draft", { type: "geojson", data: empty() });
    map.addLayer({ id: "draft-line", type: "line", source: "draft",
      paint: { "line-color": "#ffc163", "line-width": 1.5, "line-dasharray": [2, 2] } });
  });

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
    if (t) { map.dragPan.disable(); map.doubleClickZoom.disable(); } else { map.dragPan.enable(); map.doubleClickZoom.enable(); }
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
  };
}

const empty = () => ({ type: "FeatureCollection", features: [] });
const poly = ring => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} });
function rect(a, b) {
  const w = Math.min(a.lng, b.lng), e = Math.max(a.lng, b.lng), s = Math.min(a.lat, b.lat), n = Math.max(a.lat, b.lat);
  return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}
