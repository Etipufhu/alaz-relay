/* global d3 */
import { loadMeta, META, MONTHS, aggregatePolygon, countrySeries, baseline, classify, interval,
         toCSV, bboxOf, areaKm2, circleRing, segmentOf } from "./data.js";
import { drawCalendar, drawRelay, drawTimeline, drawSeason } from "./charts.js";
import { createMap } from "./map.js";

const $ = id => document.getElementById(id);
const fmt = d3.format(",.0f"), fmt1 = d3.format(",.1f"), pct = d3.format("+.0%");

const STORIES = [
  { label: "Manavgat, Türkiye · Jul 2021", ring: rectRing(31.0, 36.6, 32.0, 37.2), month: "2021-07", name: "Manavgat (Antalya), Türkiye" },
  { label: "Paraná Delta, Argentina · 2020", ring: rectRing(-60.8, -34.3, -58.3, -32.0), month: "2020-08", name: "Paraná River Delta, Argentina" },
  { label: "Corrientes, Argentina · Feb 2022", ring: rectRing(-59.5, -30.8, -56.0, -27.3), month: "2022-02", name: "Corrientes wetlands, Argentina" },
  { label: "SE Türkiye stubble burning", ring: rectRing(37.0, 36.6, 41.5, 38.2), month: "2021-06", name: "Harran plain & SE Türkiye croplands" },
];

const state = { series: null, name: "", mode: "harm", selected: null, base: null, baseYears: [2003, 2022] };

function rectRing(w, s, e, n) { return [[w, s], [e, s], [e, n], [w, n], [w, s]]; }
const mIndex = ym => (+ym.slice(0, 4) - 2000) * 12 + (+ym.slice(5, 7) - 1);

async function init() {
  await loadMeta();
  const mapApi = createMap($("map"), area => selectArea(area, mapApi));

  const sel = $("countrySel");
  for (const c of META.countries) sel.append(new Option(c.name, c.slug));
  sel.onchange = async () => {
    const c = META.countries.find(x => x.slug === sel.value);
    if (!c) return;
    mapApi.clearArea();
    mapApi.fit(c.bbox);
    const s = await countrySeries(c.slug);
    show(s, c.name, `Country total · ${fmt(c.total)} harmonized fire cell-days since 2000`);
  };

  for (const st of STORIES) {
    const b = Object.assign(document.createElement("button"), { className: "chip-btn", textContent: st.label });
    b.onclick = () => selectArea({ ring: st.ring, name: st.name, month: st.month }, mapApi);
    $("stories").append(b);
  }

  $("pointForm").onsubmit = e => {
    e.preventDefault();
    const lat = +$("inLat").value, lon = +$("inLon").value, km = +$("inRad").value || 25;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || $("inLat").value === "" || $("inLon").value === "") return;
    selectArea({ ring: circleRing(lat, lon, km), name: `${km} km around ${lat.toFixed(2)}, ${lon.toFixed(2)}` }, mapApi);
  };
  $("toolClear").onclick = () => { mapApi.clearArea(); $("results").hidden = true; $("emptyState").hidden = false; };

  document.querySelectorAll(".seg button").forEach(b => (b.onclick = () => {
    document.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b));
    state.mode = b.dataset.mode;
    render();
  }));
  $("dlCsv").onclick = () => {
    const blob = new Blob([toCSV(state.series, state.name)], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob),
      download: `alaz-relay_${state.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  renderValidation();
}

async function selectArea(area, mapApi) {
  mapApi.showArea(area.ring);
  mapApi.fit(bboxOf(area.ring));
  $("countrySel").value = "";
  try {
    const s = await aggregatePolygon(area.ring);
    const where = s.countries?.length ? ` · ${s.countries.slice(0, 3).join(", ")}` : "";
    show(s, area.name, `${fmt(areaKm2(area.ring))} km² · ${fmt(s.cells)} grid cells (0.1°)${where}`, area.month ? mIndex(area.month) : null);
  } catch (err) {
    alert(err.message);
  }
}

function show(series, name, sub, month = null) {
  state.series = series;
  state.name = name;
  state.base = baseline(series, ...state.baseYears);
  state.selected = month ?? defaultMonth(series);
  $("aoiName").textContent = name;
  $("aoiSub").textContent = sub;
  $("emptyState").hidden = true;
  $("results").hidden = false;
  render();
  drawTimeline($("timeline"));
}

function defaultMonth(series) {
  // most recent month with notable activity, else the last month
  for (let m = META.last_month; m >= META.last_month - 11; m--) if (series.harm[m] > 0) return m;
  return META.last_month;
}

function render() {
  const { series, base, mode, selected } = state;
  const hints = {
    harm: "Each square is one month. Values are harmonized fire cell-days, comparable across all years. The coloured stripe shows which satellite the value comes from.",
    anom: "Each month compared with the normal for that calendar month (median of 2003–2022). Outlined months are above normal even after accounting for uncertainty.",
    raw: "What most tools show: raw hotspot counts from all sensors. Note the jump when VIIRS joins in 2012 — that is a sensor change, not more fire.",
  };
  $("calHint").textContent = hints[mode];
  drawCalendar($("calendar"), $("calLegend"), series, base, mode, selected, m => { state.selected = m; render(); });
  drawRelay($("relayChart"), series);
  drawSeason($("season"), series, base, 2000 + Math.floor(selected / 12));
  renderCards();
}

function renderCards() {
  const { series, base, selected } = state;
  const v = series.harm[selected];
  const c = classify(v, selected, base);
  const label = { record: "Record high", above: "Above normal", below: "Below normal", normal: "Normal", na: "—" }[c.cls];
  const r = c.b?.med > 0 ? v / c.b.med : null;
  const ratioTxt = r == null ? "" : r >= 3 ? ` (${r >= 10 ? fmt(r) : r.toFixed(1)}× normal)` : ` (${pct(r - 1)} vs normal)`;

  const peakMo = d3.maxIndex(base, b => b.med || 0);
  const years = d3.range(Math.ceil(META.first_month / 12), Math.floor((META.last_month + 1) / 12)); // full years only
  const annual = years.map(y => ({ y: 2000 + y, v: d3.sum(d3.range(12), mo => series.harm[y * 12 + mo]) }));
  const top = annual.reduce((a, b) => (b.v > a.v ? b : a), { v: -1 });

  const mean = (y0, y1, f) => d3.mean(d3.range(y0, y1 + 1), y => d3.sum(d3.range(12), mo => f((y - 2000) * 12 + mo)));
  const rawPre = mean(2003, 2011, m => series.raw_modis[m] + series.raw_viirs[m]);
  const rawPost = mean(2013, 2017, m => series.raw_modis[m] + series.raw_viirs[m]);
  const hPre = mean(2003, 2011, m => series.harm[m]), hPost = mean(2013, 2017, m => series.harm[m]);

  const cards = [
    { k: `${MONTHS[selected % 12]} ${2000 + Math.floor(selected / 12)}`, v: label,
      d: `${fmt1(v)} cell-days${ratioTxt} · click any month in the calendar`,
      cls: c.cls === "record" || c.cls === "above" ? "alert" : c.cls === "below" || c.cls === "normal" ? "calm" : "" },
    { k: "Peak fire season", v: MONTHS[peakMo], d: `median ${fmt1(base[peakMo].med)} cell-days in a typical ${MONTHS[peakMo]}` },
    { k: "Most active year", v: top.y > 0 ? String(top.y) : "—", d: `${fmt(top.v)} harmonized cell-days` },
    { k: "Sensor jump removed", v: rawPre > 0 ? `×${(rawPost / rawPre).toFixed(1)} → ×${(hPost / hPre).toFixed(1)}` : "—",
      d: "raw hotspots vs harmonized, 2013–17 relative to 2003–11" },
  ];
  $("cards").innerHTML = cards.map(x => `<div class="card ${x.cls || ""}"><div class="k">${x.k}</div><div class="v">${x.v}</div><div class="d">${x.d}</div></div>`).join("");
}

function renderValidation() {
  const rows = Object.entries(META.validation).map(([s, v]) => `<tr><td>${s === "SNPP" ? "Suomi NPP" : "NOAA-20"}</td>
    <td>${v.train.join("–")}</td><td>${v.test.join("–")}</td><td>${v.r_log.toFixed(2)}</td>
    <td>${v.bias_pct >= 0 ? "+" : ""}${v.bias_pct.toFixed(1)}%</td><td>${v.median_abs_err_pct.toFixed(0)}%</td></tr>`).join("");
  $("valTable").innerHTML = `<table><thead><tr><th>VIIRS satellite</th><th>train</th><th>test</th><th>r (log)</th><th>bias</th><th>median |error|</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

init();
// expose for debugging in the console
window.ALAZ = { state, interval, segmentOf };
