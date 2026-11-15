# ALAZ Relay — Space Apps 2026 project page (copy each block into the matching form field)

---

## Project Name

ALAZ Relay — Satellites changed. Fires didn't.

---

## High-Level Project Summary

For 25 years, NASA's MODIS and VIIRS instruments have recorded every active fire on Earth, but they do not count the same way. VIIRS sees fires about ten times smaller than MODIS, so every time a new satellite joins the record, raw hotspot counts jump even when nothing changed on the ground. In Manavgat, Türkiye, raw hotspots make the 2021 fires look 30× bigger than the 2008 fire; the burned area on the ground was about 3.6× bigger.

ALAZ Relay fixes the record instead of the map. Using the ten years when Aqua MODIS and VIIRS flew together (2012–2021), it learns, region by region and by fire power, how often MODIS would have seen each VIIRS fire. It then rebuilds a single "Aqua-MODIS-equivalent" fire record from November 2000 to today, for the whole planet, on a 0.1° grid. When the MODIS satellites retire, the relay carries on with VIIRS.

On top of that record we built a free web app: draw any area on Earth (or pick one of 235 countries) and get its burning activity calendar since 2000. You see typical fire seasons, anomalies against the historical median, record months, and an honest uncertainty band, and you can download it as CSV. Tested on years it never saw, the method reproduces real Aqua with r = 0.99 worldwide.

The harmonized record changes the story. Summed raw hotspots say global fire activity in 2012–2022 was 6.1 times higher than in 2003–2011. In one consistent unit it was 11.5% lower, and Aqua MODIS on its own (never harmonized) independently shows −11%. This agrees with published evidence of declining global burned area. The record also finds real disasters without being told about them: a simple leave-one-out test flags 45 country-months since 2012 that beat every other year even at the low end of their uncertainty. They include Canada in June 2023, Sweden in July 2018, Chile in February 2023, Riau (Indonesia) in March 2014 and Corrientes (Argentina) in January 2022.

This matters because fire trends drive real decisions: firefighting budgets, insurance, land policy and climate science. A trend that is really a satellite change can mislead all of them.

---

## Link to Project Demo

https://etipufhu.github.io/alaz-relay/demo.html

---

## Link to Final Project

https://etipufhu.github.io/alaz-relay/

Source code and full method: https://github.com/Etipufhu/alaz-relay

---

## Detailed Project Description

### What it does

ALAZ Relay is a harmonized, global, 25-year active-fire record plus a web app to read it.

- **One unit across all sensors.** Every hotspot from Terra, Aqua, Suomi NPP and NOAA-20 is turned into *fire cell-days*: a 0.1° grid cell counts once per day and overpass when it burns, no matter how many pixels lit up. This removes most of the resolution effect before any modelling.
- **Virtual MODIS from VIIRS.** For every VIIRS fire cell-day we estimate the probability that Aqua MODIS would also have detected it, given the fire's radiative power, its size in VIIRS pixels, day or night, and the country. We add the share of fires Aqua sees that VIIRS misses (cloud, timing, swath gaps). The sum is "virtual Aqua": what Aqua would have reported.
- **A relay, decided day by day.** Before Aqua existed (Nov 2000 – Jul 2002) Terra is converted to Aqua-equivalent units. From Aug 2002 to Dec 2011 real Aqua is the record. From 2012 on, virtual Aqua comes from Suomi NPP and NOAA-20, averaged on days when both deliver data. If one satellite has an outage (Suomi NPP in Jul–Aug 2022 and Jul 2024), the other carries that day. Suomi NPP's FIRMS stream ended in November 2026, and the record continues on NOAA-20 with no jump.
- **Burning activity calendar.** For any area the app shows a year × month calendar. You can view it three ways: harmonized activity, anomaly vs. the 2003–2022 median, or raw hotspots for comparison. It also shows peak season, most active year, and how much of the apparent trend was only a sensor change. A month is flagged as an anomaly only when the lower end of its 90% uncertainty interval is above the historical upper quartile. It is a "record" when it is above every month in the baseline.
- **Accessible and open.** Color ramps are perceptually ordered and readable in dark mode. Areas can be drawn as rectangles or polygons, entered as latitude/longitude plus radius, or picked as a country. All results download as CSV. The site is static (no server, no API key), so anyone can host or reuse it.

### What the record reveals

- **Global fire went down, not up.** We indexed yearly global totals to 2003–2011 = 100. Raw hotspots, summed as most fire maps do, jump to 485 in 2012 (Suomi NPP joins) and to 688–895 from 2018 (NOAA-20 joins): ×6.1 on average over 2012–2022. ALAZ Relay gives 88.5 for the same years (−11.5%). Aqua MODIS alone, a single unchanged sensor that we never adjusted, gives 89.0 (−11%). The decline matches published evidence that global burned area is falling, mostly in savannas (Andela et al., 2017).
- **It finds disasters on its own.** For every country and calendar month since 2012, we ask whether that month is higher than the same month in every other year since 2001, using a leave-one-out comparison. 516 months are the highest on record. For 45 of them, even the low end of the 90% uncertainty interval beats every other year. The detector is never given any news, yet these include Canada's record 2023 season (June 2023, 8.9× a normal June), Sweden's 2018 forest fires (11.6×), Chile's Biobío and Ñuble megafires (February 2023, 8.4×), the Riau peat fires (March 2014, 6.1×) and the Corrientes wetland fires (January 2022, 4.9×). It is also honest about what it cannot separate: Australia's Black Summer (December 2019) and the 2020 US West Coast fires are the highest months since 2001, but they stay within the uncertainty band at national scale.
- **Why you draw areas.** At country level, Türkiye's August 2021 ranks only 17th of 25 Augusts, because crop-stubble burning in the southeast dominates the national total. Draw the area around Manavgat and July–August 2021 becomes the record by a wide margin.

### How we know it works (validity)

- **Held-out validation.** We trained on 2012–2017 and predicted Aqua for 2018–2021 from Suomi NPP alone. Across 3,965 country-months worldwide: r (log) = 0.987, bias +2.8%, median error 15%. NOAA-20, trained only on 2018–2019 and tested on 2020–2021: r = 0.986, bias +3.5%, median error 15%. The remaining error becomes the uncertainty band on every month.
- **The baton test.** The two VIIRS satellites learn independently, so their two "virtual Aquas" must agree if the method is sound. They do: r = 0.997 and a median gap of −1.2% over 7,616 country-months (2018–2025).
- **An independent ground check (illustrative).** Manavgat 2021 vs. 2008 (Jul–Aug, same area): raw hotspots 30×, ALAZ Relay 4.2×, mapped burned area 3.4–3.8×.
- **Honest limits.** Fire cell-days measure how often fire is seen, not hectares burned. From 2022 both Terra and Aqua drift to later overpass times, so we use post-2021 Aqua only as a check, not as a reference. FIRMS "static land source" detections (gas flares, industry, volcanoes) are removed: 27% of VIIRS hotspots in Türkiye are such sources, against 2.8% for MODIS.

### Benefits

- Fire services and planners can see whether this season is truly unusual for their district, not just unusual for a new satellite.
- Researchers and journalists get a continuous 25-year series instead of three incompatible ones.
- The method keeps working after MODIS ends (Terra and Aqua science operations are planned to end in 2027). Without a bridge like this, the longest satellite fire record on Earth would break in two.

### What we hope to achieve

We want the next fire spike that makes the news to be checked against a record that does not change when the satellites do. Next steps: add NOAA-21 to the relay, extend to 2026 with FIRMS near-real-time data, publish the gridded product as an open dataset, and give a stronger ground truth by comparing with burned-area products by region.

### Tools and technology

- **Pipeline:** Python 3.11, DuckDB, pandas, NumPy, PyArrow. It processes 548.5 million FIRMS records into 32 million harmonized cell-months.
- **Web app:** plain HTML/CSS/JavaScript, MapLibre GL JS, D3.js, topojson-client. Compact binary tiles (65 MB for the whole planet) are decoded in the browser.
- **Demo video:** animated in Remotion (React) from our own data, plus a Playwright screen recording of the live app. The voiceover is an AI voice generated with ElevenLabs from our script. The music and sound effects are synthesized in Python (NumPy/SciPy), so no copyrighted audio is used.

---

## Use of Super Intelligence (SI)

<!-- READ BEFORE PASTING: this must describe what really happened. Edit it so it is true for your team. -->

Yes. We used Claude (Anthropic) as an assistant throughout the hackathon:
- research help: finding and summarizing documentation on FIRMS products, satellite timelines and earlier harmonization work;
- discussing and comparing solution directions, which the team then chose between, combined and named;
- writing most of the code (data pipeline, statistical model, web app) under the team's direction, and running the analyses;
- drafting English text for the website and this page, reviewed and edited by the team;
- producing the demo video: the animations were coded in Remotion with Claude's help and are drawn from our own NASA FIRMS data and a screen recording of our web app. The video carries a visible "SI-assisted production · AI voice (ElevenLabs)" watermark.
- **AI-generated audio:** the demo voiceover is an AI voice generated with ElevenLabs (text-to-speech) reading the team's English script. This is also stated in the video's watermark and file metadata, and on the demo page. The background music and sound effects are synthesized from code; no music generator or copyrighted audio is used.

- **AI-generated images:** two decorative illustrations on the website (three satellites passing a beam of light in "The relay" section, and Earth's night side in the closing band) were made with an AI image generator from prompts written for this project. Each carries a visible "AI-generated image" label, and the relay picture's caption says so too. The flickering lights, twinkling stars and light pulses on top of them are our own SVG/CSS animation. They are illustrations only: no data is shown in them.

The website footer and the code repository state that the code and analysis were built with AI assistance. All maps and charts are drawn directly from NASA data; the two illustrations above are the only SI-generated images.

---

## NASA Data

- **NASA FIRMS (Fire Information for Resource Management System), standard-processing archives**, downloaded as yearly global files:
  - MODIS Collection 6.1 Active Fire / Hotspot product (MCD14ML), Terra and Aqua, Nov 2000 – Dec 2025: 111.4 million records.
  - VIIRS 375 m Active Fire product, Suomi NPP (VNP14IMG), Jan 2012 – Dec 2025: 281.1 million records.
  - VIIRS 375 m Active Fire product, NOAA-20 (VJ114IMG), Apr 2018 – Dec 2025: 155.9 million records.
- **FIRMS fields used:** location, acquisition date and time, day/night flag, fire radiative power (FRP), scan/track pixel size, confidence, and the `type` flag (presumed vegetation fire, active volcano, other static land source, offshore).
- **FIRMS API** (MAP_KEY): used only to check data availability. The key is never shipped in the public app.
- **NASA documentation:** FIRMS FAQ and attribute descriptions, the MODIS and VIIRS active-fire user guides, and NASA Earth Observatory material on long-term fire records.

---

## Space Agency Partner Data and Other References

**Data**
- NASA FIRMS. MODIS Collection 6.1 Hotspot / Active Fire Detections MCD14ML. DOI: 10.5067/FIRMS/MODIS/MCD14ML
- NASA FIRMS. VIIRS (S-NPP) I Band 375 m Active Fire Product VNP14IMGT. DOI: 10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002
- NASA FIRMS. VIIRS (NOAA-20) I Band 375 m Active Fire Product VJ114IMGT. DOI: 10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002
- Burned area of the 2008 and 2021 Manavgat-area fires (illustrative check only): Turkish Academy of Sciences (TÜBA) fire report; Gebze Technical University satellite burned-area mapping; Demirören News Agency (DHA) reporting.
- Natural Earth land outlines, via the `world-atlas` package (public domain).
- Basemap: © OpenStreetMap contributors, © CARTO (Dark Matter style).

**Science**
- Giglio, L., Schroeder, W., Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment*, 178, 31–41.
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. *Remote Sensing of Environment*, 143, 85–96.
- Andela, N., et al. (2017). A human-driven decline in global burned area. *Science*, 356(6345), 1356–1362.

**Software (all open source)**
- DuckDB, pandas, NumPy, PyArrow, Pillow, Requests (Python)
- MapLibre GL JS 4.7, D3.js 7.9, topojson-client 3.1
- Remotion 4 (React video), Playwright and FFmpeg, used to make the demo video; SciPy for the synthesized soundtrack
- Fonts from Google Fonts (SIL Open Font License): Instrument Serif, Hanken Grotesk, JetBrains Mono

**SI tools**
- Claude (Anthropic), coding and analysis assistant; see the SI field.
- ElevenLabs text-to-speech, AI voiceover of the demo video (the team's script).
- AI image generator: the two decorative illustrations on the website (labelled "AI-generated image").

No copyrighted images, music or text were used. The demo video has burned-in English subtitles and an AI voiceover (disclosed in the video). It shows no people.

---

## Tags (suggested)

#wildfire #MODIS #VIIRS #FIRMS #harmonization #climate #remote-sensing #open-data #Türkiye
