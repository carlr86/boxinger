# Texto del post (LinkedIn)

No todos los buzones de ideas son iguales. Ahora en Boxinger elegís cómo arrancar el tuyo:

✅ Con una plantilla: Producto digital ya viene armado con Ranking, Backlog, Roadmap, Status y Novedades.
✅ En blanco: arranca con Buzón y Ranking, y prendés solo los módulos que usás.

Después le ponés nombre, decidís quién lo ve y quién propone ideas, y listo.

Abrí tu primer buzón hoy. Plan Free sin tarjeta de crédito.
👉 www.boxinger.com

#ProductManagement #Feedback #SaaS

---

Archivos:
- `boxinger-tu-buzon-a-tu-medida.mp4`: el video (1080 × 1350, vertical 4:5, 39 s, con música y efectos). Subilo como video nativo, no como link. LinkedIn lo reproduce sin sonido hasta que la persona lo toca, por eso el video se entiende igual sin audio.
- `portada.png`: la primera diapositiva ya armada, por si LinkedIn te deja elegir la miniatura.
- `video.html` + `grabar.py` + `sonido.py`: el origen. `grabar.py` graba el video y guarda en `eventos.json` cuándo pasa cada clic, tecleo y pase de diapositiva; `sonido.py` sintetiza la música y los efectos con esos tiempos (sin derechos de terceros). Para regrabar todo: `python grabar.py` (necesita `pip install playwright imageio-ffmpeg numpy` y Google Chrome).
