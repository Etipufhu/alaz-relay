/* global d3 */
// Page choreography: entrance, nav, scroll reveals, count-ups, relay lanes and the detection curve.

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── entrance: compose first frame, play once, then remove the classes
if (root.classList.contains("anim")) {
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add("play");
    setTimeout(() => root.classList.remove("anim", "play"), 2600);
  }));
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 600))]).then(go);
}

// ── nav: solid on scroll, burger menu, active section
const nav = document.getElementById("nav"), burger = document.getElementById("burger");
const setOpen = open => {
  nav.dataset.open = String(open);
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
};
setOpen(false);
burger.addEventListener("click", e => { e.stopPropagation(); setOpen(nav.dataset.open !== "true"); });
document.addEventListener("click", e => { if (!nav.contains(e.target)) setOpen(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && nav.dataset.open === "true") { setOpen(false); burger.focus(); } });
nav.querySelectorAll(".navlinks a").forEach(a => a.addEventListener("click", () => setOpen(false)));
const onScroll = () => nav.classList.toggle("scrolled", scrollY > 40);
addEventListener("scroll", onScroll, { passive: true });
onScroll();
const links = [...nav.querySelectorAll(".navlinks a")];
new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.hash === `#${e.target.id}`));
}, { rootMargin: "-45% 0px -50% 0px" }).observe(document.getElementById("proof"));
["relay", "explore", "findings", "method"].forEach(id => {
  new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.hash === `#${id}`));
  }, { rootMargin: "-45% 0px -50% 0px" }).observe(document.getElementById(id));
});

// ── scroll reveals + count-ups
const counted = new WeakSet();
function countUp(el) {
  if (counted.has(el)) return;
  counted.add(el);
  const to = +el.dataset.count, f = d3.format(",");
  if (reduce) { el.textContent = f(to); return; }
  const t0 = performance.now(), dur = 1600;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    el.textContent = f(Math.round(to * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("in");
    e.target.querySelectorAll?.("[data-count]").forEach(countUp);
    io.unobserve(e.target);
  }
}, { threshold: 0.18 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// ── relay lanes (who watched when; overlap = teaching window)
function drawLanes() {
  const el = document.getElementById("lanes");
  const W = 1100, rowH = 34, top = 56, left = 150, right = 10;
  const sats = [
    { name: "Terra", sensor: "MODIS", a: 2000.1, b: 2027.1, drift: 2022, kind: "modis" },
    { name: "Aqua", sensor: "MODIS", a: 2002.5, b: 2027.7, drift: 2022, kind: "modis" },
    { name: "Suomi NPP", sensor: "VIIRS", a: 2012.0, b: 2026.84, kind: "viirs" },
    { name: "NOAA-20", sensor: "VIIRS", a: 2018.25, b: null, kind: "viirs" },
    { name: "NOAA-21", sensor: "VIIRS", a: 2023.2, b: null, kind: "viirs" },
  ];
  const H = top + sats.length * rowH + 40;
  const x = d3.scaleLinear().domain([2000, 2031.2]).range([left, W - right]);
  const now = 2026 + 10.45 / 12;
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", "Timeline of the five fire-detecting satellites from 2000 to 2028");
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "laneHatch").attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse")
    .attr("patternTransform", "rotate(45)").append("rect").attr("width", 2.4).attr("height", 6).attr("fill", "rgba(5,5,6,.55)");
  const glow = defs.append("filter").attr("id", "laneGlow").attr("x", "-20%").attr("y", "-200%").attr("width", "140%").attr("height", "500%");
  glow.append("feGaussianBlur").attr("stdDeviation", 5);

  // teaching window
  svg.append("rect").attr("x", x(2012)).attr("width", x(2022) - x(2012)).attr("y", top - 22).attr("height", sats.length * rowH + 22)
    .attr("fill", "rgba(255,106,31,.07)").attr("stroke", "rgba(255,140,60,.35)").attr("stroke-dasharray", "3 4").attr("rx", 8);
  svg.append("text").attr("x", x(2012) + 10).attr("y", top - 8).style("fill", "#ffb25c").text("TEACHING WINDOW · 2012–2021 · stable orbits, same 13:30 overpass");

  sats.forEach((s, i) => {
    const y = top + i * rowH + 6, h = 14, end = s.b ?? 2028.4, col = s.kind === "modis" ? "#8ec5ff" : "#c4a6ff";
    svg.append("text").attr("class", "lane-label").attr("x", 0).attr("y", y + 11).text(s.name);
    svg.append("text").attr("x", 88).attr("y", y + 11).text(s.sensor);
    svg.append("rect").attr("x", x(s.a)).attr("y", y).attr("height", h).attr("rx", 7)
      .attr("width", x(Math.min(end, now)) - x(s.a)).attr("fill", col).attr("opacity", 0.9);
    if (s.drift) svg.append("rect").attr("x", x(s.drift)).attr("y", y).attr("height", h)
      .attr("width", x(Math.min(end, now)) - x(s.drift)).attr("fill", "url(#laneHatch)");
    if (end > now) svg.append("rect").attr("x", x(now)).attr("y", y + 0.5).attr("height", h - 1).attr("rx", 7)
      .attr("width", x(end) - x(now)).attr("fill", "none").attr("stroke", col).attr("stroke-dasharray", "2 3").attr("opacity", 0.7);
    if (s.b && s.b < 2028) svg.append("text").attr("x", x(s.b) + 6).attr("y", y + 11).style("fill", s.b < now ? "#ff8b6b" : "#f3eee6")
      .text(s.b < now ? "ended Nov 2026" : `ends ${s.name === "Terra" ? "Feb" : "Sep"} 2027`);
    if (s.drift) svg.append("text").attr("x", x(s.drift) + 4).attr("y", y - 3).style("font-size", "9.5px").text("orbit drift");
  });
  // the harmonized record running through everything
  const yr = top + sats.length * rowH + 8;
  svg.append("line").attr("x1", x(2000.83)).attr("x2", x(now)).attr("y1", yr).attr("y2", yr).attr("stroke", "#ff6a1f").attr("stroke-width", 6)
    .attr("filter", "url(#laneGlow)").attr("opacity", 0.8);
  svg.append("line").attr("x1", x(2000.83)).attr("x2", x(now)).attr("y1", yr).attr("y2", yr).attr("stroke", "#ffd2a1").attr("stroke-width", 3.5).attr("stroke-linecap", "round");
  svg.append("text").attr("class", "lane-label").attr("x", 0).attr("y", yr + 4).style("fill", "#ffb25c").text("ALAZ Relay");
  svg.append("text").attr("x", 88).attr("y", yr + 4).text("ONE UNIT");
  svg.append("line").attr("x1", x(now)).attr("x2", x(now)).attr("y1", top - 24).attr("y2", yr + 12).attr("stroke", "#ff6b5b");
  svg.append("text").attr("x", x(now) - 4).attr("y", top - 28).attr("text-anchor", "end").style("fill", "#ff6b5b").text("TODAY");
  svg.append("g").attr("transform", `translate(0,${H - 14})`).call(d3.axisBottom(x).tickValues(d3.range(2000, 2030, 2)).tickFormat(d3.format("d")).tickSize(0))
    .call(g => g.select(".domain").remove());
}

// ── detection curve: P(Aqua also sees it | VIIRS fire power), measured in the overlap years
function drawCurve() {
  const el = document.getElementById("curve");
  const bins = ["<2", "2–5", "5–10", "10–25", "25–100", "100+"];
  const series = [
    { name: "Argentina", v: [3.7, 7.9, 15.5, 27.5, 47.9, 75.5], c: "#ffb25c" },
    { name: "Türkiye", v: [3.0, 5.2, 9.3, 17.9, 33.7, 60.3], c: "#ff6a1f" },
  ];
  const W = 280, H = 150, m = { l: 26, r: 8, t: 10, b: 30 };
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", "Share of VIIRS fires also detected by MODIS rises from 3% for fires under 2 MW to 60–75% above 100 MW");
  const x = d3.scalePoint().domain(d3.range(6)).range([m.l, W - m.r]).padding(0.2);
  const y = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
  [0, 50, 100].forEach(v => {
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", "rgba(255,255,255,.07)");
    svg.append("text").attr("x", m.l - 4).attr("y", y(v) + 3).attr("text-anchor", "end").text(v + "%");
  });
  bins.forEach((b, i) => svg.append("text").attr("x", x(i)).attr("y", H - m.b + 13).attr("text-anchor", "middle").text(b));
  svg.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", H - 3).attr("text-anchor", "middle").text("VIIRS fire power (MW)");
  for (const s of series) {
    svg.append("path").datum(s.v).attr("fill", "none").attr("stroke", s.c).attr("stroke-width", 2)
      .attr("d", d3.line().x((d, i) => x(i)).y(d => y(d)).curve(d3.curveMonotoneX));
    svg.selectAll(null).data(s.v).join("circle").attr("cx", (d, i) => x(i)).attr("cy", d => y(d)).attr("r", 2.4).attr("fill", s.c);
  }
  series.forEach((s, i) => {
    svg.append("circle").attr("cx", m.l + 8).attr("cy", m.t + 6 + i * 13).attr("r", 3).attr("fill", s.c);
    svg.append("text").attr("x", m.l + 15).attr("y", m.t + 9 + i * 13).style("fill", s.c).text(s.name);
  });
}

drawLanes();
drawCurve();

// ── baton test: actual Aqua vs virtual Aqua from each VIIRS satellite (global monthly totals)
function drawHandover(d) {
  const el = document.getElementById("handover");
  if (!el || !d) return;
  const W = Math.max(320, el.clientWidth || 1000), compact = W < 640;
  const m = { l: compact ? 38 : 48, r: compact ? 8 : 112, t: compact ? 50 : 34, b: 26 };
  const h1 = compact ? 200 : 250, gap = 28, h2 = compact ? 64 : 76, H = m.t + h1 + gap + h2 + m.b;
  const y0 = +d.month0.slice(0, 4), n = d.aqua.length, at = i => y0 + i / 12 + 1 / 24;
  const COL = { aqua: "#8ec5ff", snpp: "#c4a6ff", noaa20: "#ffb25c" };
  const x = d3.scaleLinear().domain([y0, y0 + n / 12]).range([m.l, W - m.r]);
  const max = d3.max([...d.aqua, ...d.snpp, ...d.noaa20.filter(v => v != null)]);
  const y = d3.scaleLinear().domain([0, max * 1.06]).range([m.t + h1, m.t]).nice();
  const ratio = d.ratio_common || d.noaa20.map((v, i) => (v != null && d.snpp[i] > 0 ? v / d.snpp[i] : null));
  const yr = d3.scaleLinear().domain([0.75, 1.25]).range([m.t + h1 + gap + h2, m.t + h1 + gap]);
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", `Global monthly fire cell-days ${y0}–${y0 + Math.floor((n - 1) / 12)}: actual Aqua and virtual Aqua from Suomi NPP and NOAA-20 follow each other closely; NOAA-20 divided by Suomi NPP stays near 1.`);
  const defs = svg.append("defs");
  defs.append("pattern").attr("id", "hoHatch").attr("width", 7).attr("height", 7).attr("patternUnits", "userSpaceOnUse")
    .attr("patternTransform", "rotate(45)").append("rect").attr("width", 1.2).attr("height", 7).attr("fill", "rgba(142,197,255,.10)");

  // context bands: teaching window, Aqua drift
  const top = m.t, bot = m.t + h1 + gap + h2;
  svg.append("rect").attr("x", x(2012)).attr("width", x(2022) - x(2012)).attr("y", top).attr("height", bot - top).attr("fill", "rgba(255,106,31,.045)");
  svg.append("rect").attr("x", x(2022)).attr("width", x(y0 + n / 12) - x(2022)).attr("y", top).attr("height", h1).attr("fill", "url(#hoHatch)");
  svg.append("text").attr("x", x(2012) + 8).attr("y", top + 14).style("fill", "#ffb25c").text(compact ? "TEACHING WINDOW" : "TEACHING WINDOW · 2012–2021");
  svg.append("text").attr("x", x(2022) + 8).attr("y", top + 14).style("fill", COL.aqua).text(compact ? "AQUA DRIFT" : "AQUA ORBIT DRIFTING");

  // top panel: totals
  y.ticks(compact ? 3 : 4).forEach(v => {
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", "rgba(255,255,255,.06)");
    svg.append("text").attr("x", m.l - 6).attr("y", y(v) + 4).attr("text-anchor", "end").text(v ? d3.format(".2~s")(v) : "0");
  });
  const line = arr => d3.line().defined(v => v != null).x((v, i) => x(at(i))).y(v => y(v)).curve(d3.curveMonotoneX)(arr);
  const series = [
    { k: "aqua", name: "Aqua MODIS, actual", w: 1.3, dash: null },
    { k: "snpp", name: "Virtual Aqua from Suomi NPP", w: 1.7, dash: null },
    { k: "noaa20", name: "Virtual Aqua from NOAA-20", w: 1.7, dash: "5 3" },
  ];
  for (const s of series) {
    svg.append("path").attr("d", line(d[s.k])).attr("fill", "none").attr("stroke", COL[s.k]).attr("stroke-width", s.w)
      .attr("stroke-dasharray", s.dash).attr("stroke-linejoin", "round").attr("opacity", s.k === "aqua" ? 0.85 : 1);
  }
  // legend
  let lx = m.l, ly = compact ? m.t - 34 : m.t - 18;
  series.forEach(s => {
    const g = svg.append("g");
    g.append("line").attr("x1", 0).attr("x2", 18).attr("y1", -4).attr("y2", -4).attr("stroke", COL[s.k]).attr("stroke-width", 2.2).attr("stroke-dasharray", s.dash);
    const t = g.append("text").attr("class", "lg").attr("x", 24).attr("y", 0).text(compact ? s.name.replace("Virtual Aqua from ", "via ").replace(", actual", "") : s.name);
    const w = 24 + (t.node().getComputedTextLength?.() || 120);
    if (lx > m.l && lx + w > W - 4) { lx = m.l; ly += 16; } // wrap on narrow screens
    g.attr("transform", `translate(${lx},${ly})`);
    lx += w + (compact ? 14 : 26);
  });
  if (!compact) {
    // annotate yearly agreement at the right edge
    const last = n - 1;
    [["aqua", "Aqua"], ["snpp", "S-NPP"], ["noaa20", "NOAA-20"]].forEach(([k, lab], i) => {
      svg.append("text").attr("x", W - m.r + 10).attr("y", m.t + 40 + i * 16).style("fill", COL[k]).text(`${lab} ${d3.format(".3~s")(d3.sum(d[k].slice(last - 11)))}/yr`);
    });
    svg.append("text").attr("x", W - m.r + 10).attr("y", m.t + 22).text(`${y0 + Math.floor(last / 12)} TOTAL`);
  }

  // bottom panel: NOAA-20 / S-NPP
  const by = m.t + h1 + gap;
  svg.append("rect").attr("x", m.l).attr("width", W - m.r - m.l).attr("y", yr(1.1)).attr("height", yr(0.9) - yr(1.1)).attr("fill", "rgba(255,255,255,.035)");
  svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", yr(1)).attr("y2", yr(1)).attr("stroke", "rgba(255,255,255,.22)").attr("stroke-dasharray", "2 3");
  [0.9, 1, 1.1].forEach(v => svg.append("text").attr("x", m.l - 6).attr("y", yr(v) + 4).attr("text-anchor", "end").text(v === 1 ? "1.0" : v));
  svg.append("path").attr("d", d3.line().defined(v => v != null).x((v, i) => x(at(i))).y(v => yr(Math.max(0.75, Math.min(1.25, v))))(ratio))
    .attr("fill", "none").attr("stroke", "#ffd2a1").attr("stroke-width", 1.5);
  svg.append("text").attr("x", m.l + 8).attr("y", by + 2).style("fill", "#ffd2a1").text(compact ? "NOAA-20 ÷ S-NPP, same days" : "NOAA-20 ÷ SUOMI NPP · days both flew · band = ±10%");
  if (!compact) svg.append("text").attr("x", W - m.r + 10).attr("y", yr(1) + 4).style("fill", "#ffd2a1").text("1.0 = identical");

  svg.append("g").attr("transform", `translate(0,${H - m.b + 6})`)
    .call(d3.axisBottom(x).tickValues(d3.range(y0, y0 + n / 12 + 0.01, compact ? 4 : 2)).tickFormat(d3.format("d")).tickSize(0))
    .call(g => g.select(".domain").remove());

  const a = d.agreement;
  document.getElementById("hoStats").innerHTML =
    `<div><dt>Correlation (log)</dt><dd class="hot">${a.r_log.toFixed(3)}</dd></div>` +
    `<div><dt>Median gap</dt><dd>${a.median_gap_pct >= 0 ? "+" : ""}${a.median_gap_pct}%</dd></div>` +
    `<div><dt>Country-months</dt><dd>${d3.format(",")(a.country_months)}</dd></div>`;
}

let relayData = null, hoW = 0;
fetch("data/relay.json").then(r => (r.ok ? r.json() : null)).then(d => { relayData = d; drawHandover(d); hoW = innerWidth; }).catch(() => {});
addEventListener("resize", () => {
  if (!relayData || Math.abs(innerWidth - hoW) < 40) return;
  hoW = innerWidth;
  drawHandover(relayData);
});
