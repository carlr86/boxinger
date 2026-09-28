# Boxinger

Buzón de ideas para equipos de producto: la comunidad propone y vota, el equipo revisa, y las ideas aprobadas pasan al Backlog, la Matriz de esfuerzo e impacto, el Roadmap y Status.

- **Web**: Next.js 16 (App Router) + Ant Design 6, en Vercel.
- **Datos y login**: Supabase (Postgres con RLS, Auth con email/contraseña y Google, Storage).
- **Emails**: Resend.
- **Pagos**: PayPal (USD) y Mercado Pago (ARS).

## Estructura

```
src/app/(site)/          landing (/), términos y privacidad
src/app/app/             la aplicación (/app): auth, onboarding, buzones, buzón, perfil, admin
src/app/api/             billing (checkout, webhooks), outbox de emails, cron diario
src/components/          UI: header, buzón (board/), mis buzones (boards/), admin/
src/lib/                 clientes de Supabase, emails, billing, formato
supabase/migrations/     esquema, permisos, funciones y datos iniciales
docs/SETUP.md            cómo configurar Supabase, Google, Resend, PayPal, Mercado Pago y Vercel
docs/BACKEND.md          roles, modelo de datos, API y decisiones
design/                  prototipos de Claude Design y PRD
legacy/                  MVP anterior (Insight Backlog, Python)
```

## Desarrollo

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000
npm run lint         # chequeo de tipos
npm run db:push      # aplica las migraciones al proyecto de Supabase vinculado
```

Ver [docs/SETUP.md](docs/SETUP.md) para la configuración completa.
