'use client';
import type { BoardData, Category, Idea } from '@/lib/types';

export type IdeaDraft = { title: string; description: string; category_id: string; ai?: boolean; suggestion?: string };

export type View = 'buzon' | 'ranking' | 'backlog' | 'afinidad' | 'matriz' | 'roadmap' | 'status' | 'novedades' | 'config';

export interface BoardApi {
  data: BoardData;
  isTeam: boolean;
  isAdmin: boolean;
  canCreate: boolean;
  pro: boolean;
  canWrite: boolean;
  me: BoardData['me'];
  catL: (id: string) => string;
  voteL: (k: string) => string; // vote option name for this board
  cats: Category[];
  reload: () => Promise<void>;
  patchIdea: (id: number, patch: Partial<Idea>) => void;
  openIdea: (id: number) => void;
  goLogin: (alert?: boolean) => void;
  goPro: () => void;
  setView: (v: View) => void;
  openNew: () => void;
  /** New idea form filled in (AI suggestions); onDone runs once it is published. */
  openNewWith: (draft: IdeaDraft, onDone?: () => void) => void;
  openEdit: (i: Idea) => void;
  askReject: (id: number) => void;
  setStatus: (id: number, st: string) => void;
  vote: (id: number, value: string | null) => Promise<void>;
  run: <T>(p: Promise<T>, ok?: string) => Promise<T | undefined>;
}

export type VoteMode = 'closed' | 'login' | 'own' | 'can';

export function voteMode(api: Pick<BoardApi, 'me'>, i: Idea): VoteMode {
  if (i.status !== 'pendiente' && i.status !== 'en_revision') return 'closed';
  if (!api.me) return 'login';
  if (i.author_id === api.me.id) return 'own';
  return 'can';
}

export const rateOf = (i: Idea, k: 'impact' | 'effort') => (k === 'impact' ? i.impact : i.effort) || 0;

/** Matrix quadrant name and hint (Spanish source; screens show them through t()). */
export function quadrant(imp: number, eff: number): [string, string] | null {
  if (!imp || !eff) return null;
  if (imp >= 4 && eff <= 2) return ['Victoria rápida', 'Alto impacto con poco esfuerzo. Buena candidata para priorizar.'];
  if (imp >= 4) return ['Gran apuesta', 'Alto impacto, pero requiere bastante esfuerzo.'];
  if (eff <= 2) return ['Mejora menor', 'Poco esfuerzo y poco impacto.'];
  return ['Revisar', 'Mucho esfuerzo para el impacto esperado.'];
}

/** The board uses Impact / Effort (Matrix, Value) and Growth: each Admin can turn them off (both on by default). */
/** The vote options of this board's scale (three options, 1 to 5 stars, or a single «me gusta»). */
export const voteOptions = (api: Pick<BoardApi, 'data'>): string[] =>
  api.data.board.vote_scale === 'cinco' ? ['5', '4', '3', '2', '1'] : api.data.board.vote_scale === 'like' ? ['like'] : ['importante', 'interesante', 'no_importante'];
export const usesRating = (api: BoardApi) => usesModule(api, 'rating');
export const usesGrowth = (api: BoardApi) => usesModule(api, 'growth');
export const usesMrr = (api: BoardApi) => usesModule(api, 'mrr');
export const usesSegments = (api: BoardApi) => usesModule(api, 'segments');
/** MRR / segments rows on the cards of the Buzón, Roadmap and Matrix: the team, on a paid plan, when the Admin turned it on. */
export const customerOnCards = (api: BoardApi) => api.isTeam && api.pro && !!api.data.board.segments_on_cards && (usesMrr(api) || usesSegments(api));
/** Whether the board shows a module (its type and the Admin decide; boards from before types have them all). */
export const usesModule = (api: Pick<BoardApi, 'data'>, k: string) => {
  const b = api.data.board;
  if (b.modules && k in b.modules) return !!b.modules[k];
  return k === 'rating' ? b.use_rating !== false : k === 'growth' ? b.use_growth !== false : !['affinity', 'mrr', 'segments'].includes(k);
};

export const scoreOf = (i: Idea) => {
  const imp = rateOf(i, 'impact'), eff = rateOf(i, 'effort');
  return imp && eff ? Math.round(((imp * Math.max(1, i.score || 0)) / eff) * 10) / 10 : null;
};
