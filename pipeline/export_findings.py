"""Findings for the web page: what the harmonized record says that raw hotspot maps get wrong.

1. Global trend: yearly totals as an index (2003-2011 = 100) for raw hotspots (all sensors, what most
   maps show), harmonized ALAZ Relay, and actual Aqua MODIS alone (independent check, drifts after 2021).
2. Record months found automatically: for every country and calendar month since 2012, compare the month
   with the same calendar month in every other year 2001-2025 (leave-one-out). "beyond uncertainty" when
   the lower end of the 90% interval (same model as the web app) is above every other year;
   "highest" when only the point estimate is.

Output: web/data/findings.json
"""
import json
from pathlib import Path

import duckdb
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CM = (ROOT / "data/processed/harmonized/country_month.parquet").as_posix()
WEB = ROOT / "web" / "data"
Z90 = 1.645
MIN_V = 60  # ignore months with fewer harmonized cell-days than this

# Short labels only for well-documented events (shown next to an automatically detected month)
EVENTS = {
    ("Canada", 2023, 5): "Start of Canada's record 2023 fire season",
    ("Canada", 2023, 6): "Canada's record 2023 fire season",
    ("Canada", 2023, 9): "Canada 2023: the season that would not end",
    ("Argentina", 2022, 1): "Corrientes wetland fires (Iberá)",
    ("Argentina", 2022, 2): "Corrientes wetland fires (Iberá)",
    ("Indonesia", 2014, 3): "Riau peatland fires and haze",
    ("Indonesia", 2015, 9): "El Niño peat fires and regional haze",
    ("Chile", 2017, 1): "Chile's worst fire season on record",
    ("Chile", 2023, 2): "Biobío and Ñuble megafires",
    ("Sweden", 2018, 7): "Sweden's 2018 forest fires",
    ("Australia", 2019, 12): "Black Summer",
    ("United_States", 2020, 9): "US West Coast fires",
}
SHOW = [("Canada", 2023, 6), ("Argentina", 2022, 1), ("Indonesia", 2014, 3), ("Chile", 2023, 2),
        ("Chile", 2017, 1), ("Sweden", 2018, 7), ("Australia", 2019, 12), ("United_States", 2020, 9)]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def main():
    meta = json.loads((WEB / "meta.json").read_text())
    cm = duckdb.sql(f"SELECT country, ym, harm, raw_modis + raw_viirs raw, coalesce(aqua_actual, 0) aqua FROM '{CM}' "
                    "WHERE country <> ''").df()
    cm["y"], cm["mo"] = cm.ym.dt.year, cm.ym.dt.month

    # 1) global index
    g = cm[cm.y.between(2003, 2025)].groupby("y")[["raw", "harm", "aqua"]].sum()
    base = g.loc[2003:2011].mean()
    idx = (100 * g / base).round(1)
    later = idx.loc[2012:2022].mean()
    trend = {"years": idx.index.tolist(), "raw": idx.raw.tolist(), "harm": idx.harm.tolist(), "aqua": idx.aqua.tolist(),
             "raw_peak": float(idx.raw.max()), "raw_peak_year": int(idx.raw.idxmax()),
             "harm_2012_2022": float(round(later.harm, 1)), "aqua_2012_2022": float(round(later.aqua, 1)),
             "raw_2012_2022": float(round(later.raw, 1))}

    # 2) automatic record detection
    def sigma(y, mo):
        m = (y - 2000) * 12 + mo - 1
        for s in meta["segments"]:
            if s["from"] <= m <= s["to"]:
                return s["sigma_log"]
        return 0.3

    slug = {c["name"].replace(" ", "_"): c["slug"] for c in meta["countries"]}
    recs = []
    for (c, mo), d in cm[cm.y.between(2001, 2025)].groupby(["country", "mo"]):
        d = d.set_index("y").harm.reindex(range(2001, 2026), fill_value=0)
        for y, v in d.loc[2012:].items():
            if v < MIN_V:
                continue
            other = d.drop(y)
            if v <= other.max():
                continue
            s = np.sqrt(sigma(y, mo) ** 2 + 1 / max(v, 1))
            lo = v * np.exp(-Z90 * s)
            recs.append({"country": c.replace("_", " "), "slug": slug.get(c), "year": int(y), "month": int(mo),
                         "label": f"{MONTHS[mo - 1]} {y}", "value": round(float(v)),
                         # same "× normal" as the web app: median of that calendar month over 2003-2022
                         "x_typical": round(float(v / max(d.loc[2003:2022].median(), 1)), 1),
                         "strict": bool(lo > other.max()), "event": EVENTS.get((c, int(y), int(mo)))})
    by_key = {(r["country"].replace(" ", "_"), r["year"], r["month"]): r for r in recs}
    shown = [by_key[k] for k in SHOW if k in by_key]
    missing = [k for k in SHOW if k not in by_key]
    if missing:
        print("WARNING not a record month:", missing)
    out = {"trend": trend, "records_total": len(recs), "records_strict": sum(r["strict"] for r in recs), "showcase": shown,
           "note": "Records: highest harmonized value for that country and calendar month among 2001-2025 (leave-one-out); "
                   "strict = lower 90% bound above every other year."}
    (WEB / "findings.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(trend, indent=None)[:400])
    print(f"{len(recs)} record months since 2012, {out['records_strict']} beyond uncertainty; showcase {len(shown)}")


if __name__ == "__main__":
    main()
