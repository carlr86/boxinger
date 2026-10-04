import { SITE_URL } from '@/lib/env';
import { fmtPrice } from '@/lib/format';
import { CONTACT_TOPICS, type ContactTopic } from '@/lib/constants';
import { makeT, type Locale, type T } from '@/lib/i18n';

// Transactional emails, in the recipient's language (Spanish by default; English texts in src/lib/i18n/en.ts).
// Each template gets the outbox payload written by the Postgres functions (see supabase/migrations).
// Emails to the platform admin (admin_*, contact, withdrawal notices) stay in Spanish.

type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const esc = (v: unknown) => s(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ideaUrl = (p: P) => `${SITE_URL}/app/b/${s(p.slug)}/idea/${s(p.idea_id)}`;
const boardLink = (p: P) => `${SITE_URL}/app/b/${s(p.slug)}`;
const STATUS: Record<string, string> = { pendiente: 'Pendiente de revisión', en_revision: 'En revisión', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const b = (v: unknown) => `<b>${esc(v)}</b>`;

// Set per email by render(): the helpers below read it.
let L: Locale = 'es';
let t: T = makeT('es');
const money = (cur: unknown, v: unknown) => `${s(cur) === 'ARS' ? 'ARS' : 'USD'} ${fmtPrice(Number(v), L)}`;
const date = (v: unknown) => new Date(s(v)).toLocaleDateString(L === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
const profileLink = () => `<a href="${SITE_URL}/app/perfil?tab=notif" style="color:#059669">${t('Mi perfil')}</a>`;

function layout(title: string, body: string, cta?: { label: string; url: string }, foot?: string): string {
  return `<!doctype html><html lang="${L}"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:rgba(0,0,0,0.88)">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #f0f0f0;border-radius:8px">
<tr><td style="padding:24px 32px;border-bottom:1px solid #f0f0f0"><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:6px;background:#059669;color:#fff;font-weight:700">B</span> <span style="font-weight:600;font-size:16px;vertical-align:middle;margin-left:8px">Boxinger</span></td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;font-weight:600">${title}</h1>
<div style="font-size:15px;line-height:1.6;color:rgba(0,0,0,0.75)">${body}</div>
${cta ? `<p style="margin:24px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:15px">${cta.label}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:rgba(0,0,0,0.45);line-height:1.5">${foot || t('Recibís este email por tu actividad en Boxinger. Podés cambiar tus notificaciones en {link}.', { link: profileLink() })}</td></tr>
</table></td></tr></table></body></html>`;
}

export const withdrawalCode = (id: unknown) => 'ARR-' + s(id).padStart(6, '0');
const quote = (t: unknown) => `<blockquote style="margin:12px 0;padding:10px 14px;background:#fafafa;border-left:3px solid #a9cbc2;border-radius:4px;color:rgba(0,0,0,0.75)">${esc(t)}</blockquote>`;

export function render(template: string, p: P, locale: Locale = 'es'): { subject: string; html: string } {
  // Admin notices always go out in Spanish.
  L = template.startsWith('admin_') || template === 'contact' ? 'es' : locale;
  t = makeT(L);
  const st = (k: string) => (STATUS[k] ? t(STATUS[k]) : k);
  switch (template) {
    case 'idea_status': {
      const to = s(p.to);
      const body = t('Tu idea {title} en {board} pasó a {status}.', { title: b(p.title), board: esc(p.board_name), status: `<b>${st(to)}</b>` }) +
        (to === 'aprobada' ? ' ' + t('Ahora forma parte del Backlog del equipo.') : '') +
        (to === 'rechazada' && p.reason ? `<br>${t('Motivo del equipo:')}${quote(p.reason)}` : '');
      return { subject: t('Tu idea ahora está: {status}', { status: st(to) }), html: layout(t('Tu idea cambió de estado'), body, { label: t('Ver la idea'), url: ideaUrl(p) }) };
    }
    case 'new_comment':
      return {
        subject: t('Nuevo comentario en "{title}"', { title: s(p.title) }),
        html: layout(t('Comentaron tu idea'), t('{author} comentó tu idea {title}:', { author: b(p.author), title: b(p.title) }) + quote(p.excerpt), { label: t('Responder'), url: ideaUrl(p) }),
      };
    case 'team_reply':
      return {
        subject: t('El Equipo respondió tu comentario en "{title}"', { title: s(p.title) }),
        html: layout(t('El Equipo te respondió'), t('Comentaste:') + quote(p.comment) + t('Respuesta del Equipo de {board}:', { board: esc(p.board_name) }) + quote(p.reply), { label: t('Ver la conversación'), url: ideaUrl(p) }),
      };
    case 'idea_launched':
      return {
        subject: t('¡Se lanzó "{title}"!', { title: s(p.title) }),
        html: p.mine
          ? layout(t('Tu idea ya está disponible'), t('El Equipo de {board} lanzó {title}, la idea que propusiste. ¡Gracias por sumarla!', { board: esc(p.board_name), title: b(p.title) }), { label: t('Ver la idea'), url: ideaUrl(p) })
          : layout(t('Una idea que votaste ya está disponible'), t('El Equipo de {board} lanzó {title}. Gracias por ayudar a priorizarla.', { board: esc(p.board_name), title: b(p.title) }), { label: t('Ver la idea'), url: ideaUrl(p) }),
      };
    case 'access_request':
      return {
        subject: t('{name} pidió acceso a {board}', { name: s(p.name), board: s(p.board_name) }),
        html: layout(t('Solicitud de acceso a {board}', { board: esc(p.board_name) }),
          t('{name} ({email}) quiere sumarse como invitado al buzón {board}.', { name: b(p.name), email: esc(p.email), board: b(p.board_name) }) + (p.message ? quote(p.message) : '') +
          t('Si lo aprobás, va a poder ver las ideas, votar y comentar.'),
          { label: t('Revisar solicitud'), url: `${boardLink(p)}/config?seccion=comunidad` },
          t('Recibís este email porque administrás {board}. Podés desactivar estos avisos en {link}.', { board: esc(p.board_name), link: profileLink() })),
      };
    case 'access_granted':
      return {
        subject: t('Ya tenés acceso a {board}', { board: s(p.board_name) }),
        html: layout(t('Ya podés entrar a {board}', { board: esc(p.board_name) }),
          t('El equipo aprobó tu solicitud. Ya sos parte de la Comunidad del buzón {board}: podés ver las ideas, votar y comentar.', { board: b(p.board_name) }),
          { label: t('Ir al buzón'), url: boardLink(p) }, t('Recibís este email porque pediste acceso a este buzón.')),
      };
    case 'invite_guest':
      return {
        subject: t('{inviter} te invitó a {board}', { inviter: s(p.inviter) || t('El Equipo'), board: s(p.board_name) }),
        html: layout(t('Te invitaron a {board}', { board: esc(p.board_name) }),
          t('{inviter} te invitó a la Comunidad del buzón de ideas {board}.', { inviter: esc(p.inviter) || t('El Equipo'), board: b(p.board_name) }) + (p.description ? quote(p.description) : '') +
          t('Vas a poder votar y comentar las ideas.') + '<br><br>' + t('Para entrar, creá tu cuenta o ingresá con {same}: el buzón solo se ve con la cuenta invitada.', { same: `<b>${t('este mismo email')}</b>` }),
          { label: t('Aceptar invitación'), url: `${SITE_URL}/app/invitacion/${s(p.token)}` }, t('Si no esperabas esta invitación, podés ignorar este email.')),
      };
    case 'invite_team':
      return {
        subject: t('{inviter} te invitó al equipo {team}', { inviter: s(p.inviter) || t('El Admin'), team: s(p.team_name) }),
        html: layout(t('Sumate al equipo {team}', { team: esc(p.team_name) }),
          (p.board_name
            ? t('{inviter} te invitó como Miembro del equipo {team} para el buzón {board} en Boxinger.', { inviter: esc(p.inviter) || t('El Admin'), team: b(p.team_name), board: b(p.board_name) })
            : t('{inviter} te invitó como Miembro del equipo {team} en Boxinger.', { inviter: esc(p.inviter) || t('El Admin'), team: b(p.team_name) })) +
          ' ' + t('Vas a poder cargar ideas del equipo, cambiar estados e invitar a la Comunidad.') + '<br><br>' + t('La invitación vence en 7 días.'),
          { label: t('Aceptar invitación'), url: `${SITE_URL}/app/invitacion/${s(p.token)}` }, t('Si no esperabas esta invitación, podés ignorar este email.')),
      };
    case 'client_activation':
      return {
        subject: t('Tu cuenta de Boxinger está lista'),
        html: layout(p.name ? t('Hola, {name}', { name: esc(s(p.name).split(' ')[0]) }) : t('Hola'),
          t('Creamos tu cuenta en Boxinger con el buzón {board}. Activala para empezar a recibir ideas de tu comunidad. Al activarla creás tu contraseña o entrás con Google.', { board: b(p.board) }) + '<br><br>' + t('El link vence en 7 días.'),
          { label: t('Activar mi cuenta'), url: `${SITE_URL}/app/activar/${s(p.token)}` }, t('Si no esperabas este email, escribinos a hola@boxinger.com.')),
      };
    case 'price_change':
      return {
        subject: t('Cambio en el precio del plan Pro'),
        html: layout(t('Actualizamos el precio de Pro'),
          t('Desde el {date} el plan Pro pasa de {old} a {new} por mes. El cambio se aplica en tu próxima renovación a partir de esa fecha. Podés cancelar cuando quieras desde tu perfil.', { date: date(p.from), old: money(p.currency, p.old), new: `<b>${money(p.currency, p.new)}</b>` }),
          { label: t('Ver mi suscripción'), url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    case 'subscription_changed': {
      if (s(p.plan) === 'enterprise')
        return {
          subject: t('Tu cuenta ahora es Enterprise'),
          html: layout(t('Bienvenido a Boxinger Enterprise'), t('Tu cuenta pasó al plan Enterprise: todo lo de Pro, con miembros ilimitados en tus equipos y acceso anticipado a las nuevas funciones con IA.'), { label: t('Ir a mis buzones'), url: `${SITE_URL}/app/buzones` }),
        };
      const pro = s(p.plan) === 'pro';
      const amount = money(p.currency, p.amount);
      const proText = !p.deal_type ? t('Tu plan es Pro: {amount} por mes.', { amount })
        : p.deal_until ? t('Tu plan es Pro con precio especial hasta el {date}: {amount} por mes.', { date: date(p.deal_until), amount })
        : t('Tu plan es Pro con precio especial: {amount} por mes.', { amount });
      return {
        subject: pro ? t('Tu plan Pro fue actualizado') : t('Tu cuenta pasó al plan Free'),
        html: layout(pro ? t('Actualizamos tu suscripción') : t('Tu cuenta ahora es Free'),
          pro ? proText : t('Tu cuenta pasó al plan Free. Tus buzones siguen disponibles; los que superan el límite de Free quedan en solo lectura.'),
          { label: t('Ver mi suscripción'), url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    }
    case 'pro_welcome':
      return {
        subject: t('¡Bienvenido a Boxinger Pro!'),
        html: layout(t('Ya tenés Pro'), t('Tu suscripción está activa. Ahora podés crear equipos y buzones ilimitados, sumar hasta 4 miembros por equipo y usar la Matriz, el Roadmap y Status.'), { label: t('Ir a mis buzones'), url: `${SITE_URL}/app/buzones` }),
      };
    case 'pro_cancelled':
      return {
        subject: t('Cancelaste tu suscripción Pro'),
        html: layout(t('Tu suscripción Pro se canceló'),
          (p.until ? t('Seguís con Pro hasta el {date}.', { date: date(p.until) }) : t('Seguís con Pro hasta el fin del período pagado.')) + ' ' + t('Después tu cuenta pasa a Free y los buzones extra quedan en solo lectura.'),
          { label: t('Volver a Pro'), url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    case 'payment_failed':
      return {
        subject: t('No pudimos cobrar tu suscripción Pro'),
        html: layout(t('Hubo un problema con tu pago'), t('No pudimos cobrar tu suscripción Pro con {provider}. Revisá tu medio de pago para no perder las funciones Pro.', { provider: esc(t(s(p.provider))) }), { label: t('Ver mi suscripción'), url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    case 'digest': {
      const items = (p.comments as { title: string; author: string; excerpt: string; idea_id: number }[] || []).slice(0, 20)
        .map((c) => `<li style="margin:0 0 10px">${t('{author} en {idea}', { author: b(c.author), idea: `<a href="${SITE_URL}/app/b/${s(p.slug)}/idea/${c.idea_id}" style="color:#059669">${esc(c.title)}</a>` })}<br><span style="color:rgba(0,0,0,0.6)">${esc(c.excerpt)}</span></li>`).join('');
      const n = (p.comments as unknown[] || []).length;
      return {
        subject: t(n === 1 ? '{n} comentario nuevo en {board}' : '{n} comentarios nuevos en {board}', { n, board: s(p.board_name) }),
        html: layout(t('Resumen diario de {board}', { board: esc(p.board_name) }), `<ul style="padding-left:18px;margin:0">${items}</ul>`, { label: t('Ir al buzón'), url: boardLink(p) }),
      };
    }
    case 'admin_new_client':
      return {
        subject: `Nuevo cliente: ${s(p.name)}`,
        html: layout('Nuevo cliente en Boxinger', `<b>${esc(p.name)}</b> (${esc(p.email)}) creó el equipo <b>${esc(p.team)}</b>${p.by_admin ? ' desde el panel de Admin' : ''}.`, { label: 'Ver clientes', url: `${SITE_URL}/app/admin?tab=clientes` }, 'Notificación del panel de Admin de plataforma.'),
      };
    case 'admin_payfail':
      return {
        subject: `Pago fallido: ${s(p.name)}`,
        html: layout('Falló el cobro de una suscripción Pro', `No se pudo cobrar la suscripción de <b>${esc(p.name)}</b> (${esc(p.email)}) con ${esc(p.provider)}.`, { label: 'Ver suscripciones', url: `${SITE_URL}/app/admin?tab=suscripciones` }, 'Notificación del panel de Admin de plataforma.'),
      };
    case 'admin_churn':
      return {
        subject: `Riesgo alto de churn: ${s(p.name)}`,
        html: layout('Suscripción Pro sin actividad', `<b>${esc(p.name)}</b> (${esc(p.email)}) lleva ${esc(p.days)} días sin actividad en sus buzones.`, { label: 'Ver dashboard', url: `${SITE_URL}/app/admin` }, 'Notificación del panel de Admin de plataforma.'),
      };
    case 'admin_weekly':
      return {
        subject: 'Resumen semanal de Boxinger',
        html: layout('Resumen de la semana',
          `<ul style="padding-left:18px;margin:0;line-height:1.8"><li>Cuentas nuevas: <b>${s(p.new_accounts)}</b> (total ${s(p.accounts)})</li><li>Buzones nuevos: <b>${s(p.new_boards)}</b></li><li>Ideas: ${s(p.ideas)} · Votos: ${s(p.votes)} · Comentarios: ${s(p.comments)}</li><li>Suscripciones Pro: <b>${s(p.pro)}</b></li><li>MRR: USD ${fmtPrice(Number(p.mrr_usd))} · ARS ${fmtPrice(Number(p.mrr_ars))}</li></ul>`,
          { label: 'Abrir el panel', url: `${SITE_URL}/app/admin` }, 'Notificación del panel de Admin de plataforma.'),
      };
    case 'contact': {
      if (s(p.topic) === 'arrepentimiento') {
        const code = withdrawalCode(p.id);
        return {
          subject: `[Arrepentimiento] ${code} · ${s(p.name)}`,
          html: layout(`Solicitud de arrepentimiento ${code}`,
            `<p style="margin:0 0 12px"><b>${esc(p.name)}</b> (${esc(p.email)}) pidió revocar la contratación de Pro con el botón de arrepentimiento. Ya recibió el código <b>${code}</b> por email.</p>` +
            `<p style="margin:0 0 12px">Revisá que esté dentro de los 10 días corridos desde el pago, cancelá la suscripción (Panel de Admin › la cuenta › plan Free) y hacé el reembolso total desde Creem o Mercado Pago. Después respondé este email para confirmarle.</p>` +
            (p.company ? `<p style="margin:0 0 12px">Email de la cuenta de Boxinger: <b>${esc(p.company)}</b></p>` : '') + quote(p.message),
            undefined, `Solicitud #${s(p.id)} del botón de arrepentimiento de boxinger.com.`),
        };
      }
      const topic = CONTACT_TOPICS[s(p.topic) as ContactTopic] || 'Consulta';
      const row = (k: string, v: unknown) => (v ? `<tr><td style="padding:4px 16px 4px 0;color:rgba(0,0,0,0.45);white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>` : '');
      return {
        subject: `[${topic}] ${s(p.name)}${p.company ? ' · ' + s(p.company) : ''}`,
        html: layout(`Nueva consulta: ${esc(topic)}`,
          `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">${row('Nombre', p.name)}${row('Email', p.email)}${row('Empresa', p.company)}${row('Tamaño del equipo', p.team_size)}${row('Cuenta', p.account)}</table>${quote(p.message)}`,
          undefined, `Mensaje #${s(p.id)} del formulario de contacto de boxinger.com. Respondé este email para contestarle a ${esc(p.email)}.`),
      };
    }
    case 'arrepentimiento_ack': {
      const code = withdrawalCode(p.id);
      return {
        subject: t('Recibimos tu solicitud de arrepentimiento ({code})', { code }),
        html: layout(t('Recibimos tu solicitud de arrepentimiento'),
          t('Hola {name}, recibimos tu pedido para revocar la contratación del plan Pro de Boxinger.', { name: esc(p.name) }) + '<br><br>' +
          t('Tu código de solicitud es {code}. Guardalo para cualquier consulta.', { code: `<b>${code}</b>` }) + '<br><br>' +
          t('Vamos a cancelar la suscripción y hacer el reembolso total por el mismo medio de pago. Te escribimos cuando esté hecho.'),
          undefined, t('Recibís este email porque usaste el botón de arrepentimiento de boxinger.com. Si no fuiste vos, respondé este email.')),
      };
    }
    default:
      return { subject: 'Boxinger', html: layout('Boxinger', esc(JSON.stringify(p))) };
  }
}
