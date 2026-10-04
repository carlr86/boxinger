import 'server-only';
import { cleanEnv, requireEnv } from '@/lib/env';

// Claude (Anthropic) for the Enterprise AI assistant. Docs: docs.anthropic.com/en/api/messages
// The key lives in ANTHROPIC_API_KEY; the model and its price per million tokens can be changed by env
// without touching code (check anthropic.com/pricing when changing the model).
export const aiConfigured = () => !!cleanEnv(process.env.ANTHROPIC_API_KEY);
export const AI_MODEL = () => cleanEnv(process.env.ANTHROPIC_MODEL) || 'claude-sonnet-5-5';
// Sonnet 5.5 list price (claude.com/pricing, Oct 2026): USD 2 in / USD 10 out per million tokens.
const PRICE_IN = () => Number(cleanEnv(process.env.AI_PRICE_IN_USD) || 2); // per million input tokens
const PRICE_OUT = () => Number(cleanEnv(process.env.AI_PRICE_OUT_USD) || 10); // per million output tokens

export type Schema = Record<string, unknown>;
export type AiResult<T> = { data: T; model: string; inputTokens: number; outputTokens: number; costUsd: number };

/**
 * One call whose reply is JSON matching `schema` (structured outputs: objects need additionalProperties false,
 * and length limits are enforced by the caller, not the schema). Waits up to 60 s and retries once when Anthropic is busy.
 */
export async function askJson<T>(o: { system: string; user: string; schema: Schema; maxTokens?: number }): Promise<AiResult<T>> {
  const model = AI_MODEL();
  const body = JSON.stringify({
    model,
    max_tokens: o.maxTokens ?? 4000,
    system: o.system,
    messages: [{ role: 'user', content: o.user }],
    output_config: { format: { type: 'json_schema', schema: o.schema } },
  });
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': requireEnv('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    if (r.status === 429 || r.status === 529 || r.status >= 500) { last = `Anthropic ${r.status} ${text.slice(0, 300)}`; continue; }
    if (!r.ok) throw new Error(`Anthropic ${r.status} ${text.slice(0, 300)}`);
    const j = JSON.parse(text);
    const out = (j.content || []).find((c: { type: string }) => c.type === 'text')?.text;
    if (!out || j.stop_reason === 'max_tokens') throw new Error(`Anthropic: respuesta incompleta (stop_reason ${j.stop_reason})`);
    const inputTokens = Number(j.usage?.input_tokens || 0), outputTokens = Number(j.usage?.output_tokens || 0);
    return {
      data: JSON.parse(out) as T, model: j.model || model, inputTokens, outputTokens,
      costUsd: Math.round(((inputTokens * PRICE_IN() + outputTokens * PRICE_OUT()) / 1e6) * 1e5) / 1e5,
    };
  }
  throw new Error(last || 'Anthropic no respondió');
}
