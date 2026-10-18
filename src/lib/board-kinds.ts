// Board kinds: how a board starts. «En blanco» (the Admin turns modules on) or a category › type whose modules come
// set up (fixed ones can't be turned off). The module rules live in Postgres (board_kind_modules, migration 061);
// this is the catalogue the app shows. Types marked 'soon' are shown as «Próximamente» and can't be picked yet.
export type BoardKind = 'producto' | 'brainstorm' | 'blank';
export type KindStatus = 'ready' | 'soon';
export type KindType = { k: string; l: string; d: string; status: KindStatus; pro?: boolean };
export type KindCategory = { k: string; l: string; d: string; status: KindStatus; types: KindType[] };

export const BLANK = { k: 'blank' as const, l: 'Buzón en blanco', d: 'Armalo a tu medida: elegí los módulos en la configuración.' };

export const KIND_CATEGORIES: KindCategory[] = [
  {
    k: 'producto', l: 'Producto', d: 'Para equipos que construyen un producto.', status: 'ready',
    types: [
      { k: 'producto', l: 'Producto digital', d: 'Escuchá a los usuarios de tu producto, priorizá y planificá en el Roadmap.', status: 'ready' },
      { k: 'brainstorm', l: 'Brainstorming', d: 'Tu equipo piensa ideas, las vota, las agrupa y decide cuáles hacer.', status: 'ready', pro: true },
      { k: 'feedback', l: 'Feedback de clientes', d: 'Opiniones de tus clientes sobre tu servicio o tu local.', status: 'soon' },
      { k: 'reclamos', l: 'Reclamos', d: 'Reclamos privados con número de caso y seguimiento.', status: 'soon' },
    ],
  },
  { k: 'equipos', l: 'Equipos de trabajo', d: 'Ideas de empleados y mejora continua.', status: 'soon', types: [] },
  { k: 'comunidades', l: 'Comunidades', d: 'Creadores, clubes, escuelas y barrios.', status: 'soon', types: [] },
  { k: 'eventos', l: 'Eventos', d: 'Preguntas y temas para charlas y encuentros.', status: 'soon', types: [] },
  { k: 'publico', l: 'Sector público', d: 'Participación ciudadana y propuestas por zona.', status: 'soon', types: [] },
];

/** Display name of a board's type. */
export const kindLabel = (k?: string | null) => (k === 'blank' ? BLANK.l : KIND_CATEGORIES.flatMap((c) => c.types).find((x) => x.k === k)?.l || 'Producto digital');

/** Modules as Postgres names them, with their label and what they are. */
export const MODULES: { k: string; l: string; d: string; pro?: boolean }[] = [
  { k: 'ranking', l: 'Ranking', d: 'Las 10 ideas pendientes con más votos.' },
  { k: 'backlog', l: 'Backlog', d: 'Las ideas aprobadas, candidatas para hacer.' },
  { k: 'rating', l: 'Impacto y esfuerzo', d: 'Calificá cada idea de 1 a 5 y ordená con la Matriz y el Valor del Roadmap.', pro: true },
  { k: 'growth', l: 'Growth', d: 'Marcá a qué objetivo apunta cada idea: adquisición, activación, retención, monetización o churn.', pro: true },
  { k: 'roadmap', l: 'Roadmap', d: 'Qué se hace ahora, después y más adelante.', pro: true },
  { k: 'status', l: 'Status', d: 'Métricas de lo que pasó con las ideas.', pro: true },
  { k: 'changelog', l: 'Novedades', d: 'La página de lanzamientos del buzón.', pro: true },
  { k: 'affinity', l: 'Agrupar por afinidad', d: 'Arrastrá las ideas votadas a grupos con nombre (exclusivo de Brainstorming).', pro: true },
];
