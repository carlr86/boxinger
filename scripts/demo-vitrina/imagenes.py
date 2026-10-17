"""Dibuja las imágenes de ejemplo que van adjuntas a algunas ideas del demo (bocetos de pantallas de «Vitrina»).

Uso:  python3 scripts/demo-vitrina/imagenes.py
Deja en scripts/demo-vitrina/imagenes/ cada imagen en dos tamaños, como las guarda Boxinger:
<nombre>.webp (1600 px de ancho) y <nombre>-t.webp (miniatura de 480 px).
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'imagenes')
W, H = 1600, 1000
FONTS = '/System/Library/Fonts/Supplemental/'

# Colores de «Vitrina» (la marca inventada del demo, no la de Boxinger)
TEAL, TEAL_D, TEAL_L = '#0f766e', '#115e59', '#ccfbf1'
ORANGE, INK, MUTED, LINE, BG, CARD = '#ea580c', '#1f2937', '#6b7280', '#e5e7eb', '#f3f4f6', '#ffffff'
GREEN, GREEN_L = '#16a34a', '#dcfce7'


def font(size, bold=False):
    return ImageFont.truetype(FONTS + ('Arial Bold.ttf' if bold else 'Arial.ttf'), size)


def canvas(color=BG):
    img = Image.new('RGB', (W, H), color)
    return img, ImageDraw.Draw(img)


def browser(d, url, dark=False):
    """Barra de navegador arriba de la pantalla."""
    top = '#2b2f36' if dark else '#e5e7eb'
    d.rectangle([0, 0, W, 64], fill=top)
    for k, c in enumerate(['#ef4444', '#f59e0b', '#22c55e']):
        d.ellipse([28 + k * 30, 22, 48 + k * 30, 42], fill=c)
    d.rounded_rectangle([150, 14, W - 150, 50], 18, fill='#1f2329' if dark else '#ffffff')
    d.text((176, 21), url, font=font(22), fill='#9ca3af' if dark else MUTED)


def store_header(d, name, y=64):
    d.rectangle([0, y, W, y + 84], fill=CARD)
    d.line([0, y + 84, W, y + 84], fill=LINE, width=2)
    d.text((70, y + 24), name, font=font(34, True), fill=INK)
    for k, t in enumerate(['Inicio', 'Productos', 'Contacto']):
        d.text((W - 520 + k * 150, y + 30), t, font=font(24), fill=MUTED)


def photo(d, box, tint='#cbd5e1', shape='mountain'):
    """Lugar de una foto de producto: un rectángulo con un dibujito simple."""
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 18, fill=tint)
    cx, cy, s = (x0 + x1) // 2, (y0 + y1) // 2, min(x1 - x0, y1 - y0) // 4
    if shape == 'shoe':
        u = (x1 - x0) // 10
        d.rounded_rectangle([cx - 4 * u, cy + u, cx + 4 * u, cy + 2 * u], u // 2, fill='#f8fafc', outline='#cbd5e1', width=3)
        d.polygon([(cx - 4 * u, cy + u), (cx - 3 * u, cy - 2 * u), (cx - u, cy - 2 * u), (cx + u, cy - u // 2),
                   (cx + 3 * u, cy - u // 4), (cx + 4 * u, cy + u)], fill=TEAL)
        for k in range(3):
            d.line([cx - 2 * u + k * u // 2 * 1, cy - u - k * 6, cx - u + k * u // 2, cy - u // 2 - k * 6], fill='#ffffff', width=5)
        d.line([cx - 4 * u, cy + u, cx + 4 * u, cy + u], fill=ORANGE, width=8)
    elif shape == 'box':
        d.rectangle([cx - s, cy - s // 2, cx + s, cy + s], fill='#b45309')
        d.polygon([(cx - s, cy - s // 2), (cx, cy - s), (cx + s, cy - s // 2), (cx, cy)], fill='#d97706')
    else:
        d.polygon([(x0 + 30, y1 - 30), (cx - s // 2, cy - s // 2), (cx + s // 3, y1 - 30)], fill='#94a3b8')
        d.polygon([(cx - s // 3, y1 - 30), (cx + s, cy - s // 4), (x1 - 30, y1 - 30)], fill='#64748b')
        d.ellipse([x1 - 3 * s // 2, y0 + s // 2, x1 - s, y0 + s], fill='#f8fafc')


def button(d, box, text, fill=TEAL, color='#ffffff', size=28):
    d.rounded_rectangle(box, 14, fill=fill)
    tw = d.textlength(text, font=font(size, True))
    d.text(((box[0] + box[2] - tw) / 2, (box[1] + box[3]) / 2 - size * 0.58), text, font=font(size, True), fill=color)


def note(d, xy, text, w=420):
    """Nota amarilla tipo «post-it» con un comentario de quien propone la idea."""
    x, y = xy
    lines, cur = [], ''
    for word in text.split():
        t = (cur + ' ' + word).strip()
        if d.textlength(t, font=font(24)) > w - 40:
            lines.append(cur)
            cur = word
        else:
            cur = t
    lines.append(cur)
    h = 36 + 34 * len(lines)
    d.rounded_rectangle([x + 6, y + 8, x + w + 6, y + h + 8], 10, fill='#d6d3d1')
    d.rounded_rectangle([x, y, x + w, y + h], 10, fill='#fef08a')
    for k, l in enumerate(lines):
        d.text((x + 20, y + 18 + 34 * k), l, font=font(24), fill='#713f12')


# ──────────────────────────── pantallas ────────────────────────────

def cuotas():
    img, d = canvas('#ffffff')
    browser(d, 'sosadeportes.vitrina.store/zapatillas-running-pro')
    store_header(d, 'Sosa Deportes')
    photo(d, [70, 190, 760, 940], '#e2e8f0', 'shoe')
    d.text((830, 200), 'Zapatillas Running Pro', font=font(48, True), fill=INK)
    d.text((830, 270), 'Talles del 36 al 45 · Envío a todo el país', font=font(26), fill=MUTED)
    d.text((830, 340), '$ 89.990', font=font(72, True), fill=INK)
    d.rounded_rectangle([830, 450, 1530, 560], 16, fill=GREEN_L, outline=GREEN, width=3)
    d.text((862, 470), '6 cuotas sin interés de $ 14.998', font=font(36, True), fill='#166534')
    d.text((862, 518), 'con tarjetas de crédito bancarias', font=font(24), fill='#166534')
    for k, t in enumerate(['VISA', 'MASTER', 'AMEX', 'NARANJA']):
        x = 830 + k * 160
        d.rounded_rectangle([x, 590, x + 140, 640], 10, outline=LINE, width=2)
        tw = d.textlength(t, font=font(22, True))
        d.text((x + (140 - tw) / 2, 603), t, font=font(22, True), fill=MUTED)
    button(d, [830, 700, 1530, 790], 'Comprar', TEAL)
    note(d, (1090, 830), 'Así: las cuotas a la vista, debajo del precio.', 440)
    return img


def envio_gratis():
    img, d = canvas('#9ca3af')
    browser(d, 'yerbaymate.vitrina.store/carrito')
    d.rectangle([0, 64, 860, H], fill='#d1d5db')
    d.rectangle([860, 64, W, H], fill=CARD)
    d.text((910, 100), 'Tu carrito', font=font(42, True), fill=INK)
    items = [('Mate de calabaza con virola', '$ 18.500'), ('Bombilla de alpaca', '$ 9.200'), ('Yerba orgánica 1 kg', '$ 7.800')]
    for k, (n, p) in enumerate(items):
        y = 190 + k * 130
        photo(d, [910, y, 1010, y + 100], TEAL_L, 'box')
        d.text((1040, y + 18), n, font=font(28), fill=INK)
        d.text((1040, y + 58), '1 unidad', font=font(22), fill=MUTED)
        tw = d.textlength(p, font=font(28, True))
        d.text((W - 50 - tw, y + 30), p, font=font(28, True), fill=INK)
    d.line([910, 590, W - 50, 590], fill=LINE, width=2)
    d.rounded_rectangle([910, 620, W - 50, 760], 16, fill='#fff7ed')
    d.text((940, 645), '¡Te faltan $ 6.500 para el envío gratis!', font=font(30, True), fill='#9a3412')
    d.rounded_rectangle([940, 700, W - 80, 726], 13, fill='#fed7aa')
    d.rounded_rectangle([940, 700, 940 + int((W - 80 - 940) * 0.86), 726], 13, fill=ORANGE)
    d.text((910, 790), 'Subtotal', font=font(30), fill=MUTED)
    tw = d.textlength('$ 35.500', font=font(34, True))
    d.text((W - 50 - tw, 788), '$ 35.500', font=font(34, True), fill=INK)
    button(d, [910, 870, W - 50, 950], 'Iniciar compra', TEAL)
    note(d, (80, 180), 'La barrita que se va llenando motiva a sumar algo más al carrito.', 520)
    return img


def whatsapp():
    img, d = canvas('#e7e5e4')
    # teléfono
    d.rounded_rectangle([540, 30, 1060, 975], 60, fill='#111827')
    d.rounded_rectangle([560, 50, 1040, 955], 46, fill='#efeae2')
    d.rounded_rectangle([560, 50, 1040, 170], 46, fill='#075e54')
    d.rectangle([560, 120, 1040, 170], fill='#075e54')
    d.ellipse([590, 82, 650, 142], fill=TEAL_L)
    d.text((607, 96), 'P', font=font(30, True), fill=TEAL_D)
    d.text((670, 88), 'Petit Kids', font=font(28, True), fill='#ffffff')
    d.text((670, 124), 'cuenta de empresa', font=font(20), fill='#d1fae5')

    def bubble(y, text, mine=False, h=None):
        lines = text.split('\n')
        h = h or 30 + 34 * len(lines)
        x0, x1 = (700, 1015) if mine else (585, 950)
        d.rounded_rectangle([x0, y, x1, y + h], 16, fill='#d9fdd3' if mine else '#ffffff')
        for k, l in enumerate(lines):
            d.text((x0 + 18, y + 14 + 34 * k), l, font=font(23), fill=INK)
        return y + h + 22

    y = bubble(210, '¡Hola Ana! Te quedó esto\nen el carrito:')
    d.rounded_rectangle([585, y, 950, y + 150], 16, fill='#ffffff')
    photo(d, [600, y + 15, 720, y + 135], '#fde68a', 'box')
    d.text((740, y + 30), 'Body de algodón', font=font(23, True), fill=INK)
    d.text((740, y + 66), 'Talle 6 meses', font=font(21), fill=MUTED)
    d.text((740, y + 100), '$ 12.400', font=font(23, True), fill=INK)
    y += 172
    y = bubble(y, 'Usá el cupón VUELVE10 y\nllevátelo con 10% off.\nTocá acá para terminar:\npetitkids.vitrina.store/c/8F2')
    y = bubble(y, '¡Uh, me había olvidado!\nYa lo compro, gracias', mine=True)
    note(d, (1110, 380), 'Un solo mensaje, unas horas después de que se fue de la tienda.', 420)
    note(d, (80, 600), 'Con el link directo al carrito, ya armado.', 400)
    return img


def envios():
    img, d = canvas()
    browser(d, 'petitkids.vitrina.store/checkout/envio')
    store_header(d, 'Petit Kids')
    d.text((120, 190), 'Elegí cómo recibir tu compra', font=font(40, True), fill=INK)
    d.rounded_rectangle([120, 260, 760, 330], 12, fill=CARD, outline=LINE, width=2)
    d.text((145, 278), 'Código postal:  5000  (Córdoba)', font=font(28), fill=INK)
    opts = [('Andreani · Estándar', 'Llega entre el lunes 20 y el miércoles 22', '$ 5.890', True),
            ('OCA · Express', 'Llega mañana', '$ 8.450', False),
            ('Correo Argentino · Sucursal', 'Retirás en la sucursal más cercana', '$ 4.120', False),
            ('Retiro en el local', 'Av. Colón 1234, Córdoba', 'Gratis', False)]
    for k, (t, s, p, sel) in enumerate(opts):
        y = 370 + k * 130
        d.rounded_rectangle([120, y, 1100, y + 110], 16, fill=CARD, outline=TEAL if sel else LINE, width=4 if sel else 2)
        d.ellipse([150, y + 38, 184, y + 72], outline=TEAL if sel else '#9ca3af', width=4)
        if sel:
            d.ellipse([159, y + 47, 175, y + 63], fill=TEAL)
        d.text((210, y + 22), t, font=font(30, True), fill=INK)
        d.text((210, y + 64), s, font=font(24), fill=MUTED)
        tw = d.textlength(p, font=font(30, True))
        d.text((1070 - tw, y + 38), p, font=font(30, True), fill=GREEN if p == 'Gratis' else INK)
    d.rounded_rectangle([1160, 190, 1500, 560], 16, fill=CARD, outline=LINE, width=2)
    d.text((1190, 215), 'Resumen', font=font(30, True), fill=INK)
    for k, (a, b) in enumerate([('Productos', '$ 41.300'), ('Envío', '$ 5.890'), ('Total', '$ 47.190')]):
        y = 290 + k * 70
        d.text((1190, y), a, font=font(26, k == 2), fill=INK if k == 2 else MUTED)
        tw = d.textlength(b, font=font(26, True))
        d.text((1470 - tw, y), b, font=font(26, True), fill=INK)
    button(d, [1190, 470, 1470, 530], 'Continuar', TEAL, size=26)
    note(d, (1160, 640), 'El costo real según el código postal, en vez de un envío fijo.', 360)
    return img


def seguimiento():
    img, d = canvas()
    browser(d, 'decornido.vitrina.store/pedido/10482')
    store_header(d, 'Deco Nido')
    d.rounded_rectangle([200, 190, 1400, 940], 24, fill=CARD)
    d.text((260, 230), 'Pedido #10482', font=font(44, True), fill=INK)
    d.text((260, 295), 'Hola Martina, tu pedido está en camino.', font=font(28), fill=MUTED)
    steps = [('Confirmado', '12 oct'), ('Preparado', '13 oct'), ('En camino', 'Hoy'), ('Entregado', 'Estimado 18 oct')]
    xs = [330, 640, 950, 1260]
    d.line([xs[0], 420, xs[2], 420], fill=TEAL, width=10)
    d.line([xs[2], 420, xs[3], 420], fill=LINE, width=10)
    for k, (t, s) in enumerate(steps):
        done = k <= 2
        d.ellipse([xs[k] - 36, 384, xs[k] + 36, 456], fill=TEAL if done else CARD, outline=TEAL if done else '#d1d5db', width=6)
        if k < 2:
            d.line([xs[k] - 16, 420, xs[k] - 4, 434], fill='#ffffff', width=7)
            d.line([xs[k] - 4, 434, xs[k] + 18, 406], fill='#ffffff', width=7)
        if k == 2:
            d.ellipse([xs[k] - 12, 408, xs[k] + 12, 432], fill='#ffffff')
        tw = d.textlength(t, font=font(28, True))
        d.text((xs[k] - tw / 2, 480), t, font=font(28, True), fill=INK if done else MUTED)
        tw = d.textlength(s, font=font(22))
        d.text((xs[k] - tw / 2, 522), s, font=font(22), fill=MUTED)
    d.line([260, 600, 1340, 600], fill=LINE, width=2)
    photo(d, [260, 640, 400, 780], '#fde68a', 'box')
    d.text((430, 660), 'Lámpara de mesa Nórdica  ×1', font=font(28), fill=INK)
    d.text((430, 705), 'Envío: Andreani · seguimiento AN-3378221', font=font(24), fill=MUTED)
    button(d, [260, 830, 700, 900], '¿Necesitás ayuda?', TEAL_L, TEAL_D, 26)
    return img


def talles():
    img, d = canvas('#9ca3af')
    browser(d, 'modaluz.vitrina.store/remera-lino')
    d.rectangle([0, 64, W, H], fill='#a3a3a3')
    d.rounded_rectangle([300, 130, 1300, 930], 24, fill=CARD)
    d.text((350, 170), 'Guía de talles · Remeras', font=font(40, True), fill=INK)
    d.text((1230, 168), '×', font=font(48), fill=MUTED)
    d.text((350, 235), 'Medí una remera que te quede bien, apoyada sobre una mesa.', font=font(24), fill=MUTED)
    head = ['Talle', 'Pecho (cm)', 'Largo (cm)', 'Hombros (cm)']
    rows = [['S', '96', '68', '44'], ['M', '102', '70', '46'], ['L', '108', '72', '48'], ['XL', '114', '74', '50'], ['XXL', '120', '76', '52']]
    cw = [180, 240, 240, 240]
    y = 300
    d.rounded_rectangle([350, y, 1250, y + 70], 10, fill=TEAL)
    x = 350
    for k, h in enumerate(head):
        d.text((x + 24, y + 20), h, font=font(26, True), fill='#ffffff')
        x += cw[k]
    for r, row in enumerate(rows):
        y = 370 + r * 76
        if r == 1:
            d.rectangle([350, y, 1250, y + 76], fill=TEAL_L)
        elif r % 2:
            d.rectangle([350, y, 1250, y + 76], fill='#f9fafb')
        x = 350
        for k, c in enumerate(row):
            d.text((x + 24, y + 22), c, font=font(28, k == 0), fill=INK)
            x += cw[k]
    d.text((350, 780), 'Según tus compras anteriores, te recomendamos el talle M.', font=font(26, True), fill=TEAL_D)
    button(d, [350, 840, 760, 900], 'Elegir talle M', TEAL, size=26)
    note(d, (1320, 560), 'Al lado del selector de talle, en cada producto.', 260)
    return img


def modo_oscuro():
    img, d = canvas('#0f1115')
    browser(d, 'panel.vitrina.store/productos', dark=True)
    d.rectangle([0, 64, 300, H], fill='#16191f')
    d.text((40, 100), 'Vitrina', font=font(36, True), fill='#5eead4')
    for k, t in enumerate(['Inicio', 'Pedidos', 'Productos', 'Clientes', 'Estadísticas', 'Configuración']):
        y = 190 + k * 70
        if t == 'Productos':
            d.rounded_rectangle([20, y - 12, 280, y + 46], 12, fill='#1f2a2a')
        d.text((50, y), t, font=font(26, t == 'Productos'), fill='#5eead4' if t == 'Productos' else '#9ca3af')
    d.text((360, 110), 'Productos', font=font(42, True), fill='#f3f4f6')
    button(d, [1300, 100, 1540, 160], '+ Nuevo', '#0d9488', size=26)
    for k, (t, v) in enumerate([('Activos', '248'), ('Sin stock', '12'), ('Vendidos hoy', '31')]):
        x = 360 + k * 400
        d.rounded_rectangle([x, 200, x + 370, 330], 16, fill='#1b1f26')
        d.text((x + 30, 225), t, font=font(24), fill='#9ca3af')
        d.text((x + 30, 265), v, font=font(44, True), fill='#f3f4f6')
    d.rounded_rectangle([360, 370, 1540, 940], 16, fill='#1b1f26')
    for k, (n, p, s) in enumerate([('Vela de soja · Lavanda', '$ 8.900', '34'), ('Vela de soja · Vainilla', '$ 8.900', '21'),
                                   ('Difusor de varillas', '$ 12.500', '9'), ('Set x3 velas mini', '$ 15.200', '0'),
                                   ('Fósforos largos', '$ 2.100', '58')]):
        y = 400 + k * 104
        d.rounded_rectangle([390, y, 470, y + 80], 12, fill='#2a303a')
        d.text((500, y + 24), n, font=font(28), fill='#e5e7eb')
        d.text((880, y + 24), p, font=font(28, True), fill='#e5e7eb')
        d.text((1060, y + 24), s + ' u.', font=font(28), fill='#f87171' if s == '0' else '#9ca3af')
    note(d, (1200, 430), 'Algo así: fondo oscuro y letras claras para trabajar de noche.', 320)
    return img


def edicion_masiva():
    img, d = canvas()
    browser(d, 'panel.vitrina.store/productos')
    d.rectangle([0, 64, W, 150], fill=CARD)
    d.text((60, 88), 'Productos', font=font(40, True), fill=INK)
    d.rounded_rectangle([60, 180, W - 60, 270], 16, fill=TEAL_D)
    d.text((95, 207), '4 productos seleccionados', font=font(30, True), fill='#ffffff')
    d.rounded_rectangle([560, 198, 1000, 252], 10, fill='#ffffff')
    d.text((585, 210), 'Subir precio un  15 %', font=font(28), fill=INK)
    button(d, [1030, 198, 1260, 252], 'Aplicar', ORANGE, size=26)
    d.text((1300, 210), 'Cancelar', font=font(28), fill='#ccfbf1')
    d.rounded_rectangle([60, 300, W - 60, 960], 16, fill=CARD)
    cols = [(150, 'Producto'), (900, 'Precio actual'), (1150, 'Precio nuevo'), (1400, 'Stock')]
    for x, t in cols:
        d.text((x, 325), t, font=font(24, True), fill=MUTED)
    rows = [('Taza esmaltada blanca', 6200, True, '40'), ('Set de 4 vasos de vidrio', 14800, True, '18'),
            ('Mantel de lino 1,5 m', 23500, False, '7'), ('Fuente de cerámica', 18900, True, '12'),
            ('Repasadores x3', 7400, True, '55'), ('Panera de bambú', 11300, False, '9')]
    for k, (n, p, sel, st) in enumerate(rows):
        y = 380 + k * 95
        if sel:
            d.rectangle([62, y - 8, W - 62, y + 78], fill='#f0fdfa')
        d.line([62, y - 8, W - 62, y - 8], fill=LINE, width=2)
        d.rounded_rectangle([90, y + 16, 124, y + 50], 6, fill=TEAL if sel else CARD, outline=TEAL if sel else '#9ca3af', width=3)
        if sel:
            d.line([98, y + 33, 106, y + 42], fill='#ffffff', width=5)
            d.line([106, y + 42, 118, y + 24], fill='#ffffff', width=5)
        d.text((150, y + 18), n, font=font(28), fill=INK)
        d.text((900, y + 18), f'$ {p:,}'.replace(',', '.'), font=font(28), fill=MUTED if sel else INK)
        if sel:
            d.text((1150, y + 18), f'$ {round(p * 1.15 / 10) * 10:,}'.replace(',', '.'), font=font(28, True), fill=GREEN)
        else:
            d.text((1150, y + 18), '—', font=font(28), fill=MUTED)
        d.text((1400, y + 18), st, font=font(28), fill=INK)
    return img


SCREENS = {
    'cuotas': cuotas, 'envio_gratis': envio_gratis, 'whatsapp': whatsapp, 'envios': envios,
    'seguimiento': seguimiento, 'talles': talles, 'modo_oscuro': modo_oscuro, 'edicion_masiva': edicion_masiva,
}


def build():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in SCREENS.items():
        img = fn()
        img.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=82, method=6)
        t = img.resize((480, round(480 * H / W)), Image.LANCZOS)
        t.save(os.path.join(OUT, f'{name}-t.webp'), 'WEBP', quality=80, method=6)
    return sorted(os.listdir(OUT))


if __name__ == '__main__':
    for f in build():
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
