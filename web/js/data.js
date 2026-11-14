// Data access + aggregation for ALAZ Relay. All data is static (JSON + binary tiles) produced by pipeline/export_web.py.

const cache = new Map();
async function getJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(url);
}

// Binary cell tiles (format ALZ1, written by export_web.py write_tile): gzip + columnar varints.
async function gunzipIfNeeded(buf) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return b; // server already decoded it
  const stream = new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function decodeTile(b, tx, ty) {
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== "ALZ1") return null;
  const dv = new DataView(b.buffer, b.byteOffset);
  const nC = dv.getUint32(4, true), nR = dv.getUint32(8, true);
  let p = 12;
  const read = n => {
    const a = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0, shift = 0, byte;
      do { byte = b[p++]; v += (byte & 0x7f) * 2 ** shift; shift += 7; } while (byte & 0x80);
      a[i] = v;
    }
    return a;
  };
  const dl = read(nC), ctry = read(nC), cnt = read(nC), md = read(nR), h = read(nR), rm = read(nR), rv = read(nR);
  const T = META.tile_cells, cells = new Int32Array(nC * 3), rows = new Int32Array(nR * 5);
  let local = 0, r = 0;
  for (let c = 0; c < nC; c++) {
    local += dl[c];
    cells[c * 3] = ty * T + Math.floor(local / T);
    cells[c * 3 + 1] = tx * T + (local % T);
    cells[c * 3 + 2] = ctry[c] - 1;
    let m = 0;
    for (let k = 0; k < cnt[c]; k++, r++) {
      m = k === 0 ? md[r] : m + md[r];
      rows.set([c, m, h[r], rm[r], rv[r]], r * 5);
    }
  }
  return { cells, rows };
}
async function getTile(tx, ty) {
  const key = `${tx}_${ty}`;
  if (META.tiles && !TILESET.has(key)) return null; // no fire ever detected here
  if (!cache.has(key)) {
    cache.set(key, fetch(`data/tiles/${key}.bin`)
      .then(r => (r.ok ? r.arrayBuffer() : null))
      .then(buf => (buf ? gunzipIfNeeded(buf).then(b => decodeTile(b, tx, ty)) : null))
      .catch(() => null));
  }
  return cache.get(key);
}
let TILESET = new Set();

export let META = null;
export async function loadMeta() {
  META = await getJSON("data/meta.json");
  TILESET = new Set(META?.tiles || []);
  return META;
}

export const monthLabel = m => {
  const y = 2000 + Math.floor(m / 12);
  return `${y}-${String((m % 12) + 1).padStart(2, "0")}`;
};
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function segmentOf(m) {
  return META.segments.find(s => m >= s.from && m <= s.to) || null;
}

// ---- geometry helpers
function pointInPolygon(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function bboxOf(ring) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}
export function areaKm2(ring) {
  // spherical excess approximation, good enough for display
  const R = 6371, rad = Math.PI / 180;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    a += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((a * R * R) / 2);
}
export function circleRing(lat, lon, km, n = 64) {
  const ring = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const dy = (km / 111.32) * Math.sin(t);
    const dx = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(t);
    ring.push([lon + dx, lat + dy]);
  }
  ring.push(ring[0]);
  return ring;
}

// ---- series container: one value per month index
function emptySeries(n) {
  return { harm: new Float64Array(n), raw_modis: new Float64Array(n), raw_viirs: new Float64Array(n), cells: 0 };
}

/** Aggregate all 0.1° cells whose centre lies inside `ring` (lon/lat). */
export async function aggregatePolygon(ring) {
  const n = META.last_month + 1;
  const out = emptySeries(n);
  const [w, s, e, nn] = bboxOf(ring);
  const T = META.tile_cells; // cells per tile side
  const tx0 = Math.floor((w * 10) / T), tx1 = Math.floor((e * 10) / T);
  const ty0 = Math.floor((s * 10) / T), ty1 = Math.floor((nn * 10) / T);
  const nTiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  if (nTiles > 64) throw new Error("Area too large for cell-level analysis — please pick a country or a smaller area.");
  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(getTile(tx, ty));
  const tiles = await Promise.all(jobs);
  const countryHits = new Map();
  for (const t of tiles) {
    if (!t) continue;
    const inside = [];
    for (let i = 0; i < t.cells.length; i += 3) {
      const gy = t.cells[i], gx = t.cells[i + 1];
      const ok = pointInPolygon((gx + 0.5) / 10, (gy + 0.5) / 10, ring);
      inside.push(ok);
      if (ok) {
        out.cells++;
        const c = t.cells[i + 2];
        countryHits.set(c, (countryHits.get(c) || 0) + 1);
      }
    }
    const r = t.rows;
    for (let i = 0; i < r.length; i += 5) {
      if (!inside[r[i]]) continue;
      const m = r[i + 1];
      out.harm[m] += r[i + 2] / 10;
      out.raw_modis[m] += r[i + 3];
      out.raw_viirs[m] += r[i + 4];
    }
  }
  out.countries = [...countryHits.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => META.countries[c]?.name).filter(Boolean);
  return out;
}

export async function countrySeries(slug) {
  const d = await getJSON(`data/countries/${slug}.json`);
  if (!d) return null;
  const n = META.last_month + 1;
  const pad = a => Float64Array.from({ length: n }, (_, i) => a[i] || 0);
  return { harm: pad(d.harm), raw_modis: pad(d.raw_modis), raw_viirs: pad(d.raw_viirs),
           aqua_actual: pad(d.aqua_actual), terra_actual: pad(d.terra_actual), countries: [d.name] };
}

// ---- statistics
const Z90 = 1.645;
/** 90% interval of a harmonized monthly value: model error (log-normal) + counting noise. */
export function interval(v, m) {
  const seg = segmentOf(m);
  const sm = seg ? seg.sigma_log : 0.3;
  const sigma = Math.sqrt(sm * sm + 1 / Math.max(v, 1));
  return [v * Math.exp(-Z90 * sigma), v * Math.exp(Z90 * sigma)];
}

export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Per calendar month baseline (median, quartiles, max) of harmonized values over baseline years. */
export function baseline(series, y0, y1) {
  const out = [];
  for (let mo = 0; mo < 12; mo++) {
    const vals = [];
    for (let y = y0; y <= y1; y++) {
      const m = (y - 2000) * 12 + mo;
      if (m >= META.first_month && m <= META.last_month) vals.push(series.harm[m]);
    }
    vals.sort((a, b) => a - b);
    out.push({ med: quantile(vals, 0.5), q1: quantile(vals, 0.25), q3: quantile(vals, 0.75),
               p90: quantile(vals, 0.9), max: vals[vals.length - 1] ?? NaN, n: vals.length });
  }
  return out;
}

/** Classify a month against its baseline, taking the uncertainty band into account. */
export function classify(v, m, base) {
  const b = base[m % 12];
  const [lo, hi] = interval(v, m);
  if (!b || !(b.med >= 0)) return { cls: "na" };
  if (lo > b.max && v > 0) return { cls: "record", lo, hi, b };
  if (lo > b.q3) return { cls: "above", lo, hi, b };
  if (hi < b.q1) return { cls: "below", lo, hi, b };
  return { cls: "normal", lo, hi, b };
}

export function toCSV(series, name) {
  const lines = ["month,harmonized_cell_days,lower90,upper90,source,raw_modis_hotspots,raw_viirs_hotspots"];
  for (let m = META.first_month; m <= META.last_month; m++) {
    const v = series.harm[m];
    const [lo, hi] = interval(v, m);
    lines.push([monthLabel(m), v.toFixed(2), lo.toFixed(2), hi.toFixed(2), segmentOf(m)?.src ?? "",
                series.raw_modis[m], series.raw_viirs[m]].join(","));
  }
  const header = `# ALAZ Relay export: ${name}\n# unit: ${META.unit}\n# generated: ${new Date().toISOString()}\n`;
  return header + lines.join("\n") + "\n";
}
