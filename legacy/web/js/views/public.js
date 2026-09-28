// Public boards: Finalists by cycle and the Roadmap.
import { html, api, bindActions } from '../ui.js';
import { t, cycleLabel, periodLabel } from '../i18n.js';
import { originBadge, statusBadge, voteFlow, progress } from '../components.js';

export async function finalists(el) {
  const data = await api('/finalists');
  el.innerHTML = String(html`
    <h1>🏆 ${t('finalists_title')}</h1>
    <p class="muted">${t('finalists_intro')}</p>
    ${!data.groups.length ? html`<div class="empty">${t('finalists_empty')}</div>` : data.groups.map((g) => html`
      <section>
        <div class="section-title"><h2>${cycleLabel(g.cycle)}</h2></div>
        ${g.items.length ? g.items.map((i) => html`<article class="card idea">
          <div class="rank top" style="font-size:1.2rem;padding-top:0">#${i.position}</div>
          <div class="body">
            <h3><a href="#/idea/${i.id}">${i.title}</a></h3>
            <div class="meta">
              ${originBadge('comunidad')} ${statusBadge(i.state)}
              <span><strong>${i.score > 0 ? '+' : ''}${i.score}</strong> (${i.up} 👍 · ${i.down} 👎)</span>
              ${i.roadmap ? html`<span>→ ${t('st_' + i.roadmap.status)} · ${periodLabel(i.roadmap.period)}</span>` : ''}
            </div>
            ${i.reason ? html`<div class="alert danger mt small">${t('rejected_reason', { reason: i.reason })}</div>` : ''}
          </div>
        </article>`) : html`<div class="empty">—</div>`}
      </section>`)}`);
}

const COLUMNS = ['planificada', 'en_desarrollo', 'lanzada'];

export async function roadmap(el, ctx) {
  const f = { origin: ctx.query.origin || '', status: ctx.query.status || '', period: ctx.query.period || '' };
  let data;
  const load = async () => { data = await api('/roadmap?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v))); };
  await load();

  const draw = () => {
    const cols = f.status ? [f.status] : COLUMNS;
    el.innerHTML = String(html`
      <h1>🗺 ${t('roadmap_title')}</h1>
      <p class="muted">${t('roadmap_intro')}</p>
      <div class="filters">
        <select id="f-origin" aria-label="origin"><option value="">${t('all_origins')}</option>
          ${['equipo', 'comunidad'].map((o) => html`<option value="${o}" ${f.origin === o ? 'selected' : ''}>${t('origin_' + o)}</option>`)}</select>
        <select id="f-status" aria-label="status"><option value="">${t('all_statuses')}</option>
          ${COLUMNS.map((s) => html`<option value="${s}" ${f.status === s ? 'selected' : ''}>${t('st_' + s)}</option>`)}</select>
        <select id="f-period" aria-label="period"><option value="">${t('all_periods')}</option>
          ${data.periods.map((p) => html`<option value="${p}" ${f.period === p ? 'selected' : ''}>${periodLabel(p)}</option>`)}</select>
      </div>
      <div class="kanban" style="${cols.length === 1 ? 'grid-template-columns:1fr' : ''}">
        ${cols.map((s) => {
          const items = data.items.filter((i) => i.status === s);
          return html`<div class="column"><h3>${t('st_' + s)} <span class="badge">${items.length}</span></h3>
            ${items.length ? items.map(card) : html`<p class="muted small center">${t('roadmap_empty')}</p>`}</div>`;
        })}
      </div>`);
    ['origin', 'status', 'period'].forEach((k) => {
      el.querySelector('#f-' + k).onchange = async (e) => {
        f[k] = e.target.value;
        history.replaceState(null, '', '#/roadmap?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v)));
        await load(); draw();
      };
    });
  };

  bindActions(el, {
    vote: async (d) => {
      const item = data.items.find((x) => x.idea_id === +d.id);
      const r = await voteFlow({ id: item.idea_id, my_vote: item.my_vote, type: 'B' }, d.value);
      if (r) { await load(); draw(); }
    },
  });
  draw();
}

function card(i) {
  return html`<article class="card">
    <div class="row" style="margin-bottom:6px">${originBadge(i.origin)}
      ${i.cycle_number && i.origin === 'comunidad' ? html`<span class="badge outline">🏆 ${t('won_in', { n: i.cycle_number })}</span>` : ''}
      ${i.type === 'A' ? html`<span class="badge outline">✓ ${t('st_validada')}</span>` : ''}
      ${i.type === 'B' ? html`<span class="badge outline">${t('type_B')}</span>` : ''}</div>
    <h3 style="margin:0 0 4px"><a href="#/idea/${i.idea_id}" style="color:inherit">${i.title}</a></h3>
    <div class="muted small">📅 ${periodLabel(i.period)}</div>
    ${i.type === 'B' && i.can_vote ? html`<div class="choice mt">
      ${['importante', 'no_importante'].map((o) => html`<button class="btn sm ${i.my_vote === o ? 'selected' : ''}" data-action="vote"
        data-id="${i.idea_id}" data-value="${o}">${t('v_' + o)}</button>`)}</div>` : ''}
    ${i.counts ? html`<div class="small mt">${t('importance', { pct: i.counts.pct_importante })} · ${t('responses', { n: i.counts.responses })}
      ${progress(i.counts.pct_importante)}</div>` : ''}
  </article>`;
}

