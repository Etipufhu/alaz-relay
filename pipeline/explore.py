"""Exploratory diagnostics for the overlap period: what makes MODIS and VIIRS non-comparable?"""
from pathlib import Path

import duckdb
import pandas as pd

pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 30)
ROOT = Path(__file__).resolve().parents[1]
P = (ROOT / "data" / "processed" / "hotspots.parquet").as_posix()
con = duckdb.connect()
con.execute(f"CREATE VIEW h AS SELECT * FROM '{P}'")


def q(sql):
    return con.execute(sql).df()


print("\n=== A. Raw detections per year (vegetation, type=0) ===")
a = q("""
  SELECT country, year(date) y, sat, count(*) n FROM h WHERE type=0 GROUP BY ALL
""").pivot_table(index=["country", "y"], columns="sat", values="n").reset_index()
a["SNPP/Aqua"] = (a["SNPP"] / a["Aqua"]).round(2)
print(a[a.y >= 2012].to_string(index=False))

print("\n=== B. Detection type share (0 veg, 1 volcano, 2 static land, 3 offshore) ===")
print(q("""
  SELECT country, sensor, type, count(*) n,
         round(100.0*count(*)/sum(count(*)) OVER (PARTITION BY country, sensor),1) pct
  FROM h GROUP BY country, sensor, type ORDER BY country, sensor, type
""").to_string(index=False))

print("\n=== C. Common unit: fire cell-days on 0.1 deg grid, per sat-year ===")
c = q("""
  SELECT country, year(date) y, sat, count(DISTINCT (floor(lat*10), floor(lon*10), date)) cd
  FROM h WHERE type=0 GROUP BY ALL
""").pivot_table(index=["country", "y"], columns="sat", values="cd").reset_index()
c["SNPP/Aqua"] = (c["SNPP"] / c["Aqua"]).round(2)
print(c[c.y >= 2012].to_string(index=False))

print("\n=== D. Overpass drift: median local solar time (h) of daytime detections ===")
print(q("""
  SELECT year(date) y, sat,
    round(median(((hhmm//100) + (hhmm%100)/60.0 + lon/15 + 48) % 24), 2) lst
  FROM h WHERE daynight='D' GROUP BY ALL
""").pivot_table(index="y", columns="sat", values="lst").to_string())

print("\n=== E. Detection-limit curve: P(Aqua sees cell-day | SNPP sees it), by SNPP FRP ===")
print(q("""
  WITH s AS (  -- SNPP daytime cell-days with total FRP
    SELECT country, floor(lat*10) gy, floor(lon*10) gx, date, sum(frp) frp
    FROM h WHERE sat='SNPP' AND type=0 AND daynight='D' AND year(date) BETWEEN 2013 AND 2019
    GROUP BY ALL),
  a AS (SELECT DISTINCT country, floor(lat*10) gy, floor(lon*10) gx, date
        FROM h WHERE sat='Aqua' AND type=0 AND daynight='D')
  SELECT s.country,
    CASE WHEN frp<2 THEN '0-2' WHEN frp<5 THEN '2-5' WHEN frp<10 THEN '5-10'
         WHEN frp<25 THEN '10-25' WHEN frp<100 THEN '25-100' ELSE '100+' END frp_bin,
    count(*) n_snpp, round(avg(CASE WHEN a.date IS NOT NULL THEN 1 ELSE 0 END),3) p_aqua
  FROM s LEFT JOIN a USING (country, gy, gx, date)
  GROUP BY ALL ORDER BY country, min(frp)
""").to_string(index=False))
