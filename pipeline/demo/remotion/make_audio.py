"""Score for the 30 s demo: procedurally synthesized music bed + sound design, mixed under the voiceover.

Everything here is generated from oscillators and noise (no samples, no copyrighted music).
The voiceover (vo/vo.wav) is an AI voice generated with ElevenLabs from our own script; see the SI note.

Output: public/mix.wav (48 kHz stereo, exactly 29.9 s)
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
SR, DUR = 48000, 29.9
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

# scene cuts (s) - keep in sync with src/timing.ts
CUT = dict(collapse=4.30, title=8.05, data=11.45, disasters=15.95, app=19.50, future=23.20, end=26.10)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def env(a, b, att=0.02, rel=0.3):
    """0..1 gate from a to b with linear attack and release."""
    e = np.clip((t - a) / max(att, 1e-4), 0, 1) * np.clip((b - t) / max(rel, 1e-4), 0, 1)
    return e


def saw(f, det=0.0):
    ph = (t * f * (1 + det)) % 1.0
    return 2 * ph - 1


def note(f):
    return 440.0 * 2 ** ((f - 69) / 12)


L = np.zeros(N)
R = np.zeros(N)


def add(x, gain=1.0, pan=0.0):
    global L, R
    L += x * gain * np.sqrt(0.5 * (1 - pan))
    R += x * gain * np.sqrt(0.5 * (1 + pan))


# ---------- pads: chord per section (A minor world, lifts to C major / F at the end)
chords = [  # (start, end, midi notes)
    (0.0, CUT["collapse"], [45, 52, 57, 60]),          # Am
    (CUT["collapse"], CUT["title"], [41, 48, 53, 57]),  # F
    (CUT["title"], CUT["data"], [48, 55, 60, 64]),       # C
    (CUT["data"], CUT["disasters"], [45, 52, 57, 64]),   # Am(add)
    (CUT["disasters"], CUT["app"], [43, 50, 55, 62]),    # G
    (CUT["app"], CUT["future"], [41, 48, 57, 60]),       # F
    (CUT["future"], CUT["end"], [43, 50, 59, 62]),       # G
    (CUT["end"], DUR, [48, 55, 60, 64, 67]),             # C
]
pad = np.zeros(N)
for a, b, notes in chords:
    e = env(a - 0.08, b + 0.25, att=0.35, rel=0.45)
    for k, m in enumerate(notes):
        f = note(m)
        v = (saw(f, -0.004) + saw(f, 0.0035) + 0.6 * np.sin(2 * np.pi * f * t)) / 2.6
        pad += v * e * (0.9 if k else 1.1)
pad = lp(pad, 900, 2) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.23 * t))
pad *= np.where(t < CUT["collapse"], 0.55, 1.0)  # thinner under the hook
add(pad, 0.050, -0.25)
add(lp(np.roll(pad, int(0.013 * SR)), 900), 0.050, 0.25)

# sub drone
sub = np.sin(2 * np.pi * 55 * t) * env(0, DUR, att=1.0, rel=1.2) * (0.6 + 0.4 * np.clip((t - CUT["data"]) / 3, 0, 1))
add(sub, 0.10)


# ---------- percussion
def kick(at, gain=1.0, f0=120, f1=42):
    s = int(at * SR); n = int(0.45 * SR)
    if s >= N: return
    n = min(n, N - s); tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-tt * 7.5) * gain
    L[s:s + n] += x * 0.55; R[s:s + n] += x * 0.55


def tick(at, gain=1.0, pan=0.0):
    s = int(at * SR); n = int(0.06 * SR)
    if s >= N: return
    n = min(n, N - s); tt = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 5000) * np.exp(-tt * 90) * gain
    L[s:s + n] += x * 0.3 * (1 - pan); R[s:s + n] += x * 0.3 * (1 + pan)


# hook: accelerating clock ticks as raw counts climb, cut dead at "It doesn't."
tt0, iv = 0.45, 0.42
while tt0 < CUT["collapse"] - 0.12:
    tick(tt0, 0.55 + 0.6 * tt0 / CUT["collapse"], pan=0.3 if int(tt0 * 10) % 2 else -0.3)
    tt0 += iv; iv = max(0.11, iv * 0.9)

# steady pulse from the data section to the end card (~100 bpm, half-time feel)
beat = 60 / 100
b = CUT["data"]
while b < CUT["end"] - 0.05:
    kick(b, 0.55)
    tick(b + beat / 2, 0.35, pan=0.4)
    b += beat
# a few offbeat ticks in the disasters section (cards popping)
for k in range(5):
    tick(CUT["disasters"] + 0.35 + k * 0.42, 0.5, pan=-0.5 + k * 0.25)


# ---------- impacts, risers, whooshes
def impact(at, gain=1.0):
    kick(at, 1.25 * gain, 90, 34)
    s = int(at * SR); n = min(int(2.2 * SR), N - s); tt = np.arange(n) / SR
    nz = lp(rng.standard_normal(n), 2200) * np.exp(-tt * 2.4) * 0.35 * gain
    L[s:s + n] += nz; R[s:s + n] += np.roll(nz, 211)


def riser(a, b, gain=1.0):
    s, e = int(a * SR), int(b * SR); n = e - s; tt = np.linspace(0, 1, n)
    nz = rng.standard_normal(n)
    # sweep a band-pass by processing in short blocks
    out = np.zeros(n); blk = 2048
    for i in range(0, n, blk):
        c = 300 + 5200 * tt[i] ** 2
        out[i:i + blk] = bp(nz[i:i + blk], c * 0.7, min(c * 1.4, 20000))
    out *= tt ** 2.2 * gain * 0.42
    L[s:e] += out; R[s:e] += out[::-1] * 0 + out


def whoosh(at, gain=1.0, dur=0.55):
    s = int((at - dur * 0.6) * SR); n = int(dur * SR); tt = np.linspace(0, 1, n)
    x = lp(rng.standard_normal(n), 1800) * np.sin(np.pi * tt) ** 2 * gain * 0.32
    pan = np.linspace(-0.8, 0.8, n)
    L[s:s + n] += x * (1 - pan) / 2; R[s:s + n] += x * (1 + pan) / 2


impact(CUT["collapse"], 0.9)            # "It doesn't."
riser(CUT["collapse"] + 1.6, CUT["title"], 0.8)
impact(CUT["title"], 1.1)               # title
for c in ("data", "disasters", "app", "future"):
    whoosh(CUT[c], 0.9)
riser(CUT["future"] + 1.2, CUT["end"], 0.7)
impact(CUT["end"], 1.2)                 # end card

# shimmer bell on title + end card
for at, root in ((CUT["title"] + 0.05, 72), (CUT["end"] + 0.05, 76)):
    s = int(at * SR); n = min(int(2.5 * SR), N - s); tt = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * note(root + iv) * tt) * w for iv, w in ((0, 1), (7, .6), (12, .45), (19, .25)))
    x *= np.exp(-tt * 1.6) * 0.06
    L[s:s + n] += x; R[s:s + n] += np.roll(x, 300)

music = np.stack([L, R], 1)
music = hp(music.T, 28).T

# ---------- voiceover + ducking
sr_v, vo = wavfile.read(HERE / "vo" / "vo.wav")
assert sr_v == SR
vo = vo.astype(np.float64) / 32768.0
if vo.ndim == 1: vo = np.stack([vo, vo], 1)
vo = np.vstack([vo, np.zeros((max(0, N - len(vo)), 2))])[:N]
# gentle presence + compression-ish normalization of the voice
vo = vo / (np.abs(vo).max() + 1e-9) * 0.82
lvl = np.abs(vo).mean(1)
win = int(0.12 * SR)
lvl = np.convolve(lvl, np.ones(win) / win, mode="same")
duck = 1.0 - 0.55 * np.clip(lvl / 0.05, 0, 1)            # down ~7 dB while speaking
duck = np.convolve(duck, np.ones(int(0.08 * SR)) / int(0.08 * SR), mode="same")
mb = music * duck[:, None] * 0.5
spk = lvl > 0.02
print("music under speech vs voice (dB):", round(20 * np.log10(np.sqrt((mb[spk] ** 2).mean()) / np.sqrt((vo[spk] ** 2).mean())), 1))
mix = vo + mb

# master: soft clip, fade out, normalize to -1 dBFS peak
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
fade = np.clip((DUR - t) / 0.7, 0, 1)[:, None]
mix *= fade
mix = mix / np.abs(mix).max() * 0.89
(HERE / "public").mkdir(exist_ok=True)
wavfile.write(HERE / "public" / "mix.wav", SR, (mix * 32767).astype(np.int16))
print("wrote public/mix.wav", mix.shape[0] / SR, "s; music rms", float(np.sqrt((music ** 2).mean())), "vo rms", float(np.sqrt((vo ** 2).mean())))
