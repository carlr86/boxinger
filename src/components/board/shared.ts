'use client';
import type { BoardData, Category, Idea } from '@/lib/types';

export type View = 'buzon' | 'ranking' | 'backlog' | 'matriz' | 'roadmap' | 'status' | 'config';

export interface BoardApi {
  data: BoardData;
  isTeam: boolean;
  isAdmin: boolean;
  pro: boolean;
  canWrite: boolean;
  me: BoardData['me'];
  catL: (id: string) => string;
  cats: Category[];
  reload: () => Promise<void>;
  patchIdea: (id: number, patch: Partial<Idea>) => void;
  openIdea: (id: number) => void;
  goLogin: (alert?: boolean) => void;
  goPro: () => void;
  setView: (v: View) => void;
  openNew: () => void;
  openEdit: (i: Idea) => void;
  askReject: (id: number) => void;
  setStatus: (id: number, st: string) => void;
  vote: (id: number, value: string | null) => Promise<void>;
  run: <T>(p: Promise<T>, ok?: string) => Promise<T | undefined>;
}

export type VoteMode = 'closed' | 'login' | 'none' | 'own' | 'can';

export function voteMode(api: Pick<BoardApi, 'me' | 'isTeam'>, i: Idea): VoteMode {
  if (i.status !== 'pendiente' && i.status !== 'en_revision') return 'closed';
  if (!api.me) return 'login';
  if (api.isTeam && i.origin === 'equipo') return 'none';
  if (i.author_id === api.me.id) return 'own';
  return 'can';
}

export const rateOf = (i: Idea, k: 'impact' | 'effort') => (k === 'impact' ? i.impact : i.effort) || 0;

export function quadrant(imp: number, eff: number): [string, string] | null {
  if (!imp || !eff) return null;
  if (imp >= 4 && eff <= 2) return ['Victoria rápida', 'Alto impacto con poco esfuerzo. Buena candidata para priorizar.'];
  if (imp >= 4) return ['Gran apuesta', 'Alto impacto, pero requiere bastante esfuerzo.'];
  if (eff <= 2) return ['Mejora menor', 'Poco esfuerzo y poco impacto.'];
  return ['Revisar', 'Mucho esfuerzo para el impacto esperado.'];
}

export const scoreOf = (i: Idea) => {
  const imp = rateOf(i, 'impact'), eff = rateOf(i, 'effort');
  return imp && eff ? Math.round(((imp * Math.max(1, i.score || 0)) / eff) * 10) / 10 : null;
};
