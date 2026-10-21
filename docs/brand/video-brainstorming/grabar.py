"""Graba video.html cuadro por cuadro con Chrome sin ventana, arma el MP4 y le suma el sonido.

Uso: python grabar.py [--fps 30] [--solo 1.0,6.5,...]   (--solo saca PNG de prueba en esos segundos)
Necesita playwright, imageio-ffmpeg y numpy (pip install playwright imageio-ffmpeg numpy) y Google Chrome.
"""
import argparse, asyncio, json, pathlib, subprocess, sys, tempfile
import imageio_ffmpeg
from playwright.async_api import async_playwright

AQUI = pathlib.Path(__file__).resolve().parent

async def main(a):
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        pg = await b.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=1)
        await pg.goto((AQUI / "video.html").as_uri(), wait_until="networkidle")
        await pg.evaluate("window.ready")
        dur = await pg.evaluate("DURATION")
        # Momentos de clics, tecleo y pases de diapositiva, para sonido.py
        (AQUI / "eventos.json").write_text(json.dumps({"duracion": dur, "eventos": await pg.evaluate("EVENTS")}, indent=1))
        if a.solo:
            for t in [float(x) for x in a.solo.split(",")]:
                await pg.evaluate(f"renderAt({t})")
                await pg.screenshot(path=str(AQUI / f"prueba-{t:05.2f}.png"))
            await b.close(); return
        tmp = pathlib.Path(tempfile.mkdtemp())
        n = int(round(dur * a.fps))
        for i in range(n):
            await pg.evaluate(f"renderAt({i / a.fps})")
            await pg.screenshot(path=str(tmp / f"f{i:05d}.png"))
            if i % 120 == 0: print(f"{i}/{n}", flush=True)
        await b.close()
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    salida = AQUI / a.salida
    subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", str(a.fps), "-i", str(tmp / "f%05d.png"),
                    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    str(salida)], check=True)
    # Portada: la primera diapositiva ya armada
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(tmp / f"f{int(4.5 * a.fps):05d}.png"), str(AQUI / "portada.png")], check=True)
    subprocess.run([sys.executable, str(AQUI / "sonido.py"), a.salida], check=True)

ap = argparse.ArgumentParser()
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--solo")
ap.add_argument("--salida", default="boxinger-brainstorming.mp4")
asyncio.run(main(ap.parse_args()))
