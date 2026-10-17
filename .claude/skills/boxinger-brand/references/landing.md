# Landing y piezas web

www.boxinger.com muestra el producto con escenas armadas con piezas de la app sobre fondos verdes con degradé. El código está en `src/app/(site)/page.tsx`, `AbcTabs.tsx` y `landing.module.css` del repo de Boxinger. Si estás en ese repo, leelos: son la fuente de verdad.

## Secciones

1. **Inicio**: título "Las ideas de tus usuarios, ordenadas en un solo buzón.", bajada, botón "Crear cuenta gratis" y "Ver el video". A la derecha, el buzón de Pampa Pagos sobre una mancha verde, chips de Email y WhatsApp, el sticker "+1 Importante" y la tarjeta del Asistente IA.
2. **El ABC de Boxinger**: los 4 pasos con una escena por paso, cada una con su degradé (verde, violeta, turquesa, profundo).
3. **Conocé Boxinger**: video de 1:45 sobre fondo Menta, con un recuadro verde detrás (www.boxinger.com/#video).
4. **Franja verde** "De la sugerencia suelta a la decisión": tres tarjetas blancas (Importar y exportar · Asistente IA · Reconocimiento y Novedades) que alternan la escena a izquierda y derecha.
5. **Funciones** "Todo el recorrido en un lugar": 9 tarjetas con ícono.
6. **Planes**, **Hablemos** (contacto), cierre "Abrí tu primer buzón hoy." y pie en Tinta Verde.

## Estilo web

- Títulos en Plus Jakarta Sans ExtraBold (h1 38–58 px, espaciado −0,03em; h2 28–40 px). Textos en la letra del sistema, 17–19 px.
- Antetítulos en verde, 13 px, mayúsculas, +8% de espaciado.
- Tarjetas blancas con radio de 16–20 px, borde `#e8eeeb` y sombras suaves con un toque verde.
- Botones grandes: 50 px de alto y radio de 8 px. El primario es `#059669` con sombra `0 8px 20px -8px rgba(5,150,105,.6)`; el secundario es blanco con borde `rgba(11,43,34,.2)`; el violeta `#4338ca` es solo para Enterprise; y el link "Ver el video" lleva un círculo con ▸.

## Íconos de funciones

Íconos de línea de 24×24, trazo de 2 px y puntas redondeadas, dentro de un cuadrado de 56 px con radio de 14 px.

| Función | Tono (fondo / trazo) | Path SVG |
|---|---|---|
| Buzón | `#ecfdf5` / `#047857` | `M4 13l2.5-7h11L20 13v5a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 13h4.5l1 2h5l1-2H20` |
| Ranking | `#eef2ff` / `#4338ca` | `M6 20v-6M12 20V6M18 20v-9` |
| Backlog | `#eff6ff` / `#2563eb` | `M5 6h14M5 12h14M5 18h9` |
| Matriz | `#fef3c7` / `#b45309` | `M4 4v16h16M8 14l3-3 3 2 5-6` |
| Roadmap | `#ccfbf1` / `#0f766e` | `M4 6h7M4 12h11M4 18h5M15 4v4M19 10v4M13 16v4` |
| Status | `#fce7f3` / `#be185d` | `M12 3a9 9 0 109 9h-9z M14 3.2A9 9 0 0120.8 10H14z` |
| Novedades | `#ecfdf5` / `#047857` | `M4 10v4h3l7 4.5v-13L7 10H4zM17.5 9a4.5 4.5 0 010 6` |
| Unir ideas | `#eef2ff` / `#4338ca` | `M6 4v4a5 5 0 005 5h1M18 4v4a5 5 0 01-5 5h-1M12 13v7` |
| Importar y exportar | `#eff6ff` / `#2563eb` | `M8 4v12m0 0l-3-3m3 3l3-3M16 20V8m0 0l-3 3m3-3l3 3` |

Cada función tiene siempre el mismo ícono y el mismo tono. Las funciones de Pro llevan la etiqueta "PRO" (fondo `#059669`, texto blanco, 11 px bold).

Ícono de IA (destello): `M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z` + `M13 11l.6 1.4 1.4.6-1.4.6L13 15l-.6-1.4-1.4-.6 1.4-.6z` (viewBox 0 0 16 16, relleno).

## Escenas de producto

Se arman con 2 a 4 piezas sobre un degradé:

- **Chip**: un mensaje que llega de afuera. Tarjeta blanca de radio 12 con el canal en negrita y su emoji (✉️ Email, 💬 WhatsApp, 📊 Planilla, 💡 Idea) y la frase entre comillas. Girado entre 2° y 6°.
- **Papel**: una pieza real de la app en tarjeta blanca con sombra `0 24px 48px -20px rgba(0,0,0,.4)`: el formulario "Nueva idea", el Ranking, el Backlog, el Roadmap (Ahora / Siguiente / Después) o un aviso ("¡Se lanzó «Exportar a Excel»!").
- **Flecha a mano**: une lo que entra con lo que sale. Trazo de 3 px con puntas redondeadas, blanco sobre degradé y Tinta Verde sobre fondo claro. Ejemplo de path (viewBox 0 0 120 80): `M8 14 C 40 4, 78 18, 96 54 M84 50 l12 6 l2 -13`.
- **Sticker**: el resultado en 2 o 3 palabras, en una píldora de Plus Jakarta Sans ExtraBold 15 px, girada. Amarillo (`#fde68a` / `#78350f`) para votos y festejos ("+1 Importante", "🚀 Lanzada"); blanco con texto `#047857` para estados y acciones ("✓ Pasó al Backlog", "⬇ Exportar a Excel"); violeta `#4338ca` solo para la IA ("✦ Sugerencias según tu producto").

## Contenido de ejemplo

Usá siempre la empresa ficticia **Pampa Pagos** (logo "PP" en un cuadrado Tinta Verde) y sus ideas:

| Idea | Origen | Categoría | Estado | Votos | Comentarios | Autor |
|---|---|---|---|---|---|---|
| Exportar movimientos a Excel | Comunidad | Feature | Aprobada | 48 | 12 | Lucía Fernández |
| Notificación cuando se acredita un pago | Comunidad | Mejora | En revisión | 31 | 7 | Martín Gómez |
| Conciliación automática con el banco | Equipo | Propuesta | Pendiente de revisión | 19 | 4 | Sofía Ruiz |

Otras ideas que ya aparecen: Pagar con QR, Modo oscuro, Aviso de pago, Reportes en PDF, Recordatorio de vencimientos, Exportar a contabilidad, Pagos recurrentes.

Texto del Asistente IA: "Mejor candidata para el Backlog · Notificación cuando se acredita un pago · 31 votos y 7 comentarios: es lo que más piden y baja las consultas al soporte, el objetivo del trimestre."

## Emails de marketing

Encabezado con el logo y "Boxinger", un título claro ("Tu idea está en el Roadmap"), un párrafo corto y un solo botón verde ("Ver la idea"). Sin imágenes pesadas y sin más de un llamado a la acción.
