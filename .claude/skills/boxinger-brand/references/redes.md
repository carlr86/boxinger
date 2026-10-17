# Redes sociales

## Medidas

| Pieza | Red | Tamaño (px) |
|---|---|---|
| Post cuadrado | Instagram, Facebook | 1080 × 1080 |
| Post vertical y carrusel | Instagram, LinkedIn | 1080 × 1350 |
| Historia y reel | Instagram, TikTok | 1080 × 1920 |
| Portada de perfil | LinkedIn | 1584 × 396 |
| Portada de página de empresa | LinkedIn | 1128 × 191 |
| Encabezado | X | 1500 × 500 |
| Imagen al compartir el link (Open Graph) | Todas | 1200 × 630 |
| Foto de perfil | Todas | 400 × 400 (se ve en círculo) |

Exportá siempre al tamaño exacto y también al doble (`--scale 2`). Las redes cambian sus medidas cada tanto: si es para una campaña grande, conviene confirmarlas.

## Zonas que tapa cada red

- **Historias**: dejá libres ~250 px arriba (barra) y ~340 px abajo (respuestas y botones).
- **Portada de LinkedIn**: LinkedIn recorta arriba y abajo según la pantalla. Todo lo importante va en la franja del medio, dejando ~65 px libres arriba y abajo (contenido entre y = 65 y y = 331). Además, la foto de perfil tapa la parte de abajo a la izquierda: dejá libre el primer ~28% del ancho y poné el texto desde ~x = 440.
- **Encabezado de X**: la foto de perfil tapa abajo a la izquierda (≈ 22% del ancho). El contenido va del ~28% hacia la derecha.

## Reglas

- **Un mensaje por pieza**, con un título de 8 palabras o menos.
- **Margen**: 6% del lado más corto (64 px en un post de 1080). Nada se acerca más al borde.
- **Logo con nombre** abajo a la izquierda; en historias, arriba, debajo de la barra.
- **Fondos**: blanco, Niebla, Verde Buzón o Tinta. Nunca Verde Brote ni violeta de fondo.
- **Violeta** solo en piezas del Asistente IA o del plan Enterprise (pastilla `#4338ca` con texto blanco).
- **Imágenes**: las ilustraciones de Boxinger o piezas reales de la app (tarjetas, votos, estados). Nada de fotos de stock.

## Escala tipográfica (como % del lado corto)

Título 8–9% (ExtraBold, interlineado 1,04, espaciado −0,035em) · bajada 3,8–5% · antetítulo 3% en mayúsculas con +12% de espaciado · logo 6,4% · URL o pie 3%. Para historias, título ~12% del ancho.

## Plantillas que funcionan

| Pieza | Fondo | Contenido |
|---|---|---|
| Novedad | Verde Buzón | Pastilla "Novedad" (fondo `#d1fae5`, texto `#047857`), título blanco, una tarjeta de idea de la app, logo negativo + boxinger.com |
| Tip o guía | Niebla | Antetítulo verde "Tip de producto", título en Tinta, un diagrama simple (por ejemplo la Matriz: Victorias rápidas, Grandes apuestas, Tareas menores, No conviene) |
| Asistente IA | Tinta | Pastilla "✦ Asistente IA" violeta, título blanco, tarjeta "Mejor candidata para el Backlog" con borde `#c7d2fe` |
| Historia | Verde Buzón | Logo arriba, "Abrí tu primer buzón hoy.", "Plan Free sin tarjeta de crédito.", ilustración en tarjeta blanca, pastilla blanca "boxinger.com" |
| Carrusel | Blanco → Niebla → Verde | Portada "Cómo viaja una idea en Boxinger" con los 4 pasos; interiores con número grande en verde; cierre verde con llamado a la acción. Paginación "2 / 5" |
| Portada LinkedIn | Verde Buzón | Logo negativo + lema + URL a partir del 28% del ancho, e ilustración `07-lanzamiento` en tarjeta blanca a la derecha |
| Encabezado X | Tinta | Tarjetas de ideas con votos y "Buzón de ideas para equipos de producto." |
| Imagen al compartir link | Blanco | Logo con nombre, lema y boxinger.com a la izquierda; a la derecha, tres tarjetas de ideas sobre Niebla |

Plantillas HTML listas en `assets/templates/`: `post-cuadrado.html`, `historia.html` y `linkedin-banner.html`.
