"""Export harmonized products as small static files for the web app (no server, no API key).

web/data/meta.json                 global metadata, model card, satellite timeline, country index
web/data/countries/<slug>.json     monthly series per country (harmonized, raw, actual Aqua/Terra)
web/data/tiles/<tx>_<ty>.bin       5x5 deg tiles of 0.1 deg cell-month records, binary (for drawn areas)
web/data/overview.png              Web-Mercator activity raster (mean annual harmonized cell-days)
"""
import gzip
import json
import math
import re
import shutil
from pathlib import Path

import duckdb
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
H = ROOT / "data" / "processed" / "harmonized"
WEB = ROOT / "web" / "data"
Y0 = 2000  # month index 0 = Jan 2000
TILE = 50  # cells per tile side (0.1 deg cells -> 5 deg tiles)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unknown"


def varint(a):
    """Vectorised LEB128 encoding of a non-negative integer array."""
    a = np.asarray(a, dtype=np.uint64)
    nbytes = np.ones(len(a), dtype=np.int64)
    for k in range(1, 5):
        nbytes += a >= (1 << (7 * k))
    off = np.cumsum(nbytes) - nbytes
    out = np.zeros(int(nbytes.sum()), dtype=np.uint8)
    for k in range(int(nbytes.max()) if len(a) else 0):
        m = nbytes > k
        b = (a[m] >> np.uint64(7 * k)) & np.uint64(0x7F)
        b |= np.where(nbytes[m] > k + 1, np.uint64(0x80), np.uint64(0))
        out[off[m] + k] = b.astype(np.uint8)
    return out.tobytes()


def write_tile(g, tx, ty, cidx):
    """Tile format ALZ1 (all varints after the 12-byte header, gzip-compressed):
    header  'ALZ1' uint32 nCells uint32 nRows
    cells   local index delta (local = (gy-ty*T)*T + gx-tx*T, ascending), country index + 1, row count
    rows    month delta (absolute for each cell's first row), harm*10, raw MODIS, raw VIIRS
    """
    g = g.reset_index(drop=True)
    local = ((g.gy - ty * TILE) * TILE + (g.gx - tx * TILE)).to_numpy(np.int64)
    first = np.r_[True, local[1:] != local[:-1]]
    cl = local[first]
    counts = np.diff(np.r_[np.flatnonzero(first), len(g)])
    ctry = np.array([cidx.get(x, -1) + 1 for x in g.country[first]])
    m = g.m.to_numpy(np.int64)
    md = np.where(first, m, m - np.r_[0, m[:-1]])
    body = b"".join([
        varint(np.diff(np.r_[0, cl])), varint(ctry), varint(counts),
        varint(md), varint(np.round(g.harm.to_numpy() * 10)), varint(g.raw_modis.fillna(0).to_numpy()),
        varint(g.raw_viirs.fillna(0).to_numpy()),
    ])
    head = b"ALZ1" + np.array([len(cl), len(g)], dtype="<u4").tobytes()
    (WEB / "tiles" / f"{tx}_{ty}.bin").write_bytes(gzip.compress(head + body, 9))


def main():
    for sub in ("countries", "tiles"):  # regenerate only what this script owns (hero.json is separate)
        if (WEB / sub).exists():
            shutil.rmtree(WEB / sub)
        (WEB / sub).mkdir(parents=True)
    con = duckdb.connect()
    cm = (H / "cellmonth.parquet").as_posix()
    con.execute(f"""CREATE VIEW c AS SELECT *, (year(ym)-{Y0})*12 + month(ym)-1 AS m FROM '{cm}'
                    WHERE country <> ''""")
    last_m = con.execute("SELECT max(m) FROM c").fetchone()[0]
    first_m = con.execute("SELECT min(m) FROM c").fetchone()[0]

    # ---- country index + series
    countries = con.execute("""
      SELECT country, min(gy)/10.0 s, (max(gy)+1)/10.0 n, min(gx)/10.0 w, (max(gx)+1)/10.0 e, sum(harm) tot
      FROM c GROUP BY country ORDER BY country""").df()
    cidx = {n: i for i, n in enumerate(countries.country)}
    cmon = con.execute(f"""SELECT *, (year(ym)-{Y0})*12 + month(ym)-1 AS m
                           FROM '{(H / 'country_month.parquet').as_posix()}' WHERE country <> ''""").df()
    n_m = last_m + 1
    for name, g in cmon.groupby("country"):
        def arr(col, nd=1):
            a = np.zeros(n_m)
            a[g.m.values] = g[col].fillna(0).values
            return [round(float(x), nd) for x in a]
        (WEB / "countries" / f"{slug(name)}.json").write_text(json.dumps({
            "name": name.replace("_", " "), "harm": arr("harm"), "raw_modis": arr("raw_modis", 0),
            "raw_viirs": arr("raw_viirs", 0), "aqua_actual": arr("aqua_actual", 0), "terra_actual": arr("terra_actual", 0),
        }, separators=(",", ":")))

    # ---- tiles: compact binary (columnar varint streams, gzip) -- see web/js/data.js decodeTile()
    tiles = []
    nb = con.execute(f"SELECT min(floor(gy/{TILE})), max(floor(gy/{TILE})) FROM c").fetchone()
    for ty in range(int(nb[0]), int(nb[1]) + 1):
        df = con.execute(f"""SELECT floor(gx/{TILE})::INT tx, gy, gx, country, m, harm, raw_modis, raw_viirs FROM c
                             WHERE floor(gy/{TILE})::INT = ? AND (harm > 0 OR raw_modis > 0 OR raw_viirs > 0)
                             ORDER BY tx, gy, gx, m""", [ty]).df()
        if df.empty:
            continue
        for tx, g in df.groupby("tx", sort=False):
            write_tile(g, int(tx), ty, cidx)
            tiles.append(f"{int(tx)}_{ty}")

    # ---- overview raster: mean annual harmonized cell-days, Web Mercator 2048x2048
    grid = np.zeros((1800, 3600))
    agg = con.execute(f"SELECT gy, gx, sum(harm) v FROM c WHERE m BETWEEN {(2003-Y0)*12} AND {(2025-Y0)*12+11} GROUP BY ALL").df()
    grid[(agg.gy + 900).clip(0, 1799), (agg.gx + 1800).clip(0, 3599)] += agg.v / 23.0
    N = 2048
    ys = np.arange(N) + 0.5
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * ys / N))))
    rows_idx = np.clip(np.floor((lat + 90) * 10).astype(int), 0, 1799)
    xs = (np.arange(N) + 0.5) / N * 360 - 180
    cols_idx = np.clip(np.floor((xs + 180) * 10).astype(int), 0, 3599)
    merc = grid[rows_idx][:, cols_idx]
    v = np.log10(1 + merc) / np.log10(1 + max(np.percentile(merc[merc > 0], 99.5), 1)) if (merc > 0).any() else merc
    v = np.clip(v, 0, 1)
    # warm ramp (dark red -> orange -> pale yellow); alpha follows intensity
    r = np.interp(v, [0, .4, .8, 1], [120, 220, 255, 255])
    gch = np.interp(v, [0, .4, .8, 1], [10, 60, 170, 240])
    b = np.interp(v, [0, .4, .8, 1], [30, 20, 40, 160])
    a = np.where(merc > 0, np.interp(v, [0, .2, 1], [70, 170, 255]), 0)
    Image.fromarray(np.dstack([r, gch, b, a]).astype(np.uint8), "RGBA").save(WEB / "overview.png", optimize=True)

    # ---- metadata
    card = json.loads((H / "model_card.json").read_text())
    sn = card["satellites"]["SNPP"]["test_metrics"]
    meta = {
        "project": "ALAZ Relay", "tagline": "Satellites changed. Fires didn't.",
        "unit": card["unit"], "month0": f"{Y0}-01", "first_month": int(first_m), "last_month": int(last_m),
        "tile_cells": TILE, "cell_deg": 0.1, "tiles": sorted(tiles),
        # where each part of the harmonized series comes from (month indices, inclusive)
        "segments": [
            {"src": "terra", "label": "Terra MODIS, converted to Aqua-equivalent", "from": 10, "to": (2002-Y0)*12+6, "sigma_log": 0.30},
            {"src": "aqua", "label": "Aqua MODIS (reference sensor)", "from": (2002-Y0)*12+7, "to": (2011-Y0)*12+11, "sigma_log": 0.0},
            {"src": "virtual", "label": "Virtual Aqua from VIIRS (S-NPP + NOAA-20 relay)", "from": (2012-Y0)*12, "to": int(last_m),
             "sigma_log": round(sn["sigma_log"], 3)},
        ],
        "validation": {s: v["test_metrics"] | {"train": v["train"], "test": v["test"]} for s, v in card["satellites"].items()},
        "satellites": [
            {"name": "Terra (MODIS)", "start": "2000-02", "end": "2027-02", "note": "morning orbit drifting since ~2022; end of science ~Feb 2027"},
            {"name": "Aqua (MODIS)", "start": "2002-07", "end": "2027-09", "note": "afternoon orbit drifting since ~2022; end of science ~Sep 2027"},
            {"name": "Suomi NPP (VIIRS)", "start": "2012-01", "end": "2026-11", "note": "FIRMS stream ended 2 Nov 2026"},
            {"name": "NOAA-20 (VIIRS)", "start": "2018-04", "end": None, "note": ""},
            {"name": "NOAA-21 (VIIRS)", "start": "2023-03", "end": None, "note": "not yet in relay"},
        ],
        "countries": [{"name": r.country.replace("_", " "), "slug": slug(r.country), "bbox": [r.w, r.s, r.e, r.n],
                       "total": round(float(r.tot))} for r in countries.itertuples()],
    }
    (WEB / "meta.json").write_text(json.dumps(meta, indent=1))
    size = sum(p.stat().st_size for p in WEB.rglob("*") if p.is_file())
    print(f"exported {len(countries)} countries, {len(tiles)} tiles, {size/1e6:.1f} MB")


if __name__ == "__main__":
    main()
