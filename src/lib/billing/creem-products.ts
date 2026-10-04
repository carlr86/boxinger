import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import * as creem from './creem';
import { currentPrice } from './service';

// Creem product for each scheduled USD price. A product's price is fixed in Creem, so a new price (Admin ›
// Suscripciones › Programar nuevo precio) gets its own product the first time someone checks out, copied from the
// plan's previous product (name, description, taxes). Running subscriptions keep the price they started with.

/** The Creem product to sell `plan` at today's USD price (created on first use). */
export async function creemProductFor(plan: 'pro' | 'enterprise'): Promise<string> {
  const row = await currentPrice('USD', plan);
  if (row.creem_product_id) return row.creem_product_id;
  const admin = supabaseAdmin();
  const { data: prev } = await admin.from('price_schedule').select('creem_product_id').eq('plan', plan).eq('currency', 'USD')
    .not('creem_product_id', 'is', null).order('effective_from', { ascending: false }).limit(1).maybeSingle();
  const base = await creem.getProduct(prev?.creem_product_id || creem.baseProduct(plan));
  if (Math.round(Number(base.price)) === Math.round(row.amount * 100)) {
    await admin.from('price_schedule').update({ creem_product_id: base.id }).eq('id', row.id);
    return base.id;
  }
  const id = await creem.cloneProductWithPrice(base, row.amount);
  await admin.from('price_schedule').update({ creem_product_id: id }).eq('id', row.id);
  return id;
}

/** Which plan a Creem product sells (undefined when it isn't one of ours). */
export async function planOfProduct(productId: string | null | undefined): Promise<'pro' | 'enterprise' | undefined> {
  if (!productId) return undefined;
  const { data } = await supabaseAdmin().from('price_schedule').select('plan').eq('creem_product_id', productId).limit(1).maybeSingle();
  if (data?.plan === 'pro' || data?.plan === 'enterprise') return data.plan;
  if (productId === creem.baseProduct('enterprise')) return 'enterprise';
  if (productId === process.env.CREEM_PRODUCT_ID?.trim()) return 'pro';
  return undefined;
}
