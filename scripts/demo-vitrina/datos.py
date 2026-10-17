"""Contenido del buzón de demo «Ideas para Vitrina» (Vitrina es un creador de tiendas online inventado).

Todo es ficticio: las personas, las tiendas y las ideas. Los emails usan el dominio reservado .example, que no
existe, así que nunca le llega un correo a nadie.
"""

BOARD_NAME = 'Ideas para Vitrina'
BOARD_DESC = 'Contanos qué le falta a tu tienda, votá las ideas de otros vendedores y seguí lo que estamos construyendo.'
TEAM_NAME = 'Vitrina'
EMAIL_DOMAIN = 'vitrina-demo.example'
TODAY = '2026-10-17'

# Equipo de Vitrina (miembros del equipo del buzón): responden comentarios y mueven las ideas.
TEAM = {
    'laura': 'Laura Méndez',
    'tomas': 'Tomás Ríos',
}

# Comunidad: dueñas y dueños de tiendas que usan Vitrina (invitados del buzón).
COMMUNITY = {
    'lucia': 'Lucía Ferreyra', 'martin': 'Martín Sosa', 'carla': 'Carla Medina', 'diego': 'Diego Rivas',
    'sofia': 'Sofía Benítez', 'federico': 'Federico Paz', 'valentina': 'Valentina Ruiz', 'nicolas': 'Nicolás Herrera',
    'romina': 'Romina Castro', 'pablo': 'Pablo Giménez', 'agustina': 'Agustina Romero', 'julieta': 'Julieta Acosta',
    'gonzalo': 'Gonzalo Molina', 'camila': 'Camila Torres', 'ezequiel': 'Ezequiel Vega', 'florencia': 'Florencia Díaz',
    'matias': 'Matías Ojeda', 'paula': 'Paula Navarro', 'joaquin': 'Joaquín Luna', 'mariana': 'Mariana Silva',
}

F, M, P = 'Feature', 'Mejora funcional', 'Propuesta'

# Etapas:
#   lanzada                      → aprobada, en Novedades (launch = fecha de lanzamiento)
#   ahora / siguiente / despues  → aprobada, en esa columna del Roadmap («ahora» está en desarrollo)
#   backlog                      → aprobada, sin columna de Roadmap
#   en_revision / pendiente / rechazada
# votes = cuántas personas votaron · imp = qué parte votó «Importante» (el resto se reparte entre Interesante y No importante)
IDEAS = [
    # ── Novedades (lanzadas) ──
    dict(title='Importar productos desde un Excel', cat=M, by='federico', at='2026-08-18', stage='lanzada', launch='2026-09-02',
         desc='Tengo 800 productos en una planilla y cargarlos de a uno es imposible. Necesito subir el archivo y que se creen solos, con precio, stock y categoría.',
         votes=17, imp=.8, impact=5, effort=2, prio='alta', growth=['activacion']),
    dict(title='Editar varios productos a la vez', cat=M, by='sofia', at='2026-06-27', stage='lanzada', launch='2026-09-10',
         desc='Para cambiar precios por inflación tengo que entrar producto por producto. Necesito seleccionar varios y subir un % de una.',
         votes=19, imp=.85, impact=5, effort=3, prio='alta', growth=['retencion'], image='edicion_masiva'),
    dict(title='Mostrar el precio en cuotas sin interés en cada producto', cat=M, by='martin', at='2026-07-21', stage='lanzada', launch='2026-09-24',
         desc='El cliente quiere ver «6 cuotas de $X» antes de entrar al checkout; si no, se va. Que se muestre debajo del precio, con el logo de la tarjeta.',
         votes=18, imp=.75, impact=4, effort=2, prio='alta', growth=['monetizacion'], image='cuotas'),
    dict(title='Envío gratis a partir de un monto mínimo', cat=F, by='martin', at='2026-09-04', stage='lanzada', launch='2026-10-01',
         desc='Que se aplique solo y que el carrito muestre «te faltan $X para el envío gratis». Así la gente agrega algo más para llegar.',
         votes=16, imp=.7, impact=4, effort=2, prio='media', growth=['monetizacion'], image='envio_gratis'),
    dict(title='Exportar pedidos a Excel con filtros por fecha', cat=M, by='romina', at='2026-07-10', stage='lanzada', launch='2026-10-08',
         desc='Mi contador me pide las ventas del mes y hoy tengo que copiarlas a mano. Con elegir el mes y bajar un Excel me alcanza.',
         votes=14, imp=.65, impact=3, effort=1, prio='media', growth=['retencion']),
    dict(title='Variantes con foto propia para cada color', cat=M, by='agustina', at='2026-07-14', stage='lanzada', launch='2026-10-14',
         desc='Si el cliente elige el color rojo, que se vea la foto roja y no la del producto en azul. Hoy me escriben preguntando cómo es cada color.',
         votes=15, imp=.7, impact=4, effort=3, prio='media', growth=['activacion']),

    # ── Roadmap · Ahora (en desarrollo) ──
    dict(title='Integración con Mercado Libre para sincronizar stock', cat=F, by='lucia', at='2026-06-12', stage='ahora', approved='2026-07-02', dev='2026-09-15',
         desc='Vendo en mi tienda y en Mercado Libre. Cuando vendo en un lado tengo que descontar el stock a mano en el otro y ya me pasó de vender algo que no tenía.',
         votes=20, imp=.9, impact=5, effort=5, prio='alta', growth=['retencion', 'adquisicion']),
    dict(title='Calcular envío con Andreani y OCA en el checkout', cat=F, by='valentina', at='2026-07-03', stage='ahora', approved='2026-07-20', dev='2026-09-22',
         desc='Hoy cobro un envío fijo y a veces pierdo plata. Que el cliente vea el costo real según su código postal y elija la empresa que prefiere.',
         votes=18, imp=.8, impact=5, effort=4, prio='alta', growth=['monetizacion'], image='envios'),
    dict(title='Recuperar carritos abandonados por WhatsApp', cat=F, by='martin', at='2026-06-18', stage='ahora', approved='2026-07-08', dev='2026-10-01',
         desc='Muchos clientes llenan el carrito y se van. Por email casi nadie abre; un mensaje de WhatsApp con el link al carrito sería mucho más efectivo.',
         votes=19, imp=.85, impact=5, effort=3, prio='alta', growth=['monetizacion', 'churn'], image='whatsapp'),
    dict(title='Página de seguimiento del pedido para el cliente', cat=F, by='laura', at='2026-08-27', stage='ahora', approved='2026-08-27', dev='2026-10-06',
         desc='Que el cliente vea en qué estado está su compra (preparando, despachado, en camino, entregado) sin tener que escribirle a la tienda. Es la consulta que más reciben nuestras tiendas.',
         votes=13, imp=.7, impact=4, effort=2, prio='media', growth=['retencion'], image='seguimiento'),

    # ── Roadmap · Siguiente ──
    dict(title='Armar combos y kits de productos', cat=F, by='carla', at='2026-08-02', stage='siguiente', approved='2026-08-20',
         desc='Quiero vender «kit mate» (mate + bombilla + yerba) con un precio especial y que descuente el stock de cada uno.',
         votes=14, imp=.65, impact=4, effort=3, prio='media', growth=['monetizacion']),
    dict(title='Conectar el catálogo con Instagram Shopping', cat=F, by='agustina', at='2026-08-11', stage='siguiente', approved='2026-08-28',
         desc='Que mis productos se puedan etiquetar en las publicaciones de Instagram sin cargarlos de nuevo.',
         votes=16, imp=.75, impact=4, effort=4, prio='alta', growth=['adquisicion']),
    dict(title='Avisar al cliente cuando vuelve a haber stock', cat=F, by='lucia', at='2026-07-05', stage='siguiente', approved='2026-08-05',
         desc='Me preguntan todo el tiempo cuándo entra un talle. Un botón de «avisame cuando llegue» me ahorraría muchos mensajes y recuperaría ventas.',
         votes=15, imp=.7, impact=3, effort=2, prio='media', growth=['monetizacion']),
    dict(title='Facturación electrónica automática con AFIP', cat=F, by='pablo', at='2026-07-11', stage='siguiente', approved='2026-09-03',
         desc='Que al confirmar el pago se genere la factura y le llegue al cliente por email. Hoy facturo todo a mano a fin de día.',
         votes=17, imp=.8, impact=5, effort=5, prio='alta', growth=['retencion']),

    # ── Roadmap · Después ──
    dict(title='Vender suscripciones con cobro mensual automático', cat=F, by='diego', at='2026-07-19', stage='despues', approved='2026-09-10',
         desc='Vendo café por suscripción y hoy cobro cada mes por transferencia. Necesito que se le cobre solo a la tarjeta del cliente.',
         votes=10, imp=.6, impact=4, effort=5, prio='baja', growth=['monetizacion', 'retencion']),
    dict(title='Permisos distintos para los empleados', cat=M, by='pablo', at='2026-08-13', stage='despues', approved='2026-09-12',
         desc='Mi empleada tiene que ver pedidos pero no las ventas totales ni la configuración de pagos.',
         votes=9, imp=.55, impact=3, effort=3, prio='baja', growth=['retencion']),
    dict(title='App del panel para el celular', cat=F, by='federico', at='2026-07-01', stage='despues', approved='2026-09-18',
         desc='Atiendo la tienda física y no tengo la compu a mano. Quiero ver pedidos y responder consultas desde el teléfono.',
         votes=12, imp=.6, impact=4, effort=5, prio='media', growth=['retencion']),

    # ── Backlog (aprobadas, todavía sin lugar en el Roadmap) ──
    dict(title='Cupones de descuento válidos solo para la primera compra', cat=F, by='diego', at='2026-06-25', stage='backlog', approved='2026-08-12',
         desc='Quiero dar 10% a clientes nuevos sin que los que ya compraron lo usen de nuevo.',
         votes=11, imp=.6, impact=3, effort=1, prio='media', growth=['adquisicion']),
    dict(title='Tabla de talles por categoría de producto', cat=M, by='lucia', at='2026-08-22', stage='backlog', approved='2026-09-25',
         desc='Muchas devoluciones son por talle. Una guía visible al lado del selector ayudaría a que el cliente elija bien.',
         votes=10, imp=.55, impact=3, effort=1, prio='media', growth=['churn'], image='talles'),
    dict(title='Etiquetas de envío listas para imprimir', cat=M, by='valentina', at='2026-09-15', stage='backlog', approved='2026-10-02',
         desc='Que con un clic se generen las etiquetas de todos los pedidos del día, en hoja A4 o en impresora térmica.',
         votes=9, imp=.6, impact=3, effort=2, prio='baja'),
    dict(title='Retiro en el local con varias sucursales', cat=M, by='federico', at='2026-08-06', stage='backlog', approved='2026-09-05',
         desc='Tengo dos locales y hoy solo puedo ofrecer uno para retirar.',
         votes=7, imp=.5, impact=2, effort=2, prio='baja'),
    dict(title='Reseñas de clientes con fotos', cat=F, by='valentina', at='2026-07-23', stage='backlog', approved='2026-09-01',
         desc='Que quien compró pueda dejar una opinión con fotos del producto. Genera mucha confianza en clientes nuevos.',
         votes=12, imp=.6, impact=3, effort=3, prio='media', growth=['adquisicion']),
    dict(title='Lista de precios mayorista con acceso por clave', cat=F, by='sofia', at='2026-07-28', stage='backlog', approved='2026-09-20',
         desc='Vendo a revendedores y necesito que vean otros precios y una compra mínima, sin que los vea el público.',
         votes=8, imp=.55, impact=3, effort=3, prio='baja'),

    # ── En revisión ──
    dict(title='Buscador de la tienda que tolere errores de tipeo', cat=M, by='martin', at='2026-07-26', stage='en_revision', review='2026-08-10',
         desc='Si alguien busca «sapatillas» no aparece nada y pierdo la venta.', votes=9, imp=.55),
    dict(title='Mejorar la velocidad de carga en celulares', cat=M, by='tomas', at='2026-09-02', stage='en_revision', review='2026-09-02',
         desc='Las tiendas tardan bastante en abrir con datos móviles y la mayoría de los compradores entra desde el celular. Queremos medirlo bien antes de decidir qué cambiar.',
         votes=8, imp=.6),
    dict(title='Elegir día y franja horaria de entrega', cat=F, by='nicolas', at='2026-08-04', stage='en_revision', review='2026-09-08',
         desc='Hago delivery propio y necesito que el cliente elija cuándo recibir el pedido.', votes=7, imp=.5),
    dict(title='Gestionar cambios y devoluciones desde el panel', cat=M, by='lucia', at='2026-09-12', stage='en_revision', review='2026-09-30',
         desc='Hoy lo hago por mensajes y planillas; quiero registrar el motivo y reintegrar el stock.', votes=8, imp=.5),
    dict(title='Estadísticas de qué productos se ven pero no se compran', cat=F, by='romina', at='2026-08-08', stage='en_revision', review='2026-09-15',
         desc='Me ayudaría a saber si el problema es el precio o las fotos.', votes=6, imp=.45),
    dict(title='Pagar con transferencia y subir el comprobante', cat=M, by='federico', at='2026-09-30', stage='en_revision', review='2026-10-09',
         desc='Muchos clientes pagan por transferencia y me mandan el comprobante por otro lado. Que lo puedan adjuntar al terminar la compra.',
         votes=7, imp=.55),
    dict(title='Reportes de ventas enviados por email cada semana', cat=M, by='pablo', at='2026-09-26', stage='en_revision', review='2026-10-12',
         desc='Un resumen los lunes con ventas, productos más vendidos y comparación con la semana anterior.', votes=5, imp=.4),

    # ── Rechazadas ──
    dict(title='Precios en dólares con conversión automática', cat=P, by='pablo', at='2026-08-25', stage='rechazada', review='2026-09-01', rejected='2026-09-19',
         reason='Por ahora no vamos a mostrar precios atados al dólar: confunde en el checkout y trae problemas con los medios de pago. Para actualizar precios rápido, ya podés usar la edición masiva con porcentaje.',
         desc='Vendo tecnología y mis costos están en dólares. Que el precio en pesos se actualice solo con la cotización.', votes=6, imp=.35),
    dict(title='Blog integrado a la tienda', cat=P, by='nicolas', at='2026-09-07', stage='rechazada', rejected='2026-10-03',
         reason='No está en nuestros planes cercanos: preferimos que puedas enlazar el blog que ya usás. Lo volvemos a mirar el año que viene.',
         desc='Para publicar recetas y atraer visitas desde Google sin pagar otra plataforma.', votes=4, imp=.25),

    # ── Pendientes (recién llegadas o sin revisar) ──
    dict(title='Modo oscuro en el panel de administración', cat=M, by='carla', at='2026-06-20', stage='pendiente',
         desc='Cargo productos de noche y el panel blanco cansa la vista.', votes=6, imp=.3, image='modo_oscuro'),
    dict(title='Más plantillas de diseño para la tienda', cat=P, by='nicolas', at='2026-07-08', stage='pendiente',
         desc='Las plantillas actuales se parecen mucho entre sí. Me gustaría alguna pensada para gastronomía, con fotos grandes.', votes=7, imp=.4),
    dict(title='Programa de puntos para clientes frecuentes', cat=P, by='diego', at='2026-07-16', stage='pendiente',
         desc='Quiero premiar a los que compran seguido: cada compra suma puntos canjeables por descuentos.', votes=8, imp=.45),
    dict(title='Notificación sonora cuando entra un pedido nuevo', cat=M, by='nicolas', at='2026-07-30', stage='pendiente',
         desc='Tengo el panel abierto todo el día pero no me doy cuenta cuando llega una venta.', votes=5, imp=.4),
    dict(title='Tarjetas de regalo digitales', cat=P, by='carla', at='2026-08-15', stage='pendiente',
         desc='Para fechas como el Día de la Madre, que se pueda regalar un monto para gastar en la tienda.', votes=6, imp=.45),
    dict(title='Botón de WhatsApp flotante configurable', cat=M, by='valentina', at='2026-08-20', stage='pendiente',
         desc='Que pueda elegir el mensaje inicial y el horario en que aparece.', votes=5, imp=.35),
    dict(title='Pop-up para suscribirse al newsletter con descuento', cat=P, by='agustina', at='2026-08-29', stage='pendiente',
         desc='Quiero juntar emails a cambio de un cupón de bienvenida.', votes=4, imp=.3),
    dict(title='Productos personalizables con texto o imagen del cliente', cat=F, by='carla', at='2026-09-09', stage='pendiente',
         desc='Vendo tazas y remeras con nombre; hoy me mandan el texto por WhatsApp aparte y a veces se pierde.', votes=5, imp=.45),
    dict(title='Tienda en inglés y portugués para vender afuera', cat=P, by='agustina', at='2026-09-18', stage='pendiente',
         desc='Recibo consultas de Brasil y Uruguay y la tienda solo está en español.', votes=4, imp=.35),
    dict(title='Mostrar productos relacionados en el carrito', cat=F, by='romina', at='2026-09-22', stage='pendiente',
         desc='Sugerir «los que compraron esto también llevaron…» para aumentar el ticket promedio.', votes=4, imp=.5),
    dict(title='Fechas de vencimiento por lote de productos', cat=P, by='diego', at='2026-10-05', stage='pendiente',
         desc='Vendo alimentos y necesito saber qué lote vence primero para venderlo antes.', votes=2, imp=.5),
    dict(title='Asistente con IA para escribir descripciones de productos', cat=P, by='laura', at='2026-10-09', stage='pendiente',
         desc='Subís la foto del producto y te propone un título y una descripción que después podés editar. ¿Les serviría? Cuéntennos en los comentarios.',
         votes=3, imp=.6),
]

# Comentarios: (quién, cuándo, texto, respuesta del equipo o None). La respuesta es (quién del equipo, cuándo, texto).
COMMENTS = {
    'Integración con Mercado Libre para sincronizar stock': [
        ('martin', '2026-06-14', 'Me pasa exactamente lo mismo. El mes pasado vendí dos veces la misma bicicleta y tuve que devolver la plata.',
         ('laura', '2026-06-16', '¡Gracias por contarlo, Martín! Es de los pedidos que más se repiten. Lo estamos estudiando.')),
        ('sofia', '2026-06-20', 'Si además se pudieran sincronizar los precios sería ideal, no solo el stock.', None),
        ('gonzalo', '2026-07-03', 'Súper necesario. Hoy pago otra herramienta solo para esto.', None),
        ('lucia', '2026-09-16', '¡Vi que pasó a desarrollo! ¿Tienen una fecha estimada?',
         ('laura', '2026-09-17', 'Estamos apuntando a fines de noviembre. Primero sale el stock y después los precios. Te avisamos por acá apenas esté.')),
    ],
    'Recuperar carritos abandonados por WhatsApp': [
        ('camila', '2026-06-22', 'Yo mando los mensajes a mano mirando los carritos. Sería un golazo que fuera automático.', None),
        ('nicolas', '2026-07-01', 'Ojo con no mandar demasiados mensajes, que la gente se enoja. Con uno a las pocas horas alcanza.',
         ('tomas', '2026-07-02', 'Totalmente. La idea es que elijas cuándo se manda y que sea uno solo por carrito.')),
        ('paula', '2026-10-03', '¡Qué bueno que ya lo están haciendo!', None),
    ],
    'Calcular envío con Andreani y OCA en el checkout': [
        ('federico', '2026-07-05', 'Sumaría Correo Argentino, que es lo que más usan mis clientes del interior.',
         ('laura', '2026-07-21', 'Anotado, Federico. Arrancamos con Andreani y OCA, y Correo Argentino viene justo después.')),
        ('julieta', '2026-07-12', 'Con plantas el peso cambia mucho; que se calcule por peso y tamaño sería clave.', None),
    ],
    'Página de seguimiento del pedido para el cliente': [
        ('romina', '2026-08-29', 'Me ahorraría la mitad de los mensajes de WhatsApp. «¿Dónde está mi pedido?» es lo que más me preguntan.', None),
        ('matias', '2026-09-03', '¿Se va a poder poner el logo de la tienda en esa página?',
         ('tomas', '2026-09-04', 'Sí, va a tener el logo y los colores de cada tienda. Te dejamos un boceto en la imagen de la idea.')),
    ],
    'Editar varios productos a la vez': [
        ('ezequiel', '2026-07-02', 'Con la inflación es indispensable. Cada mes pierdo una tarde actualizando precios.', None),
        ('mariana', '2026-07-15', 'Si también se pudiera cambiar la categoría de varios a la vez, mejor.', None),
        ('sofia', '2026-09-11', '¡Ya lo usé y es tal cual lo que necesitaba! Actualicé 300 productos en un minuto. Gracias.',
         ('laura', '2026-09-11', '¡Qué bueno leer esto, Sofía! Gracias a vos por proponerla.')),
    ],
    'Mostrar el precio en cuotas sin interés en cada producto': [
        ('agustina', '2026-07-25', 'En carteras, mostrar las cuotas en la foto me subió mucho las ventas en Instagram. En la tienda sería igual.', None),
        ('martin', '2026-09-25', 'Funciona perfecto. ¿Se podrá elegir qué tarjetas se muestran?',
         ('tomas', '2026-09-26', 'Por ahora se muestran las de tu medio de pago. Lo de elegir tarjetas lo anotamos como mejora.')),
    ],
    'Envío gratis a partir de un monto mínimo': [
        ('joaquin', '2026-09-06', 'El cartelito de «te faltan $X» es lo mejor. La gente agrega una yerba más y listo.', None),
        ('martin', '2026-10-02', 'Lo activé ayer y ya noté que suben las compras. ¡Gracias!', None),
    ],
    'Facturación electrónica automática con AFIP': [
        ('ezequiel', '2026-07-14', 'Para mí es lo más importante de todo. Facturar a mano me lleva una hora por día.', None),
        ('florencia', '2026-07-20', '¿Funcionaría también para monotributistas?',
         ('laura', '2026-09-04', 'Sí, Florencia: va a funcionar para monotributo y responsable inscripto.')),
        ('pablo', '2026-09-05', 'Genial que esté en el roadmap. ¡Los espero!', None),
    ],
    'Conectar el catálogo con Instagram Shopping': [
        ('camila', '2026-08-13', 'Vendo casi todo por Instagram, para mí es clave.', None),
        ('mariana', '2026-08-20', '¿Y TikTok? Cada vez vendo más por ahí.',
         ('laura', '2026-08-29', 'Empezamos por Instagram y Facebook. TikTok lo estamos mirando para más adelante.')),
    ],
    'Avisar al cliente cuando vuelve a haber stock': [
        ('valentina', '2026-07-09', 'En ropa de chicos pasa todo el tiempo con los talles. ¡Lo necesito!', None),
        ('paula', '2026-07-30', 'Que el aviso pueda ser por WhatsApp además de email.', None),
    ],
    'Armar combos y kits de productos': [
        ('joaquin', '2026-08-04', 'Somos dos los del kit mate 😄 Me encanta la idea.', None),
        ('julieta', '2026-08-18', 'Yo armaría «maceta + planta + sustrato». Que el stock se descuente de cada uno es lo importante.', None),
    ],
    'Vender suscripciones con cobro mensual automático': [
        ('paula', '2026-07-24', 'Para alimento de mascotas sería ideal: la gente compra siempre lo mismo cada mes.', None),
    ],
    'Cupones de descuento válidos solo para la primera compra': [
        ('camila', '2026-06-30', 'Hoy me pasa que los clientes de siempre usan el cupón de bienvenida. Lo necesito.', None),
    ],
    'Tabla de talles por categoría de producto': [
        ('agustina', '2026-08-25', 'Y que se pueda subir una imagen propia con la tabla, porque cada marca tiene la suya.',
         ('tomas', '2026-09-26', '¡Buena idea! Vamos a permitir las dos cosas: una tabla armada en Vitrina o una imagen tuya.')),
    ],
    'Reseñas de clientes con fotos': [
        ('julieta', '2026-07-28', 'Que el dueño de la tienda pueda aprobar las reseñas antes de que se publiquen.', None),
        ('mariana', '2026-08-03', 'En joyería las fotos de clientes venden más que las mías 😅', None),
    ],
    'Buscador de la tienda que tolere errores de tipeo': [
        ('matias', '2026-07-29', 'También que encuentre sinónimos: «joystick» y «control», por ejemplo.', None),
    ],
    'Mejorar la velocidad de carga en celulares': [
        ('gonzalo', '2026-09-04', 'Lo noto sobre todo en las páginas con muchas fotos.',
         ('tomas', '2026-09-05', 'Gracias, Gonzalo. Justamente estamos midiendo esas páginas primero.')),
    ],
    'Gestionar cambios y devoluciones desde el panel': [
        ('valentina', '2026-09-14', 'Y que el cliente pueda iniciar el cambio desde la página de su pedido.', None),
    ],
    'Precios en dólares con conversión automática': [
        ('matias', '2026-08-27', 'Para tecnología sería muy útil, los precios cambian todas las semanas.', None),
        ('carla', '2026-09-01', 'A mí me daría miedo que el precio cambie mientras el cliente está comprando.', None),
    ],
    'Modo oscuro en el panel de administración': [
        ('matias', '2026-06-24', '¡Sí, por favor! Les dejo cómo me lo imagino en la imagen.', None),
        ('ezequiel', '2026-07-10', 'No es urgente, pero sería lindo.', None),
    ],
    'Programa de puntos para clientes frecuentes': [
        ('joaquin', '2026-07-18', 'Mis clientes de yerba compran todos los meses, les encantaría sumar puntos.', None),
    ],
    'Asistente con IA para escribir descripciones de productos': [
        ('sofia', '2026-10-10', '¡Me serviría muchísimo! Escribir descripciones es lo que más me cuesta.', None),
        ('federico', '2026-10-12', 'Mientras se pueda editar antes de publicar, sí.', None),
    ],
}

# Comentarios con muchos «me gusta»: los más compartidos por la comunidad (índice del comentario dentro de la idea → cantidad).
LIKES = {
    'Integración con Mercado Libre para sincronizar stock': {0: 7, 2: 4},
    'Recuperar carritos abandonados por WhatsApp': {0: 5, 1: 6},
    'Editar varios productos a la vez': {0: 6, 2: 8},
    'Facturación electrónica automática con AFIP': {0: 5},
    'Calcular envío con Andreani y OCA en el checkout': {0: 6},
    'Página de seguimiento del pedido para el cliente': {0: 4},
    'Precios en dólares con conversión automática': {1: 3},
}
