"""Stream the global FIRMS yearly archives into partitioned Parquet without keeping raw files.

For each (sensor, year): download the all-countries zip -> extract to temp -> convert to Parquet
-> delete zip and CSVs. Peak extra disk use is ~2 GB per worker. Re-runs skip finished parts.

Output: data/processed/global/sensor=<s>/year=<y>/part.parquet  (same schema as ingest.py)
"""
import shutil
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import COMMON  # noqa: E402  shared column mapping

ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "data" / "raw" / "global"
OUT = ROOT / "data" / "processed" / "global"
BASE = "https://firms.modaps.eosdis.nasa.gov/data/country/zips"
JOBS = [("modis", y) for y in range(2000, 2026)] + \
       [("viirs-snpp", y) for y in range(2012, 2026)] + \
       [("viirs-jpss1", y) for y in range(2018, 2026)]

CONF = {
    "modis": """CAST(confidence AS VARCHAR) AS conf_raw,
        CASE WHEN CAST(confidence AS INTEGER) < 30 THEN 'low'
             WHEN CAST(confidence AS INTEGER) < 80 THEN 'nominal' ELSE 'high' END AS conf_class""",
    "viirs": """confidence AS conf_raw,
        CASE lower(confidence) WHEN 'l' THEN 'low' WHEN 'h' THEN 'high' ELSE 'nominal' END AS conf_class""",
}


def run(job):
    sensor, year = job
    dest = OUT / f"sensor={sensor}" / f"year={year}" / "part.parquet"
    if dest.exists():
        return f"{sensor} {year}: cached"
    work = TMP / f"{sensor}_{year}"
    work.mkdir(parents=True, exist_ok=True)
    zpath = work / "a.zip"
    t0 = time.time()
    try:
        for attempt in range(4):
            try:
                with requests.get(f"{BASE}/{sensor}_{year}_all_countries.zip", stream=True, timeout=300) as r:
                    r.raise_for_status()
                    with open(zpath, "wb") as f:
                        for chunk in r.iter_content(1 << 20):
                            f.write(chunk)
                break
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(5 * (attempt + 1))
        with zipfile.ZipFile(zpath) as z:
            z.extractall(work)
        zpath.unlink()
        kind = "modis" if sensor == "modis" else "viirs"
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp_dest = dest.with_suffix(".tmp")
        con = duckdb.connect()
        con.execute("SET threads=6")
        con.execute(f"""
          COPY (SELECT '{kind.upper()}' AS sensor, {COMMON}, {CONF[kind]}
                FROM read_csv('{work.as_posix()}/**/*.csv', filename=true, all_varchar=true, header=true))
          TO '{tmp_dest.as_posix()}' (FORMAT parquet, COMPRESSION zstd)""")
        n = con.execute(f"SELECT count(*) FROM read_parquet('{tmp_dest.as_posix()}')").fetchone()[0]
        con.close()
        tmp_dest.rename(dest)
        return f"{sensor} {year}: {n:,} rows, {dest.stat().st_size/1e6:.0f} MB, {time.time()-t0:.0f}s"
    except Exception as e:  # report and continue with the other years
        return f"{sensor} {year}: FAILED {e}"
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=3) as ex:
        for msg in ex.map(run, JOBS):
            print(msg, flush=True)
    print("ALL DONE")
