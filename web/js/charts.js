/* global d3 */
import { META, MONTHS, monthLabel, segmentOf, interval, classify } from "./data.js";

const tip = document.getElementById("tip");
const fmt = d3.format(",.0f");
const fmt1 = d3.format(",.1f");
export function showTip(evt, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
export const hideTip = () => { tip.hidden = true; };

const SRC_COLOR = { terra: "#ffd28a", aqua: "#8ec5ff", virtual: "#ff8a3d" };
const SRC_SHORT = { terra: "Terra→Aqua", aqua: "Aqua", virtual: "Virtual (VIIRS)" };
const EMPTY = "#18181c";

/** Month x year calendar heatmap. */
export function drawCalendar(el, legendEl, series, base, mode, selected, onPick) {
  const y0 = Math.floor(META.first_month / 12), y1 = Math.floor(META.last_month / 12);
  const years = d3.range(y0, y1 + 1);
  const cw = 46, ch = 17, left = 64, top = 22, totW = 70;
  const W = left + 12 * cw + 14 + totW, H = top + years.length * ch + 6;
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", "Calendar of monthly fire activity by year");

  const valid = m => m >= META.first_month && m <= META.last_month;
  const val = m => (mode === "raw" ? series.raw_modis[m] + series.raw_viirs[m] : series.harm[m]);
  const all = d3.range(META.first_month, META.last_month + 1).map(val);
  const vmax = d3.max(all) || 1;
  let color;
  if (mode === "anom") {
    const sc = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-2, 0, 2]).clamp(true);
    color = m => {
      const b = base[m % 12];
      if (!b || !(b.med >= 0)) return EMPTY;
      return sc(Math.log2((series.harm[m] + 1) / (b.med + 1)));
    };
  } else {
    const sc = d3.scaleSequentialSqrt(t => d3.interpolateInferno(0.12 + 0.88 * t)).domain([0, vmax]);
    // harmonized values are expectations; < 0.5 cell-days means "most likely no detectable fire"
    const floor = mode === "raw" ? 0 : 0.5;
    color = m => (val(m) > floor ? sc(val(m)) : EMPTY);
  }

  svg.selectAll("text.mh").data(MONTHS).join("text").attr("class", "mh")
    .attr("x", (d, i) => left + i * cw + cw / 2).attr("y", 14).attr("text-anchor", "middle").text(d => d);
  svg.append("text").attr("x", left + 12 * cw + 14 + totW / 2).attr("y", 14).attr("text-anchor", "middle").text("Year total");

  const annual = years.map(y => d3.sum(d3.range(12), mo => (valid(y * 12 + mo) ? val(y * 12 + mo) : 0)));
  const amax = d3.max(annual) || 1;

  years.forEach((y, yi) => {
    const yy = top + yi * ch;
    const g = svg.append("g");
    // year label + source stripe (which satellite the harmonized value comes from)
    const seg = segmentOf(Math.min(Math.max(y * 12 + 6, META.first_month), META.last_month));
    g.append("rect").attr("x", left - 8).attr("y", yy + 2).attr("width", 4).attr("height", ch - 4)
      .attr("fill", mode === "raw" ? (y + 2000 >= 2012 ? "#c4a6ff" : "#8ec5ff") : SRC_COLOR[seg?.src] || EMPTY);
    g.append("text").attr("x", left - 14).attr("y", yy + ch / 2 + 4).attr("text-anchor", "end").text(2000 + y);
    for (let mo = 0; mo < 12; mo++) {
      const m = y * 12 + mo;
      const r = g.append("rect").attr("x", left + mo * cw + 1).attr("y", yy + 1).attr("width", cw - 2).attr("height", ch - 2)
        .attr("rx", 3).attr("fill", valid(m) ? color(m) : "transparent");
      if (!valid(m)) continue;
      const c = classify(series.harm[m], m, base);
      if (mode === "anom" && (c.cls === "above" || c.cls === "record")) {
        r.attr("stroke", c.cls === "record" ? "#fff" : "#ffb3a3").attr("stroke-width", c.cls === "record" ? 1.6 : 0.8);
      }
      if (m === selected) r.attr("stroke", "#fff").attr("stroke-width", 2);
      r.style("cursor", "pointer")
        .on("mousemove", e => showTip(e, cellTip(series, base, m, c)))
        .on("mouseleave", hideTip)
        .on("click", () => onPick(m));
    }
    const a = annual[yi];
    g.append("rect").attr("x", left + 12 * cw + 14).attr("y", yy + 3).attr("height", ch - 6)
      .attr("width", Math.max(0, (a / amax) * (totW - 4))).attr("rx", 2)
      .attr("fill", mode === "raw" ? "#8a8fa0" : "#ff8a3d").attr("opacity", 0.85);
  });

  // legend
  legendEl.innerHTML = "";
  const cv = document.createElement("canvas");
  cv.width = 160; cv.height = 10;
  const ctx = cv.getContext("2d");
  for (let i = 0; i < 160; i++) {
    const t = i / 159;
    ctx.fillStyle = mode === "anom" ? d3.interpolateRdBu(1 - t) : d3.interpolateInferno(0.12 + 0.88 * t);
    ctx.fillRect(i, 0, 1, 10);
  }
  const lab = (t) => Object.assign(document.createElement("span"), { textContent: t });
  if (mode === "anom") {
    legendEl.append(lab("¼× normal"), cv, lab("4× normal"), lab(" · white outline = record, pink = clearly above normal"));
  } else {
    legendEl.append(lab("0"), cv, lab(mode === "raw" ? `${fmt(vmax)} hotspots` : `${fmt(vmax)} cell-days`));
    if (mode !== "raw") {
      const s = document.createElement("span");
      s.innerHTML = ` · source: <i class="sw" style="background:${SRC_COLOR.terra}"></i>Terra→Aqua
        <i class="sw" style="background:${SRC_COLOR.aqua}"></i>Aqua <i class="sw" style="background:${SRC_COLOR.virtual}"></i>Virtual Aqua (VIIRS)`;
      legendEl.append(s);
    } else {
      const s = document.createElement("span");
      s.innerHTML = ` · <i class="sw" style="background:#8ec5ff"></i>MODIS only <i class="sw" style="background:#c4a6ff"></i>MODIS + VIIRS (the raw jump)`;
      legendEl.append(s);
    }
  }
}

function cellTip(series, base, m, c) {
  const v = series.harm[m], b = base[m % 12], seg = segmentOf(m);
  const lab = { record: "🔥 record for this month", above: "above normal", below: "below normal", normal: "within normal range", na: "" }[c.cls];
  return `<b>${MONTHS[m % 12]} ${2000 + Math.floor(m / 12)}</b><br>
    <span class="mono">${fmt1(v)}</span> fire cell-days <span class="mono">(${fmt1(c.lo ?? 0)}–${fmt1(c.hi ?? 0)})</span><br>
    normal (median): <span class="mono">${fmt1(b?.med ?? 0)}</span> · ${lab}<br>
    raw hotspots: MODIS <span class="mono">${fmt(series.raw_modis[m])}</span> · VIIRS <span class="mono">${fmt(series.raw_viirs[m])}</span><br>
    <span style="color:${SRC_COLOR[seg?.src]}">● ${SRC_SHORT[seg?.src] ?? ""}</span>`;
}

/** Annual raw vs harmonized (log scale) with uncertainty band. */
export function drawRelay(el, series) {
  const y0 = Math.floor(META.first_month / 12) + 2000, y1 = Math.floor(META.last_month / 12) + 2000;
  const rows = d3.range(y0, y1 + 1).map(y => {
    let h = 0, lo = 0, hi = 0, rm = 0, rv = 0, aq = 0, months = 0;
    for (let mo = 0; mo < 12; mo++) {
      const m = (y - 2000) * 12 + mo;
      if (m < META.first_month || m > META.last_month) continue;
      months++;
      const v = series.harm[m], [l, u] = interval(v, m);
      h += v; lo += l; hi += u; rm += series.raw_modis[m]; rv += series.raw_viirs[m];
      aq += series.aqua_actual ? series.aqua_actual[m] : 0;
    }
    return { y, h, lo, hi, raw: rm + rv, rm, rv, aq, partial: months < 12 };
  }).filter(d => d.h > 0 || d.raw > 0);
  const W = 760, H = 250, m = { l: 56, r: 16, t: 14, b: 26 };
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([y0 - 0.5, y1 + 0.5]).range([m.l, W - m.r]);
  const ymax = d3.max(rows, d => Math.max(d.raw, d.hi)) || 10;
  const ymin = Math.max(1, d3.min(rows.filter(d => d.h > 0), d => d.lo) || 1);
  const y = d3.scaleLog().domain([ymin * 0.7, ymax * 1.3]).range([H - m.b, m.t]).clamp(true);

  // satellite join markers
  [[2012, "S-NPP joins"], [2018.25, "NOAA-20 joins"], [2022, "MODIS orbits drift"]].forEach(([yr, t]) => {
    if (yr < y0 || yr > y1) return;
    svg.append("line").attr("x1", x(yr - 0.5)).attr("x2", x(yr - 0.5)).attr("y1", m.t).attr("y2", H - m.b)
      .attr("stroke", "#34343c").attr("stroke-dasharray", "3 3");
    svg.append("text").attr("x", x(yr - 0.5) + 4).attr("y", m.t + 10).text(t);
  });

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(10).tickFormat(d3.format("d")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5, "~s"));

  const band = rows.filter(d => d.h > 0);
  svg.append("path").datum(band).attr("fill", "#ff8a3d").attr("opacity", 0.18)
    .attr("d", d3.area().x(d => x(d.y)).y0(d => y(Math.max(d.lo, ymin * 0.7))).y1(d => y(d.hi)));
  const line = (acc) => d3.line().defined(d => acc(d) > 0).x(d => x(d.y)).y(d => y(acc(d)));
  svg.append("path").datum(rows).attr("fill", "none").attr("stroke", "#8a8fa0").attr("stroke-width", 2)
    .attr("stroke-dasharray", "5 3").attr("d", line(d => d.raw));
  if (rows.some(d => d.aq > 0)) {
    svg.append("path").datum(rows).attr("fill", "none").attr("stroke", "#8ec5ff").attr("stroke-width", 1.4)
      .attr("opacity", 0.8).attr("d", line(d => d.aq));
  }
  svg.append("path").datum(rows).attr("fill", "none").attr("stroke", "#ff8a3d").attr("stroke-width", 2.6).attr("d", line(d => d.h));
  svg.selectAll("circle.h").data(rows.filter(d => d.h > 0)).join("circle").attr("r", 3.2)
    .attr("cx", d => x(d.y)).attr("cy", d => y(d.h)).attr("fill", d => (d.partial ? "#111114" : "#ff8a3d"))
    .attr("stroke", "#ff8a3d")
    .on("mousemove", (e, d) => showTip(e, `<b>${d.y}${d.partial ? " (partial year)" : ""}</b><br>
      harmonized: <span class="mono">${fmt(d.h)}</span> cell-days (${fmt(d.lo)}–${fmt(d.hi)})<br>
      raw hotspots: <span class="mono">${fmt(d.raw)}</span> (MODIS ${fmt(d.rm)}, VIIRS ${fmt(d.rv)})
      ${d.aq ? `<br>actual Aqua: <span class="mono">${fmt(d.aq)}</span>` : ""}`))
    .on("mouseleave", hideTip);

  const lg = svg.append("g").attr("transform", `translate(${m.l + 8},${H - m.b - 52})`);
  [["#ff8a3d", "Harmonized (90% band)", ""], ["#8a8fa0", "Raw hotspots, all sensors", "5 3"],
   ...(rows.some(d => d.aq > 0) ? [["#8ec5ff", "Actual Aqua MODIS (drifts after 2021)", ""]] : [])].forEach(([c, t, dash], i) => {
    lg.append("line").attr("x1", 0).attr("x2", 18).attr("y1", i * 15).attr("y2", i * 15).attr("stroke", c).attr("stroke-width", 2.4).attr("stroke-dasharray", dash);
    lg.append("text").attr("x", 24).attr("y", i * 15 + 4).text(t);
  });
}

/** Satellite timeline under the relay chart. */
export function drawTimeline(el) {
  const y0 = 2000, y1 = 2028;
  const W = 760, rowH = 16, m = { l: 56, r: 16, t: 6 };
  const sats = META.satellites;
  const H = m.t + sats.length * rowH + 22;
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([y0, y1]).range([m.l, W - m.r]);
  const ym = s => (s ? +s.slice(0, 4) + (+s.slice(5, 7) - 1) / 12 : null);
  const now = new Date(), tNow = now.getFullYear() + now.getMonth() / 12;
  sats.forEach((s, i) => {
    const a = ym(s.start), b = ym(s.end) ?? y1, yy = m.t + i * rowH;
    const isModis = s.name.includes("MODIS");
    svg.append("rect").attr("x", x(a)).attr("y", yy + 3).attr("height", rowH - 6).attr("rx", 3)
      .attr("width", Math.max(2, x(Math.min(b, tNow)) - x(a))).attr("fill", isModis ? "#8ec5ff" : "#c4a6ff").attr("opacity", 0.85);
    if (isModis) { // drift period
      svg.append("rect").attr("x", x(2022)).attr("y", yy + 3).attr("height", rowH - 6)
        .attr("width", x(Math.min(b, tNow)) - x(2022)).attr("fill", "url(#hatch)");
    }
    if (b < y1 && b > tNow) { // planned end
      svg.append("rect").attr("x", x(tNow)).attr("y", yy + 3).attr("height", rowH - 6).attr("width", x(b) - x(tNow))
        .attr("fill", "none").attr("stroke", isModis ? "#8ec5ff" : "#c4a6ff").attr("stroke-dasharray", "2 2");
    }
    svg.append("text").attr("x", x(a) + 4).attr("y", yy + rowH - 4).attr("fill", "#0e0f12").style("fill", "#0e0f12")
      .style("font-weight", 600).style("font-size", "10px").text(s.name);
    svg.append("rect").attr("x", x(a)).attr("y", yy).attr("width", x(b) - x(a)).attr("height", rowH).attr("fill", "transparent")
      .on("mousemove", e => showTip(e, `<b>${s.name}</b><br>${s.start} → ${s.end ?? "operating"}<br>${s.note}`)).on("mouseleave", hideTip);
  });
  const defs = svg.append("defs").append("pattern").attr("id", "hatch").attr("width", 5).attr("height", 5)
    .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
  defs.append("rect").attr("width", 2).attr("height", 5).attr("fill", "rgba(0,0,0,.45)");
  svg.append("line").attr("x1", x(tNow)).attr("x2", x(tNow)).attr("y1", 0).attr("y2", H - 18).attr("stroke", "#ff5d5d");
  svg.append("text").attr("x", x(tNow) + 3).attr("y", H - 6).style("fill", "#ff5d5d").text("today");
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - 20})`).call(d3.axisBottom(x).ticks(14).tickFormat(d3.format("d")).tickSize(3));
}

/** Seasonality: baseline median + IQR band vs one selected year. */
export function drawSeason(el, series, base, year) {
  const W = 760, H = 220, m = { l: 48, r: 16, t: 14, b: 24 };
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3.scalePoint().domain(d3.range(12)).range([m.l, W - m.r]).padding(0.3);
  const cur = d3.range(12).map(mo => {
    const mm = (year - 2000) * 12 + mo;
    return mm >= META.first_month && mm <= META.last_month ? { mo, v: series.harm[mm], iv: interval(series.harm[mm], mm) } : null;
  });
  const ymax = d3.max([...base.map(b => b.q3 || 0), ...cur.filter(Boolean).map(c => c.iv[1])]) || 1;
  const y = d3.scaleLinear().domain([0, ymax * 1.08]).range([H - m.b, m.t]).nice();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat(i => MONTHS[i]));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5, "~s"));
  svg.append("path").datum(base).attr("fill", "#9a9ca3").attr("opacity", 0.2)
    .attr("d", d3.area().x((d, i) => x(i)).y0(d => y(d.q1 || 0)).y1(d => y(d.q3 || 0)).curve(d3.curveMonotoneX));
  svg.append("path").datum(base).attr("fill", "none").attr("stroke", "#c9c9cf").attr("stroke-width", 1.6)
    .attr("d", d3.line().x((d, i) => x(i)).y(d => y(d.med || 0)).curve(d3.curveMonotoneX));
  const cd = cur.filter(Boolean);
  svg.append("path").datum(cd).attr("fill", "none").attr("stroke", "#ff8a3d").attr("stroke-width", 2.4)
    .attr("d", d3.line().x(d => x(d.mo)).y(d => y(d.v)).curve(d3.curveMonotoneX));
  svg.selectAll("line.err").data(cd).join("line").attr("x1", d => x(d.mo)).attr("x2", d => x(d.mo))
    .attr("y1", d => y(d.iv[0])).attr("y2", d => y(d.iv[1])).attr("stroke", "#ff8a3d").attr("opacity", 0.5);
  svg.selectAll("circle").data(cd).join("circle").attr("cx", d => x(d.mo)).attr("cy", d => y(d.v)).attr("r", 3.5).attr("fill", "#ff8a3d")
    .on("mousemove", (e, d) => showTip(e, `<b>${MONTHS[d.mo]} ${year}</b><br><span class="mono">${fmt1(d.v)}</span> cell-days
      (${fmt1(d.iv[0])}–${fmt1(d.iv[1])})<br>normal: ${fmt1(base[d.mo].med)} (IQR ${fmt1(base[d.mo].q1)}–${fmt1(base[d.mo].q3)})`))
    .on("mouseleave", hideTip);
  const lg = svg.append("g").attr("transform", `translate(${W - m.r - 220},${m.t + 4})`);
  lg.append("line").attr("x2", 18).attr("stroke", "#ff8a3d").attr("stroke-width", 2.4);
  lg.append("text").attr("x", 24).attr("y", 4).text(`${year}`);
  lg.append("line").attr("x2", 18).attr("y1", 16).attr("y2", 16).attr("stroke", "#c9c9cf").attr("stroke-width", 1.6);
  lg.append("text").attr("x", 24).attr("y", 20).text("normal (median, IQR band)");
}

export { monthLabel };
