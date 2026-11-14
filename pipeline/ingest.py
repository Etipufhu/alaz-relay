"""Unify raw FIRMS country CSVs (MODIS + VIIRS) into one tidy Parquet table.

Output: data/processed/hotspots.parquet with one row per detection and a common schema:
  country, sensor, sat, lat, lon, date, hhmm, ts_utc, daynight, type,
  conf_raw, conf_class, frp, scan, track, pixel_km2
"""
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "country"
OUT = ROOT / "data" / "processed" / "hotspots.parquet"

# Satellite codes used by FIRMS -> readable names
SAT_SQL = """
CASE satellite
  WHEN 'Terra' THEN 'Terra' WHEN 'T' THEN 'Terra'
  WHEN 'Aqua'  THEN 'Aqua'  WHEN 'A' THEN 'Aqua'
  WHEN 'N'     THEN 'SNPP'
  WHEN 'N20'   THEN 'NOAA20' WHEN '1' THEN 'NOAA20'
  WHEN 'N21'   THEN 'NOAA21' WHEN '2' THEN 'NOAA21'
  ELSE satellite END
"""

COMMON = f"""
  regexp_extract(filename, '_[0-9]{{4}}_([^/\\\\]+)\\.csv$', 1) AS country,
  {SAT_SQL} AS sat,
  CAST(latitude AS DOUBLE) AS lat, CAST(longitude AS DOUBLE) AS lon,
  CAST(acq_date AS DATE) AS date,
  CAST(acq_time AS INTEGER) AS hhmm,
  CAST(acq_date AS TIMESTAMP)
    + to_minutes(CAST(acq_time AS INTEGER) // 100 * 60 + CAST(acq_time AS INTEGER) % 100) AS ts_utc,
  daynight, CAST(type AS INTEGER) AS type,
  CAST(frp AS DOUBLE) AS frp, CAST(scan AS DOUBLE) AS scan, CAST(track AS DOUBLE) AS track,
  CAST(scan AS DOUBLE) * CAST(track AS DOUBLE) AS pixel_km2
"""


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    modis = f"""
      SELECT 'MODIS' AS sensor, {COMMON},
        CAST(confidence AS VARCHAR) AS conf_raw,
        -- FIRMS guidance: MODIS confidence <30 low, 30-79 nominal, >=80 high
        CASE WHEN CAST(confidence AS INTEGER) < 30 THEN 'low'
             WHEN CAST(confidence AS INTEGER) < 80 THEN 'nominal' ELSE 'high' END AS conf_class
      FROM read_csv('{RAW.as_posix()}/modis/*/*.csv', filename=true, all_varchar=true, header=true)
    """
    viirs = f"""
      SELECT 'VIIRS' AS sensor, {COMMON},
        confidence AS conf_raw,
        CASE lower(confidence) WHEN 'l' THEN 'low' WHEN 'h' THEN 'high' ELSE 'nominal' END AS conf_class
      FROM read_csv('{RAW.as_posix()}/viirs-*/*/*.csv', filename=true, all_varchar=true, header=true)
    """
    con.execute(f"COPY ({modis} UNION ALL {viirs}) TO '{OUT.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
    print(con.execute(f"""
      SELECT country, sat, min(date), max(date), count(*) n
      FROM '{OUT.as_posix()}' GROUP BY ALL ORDER BY country, sat
    """).df().to_string())


if __name__ == "__main__":
    main()
