-- Boxinger · AI costs at the real Sonnet 5.5 price (USD 2 in / 10 out per million tokens; the first runs used 3 / 15).
update public.ai_runs set cost_usd = round((input_tokens * 2 + output_tokens * 10) / 1e6, 5)
where model like 'claude-sonnet-5-5%';
