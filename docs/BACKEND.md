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
- Importar ideas (migración 048, Pro y Enterprise, solo quien administra el buzón): el navegador lee el CSV o .xlsx (`src/lib/import/parse.ts`, con `read-excel-file`) y manda las filas ya mapeadas a `import_ideas(board, archivo, origen, categoría por defecto, filas)`, que las vuelve a validar (título 5–80, repetidas o ya existentes se saltean, categoría por nombre, estado pendiente/en_revision/aprobada, fecha original hasta hoy) e inserta sin avisos ni emails. Hasta 1.000 filas por vez y 10 importaciones por buzón por día. Las ideas quedan con `imported`, `import_id` y quién la pidió en `requester_name`/`requester_email` (solo lo ve el equipo); si ese email es de alguien del buzón, queda como autor. Para importadas no se exige el mínimo de 20 caracteres de descripción. `get_imports` lista el historial y `undo_import` borra una importación entera.
- Reconocimiento (migración 047): cuando una idea entra al Roadmap por primera vez (`idea_planned`) y cuando se lanza (`idea_launched`), avisa por email y campanita a quien la propuso y a quienes la votaron, una sola vez por persona y paso (`notify_idea_step` / `idea_followers`). No avisa a quien hizo el cambio ni a bloqueados, y no dice la columna porque el Roadmap puede ser privado. Usa la preferencia de email `status`.
- **Comentarios**: `add_comment`, `edit_comment`, `delete_comment`, `set_comment_hidden`, `reply_comment`, `edit_reply`, `delete_reply`, `react`.
- **Buzones y equipos**: `onboard`, `create_team`, `rename_team`, `delete_team`, `create_board`, `update_board`, `set_board_visibility`, `set_board_idea_permissions`, `set_team_settings`, `delete_board`, `toggle_favorite`, categorías (`add_category`, `rename_category`, `delete_category`, `reset_categories`), `set_board_access`, `remove_team_member`.
- **Invitaciones**: `invite_team_members`, `invite_guests`, `revoke_invitation`, `accept_invitation`, `join_board`, `set_guest_status`.
- **Perfil**: `update_profile`, `update_notifications`.
- **Super Admin**: `admin_overview`, `admin_board_signups`, `admin_clients`, `admin_client_detail`, `admin_boards`, `admin_board_detail`, `admin_users`, `admin_set_account_status`, `admin_set_board_status`, `admin_set_user_status`, `admin_update_subscription`, `admin_prices`, `admin_schedule_price`, `admin_cancel_price`, `admin_client_activation`, `admin_provision_client` (solo servidor).

Límites anti-bots dentro de las funciones: 5 ideas cada 10 minutos, 30 votos y 10 comentarios por minuto por usuario. El registro y el login usan los límites de Supabase Auth.

## Pagos

- **PayPal** cobra en USD con el precio de lista en USD. **Mercado Pago** cobra en ARS con el precio de lista en ARS, que el Super Admin define por separado (no hay conversión automática).
- La activación la confirman los **webhooks** (firma verificada con la API de PayPal y con `x-signature` HMAC en Mercado Pago). Los retornos del checkout aceleran la activación.
- **Cancelar**: el cliente cancela desde *Mi perfil › Suscripción*, después de un paso de retención que le muestra lo que pierde (`pro_usage()`, textos en `src/lib/pro-loss.ts`), le deja elegir qué buzón sigue activo en Free (`set_free_board`) y le pregunta el motivo (se ve en Admin › detalle del cliente). Sigue con Pro hasta el fin del período y el job diario lo pasa a Free.
- **Volver a Pro** antes del vencimiento: Creem reanuda la misma suscripción (`/subscriptions/{id}/resume`); en Mercado Pago, que no reactiva una cancelada, se crea una nueva con `start_date` = fin del período pagado, así no se cobra dos veces.
- **Emails de churn**: 3 días antes del vencimiento (`pro_ending`) y el día que pasa a Free (`pro_ended`), con lo que pierde y que volviendo recupera todo.
- **Buzón activo en Free**: el elegido (`accounts.free_board_id`) o, si no eligió, el más antiguo. En Free se puede cambiar una vez cada 30 días.
- **Cambios de precio** programados por el Super Admin: con alcance "todas", el job diario actualiza cada suscripción en el proveedor el día de inicio; con "solo nuevas", solo cambia el checkout.
- **Precios especiales** (descuento % o precio fijo, con vencimiento): se aplican al instante en el proveedor y el job diario los revierte al vencer.
- El Super Admin puede dar Pro "manual" (sin cobro) desde el panel.

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
