import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  interpolateColors,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import findings from "./data/findings.json";
import { C, clamp, expo, inOut, mono, sans, serif } from "./theme";
import { CAPTIONS, CUT, FPS, TOTAL } from "./timing";
import { useProjection, WorldFire } from "./World";

const XF = 6; // crossfade frames between scenes

/* ---------------------------------------------------------------- helpers */
const Rise: React.FC<{ at: number; y?: number; dur?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  at, y = 28, dur = 20, style, children,
}) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: expo });
  return <div style={{ opacity: k, transform: `translateY(${(1 - k) * y}px)`, ...style }}>{children}</div>;
};

const Kicker: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.ember2, style }) => (
  <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.16em", textTransform: "uppercase", color, ...style }}>{children}</div>
);

const Scene: React.FC<{ from: number; to: number; first?: boolean; last?: boolean; children: React.ReactNode }> = ({
  from, to, first, last, children,
}) => (
  <Sequence from={from} durationInFrames={to - from + (last ? 0 : XF)}>
    <Fader dur={to - from + (last ? 0 : XF)} first={first} last={last}>{children}</Fader>
  </Sequence>
);

const Fader: React.FC<{ dur: number; first?: boolean; last?: boolean; children: React.ReactNode }> = ({ dur, first, last, children }) => {
  const f = useCurrentFrame();
  const a = first ? 1 : interpolate(f, [0, XF], [0, 1], clamp);
  const b = last ? interpolate(f, [dur - 12, dur], [1, 0], clamp) : interpolate(f, [dur - XF, dur], [1, 0], clamp);
  return <AbsoluteFill style={{ opacity: Math.min(a, b) }}>{children}</AbsoluteFill>;
};

const linePath = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");

const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,.6) 100%)", pointerEvents: "none" }} />
);

/* ---------------------------------------------------------------- 1+2: hook and collapse */
const T = findings.trend;
const NY = T.years.length - 1;

const HookCollapse: React.FC = () => {
  const f = useCurrentFrame();
  const CX = 120, CY = 372, CW = 1540, CH = 500;
  const x = (i: number) => CX + (i / NY) * CW;
  const y = (v: number) => CY + CH - (v / 950) * CH;
  const p = interpolate(f, [6, 86], [0, NY], { ...clamp, easing: inOut });
  const m = interpolate(f, [CUT.collapse + 2, CUT.collapse + 24], [0, 1], { ...clamp, easing: expo });
  const aq = interpolate(f, [CUT.collapse + 26, CUT.collapse + 50], [0, NY], { ...clamp, easing: inOut });

  const upto = (arr: number[], q: number, map: (i: number) => number): [number, number][] => {
    const pts: [number, number][] = [];
    const n = Math.floor(q);
    for (let i = 0; i <= n; i++) pts.push([x(i), map(i)]);
    if (q > n && n < NY) {
      const e = q - n;
      pts.push([x(n + e), map(n) * (1 - e) + map(n + 1) * e]);
    }
    return pts;
  };
  const main = upto(T.raw, p, (i) => y(T.raw[i] * (1 - m) + T.harm[i] * m));
  const head = main[main.length - 1];
  const lineColor = interpolateColors(m, [0, 1], ["#d9d3ca", C.ember]);
  const markers = [
    { yr: 2012, lab: "SUOMI NPP JOINS" },
    { yr: 2018.3, lab: "NOAA-20 JOINS" },
  ];
  const big1 = spring({ frame: f - 50, fps: FPS, config: { damping: 14, stiffness: 120 } });
  const A = interpolate(f, [CUT.collapse, CUT.collapse + 10], [1, 0], clamp);
  const B = interpolate(f, [CUT.collapse + 4, CUT.collapse + 20], [0, 1], { ...clamp, easing: expo });
  const chip = interpolate(f, [CUT.collapse + 46, CUT.collapse + 60], [0, 1], { ...clamp, easing: expo });
  const px = interpolate(f, [162, 178], [0, 1], { ...clamp, easing: expo });
  const pxFire = interpolate(f, [176, 186], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ opacity: 0.32 }}>
        <WorldFire extent={[[-40, 40], [1960, 1060]]} month={(f / 9) % 12} dotAlpha={0.9} landAlpha={0.7} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(5,5,6,.55) 0%, rgba(5,5,6,.82) 60%, rgba(5,5,6,.92) 100%)" }} />

      {/* headline A: raw */}
      <div style={{ position: "absolute", left: 120, top: 92, opacity: A, transform: `translateY(${(1 - A) * -30}px)` }}>
        <Rise at={2}><Kicker>Global fire activity · as raw hotspot maps count it</Kicker></Rise>
        <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 6 }}>
          <div style={{ fontFamily: serif, fontSize: 168, lineHeight: 1, color: C.ink, transform: `scale(${0.6 + 0.4 * big1})`, transformOrigin: "left bottom", opacity: Math.min(1, big1 * 1.4) }}>
            ×6.1
          </div>
          <div style={{ fontFamily: sans, fontSize: 28, color: C.muted, maxWidth: 520, lineHeight: 1.3, opacity: Math.min(1, big1 * 1.4) }}>
            more fire, 2012–2022 vs 2003–2011
            <br />
            <span style={{ color: C.faint, fontSize: 22 }}>all MODIS + VIIRS hotspots, summed</span>
          </div>
        </div>
      </div>

      {/* headline B: harmonized */}
      <div style={{ position: "absolute", left: 120, top: 92, opacity: B, transform: `translateY(${(1 - B) * 30}px)` }}>
        <Kicker>The same years · one consistent unit · ALAZ Relay</Kicker>
        <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 6 }}>
          <div style={{ fontFamily: serif, fontSize: 168, lineHeight: 1, color: C.ember }}>−11.5%</div>
          <div style={{ fontFamily: sans, fontSize: 28, color: C.muted, maxWidth: 470, lineHeight: 1.3 }}>
            global fire activity actually <i style={{ fontFamily: serif, fontSize: 34, color: C.ink }}>fell</i>
            <div style={{ opacity: chip, transform: `translateY(${(1 - chip) * 12}px)`, marginTop: 8, fontSize: 22, color: C.modis }}>
              Aqua MODIS alone, never harmonized: −11.0%
            </div>
          </div>
        </div>
      </div>

      {/* chart */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="emberFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.ember} stopOpacity={0.28} />
            <stop offset="1" stopColor={C.ember} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[100, 300, 500, 700, 900].map((v) => (
          <g key={v}>
            <line x1={CX} x2={CX + CW} y1={y(v)} y2={y(v)} stroke={v === 100 ? "rgba(255,255,255,.22)" : C.line} strokeDasharray={v === 100 ? "4 6" : undefined} />
            <text x={CX - 14} y={y(v) + 5} textAnchor="end" fill={C.faint} style={{ fontFamily: mono, fontSize: 16 }}>{v}</text>
          </g>
        ))}
        <text x={CX + CW + 14} y={y(100) + 5} fill={C.faint} opacity={1 - m} style={{ fontFamily: mono, fontSize: 15 }}>2003–11 = 100</text>
        {[0, 4, 8, 12, 16, 20, 22].map((i) => (
          <text key={i} x={x(i)} y={CY + CH + 34} textAnchor="middle" fill={C.faint} style={{ fontFamily: mono, fontSize: 17 }}>{T.years[i]}</text>
        ))}
        {markers.map((mk) => {
          const idx = mk.yr - 2003;
          const o = interpolate(p, [idx - 0.4, idx + 0.6], [0, 1], clamp);
          return (
            <g key={mk.lab} opacity={o}>
              <line x1={x(idx)} x2={x(idx)} y1={CY - 30} y2={CY + CH} stroke={C.viirs} strokeOpacity={0.55} strokeDasharray="3 6" />
              <text x={x(idx) + 10} y={CY - 14} fill={C.viirs} style={{ fontFamily: mono, fontSize: 17, letterSpacing: "0.1em" }}>{mk.lab}</text>
            </g>
          );
        })}
        {/* ghost of the raw line after the collapse */}
        <path d={linePath(T.raw.map((v, i) => [x(i), y(v)]))} fill="none" stroke="#d9d3ca" strokeOpacity={0.28 * m} strokeWidth={2} strokeDasharray="6 7" />
        {m > 0 && (
          <path d={`${linePath(main)}L${head[0]},${y(0)}L${x(0)},${y(0)}Z`} fill="url(#emberFill)" opacity={m} />
        )}
        {/* aqua alone */}
        {aq > 0 && (
          <path d={linePath(upto(T.aqua, aq, (i) => y(T.aqua[i])))} fill="none" stroke={C.modis} strokeWidth={2.5} strokeLinejoin="round" />
        )}
        <path d={linePath(main)} fill="none" stroke={lineColor} strokeWidth={m > 0.5 ? 4.5 : 3.5} strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={m < 0.02 ? "9 7" : undefined} filter={m > 0.3 ? "url(#glow)" : undefined} />
        {p < NY && <circle cx={head[0]} cy={head[1]} r={7} fill={C.flare} filter="url(#glow)" />}
        {/* end labels */}
        <g opacity={interpolate(p, [NY - 0.5, NY], [0, 1], clamp) * (1 - m)}>
          <text x={x(NY) + 14} y={y(T.raw[NY]) + 6} fill="#d9d3ca" style={{ fontFamily: sans, fontSize: 21, fontWeight: 600 }}>Raw hotspots</text>
        </g>
        <g opacity={m}>
          <text x={x(NY) + 14} y={y(T.raw[NY]) + 6} fill="rgba(217,211,202,.45)" style={{ fontFamily: sans, fontSize: 19 }}>raw hotspots</text>
          <text x={x(NY) + 14} y={y(T.harm[NY]) + 16} fill={C.ember} style={{ fontFamily: sans, fontSize: 21, fontWeight: 600 }}>ALAZ Relay</text>
        </g>
        <g opacity={interpolate(aq, [NY - 0.5, NY], [0, 1], clamp)}>
          <text x={x(NY) + 14} y={y(T.aqua[NY]) - 10} fill={C.modis} style={{ fontFamily: sans, fontSize: 19 }}>Aqua alone</text>
        </g>
      </svg>

      {/* why: pixel size inset */}
      <div style={{
        position: "absolute", left: 1090, top: 64, width: 720, height: 270, borderRadius: 22, background: "rgba(10,10,12,.92)",
        border: `1px solid ${C.line2}`, opacity: px, transform: `translateY(${(1 - px) * 24}px)`, boxShadow: "0 30px 80px rgba(0,0,0,.6)",
      }}>
        <Kicker style={{ position: "absolute", left: 30, top: 22, fontSize: 15 }} color={C.faint}>Same fire, two sensors</Kicker>
        {[0, 1].map((k) => {
          const left = 40 + k * 350, top = 66, S = 150, cell = S * 0.375;
          const lit = k === 1;
          return (
            <div key={k} style={{ position: "absolute", left, top }}>
              <div style={{ fontFamily: mono, fontSize: 15, color: k ? C.viirs : C.modis, marginBottom: 10, letterSpacing: "0.06em" }}>
                {k ? "VIIRS · 375 m pixels" : "MODIS · 1 km pixel"}
              </div>
              <svg width={S + 2} height={S + 2} style={{ display: "block" }}>
                <rect x={1} y={1} width={S} height={S} fill="rgba(255,255,255,.02)" stroke={k ? C.viirs : C.modis} strokeOpacity={0.8} />
                {lit && [1, 2].map((g) => (
                  <g key={g}>
                    <line x1={1 + g * cell} x2={1 + g * cell} y1={1} y2={S + 1} stroke={C.viirs} strokeOpacity={0.45} />
                    <line y1={1 + g * cell} y2={1 + g * cell} x1={1} x2={S + 1} stroke={C.viirs} strokeOpacity={0.45} />
                  </g>
                ))}
                {lit && <rect x={1 + cell} y={1} width={cell} height={cell} fill={C.ember} opacity={0.55 * pxFire} />}
                <circle cx={1 + 1.6 * cell} cy={1 + 0.62 * cell} r={5} fill={C.flare} opacity={pxFire} filter="url(#glow)" />
              </svg>
              <div style={{ position: "absolute", left: S + 22, top: 74, width: 150, fontFamily: sans, fontSize: 20, lineHeight: 1.25, color: lit ? C.ember2 : C.faint, opacity: pxFire }}>
                {lit ? "detected" : "too small: missed"}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 3: title */
const Logo: React.FC<{ s: number; size?: number }> = ({ s, size = 150 }) => (
  <svg width={size} height={size} viewBox="0 0 150 150" style={{ transform: `scale(${s})`, overflow: "visible" }}>
    <defs>
      <radialGradient id="lg"><stop offset="0" stopColor={C.ember} stopOpacity={0.55} /><stop offset="1" stopColor={C.ember} stopOpacity={0} /></radialGradient>
    </defs>
    <circle cx={75} cy={75} r={90} fill="url(#lg)" />
    <circle cx={75} cy={75} r={62} fill="none" stroke={C.ember} strokeWidth={3} strokeOpacity={0.7} />
    <circle cx={75} cy={75} r={40} fill="none" stroke={C.ember} strokeWidth={3} />
    <circle cx={75} cy={75} r={14} fill={C.ember2} />
  </svg>
);

const Title: React.FC = () => {
  const f = useCurrentFrame();
  const s = spring({ frame: f - 2, fps: FPS, config: { damping: 12, stiffness: 110 } });
  const zoom = interpolate(f, [0, 110], [1.04, 1.13]);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, opacity: 0.42 }}>
        <WorldFire extent={[[-40, 60], [1960, 1080]]} month={(f / 8 + 5) % 12} dotAlpha={0.9} landAlpha={0.55} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 48%, rgba(5,5,6,.82) 0%, rgba(5,5,6,.55) 45%, rgba(5,5,6,.85) 100%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center", paddingBottom: 60 }}>
        <Logo s={s} size={130} />
        <Rise at={8} style={{ marginTop: 36 }}><Kicker style={{ fontSize: 22, letterSpacing: "0.32em" }}>Team ALAZ presents</Kicker></Rise>
        <Rise at={13} y={40} dur={24}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 10 }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 176, color: C.ink, letterSpacing: "-0.02em" }}>ALAZ</span>
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 200, color: C.ember2 }}>Relay</span>
          </div>
        </Rise>
        <Rise at={28}>
          <div style={{ fontFamily: sans, fontSize: 32, color: C.muted, marginTop: 4 }}>
            One harmonized MODIS + VIIRS fire record for the whole planet · Nov 2000 → today
          </div>
        </Rise>
        <Rise at={40}>
          <div style={{ display: "flex", gap: 14, marginTop: 34, justifyContent: "center" }}>
            {[["MODIS · Terra + Aqua", C.modis], ["VIIRS · Suomi NPP + NOAA-20", C.viirs], ["0.1° grid · 235 countries", C.ember2]].map(([t, c]) => (
              <div key={t} style={{ fontFamily: mono, fontSize: 18, color: C.ink, padding: "11px 18px", borderRadius: 999, border: `1px solid ${C.line2}`, background: "rgba(10,10,12,.7)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: c }} />{t}
              </div>
            ))}
          </div>
        </Rise>
      </AbsoluteFill>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- lanes (data + future) */
const Lanes: React.FC<{ f: number; y1: number; future?: boolean; top: number }> = ({ f, y1, future, top }) => {
  const X0 = 360, X1 = 1790;
  const x = (yr: number) => X0 + ((yr - 2000) / (y1 - 2000)) * (X1 - X0);
  const modisEnd = future ? 2027 : 2026;
  const rows = [
    { lab: "Terra · MODIS", c: C.modis, a: 2000.15, b: modisEnd, end: future },
    { lab: "Aqua · MODIS", c: C.modis, a: 2002.5, b: modisEnd, end: future },
    { lab: "Suomi NPP · VIIRS", c: C.viirs, a: 2012, b: future ? 2026.9 : 2026 },
    { lab: "NOAA-20 · VIIRS", c: C.viirs, a: 2018.3, b: future ? 2032 : 2026 },
    ...(future ? [{ lab: "NOAA-21 · VIIRS", c: C.viirs, a: 2023, b: 2032, dashed: true }] : []),
  ] as { lab: string; c: string; a: number; b: number; end?: boolean; dashed?: boolean }[];
  const RH = 34, GAP = 18;
  const relayY = top + rows.length * (RH + GAP) + 22;
  const ticks = future ? [2000, 2005, 2010, 2015, 2020, 2025, 2030] : [2000, 2004, 2008, 2012, 2016, 2020, 2024];
  const band = future ? 0 : interpolate(f, [72, 86], [0, 1], { ...clamp, easing: expo });
  const bat = future
    ? interpolate(f, [8, 80], [2024.6, 2031.4], { ...clamp, easing: inOut })
    : interpolate(f, [36, 128], [2000.85, 2025.9], { ...clamp, easing: inOut });
  const relaySegs = [
    { a: 2000.85, b: 2002.5, c: "#5f8fbf", lab: "Terra → Aqua units" },
    { a: 2002.5, b: 2012, c: C.modis, lab: "real Aqua" },
    { a: 2012, b: 2026, c: C.ember, lab: "virtual Aqua from VIIRS" },
  ];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <filter id="bglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="relayGrad" x1="0" x2="1"><stop offset="0" stopColor={C.ember} /><stop offset="1" stopColor={C.ember2} /></linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top - 16} y2={relayY + 60} stroke={C.line} />
          <text x={x(t)} y={relayY + 88} textAnchor="middle" fill={C.faint} style={{ fontFamily: mono, fontSize: 17 }}>{t}</text>
        </g>
      ))}
      {/* overlap band */}
      <g opacity={band}>
        <rect x={x(2012)} y={top - 46} width={x(2022) - x(2012)} height={relayY + 52 - (top - 46)} rx={14} fill={C.ember} fillOpacity={0.07} stroke={C.ember} strokeOpacity={0.6} strokeDasharray="6 7" />
        <text x={x(2017)} y={top - 58} textAnchor="middle" fill={C.ember2} style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.12em" }}>10 YEARS FLYING TOGETHER</text>
      </g>
      {future && (
        <g>
          <line x1={x(2027)} x2={x(2027)} y1={top - 40} y2={relayY + 60} stroke={C.flare} strokeOpacity={0.7} strokeDasharray="4 6" />
          <text x={x(2027) + 10} y={top - 26} fill={C.flare} style={{ fontFamily: mono, fontSize: 17, letterSpacing: "0.1em" }}>MODIS SCIENCE ENDS ~2027</text>
        </g>
      )}
      {rows.map((r, i) => {
        const g = future ? 1 : interpolate(f, [4 + i * 4, 34 + i * 4], [0, 1], { ...clamp, easing: expo });
        const yy = top + i * (RH + GAP);
        const w = (x(r.b) - x(r.a)) * g;
        return (
          <g key={r.lab}>
            <text x={X0 - 22} y={yy + RH / 2 + 7} textAnchor="end" fill={C.muted} style={{ fontFamily: sans, fontSize: 21 }}>{r.lab}</text>
            <rect x={x(r.a)} y={yy} width={Math.max(0, w)} height={RH} rx={RH / 2} fill={r.c} fillOpacity={r.dashed ? 0.08 : 0.22} stroke={r.c} strokeOpacity={0.75} strokeDasharray={r.dashed ? "6 6" : undefined} />
            {r.end && <rect x={x(2027) - 2} y={yy - 4} width={8} height={RH + 8} fill={C.flare} opacity={0.9} rx={3} />}
          </g>
        );
      })}
      {/* relay record */}
      <text x={X0 - 22} y={relayY + 30} textAnchor="end" fill={C.ink} style={{ fontFamily: sans, fontSize: 23, fontWeight: 700 }}>ALAZ Relay record</text>
      {relaySegs.map((s, i) => {
        const g = future ? 1 : interpolate(f, [24 + i * 6, 60 + i * 6], [0, 1], { ...clamp, easing: expo });
        return <rect key={i} x={x(s.a)} y={relayY} width={Math.max(0, (x(s.b) - x(s.a)) * g)} height={44} rx={10} fill={s.c} fillOpacity={i === 2 ? 0.85 : 0.6} />;
      })}
      {future && <rect x={x(2026)} y={relayY} width={x(2032) - x(2026)} height={44} rx={10} fill={C.ember} fillOpacity={0.18} stroke={C.ember} strokeDasharray="7 6" />}
      {!future && relaySegs.map((s, i) => (
        <text key={s.lab} x={(x(s.a) + x(s.b)) / 2 + (i === 0 ? 10 : 0)} y={relayY + 29} textAnchor="middle" fill={i === 2 ? "#1a0b03" : C.bg}
          opacity={interpolate(f, [50 + i * 6, 64 + i * 6], [0, 1], clamp)} style={{ fontFamily: mono, fontSize: i === 0 ? 0 : 17, fontWeight: 500 }}>
          {s.lab}
        </text>
      ))}
      <circle cx={x(bat)} cy={relayY + 22} r={11} fill={C.flare} filter="url(#bglow)" opacity={interpolate(f, future ? [6, 12] : [34, 40], [0, 1], clamp)} />
    </svg>
  );
};

/* ---------------------------------------------------------------- 4: data + training */
const DataScene: React.FC = () => {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [4, 56], [0, 548_500_000], { ...clamp, easing: expo }));
  const learn = interpolate(f, [80, 96], [0, 1], { ...clamp, easing: expo });
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: 120, top: 84 }}>
        <Rise at={0}><Kicker>NASA FIRMS · standard archives · Nov 2000 – Dec 2025</Kicker></Rise>
        <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 6 }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 124, color: C.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
            {n.toLocaleString("en-US")}
          </div>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 64, color: C.ember2 }}>fire detections</div>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          {[["MODIS C6.1 · Terra + Aqua", "111.4 M", C.modis], ["VIIRS 375 m · Suomi NPP", "281.1 M", C.viirs], ["VIIRS 375 m · NOAA-20", "155.9 M", C.viirs]].map(([a, b, c], i) => (
            <Rise key={a} at={16 + i * 6} y={16}>
              <div style={{ fontFamily: mono, fontSize: 18, color: C.ink, padding: "10px 16px", borderRadius: 999, border: `1px solid ${C.line2}`, background: C.bg2, display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: c }} />{a}<span style={{ color: C.faint }}>{b}</span>
              </div>
            </Rise>
          ))}
        </div>
      </div>
      <Lanes f={f} y1={2026} top={470} />
      <div style={{
        position: "absolute", left: 360, right: 110, top: 858, fontFamily: sans, fontSize: 25, color: C.muted, opacity: learn,
        transform: `translateY(${(1 - learn) * 14}px)`,
      }}>
        Learned from the overlap: how often MODIS sees each VIIRS fire, by <span style={{ color: C.ink }}>fire power, pixel size, day/night and country</span>.
      </div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 5: disasters */
const PICK: [string, number, number, number, number][] = [
  // country, year, month, lat, lon (approximate centre of the fires)
  ["Canada", 2023, 6, 52.5, -76],
  ["Sweden", 2018, 7, 61.6, 14.6],
  ["Chile", 2023, 2, -37.2, -72.6],
  ["Indonesia", 2014, 3, 1.2, 101.6],
  ["Argentina", 2022, 1, -28.6, -57.6],
];
const SHOW = PICK.map(([c, y, m, lat, lon]) => {
  const r = findings.showcase.find((s) => s.country === c && s.year === y && s.month === m)!;
  return { ...r, lat, lon };
});
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const Disasters: React.FC = () => {
  const f = useCurrentFrame();
  const ext: [[number, number], [number, number]] = [[40, 170], [1300, 960]];
  const proj = useProjection(ext);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ opacity: 0.75 }}>
        <WorldFire extent={ext} month={(f / 9 + 4) % 12} dotAlpha={0.55} landAlpha={1} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 120, top: 70 }}>
        <Rise at={0}><Kicker>Automatic record detection · no news given to the detector</Kicker></Rise>
        <Rise at={4} y={24}>
          <div style={{ fontFamily: serif, fontSize: 82, color: C.ink, lineHeight: 1.05, marginTop: 8 }}>
            It finds the disasters <i style={{ color: C.ember2 }}>on its own.</i>
          </div>
        </Rise>
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs><filter id="pglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        {SHOW.map((s, i) => {
          const st = 14 + i * 9;
          const [px, py] = proj([s.lon, s.lat]) || [0, 0];
          const k = spring({ frame: f - st, fps: FPS, config: { damping: 11, stiffness: 160 } });
          const ph = ((f - st) % 32) / 32;
          return (
            <g key={i} opacity={f >= st ? 1 : 0}>
              <circle cx={px} cy={py} r={14 + ph * 34} fill="none" stroke={C.ember} strokeOpacity={(1 - ph) * 0.8} strokeWidth={2} />
              <circle cx={px} cy={py} r={15 * k} fill={C.ember} filter="url(#pglow)" />
              <text x={px} y={py + 6} textAnchor="middle" fill="#1a0b03" style={{ fontFamily: mono, fontSize: 17, fontWeight: 500 }} opacity={k}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", left: 1330, top: 196, width: 500 }}>
        <Rise at={6} y={12}>
          <div style={{ fontFamily: mono, fontSize: 16, color: C.good, border: "1px solid rgba(143,214,160,.4)", background: "rgba(143,214,160,.07)", borderRadius: 999, padding: "9px 16px", display: "inline-block", marginBottom: 16 }}>
            Validated on years it never saw · r = 0.99
          </div>
        </Rise>
        {SHOW.map((s, i) => {
          const st = 14 + i * 9;
          const k = interpolate(f, [st, st + 16], [0, 1], { ...clamp, easing: expo });
          return (
            <div key={i} style={{
              opacity: k, transform: `translateX(${(1 - k) * 50}px)`, marginBottom: 12, padding: "14px 20px", borderRadius: 16,
              background: "linear-gradient(135deg, rgba(255,106,31,.10), rgba(10,10,12,.92) 60%)", border: `1px solid ${C.line2}`,
              display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 16,
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 30, background: C.ember, color: "#1a0b03", fontFamily: mono, fontSize: 16, display: "grid", placeItems: "center" }}>{i + 1}</div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14, color: C.ember2, letterSpacing: "0.12em" }}>{s.label.toUpperCase()}</div>
                <div style={{ fontFamily: serif, fontSize: 36, color: C.ink, lineHeight: 1.05 }}>{s.country}</div>
                <div style={{ fontFamily: sans, fontSize: 16, color: C.muted }}>{s.event}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: serif, fontSize: 52, color: C.ember2, lineHeight: 1 }}>×{s.x_typical}</div>
                <div style={{ fontFamily: sans, fontSize: 14, color: C.faint }}>a normal {MONTHS[s.month - 1]}</div>
              </div>
            </div>
          );
        })}
        <Rise at={62} y={10}>
          <div style={{ fontFamily: mono, fontSize: 15, color: C.faint, marginTop: 4 }}>
            {findings.records_strict} record months beyond the uncertainty band since 2012
          </div>
        </Rise>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 6: the app */
const AppScene: React.FC = () => {
  const f = useCurrentFrame();
  const FX = 210, FY = 34, FW = 1500, BAR = 44, VH = Math.round((FW * 1080) / 1920);
  const zoom = interpolate(f, [28, 112], [1, 1.32], { ...clamp, easing: inOut });
  const enter = interpolate(f, [0, 18], [0, 1], { ...clamp, easing: expo });
  // cursor to the "Manavgat" story button (button at ~ (120, 974) in the 1920x1080 recording)
  const bx = FX + 120 * (FW / 1920), by = FY + BAR + 974 * (FW / 1920);
  const cm = interpolate(f, [0, 9], [0, 1], { ...clamp, easing: expo });
  const cx = 820 + (bx - 820) * cm, cy = 560 + (by - 560) * cm;
  const click = interpolate(f, [9, 22], [0, 1], clamp);
  const call = interpolate(f, [38, 54], [0, 1], { ...clamp, easing: expo });
  const bars = [
    { lab: "Raw hotspots", v: 30, c: "#cfcac2" },
    { lab: "ALAZ Relay", v: 4.2, c: C.ember },
    { lab: "Burned area, mapped on the ground", v: 3.6, c: C.good },
  ];
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #17110d 0%, #050506 70%)" }}>
      <div style={{
        position: "absolute", left: FX, top: FY, width: FW, height: VH + BAR, borderRadius: 18, overflow: "hidden",
        border: `1px solid ${C.line2}`, boxShadow: "0 40px 120px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.03)",
        transform: `translateY(${(1 - enter) * 40}px) scale(${0.96 + 0.04 * enter})`, opacity: enter, background: C.bg2,
      }}>
        <div style={{ height: BAR, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: "#141417", borderBottom: `1px solid ${C.line}` }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 12, background: c, opacity: 0.85 }} />)}
          <div style={{ marginLeft: 22, flex: 1, maxWidth: 560, height: 28, borderRadius: 8, background: "#0b0b0d", border: `1px solid ${C.line}`, fontFamily: mono, fontSize: 15, color: C.muted, display: "flex", alignItems: "center", padding: "0 14px" }}>
            etipufhu.github.io/alaz-relay
          </div>
        </div>
        <div style={{ position: "relative", width: FW, height: VH, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: "74% 86%" }}>
            <OffthreadVideo src={staticFile("app.mp4")} startFrom={6} muted style={{ width: FW, height: VH }} />
          </div>
        </div>
      </div>
      {/* cursor + click */}
      <div style={{ position: "absolute", left: cx, top: cy, opacity: interpolate(f, [26, 34], [1, 0], clamp) }}>
        <div style={{ position: "absolute", left: -26, top: -26, width: 52, height: 52, borderRadius: 52, border: `2px solid ${C.ember2}`, transform: `scale(${0.3 + click * 1.2})`, opacity: f >= 9 ? 1 - click : 0 }} />
        <svg width={26} height={30} viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L21 17 Z" fill="#fff" stroke="#000" strokeWidth={1.5} /></svg>
      </div>
      {/* callout */}
      <div style={{
        position: "absolute", left: 90, top: 560, width: 610, padding: "24px 28px", borderRadius: 20, background: "rgba(8,8,10,.94)",
        border: `1px solid ${C.line2}`, boxShadow: "0 30px 90px rgba(0,0,0,.7)", opacity: call, transform: `translateX(${(1 - call) * -40}px)`,
      }}>
        <Kicker style={{ fontSize: 15 }}>Manavgat, Türkiye · Jul–Aug 2021 vs 2008</Kicker>
        {bars.map((b, i) => {
          const g = interpolate(f, [44 + i * 6, 70 + i * 6], [0, 1], { ...clamp, easing: expo });
          return (
            <div key={b.lab} style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontSize: 20, color: C.muted }}>
                <span>{b.lab}</span>
                <span style={{ fontFamily: serif, fontSize: 32, color: b.c, lineHeight: 1 }}>{b.v === 3.6 ? "~3.6" : b.v}×</span>
              </div>
              <div style={{ height: 10, borderRadius: 10, background: "rgba(255,255,255,.06)", marginTop: 6 }}>
                <div style={{ height: 10, borderRadius: 10, width: `${(b.v / 30) * 100 * g}%`, background: b.c }} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 7: future */
const Future: React.FC = () => {
  const f = useCurrentFrame();
  const y1 = interpolate(f, [0, 26], [2026, 2032], { ...clamp, easing: expo });
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: 120, top: 84 }}>
        <Rise at={0}><Kicker>After MODIS</Kicker></Rise>
        <Rise at={4} y={24}>
          <div style={{ fontFamily: serif, fontSize: 96, color: C.ink, lineHeight: 1.02, marginTop: 8 }}>
            The record <i style={{ color: C.ember2 }}>keeps going.</i>
          </div>
        </Rise>
        <Rise at={14}>
          <div style={{ fontFamily: sans, fontSize: 26, color: C.muted, marginTop: 14, maxWidth: 1100 }}>
            Two VIIRS satellites learned it independently and agree at r = 0.997: one satellite can drop out, the relay doesn't.
          </div>
        </Rise>
      </div>
      <Lanes f={f} y1={y1} future top={420} />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- 8: end card */
const End: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ opacity: 0.3, transform: `scale(${interpolate(f, [0, 120], [1.1, 1.18])})` }}>
        <WorldFire extent={[[-40, 60], [1960, 1080]]} month={(f / 10 + 7) % 12} dotAlpha={0.9} landAlpha={0.5} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 46%, rgba(5,5,6,.9) 0%, rgba(5,5,6,.6) 50%, rgba(5,5,6,.9) 100%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center", paddingBottom: 40 }}>
        <Rise at={2}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center" }}>
            <Logo s={1} size={46} />
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 38, color: C.ink }}>ALAZ</span>
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 46, color: C.ember2, marginLeft: -6 }}>Relay</span>
          </div>
        </Rise>
        <Rise at={7} y={36} dur={24}>
          <div style={{ fontFamily: serif, fontSize: 150, color: C.ink, lineHeight: 1, marginTop: 34 }}>Satellites changed.</div>
        </Rise>
        <Rise at={50} y={36} dur={22}>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 150, color: C.ember2, lineHeight: 1.05 }}>Fires didn't.</div>
        </Rise>
        <Rise at={62}>
          <div style={{ marginTop: 40, fontFamily: mono, fontSize: 26, color: C.ink, padding: "12px 24px", borderRadius: 999, border: `1px solid ${C.line2}`, background: "rgba(10,10,12,.8)" }}>
            etipufhu.github.io/alaz-relay
          </div>
        </Rise>
        <Rise at={70}>
          <div style={{ marginTop: 30, fontFamily: mono, fontSize: 17, color: C.muted, letterSpacing: "0.12em" }}>
            TEAM ALAZ · NASA SPACE APPS CHALLENGE 2026 · HARMONIZATION OF MODIS AND VIIRS HOT SPOTS
          </div>
          <div style={{ marginTop: 10, fontFamily: sans, fontSize: 17, color: C.faint }}>
            Data: NASA FIRMS, MODIS C6.1 and VIIRS 375 m active fire archives (548.5 million records). Not affiliated with or endorsed by NASA.
          </div>
        </Rise>
      </AbsoluteFill>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- overlays */
const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  // the last line is shown as the end-card headline itself, in sync with the voice
  const cur = CAPTIONS.slice(0, -1).find(([a, b]) => t >= a - 0.08 && t <= b + 0.25);
  if (!cur) return null;
  const [a, b, text] = cur;
  const o = Math.min(interpolate(t, [a - 0.08, a + 0.08], [0, 1], clamp), interpolate(t, [b + 0.05, b + 0.25], [1, 0], clamp));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, display: "flex", justifyContent: "center", opacity: o }}>
      <div style={{
        maxWidth: 1400, padding: "13px 28px", borderRadius: 14, background: "rgba(5,5,6,.8)", border: "1px solid rgba(255,255,255,.12)",
        fontFamily: sans, fontWeight: 500, fontSize: 36, lineHeight: 1.3, color: "#f7f2ea", textAlign: "center", boxShadow: "0 16px 50px rgba(0,0,0,.5)",
      }}>{text}</div>
    </div>
  );
};

const Watermark: React.FC = () => (
  <div style={{
    position: "absolute", right: 22, top: 18, fontFamily: mono, fontSize: 14, letterSpacing: "0.06em", color: "rgba(255,255,255,.62)",
    padding: "7px 11px", borderRadius: 8, background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.14)",
  }}>
    SI-assisted production · AI voice (ElevenLabs)
  </div>
);

export const Demo: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Audio src={staticFile("mix.wav")} />
      <Scene from={0} to={CUT.title} first><HookCollapse /></Scene>
      <Scene from={CUT.title} to={CUT.data}><Title /></Scene>
      <Scene from={CUT.data} to={CUT.disasters}><DataScene /></Scene>
      <Scene from={CUT.disasters} to={CUT.app}><Disasters /></Scene>
      <Scene from={CUT.app} to={CUT.future}><AppScene /></Scene>
      <Scene from={CUT.future} to={CUT.end}><Future /></Scene>
      <Scene from={CUT.end} to={durationInFrames || TOTAL} last><End /></Scene>
      <Captions />
      <Watermark />
    </AbsoluteFill>
  );
};
