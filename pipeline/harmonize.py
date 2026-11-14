"""ALAZ Relay harmonization engine (v1).

Idea: express the whole 2000-present record in ONE unit — "Aqua-MODIS-equivalent fire cell-days"
on a 0.1 deg grid — by letting each new satellite be "taught" by the previous one while both fly.

  2000-11 .. 2002-07  Terra cell-days x Terra->Aqua ratio (learned 2003-2011, per country & month)
  2002-08 .. 2011-12  Aqua cell-days (actual)
  2012-01 .. present  "virtual Aqua" computed from VIIRS (S-NPP, NOAA-20):
       virtual = sum over VIIRS cell-days of [ P(Aqua detects | country, day/night, FRP bin, size bin)
                                               + Aqua-only rate(country, day/night, month) ]
       P and the rate are learned in the overlap BEFORE Aqua's orbit drift (<= 2021).

Inputs : a Parquet glob with the schema from ingest.py
Outputs: data/processed/harmonized/{cellmonth.parquet, country_month.parquet, model_card.json}

Usage  : python pipeline/harmonize.py "data/processed/hotspots.parquet"
"""
import json
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUTDIR = ROOT / "data" / "processed" / "harmonized"
K_P, K_RATE = 20, 50              # smoothing strengths toward the global estimate
FBIN = "least(greatest(floor(log2(greatest(frp, 0.25)))::INT, -2), 9)"
NBIN = "CASE WHEN npix=1 THEN 1 WHEN npix<=3 THEN 2 WHEN npix<=10 THEN 3 ELSE 4 END"
# satellite -> (train years, test years) for the validation split; production fits use train+test
VIIRS_SATS = {"SNPP": ((2012, 2017), (2018, 2021)), "NOAA20": ((2018, 2019), (2020, 2021))}


def build_celldays(con, src):
    """Vegetation fires only (type 0), drop low-confidence; aggregate points -> 0.1 deg cell-days."""
    con.execute(f"""
    CREATE OR REPLACE TABLE cd AS
    SELECT sat, country, CAST(floor(lat*10) AS INT) gy, CAST(floor(lon*10) AS INT) gx,
           date, daynight dn, sum(frp) frp, count(*) npix
    FROM read_parquet('{src}', hive_partitioning=false)
    WHERE type = 0 AND conf_class <> 'low' AND sat IN ('Terra','Aqua','SNPP','NOAA20')
    GROUP BY ALL""")
    con.execute(f"ALTER TABLE cd ADD COLUMN fbin INT; UPDATE cd SET fbin = {FBIN}")
    con.execute(f"ALTER TABLE cd ADD COLUMN nbin INT; UPDATE cd SET nbin = {NBIN}")
    con.execute("CREATE OR REPLACE TABLE aqua AS SELECT DISTINCT country, gy, gx, date, dn FROM cd WHERE sat='Aqua'")


def fit(con, sat, y0, y1, tag):
    """Learn P(Aqua hit | ...) and the Aqua-only rate from overlap years y0..y1."""
    con.execute(f"""
    CREATE OR REPLACE TABLE pairs AS
    SELECT v.*, (a.date IS NOT NULL)::INT hit
    FROM cd v LEFT JOIN aqua a USING (country, gy, gx, date, dn)
    WHERE v.sat = '{sat}' AND year(v.date) BETWEEN {y0} AND {y1}""")
    con.execute(f"""
    CREATE OR REPLACE TABLE p_{tag} AS
    WITH g AS (SELECT dn, fbin, nbin, (sum(hit)+1.0)/(count(*)+2.0) pg FROM pairs GROUP BY ALL),
         c AS (SELECT country, dn, fbin, nbin, sum(hit) s, count(*) n FROM pairs GROUP BY ALL)
    SELECT c.country, c.dn, c.fbin, c.nbin, (s + {K_P}*pg)/(n + {K_P}) p
    FROM c JOIN g USING (dn, fbin, nbin)""")
    con.execute(f"CREATE OR REPLACE TABLE pg_{tag} AS SELECT dn, fbin, nbin, (sum(hit)+1.0)/(count(*)+2.0) p FROM pairs GROUP BY ALL")
    # Aqua cell-days with no same-day VIIRS cell-day of this satellite (clouds, timing, swath gaps)
    con.execute(f"""
    CREATE OR REPLACE TABLE r_{tag} AS
    WITH v AS (SELECT DISTINCT country, gy, gx, date, dn FROM cd
               WHERE sat='{sat}' AND year(date) BETWEEN {y0} AND {y1}),
    -- only days on which this satellite delivered data (e.g. NOAA-20 starts Apr 2018): otherwise every
    -- Aqua cell-day before launch or during an outage would be counted as 'missed by VIIRS'
    vd AS (SELECT DISTINCT date FROM cd WHERE sat='{sat}' AND year(date) BETWEEN {y0} AND {y1}),
    ao AS (SELECT country, dn, month(date) m, count(*) n FROM aqua a
           WHERE year(date) BETWEEN {y0} AND {y1} AND date IN (SELECT date FROM vd) AND NOT EXISTS
           (SELECT 1 FROM v WHERE v.country=a.country AND v.gy=a.gy AND v.gx=a.gx AND v.date=a.date AND v.dn=a.dn)
           GROUP BY ALL),
    vc AS (SELECT country, dn, month(date) m, count(*) n FROM v GROUP BY ALL),
    j AS (SELECT vc.country, vc.dn, vc.m, coalesce(ao.n,0) ao, vc.n vn FROM vc LEFT JOIN ao USING (country, dn, m)),
    g AS (SELECT dn, m, sum(ao)/sum(vn) rg FROM j GROUP BY ALL)
    SELECT j.country, j.dn, j.m, (ao + {K_RATE}*rg)/(vn + {K_RATE}) rate FROM j JOIN g USING (dn, m)""")
    con.execute(f"CREATE OR REPLACE TABLE rg_{tag} AS SELECT dn, m, avg(rate) rate FROM r_{tag} GROUP BY ALL")


def virtual(con, sat, tag):
    """Per cell-day expected Aqua cell-days from VIIRS satellite `sat` using model `tag`."""
    return f"""
    SELECT v.country, v.gy, v.gx, v.date, v.dn,
           coalesce(p.p, pg.p, 0.1) + coalesce(r.rate, rg.rate, 0.1) w
    FROM cd v
    LEFT JOIN p_{tag} p USING (country, dn, fbin, nbin)
    LEFT JOIN pg_{tag} pg USING (dn, fbin, nbin)
    LEFT JOIN r_{tag} r ON r.country=v.country AND r.dn=v.dn AND r.m=month(v.date)
    LEFT JOIN rg_{tag} rg ON rg.dn=v.dn AND rg.m=month(v.date)
    WHERE v.sat = '{sat}'"""


def validate(con, sat, test):
    """Monthly country totals: virtual vs actual Aqua in held-out years."""
    df = con.execute(f"""
    WITH v AS (SELECT country, date_trunc('month', date) ym, sum(w) virt FROM ({virtual(con, sat, 'val')})
               WHERE year(date) BETWEEN {test[0]} AND {test[1]} GROUP BY ALL),
         a AS (SELECT country, date_trunc('month', date) ym, count(*) act FROM aqua
               WHERE year(date) BETWEEN {test[0]} AND {test[1]} GROUP BY ALL)
    SELECT * FROM v FULL JOIN a USING (country, ym)""").df().fillna(0)
    df = df[df.act >= 20]
    lr = np.log(df.virt.clip(lower=0.5) / df.act)
    by = df.assign(lr=lr).groupby("country").agg(
        months=("act", "size"), act=("act", "sum"), virt=("virt", "sum"), sigma_log=("lr", "std"),
        r_log=("lr", lambda s: np.corrcoef(np.log(df.loc[s.index, "act"]), np.log(df.loc[s.index, "virt"].clip(lower=0.5)))[0, 1]
               if len(s) > 2 else np.nan))
    by["bias_pct"] = 100 * (by.virt - by.act) / by.act
    overall = {"months": int(len(df)), "r_log": float(np.corrcoef(np.log(df.act), np.log(df.virt.clip(lower=0.5)))[0, 1]),
               "bias_pct": float(100 * (df.virt.sum() - df.act.sum()) / df.act.sum()),
               "median_abs_err_pct": float(100 * np.median(np.abs(df.virt - df.act) / df.act)),
               "sigma_log": float(lr.std())}
    return overall, by


def main(src):
    OUTDIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(OUTDIR / "work.duckdb"))
    con.execute("SET preserve_insertion_order=false")
    con.execute("SET memory_limit='20GB'")
    con.execute(f"SET temp_directory='{(OUTDIR / 'tmp').as_posix()}'")
    build_celldays(con, src)
    card = {"unit": "Aqua-MODIS-equivalent fire cell-days (0.1 deg)", "satellites": {}}

    # 1) validation: fit on train years, test on held-out years
    for sat, (tr, te) in VIIRS_SATS.items():
        fit(con, sat, *tr, "val")
        overall, by = validate(con, sat, te)
        card["satellites"][sat] = {"train": tr, "test": te, "test_metrics": overall,
                                   "by_country": json.loads(by.round(4).reset_index().to_json(orient="records"))}
        print(f"[validation] {sat} train {tr} test {te}: " + ", ".join(f"{k}={v:.3f}" for k, v in overall.items()))

    # 2) production fits on all pre-drift overlap years
    fit(con, "SNPP", 2012, 2021, "snpp")
    fit(con, "NOAA20", 2018, 2021, "noaa20")

    # 3) Terra -> Aqua ratio for the months before Aqua existed
    con.execute(f"""
    CREATE OR REPLACE TABLE tr AS
    WITH t AS (SELECT country, month(date) m, count(*) n FROM (SELECT DISTINCT country,gy,gx,date,dn FROM cd WHERE sat='Terra')
               WHERE year(date) BETWEEN 2003 AND 2011 GROUP BY ALL),
         a AS (SELECT country, month(date) m, count(*) n FROM aqua WHERE year(date) BETWEEN 2003 AND 2011 GROUP BY ALL),
         j AS (SELECT t.country, t.m, t.n tn, coalesce(a.n,0) an FROM t LEFT JOIN a USING (country, m)),
         g AS (SELECT m, sum(an)/sum(tn) rg FROM j GROUP BY m)
    SELECT country, m, (an + {K_RATE}*rg)/(tn + {K_RATE}) ratio FROM j JOIN g USING (m)""")

    # 4) assemble cell-month series
    con.execute(f"""
    CREATE OR REPLACE TABLE harm AS
    WITH terra AS (
      SELECT c.country, gy, gx, date_trunc('month', date) ym, count(*) * any_value(coalesce(tr.ratio, 1.0)) v
      FROM (SELECT DISTINCT country, gy, gx, date, dn FROM cd WHERE sat='Terra' AND date < DATE '2002-08-01') c
      LEFT JOIN tr ON tr.country=c.country AND tr.m=month(c.date) GROUP BY ALL),
    aq AS (SELECT country, gy, gx, date_trunc('month', date) ym, count(*)::DOUBLE v FROM aqua
           WHERE date >= DATE '2002-08-01' AND date < DATE '2012-01-01' GROUP BY ALL),
    -- relay, decided per DAY: average the VIIRS satellites that delivered data that day, so an outage of
    -- one satellite (e.g. S-NPP Jul-Aug 2022, Jul 2024) is covered by the other instead of diluting the month
    vs AS (SELECT country, gy, gx, date, sum(w) v FROM ({virtual(con, 'SNPP', 'snpp')})
           WHERE date >= DATE '2012-01-01' GROUP BY ALL),
    vn AS (SELECT country, gy, gx, date, sum(w) v FROM ({virtual(con, 'NOAA20', 'noaa20')}) GROUP BY ALL),
    snpp_d AS (SELECT DISTINCT date FROM cd WHERE sat='SNPP'),
    n20_d AS (SELECT DISTINCT date FROM cd WHERE sat='NOAA20'),
    relday AS (
      SELECT country, gy, gx, date,
        CASE WHEN s.date IS NOT NULL AND n.date IS NOT NULL THEN (coalesce(vs.v,0)+coalesce(vn.v,0))/2
             ELSE coalesce(vs.v, vn.v) END v
      FROM vs FULL JOIN vn USING (country, gy, gx, date)
      LEFT JOIN snpp_d s USING (date) LEFT JOIN n20_d n USING (date)),
    relfix AS (SELECT country, gy, gx, date_trunc('month', date) ym, sum(v) v FROM relday GROUP BY ALL),
    raw AS (SELECT country, gy, gx, date_trunc('month', date) ym,
              sum(CASE WHEN sat IN ('Terra','Aqua') THEN npix ELSE 0 END) raw_modis,
              sum(CASE WHEN sat IN ('SNPP','NOAA20') THEN npix ELSE 0 END) raw_viirs
            FROM cd GROUP BY ALL),
    h AS (SELECT country, gy, gx, ym, v, 'terra' src FROM terra
          UNION ALL SELECT country, gy, gx, ym, v, 'aqua' FROM aq
          UNION ALL SELECT country, gy, gx, ym, v, 'virtual' FROM relfix)
    SELECT coalesce(h.country, raw.country) country, coalesce(h.gy, raw.gy) gy, coalesce(h.gx, raw.gx) gx,
           coalesce(h.ym, raw.ym) ym, coalesce(h.v, 0) harm, coalesce(raw.raw_modis,0) raw_modis,
           coalesce(raw.raw_viirs,0) raw_viirs, h.src
    FROM h FULL JOIN raw USING (country, gy, gx, ym)""")
    con.execute(f"COPY harm TO '{(OUTDIR / 'cellmonth.parquet').as_posix()}' (FORMAT parquet, COMPRESSION zstd)")

    # 5) country-month series (with actual Aqua & Terra for comparison plots)
    con.execute(f"""
    COPY (
      WITH h AS (SELECT country, ym, sum(harm) harm, sum(raw_modis) raw_modis, sum(raw_viirs) raw_viirs FROM harm GROUP BY ALL),
           a AS (SELECT country, date_trunc('month', date) ym, count(*) aqua_actual FROM aqua GROUP BY ALL),
           t AS (SELECT country, date_trunc('month', date) ym, count(*) terra_actual
                 FROM (SELECT DISTINCT country,gy,gx,date,dn FROM cd WHERE sat='Terra') GROUP BY ALL)
      SELECT * FROM h LEFT JOIN a USING (country, ym) LEFT JOIN t USING (country, ym) ORDER BY country, ym
    ) TO '{(OUTDIR / 'country_month.parquet').as_posix()}' (FORMAT parquet)""")

    (OUTDIR / "model_card.json").write_text(json.dumps(card, indent=2))
    print(con.execute("SELECT src, count(*), round(sum(harm)) FROM harm GROUP BY ALL").df().to_string())
    con.close()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else (ROOT / "data/processed/hotspots.parquet").as_posix())
