"""Record the 30-second project demo from the real web app.

Drives Chrome (Playwright, system Chrome - no browser download) through the live site at
http://localhost:8765, overlays English subtitles + an SI-assistance watermark, captures frames with the
Chrome DevTools screencast and encodes a 1920x1080 / 30 fps H.264 MP4 (<= 30 s).

Usage:  python pipeline/demo/record_demo.py [--url http://localhost:8765/] [--headless]
Output: web/media/alaz-relay-demo.mp4 (+ .srt with the same captions as text), played by web/demo.html
"""
import argparse
import base64
import io
import time
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "media"
W, H, FPS, DUR = 1920, 1080, 30, 30.0

# (start_s, end_s, text) - English subtitles, burned in and also written as .srt
CAPTIONS = [
    (0.3, 4.8, "We're Team ALAZ. Our challenge: harmonize NASA's MODIS and VIIRS fire hotspots."),
    (5.0, 8.6, "Manavgat, Türkiye, 2021. One fire, three satellites, three very different counts."),
    (8.7, 12.2, "Raw maps: 30× worse than 2008. On the ground: ~3.6×. ALAZ Relay: 4.2×."),
    (12.4, 16.6, "ALAZ Relay teaches VIIRS to see like MODIS, using the ten years both flew together."),
    (16.8, 20.6, "Pick any place on Earth and get its burning calendar, month by month since 2000…", "map"),
    (20.7, 24.6, "…typical seasons, anomalies and record months, with honest uncertainty. 235 countries.", "map"),
    (24.8, 28.2, "Validated on years it never saw: r = 0.99. When MODIS retires, the record carries on."),
]

OVERLAY_CSS = """
#demoCap { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 99999;
  max-width: 1500px; padding: 16px 30px; border-radius: 16px; background: rgba(6,6,8,.82);
  border: 1px solid rgba(255,255,255,.12); color: #f7f2ea; font: 500 34px/1.35 'Hanken Grotesk', system-ui, sans-serif;
  text-align: center; letter-spacing: .005em; opacity: 0; transition: opacity .25s ease; pointer-events: none;
  box-shadow: 0 20px 60px rgba(0,0,0,.5); }
#demoCap.on { opacity: 1; }
#demoCap.map { left: 415px; bottom: auto; top: 560px; max-width: 740px; font-size: 31px; }
#demoWm { position: fixed; right: 22px; bottom: 18px; z-index: 99999; pointer-events: none;
  font: 500 15px/1 'JetBrains Mono', ui-monospace, monospace; color: rgba(255,255,255,.55); letter-spacing: .04em;
  padding: 7px 11px; border-radius: 8px; background: rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.12); }
#demoChip { position: fixed; left: 40px; top: 34px; z-index: 99999; pointer-events: none; opacity: 0;
  transition: opacity .4s ease; font: 500 17px/1 'JetBrains Mono', monospace; letter-spacing: .08em; color: #ffb25c;
  padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(255,140,60,.45); background: rgba(10,8,6,.7); }
#demoChip.on { opacity: 1; }
#demoEnd { position: fixed; inset: 0; z-index: 99998; background: #050506; display: grid; place-items: center;
  opacity: 0; transition: opacity .6s ease; pointer-events: none; text-align: center; }
#demoEnd.on { opacity: 1; }
#demoEnd h1 { font: 400 112px/1.02 'Instrument Serif', serif; color: #f3eee6; letter-spacing: -.01em; }
#demoEnd h1 i { color: #ff8a3d; }
#demoEnd p { margin-top: 28px; font: 500 22px/1.5 'JetBrains Mono', monospace; color: rgba(243,238,230,.7); letter-spacing: .06em; }
#demoEnd .brand { font: 600 28px/1 'Hanken Grotesk', sans-serif; color: #f3eee6; margin-bottom: 30px; letter-spacing: .02em; }
#demoEnd .brand em { font: italic 400 34px 'Instrument Serif', serif; color: #ffb25c; }
html { scroll-behavior: auto !important; }
.nav { opacity: .0 !important; }
"""

OVERLAY_JS = """
(() => {
  const mk = (id, html = "") => { const e = document.createElement("div"); e.id = id; e.innerHTML = html; document.body.append(e); return e; };
  mk("demoCap"); mk("demoChip", "TEAM ALAZ");
  mk("demoWm", "SI-assisted production · captions &amp; capture");
  mk("demoEnd", `<div><div class="brand">ALAZ <em>Relay</em></div>
     <h1>Satellites changed.<br><i>Fires didn't.</i></h1>
     <p>TEAM ALAZ · NASA SPACE APPS CHALLENGE 2026<br>HARMONIZATION OF MODIS AND VIIRS HOT SPOTS · OPEN NASA FIRMS DATA</p></div>`);
  window.demoCap = (t, pos) => { const c = document.getElementById("demoCap"); if (!t) { c.classList.remove("on"); return; }
    c.textContent = t; c.classList.toggle("map", pos === "map"); c.classList.add("on"); };
  window.demoOn = (id, on) => document.getElementById(id).classList.toggle("on", on);
  // eased scroll so the motion reads well on video
  window.demoScroll = (target, ms) => new Promise(res => {
    const el = typeof target === "string" ? document.querySelector(target) : null;
    const y1 = el ? el.getBoundingClientRect().top + scrollY - (el.dataset.off ? +el.dataset.off : 0) : target;
    const y0 = scrollY, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2;
      scrollTo(0, y0 + (y1 - y0) * e); k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  });
  document.querySelectorAll(".reveal").forEach(e => e.classList.add("in"));
})();
"""


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main(url, headless):
    OUT.mkdir(exist_ok=True)
    frames = []  # (wall time, jpeg bytes)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=headless, args=["--hide-scrollbars", "--force-color-profile=srgb"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="dark")
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.add_style_tag(content=OVERLAY_CSS)
        page.evaluate(OVERLAY_JS)
        page.evaluate("scrollTo(0,0)")
        page.wait_for_timeout(1500)
        # replay the hero entrance for the recording
        page.evaluate("""document.documentElement.classList.add('anim');
                         requestAnimationFrame(() => requestAnimationFrame(() => {
                           document.documentElement.classList.add('play');
                           setTimeout(() => document.documentElement.classList.remove('anim','play'), 2600); }))""")

        cdp = ctx.new_cdp_session(page)

        def on_frame(ev):
            frames.append((time.perf_counter(), base64.b64decode(ev["data"])))
            cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

        cdp.on("Page.screencastFrame", on_frame)
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})
        t0 = time.perf_counter()
        T = lambda: time.perf_counter() - t0

        def until(t):
            while T() < t:
                page.wait_for_timeout(15)

        cap_i = 0
        def captions():
            nonlocal cap_i
            for i, (a, b, text, *pos) in enumerate(CAPTIONS):
                if a <= T() < b and cap_i != i + 1:
                    page.evaluate("([t, p]) => demoCap(t, p)", [text, pos[0] if pos else ""]); cap_i = i + 1
                elif cap_i == i + 1 and T() >= b:
                    page.evaluate("demoCap('')"); cap_i = 0

        def run_until(t):
            while T() < t:
                captions(); page.wait_for_timeout(20)

        # 0-5 s: hero
        page.evaluate("demoOn('demoChip', true)")
        run_until(4.6)
        page.evaluate("demoOn('demoChip', false)")
        # 5-12 s: the proof (stats, then the versus bars)
        page.evaluate("() => { demoScroll(document.querySelector('#proof .trio').getBoundingClientRect().top + scrollY - 260, 1100); }")
        run_until(8.6)
        page.evaluate("() => { demoScroll(document.querySelector('#vsBars').getBoundingClientRect().top + scrollY - 420, 900); }")
        run_until(12.3)
        # 12-16.5 s: the relay lanes
        page.evaluate("() => { demoScroll(document.querySelector('#lanes').getBoundingClientRect().top + scrollY - 300, 1100); }")
        run_until(16.6)
        # 16.5-24.5 s: explorer, Manavgat story
        page.evaluate("() => { demoScroll(document.querySelector('#explore .layout').getBoundingClientRect().top + scrollY - 24, 1000); }")
        run_until(17.9)
        # click via JS: Playwright's click would scroll the button into view and move the camera
        page.evaluate("[...document.querySelectorAll('#stories button')].find(b => b.textContent.includes('Manavgat')).click()")
        run_until(24.7)
        # 24.7-28.3 s: baton test
        page.evaluate("() => { demoScroll(document.querySelector('.handover').getBoundingClientRect().top + scrollY - 60, 1000); }")
        run_until(28.3)
        page.evaluate("demoCap(''); demoOn('demoEnd', true)")
        run_until(DUR + 0.4)
        cdp.send("Page.stopScreencast")
        browser.close()

    # ---- constant-frame-rate encode: for each output frame take the latest captured frame
    times = np.array([t for t, _ in frames]) - t0
    print(f"captured {len(frames)} frames, effective {len(frames) / max(times[-1], 1e-6):.1f} fps")
    writer = imageio_ffmpeg.write_frames(str(OUT / "alaz-relay-demo.mp4"), (W, H), fps=FPS, codec="libx264", quality=None,
                                         bitrate=None, pix_fmt_out="yuv420p", macro_block_size=8,
                                         output_params=["-crf", "17", "-preset", "slow", "-movflags", "+faststart", "-tune", "film"])
    writer.send(None)
    cache = {}
    n_out = int(DUR * FPS)
    for k in range(n_out):
        t = k / FPS
        i = int(np.searchsorted(times, t, side="right") - 1)
        i = max(i, 0)
        if i not in cache:
            cache.clear()
            im = Image.open(io.BytesIO(frames[i][1])).convert("RGB")
            if im.size != (W, H):
                im = im.resize((W, H), Image.LANCZOS)
            cache[i] = np.ascontiguousarray(np.asarray(im))
        fr = cache[i]
        if t > DUR - 0.5:  # fade out the very end
            fr = (fr * max(0.0, (DUR - t) / 0.5)).astype(np.uint8)
        writer.send(fr)
    writer.close()
    (OUT / "alaz-relay-demo.srt").write_text("\n".join(
        f"{i + 1}\n{srt_time(a)} --> {srt_time(b)}\n{text}\n" for i, (a, b, text, *_) in enumerate(CAPTIONS)), encoding="utf-8")
    print("wrote", OUT / "alaz-relay-demo.mp4")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8765/")
    ap.add_argument("--headless", action="store_true")
    a = ap.parse_args()
    main(a.url, a.headless)
