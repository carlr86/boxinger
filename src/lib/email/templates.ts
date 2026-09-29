import { SITE_URL } from '@/lib/env';
import { fmtPrice } from '@/lib/format';

// Transactional emails, in Spanish. Each template gets the outbox payload
// written by the Postgres functions (see supabase/migrations).

type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const esc = (v: unknown) => s(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ideaUrl = (p: P) => `${SITE_URL}/app/b/${s(p.slug)}/idea/${s(p.idea_id)}`;
const boardLink = (p: P) => `${SITE_URL}/app/b/${s(p.slug)}`;
const STATUS: Record<string, string> = { pendiente: 'Pendiente de revisión', en_revision: 'En revisión', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const money = (cur: unknown, v: unknown) => `${s(cur) === 'ARS' ? 'ARS' : 'USD'} ${fmtPrice(Number(v))}`;
const date = (v: unknown) => new Date(s(v)).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });

function layout(title: string, body: string, cta?: { label: string; url: string }, foot?: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:rgba(0,0,0,0.88)">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #f0f0f0;border-radius:8px">
<tr><td style="padding:24px 32px;border-bottom:1px solid #f0f0f0"><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:6px;background:#059669;color:#fff;font-weight:700">B</span> <span style="font-weight:600;font-size:16px;vertical-align:middle;margin-left:8px">Boxinger</span></td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;font-weight:600">${title}</h1>
<div style="font-size:15px;line-height:1.6;color:rgba(0,0,0,0.75)">${body}</div>
${cta ? `<p style="margin:24px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:15px">${cta.label}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:rgba(0,0,0,0.45);line-height:1.5">${foot || `Recibís este email por tu actividad en Boxinger. Podés cambiar tus notificaciones en <a href="${SITE_URL}/app/perfil?tab=notif" style="color:#059669">Mi perfil</a>.`}</td></tr>
</table></td></tr></table></body></html>`;
}

const quote = (t: unknown) => `<blockquote style="margin:12px 0;padding:10px 14px;background:#fafafa;border-left:3px solid #a9cbc2;border-radius:4px;color:rgba(0,0,0,0.75)">${esc(t)}</blockquote>`;

export function render(template: string, p: P): { subject: string; html: string } {
  switch (template) {
    case 'idea_status': {
      const to = s(p.to);
      const body = `Tu idea <b>${esc(p.title)}</b> en ${esc(p.board_name)} pasó a <b>${STATUS[to] || to}</b>.` +
        (to === 'aprobada' ? ' Ahora forma parte del Backlog del equipo.' : '') +
        (to === 'rechazada' && p.reason ? `<br>Motivo del equipo:${quote(p.reason)}` : '');
      return { subject: `Tu idea ahora está: ${STATUS[to] || to}`, html: layout('Tu idea cambió de estado', body, { label: 'Ver la idea', url: ideaUrl(p) }) };
    }
    case 'new_comment':
      return {
        subject: `Nuevo comentario en "${s(p.title)}"`,
        html: layout('Comentaron tu idea', `<b>${esc(p.author)}</b> comentó tu idea <b>${esc(p.title)}</b>:${quote(p.excerpt)}`, { label: 'Responder', url: ideaUrl(p) }),
      };
    case 'team_reply':
      return {
        subject: `El Equipo respondió tu comentario en "${s(p.title)}"`,
        html: layout('El Equipo te respondió', `Comentaste:${quote(p.comment)}Respuesta del Equipo de ${esc(p.board_name)}:${quote(p.reply)}`, { label: 'Ver la conversación', url: ideaUrl(p) }),
      };
    case 'idea_launched':
      return {
        subject: `¡Se lanzó "${s(p.title)}"!`,
        html: layout('Una idea que votaste ya está disponible', `El Equipo de ${esc(p.board_name)} lanzó <b>${esc(p.title)}</b>. Gracias por ayudar a priorizarla.`, { label: 'Ver la idea', url: ideaUrl(p) }),
      };
    case 'invite_guest':
      return {
        subject: `${s(p.inviter) || 'El Equipo'} te invitó a ${s(p.board_name)}`,
        html: layout(`Te invitaron a ${esc(p.board_name)}`,
          `${esc(p.inviter) || 'El Equipo'} te invitó a la Comunidad del buzón de ideas <b>${esc(p.board_name)}</b>.` + (p.description ? quote(p.description) : '') + 'Vas a poder proponer ideas, votar y comentar.',
          { label: 'Aceptar invitación', url: `${SITE_URL}/app/invitacion/${s(p.token)}` }, 'Si no esperabas esta invitación, podés ignorar este email.'),
      };
    case 'invite_team':
      return {
        subject: `${s(p.inviter) || 'El Admin'} te invitó al equipo ${s(p.team_name)}`,
        html: layout(`Sumate al equipo ${esc(p.team_name)}`,
          `${esc(p.inviter) || 'El Admin'} te invitó como Miembro del equipo <b>${esc(p.team_name)}</b>${p.board_name ? ` para el buzón <b>${esc(p.board_name)}</b>` : ''} en Boxinger. Vas a poder cargar ideas del equipo, cambiar estados e invitar a la Comunidad.<br><br>La invitación vence en 7 días.`,
          { label: 'Aceptar invitación', url: `${SITE_URL}/app/invitacion/${s(p.token)}` }, 'Si no esperabas esta invitación, podés ignorar este email.'),
      };
    case 'client_activation':
      return {
        subject: 'Tu cuenta de Boxinger está lista',
        html: layout(`Hola${p.name ? ', ' + esc(s(p.name).split(' ')[0]) : ''}`,
          `Creamos tu cuenta en Boxinger con el buzón <b>${esc(p.board)}</b>. Activala para empezar a recibir ideas de tu comunidad. Al activarla creás tu contraseña o entrás con Google.<br><br>El link vence en 7 días.`,
          { label: 'Activar mi cuenta', url: `${SITE_URL}/app/activar/${s(p.token)}` }, 'Si no esperabas este email, escribinos a hola@boxinger.com.'),
      };
    case 'price_change':
      return {
        subject: 'Cambio en el precio del plan Pro',
        html: layout('Actualizamos el precio de Pro',
          `Desde el ${date(p.from)} el plan Pro pasa de ${money(p.currency, p.old)} a <b>${money(p.currency, p.new)}</b> por mes. El cambio se aplica en tu próxima renovación a partir de esa fecha. Podés cancelar cuando quieras desde tu perfil.`,
          { label: 'Ver mi suscripción', url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    case 'subscription_changed': {
      if (s(p.plan) === 'enterprise')
        return {
          subject: 'Tu cuenta ahora es Enterprise',
          html: layout('Bienvenido a Boxinger Enterprise', 'Tu cuenta pasó al plan <b>Enterprise</b>: todo lo de Pro, con miembros ilimitados en tus equipos y acceso anticipado a las nuevas funciones con IA.', { label: 'Ir a mis buzones', url: `${SITE_URL}/app/buzones` }),
        };
      const pro = s(p.plan) === 'pro';
      const deal = pro && p.deal_type ? ` con precio especial${p.deal_until ? ' hasta el ' + date(p.deal_until) : ''}` : '';
      return {
        subject: pro ? 'Tu plan Pro fue actualizado' : 'Tu cuenta pasó al plan Free',
        html: layout(pro ? 'Actualizamos tu suscripción' : 'Tu cuenta ahora es Free',
          pro ? `Tu plan es <b>Pro</b>${deal}: ${money(p.currency, p.amount)} por mes.` : 'Tu cuenta pasó al plan Free. Tus buzones siguen disponibles; los que superan el límite de Free quedan en solo lectura.',
          { label: 'Ver mi suscripción', url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    }
    case 'pro_welcome':
      return {
        subject: '¡Bienvenido a Boxinger Pro!',
        html: layout('Ya tenés Pro', 'Tu suscripción está activa. Ahora podés crear equipos y buzones ilimitados, sumar hasta 4 miembros por equipo y usar la Matriz, el Roadmap y Status.', { label: 'Ir a mis buzones', url: `${SITE_URL}/app/buzones` }),
      };
    case 'pro_cancelled':
      return {
        subject: 'Cancelaste tu suscripción Pro',
        html: layout('Tu suscripción Pro se canceló', `Seguís con Pro hasta el ${p.until ? date(p.until) : 'fin del período pagado'}. Después tu cuenta pasa a Free y los buzones extra quedan en solo lectura.`, { label: 'Volver a Pro', url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    case 'payment_failed':
      return {
        subject: 'No pudimos cobrar tu suscripción Pro',
        html: layout('Hubo un problema con tu pago', `No pudimos cobrar tu suscripción Pro con ${esc(p.provider)}. Revisá tu medio de pago para no perder las funciones Pro.`, { label: 'Ver mi suscripción', url: `${SITE_URL}/app/perfil?tab=sub` }),
      };
    case 'digest': {
      const items = (p.comments as { title: string; author: string; excerpt: string; idea_id: number }[] || []).slice(0, 20)
        .map((c) => `<li style="margin:0 0 10px"><b>${esc(c.author)}</b> en <a href="${SITE_URL}/app/b/${s(p.slug)}/idea/${c.idea_id}" style="color:#059669">${esc(c.title)}</a><br><span style="color:rgba(0,0,0,0.6)">${esc(c.excerpt)}</span></li>`).join('');
      const n = (p.comments as unknown[] || []).length;
      return {
        subject: `${n} ${n === 1 ? 'comentario nuevo' : 'comentarios nuevos'} en ${s(p.board_name)}`,
        html: layout(`Resumen diario de ${esc(p.board_name)}`, `<ul style="padding-left:18px;margin:0">${items}</ul>`, { label: 'Ir al buzón', url: boardLink(p) }),
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
    default:
      return { subject: 'Boxinger', html: layout('Boxinger', esc(JSON.stringify(p))) };
  }
}
