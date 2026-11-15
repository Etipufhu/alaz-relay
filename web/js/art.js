// Animated overlays for the two AI-generated illustrations (relay section and closing band).
// The pictures stay still; on top of them: Earth's lights flicker like fires, stars twinkle,
// and (in the relay picture) a pulse of light passes from satellite to satellite.
// Light and star positions were measured from the pictures themselves (bright orange / white specks).
const PTS = {"relay":{"fire":[[59.4,84.1,3],[16.8,81.6,3],[19.8,73.3,3],[73.5,94.8,3],[24.0,85.3,3],[67.1,90.8,2],[74.1,92.2,2],[63.4,86.3,2],[62.2,85.5,2],[50.7,80.6,2],[39.0,89.0,1],[27.1,76.7,1],[26.1,74.3,1],[32.9,83.8,1],[13.9,80.9,1],[26.1,85.4,1],[76.4,96.2,1],[35.8,87.3,1],[29.3,77.3,1],[79.5,94.0,1],[43.9,95.7,1],[16.1,87.4,1],[72.3,95.3,1],[24.3,75.5,1],[21.2,85.7,1],[70.2,95.0,1],[20.9,83.6,1],[16.7,82.7,1],[36.5,86.1,1],[35.1,76.9,1],[22.5,85.5,1],[15.9,90.3,1],[24.3,84.3,1],[36.5,90.4,1],[17.1,80.4,1],[24.2,86.8,1],[17.8,87.6,1],[71.0,95.2,1],[49.1,80.8,1],[47.6,94.0,1],[17.9,82.1,1],[11.6,91.8,1],[23.4,92.0,1],[18.4,85.8,1],[17.6,84.5,1]],"star":[[89.3,40.9],[82.1,26.8],[68.0,31.8],[90.9,76.9],[81.9,77.9],[80.8,32.2],[76.4,23.2],[63.5,15.8]]},"earth":{"fire":[[91.0,30.2,3],[86.0,36.4,3],[88.1,31.6,3],[62.6,74.7,3],[56.4,55.6,2],[89.9,80.7,2],[86.8,32.3,2],[84.6,53.3,2],[95.8,38.6,1],[85.7,32.9,1],[92.0,31.6,1],[96.2,77.8,1],[83.8,34.6,1],[84.4,35.4,1],[77.6,46.8,1],[96.4,38.8,1],[85.5,33.6,1],[77.7,45.3,1],[53.3,53.9,1],[97.8,52.0,1],[83.5,35.6,1],[54.0,91.2,1],[93.8,79.8,1],[83.6,37.1,1],[53.1,62.7,1],[61.9,77.0,1],[92.5,33.5,1],[82.8,35.9,1],[56.9,87.5,1],[97.3,71.8,1],[87.7,72.2,1],[54.6,74.0,1],[87.8,61.5,1],[61.1,70.5,1],[83.9,52.8,1],[81.9,35.4,1],[64.2,74.1,1],[97.9,37.9,1],[96.8,36.2,1],[93.4,82.5,1],[93.0,33.3,1],[92.2,84.0,1],[97.9,73.0,1],[62.8,69.8,1],[55.6,57.6,1]],"star":[[96.9,3.0],[78.2,7.9],[72.9,1.5],[35.6,3.6],[35.2,18.5],[24.2,82.2],[8.9,24.3],[1.0,1.9],[90.6,1.5],[42.2,43.8],[37.1,40.1],[34.8,47.7],[33.1,10.7],[29.4,76.4],[4.1,85.3]]}};
const NS = "http://www.w3.org/2000/svg";
const SIZE = { relay: [1536, 1024], earth: [1672, 941] };
// relay picture: the two glowing links and the satellites that receive them (image pixels)
const BEAMS = [{ a: [398, 347], b: [584, 413], at: [775, 430], d: 0 }, { a: [940, 512], b: [1140, 563], at: [1185, 572], d: 1.3 }];

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};

function build(svg) {
  const key = svg.dataset.art, [W, H] = SIZE[key], r = rng(key === "relay" ? 7 : 11);
  const defs = el("defs", {}, svg);
  const fireG = el("radialGradient", { id: `fire-${key}` }, defs);
  [["0%", "#fff6c8", 1], ["35%", "#ffb347", 0.9], ["70%", "#ff5a1a", 0.35], ["100%", "#ff3c00", 0]]
    .forEach(([o, c, a]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, fireG));
  const g = el("g", { class: "fx" }, svg);
  for (const [x, y, s] of PTS[key].fire) {
    el("circle", { class: "fire", cx: (x / 100) * W, cy: (y / 100) * H, r: 6 + s * 5, fill: `url(#fire-${key})`,
      style: `--t:${(1.4 + r() * 2.2).toFixed(2)}s;--d:-${(r() * 4).toFixed(2)}s` }, g);
  }
  // measured stars, plus a few more scattered in empty sky
  const stars = [...PTS[key].star];
  for (let i = 0; i < 26; i++) {
    const x = r() * 100, y = r() * 100;
    const sky = key === "earth" ? x < 40 || y < 10 : y < 60 + 0.1 * x && !(x > 3 && x < 62 && y > 13 && y < 53) && !(x > 72 && y > 44);
    if (sky) stars.push([+x.toFixed(1), +y.toFixed(1)]);
  }
  for (const [x, y] of stars) {
    el("circle", { class: "star", cx: (x / 100) * W, cy: (y / 100) * H, r: 1.6 + r() * 1.8,
      style: `--t:${(2.5 + r() * 3.5).toFixed(2)}s;--d:-${(r() * 6).toFixed(2)}s` }, g);
  }
  if (key === "relay") {
    const blur = el("filter", { id: "beamglow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: 4 }, blur);
    const haloG = el("radialGradient", { id: "halo" }, defs);
    [["0%", "#fff1c4", 0.95], ["45%", "#ffa040", 0.45], ["100%", "#ff7a1a", 0]].forEach(([o, c, a]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, haloG));
    for (const b of BEAMS) {
      const line = { x1: b.a[0], y1: b.a[1], x2: b.b[0], y2: b.b[1], pathLength: 100, style: `--d:${b.d}s` };
      el("line", { ...line, class: "beam glow", filter: "url(#beamglow)" }, g);
      el("line", { ...line, class: "beam" }, g);
      el("circle", { class: "halo", cx: b.at[0], cy: b.at[1], r: 120, fill: "url(#halo)", style: `--d:${b.d}s` }, g);
    }
  }
}

const figs = document.querySelectorAll("[data-art-host]");
document.querySelectorAll("svg.art-fx").forEach(build);
// run the animations only while the picture is on screen
const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("playing", e.isIntersecting)), { rootMargin: "120px" });
figs.forEach(f => io.observe(f));
