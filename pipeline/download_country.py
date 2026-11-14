"""Download FIRMS yearly per-country archive CSVs (standard/science-quality) for given countries.

Usage: python pipeline/download_country.py Turkey Argentina
Files land in data/raw/country/<sensor>/<year>/<sensor>_<year>_<Country>.csv
"""
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
# FIRMS archive folder names -> years available
SENSORS = {
    "modis": range(2000, 2026),        # Terra (2000-) + Aqua (2002-)
    "viirs-snpp": range(2012, 2026),   # Suomi NPP
    "viirs-jpss1": range(2018, 2026),  # NOAA-20
}
ROOT = Path(__file__).resolve().parents[1] / "data" / "raw" / "country"


def fetch(job):
    sensor, year, country = job
    out = ROOT / sensor / str(year) / f"{sensor}_{year}_{country}.csv"
    if out.exists() and out.stat().st_size > 0:
        return job, "cached", out.stat().st_size
    url = f"{BASE}/{sensor}/{year}/{sensor}_{year}_{country}.csv"
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=180)
            if r.status_code == 404:
                return job, "missing", 0
            r.raise_for_status()
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(r.content)
            return job, "ok", len(r.content)
        except requests.RequestException as e:  # retry transient failures
            err = e
            time.sleep(2 * (attempt + 1))
    return job, f"error {err}", 0


def main(countries):
    jobs = [(s, y, c) for c in countries for s, yrs in SENSORS.items() for y in yrs]
    total = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        for (s, y, c), status, size in ex.map(fetch, jobs):
            total += size
            if status not in ("ok", "cached"):
                print(f"{c} {s} {y}: {status}")
    print(f"done: {len(jobs)} files, {total/1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1:] or ["Turkey"])
