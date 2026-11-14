"""Relay handover check: do the two VIIRS 'virtual Aqua' series agree with each other and with real Aqua?

Uses the production fits stored in data/processed/harmonized/work.duckdb (run harmonize.py first).
Prints yearly global totals (and per-month ratio stats) for:
  aqua      actual Aqua MODIS fire cell-days
  v_snpp    virtual Aqua from Suomi NPP
  v_noaa20  virtual Aqua from NOAA-20
Writes data/processed/harmonized/relay_check.csv (country x month) and web/data/relay.json
(global monthly totals + agreement stats) for the "handover" chart on the method page.
"""
import json
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harmonize import OUTDIR, virtual  # noqa: E402


def main():
    con = duckdb.connect(str(OUTDIR / "work.duckdb"), read_only=True)
    con.execute("SET memory_limit='20GB'")
    con.execute(f"SET temp_directory='{(OUTDIR / 'tmp_check').as_posix()}'")
    df = con.execute(f"""
      WITH s AS (SELECT country, date_trunc('month', date) ym, sum(w) v_snpp FROM ({virtual(con, 'SNPP', 'snpp')})
                 WHERE year(date) >= 2012 GROUP BY ALL),
           n AS (SELECT country, date_trunc('month', date) ym, sum(w) v_noaa20 FROM ({virtual(con, 'NOAA20', 'noaa20')})
                 WHERE year(date) >= 2018 GROUP BY ALL),
           a AS (SELECT country, date_trunc('month', date) ym, count(*) aqua FROM aqua
                 WHERE year(date) >= 2012 GROUP BY ALL)
      SELECT * FROM s FULL JOIN n USING (country, ym) FULL JOIN a USING (country, ym)""").df().fillna(0)
    # same comparison restricted to days on which BOTH VIIRS satellites delivered data (outages removed)
    common = con.execute(f"""
      WITH d AS (SELECT date FROM cd WHERE sat='SNPP' INTERSECT SELECT date FROM cd WHERE sat='NOAA20'),
           s AS (SELECT date_trunc('month', date) ym, sum(w) v_snpp FROM ({virtual(con, 'SNPP', 'snpp')})
                 WHERE date IN (SELECT date FROM d) GROUP BY ALL),
           n AS (SELECT date_trunc('month', date) ym, sum(w) v_noaa20 FROM ({virtual(con, 'NOAA20', 'noaa20')})
                 WHERE date IN (SELECT date FROM d) GROUP BY ALL)
      SELECT * FROM s JOIN n USING (ym) ORDER BY ym""").df()
    df.to_csv(OUTDIR / "relay_check.csv", index=False)
    df["year"] = df.ym.dt.year
    full = df.copy()
    df = df[df.year >= 2018]
    yr = df.groupby("year")[["aqua", "v_snpp", "v_noaa20"]].sum()
    yr["noaa20/snpp"] = yr.v_noaa20 / yr.v_snpp
    yr["snpp/aqua"] = yr.v_snpp / yr.aqua
    yr["noaa20/aqua"] = yr.v_noaa20 / yr.aqua
    print(yr.round(3).to_string())
    both = df[(df.v_snpp >= 20) & (df.v_noaa20 >= 20)]
    lr = np.log(both.v_noaa20 / both.v_snpp)
    print(f"\ncountry-months with both >= 20: {len(both)}; NOAA20 vs SNPP log-ratio "
          f"median {np.median(lr):+.3f}, sd {lr.std():.3f}, r_log {np.corrcoef(np.log(both.v_snpp), np.log(both.v_noaa20))[0, 1]:.3f}")
    for y, g in both.groupby(both.ym.dt.year):
        l = np.log(g.v_noaa20 / g.v_snpp)
        print(f"  {y}: median ratio {np.exp(np.median(l)):.3f}, n={len(g)}")

    # web: global monthly totals (NOAA-20 only from its first full month)
    g = full.groupby("ym")[["aqua", "v_snpp", "v_noaa20"]].sum().sort_index()
    g.loc[g.index < "2018-05-01", "v_noaa20"] = np.nan
    web = {
        "month0": g.index[0].strftime("%Y-%m"),
        "aqua": [round(x) for x in g.aqua], "snpp": [round(x) for x in g.v_snpp],
        "noaa20": [None if np.isnan(x) else round(x) for x in g.v_noaa20],
        # NOAA-20 / S-NPP on common days only, aligned to month0 (null where not both flying)
        "ratio_common": [None if pd.isna(x) else round(float(x), 4) for x in
                         (common.set_index("ym").pipe(lambda c: c.v_noaa20 / c.v_snpp)).reindex(g.index)],
        "agreement": {"country_months": int(len(both)), "median_gap_pct": round(100 * (np.exp(np.median(lr)) - 1), 1),
                      "r_log": round(float(np.corrcoef(np.log(both.v_snpp), np.log(both.v_noaa20))[0, 1]), 3),
                      "sd_log": round(float(lr.std()), 3)},
        "note": "Global monthly Aqua-MODIS fire cell-days (0.1 deg): actual Aqua vs virtual Aqua from each VIIRS satellite",
    }
    out = Path(__file__).resolve().parents[1] / "web" / "data" / "relay.json"
    out.write_text(json.dumps(web, separators=(",", ":")))
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
