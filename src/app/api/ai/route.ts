import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getLocale } from '@/lib/i18n/server';
import { aiConfigured, askJson } from '@/lib/ai/claude';
import { cleanRank, cleanSuggestions, rankPrompt, suggestPrompt, type RankResult, type Snapshot, type Suggestion } from '@/lib/ai/prompts';
import { reportError } from '@/lib/alerts';

export const maxDuration = 120;

/** Enterprise AI assistant: { board, kind: 'suggest' | 'rank' } → the result, also stored as the board's last one. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const board = typeof body?.board === 'string' ? body.board : '';
  const kind = body?.kind === 'suggest' || body?.kind === 'rank' ? body.kind : null;
  if (!board || !kind) return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ error: 'El asistente de IA todavía no está configurado.' }, { status: 503 });

  const admin = supabaseAdmin();
  const { data: snap, error } = await admin.rpc('ai_begin', { p_board: board, p_uid: user.id, p_kind: kind });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 }); // plan, permissions, limits, missing description
  const s = snap as Snapshot;
  const locale = await getLocale();

  try {
    let result: { suggestions: Suggestion[] } | RankResult;
    let usage;
    if (kind === 'suggest') {
      const r = await askJson<{ ideas: Suggestion[] }>({ ...suggestPrompt(s, locale), maxTokens: 3000 });
      result = { suggestions: cleanSuggestions(r.data, s) };
      usage = r;
      if (!result.suggestions.length) throw new Error('La IA no devolvió sugerencias válidas');
    } else {
      const r = await askJson<RankResult>({ ...rankPrompt(s, locale), maxTokens: 3000 });
      result = cleanRank(r.data, s);
      usage = r;
    }
    await admin.rpc('ai_finish', {
      p_board: board, p_uid: user.id, p_kind: kind, p_model: usage.model,
      p_in: usage.inputTokens, p_out: usage.outputTokens, p_cost: usage.costUsd, p_result: result,
    });
    return NextResponse.json({ ok: true, at: new Date().toISOString(), result });
  } catch (e) {
    await reportError('asistente-ia', e, { kind, board, ideas: s.ideas.length });
    return NextResponse.json({ error: 'No pudimos usar el asistente ahora. Probá de nuevo en unos minutos.' }, { status: 502 });
  }
}
