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
  sel.onchange = () => openCountry(sel.value, null, mapApi);

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
  renderFindings(mapApi);
}

async function openCountry(slug, month, mapApi) {
  const c = META.countries.find(x => x.slug === slug);
  if (!c) return;
  $("countrySel").value = slug;
  mapApi.clearArea();
  mapApi.fit(c.bbox);
  const s = await countrySeries(c.slug);
  show(s, c.name, `Country total · ${fmt(c.total)} harmonized fire cell-days since 2000`, month);
}

// ── findings: global trend (raw vs harmonized vs Aqua alone) + automatically detected record months
async function renderFindings(mapApi) {
  const F = await fetch("data/findings.json").then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!F) return;
  const t = F.trend, f1 = d3.format(".1f");
  $("trendStats").innerHTML =
    `<div style="--c:#b9b2a8"><b>×${f1(t.raw_2012_2022 / 100)}</b><span>raw hotspots, 2012–2022 vs 2003–2011. Peak ×${f1(t.raw_peak / 100)} in ${t.raw_peak_year}.</span></div>` +
    `<div style="--c:#ff8a3d"><b>${f1(t.harm_2012_2022 - 100)}%</b><span>ALAZ Relay, harmonized: the same years in one consistent unit</span></div>` +
    `<div style="--c:#8ec5ff"><b>${f1(t.aqua_2012_2022 - 100)}%</b><span>Aqua MODIS alone, never harmonized: an independent check</span></div>`;
  drawTrend(t);
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => drawTrend(t), 200); });
  $("recCount").textContent = F.records_strict;
  const grid = $("recGrid");
  for (const r of F.showcase) {
    const b = document.createElement("button");
    b.className = "rec reveal in";
    b.type = "button";
    b.innerHTML = `<div class="when">${r.label}</div><div class="where">${r.country}</div>
      <div class="x">×${r.x_typical}<small>a typical ${r.label.slice(0, 3)}</small></div>
      <div class="ev">${r.event ?? ""}</div>
      <span class="tag ${r.strict ? "strict" : ""}">${r.strict ? "record, beyond uncertainty" : "highest since 2001 · within uncertainty"}</span>`;
    b.setAttribute("aria-label", `${r.country}, ${r.label}: ${r.x_typical} times a typical month. Open its calendar.`);
    b.onclick = async () => {
      await openCountry(r.slug, (r.year - 2000) * 12 + r.month - 1, mapApi);
      $("explore").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    grid.append(b);
  }
  $("goManavgat").onclick = () => {
    $("explore").scrollIntoView({ behavior: "smooth" });
    selectArea({ ring: STORIES[0].ring, name: STORIES[0].name, month: STORIES[0].month }, mapApi);
  };
}

function drawTrend(t) {
  const el = $("trend");
  const W = Math.max(320, el.clientWidth || 1000), compact = W < 640;
  const m = { l: compact ? 34 : 44, r: compact ? 8 : 150, t: compact ? 62 : 16, b: 26 }, H = compact ? 300 : 340;
  const x = d3.scaleLinear().domain([2003, 2025]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, 950]).range([H - m.b, m.t]);
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", `Raw hotspot totals rise to ${Math.round(t.raw_peak / 100)} times the 2003–2011 level while harmonized activity and Aqua alone fall about 11 percent`);
  [0, 100, 300, 500, 700, 900].forEach(v => {
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(v)).attr("y2", y(v))
      .attr("stroke", v === 100 ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.06)").attr("stroke-dasharray", v === 100 ? "2 3" : null);
    svg.append("text").attr("x", m.l - 6).attr("y", y(v) + 4).attr("text-anchor", "end").text(v);
  });
  [[2012, "Suomi NPP joins"], [2018.3, "NOAA-20 joins"]].forEach(([yr, lab]) => {
    svg.append("line").attr("x1", x(yr)).attr("x2", x(yr)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "rgba(196,166,255,.35)").attr("stroke-dasharray", "3 4");
    svg.append("text").attr("x", x(yr) + 6).attr("y", m.t + 10).style("fill", "#c4a6ff").text(compact ? lab.split(" ")[0] : lab);
  });
  const ln = k => d3.line().x((v, i) => x(t.years[i])).y(v => y(v)).curve(d3.curveMonotoneX)(t[k]);
  const S = [{ k: "raw", c: "#b9b2a8", w: 2, lab: "Raw hotspots", dash: "5 4" },
             { k: "aqua", c: "#8ec5ff", w: 1.8, lab: "Aqua MODIS alone" },
             { k: "harm", c: "#ff8a3d", w: 3, lab: "ALAZ Relay" }];
  for (const s of S) {
    svg.append("path").attr("d", ln(s.k)).attr("fill", "none").attr("stroke", s.c).attr("stroke-width", s.w).attr("stroke-dasharray", s.dash ?? null);
    const last = t[s.k][t[s.k].length - 1];
    const yy = s.k === "harm" ? y(last) + 16 : s.k === "aqua" ? y(last) - 8 : y(last) + 4;
    if (!compact) svg.append("text").attr("class", "lbl").attr("x", W - m.r + 10).attr("y", yy).style("fill", s.c).text(`${s.lab} ${Math.round(last)}`);
  }
  if (compact) S.forEach((s, i) => svg.append("text").attr("class", "lbl").attr("x", 0).attr("y", 12 + i * 15).style("fill", s.c).text(s.lab));
  svg.append("g").attr("transform", `translate(0,${H - m.b + 6})`)
    .call(d3.axisBottom(x).tickValues(d3.range(2003, 2026, compact ? 4 : 2)).tickFormat(d3.format("d")).tickSize(0))
    .call(g => g.select(".domain").remove());
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
