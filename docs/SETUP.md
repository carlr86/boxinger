# Puesta en marcha

Pasos para dejar Boxinger funcionando con Supabase, Resend, PayPal, Mercado Pago y Hostinger.
Hacé primero todo en modo prueba (sandbox) y después repetí los pasos de pagos con credenciales productivas.

## 1. Supabase

### Base de datos

```bash
npx supabase login
npx supabase link --project-ref <project-ref>     # pide la contraseña de la base
npx supabase db push                              # aplica supabase/migrations/*
```

Las migraciones crean tablas, funciones, políticas RLS, el bucket `media` (logos y avatares) y los precios iniciales:
**USD 9,99** y **ARS 14.999** (placeholder: cambialo desde el panel de Admin › Suscripciones › Programar nuevo precio, o con SQL antes de lanzar).

### Super Admin

Registrate en la app con tu email y después, en SQL Editor:

```sql
update public.profiles set is_super_admin = true where email = 'tu@email.com';
```

El panel queda en `/app/admin`.

### Auth

**Authentication › URL Configuration**

- Site URL: `https://www.boxinger.com`
- Redirect URLs: `https://www.boxinger.com/app/**`, `http://localhost:3000/app/**` y, si usás otro dominio de prueba, también ese.

**Authentication › Providers › Email**: activado, con *Confirm email* activado (hasta verificar, el usuario puede ver buzones pero no participar). Largo mínimo de contraseña: 8.

**Authentication › Providers › Google**

1. En Google Cloud Console › APIs & Services › Credentials, creá un *OAuth client ID* de tipo *Web application*.
2. *Authorized redirect URI*: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Pegá Client ID y Client Secret en Supabase.

Si alguien se registró con email y contraseña y después entra con Google con el mismo email, Supabase vincula las dos formas de acceso a la misma cuenta (requiere el email verificado).

**Authentication › Sessions**: *Time-box user sessions* en 30 días (PRD).

**Authentication › Emails › SMTP Settings** (obligatorio: el servidor de emails que trae Supabase solo manda a los miembros del proyecto y 2 por hora):

| Campo | Casilla de Hostinger | o Resend |
| --- | --- | --- |
| Host | `smtp.hostinger.com` | `smtp.resend.com` |
| Port | `465` | `465` |
| Username | `hola@boxinger.com` | `resend` |
| Password | contraseña de la casilla | tu `RESEND_API_KEY` |
| Sender | `hola@boxinger.com` · Boxinger | `hola@boxinger.com` · Boxinger |

**Authentication › Emails › Templates**: las plantillas en español listas para pegar están en `docs/email-templates/`. Usan links con `token_hash` para que funcionen desde cualquier dispositivo. En cada plantilla reemplazá el link por:

| Plantilla | Link |
| --- | --- |
| Confirm signup | `{{ .SiteURL }}/app/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}` |
| Reset password | `{{ .SiteURL }}/app/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Magic link | `{{ .SiteURL }}/app/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}` |
| Change email | `{{ .SiteURL }}/app/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` |

Textos sugeridos en español: *Confirmá tu email para empezar a usar Boxinger* / *Creá una nueva contraseña (el link vale 1 hora)*.
En **Authentication › Rate Limits** podés ajustar el límite de emails y registros por hora.

## 2. Emails: Resend

Resend es el proveedor elegido: plan gratis de 3.000 emails/mes (100/día), SDK oficial para Next.js, SMTP para los emails de Supabase y buena entregabilidad.

1. Creá la cuenta en resend.com y agregá el dominio `boxinger.com` (Domains › Add). Cargá en tu DNS los registros SPF, DKIM y (recomendado) DMARC que te muestra.
2. Creá una API key con permiso *Sending access* → `RESEND_API_KEY`.
3. Usala también como contraseña SMTP en Supabase (paso anterior).

Emails que manda la app (plantillas en `src/lib/email/templates.ts`): cambio de estado de una idea, nuevo comentario, respuesta del Equipo, idea lanzada, invitación a la Comunidad, invitación al equipo, activación de cliente, bienvenida a Pro, cancelación, pago fallido, cambio de precio, resumen diario del buzón y avisos al Super Admin (nuevos clientes, pagos fallidos, churn, resumen semanal).
Todos pasan por la tabla `email_outbox` y respetan las preferencias de cada usuario. Salen por Resend si hay `RESEND_API_KEY`; si no, por la casilla de Hostinger (`SMTP_*`, ver abajo). En producción sin ninguno de los dos quedan en cola hasta que configures uno; en local se escriben en la consola.

### Formulario de contacto (buzón de Hostinger)

El formulario de la landing (`/#contacto`) y el botón *Contactanos* del plan Enterprise (landing y Mi perfil › Suscripción) mandan cada mensaje a `hola@boxinger.com`, con *Responder a* el email de quien escribió: contestás directo desde tu correo.
Se envía por SMTP con la casilla de Hostinger. Cargá estas variables en Hostinger (Node.js app › Environment variables) y en `.env.local` si querés probar en local:

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `hola@boxinger.com` |
| `SMTP_PASS` | la contraseña de la casilla (hPanel › Emails › Cuentas de correo) |
| `CONTACT_TO` | opcional; a qué casilla llegan (por defecto `SMTP_USER`) |

Cada mensaje se guarda antes en la tabla `contact_messages` (Supabase › Table Editor). Si el envío falla, queda como `failed` y el cron diario lo reintenta. Límite: 5 mensajes por hora por conexión y 3 por email; un campo oculto frena bots.
Sin SMTP usa Resend si está configurado.

## 3. PayPal (USD)

1. developer.paypal.com › Apps & Credentials › *Create App* (primero en **Sandbox**). Copiá Client ID y Secret.
2. En la app › *Webhooks › Add Webhook*: URL `https://www.boxinger.com/api/billing/paypal/webhook` con los eventos:
   `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.RE-ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.DENIED`, `PAYMENT.SALE.REFUNDED`.
   Copiá el *Webhook ID* → `PAYPAL_WEBHOOK_ID`.
3. El producto "Boxinger Pro" y un plan por cada precio en USD se crean solos la primera vez que alguien paga.
4. Para producción: repetí con la app **Live** y `PAYPAL_ENV=live`.

Cómo funciona: *Pasar a Pro* crea la suscripción en PayPal y redirige a aprobarla. Al volver (`/api/billing/paypal/return`) y con el webhook `ACTIVATED`, la cuenta pasa a Pro. Los precios especiales y los cambios de precio se aplican a cada suscripción con `PATCH /v1/billing/subscriptions/{id}` desde el próximo cobro.

## 3b. Creem (USD, pagos internacionales)

Reemplaza a PayPal (la cuenta de PayPal fue cerrada). Creem es *merchant of record*: cobra con tarjeta, Apple Pay o Google Pay en cualquier país, resuelve impuestos y factura al cliente. Comisión 3,9 % + USD 0,40; cobro a banco argentino (USD 7 o 1 %, lo mayor).

1. En creem.io creá el producto **Plan Pro**: suscripción mensual de USD 9,99 (uno en modo test y otro en producción).
2. *Developers › API Keys* → `CREEM_API_KEY` (las de test empiezan con `creem_test_` y usan `test-api.creem.io`).
3. `CREEM_PRODUCT_ID`: el `prod_…` del producto (`GET /v1/products/search`).
4. Webhook a `https://boxinger.com/api/billing/creem/webhook` (se crea con `POST /v1/webhooks`; el `secret` que devuelve → `CREEM_WEBHOOK_SECRET`). Eventos: `checkout.completed`, `subscription.active`, `subscription.paid`, `subscription.canceled`, `subscription.scheduled_cancel`, `subscription.expired`, `subscription.past_due`, `subscription.unpaid`, `subscription.update`, `refund.created`.
5. `NEXT_PUBLIC_CREEM_ENABLED=1` muestra "Tarjeta internacional" (se lee al compilar: después de cambiarla, Redeploy).

Notas: Creem no permite precios especiales por cliente en suscripciones ni cambiar el precio de una suscripción en curso; para un precio especial usá un código de descuento de Creem.

## 4. Mercado Pago (ARS, Argentina)

1. mercadopago.com.ar/developers › *Tus integraciones › Crear aplicación* (producto: Suscripciones). Copiá el *Access Token* (primero el de prueba, `TEST-…`) → `MP_ACCESS_TOKEN`.
2. En la aplicación › *Webhooks*: URL `https://boxinger.com/api/billing/mercadopago/webhook`, eventos **Planes y suscripciones** (`subscription_preapproval`, `subscription_authorized_payment`). Copiá la *Clave secreta* → `MP_WEBHOOK_SECRET`.
3. Para probar, creá usuarios de prueba (vendedor y comprador) en *Cuentas de prueba*.

Cómo funciona: *Pasar a Pro › Mercado Pago* crea un `preapproval` en pesos con el precio ARS vigente y redirige a `init_point`. El comprador tiene que pagar con la cuenta de Mercado Pago del email que indica en el modal (por defecto, el de su cuenta de Boxinger). Al volver (`/api/billing/mercadopago/return`) y con el webhook, la cuenta pasa a Pro. Los cambios de precio y precios especiales actualizan `auto_recurring.transaction_amount` del preapproval.

## 5. Hostinger (hosting) y GitHub

Boxinger necesita un servidor Node.js (login, webhooks de pago y rutas `/api`), así que no sirve un hosting solo de archivos estáticos. En Hostinger funciona con **Business Web Hosting** o **Cloud** (Node.js Web Apps). En un VPS también funciona, pero la instalación es manual.

**Crear la app**

1. hPanel › **Websites** › **Add Website** › **Node.js Apps** › **Import Git Repository**.
2. Autorizá GitHub y elegí `carlr86/boxinger`, rama `main`.
3. Configuración de build:

   | Campo | Valor |
   | --- | --- |
   | Framework preset | Next.js |
   | Node.js version | 22 |
   | Package manager | npm |
   | Build command | `npm run build` |
   | Start / entry | `npm start` (lo sugiere el preset) |

4. **Environment variables**: cargá todas las de `.env.example` con los valores reales. `NEXT_PUBLIC_SITE_URL` va con tu dominio (por ejemplo `https://www.boxinger.com`). **No** cargues `SUPABASE_DB_URL`: solo se usa en tu computadora para aplicar migraciones.
   Las variables `NEXT_PUBLIC_*` se incrustan al compilar: si las cambiás, volvé a publicar (Redeploy).
5. Deploy. Cada `git push` a `main` vuelve a publicar solo.

**Dominio**: en la app de Hostinger, conectá tu dominio (si está en Hostinger se configura solo; si no, apuntá el DNS como indica hPanel). Activá el SSL (Let's Encrypt, gratis) y redirigí `boxinger.com` → `www.boxinger.com`, o al revés, pero usá la misma URL en `NEXT_PUBLIC_SITE_URL`, en Supabase y en los webhooks.

**Proceso diario (GitHub Actions)**: `.github/workflows/daily-cron.yml` llama a `/api/cron/daily` todos los días a las 11:00 UTC (8:00 en Argentina). En GitHub › repo › **Settings › Secrets and variables › Actions › New repository secret** cargá:

| Secret | Valor |
| --- | --- |
| `SITE_URL` | `https://www.boxinger.com` (tu dominio, sin `/` al final) |
| `CRON_SECRET` | el mismo valor que pusiste en Hostinger (generalo con `openssl rand -hex 32`) |

Para probarlo sin esperar: pestaña **Actions › Daily job › Run workflow**.

Ese proceso aplica los precios programados, vence los precios especiales, pasa a Free las suscripciones canceladas al fin del período, manda el resumen diario, las alertas de churn y el resumen semanal (los lunes), y reintenta los emails pendientes.

**Después de publicar, actualizá las URLs** en Supabase (Auth › URL Configuration: Site URL y Redirect URLs con tu dominio), en Google Cloud (si usás login con Google, no hace falta tocar nada: la URL de callback es la de Supabase), y en los webhooks de PayPal y Mercado Pago.

## 6. Desarrollo local

```bash
cp .env.example .env.local     # completá con las claves de Supabase (y opcionalmente el resto)
npm install
npm run dev                    # http://localhost:3000
```

Para probar webhooks en local usá un túnel (por ejemplo `cloudflared tunnel --url http://localhost:3000`) y apuntá los webhooks de sandbox a esa URL.
