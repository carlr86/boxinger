// Board home: cycle header with countdown, tabs Comunidad / Del equipo / No finalistas, live ranking.
import { html, api, bindActions, debounce, isModalOpen } from '../ui.js';
import { t, cycleLabel, fmtDateTime } from '../i18n.js';
import { store } from '../store.js';
import { ideaCard, voteFlow, claimFlow } from '../components.js';

const POLL_MS = 4000; // ranking refreshes in under 5 s

export function cycleHero(cycle) {
  if (!cycle) return html`<section class="cycle-hero"><div><h1>${t('no_cycle')}</h1></div></section>`;
  const scheduled = cycle.status === 'programado';
  return html`<section class="cycle-hero">
    <div>
      <div class="sub">${scheduled ? t('cycle_scheduled') : html`<span class="live-dot"></span> ${t('live')}`}</div>
      <h1>${cycleLabel(cycle)}</h1>
      <div class="sub">${scheduled ? t('cycle_starts', { date: fmtDateTime(cycle.starts_at) }) : t('cycle_closes', { date: fmtDateTime(cycle.ends_at) })}</div>
    </div>
    <div class="countdown" data-countdown="${scheduled ? cycle.starts_at : cycle.ends_at}"></div>
    ${scheduled ? '' : html`<a class="btn" href="#/proponer">＋ ${t('propose')}</a>`}
  </section>`;
}

export async function render(el, ctx) {
  const tab = ctx.tab;
  const cats = store.state.board.settings.categories || [];
  const f = { q: ctx.query.q || '', category: ctx.query.category || '', sort: ctx.query.sort || '' };
  let data = await api('/ideas?' + new URLSearchParams({ tab, ...f }));
  const counts = {};

  const tabLink = (id, href, label) => html`<a href="#${href}" class="${tab === id ? 'active' : ''}">${label}${
    counts[id] != null ? html`<span class="count">${counts[id]}</span>` : ''}</a>`;

  el.innerHTML = String(html`
    ${cycleHero(data.cycle)}
    <nav class="tabs" id="tabs"></nav>
    <div class="filters">
      <input type="search" id="q" placeholder="${t('search')}" value="${f.q}" aria-label="${t('search')}">
      <select id="cat" aria-label="${t('category')}">
        <option value="">${t('all_categories')}</option>
        ${cats.map((c) => html`<option ${f.category === c ? 'selected' : ''}>${c}</option>`)}
      </select>
      ${tab === 'comunidad' ? html`<select id="sort" aria-label="sort">
        <option value="">${t('sort_ranking')}</option>
        <option value="recientes" ${f.sort === 'recientes' ? 'selected' : ''}>${t('sort_recent')}</option></select>` : ''}
    </div>
    ${tab === 'nofinalistas' && data.cycle ? html`<p class="muted small">❄️ ${t('claim_hint', { n: data.cycle.supports_required })}</p>` : ''}
    <div id="list"></div>`);

  const listEl = el.querySelector('#list');
  const drawTabs = () => {
    el.querySelector('#tabs').innerHTML = String(html`${tabLink('comunidad', '/', t('tab_community'))}${tabLink('equipo', '/equipo', t('tab_team'))}${tabLink('nofinalistas', '/nofinalistas', t('tab_nonfinalists'))}`);
  };
  const drawList = () => {
    counts[tab] = data.items.length;
    drawTabs();
    if (!data.items.length) {
      listEl.innerHTML = String(html`<div class="empty">${t('empty_' + { comunidad: 'community', equipo: 'team', nofinalistas: 'nonfinalists' }[tab])}</div>`);
      return;
    }
    listEl.innerHTML = String(html`${data.items.map((i) => ideaCard(i, { showRank: tab === 'comunidad' && !f.sort }))}`);
  };
  drawList();
  // Tab counters for the other tabs (lightweight, once).
  Promise.all(['comunidad', 'equipo', 'nofinalistas'].filter((x) => x !== tab).map(async (x) => {
    const r = await api('/ideas?tab=' + x); counts[x] = r.items.length;
  })).then(() => ctx.isCurrent() && drawTabs()).catch(() => {});

  let lastSig = JSON.stringify(data.items);
  let reqSeq = 0;
  const reload = async () => {
    const mySeq = ++reqSeq;
    const next = await api('/ideas?' + new URLSearchParams({ tab, ...f }));
    if (mySeq !== reqSeq || !ctx.isCurrent()) return; // a newer request is in flight
    const sig = JSON.stringify(next.items);
    if (sig === lastSig) return; // only redraw when something changed
    data = next;
    lastSig = sig;
    drawList();
  };
  const syncUrl = () => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    history.replaceState(null, '', '#' + (tab === 'comunidad' ? '/' : '/' + tab) + (qs.toString() ? '?' + qs : ''));
  };
  el.querySelector('#q').addEventListener('input', debounce((e) => { f.q = e.target.value; syncUrl(); reload(); }, 250));
  el.querySelector('#cat').onchange = (e) => { f.category = e.target.value; syncUrl(); reload(); };
  const sortEl = el.querySelector('#sort');
  if (sortEl) sortEl.onchange = (e) => { f.sort = e.target.value; syncUrl(); reload(); };

  const replaceIdea = (updated) => {
    const i = data.items.findIndex((x) => x.id === updated.id);
    if (i >= 0) data.items[i] = { ...updated, rank: data.items[i].rank };
  };
  bindActions(listEl, {
    vote: async (d) => {
      const idea = data.items.find((x) => x.id === +d.id);
      const updated = await voteFlow(idea, d.value);
      if (updated) { replaceIdea(updated); lastSig = ''; drawList(); reload(); }
    },
    claim: async (d) => { if (await claimFlow(d.id, 'claim')) { lastSig = ''; reload(); } },
    support: async (d) => { if (await claimFlow(d.id, 'support')) { lastSig = ''; reload(); } },
  });

  // Live ranking
  const timer = setInterval(() => {
    if (document.hidden || isModalOpen() || document.activeElement === el.querySelector('#q')) return;
    reload().catch(() => {});
  }, POLL_MS);
  return () => clearInterval(timer);
}

