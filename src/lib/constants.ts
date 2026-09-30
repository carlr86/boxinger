// Labels and colors from the Boxinger prototype (design/Boxinger.dc.html).

export type Tone = { l: string; bg: string; bd: string; fg: string };

export const PRIMARY = '#059669';
export const PRIMARY_HOVER = '#047857';
export const PRIMARY_SOFT = '#d1fae5';

export const IDEA_STATUS: Record<string, Tone> = {
  pendiente: { l: 'Pendiente de revisión', bg: '#fafafa', bd: '#d9d9d9', fg: 'rgba(0,0,0,0.88)' },
  en_revision: { l: 'En revisión', bg: '#fff7e6', bd: '#ffd591', fg: '#d46b08' },
  aprobada: { l: 'Aprobada', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' },
  rechazada: { l: 'Rechazada', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' },
};
export const STATUS_KEYS = ['pendiente', 'en_revision', 'aprobada', 'rechazada'] as const;

export const ORIGIN: Record<string, Tone> = {
  equipo: { l: 'Equipo', bg: '#eff6ff', bd: '#93c5fd', fg: '#3b82f6' },
  comunidad: { l: 'Comunidad', bg: '#f9f0ff', bd: '#d3adf7', fg: '#531dab' },
};

export const VOTE: Record<string, string> = { importante: 'Importante', interesante: 'Interesante', no_importante: 'No importante' };
export const VOTE_KEYS = ['importante', 'interesante', 'no_importante'] as const;

export const PRIO: Record<string, Tone> = {
  alta: { l: 'Alta', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' },
  media: { l: 'Media', bg: '#fffbe6', bd: '#ffe58f', fg: '#ad6800' },
  baja: { l: 'Baja', bg: '#f0f3f8', bd: '#c3cedf', fg: '#4a5d7e' },
};
export const NO_PRIO: Tone = { l: 'Sin definir', bg: '#fafafa', bd: '#d9d9d9', fg: 'rgba(0,0,0,0.45)' };

export const DEV: Record<string, Tone> = {
  por_empezar: { l: 'Por empezar', bg: '#fafafa', bd: '#d9d9d9', fg: 'rgba(0,0,0,0.65)' },
  en_curso: { l: 'En desarrollo', bg: '#e6f4ff', bd: '#91caff', fg: '#0958d9' },
  lanzada: { l: 'Lanzada', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' },
};

export const RM_COLS = [
  { k: 'ahora', l: 'Ahora', bg: '#f0f6ff', cbg: '#e6f4ff', cbd: '#91caff', cfg: '#0958d9' },
  { k: 'siguiente', l: 'Siguiente', bg: '#fffcf0', cbg: '#fffbe6', cbd: '#ffe58f', cfg: '#ad6800' },
  { k: 'despues', l: 'Más adelante', bg: '#fbf7ff', cbg: '#f9f0ff', cbd: '#d3adf7', cfg: '#531dab' },
  { k: 'no', l: 'No se hará', bg: '#f7f7f7', cbg: '#fafafa', cbd: '#d9d9d9', cfg: 'rgba(0,0,0,0.65)' },
] as const;

export const RATE_L = ['Sin calificar', 'Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'];
export const RATE_C = { impact: '#7aa7f5', effort: '#f5917e' } as const;

export const OK: Tone = { l: 'Activa', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' };
export const BAD: Tone = { l: 'Suspendida', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' };
export const PRO_TAG: Tone = { l: 'Pro', bg: '#d1fae5', bd: '#a9cbc2', fg: '#059669' };
export const FREE_TAG: Tone = { l: 'Free', bg: '#f0f3f8', bd: '#c3cedf', fg: '#4a5d7e' };
export const ENTERPRISE_TAG: Tone = { l: 'Enterprise', bg: '#eef2ff', bd: '#c7d2fe', fg: '#4338ca' };
/** Tag tone for a plan name ('free' | 'pro' | 'enterprise', any case). */
export const planTone = (p?: string | null): Tone => {
  const k = (p || '').toLowerCase();
  return k === 'enterprise' ? ENTERPRISE_TAG : k === 'pro' ? PRO_TAG : FREE_TAG;
};
export const CONTACT_TOPICS = { general: 'Consulta general', enterprise: 'Plan Enterprise', soporte: 'Soporte' } as const;
export type ContactTopic = keyof typeof CONTACT_TOPICS;
export const WARN: Tone = { l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' };
export const INFO: Tone = { l: '', bg: '#e6f4ff', bd: '#91caff', fg: '#0958d9' };
export const NEUTRAL: Tone = { l: '', bg: '#fafafa', bd: '#d9d9d9', fg: 'rgba(0,0,0,0.65)' };

export const SHADOW_POP = '0 6px 16px 0 rgba(0,0,0,0.08),0 3px 6px -4px rgba(0,0,0,0.12),0 9px 28px 8px rgba(0,0,0,0.05)';
export const TEXT = 'rgba(0,0,0,0.88)';
export const TEXT2 = 'rgba(0,0,0,0.65)';
export const TEXT3 = 'rgba(0,0,0,0.45)';
export const BORDER = '#f0f0f0';
export const MAX_MEMBERS = 4;

export const GROWTH: Record<string, Tone> = {
  adquisicion: { l: 'Adquisición', bg: '#e6f4ff', bd: '#91caff', fg: '#0958d9' },
  activacion: { l: 'Activación', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' },
  retencion: { l: 'Retención', bg: '#f9f0ff', bd: '#d3adf7', fg: '#531dab' },
  monetizacion: { l: 'Monetización', bg: '#fffbe6', bd: '#ffe58f', fg: '#ad6800' },
  churn: { l: 'Prevenir churn', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' },
};
export const GROWTH_KEYS = ['adquisicion', 'activacion', 'retencion', 'monetizacion', 'churn'] as const;

/** PayPal checkout on/off. Off while PayPal reviews the merchant account (limited since 2026-09-30). */
export const PAYPAL_ENABLED = false;

/** Board visibility, in the order it is offered. */
export const VISIBILITY: Record<import('./types').Visibility, { l: string; d: string; short: string }> = {
  invite: { l: 'Solo invitados', short: 'Solo el Equipo y sus invitados lo ven.', d: 'Lo ven el Equipo y las personas que invitás por email (o con un email del dominio que permitas). Si el link le llega a otra persona, no ve nada.' },
  public: { l: 'Público', short: 'Cualquiera con el link ve las ideas.', d: 'Cualquiera con el link ve las ideas. Quien se registra puede participar como Invitado.' },
  private: { l: 'Privado', short: 'Solo el Equipo con acceso lo ve.', d: 'Solo el Equipo con acceso lo ve. Sirve para ideas internas antes de abrirlas a la Comunidad.' },
};
export const VISIBILITY_ORDER = ['invite', 'public', 'private'] as const;
