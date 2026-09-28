# Insight Backlog: MVP

Un board de ideas donde la empresa y sus usuarios proponen, votan y deciden en ciclos qué entra al roadmap. Implementa el [PRD](insightbacklog.md).

**No tiene dependencias.** El backend usa solo la biblioteca estándar de Python 3.9+ (http.server + SQLite) y el frontend es una SPA en JavaScript sin paso de build.

## Arrancar

```bash
python3 run.py --seed        # con datos demo → http://localhost:8000
python3 run.py               # base vacía → abre el asistente de setup (/#/setup)
python3 -m unittest discover tests   # reglas de negocio del PRD
```

**Cuentas demo** (con `--seed`; todas usan la contraseña `demo1234`):

| Rol | Email |
| --- | --- |
| Admin | `admin@demo.com` |
| Usuarios | `ana@demo.com`, `bruno@demo.com`, `carla@demo.com` … `nico@demo.com` |

El demo trae un ciclo cerrado (con finalistas, una aceptada y en desarrollo, una rechazada con motivo, una idea A validada y una B en el roadmap) y un ciclo en curso con ranking en vivo, una idea A cerca del umbral, una alerta de idea B y un reclamo a 2/5 apoyos.

**Emails:** sin SMTP configurado, todos los emails (verificación, magic link y notificaciones) quedan en el **buzón de desarrollo** (📬 en el header, `/#/dev/mail`). Desde ahí se abren los links de verificación y de magic link.

Para empezar de cero, borrá la carpeta `data/`.

## Configuración (variables de entorno)

| Variable | Default | Uso |
| --- | --- | --- |
| `IB_BASE_URL` | `http://localhost:<port>` | URL pública, se usa en los links de los emails. Con `https://`, la cookie sale como `Secure` |
| `IB_PORT` / `IB_HOST` | `8000` / `0.0.0.0` | |
| `IB_DB` | `data/insight.db` | Archivo SQLite |
| `IB_SMTP_HOST`, `IB_SMTP_PORT`, `IB_SMTP_USER`, `IB_SMTP_PASS`, `IB_SMTP_FROM` | — | Envío real de emails (STARTTLS) |
| `IB_DEV` | `1` | `0` desactiva el buzón de desarrollo (hacelo en producción) |
| `IB_TRUST_PROXY` | — | `1` usa `X-Forwarded-For` para el rate limit (detrás de un reverse proxy) |

## Estructura

```
run.py              punto de entrada
server/
  db.py             esquema SQLite (modelo de datos §9) y transacciones
  core.py           reglas: votos, ranking, reclamos, cierre de ciclo, priorización, roadmap, fusión
  api.py            API JSON, permisos y visibilidad por tipo (§7)
  auth.py           contraseñas (PBKDF2), sesiones, verificación / magic link, rate limit
  mail.py           plantillas de email es/en, preferencias, buzón / SMTP
  app.py            servidor HTTP + scheduler (cierre automático, recordatorio a 3 días)
  seed.py           datos demo
web/                SPA: index.html, styles.css, js/ (router, i18n, vistas)
tests/test_rules.py 16 tests de las reglas del PRD
```

## Cobertura del PRD

- **Pantallas de usuario (7):** Board con cuenta regresiva y tabs Comunidad / Del equipo / No finalistas; Detalle de idea; Proponer idea con sugerencia de duplicados; No finalistas (reclamar / apoyar); Finalistas; Roadmap; Registro, verificación y perfil.
- **Pantallas de admin (7):** Dashboard, Ideas del equipo, Moderación, Cierre de ciclo, Priorización (tabla + matriz), Roadmap (gestión) y Configuración (incluye el snippet del botón "Proponé una idea").
- **RF-01 a RF-20:** implementados. Español e inglés, mobile first, ranking actualizado cada 4 s, cierre automático en la zona horaria del board y rate limit en votos, registro, login y publicaciones.

## Decisiones donde el PRD no era explícito

Cada una se puede cambiar fácilmente en `server/core.py`:

1. **Las ideas B entran al roadmap al publicarse** (Planificada), porque "van al roadmap sí o sí". Al cerrar el ciclo se congela una foto de su impacto esperado en el historial, pero siguen aceptando votos en el roadmap (§6) hasta que se lanzan.
2. **La alerta de idea B** requiere al menos 5 respuestas, para no dispararse con el primer "No importante".
3. **Los reclamos vencidos cuentan como reclamo.** Un ciclo con un reclamo que no llegó a los apoyos no suma al contador de "ciclos sin reclamo". El contador vuelve a 0 cada vez que la idea compite.
4. **Cierre manual anticipado:** el ciclo siguiente arranca en ese momento y dura un mes o un trimestre. En el cierre automático arranca en la fecha de fin del ciclo anterior.
5. **Configuración de ciclo:** los cambios aplican al próximo ciclo; el ciclo en curso conserva sus reglas. La fecha de cierre del ciclo en curso se puede mover desde *Cierre de ciclo* o *Configuración*.
6. **Todo comentario de un admin es Respuesta oficial.**
7. **Impacto sugerido para ideas A:** índice 0–2 llevado a 1–5. Para C se usa el percentil del score entre las finalistas históricas, como indica el PRD.
8. **Votos de una idea tipo C:** el autor no puede votarla (supuesto del PRD). Las ideas A y B sí las puede votar el admin.
9. **Un solo board**, servido en la raíz. Todo el modelo cuelga de Organization → Board, así que sumar múltiples boards no requiere migrar.
10. **Rate limit en memoria:** se reinicia con el servidor. Es suficiente para una sola instancia.

## Pendiente para producción

- Poner el servidor detrás de un reverse proxy con HTTPS y definir `IB_BASE_URL=https://…`, `IB_DEV=0` y SMTP.
- Hacer backups de `data/insight.db` (SQLite en modo WAL).
- `ThreadingHTTPServer` con un lock global alcanza para el MVP (un board, tráfico moderado). Si crece, conviene migrar a un servidor WSGI y Postgres; la capa `db.py` es chica a propósito.
