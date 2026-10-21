# Texto del post (LinkedIn)

¿Tu última lluvia de ideas terminó en un pizarrón lleno de post-its y nadie sabe qué se decidió?

En Boxinger ahora hay un buzón de tipo Brainstorming, con la dinámica de siempre pero en orden:

1️⃣ Todos proponen y votan, también en anónimo. Elegís la escala: tres opciones, del 1 al 5 o me gusta.
2️⃣ Agrupás las ideas por afinidad, arrastrándolas a grupos con nombre.
3️⃣ Calificás impacto y esfuerzo, y la Matriz muestra qué conviene hacer primero.
4️⃣ Aceptás las que van y pasan directo al Backlog.

Está en los planes Pro, Team y Enterprise.
👉 www.boxinger.com

#Brainstorming #ProductManagement #SaaS

---

Archivos:
- `boxinger-brainstorming.mp4`: el video (1080 × 1350, vertical 4:5, 42 s, con música y efectos). Subilo como video nativo, no como link. LinkedIn lo reproduce sin sonido hasta que la persona lo toca, por eso el video se entiende igual sin audio.
- `portada.png`: la primera diapositiva ya armada, por si LinkedIn te deja elegir la miniatura.
- `video.html` + `grabar.py` + `sonido.py`: el origen. `grabar.py` graba el video y guarda en `eventos.json` cuándo pasa cada clic, voto y pase de diapositiva; `sonido.py` sintetiza la música y los efectos con esos tiempos (sin derechos de terceros). Para regrabar todo: `python grabar.py` (necesita `pip install playwright imageio-ffmpeg numpy` y Google Chrome).
