# ALAZ Relay — Satellites changed. Fires didn't.

**Team ALAZ · NASA Space Apps Challenge 2026 · Challenge: Harmonization of MODIS and VIIRS Hot Spots**

NASA's MODIS (Terra, Aqua) and VIIRS (Suomi NPP, NOAA-20) instruments have recorded active fires since 2000, but VIIRS sees fires about ten times smaller than MODIS. Every time a satellite joins, raw hotspot counts jump even when nothing changed on the ground. ALAZ Relay rebuilds one consistent, global, Aqua-MODIS-equivalent fire record (Nov 2000 – Dec 2025, 0.1° grid, 235 countries). On top of it, a static web app turns any area on Earth into a **burning activity calendar**: seasons, anomalies against the historical median, record months, uncertainty, and CSV download.

- **Live app:** https://etipufhu.github.io/alaz-relay/
- **Demo video (30 s):** https://etipufhu.github.io/alaz-relay/demo.html
- **Project write-up:** [`submission/project-page.md`](submission/project-page.md)

## Method in one paragraph

Hotspots are filtered (FIRMS `type = 0` presumed vegetation fire, confidence not low) and turned into **fire cell-days**: a 0.1° cell counts once per day and overpass. During the 2012–2021 overlap, while Aqua and the VIIRS satellites cross the equator at about the same time, we learn P(Aqua detects | VIIRS cell-day) by fire radiative power, VIIRS pixel count, day/night and country. These estimates are shrunk hierarchically towards global values. We also learn the rate of Aqua-only cell-days per country, day/night and month. Summing both gives *virtual Aqua*. The record uses three sources: Terra converted to Aqua units (2000–2002), real Aqua (2002–2011), and virtual Aqua averaged over the VIIRS satellites that delivered data each day (2012 onwards). An outage of one satellite is covered by the other.

## What the record reveals

- **Global fire went down, not up.** With 2003–2011 = 100, summed raw hotspots reach ×6.1 over 2012–2022, because Suomi NPP and NOAA-20 joined. ALAZ Relay shows −11.5% for the same years. Aqua MODIS alone, never harmonized, shows −11%. This is consistent with Andela et al. (2017, *Science*), who report declining global burned area.
- **It finds disasters on its own.** A leave-one-out test runs over every country and calendar month since 2012. It flags 45 months that beat every other year even at the low end of their 90% uncertainty interval. Examples: Canada in June 2023, Sweden in July 2018, Chile in February 2023, Riau (Indonesia) in March 2014, and Corrientes (Argentina) in January 2022. See `pipeline/export_findings.py`.

## Validation

| VIIRS satellite | train | test | r (log) | bias | median abs. error |
|---|---|---|---|---|---|
| Suomi NPP | 2012–2017 | 2018–2021 | 0.987 | +2.8% | 15% |
| NOAA-20 | 2018–2019 | 2020–2021 | 0.986 | +3.5% | 15% |

These are monthly country totals worldwide, compared on held-out years with what Aqua actually recorded. The two VIIRS-based records agree with each other at r = 0.997 (median gap −1.2%, 7,616 country-months, 2018–2025).

## Repository

```
pipeline/                       data pipeline (Python 3.11 + DuckDB)
  download_country.py           FIRMS yearly per-country CSVs (pilot)
  ingest_global.py              FIRMS yearly global archives -> partitioned Parquet
  harmonize.py                  the model: fits, validation, relay assembly
  relay_check.py                "baton test": S-NPP vs NOAA-20 agreement
  export_web.py                 static web data (country series, binary tiles, overview raster)
  export_hero.py                landing-page globe data
  export_findings.py            global trend + automatic record-month detection (web/data/findings.json)
  demo/remotion/                the 30 s demo: Remotion project, app capture, synthesized score + AI voiceover mix
web/                            the static web app (deployed by GitHub Actions)
submission/                     project write-up (demo video lives in web/media)
```

Reproduce (needs ~60 GB free disk and a FIRMS MAP_KEY in `.env`; the key is only used for data download and never shipped):

```bash
pip install -r requirements.txt
python pipeline/ingest_global.py
python pipeline/harmonize.py "data/processed/global/*/*/part.parquet"
python pipeline/export_web.py && python pipeline/export_hero.py && python pipeline/relay_check.py
python -m http.server 8765 --directory web
```

## Data and credits

- NASA FIRMS: MODIS C6.1 (MCD14ML) and VIIRS 375 m (VNP14IMG, VJ114IMG) active fire products, standard-processing archives.
- Basemap © OpenStreetMap contributors © CARTO. Land outlines: Natural Earth via `world-atlas`.
- Libraries: DuckDB, pandas, NumPy, PyArrow, Pillow, MapLibre GL JS, D3.js, topojson-client, Playwright, FFmpeg.
- Fonts: Instrument Serif, Hanken Grotesk, JetBrains Mono (SIL OFL).

**AI disclosure:** the code and analysis in this repository were written with AI assistance (Claude, Anthropic) under the team's direction. The demo video carries a visible "SI-assisted production · AI voice (ElevenLabs)" watermark. Its voiceover is an AI voice generated with ElevenLabs from the team's script, and this is also stated in the MP4 metadata and on the demo page. The music and sound effects are synthesized from code (`pipeline/demo/remotion/make_audio.py`). The two decorative illustrations on the website (`web/media/relay-art.webp`, `web/media/earth-limb.webp`) were made with an AI image generator and are labelled "AI-generated image" on the page; their light animations are our own code (`web/js/art.js`).

Not affiliated with or endorsed by NASA.
