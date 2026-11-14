/* global d3, topojson */
// Hero: a night-side Earth whose only light is real fire.
// 14,000 most active 0.25° cells from the harmonized record (2003–2025), animated through a typical year.

const canvas = document.getElementById("globe");
const ctx = canvas.getContext("2d");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const SEC_PER_MONTH = 2.4;

let W = 0, H = 0, DPR = 1, R = 0, cx = 0, cy = 0;
let land = null, cells = null;
let rot = [-20, -8], t = 7.0, last = performance.now(), visible = true, dragging = null, velocity = 0.0;
const projection = d3.geoOrthographic().clipAngle(90).precision(0.6);
const path = d3.geoPath(projection, ctx);
const graticule = d3.geoGraticule10();
const stars = [], sparks = [];

// pre-rendered glow sprite for fire points (additive blending)
const sprite = (() => {
  const c = document.createElement("canvas"), s = 64;
  c.width = c.height = s;
  const g = c.getContext("2d"), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, "rgba(255,244,214,1)");
  gr.addColorStop(0.18, "rgba(255,190,100,.9)");
  gr.addColorStop(0.45, "rgba(255,110,35,.35)");
  gr.addColorStop(1, "rgba(255,70,20,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  return c;
})();

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (W > 900) { R = Math.min(W * 0.32, H * 0.47); cx = W * 0.71; cy = H * 0.53; }
  else { R = Math.max(W * 0.78, 300); cx = W * 0.5; cy = H + R * 0.28; }
  projection.scale(R).translate([cx, cy]);
  stars.length = 0;
  const n = Math.round((W * H) / 5200);
  for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 0.9 + 0.15, a: Math.random() * 0.5 + 0.1, p: Math.random() * 6.28 });
}

function drawSpace(time) {
  ctx.fillStyle = "#050506";
  ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    const a = s.a * (reduce ? 1 : 0.75 + 0.25 * Math.sin(time * 0.0012 + s.p));
    ctx.fillStyle = `rgba(255,240,225,${a})`;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
}

function drawAtmosphere() {
  // wide warm halo (the "eclipse" rim)
  const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.42);
  halo.addColorStop(0, "rgba(255,120,40,.30)");
  halo.addColorStop(0.18, "rgba(255,95,30,.13)");
  halo.addColorStop(0.5, "rgba(255,80,25,.04)");
  halo.addColorStop(1, "rgba(255,80,25,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.42, 0, Math.PI * 2); ctx.fill();
  // sunrise arc on the upper-left limb
  ctx.save();
  ctx.lineCap = "round";
  for (const [w, a, blur] of [[22, 0.10, 40], [9, 0.28, 18], [2.2, 0.95, 6]]) {
    ctx.shadowColor = "rgba(255,150,60,1)";
    ctx.shadowBlur = blur;
    ctx.strokeStyle = `rgba(255,${w > 5 ? 140 : 214},${w > 5 ? 60 : 160},${a})`;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(cx, cy, R + w * 0.2, Math.PI * 1.02, Math.PI * 1.62); ctx.stroke();
  }
  ctx.restore();
}

function drawBody() {
  const body = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.1, cx, cy, R);
  body.addColorStop(0, "#17140f");
  body.addColorStop(0.55, "#0b0a0a");
  body.addColorStop(1, "#060606");
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); path(graticule);
  ctx.strokeStyle = "rgba(255,255,255,.035)"; ctx.lineWidth = 0.6; ctx.stroke();
  if (land) {
    ctx.beginPath(); path(land);
    ctx.fillStyle = "rgba(255,236,214,.045)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,226,190,.13)"; ctx.lineWidth = 0.6; ctx.stroke();
  }
}

function drawFires() {
  if (!cells) return;
  const m0 = Math.floor(t) % 12, m1 = (m0 + 1) % 12, f = t - Math.floor(t);
  const ease = f * f * (3 - 2 * f);
  const [lam, phi] = rot;
  const l0 = (-lam * Math.PI) / 180, p0 = (-phi * Math.PI) / 180;
  const sp0 = Math.sin(p0), cp0 = Math.cos(p0);
  const base = Math.max(1.2, R / 210);
  ctx.globalCompositeOperation = "lighter";
  const { n, lat, lon, v, sl, cl } = cells;
  for (let i = 0; i < n; i++) {
    // visibility: cosine of angle between point and view centre
    const cosc = sp0 * sl[i] + cp0 * cl[i] * Math.cos((lon[i] * Math.PI) / 180 - l0);
    if (cosc <= 0.02) continue;
    const val = v[i * 12 + m0] * (1 - ease) + v[i * 12 + m1] * ease;
    if (val < 0.5) continue;
    const p = projection([lon[i], lat[i]]);
    const s = base * (0.9 + Math.min(Math.sqrt(val), 6) * 0.3) * (0.45 + 0.55 * cosc);
    ctx.globalAlpha = Math.min(0.6, 0.08 + Math.log1p(val) * 0.085) * Math.min(1, cosc * 2.2);
    ctx.drawImage(sprite, p[0] - s, p[1] - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawLimb() {
  // darken towards the limb so the sphere reads as a ball
  const g = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.0);
  g.addColorStop(0, "rgba(5,5,6,0)");
  g.addColorStop(1, "rgba(5,5,6,.55)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
}

function drawSparks(dt) {
  if (reduce) return;
  if (sparks.length < 70 && Math.random() < 0.5) {
    const a = Math.PI * (1.0 + Math.random() * 0.75);
    sparks.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, vx: (Math.random() - 0.5) * 8, vy: -8 - Math.random() * 18, life: 0, max: 3 + Math.random() * 4, r: Math.random() * 1.4 + 0.4 });
  }
  ctx.globalCompositeOperation = "lighter";
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt; s.x += s.vx * dt + Math.sin(s.life * 2 + i) * 0.15; s.y += s.vy * dt;
    const k = s.life / s.max;
    if (k >= 1) { sparks.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(255,${150 + 80 * (1 - k)},${80 * (1 - k)},${(1 - k) * 0.8})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

const ringArc = document.getElementById("ringArc"), monthEl = document.getElementById("heroMonth");
let lastMonth = -1;
function updateMeta() {
  const m = Math.floor(t) % 12;
  if (m !== lastMonth) { monthEl.textContent = MONTHS[m]; lastMonth = m; }
  ringArc.style.strokeDashoffset = String(119.4 * (1 - ((t % 12) / 12)));
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!dragging) {
    rot[0] += (velocity + 3.2) * dt;
    velocity *= 0.95;
    t = (t + dt / SEC_PER_MONTH) % 12;
  }
  projection.rotate(rot);
  drawSpace(now);
  drawAtmosphere();
  drawBody();
  drawFires();
  drawLimb();
  drawSparks(dt);
  updateMeta();
  if (visible && !reduce) requestAnimationFrame(frame);
}
function renderOnce() { projection.rotate(rot); drawSpace(0); drawAtmosphere(); drawBody(); drawFires(); drawLimb(); updateMeta(); }

// drag to spin
canvas.addEventListener("pointerdown", e => {
  dragging = { x: e.clientX, y: e.clientY, r: [...rot], lastX: e.clientX, lastT: performance.now() };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add("dragging");
});
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  const k = 90 / R;
  rot[0] = dragging.r[0] + (e.clientX - dragging.x) * k;
  rot[1] = Math.max(-55, Math.min(55, dragging.r[1] - (e.clientY - dragging.y) * k));
  const now = performance.now();
  velocity = ((e.clientX - dragging.lastX) * k) / Math.max(0.016, (now - dragging.lastT) / 1000);
  dragging.lastX = e.clientX; dragging.lastT = now;
  if (reduce) renderOnce();
});
const endDrag = () => { dragging = null; canvas.classList.remove("dragging"); velocity = Math.max(-120, Math.min(120, velocity)); };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// pause when the hero is off-screen
new IntersectionObserver(([e]) => {
  const was = visible;
  visible = e.isIntersecting;
  if (visible && !was && !reduce) { last = performance.now(); requestAnimationFrame(frame); }
}).observe(canvas);

addEventListener("resize", () => { resize(); if (reduce) renderOnce(); });

async function boot() {
  resize();
  // on phones only the planet's upper arc is on screen: tilt so the tropics' fire belts sit on that arc
  if (W <= 900) rot = [-15, 48];
  renderOnce();
  const [world, hero] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json").then(r => r.json()).catch(() => null),
    fetch("data/hero.json").then(r => r.json()).catch(() => null),
  ]);
  if (world) land = topojson.feature(world, world.objects.land);
  if (hero) {
    const n = hero.n, lat = Float32Array.from(hero.lat), lon = Float32Array.from(hero.lon);
    cells = { n, lat, lon, v: Float32Array.from(hero.v, x => x / 10),
              sl: lat.map(a => Math.sin((a * Math.PI) / 180)), cl: lat.map(a => Math.cos((a * Math.PI) / 180)) };
  }
  if (reduce) { t = 7.3; renderOnce(); } else requestAnimationFrame(frame);
}
boot();
