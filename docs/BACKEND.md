# Backend y base de datos

## Arquitectura

```
Navegador ──► Next.js (Hostinger, Node.js)
               ├─ páginas /  (landing, estática, ISR 1 h)
               ├─ /app/*     (React + Ant Design; lee y escribe con supabase-js)
               ├─ /api/billing/*  checkout, webhooks y retorno de PayPal y Mercado Pago
               ├─ /api/outbox     envía los emails en cola (Resend)
               └─ /api/cron/daily job diario (GitHub Actions)
                        │
                        ▼
               Supabase: Auth (email + Google) · Postgres con RLS · Storage (bucket media)
```

Toda la lógica de permisos y reglas de negocio vive en **funciones de Postgres** (`SECURITY DEFINER`) en `supabase/migrations`. El navegador solo llama funciones (`supabase.rpc(...)`); las tablas tienen RLS activado y el rol `anon`/`authenticated` no puede leerlas ni escribirlas directamente, salvo el propio perfil, cuenta y suscripción. Así la misma regla vale para la app, para una futura app móvil o para la API.

La clave `service_role` se usa solo en el servidor: webhooks de pago, job diario, envío de emails, creación de clientes desde el Admin y borrado de cuentas.

## Roles

| Rol | Cómo se determina | Puede |
| --- | --- | --- |
| **Super Admin** | `profiles.is_super_admin` | Panel `/app/admin`: métricas, clientes, buzones, usuarios; suspender cuentas, buzones y usuarios; cambiar planes, precios especiales y precios de lista (USD y ARS); crear clientes con link de activación. Puede ver cualquier buzón. |
| **Admin** | Dueño de la cuenta (`accounts.owner_id`); también `team_members.role = 'admin'` | Crear equipos y buzones, configurar buzones y categorías, administrar el plan y el pago, invitar miembros al equipo (a todos los buzones o a uno), dar y quitar acceso por buzón, invitar invitados, todo lo del Miembro. |
| **Miembro** | `team_members.role = 'member'` con acceso al buzón. Solo con plan Pro (en Free queda pausado) | Cargar ideas (origen Equipo), cambiar estados (motivo obligatorio al rechazar), editar y ocultar ideas y comentarios, responder comentarios, calificar y mover en el Roadmap (Pro), invitar invitados y bloquearlos. |
| **Invitado** | `board_guests` activo en un buzón **público** o **solo invitados**; en solo invitados también quien tiene una invitación pendiente a su email verificado o (Pro) un email verificado de `allowed_domains` | Proponer ideas (origen Comunidad), votar (no las propias), comentar, reaccionar. Ve sus buzones en *Mis Buzones › Invitado*. Puede crear su propia cuenta Admin (Free o Pro) desde "Crear mi buzón". |
| Visitante | Sin sesión | Ver Buzón, Ranking y Backlog de buzones públicos. Los buzones solo para invitados y privados no muestran nada, ni el nombre. |

**Permisos configurables**
- Nombres de los votos: cada buzón puede renombrar las 3 opciones (`set_vote_labels`, 2 a 16 caracteres, distintas; `boards.vote_labels` guarda solo las cambiadas). El puntaje no cambia (2 / 1 / 0).
- Votos: cualquiera con acceso vota cualquier idea abierta (Pendiente o En revisión) salvo las propias; el Equipo también vota las ideas de otros miembros. Comentar se puede en todas, incluidas las propias.
- Roadmap para invitados: `boards.guests_can_view_roadmap` (apagado por defecto, Pro, no en privados; `set_board_roadmap_public`). Si está activo, quien no es del Equipo ve la pestaña Roadmap en solo lectura: `idea_json` le agrega `rm_col`, `rm_order`, `dev_status` y `launched_at`, nunca prioridad, impacto, esfuerzo, puntaje, diseño, PRD ni Growth.
- Comunidad: el Equipo puede **eliminar** a un invitado (`remove_board_guest`: deja de ver el buzón, se revocan sus invitaciones; puede volver a ser invitado o pedir acceso; si su email es de un dominio permitido puede volver a entrar y se avisa) o **bloquearlo** (`set_guest_status`: no entra ni puede pedir acceso). El invitado puede **salir** solo (`leave_board`), salvo que esté bloqueado. Su contenido queda siempre.
- Notificaciones en la app (campanita, en toda la app): `enqueue_email` guarda también una fila en `notifications` para `access_request`, `access_granted`, `new_comment`, `team_reply`, `idea_status`, `idea_planned` e `idea_launched` (autor y votantes), antes de mirar la preferencia de email. Además, `create_idea` avisa (solo en la app, sin email) `new_idea` a quienes administran el buzón, salvo a quien la cargó. RPC: `get_notifications`, `notifications_unread`, `mark_notifications_read`; `get_my_context.unread_notifications`. Al decidir una solicitud, su aviso queda resuelto para todos los admins. El cron borra las leídas de más de 90 días.
- Solicitar acceso (buzones Solo invitados, Pro): quien no tiene acceso pide entrar (`request_board_access`, mensaje opcional; 1 pendiente por buzón, 7 días de espera tras un rechazo, máx. 10 por día). Avisa por email (`access_request`, preferencia `requests`) a quienes administran el buzón, que aprueban o rechazan desde Configuración › Comunidad (`decide_access_request`). Al aprobar entra como Invitado (`via = 'request'`) y recibe `access_granted`. Tabla `board_access_requests`.
- Visibilidad del buzón: `invite` (por defecto: Equipo + Invitados), `public` (cualquiera con el link) o `private` (solo Equipo, Pro). Funciones: `set_board_visibility`, `set_board_domains` (Pro, rechaza dominios de email personal), `board_invite_via`, `join_guest`. Ningún buzón se indexa en buscadores.
- Por buzón, *quiénes pueden crear ideas*: Miembros del equipo (Pro) e Invitados (públicos y solo invitados). El dueño del equipo y quien creó el buzón siempre pueden. Votar y comentar no depende de esto. Funciones: `set_board_idea_permissions`, y los parámetros `p_members_ideas` / `p_guests_ideas` de `create_board`.
- Por equipo, *los miembros pueden crear buzones* (desactivado por defecto; `set_team_settings`, `create_team(p_members_create_boards)`). El miembro que crea un buzón lo puede configurar (nombre, logo, categorías, visibilidad y quién crea ideas); eliminarlo y gestionar el acceso de otros miembros queda para el dueño.

Una misma persona puede ser Admin de su cuenta, Miembro de otro equipo e Invitado en otros buzones. El rol se calcula por buzón en `public.board_context(board, user)`.

**Cómo se entra como Invitado**: con el link del buzón (se une al registrarse/ingresar desde ahí o al participar por primera vez), o por invitación por email (`/app/invitacion/<token>`).

## Planes

| | Free | Pro | Enterprise |
| --- | --- | --- | --- |
| Equipos / buzones | 1 / 1 | Ilimitados | Ilimitados |
| Miembros por equipo | 0 (solo el Admin) | 4 + el Admin | 20 + el Admin (ajustable por cliente) |
| Asistente IA | No | No | 30 análisis y 20 sugerencias por mes, entre todos los buzones |
| Buzones solo para invitados | Sí | Sí | Sí |
| Acceso por dominio de email | No | Sí | Sí |
| Buzones privados | No | Sí | Sí |
| Matriz, Roadmap, Status, Growth | No | Sí | Sí |
| Invitados, ideas, votos, comentarios, Ranking, Backlog | Sí | Sí | Sí |

**Enterprise** cuesta USD 19,99 / mes con Creem o ARS 29.999 / mes con Mercado Pago. Su precio está en `price_schedule` como el de Pro (columna `plan`) y se programa desde Admin › Suscripciones; cada precio en dólares usa su propio producto de Creem (`creem_product_id`), que `creemProductFor` crea la primera vez que alguien paga, copiado del anterior (Creem no cambia el precio de una suscripción en curso) y se contrata desde la landing o Mi perfil ("Contratar Enterprise"), con el mismo flujo que Pro: `/api/billing/checkout` con `plan: 'enterprise'` (Creem: producto `prod_5vBg7bDxuY1x7J7TZ8c3ql`, o `CREEM_ENTERPRISE_PRODUCT_ID`; Mercado Pago: preapproval con reason "Boxinger Enterprise"). El webhook deduce el plan del producto o del reason. Pasar de un Pro pago a Enterprise cancela el Pro al activarse Enterprise. Un Enterprise pago se cancela, vuelve y pasa a Free como Pro (emails y avisos dicen Enterprise). "Contactanos" queda para precios o límites a medida: el Super Admin asigna Enterprise desde el panel (`provider = 'manual'`, siempre activo, facturado fuera de la plataforma). Incluye todo lo de Pro, hasta 20 miembros por equipo y el Asistente IA. Los límites por cliente (miembros por equipo o ilimitados, cupo de IA) se cambian en Admin › Clientes › ⋯ › Límites del cliente o en Consumo IA (`admin_set_client_limits`). Las cuentas que ya eran Enterprise antes del precio publicado quedaron con miembros ilimitados (`accounts.members_unlimited`). Al asignarlo a mano, si había una suscripción Pro en PayPal o Mercado Pago, se cancela.

Al volver a Free: el primer buzón del primer equipo sigue activo; el resto queda en **solo lectura** ("Requiere Pro") y los miembros quedan pausados. Nada se borra.

## Modelo de datos

| Tabla | Para qué |
| --- | --- |
| `profiles` | Un registro por usuario de Auth: nombre, email, avatar, `is_super_admin`, estado, preferencias de notificación. |
| `accounts` | La cuenta que paga, 1 por Admin. Estado activa/suspendida, última actividad. |
| `subscriptions` | 1 por cuenta: plan, estado, proveedor (`paypal`, `mercadopago`, `manual`), id de la suscripción en el proveedor, moneda, precio de lista y cobrado, período, precio especial (`deal_*`). |
| `price_schedule` | Precios de lista de Pro por moneda con fecha de inicio y alcance (todas / solo nuevas). |
| `payments`, `billing_events` | Cobros registrados y webhooks recibidos (idempotencia). |
| `teams`, `team_members` | Equipos de una cuenta y sus miembros. |
| `boards` | Buzones: nombre, slug, descripción, logo, visibilidad, estado, nombres de columnas del Roadmap. |
| `board_member_access` | Excepciones de acceso de un miembro a un buzón. |
| `board_guests` | Invitados de un buzón (activo/bloqueado). |
| `board_favorites` | Favoritos en Mis Buzones. |
| `invitations` | Invitaciones al equipo, a la Comunidad y activación de clientes creados por el Admin (token, vencimiento). |
| `categories` | Categorías por buzón (máx. 12; Feature, Mejora funcional y Propuesta por defecto). |
| `ideas` | Idea: origen, estado, motivo de rechazo, oculta, y campos Pro (impacto, esfuerzo, Growth, columna y orden del Roadmap, prioridad, desarrollo, checks de diseño y PRD). Growth (adquisición, activación, retención, monetización, prevenir churn) y los demás campos Pro solo se envían al Equipo. |
| `votes` | 1 por (idea, usuario): Importante / Interesante / No importante. |
| `comments`, `comment_replies`, `reactions` | Comentarios planos, 1 respuesta del Equipo por comentario, Like / No like. |
| `status_changes` | Historial de estados. |
| `email_outbox` | Cola de emails. |
| `audit_log` | Acciones del Super Admin. |
| `app_settings` | Datos de integración (id del producto de PayPal). |

**Puntaje** = 2 × Importante + 1 × Interesante. **Ranking** = top 10 entre Pendiente y En revisión, desempate por más Importante, más votos y antigüedad. Solo el Equipo ve el desglose y el puntaje.

## Funciones (API)

- **Lectura**: `get_my_context`, `get_board(slug)`, `get_idea(id)`, `board_version(board)` (polling de 5 s), `get_team`, `get_board_community`, `get_invitation(token)`, `current_price(moneda)`.
- **Ideas**: `create_idea`, `update_idea`, `set_idea_hidden`, `set_idea_status`, `vote`, `update_idea_plan` (impacto, esfuerzo, prioridad, desarrollo, checks), `move_roadmap` (devuelve a cuántos avisó), `rename_roadmap_column`.
- Integraciones (migración 054, Pro y Enterprise, solo quien administra el buzón): cada buzón puede tener una clave (`board_integrations`, se guarda solo su sha-256 y los últimos 4 caracteres) para que Zapier, Make, Google Forms o cualquier herramienta manden ideas a `POST /api/v1/ideas` (`src/app/api/v1/ideas/route.ts`) con `Authorization: Bearer <clave>` y JSON `{title, description?, name?, email?, category?, external_id?}`. La ruta llama con la clave de servicio a `ingest_idea` (solo servidor), la puerta que van a usar también Slack y el widget: valida la clave, el plan y que el buzón esté activo, limpia el título como la importación, busca la categoría por nombre (si no, la elegida en la integración), evita repetidos por `external_id` (`ideas.external_ref`) y crea la idea **oculta** con `ideas.source` (`api`, más adelante `slack` y `widget`) y quién la pidió en `requester_name`/`requester_email` (si el email es de alguien del buzón, queda como autor). Hasta 200 ideas por buzón por día. Avisa en la campanita (`new_idea_inbox`, sin email) a quien administra el buzón. La Comunidad la ve recién cuando el Equipo la publica (`set_idea_hidden`), con «Recibida por el Equipo» como autor. Errores de la ruta: 401 clave inválida, 403 plan o buzón suspendido, 400 título, 429 límite. `create_api_key` (crea o reemplaza; devuelve la clave una sola vez), `delete_api_key` (cualquier plan), `set_integration_options` (Comunidad/Equipo y categoría) y `get_integrations`. Pantalla: Configuración › Integraciones (`src/components/board/Integrations.tsx`, con «Enviar idea de prueba») y el filtro «Por revisar (N)» del Buzón. Desde «Por revisar» el Equipo publica, rechaza (con motivo; la idea sigue oculta) o **archiva** (migración 055: `set_idea_archived`, `ideas.archived_at`; queda oculta, sale de «Por revisar» y de la lista normal, y se ve en «Archivadas (N)»; publicarla la desarchiva). «Por revisar» = `source` no nulo, oculta, no archivada y no rechazada. La pestaña trae «¿Cómo funciona?» y guías paso a paso para Google Forms (script de Apps Script con la dirección y la clave ya puestas), Make, Zapier y otras herramientas. Para deshacer las funciones, `docs/rollback/20261018000054_integrations_rollback.sql` y `docs/rollback/20261018000055_archive_ideas_rollback.sql`.
- Novedades / changelog (migración 051, Pro y Enterprise): la pestaña Novedades (`src/components/board/Novedades.tsx`) lista sola las ideas lanzadas y no ocultas, por mes; la ve todo el que puede ver el buzón (el equipo en Free la ve con candado). Al lanzar una idea, `notify_board_update` avisa en la campanita (`board_update`, sin email) al resto del buzón (dueño, miembros e invitados activos), salvo a quien la lanzó, a bloqueados y a quien la propuso o votó (que ya recibe `idea_launched`).
- Vaciar buzón (migración 053, todos los planes, quien administra el buzón): `empty_board(board, nombre)` exige escribir el nombre del buzón y borra todas sus ideas (votos, comentarios, reacciones, historial, uniones, avisos) y el historial de importaciones; quedan la configuración, categorías, miembros e invitados. Las imágenes huérfanas las borra el cron. Queda en `audit_log`. Se usa desde Configuración › General › Zona de peligro.
- Imágenes en ideas (migración 052, Pro y Enterprise): una por idea, en el bucket **privado** `idea-images` (`<board>/<uuid>.webp` + miniatura `-t`). El navegador la achica y reconvierte (`src/lib/images.ts`: ≈1600 px, ≈160 KB, sin datos EXIF/GPS) y se muestra con URLs firmadas de 1 hora. Políticas: sube quien puede cargar ideas en el buzón con plan pago; lee quien puede ver el buzón (anon en públicos); borra quien administra el buzón o el dueño del archivo. `set_idea_image` (autor o equipo). Al unir ideas, la principal sin imagen toma la de la repetida. El cron diario borra los archivos sin uso (`cleanup_idea_images`) y avisa a los super admins al 70% de `NEXT_PUBLIC_STORAGE_LIMIT_MB` (por defecto 1024, el plan Free de Supabase); Admin › Dashboard muestra el espacio usado (`admin_storage_usage`).
- Descargar Novedades (sin migración): cualquiera que ve la pestaña puede bajarla en CSV o PDF (`src/lib/changelog-export.ts`, PDF con jsPDF cargado solo al pedirlo). Lleva solo lo que muestra la página (sin emails).
- Unir ideas repetidas (migración 050, Pro y Enterprise, solo quien administra el buzón): `merge_ideas(repetida, principal)` pasa los votos (si alguien votó las dos queda el de la principal; el autor de la principal no se suma) y los comentarios (`comments.merged_from`), suma un voto `importante` de quien propuso la repetida, avisa en la campanita (`idea_merged`, sin email) a su autor y votantes, guarda la repetida en `idea_merges` y la borra. `get_idea` de una idea unida devuelve `{merged_into}` (los links viejos llevan a la principal) y la principal trae `merges` («También la pidieron como»). Las uniones encadenadas terminan todas en la última principal.
- Exportar ideas (migración 049, todos los planes, solo quien administra el buzón): `export_ideas(board)` devuelve todas las ideas (también las ocultas) con votos, comentarios, autor y planificación, y queda en `audit_log`. El navegador arma un CSV para Excel/Sheets (`src/components/board/ExportButton.tsx`, `src/lib/csv.ts`) con las mismas primeras columnas que la importación; las celdas que empiezan con = + - @ llevan un ' adelante para que Excel no las ejecute como fórmula (la importación lo saca).
- Importar ideas (migración 048, Pro y Enterprise, solo quien administra el buzón): el navegador lee el CSV o .xlsx (`src/lib/import/parse.ts`, con `read-excel-file`) y manda las filas ya mapeadas a `import_ideas(board, archivo, origen, categoría por defecto, filas)`, que las vuelve a validar (título 5–80, repetidas o ya existentes se saltean, categoría por nombre, estado pendiente/en_revision/aprobada, fecha original hasta hoy) e inserta sin avisos ni emails. Hasta 1.000 filas por vez y 10 importaciones por buzón por día. Las ideas quedan con `imported`, `import_id` y quién la pidió en `requester_name`/`requester_email` (solo lo ve el equipo); si ese email es de alguien del buzón, queda como autor. Para importadas no se exige el mínimo de 20 caracteres de descripción. `get_imports` lista el historial y `undo_import` borra una importación entera.
- Reconocimiento (migración 047): cuando una idea entra al Roadmap por primera vez (`idea_planned`) y cuando se lanza (`idea_launched`), avisa por email y campanita a quien la propuso y a quienes la votaron, una sola vez por persona y paso (`notify_idea_step` / `idea_followers`). No avisa a quien hizo el cambio ni a bloqueados, y no dice la columna porque el Roadmap puede ser privado. Usa la preferencia de email `status`.
- **Comentarios**: `add_comment`, `edit_comment`, `delete_comment`, `set_comment_hidden`, `reply_comment`, `edit_reply`, `delete_reply`, `react`.
- **Buzones y equipos**: `onboard`, `create_team`, `rename_team`, `delete_team`, `create_board`, `update_board`, `set_board_visibility`, `set_board_idea_permissions`, `set_team_settings`, `delete_board`, `toggle_favorite`, categorías (`add_category`, `rename_category`, `delete_category`, `reset_categories`), `set_board_access`, `remove_team_member`.
- **Invitaciones**: `invite_team_members`, `invite_guests`, `revoke_invitation`, `accept_invitation`, `join_board`, `set_guest_status`.
- **Perfil**: `update_profile`, `update_notifications`.
- **Super Admin**: `admin_overview`, `admin_board_signups`, `admin_clients`, `admin_client_detail`, `admin_boards`, `admin_board_detail`, `admin_users`, `admin_set_account_status`, `admin_set_board_status`, `admin_set_user_status`, `admin_update_subscription`, `admin_prices`, `admin_schedule_price`, `admin_cancel_price`, `admin_client_activation`, `admin_provision_client` (solo servidor).

Límites anti-bots dentro de las funciones: 5 ideas cada 10 minutos, 30 votos y 10 comentarios por minuto por usuario. El registro y el login usan los límites de Supabase Auth.

## Pagos

- **Planes visibles: Free · Pro · Team · Enterprise** (migración 057 y `planName()` en `src/lib/constants.ts`). Por dentro hay tres planes (`free`, `pro`, `enterprise`): **Team** es `enterprise` contratado en la web (Creem o Mercado Pago, precio de lista, 20 miembros, IA) y **Enterprise** es `enterprise` asignado por el Super Admin (`provider = 'manual'`, se factura por fuera, miembros y cupo de IA en «Límites del cliente»). Mercado Pago crea las suscripciones como «Boxinger Team» y `planOfPreapproval` reconoce también las viejas «Boxinger Enterprise»; en Creem el nombre sale del producto base (`CREEM_ENTERPRISE_PRODUCT_ID`).
- **PayPal** cobra en USD con el precio de lista en USD. **Mercado Pago** cobra en ARS con el precio de lista en ARS, que el Super Admin define por separado (no hay conversión automática).
- La activación la confirman los **webhooks** (firma verificada con la API de PayPal y con `x-signature` HMAC en Mercado Pago). Los retornos del checkout aceleran la activación.
- **Cancelar**: el cliente cancela desde *Mi perfil › Suscripción*, después de un paso de retención que le muestra lo que pierde (`pro_usage()`, textos en `src/lib/pro-loss.ts`), le deja elegir qué buzón sigue activo en Free (`set_free_board`) y le pregunta el motivo (se ve en Admin › detalle del cliente). Sigue con Pro hasta el fin del período y el job diario lo pasa a Free.
- **Volver a Pro** antes del vencimiento: Creem reanuda la misma suscripción (`/subscriptions/{id}/resume`); en Mercado Pago, que no reactiva una cancelada, se crea una nueva con `start_date` = fin del período pagado, así no se cobra dos veces.
- **Emails de churn**: 3 días antes del vencimiento (`pro_ending`) y el día que pasa a Free (`pro_ended`), con lo que pierde y que volviendo recupera todo.
- **Buzón activo en Free**: el elegido (`accounts.free_board_id`) o, si no eligió, el más antiguo. En Free se puede cambiar una vez cada 30 días.
- **Cambios de precio** programados por el Super Admin: con alcance "todas", el job diario actualiza cada suscripción en el proveedor el día de inicio; con "solo nuevas", solo cambia el checkout.
- **Precios especiales** (descuento % o precio fijo, con vencimiento): se aplican al instante en el proveedor y el job diario los revierte al vencer.
- Avisos en Slack (migración 056, Pro y Enterprise, solo quien administra el buzón): cada buzón puede conectar **un canal de Slack** (`board_slack`; la dirección del webhook es secreta: sin políticas, nunca vuelve al navegador). «Conectar con Slack» (`src/components/board/SlackCard.tsx`) va a `/api/slack/connect` (chequea con `slack_can_connect`, guarda un `state` en la cookie `bx_slack` y manda a la pantalla de Slack con el permiso `incoming-webhook`); Slack vuelve a `/api/slack/callback`, que canjea el código (`oauth.v2.access`), guarda el canal con la clave de servicio (`save_slack`, solo direcciones `https://hooks.slack.com/`) y manda un primer mensaje. Un trigger en `ideas` encola en `slack_outbox` (una vez por idea, con `dedupe_key`): idea nueva visible (no las importadas; las que llegaron ocultas, cuando se publican), idea por integración que espera en «Por revisar», primera vez en el Roadmap y lanzada. Los lunes el job diario arma el resumen semanal (`queue_slack_weekly`; semanas sin movimiento no mandan nada). Cada aviso se prende o apaga (`set_slack_events`). `src/lib/slack.ts` (`dispatchSlack`) los manda con los datos actuales de la idea (`slack_notice_data`) en el idioma de quien conectó; se dispara con `/api/outbox` (la app lo llama después de cargar, publicar, pasar al Roadmap o lanzar), con `/api/v1/ideas` y con el job diario. Si Slack responde que el canal o la app ya no están (403/404/410), el canal queda en pausa con `error` hasta que se vuelva a conectar; otros errores se reintentan hasta 5 veces. «Enviar mensaje de prueba» → `/api/slack/test`. `delete_slack` funciona en cualquier plan. Variables: `NEXT_PUBLIC_SLACK_CLIENT_ID` (sin ella la tarjeta no se muestra) y `SLACK_CLIENT_SECRET`; la app de Slack necesita la Redirect URL `https://boxinger.com/api/slack/callback` y la distribución pública activada. Para deshacer, `docs/rollback/20261019000056_slack_notices_rollback.sql`.
- Ideas anónimas (migración 058, todos los planes): al crear una idea (`create_idea(..., p_anonymous)`) el autor puede mostrarla como «Anónimo» (`ideas.anonymous`); después la cambia con `set_idea_anonymous`. `author_hidden(idea, viewer)` decide: solo quien administra el buzón y el propio autor ven el nombre; los demás (incluidos los miembros del equipo) reciben `author_id` null y «Anónimo» en `idea_json`, y en `get_idea` también los comentarios del autor en su idea («Anónimo (autor de la idea)») y la lista de ideas unidas (`idea_merges.source_anonymous`). El `author_id` real se guarda, así que los emails de seguimiento y «no podés votar tu idea» siguen igual. Novedades, su descarga, Slack y el resumen diario de comentarios muestran «Anónimo»; el export (solo Admin) trae el nombre y la columna «Anónima». Cada buzón lo puede apagar (`boards.allow_anonymous`, `set_board_allow_anonymous`).
- Priorización opcional por buzón (migración 059): `boards.use_rating` (Impacto/Esfuerzo, la Matriz y el Valor del Roadmap) y `boards.use_growth`, prendidos por defecto; el Admin los cambia con `set_board_features` (Configuración › Priorización). Apagar solo oculta: lo cargado en las ideas queda y vuelve al prender. Sin growth, la tarjeta de Status muestra un estado vacío.
- Admins del equipo (migración 060, Team y Enterprise): roles **Admin Owner** (dueño de la cuenta: suscripción, eliminar el equipo, dar y quitar el rol Admin), **Admin** (`team_members.role = 'admin'`: gestiona buzones y personas, pero no factura ni quita a otros Admins) y **Miembro**. `set_team_member_role` lo usa solo el dueño, y solo con plan `enterprise`. Los Admins ocupan cupo: los conteos usan `role in ('member','admin')` y excluyen la fila del dueño, que también es 'admin' desde el onboarding. Al dejar el plan `enterprise`, un trigger en `subscriptions` pasa los Admins a miembros. Otro trigger en `audit_log` (`audit_owner_notice`) le manda al dueño el email `owner_admin_action` cuando otra persona elimina o vacía un buzón, exporta ideas, crea una clave de integración o conecta Slack. `delete_board` ahora deja registro en la auditoría.
- Tipos de buzón y módulos (migración 061): `boards.kind` (`producto` | `brainstorm` | `blank`) se elige al crear el buzón (`create_board` y `onboard` reciben `p_kind`) y no cambia. `board_kind_modules(kind)` define cada módulo (ranking, backlog, rating, growth, roadmap, status, changelog, affinity) como `fixed`, `optional` u `off`; `board_modules(b)` calcula los efectivos, y `get_board` devuelve `kind`, `modules` y `module_states`. `set_board_features` rechaza tocar un módulo fijo o no disponible. Los buzones previos quedan como `producto`, igual que antes. Brainstorming exige un plan pago y por ahora figura como «Próximamente» en la app (el catálogo está en `src/lib/board-kinds.ts`), hasta que salga su dinámica (entrega 2).
- Brainstorming (migración 062): `boards.vote_scale` (`tres` | `cinco` | `like`; `set_vote_scale` solo en Brainstorming y sin votos). Todos los puntajes pasan por `vote_points(value)`: ranking, `idea_json` (`points`, `avg`, `score`) y export. Grupos por afinidad en `idea_groups` e `ideas.group_id` (`create_group`, `rename_group`, `delete_group`, `move_idea_to_group`), y `accept_idea` aprueba la idea y la pasa al Backlog; todo exige el módulo `affinity` y plan pago. La vista es `src/components/board/Affinity.tsx`, y en Brainstorming la Matriz muestra las ideas agrupadas. `merge_ideas` conserva el grupo y le da al autor de la repetida el voto máximo de la escala; `empty_board` borra los grupos.
- El Super Admin puede dar Pro "manual" (sin cobro) desde el panel.

## Documentación

Ayuda dentro del producto, en el menú del perfil › Documentación (`/app/ayuda`, solo con sesión). Hay un artículo Markdown por idioma en `content/ayuda/<es|en>/<slug>.md`, con encabezado (title, summary, section, order, plans, roles, covers). `src/lib/docs.ts` los lee en el servidor y los convierte a HTML con un visor propio; `src/components/docs/DocsShell.tsx` muestra el índice, el buscador y el artículo. `npm run docs:check` (incluido en `npm run i18n`) valida que estén los dos idiomas, los encabezados y los links internos. Cada funcionalidad nueva o ajuste actualiza su artículo.

## Emails

Las funciones de Postgres encolan emails en `email_outbox` respetando las preferencias del usuario. La app los envía por Resend enseguida (`/api/outbox`) y el job diario reintenta los que fallaron. Los emails de Auth (verificación, recuperar contraseña) los manda Supabase por SMTP de Resend.

## Errores en producción

`reportError()` (`src/lib/alerts.ts`) guarda cada error en `app_errors` (el mismo error suma al contador) y le manda un email a `CONTACT_TO`: como máximo uno cada 6 horas por error y 20 por hora en total. Les llega a los Super Admin. Los abiertos se ven en Panel de Admin › Errores, donde se copian y se marcan como resueltos. Se ignoran los cortes de conexión del visitante (p. ej. "destination stream closed early").

Lo usan: errores no atrapados del servidor (`src/instrumentation.ts`), los webhooks de Creem, Mercado Pago y PayPal, el checkout y la cancelación, el proceso diario, los emails que fallan 5 veces y los errores del navegador (`ErrorReporter`, `app/error.tsx` y `global-error.tsx` → `/api/client-error`). En desarrollo solo se loguean, salvo con `REPORT_ERRORS=1`.

## Asistente IA (Enterprise)

En el Buzón, el Admin del equipo (solo ese rol) abre *Asistente IA*, describe el producto (`boards.ai_context`, `set_ai_context`) y con eso la IA:
- **Ideas del Buzón:** lee las ideas pendientes y en revisión (hasta 300, con votos, comentarios, impacto y esfuerzo) y propone hasta 5 para aprobar, con el motivo, la confianza e ideas repetidas.
- **Sugerir nuevas ideas:** propone 5 ideas nuevas, distintas de las del buzón y con una de sus categorías; "Descartar idea" la saca de la lista y la recuerda (`boards.ai_discarded`, últimas 30) para que la IA no proponga ideas parecidas; el tacho limpia la lista. "Agregar al buzón" abre el formulario ya completo y la idea se crea con `create_ai_idea`: autor = quien la agrega, marca `ideas.ai_generated` (tag «IA»).

`/api/ai` → `ai_begin` (plan Enterprise, rol del Equipo, descripción, topes) → Claude (`src/lib/ai/claude.ts`, respuesta en JSON con esquema fijo (structured outputs); instrucciones en `src/lib/ai/prompts.ts`) → `ai_finish` guarda tokens, costo y resultado en `ai_runs`. Topes en `ai_limits()`: 10 sugerencias y 15 análisis por buzón por mes; por cliente, 20 y 30 por mes entre todos sus buzones (el Admin de plataforma lo cambia por cliente en Consumo IA, `admin_set_ai_quota`); 500 usos por día en toda la plataforma. Un error no consume el cupo y va a `reportError('asistente-ia')`. A la IA no le llegan nombres ni emails. El uso y el costo se ven en Admin › Consumo IA (`admin_ai_overview`: por mes, por cliente y por buzón, con los Enterprise que no lo usaron) y en el detalle del cliente (`admin_ai_usage`).

## Idioma (español e inglés)

- **Textos:** el español del código es la fuente y la clave: `t('Guardar')` devuelve "Save" en inglés. Las traducciones están en `src/lib/i18n/en.ts`; si falta una, se ve el español. `npm run i18n` lista las que faltan (y `-- --loose` los textos sin envolver).
- **Dónde se usa:** en componentes de cliente, `useI18n()` (`t`, fechas y montos ya en el idioma); en páginas de servidor, `getT()` (`src/lib/i18n/server.ts`). Los toasts traducen solos lo que reciben, incluidos los errores de la base (`EN_PATTERNS` cubre los que llevan valores).
- **Idioma de cada persona:** cookie `bx_locale` en el navegador y `profiles.locale` en la base (`set_locale`, que también lo copia a `user_metadata.locale` para los emails de Supabase Auth). Sin cookie, se usa el idioma del navegador.
- **Emails:** cada email sale en el idioma del destinatario (su perfil; en invitaciones, el de quien invita: `sender_locale`). Los avisos al Admin de plataforma quedan en español.
- **Legales:** la versión en inglés (`TermsEn.tsx`, `PrivacyEn.tsx`) es una traducción de cortesía; rige la española. Mantenerlas iguales al cambiar una.
- **Interruptor:** `I18N_LIVE` en `src/lib/i18n/index.ts`. Apagado, solo el Super Admin ve el selector y se ignora el idioma del navegador.
- **Panel de Admin:** solo en español.

## Pruebas

`npm run test:db` corre todas las migraciones en un Postgres en memoria (PGlite) y prueba las reglas de negocio (unos 260 casos en `supabase/tests/`): permisos por rol, votos, ranking, estados, comentarios, planes y límites, miembros e invitaciones, buzones solo para invitados, dominios, solicitudes de acceso, notificaciones, roadmap, bajada a Free, panel de Admin, jobs e idioma. `npm run test:db -- access` corre solo los archivos que contienen ese nombre.

Cada push a `main` corre en GitHub Actions (`.github/workflows/ci.yml`) los tipos (`tsc`), los textos sin inglés (`npm run i18n`) y estas pruebas. Al agregar una migración, sumá sus casos en el archivo de pruebas que corresponda.
