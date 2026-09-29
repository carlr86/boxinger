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
| **Invitado** | `board_guests` activo en un buzón **público** | Proponer ideas (origen Comunidad), votar (no las propias), comentar, reaccionar. Ve sus buzones en *Mis Buzones › Invitado*. Puede crear su propia cuenta Admin (Free o Pro) desde "Crear mi buzón". |
| Visitante | Sin sesión | Ver Buzón, Ranking y Backlog de buzones públicos. |

Una misma persona puede ser Admin de su cuenta, Miembro de otro equipo e Invitado en otros buzones. El rol se calcula por buzón en `public.board_context(board, user)`.

**Cómo se entra como Invitado**: con el link del buzón (se une al registrarse/ingresar desde ahí o al participar por primera vez), o por invitación por email (`/app/invitacion/<token>`).

## Planes

| | Free | Pro |
| --- | --- | --- |
| Equipos / buzones | 1 / 1 | Ilimitados |
| Miembros por equipo | 0 (solo el Admin) | 4 + el Admin |
| Buzones privados | No | Sí |
| Matriz, Roadmap, Status | No | Sí |
| Invitados, ideas, votos, comentarios, Ranking, Backlog | Sí | Sí |

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
| `ideas` | Idea: origen, estado, motivo de rechazo, oculta, y campos Pro (impacto, esfuerzo, columna y orden del Roadmap, prioridad, desarrollo, checks de diseño y PRD). |
| `votes` | 1 por (idea, usuario): Importante / Interesante / No importante. |
| `comments`, `comment_replies`, `reactions` | Comentarios planos, 1 respuesta del Equipo por comentario, Like / No like. |
| `status_changes` | Historial de estados. |
| `email_outbox` | Cola de emails. |
| `audit_log` | Acciones del Super Admin. |
| `app_settings` | Datos de integración (id del producto de PayPal). |

**Puntaje** = 2 × Importante + 1 × Interesante. **Ranking** = top 10 entre Pendiente y En revisión, desempate por más Importante, más votos y antigüedad. Solo el Equipo ve el desglose y el puntaje.

## Funciones (API)

- **Lectura**: `get_my_context`, `get_board(slug)`, `get_idea(id)`, `board_version(board)` (polling de 5 s), `get_team`, `get_board_community`, `get_invitation(token)`, `current_price(moneda)`.
- **Ideas**: `create_idea`, `update_idea`, `set_idea_hidden`, `set_idea_status`, `vote`, `update_idea_plan` (impacto, esfuerzo, prioridad, desarrollo, checks), `move_roadmap`, `rename_roadmap_column`.
- **Comentarios**: `add_comment`, `edit_comment`, `delete_comment`, `set_comment_hidden`, `reply_comment`, `edit_reply`, `delete_reply`, `react`.
- **Buzones y equipos**: `onboard`, `create_team`, `rename_team`, `delete_team`, `create_board`, `update_board`, `set_board_visibility`, `delete_board`, `toggle_favorite`, categorías (`add_category`, `rename_category`, `delete_category`, `reset_categories`), `set_board_access`, `remove_team_member`.
- **Invitaciones**: `invite_team_members`, `invite_guests`, `revoke_invitation`, `accept_invitation`, `join_board`, `set_guest_status`.
- **Perfil**: `update_profile`, `update_notifications`.
- **Super Admin**: `admin_overview`, `admin_board_signups`, `admin_clients`, `admin_client_detail`, `admin_boards`, `admin_board_detail`, `admin_users`, `admin_set_account_status`, `admin_set_board_status`, `admin_set_user_status`, `admin_update_subscription`, `admin_prices`, `admin_schedule_price`, `admin_cancel_price`, `admin_client_activation`, `admin_provision_client` (solo servidor).

Límites anti-bots dentro de las funciones: 5 ideas cada 10 minutos, 30 votos y 10 comentarios por minuto por usuario. El registro y el login usan los límites de Supabase Auth.

## Pagos

- **PayPal** cobra en USD con el precio de lista en USD. **Mercado Pago** cobra en ARS con el precio de lista en ARS, que el Super Admin define por separado (no hay conversión automática).
- La activación la confirman los **webhooks** (firma verificada con la API de PayPal y con `x-signature` HMAC en Mercado Pago). Los retornos del checkout aceleran la activación.
- **Cancelar**: el cliente cancela desde *Mi perfil › Suscripción*; sigue con Pro hasta el fin del período y el job diario lo pasa a Free.
- **Cambios de precio** programados por el Super Admin: con alcance "todas", el job diario actualiza cada suscripción en el proveedor el día de inicio; con "solo nuevas", solo cambia el checkout.
- **Precios especiales** (descuento % o precio fijo, con vencimiento): se aplican al instante en el proveedor y el job diario los revierte al vencer.
- El Super Admin puede dar Pro "manual" (sin cobro) desde el panel.

## Emails

Las funciones de Postgres encolan emails en `email_outbox` respetando las preferencias del usuario. La app los envía por Resend enseguida (`/api/outbox`) y el job diario reintenta los que fallaron. Los emails de Auth (verificación, recuperar contraseña) los manda Supabase por SMTP de Resend.

## Pruebas

Las reglas de negocio de las migraciones se probaron con 84 casos en Postgres (PGlite): permisos por rol, votos, ranking, estados, comentarios, planes y límites, miembros e invitaciones, roadmap, bajada a Free, panel de Admin y jobs.
