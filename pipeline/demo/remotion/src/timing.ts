export const FPS = 30;
export const DURATION_S = 29.9;
export const W = 1920;
export const H = 1080;

const f = (s: number) => Math.round(s * FPS);

// Scene cuts in seconds - keep in sync with make_audio.py (music hits land on these)
export const CUT_S = {
  hook: 0,
  collapse: 4.3,
  title: 8.05,
  data: 11.45,
  disasters: 15.95,
  app: 19.5,
  future: 23.2,
  end: 26.1,
};
export const CUT = Object.fromEntries(Object.entries(CUT_S).map(([k, v]) => [k, f(v)])) as Record<keyof typeof CUT_S, number>;
export const TOTAL = f(DURATION_S);

// English subtitles = the voiceover script (timings measured from the final voice track)
export const CAPTIONS: [number, number, string][] = [
  [0.37, 3.94, "Fire maps say Earth burns six times more than twenty years ago."],
  [4.46, 7.74, "It doesn't. New satellites simply see smaller fires."],
  [8.2, 11.25, "We're Team ALAZ, and this is ALAZ Relay."],
  [11.63, 15.82, "From half a billion NASA fire detections, we taught VIIRS to count like MODIS:"],
  [16.11, 19.31, "one consistent record, that finds real disasters on its own."],
  [19.67, 23.01, "Draw any place on Earth, and get its fire calendar since 2000."],
  [23.35, 25.75, "When MODIS retires, the relay carries on."],
  [26.35, 28.75, "Satellites changed. Fires didn't."],
];
