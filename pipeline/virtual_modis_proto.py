"""Prototype: learn how Aqua-MODIS 'sees' fires that VIIRS (S-NPP) sees, during the overlap.

Both Aqua and S-NPP cross the equator ~13:30 local time, so on a given day they look at the
same fires at nearly the same moment. For every VIIRS daytime fire cell-day (0.1 deg) we ask:
did MODIS also detect a fire in that cell that day? The detection probability as a function of
fire power (FRP) and fire size (pixel count) is a lookup table. Summing those probabilities over
VIIRS detections gives the number of fire cell-days MODIS *would* have reported: a "virtual MODIS".

Train: 2013-2017.  Test: 2018-2021 (orbit still stable).  2022-2025: Aqua orbit drifting.
"""
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

pd.set_option("display.width", 200)
ROOT = Path(__file__).resolve().parents[1]
P = (ROOT / "data" / "processed" / "hotspots.parquet").as_posix()
con = duckdb.connect()
con.execute(f"CREATE VIEW h AS SELECT * FROM '{P}' WHERE type = 0 AND daynight = 'D'")

# VIIRS cell-days with features, flagged whether Aqua also saw the cell that day
con.execute("""
CREATE TABLE v AS
WITH s AS (
  SELECT country, floor(lat*10) gy, floor(lon*10) gx, date,
         sum(frp) frp, count(*) npix
  FROM h WHERE sat = 'SNPP' GROUP BY ALL),
a AS (SELECT DISTINCT country, floor(lat*10) gy, floor(lon*10) gx, date FROM h WHERE sat = 'Aqua')
SELECT s.*, (a.date IS NOT NULL)::INT hit,
  -- feature bins
  least(greatest(floor(log2(greatest(frp, 0.25)))::INT, -2), 9) fbin,
  CASE WHEN npix=1 THEN 1 WHEN npix<=3 THEN 2 WHEN npix<=10 THEN 3 ELSE 4 END nbin,
  month(date) m, year(date) y
FROM s LEFT JOIN a USING (country, gy, gx, date)
""")
# Aqua cell-days with no S-NPP cell-day (fires VIIRS missed: clouds, timing, edge of swath)
con.execute("""
CREATE TABLE aonly AS
WITH a AS (SELECT DISTINCT country, floor(lat*10) gy, floor(lon*10) gx, date FROM h WHERE sat='Aqua'),
s AS (SELECT DISTINCT country, floor(lat*10) gy, floor(lon*10) gx, date FROM h WHERE sat='SNPP')
SELECT a.country, year(a.date) y, month(a.date) m, count(*) n
FROM a ANTI JOIN s USING (country, gy, gx, date) GROUP BY ALL
""")

v = con.execute("SELECT * FROM v").df()
aonly = con.execute("SELECT * FROM aonly").df()
train = v[v.y.between(2013, 2017)]

# Lookup table P(hit | country, fbin, nbin) with light smoothing toward the fbin-only rate
tab = train.groupby(["country", "fbin", "nbin"]).hit.agg(["sum", "count"]).reset_index()
base = train.groupby(["country", "fbin"]).hit.mean().rename("p0").reset_index()
tab = tab.merge(base, on=["country", "fbin"])
K = 20
tab["p"] = (tab["sum"] + K * tab["p0"]) / (tab["count"] + K)
v = v.merge(tab[["country", "fbin", "nbin", "p"]], on=["country", "fbin", "nbin"], how="left")
v["p"] = v["p"].fillna(v.groupby("country").hit.transform("mean"))

# "MODIS-only" rate: Aqua-only cell-days per VIIRS cell-day, by country & month (train years)
ao_tr = aonly[aonly.y.between(2013, 2017)].groupby(["country", "m"]).n.sum()
vc_tr = train.groupby(["country", "m"]).size()
ao_rate = (ao_tr / vc_tr).rename("ao_rate").reset_index()

monthly = v.groupby(["country", "y", "m"]).agg(viirs=("hit", "size"), both=("hit", "sum"), exp_both=("p", "sum")).reset_index()
monthly = monthly.merge(aonly.rename(columns={"n": "aqua_only"}), on=["country", "y", "m"], how="left").fillna({"aqua_only": 0})
monthly = monthly.merge(ao_rate, on=["country", "m"], how="left")
monthly["aqua_actual"] = monthly["both"] + monthly["aqua_only"]
monthly["aqua_virtual"] = monthly["exp_both"] + monthly["ao_rate"] * monthly["viirs"]


def score(df):
    a, p = df.aqua_actual, df.aqua_virtual
    r = np.corrcoef(np.log1p(a), np.log1p(p))[0, 1]
    return pd.Series({
        "months": len(df), "r_log": round(r, 3),
        "annual_bias_%": round(100 * (p.sum() - a.sum()) / a.sum(), 1),
        "median_abs_err_%": round(100 * np.median(np.abs(p - a) / np.maximum(a, 1)), 1),
    })


monthly["period"] = pd.cut(monthly.y, [2011, 2017, 2021, 2026], labels=["train 2012-17", "test 2018-21", "drift 2022-25"])
print("\n=== Virtual MODIS vs actual Aqua MODIS (monthly fire cell-days, months with >=20 VIIRS cell-days) ===")
print(monthly[monthly.viirs >= 20].groupby(["country", "period"], observed=True).apply(score, include_groups=False).to_string())

print("\n=== Annual totals: actual Aqua vs virtual Aqua ===")
ann = monthly.groupby(["country", "y"])[["aqua_actual", "aqua_virtual"]].sum().round(0)
ann["diff_%"] = (100 * (ann.aqua_actual - ann.aqua_virtual) / ann.aqua_virtual).round(1)
print(ann.to_string())

out = ROOT / "data" / "processed" / "virtual_modis_monthly.csv"
monthly.to_csv(out, index=False)
print("saved", out)
