"""Capture a short screen recording of the real web app for the demo (Manavgat area -> burning calendar).

Usage: python pipeline/demo/remotion/capture_app.py   (site served at http://localhost:8765)
Output: pipeline/demo/remotion/public/app.mp4 (1920x1080, 30 fps, ~6 s)
"""
import base64
import io
import time
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
W, H, FPS, DUR = 1920, 1080, 30, 6.0

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--hide-scrollbars", "--force-color-profile=srgb"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="dark")
    pg = ctx.new_page()
    pg.goto("http://localhost:8765/", wait_until="networkidle")
    pg.evaluate("document.fonts.ready")
    pg.add_style_tag(content="html{scroll-behavior:auto!important} .nav{opacity:0!important}")
    pg.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'));"
                "const l=document.querySelector('#explore .layout'); scrollTo(0, l.getBoundingClientRect().top+scrollY-20)")
    pg.wait_for_timeout(2500)
    frames = []
    cdp = ctx.new_cdp_session(pg)

    def on_frame(ev):
        frames.append((time.perf_counter(), base64.b64decode(ev["data"])))
        cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

    cdp.on("Page.screencastFrame", on_frame)
    cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 94, "maxWidth": W, "maxHeight": H})
    t0 = time.perf_counter()
    pg.wait_for_timeout(500)
    pg.evaluate("[...document.querySelectorAll('#stories button')].find(b => b.textContent.includes('Manavgat')).click()")
    while time.perf_counter() - t0 < DUR + 0.3:
        pg.wait_for_timeout(30)
    cdp.send("Page.stopScreencast")
    b.close()

times = np.array([t for t, _ in frames]) - t0
print(f"{len(frames)} frames")
wr = imageio_ffmpeg.write_frames(str(HERE / "public" / "app.mp4"), (W, H), fps=FPS, codec="libx264", pix_fmt_out="yuv420p",
                                 macro_block_size=8, output_params=["-crf", "14", "-preset", "slow"])
wr.send(None)
last = None
for k in range(int(DUR * FPS)):
    i = max(0, int(np.searchsorted(times, k / FPS, side="right") - 1))
    if last is None or last[0] != i:
        im = Image.open(io.BytesIO(frames[i][1])).convert("RGB")
        if im.size != (W, H):
            im = im.resize((W, H), Image.LANCZOS)
        last = (i, np.ascontiguousarray(np.asarray(im)))
    wr.send(last[1])
wr.close()
print("wrote public/app.mp4")
