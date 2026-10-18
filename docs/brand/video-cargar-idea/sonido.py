"""Música y efectos del video, sintetizados acá mismo (sin archivos de terceros), y unión con el MP4.

Uso: python sonido.py [video.mp4]   (por defecto boxinger-cargar-una-idea.mp4; reemplaza su audio)
Los tiempos de los efectos son los del guion de video.html: si cambia el guion, actualizalos acá.
Necesita numpy e imageio-ffmpeg.
"""
import pathlib, subprocess, sys, wave
import numpy as np
import imageio_ffmpeg

SR = 48000
DUR = 30.5
AQUI = pathlib.Path(__file__).resolve().parent
rng = np.random.default_rng(7)
L = int(DUR * SR)
music = np.zeros((L, 2))
sfx = np.zeros((L, 2))


def add(buf, t, x, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= L: return
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


def hz(note):  # 'A4' → 440
    names = {'C': -9, 'C#': -8, 'Db': -8, 'D': -7, 'Eb': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'Ab': -1, 'A': 0, 'Bb': 1, 'B': 2}
    return 440 * 2 ** ((names[note[:-1]] + 12 * (int(note[-1]) - 4)) / 12)


# ---------- Música: 96 bpm, compases de 2,5 s, en Fa mayor ----------
BEAT = 0.625
BAR = 4 * BEAT
CHORDS = [  # (notas del colchón, bajo)
    (['F3', 'A3', 'C4', 'E4'], 'F2'), (['A3', 'C4', 'E4', 'G4'], 'A2'), (['D3', 'F3', 'A3', 'C4'], 'D2'), (['Bb2', 'D3', 'F3', 'A3'], 'Bb1'),
    (['F3', 'A3', 'C4', 'E4'], 'F2'), (['A3', 'C4', 'E4', 'G4'], 'A2'), (['D3', 'F3', 'A3', 'C4'], 'D2'), (['Bb2', 'D3', 'F3', 'A3'], 'Bb1'),
    (['D3', 'F3', 'A3', 'C4'], 'D2'), (['C3', 'F3', 'G3', 'Bb3'], 'C2'),
]
FINAL = (['F3', 'A3', 'C4', 'E4', 'G4'], 'F2')


def pad(freqs, d):
    t = tt(d)
    env = np.minimum(1, t / 0.35) * np.minimum(1, (d - t) / 0.5)
    x = sum(np.sin(2 * np.pi * f * k * t + k) * a for f in freqs for k, a in ((1, 1), (2, 0.18)) for _ in [0])
    x += sum(np.sin(2 * np.pi * f * 1.004 * t) * 0.6 for f in freqs)
    return x * env / len(freqs)


def pluck(f, d=0.9, bright=1.0):
    t = tt(d)
    env = np.exp(-t * 5.5) * np.minimum(1, t / 0.004)
    return (np.sin(2 * np.pi * f * t) + 0.35 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t * 9)) * env


def bass(f, d):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 2.2) * np.minimum(1, t / 0.01)


def kick():
    t = tt(0.35)
    f = 45 + 85 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def hat():
    n = rng.standard_normal(int(0.04 * SR))
    n = n - lowpass(n, 6000)
    return n * np.exp(-tt(0.04) * 90)


HAT = hat()
for b, (notes, root) in enumerate(CHORDS + [FINAL]):
    t0 = b * BAR
    final = b == len(CHORDS)
    d = DUR - t0 if final else BAR + 0.5
    fr = [hz(n) for n in notes]
    add(music, t0, pad(fr, d), 0.55 if not final else 0.75)
    add(music, t0, bass(hz(root), BAR if not final else 4.0), 0.28)
    if final:
        for k, n in enumerate(['F5', 'A5', 'C6', 'E6', 'G6']):  # arpegio de cierre
            add(music, t0 + k * 0.11, pluck(hz(n), 2.5), 0.22, pan=-0.4 + 0.2 * k)
        continue
    # arpegio en corcheas desde el segundo compás (el chat queda solo con el colchón)
    if b >= 1:
        up = [hz(n) * 2 for n in notes]
        seq = [0, 1, 2, 3, 2, 1, 2, 3]
        for k in range(8):
            add(music, t0 + k * BEAT / 2, pluck(up[seq[k]], 0.8), 0.16 if b < 8 else 0.11, pan=(-0.3, 0.3)[k % 2])
    # batería suave mientras se ve la app (de 5 s a 20 s)
    if 2 <= b < 8:
        for k in range(4):
            if k % 2 == 0: add(music, t0 + k * BEAT, kick(), 0.42)
            add(music, t0 + k * BEAT + BEAT / 2, HAT, 0.05, pan=0.25)

# ---------- Efectos ----------
def click():
    n = rng.standard_normal(int(0.012 * SR))
    n = n - lowpass(n, 2500)
    t = tt(0.05)
    body = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 180)
    x = body * 0.5
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


def whoosh(d=0.6, f1=400, f2=3000):
    n = rng.standard_normal(int(d * SR))
    t = tt(d)
    env = np.sin(np.pi * t / d) ** 2
    lo = lowpass(n, f1); hi = lowpass(n, f2)
    return (hi - lo) * env


# clics de los cursores (los mismos tiempos que video.html)
for t, pan in [(1.3, 0.1), (3.18, 0.4), (5.12, 0.4), (6.08, 0), (8.22, 0), (11.6, -0.1), (12.48, 0.2), (16.05, -0.4), (16.65, 0.4), (17.25, 0.3), (19.72, 0.2)]:
    add(sfx, t, click(), 0.55, pan)
# tecleo: un golpe por letra que aparece
for text_len, a, b, g in [(56, 1.45, 2.85, 0.45), (28, 6.25, 7.85, 0.55), (77, 8.35, 11.0, 0.5)]:
    for k in range(1, text_len + 1):
        if k % 2 and text_len > 40 and rng.random() < 0.45: continue  # menos golpes cuando escribe rápido
        add(sfx, a + (b - a) * (k - 0.5) / text_len + rng.normal(0, 0.006), key(), g * (0.7 + 0.5 * rng.random()), rng.uniform(-0.2, 0.2))
# envío del chat, aparición del modal, idea publicada
add(sfx, 3.2, pop(520), 0.35)
add(sfx, 3.4, whoosh(0.7, 300, 2400), 0.22)
add(sfx, 5.3, whoosh(0.4, 600, 4000), 0.12)
add(sfx, 13.35, bell(hz('C6')), 0.6, -0.1)
add(sfx, 13.5, bell(hz('G6')), 0.5, 0.1)
# votos que suben: burbujas cada vez más agudas
for n in range(14):
    add(sfx, 15.6 + n * 0.24, pop(560 * 2 ** (n / 24)), 0.22, -0.5 + rng.random() * 0.4)
# Aprobada
add(sfx, 19.75, bell(hz('E6')), 0.5)
add(sfx, 19.87, bell(hz('A6')), 0.45)
add(sfx, 20.0, bell(hz('C7'), 2.2), 0.35)
# fondo difuminado y cierre
add(sfx, 20.55, whoosh(0.9, 200, 1800), 0.25)
add(sfx, 24.9, whoosh(0.6, 400, 3000), 0.12)

# ---------- Mezcla ----------
fade_out = np.ones(L); fo = int(1.6 * SR); fade_out[-fo:] = np.linspace(1, 0, fo) ** 2
def highpass(x, fc):
    return x - np.stack([lowpass(x[:, 0], fc), lowpass(x[:, 1], fc)], axis=1)


music = highpass(music, 40)
music *= 0.32 / np.percentile(np.abs(music), 99.5)  # música de fondo, por debajo de los efectos
sfx *= 0.55 / np.max(np.abs(sfx))
mix = (music + sfx) * fade_out[:, None]
print(f"pico antes del limitador: {np.max(np.abs(mix)):.2f}")
mix = np.where(np.abs(mix) > 0.8, np.sign(mix) * (0.8 + 0.2 * np.tanh((np.abs(mix) - 0.8) / 0.2)), mix)  # solo toca los picos
mix *= 0.89 / np.max(np.abs(mix))  # pico en −1 dBFS
wav = AQUI / "sonido.wav"
with wave.open(str(wav), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())

video = AQUI / (sys.argv[1] if len(sys.argv) > 1 else "boxinger-cargar-una-idea.mp4")
tmp = video.with_suffix(".tmp.mp4")
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(video), "-i", str(wav),
                "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(tmp)], check=True)
tmp.replace(video)
print("listo:", video, "· audio en", wav.name)
