import { Easing } from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadSans } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const serif = loadSerif("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily;
loadSerif("italic", { weights: ["400"], subsets: ["latin", "latin-ext"] });
export const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#050506",
  bg2: "#0a0a0c",
  bg3: "#111114",
  ink: "#f3eee6",
  muted: "rgba(243,238,230,.64)",
  faint: "rgba(243,238,230,.40)",
  line: "rgba(255,255,255,.09)",
  line2: "rgba(255,255,255,.16)",
  ember: "#ff6a1f",
  ember2: "#ffb25c",
  flare: "#ffe2b8",
  modis: "#8ec5ff",
  viirs: "#c4a6ff",
  good: "#8fd6a0",
  raw: "#a7a39c",
};

export const expo = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
