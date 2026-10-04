// What an account loses when Pro ends (and gets back by returning), from public.pro_usage().
// Shared by the cancel popup (Mi perfil) and the pro_ending / pro_ended emails. Texts are the
// Spanish source; the caller passes its t() (see src/lib/i18n).
import type { T } from '@/lib/i18n';

export type ProUsage = {
  kept: { id: string; name: string; ideas: number } | null;
  boards: { id: string; name: string; ideas: number; kept: boolean }[];
  locked_boards: { id: string; name: string; ideas: number }[];
  teams_locked: number; members: number; roadmap_ideas: number; rated_ideas: number; domains: number; private_boards: number;
};

const list = (names: string[]) => (names.length > 3 ? names.slice(0, 3).join(', ') + '…' : names.join(', '));

/** One line per thing that stops working on Free, most important first. */
export function proLosses(u: ProUsage, t: T, plan: string = 'pro'): string[] {
  const out: string[] = [];
  if (plan === 'enterprise') out.push(t('El Asistente IA: ideas nuevas sugeridas para tu producto y el análisis de qué ideas conviene aprobar.'));
  const lb = u.locked_boards;
  if (lb.length) {
    const ideas = lb.reduce((a, b) => a + Number(b.ideas), 0);
    out.push(lb.length === 1
      ? t('El buzón {names} ({n} ideas) queda en solo lectura: no se pueden cargar ideas, votar ni comentar.', { names: list(lb.map((b) => b.name)), n: ideas })
      : t('{count} buzones quedan en solo lectura ({names}, con {n} ideas): no se pueden cargar ideas, votar ni comentar.', { count: lb.length, names: list(lb.map((b) => b.name)), n: ideas }));
  }
  if (u.members > 0) out.push(u.members === 1 ? t('1 miembro de tu equipo queda pausado y no puede entrar.') : t('{n} miembros de tu equipo quedan pausados y no pueden entrar.', { n: u.members }));
  if (u.teams_locked > 0) out.push(u.teams_locked === 1 ? t('1 equipo extra queda bloqueado.') : t('{n} equipos extra quedan bloqueados.', { n: u.teams_locked }));
  out.push(u.roadmap_ideas > 0
    ? t('El Roadmap, con {n} ideas planificadas.', { n: u.roadmap_ideas })
    : t('El Roadmap para planificar qué hacer ahora, después y más adelante.'));
  out.push(u.rated_ideas > 0
    ? t('La Matriz de esfuerzo e impacto, con {n} ideas calificadas.', { n: u.rated_ideas })
    : t('La Matriz de esfuerzo e impacto para priorizar.'));
  out.push(t('Status: cuántas ideas se aprueban, se desarrollan y se lanzan.'));
  if (u.domains > 0) out.push(u.domains === 1 ? t('El acceso por dominio de email (1 dominio).') : t('El acceso por dominio de email ({n} dominios).', { n: u.domains }));
  out.push(t('Las solicitudes de acceso a tus buzones solo para invitados.'));
  return out;
}

/** What stays: the board that keeps working on Free. */
export function proKeeps(u: ProUsage, t: T): string {
  return u.kept
    ? t('Sigue activo el buzón {name}, con sus ideas, votos y comentarios. Nada se borra.', { name: u.kept.name })
    : t('Nada se borra: todo queda guardado.');
}
