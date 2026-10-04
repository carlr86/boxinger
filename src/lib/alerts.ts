import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CONTACT_TO, sendDirect } from '@/lib/email/contact';
import { SITE_URL } from '@/lib/env';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Same kind of error, same fingerprint: numbers, ids and quoted values don't make it a new one. */
function fingerprint(source: string, message: string, where?: string): string {
  const norm = message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#').replace(/\d+/g, '#').replace(/"[^"]*"|'[^']*'/g, '…').slice(0, 300);
  return source + ':' + createHash('sha1').update(norm + '|' + (where || '')).digest('hex').slice(0, 16);
}

/**
 * Records a production error and emails the platform admin (at most every 6 hours per error).
 * Never throws: reporting must not break the request that failed.
 */
export async function reportError(source: string, error: unknown, detail: Record<string, unknown> = {}, where?: string): Promise<void> {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
  const message = e.message || String(error);
  console.error(`[${source}]`, message, detail, e.stack);
  if (process.env.NODE_ENV !== 'production' && !process.env.REPORT_ERRORS) return;
  try {
    const info = { ...detail, stack: e.stack?.split('\n').slice(0, 8).join('\n') };
    const { data: notify } = await supabaseAdmin().rpc('record_app_error', {
      p_source: source, p_message: message, p_detail: info, p_fingerprint: fingerprint(source, message, where),
    });
    if (!notify) return;
    const rows = Object.entries(info).filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#888;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(typeof v === 'string' ? v : JSON.stringify(v))}</td></tr>`).join('');
    await sendDirect({
      to: CONTACT_TO(),
      subject: `[Boxinger] Error en ${source}: ${message.slice(0, 80)}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#222"><p><b>${esc(message)}</b></p><table>${rows}</table>
<p style="color:#888">Si se repite, no te llega otro email por este error durante 6 horas. Lo ves en el <a href="${SITE_URL}/app/admin">Panel de Admin</a>, donde lo podés marcar como resuelto.</p></div>`,
      text: `${message}\n\n${JSON.stringify(info, null, 2)}`,
    });
  } catch (inner) {
    console.error('reportError failed', inner);
  }
}
