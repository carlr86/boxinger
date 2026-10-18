"""Música y efectos del video, sintetizados acá mismo (sin archivos de terceros), y unión con el MP4.

Uso: python sonido.py [video.mp4]   (por defecto boxinger-tu-buzon-a-tu-medida.mp4; reemplaza su audio)
Los momentos de cada efecto salen de eventos.json, que escribe grabar.py a partir del guion de video.html.
Necesita numpy e imageio-ffmpeg.
"""
import json, pathlib, subprocess, sys, wave
import numpy as np
import imageio_ffmpeg

SR = 48000
AQUI = pathlib.Path(__file__).resolve().parent
EV = json.loads((AQUI / "eventos.json").read_text())
DUR = EV["duracion"]
rng = np.random.default_rng(11)
L = int(DUR * SR)
music = np.zeros((L, 2))
sfx = np.zeros((L, 2))


def add(buf, t, x, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= L or i < 0: return
    x = x[: L - i] * gain
    buf[i : i + len(x), 0] += x * np.sqrt(0.5 * (1 - pan))
    buf[i : i + len(x), 1] += x * np.sqrt(0.5 * (1 + pan))


def tt(d): return np.arange(int(d * SR)) / SR


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); acc = 0.0
    for n, v in enumerate(x):
        acc = (1 - a) * v + a * acc; y[n] = acc
    return y


def hz(note):
    names = {'C': -9, 'C#': -8, 'D': -7, 'Eb': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'Ab': -1, 'A': 0, 'Bb': 1, 'B': 2}
    return 440 * 2 ** ((names[note[:-1]] + 12 * (int(note[-1]) - 4)) / 12)


# ---------- Música: 96 bpm, compases de 2,5 s, en Fa mayor (la misma del video «Cargar una idea») ----------
BEAT = 0.625
BAR = 4 * BEAT
F_, AM, DM, BB = (['F3', 'A3', 'C4', 'E4'], 'F2'), (['A3', 'C4', 'E4', 'G4'], 'A2'), (['D3', 'F3', 'A3', 'C4'], 'D2'), (['Bb2', 'D3', 'F3', 'A3'], 'Bb1')
CSUS = (['C3', 'F3', 'G3', 'Bb3'], 'C2')
FINAL = (['F3', 'A3', 'C4', 'E4', 'G4'], 'F2')
# el acorde final entra con la última diapositiva (32,6 s ≈ compás 13)
CHORDS = [F_, AM, DM, BB] * 3 + [CSUS]


def pad(freqs, d):
    t = tt(d)
    env = np.minimum(1, t / 0.35) * np.minimum(1, (d - t) / 0.5)
    x = sum(np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t + 2) + 0.6 * np.sin(2 * np.pi * f * 1.004 * t) for f in freqs)
    return x * env / len(freqs)


def pluck(f, d=0.9):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 9)) * np.exp(-t * 5.5) * np.minimum(1, t / 0.004)


def bass(f, d):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 2.2) * np.minimum(1, t / 0.01)


def kick():
    t = tt(0.35)
    f = 45 + 85 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def hat():
    n = rng.standard_normal(int(0.04 * SR))
    return (n - lowpass(n, 6000)) * np.exp(-tt(0.04) * 90)


HAT = hat()
for b, (notes, root) in enumerate(CHORDS + [FINAL]):
    t0 = b * BAR
    final = b == len(CHORDS)
    d = DUR - t0 if final else BAR + 0.5
    add(music, t0, pad([hz(n) for n in notes], d), 0.75 if final else 0.55)
    add(music, t0, bass(hz(root), 4.0 if final else BAR), 0.28)
    if final:
        for k, n in enumerate(['F5', 'A5', 'C6', 'E6', 'G6']):
            add(music, t0 + k * 0.11, pluck(hz(n), 2.5), 0.22, pan=-0.4 + 0.2 * k)
        continue
    if b >= 1:
        up = [hz(n) * 2 for n in notes]
        for k, i in enumerate([0, 1, 2, 3, 2, 1, 2, 3]):
            add(music, t0 + k * BEAT / 2, pluck(up[i], 0.8), 0.16 if b < 12 else 0.11, pan=(-0.3, 0.3)[k % 2])
    if 2 <= b < 12:
        for k in range(4):
            if k % 2 == 0: add(music, t0 + k * BEAT, kick(), 0.42)
            add(music, t0 + k * BEAT + BEAT / 2, HAT, 0.05, pan=0.25)


# ---------- Efectos ----------
def click():
    n = rng.standard_normal(int(0.012 * SR))
    n = n - lowpass(n, 2500)
    t = tt(0.05)
    x = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 180) * 0.5
    x[: len(n)] += n * np.exp(-tt(0.012) * 400)
    return x


def key():
    d = 0.03
    n = rng.standard_normal(int(d * SR))
    n = lowpass(n - lowpass(n, 1200 + rng.random() * 800), 7000)
    return n * np.exp(-tt(d) * (140 + rng.random() * 60))


def pop(f0):
    t = tt(0.12)
    f = f0 * (1 + 0.6 * (1 - np.exp(-t * 60)))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30) * np.minimum(1, t / 0.002)


def bell(f, d=1.6):
    t = tt(d)
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * dk) for r, a, dk in ((1, 1, 3), (2.0, 0.35, 5), (3.01, 0.15, 8), (4.2, 0.08, 11)))


def whoosh(d=0.55, f1=350, f2=3200):
    n = rng.standard_normal(int(d * SR))
    t = tt(d)
    env = np.sin(np.pi * t / d) ** 2
    return (lowpass(n, f2) - lowpass(n, f1)) * env


def toggle():  # clic + un «plop» grave, como un interruptor
    c, p = click(), pop(380)
    x = np.zeros(max(len(c), len(p)))
    x[: len(c)] += 0.7 * c; x[: len(p)] += 0.6 * p
    return x


pops = ticks = chimes = 0
for e in EV["eventos"]:
    t, k = e["t"], e["k"]
    if k == "swipe": add(sfx, t - 0.15, whoosh(), 0.3, 0.3)
    elif k == "click": add(sfx, t, click(), 0.55, rng.uniform(-0.2, 0.2))
    elif k == "key": add(sfx, t + rng.normal(0, 0.006), key(), 0.5 * (0.7 + 0.5 * rng.random()), rng.uniform(-0.2, 0.2))
    elif k == "toggle": add(sfx, t, toggle(), 0.6, 0.3)
    elif k == "pop": add(sfx, t, pop(480 * 2 ** (pops / 6)), 0.32, -0.3 + 0.3 * (pops % 3)); pops += 1
    elif k == "tick": add(sfx, t, pop(700 * 2 ** (ticks / 12)), 0.3, 0.1); add(sfx, t, click(), 0.25); ticks += 1
    elif k == "chime":
        notes = [('C6', 'G6'), ('E6', 'A6'), ('F6', 'C7')][min(chimes, 2)]
        add(sfx, t, bell(hz(notes[0])), 0.55, -0.1); add(sfx, t + 0.13, bell(hz(notes[1])), 0.45, 0.1); chimes += 1


# ---------- Mezcla ----------
def highpass(x, fc):
    return x - np.stack([lowpass(x[:, 0], fc), lowpass(x[:, 1], fc)], axis=1)


fade_out = np.ones(L); fo = int(1.8 * SR); fade_out[-fo:] = np.linspace(1, 0, fo) ** 2
music = highpass(music, 40)
music *= 0.32 / np.percentile(np.abs(music), 99.5)
sfx *= 0.55 / np.max(np.abs(sfx))
mix = (music + sfx) * fade_out[:, None]
mix = np.where(np.abs(mix) > 0.8, np.sign(mix) * (0.8 + 0.2 * np.tanh((np.abs(mix) - 0.8) / 0.2)), mix)
mix *= 0.89 / np.max(np.abs(mix))

wav = AQUI / "sonido.wav"
with wave.open(str(wav), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
video = AQUI / (sys.argv[1] if len(sys.argv) > 1 else "boxinger-tu-buzon-a-tu-medida.mp4")
tmp = video.with_suffix(".tmp.mp4")
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(video), "-i", str(wav),
                "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(tmp)], check=True)
tmp.replace(video)
wav.unlink()  # el audio ya quedó dentro del MP4
print("listo:", video)
