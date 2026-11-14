"""Hero globe data: Earth's typical burning year.

Mean monthly fire activity per 0.25 deg cell from the ALAZ Relay harmonized record
(Aqua-equivalent fire cell-days on the 0.1 deg grid, 2003-2025: real Aqua until 2011, virtual Aqua
from VIIRS after), keeping the most active cells. The landing-page globe animates through these 12 months.

Output: web/data/hero.json  {"n": N, "lat": [...], "lon": [...], "v": [N*12 ints, value*10]}
"""
from pathlib import Path

import duckdb
import numpy as np
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "data/processed/harmonized/cellmonth.parquet").as_posix()
Y0, Y1 = 2003, 2025
OUT = ROOT / "web" / "data" / "hero.json"
KEEP = 14000


def main():
    con = duckdb.connect()
    df = con.execute(f"""
      SELECT floor(gy/2.5)::INT cy, floor(gx/2.5)::INT cx, month(ym)-1 mo, sum(harm)/{Y1 - Y0 + 1}.0 v
      FROM '{SRC}' WHERE year(ym) BETWEEN {Y0} AND {Y1} GROUP BY ALL""").df()
    piv = df.pivot_table(index=["cy", "cx"], columns="mo", values="v", fill_value=0).reindex(columns=range(12), fill_value=0)
    piv = piv.loc[piv.sum(axis=1).sort_values(ascending=False).index[:KEEP]]
    lat = ((piv.index.get_level_values(0) + 0.5) * 0.25).round(3)
    lon = ((piv.index.get_level_values(1) + 0.5) * 0.25).round(3)
    v = np.round(piv.values * 10).astype(int)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"n": len(piv), "lat": lat.tolist(), "lon": lon.tolist(), "v": v.ravel().tolist(),
                               "note": f"mean monthly harmonized (Aqua-equivalent) fire cell-days per 0.25 deg cell, {Y0}-{Y1}"},
                              separators=(",", ":")))
    print(f"{len(piv)} cells, {OUT.stat().st_size/1e6:.2f} MB, monthly totals:",
          np.round(piv.values.sum(axis=0)).astype(int).tolist())


if __name__ == "__main__":
    main()
