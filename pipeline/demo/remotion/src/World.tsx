import React, { useLayoutEffect, useMemo, useRef } from "react";
import { geoNaturalEarth1, geoPath, GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import hero from "./data/hero.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const land = feature(landTopo as any, (landTopo as any).objects.land) as any;
const HV = Float32Array.from(hero.v as number[], (x) => x / 10);

export type Extent = [[number, number], [number, number]];

export const useProjection = (extent: Extent): GeoProjection =>
  useMemo(() => geoNaturalEarth1().fitExtent(extent, land), [extent[0][0], extent[0][1], extent[1][0], extent[1][1]]);

/** Real fire climatology of the 14,000 most active cells (ALAZ Relay, 2003-2025), animated through the year. */
export const WorldFire: React.FC<{
  extent: Extent;
  month: number; // fractional month 0..12
  dotAlpha?: number;
  landAlpha?: number;
  width?: number;
  height?: number;
}> = ({ extent, month, dotAlpha = 1, landAlpha = 1, width = 1920, height = 1080 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const proj = useProjection(extent);
  const xy = useMemo(() => {
    const a = new Float32Array(hero.n * 2);
    for (let i = 0; i < hero.n; i++) {
      const p = proj([hero.lon[i], hero.lat[i]]) || [-99, -99];
      a[i * 2] = p[0];
      a[i * 2 + 1] = p[1];
    }
    return a;
  }, [proj]);

  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = landAlpha;
    ctx.beginPath();
    geoPath(proj, ctx)(land);
    ctx.fillStyle = "#121216";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const m0 = Math.floor(month) % 12;
    const m1 = (m0 + 1) % 12;
    const e = month - Math.floor(month);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < hero.n; i++) {
      const v = HV[i * 12 + m0] * (1 - e) + HV[i * 12 + m1] * e;
      if (v < 0.5) continue;
      const a = Math.min(0.75, 0.1 + Math.log1p(v) * 0.11) * dotAlpha;
      const r = 1.6 + Math.min(Math.sqrt(v), 6) * 0.42;
      ctx.fillStyle = v > 12 ? `rgba(255,214,160,${a})` : v > 4 ? `rgba(255,140,60,${a})` : `rgba(255,90,30,${a})`;
      ctx.fillRect(xy[i * 2] - r / 2, xy[i * 2 + 1] - r / 2, r, r);
    }
    ctx.globalCompositeOperation = "source-over";
  }, [month, dotAlpha, landAlpha, proj, xy, width, height]);

  return <canvas ref={ref} width={width} height={height} style={{ position: "absolute", inset: 0 }} />;
};
