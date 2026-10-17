---
name: boxinger-brand
description: Identidad de marca de Boxinger (buzón de ideas para equipos de producto, www.boxinger.com) — logo, colores, letra, ilustraciones, voz y tono, landing, presentaciones y redes sociales, con logos, ilustraciones SVG y plantillas listas para exportar a PNG. Usalo siempre que haya que crear, editar o revisar cualquier pieza de Boxinger, aunque no se diga "marca" ni "brandbook" — posts, historias, carruseles y banners para Instagram, LinkedIn o X; presentaciones; emails; anuncios; secciones o páginas de la landing; la imagen al compartir el link; textos de marketing o mensajes de la app. También cuando pidan los colores, el logo, la letra o las ilustraciones de Boxinger, o quieran saber si algo "está en marca".
---

# Marca Boxinger

Boxinger es el buzón de ideas para equipos de producto: la comunidad propone y vota, el equipo revisa, y las ideas aprobadas pasan al Backlog, la Matriz, el Roadmap y Status. Al lanzarlas aparecen en Novedades. La marca tiene que transmitir **orden, escucha y transparencia**, sin ruido ni promesas grandes.

El manual completo, para personas, está en https://claude.ai/artifact/P41jG8RLU6KJ3MdLm3QbJK. Este skill tiene lo mismo, ordenado para trabajar.

## Qué leer según la pieza

Lo esencial está abajo. Antes de diseñar, leé además la referencia de la pieza que te piden:

| Pieza | Leé |
|---|---|
| Post, historia, carrusel, portada de LinkedIn o X, imagen al compartir link | `references/redes.md` |
| Presentación o diapositivas | `references/presentaciones.md` |
| Sección o página web, email de marketing, anuncio | `references/landing.md` |
| Cualquier pieza con ilustración | `references/ilustraciones.md` |
| Textos (copy, posts, mails, mensajes de la app) | `references/voz.md` |
| Dudas de color, contraste o colores de estado de la app | `references/color.md` |
| Uso del logo: versiones, resguardo, tamaños, errores | `references/logo.md` |

## Lo esencial

### Color

| Nombre | HEX | Para qué |
|---|---|---|
| Verde Buzón (primario) | `#059669` | Logo, botón principal, portadas, fondos de marca |
| Verde Hondo | `#047857` | Hover del verde y **texto verde chico** sobre blanco |
| Verde Brote | `#10b981` | El verde sobre fondos oscuros, gráficos |
| Tinta | `#0f172a` | Textos, fondos oscuros |
| Tinta Verde | `#0b2b22` | Títulos, textos y pie de la landing |
| Violeta IA | `#4338ca` | **Solo** Asistente IA y plan Enterprise (hover `#3730a3`) |
| Niebla | `#f5f7f6` | Fondos claros alternados |
| Menta / Verde Suave | `#ecfdf5` / `#d1fae5` | Fondos suaves, destacados |

- Proporción aproximada: 62% blancos y neutros, 20% verde, 10% tinta, 5% Verde Brote, 3% violeta. Si una pieza se ve violeta, algo está mal (salvo dentro de las ilustraciones, que tienen su propia paleta).
- Blanco sobre `#059669` da 3,8:1: alcanza para títulos y botones, no para texto chico. Para texto chico usá `#047857` o Tinta.
- Verde Brote nunca como texto sobre blanco.

### Letra

- **Plus Jakarta Sans** (Google Fonts) para títulos y piezas de marca: ExtraBold 800 en títulos grandes con el espaciado apenas cerrado (−0,03em), Bold 700 en subtítulos.
- En la app y en los textos corridos de la landing va la letra del sistema (`-apple-system, "Segoe UI", …`).
- Para datos, códigos de idea o URLs, una monoespaciada.
- Cargá la fuente en HTML con `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap` y esperá a que cargue antes de exportar. Si no, sale con la letra de reemplazo y la pieza queda mal.

### Logo

Archivos en `assets/logo/`:
- `boxinger-principal.svg`: globo verde y B clara, sobre blanco, fondos claros o Tinta.
- `boxinger-negativo.svg`: globo blanco y B verde, **solo** sobre Verde Buzón.
- `boxinger-una-tinta.svg`: impresiones a un color.

Con el nombre al lado: "Boxinger" en Plus Jakarta Sans ExtraBold, con una separación de ¼ del ancho del símbolo. No lo estires, no lo gires, no le cambies los colores (ni siquiera por otros de la paleta), no le agregues sombras ni degradados, y no separes la B del globo. Ponelo sobre fondos con contraste: nunca sobre Verde Brote. Detalles en `references/logo.md`.

### Ilustraciones

12 dibujos en `assets/illustrations/` (personas que proponen, empujan, ordenan y festejan; violeta, amarillo, azul pizarra y crema). Sobre blanco van directo; sobre verde o Tinta, **dentro de una tarjeta blanca** con esquinas bien redondeadas, y pueden asomar del borde. No cambies sus colores, no las pongas directo sobre verde, violeta o fotos, y no las mezcles con fotos de stock. Usá una por pieza. Cuál elegir: `references/ilustraciones.md`.

### Voz

Clara, cercana, ordenada y transparente. En español usá **voseo** ("Invitá", "Empezá", "Abrí tu primer buzón hoy."), con frases cortas y verbos concretos. Mostrá números reales, sin hype, sin MAYÚSCULAS para gritar y sin "¡¡!!". En inglés, el mismo tono directo. Vocabulario fijo: Buzón, Idea, votos Importante / Interesante / No importante, Ranking, Backlog, Matriz, Roadmap, Status, Novedades, Asistente IA, planes Free / Pro / Enterprise. Siempre **Boxinger** con B mayúscula. Detalles y ejemplos en `references/voz.md`.

### Frases de la marca

- Lema: **Las ideas de tus usuarios, ordenadas en un solo buzón.**
- Bajada: Tu comunidad propone y vota, tu equipo decide.
- Cierre: **Abrí tu primer buzón hoy.** · Plan Free sin tarjeta de crédito.
- Sitio: www.boxinger.com · Contacto: hola@boxinger.com

## Cómo hacer una pieza gráfica

1. **Un mensaje por pieza.** El título tiene 8 palabras o menos, y conviene sacarlo de las frases de la marca o de la landing antes que inventar uno.
2. **Elegí el fondo**: blanco o Niebla, Verde Buzón o Tinta. Nunca violeta ni Verde Brote de fondo (el violeta solo si la pieza es del Asistente IA).
3. **Un elemento visual**: una ilustración en tarjeta blanca **o** piezas reales de la app (tarjeta de idea con votos, estados, Ranking). Para ejemplos, usá la empresa ficticia **Pampa Pagos** y sus ideas: "Exportar movimientos a Excel" (48 votos, 12 comentarios), "Notificación cuando se acredita un pago" (31 votos, 7 comentarios), "Conciliación automática con el banco" (19 votos, 4 comentarios). No inventes testimonios, clientes ni métricas reales.
4. **Logo con nombre** abajo a la izquierda (en historias, arriba, debajo de la barra) y www.boxinger.com.
5. **Respetá márgenes y zonas seguras**: 6% del lado corto como margen y las zonas que tapa cada red (`references/redes.md`).
6. **Armala en HTML** desde una plantilla de `assets/templates/` y **exportala a PNG** con `scripts/render.py` (abajo), al tamaño exacto y también al doble (@2x).
7. **Mirá el PNG** antes de entregarlo y repasá la lista final.

### Exportar a PNG

```bash
python3 scripts/render.py pieza.html pieza.png --width 1080 --height 1080 --scale 2
```

El script usa Google Chrome o Chromium en modo sin ventana (o Playwright si está instalado) y espera a que cargue la fuente. Las rutas a ilustraciones dentro del HTML pueden ser relativas al archivo HTML.

## Lista final

- [ ] Verde Buzón presente y violeta solo si la pieza es de IA o Enterprise
- [ ] Títulos en Plus Jakarta Sans (verificá en el PNG que la fuente cargó)
- [ ] Logo sin deformar, en la versión correcta para el fondo, con su espacio libre
- [ ] Texto chico legible (nada de blanco chico sobre `#059669`)
- [ ] Ilustración dentro de tarjeta blanca si el fondo no es blanco
- [ ] Nada importante en las zonas que tapa la red
- [ ] Voseo, Boxinger con B mayúscula, nombres de planes y secciones correctos
- [ ] Tamaño exacto de la red y versión @2x
