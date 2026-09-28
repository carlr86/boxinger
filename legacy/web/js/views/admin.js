// Admin: dashboard, team ideas, moderation, cycle close, prioritization, roadmap management, settings.
import { html, api, bindActions, modal, confirmModal, toast, toastError, debounce } from '../ui.js';

// Form submit handlers aren't covered by bindActions: surface their errors as toasts.
const safe = (fn) => async (e) => { e.preventDefault(); try { await fn(e); } catch (ex) { toastError(ex); } };
import { t, cycleLabel, fmtDateTime, periodLabel, relTime } from '../i18n.js';
import { store } from '../store.js';
import { originBadge, statusBadge, typeBadge, progress } from '../components.js';
import { editIdeaModal, mergeModal } from './idea.js';
import { reloadApp } from '../main.js';

const now = () => Date.now() / 1000;

// 'YYYY-MM-DDTHH:MM' in the board timezone, for <input type=datetime-local>.
function toLocalInput(ts) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: store.state.board.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ts * 1000));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ------------------------------------------------------------------ dashboard

export async function dashboard(el) {
  const d = await api('/admin/dashboard');
  const c = d.cycle;
  const daysLeft = c && c.status === 'activo' ? Math.max(0, Math.ceil((c.ends_at - now()) / 86400)) : '—';
  const partPct = d.users ? Math.round((100 * (d.participants || 0)) / d.users) : 0;
  el.innerHTML = String(html`
    <div class="row between mb"><h1 style="margin:0">${t('admin_dashboard')}</h1>
      <span class="muted">${c ? cycleLabel(c) : t('no_cycle')}</span></div>
    <div class="tiles">
      <div class="tile"><div class="v">${daysLeft}</div><div class="l">${t('days_left')}${c ? html` · ${fmtDateTime(c.ends_at)}` : ''}</div></div>
      <div class="tile"><div class="v">${d.new_ideas ?? 0}</div><div class="l">${t('new_ideas')}</div></div>
      <div class="tile"><div class="v">${d.votes ?? 0}</div><div class="l">${t('votes')}</div></div>
      <div class="tile"><div class="v">${d.participants ?? 0}</div><div class="l">${t('participants')} · ${t('participation', { pct: partPct, n: d.users })}</div></div>
    </div>
    <div class="row mt">
      <a class="btn ${d.reports_pending ? 'danger' : ''}" href="#/admin/moderacion">⚑ ${t('reports_pending')}: ${d.reports_pending}</a>
      <a class="btn" href="#/admin/priorizacion">📊 ${t('prio_pending')}: ${d.prioritization_pending}</a>
      <a class="btn" href="#/admin/cierre">⏱ ${t('admin_close')}</a>
    </div>
    <div class="layout-2 mt">
      <section class="card">
        <h2>🔥 ${t('top5')}</h2>
        ${d.top && d.top.length ? html`<div class="table-wrap"><table><tbody>${d.top.map((r, n) => html`<tr>
          <td class="nowrap"><strong>#${n + 1}</strong></td><td><a href="#/idea/${r.id}">${r.title}</a></td>
          <td class="num"><strong>${r.score}</strong></td><td class="num muted small nowrap">${r.up}👍 ${r.down}👎</td></tr>`)}</tbody></table></div>`
        : html`<p class="muted">${t('none_yet')}</p>`}
        <h2 class="mt">🎯 ${t('a_near')}</h2>
        ${d.threshold ? html`<p class="muted small">${t('threshold', { pct: d.threshold.pct, min: d.threshold.min })}</p>` : ''}
        ${d.a_ideas && d.a_ideas.length ? d.a_ideas.map((a) => html`<div style="margin:10px 0">
          <div class="row between small"><a href="#/idea/${a.id}">${a.title}</a>
            <span>${a.validated ? html`<span class="badge ok">✓ ${t('validated')}</span>` : a.near ? html`<span class="badge warn">${t('near')}</span>` : ''}</span></div>
          ${progress(a.stats.pct_importante, a.validated ? 'ok' : 'warn')}
          <div class="tiny muted">${t('importance', { pct: a.stats.pct_importante })} · ${t('responses', { n: a.stats.responses })} · ${t('index')} ${a.stats.index ?? '—'}</div>
        </div>`) : html`<p class="muted">${t('none_yet')}</p>`}
      </section>
      <section class="card">
        <h2>⚠️ ${t('b_alerts')}</h2>
        ${d.b_alerts && d.b_alerts.length ? d.b_alerts.map((b) => html`<div class="alert" style="margin-bottom:8px">
          <a href="#/idea/${b.id}"><strong>${b.title}</strong></a><br>
          ${b.stats.pct_no_importante}% ${t('v_no_importante')} · ${t('responses', { n: b.stats.responses })}</div>`)
        : html`<p class="muted">${t('no_alerts')}</p>`}
      </section>
    </div>`);
}

// ------------------------------------------------------------------ team ideas

export async function team(el) {
  const cats = store.state.board.settings.categories || [];
  const draw = async () => {
    const data = await api('/admin/team');
    el.querySelector('#list').innerHTML = String(data.items.length ? html`${data.items.map(teamCard)}` : html`<div class="empty">${t('none_yet')}</div>`);
  };
  el.innerHTML = String(html`
    <h1>${t('admin_team')}</h1>
    <form class="card" id="f" novalidate>
      <h2>＋ ${t('new_team_idea')}</h2>
      <div class="field"><label>${t('type')}</label><select name="type">
        <option value="A">${t('type_A_long')}</option><option value="B">${t('type_B_long')}</option></select></div>
      <div class="field"><label>${t('title')}</label><input name="title" required maxlength="120"></div>
      <div class="field"><label>${t('description')}</label><textarea name="description" maxlength="4000"></textarea></div>
      <div class="field"><label>${t('category')}</label><select name="category"><option value="">${t('none')}</option>
        ${cats.map((c) => html`<option>${c}</option>`)}</select></div>
      <div class="row between"><span class="muted small">${originBadge('equipo')}</span>
        <button class="btn primary" type="submit">${t('create')}</button></div>
    </form>
    <div class="section-title"><h2>${t('team_results')}</h2></div>
    <div id="list"></div>`);
  const form = el.querySelector('#f');
  form.onsubmit = safe(async () => {
    await api('/ideas', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    form.reset();
    toast(t('published'));
    await draw();
  });
  bindActions(el.querySelector('#list'), {
    relaunch: async (d) => { await api(`/admin/ideas/${d.id}/relaunch`, { method: 'POST' }); await draw(); },
    archive: async (d) => { await api(`/admin/ideas/${d.id}/archive`, { method: 'POST' }); await draw(); },
  });
  await draw();
}

function teamCard(i) {
  const c = i.counts || {};
  let results;
  if (i.type === 'A') {
    results = html`<div class="small">
      <div class="row between"><span>${t('index')} <strong>${c.index ?? '—'}</strong> / 2 · ${t('importance', { pct: c.pct_importante ?? 0 })}</span>
        <span class="muted">${t('responses', { n: c.responses ?? 0 })}${i.threshold ? html` · min ${i.threshold.min}` : ''}</span></div>
      ${progress(c.pct_importante || 0, i.threshold && i.threshold.validated ? 'ok' : 'warn')}
      ${i.threshold ? html`<div class="tiny muted">${t('threshold', { pct: i.threshold.pct, min: i.threshold.min })}</div>` : ''}
    </div>`;
  } else {
    const alert = (c.responses || 0) >= 5 && c.pct_no_importante > 50;
    results = html`<div class="small">
      <div class="row between"><span>${t('importance', { pct: c.pct_importante ?? 0 })}</span>
        <span class="muted">${t('responses', { n: c.responses ?? 0 })}</span></div>
      ${progress(c.pct_importante || 0)}
      ${alert ? html`<span class="badge warn mt">⚠️ ${t('alert_b')} (${c.pct_no_importante}%)</span>` : ''}
    </div>`;
  }
  return html`<article class="card">
    <div class="row between">
      <div class="row">${typeBadge(i.type)} ${statusBadge(i.status)} ${i.cycle ? html`<span class="muted small">${t('cycle')} #${i.cycle.number}</span>` : ''}</div>
      <span class="muted small">💬 ${i.all_comments}</span>
    </div>
    <h3 class="mt" style="margin-bottom:8px"><a href="#/idea/${i.id}">${i.title}</a></h3>
    ${results}
    ${i.status === 'no_validada' ? html`<div class="row mt">
      <button class="btn sm primary" data-action="relaunch" data-id="${i.id}">↻ ${t('relaunch')}</button>
      <button class="btn sm" data-action="archive" data-id="${i.id}">🗄 ${t('archive')}</button></div>` : ''}
  </article>`;
}

// ------------------------------------------------------------------ moderation

export async function moderation(el) {
  let data;
  let term = '';
  const load = async () => { data = await api('/admin/moderation'); };
  const drawIdeas = () => {
    const rows = data.ideas.filter((i) => !term || i.title.toLowerCase().includes(term));
    el.querySelector('#ideas').innerHTML = String(html`<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>${t('title')}</th><th>${t('type')}</th><th></th></tr></thead>
      <tbody>${rows.map((i) => html`<tr>
        <td class="muted">${i.id}</td>
        <td><a href="#/idea/${i.id}">${i.title}</a><div class="tiny muted">${i.author || ''} · ${relTime(i.created_at)}</div></td>
        <td class="nowrap">${i.type} ${statusBadge(i.status)} ${i.hidden ? html`<span class="badge danger">${t('hidden_badge')}</span>` : ''}</td>
        <td class="nowrap">
          <button class="btn sm ghost" data-action="edit" data-id="${i.id}" title="${t('edit')}">✏️</button>
          <button class="btn sm ghost" data-action="hide-idea" data-id="${i.id}" data-value="${i.hidden ? '0' : '1'}" title="${i.hidden ? t('unhide') : t('hide')}">${i.hidden ? '👁' : '🙈'}</button>
          <button class="btn sm ghost" data-action="merge" data-id="${i.id}" title="${t('merge')}">🔀</button>
          <button class="btn sm ghost" data-action="delete-idea" data-id="${i.id}" title="${t('delete')}">🗑</button>
        </td></tr>`)}</tbody></table></div>`);
  };
  const draw = () => {
    el.innerHTML = String(html`
      <h1>${t('admin_moderation')}</h1>
      <section class="card">
        <h2>⚑ ${t('reports')}</h2>
        ${data.reports.length ? data.reports.map((r) => html`<div class="comment" style="${r.status !== 'pendiente' ? 'opacity:.6' : ''}">
          <div class="who">${r.object_type === 'idea' ? '💡' : '💬'} <span class="badge ${r.status === 'pendiente' ? 'warn' : 'outline'}">${t('rep_' + r.status)}</span>
            <span class="muted tiny">${t('reported_by', { name: r.reporter || '—' })} · ${relTime(r.created_at)}</span></div>
          <div class="small"><strong>${t('report_reason')}:</strong> ${r.reason}</div>
          <div class="small pre" style="margin:6px 0">${r.object ? html`<a href="#/idea/${r.object.idea_id}">“${r.object.text}”</a>
            ${r.object.hidden ? html`<span class="badge danger">${t('hidden_badge')}</span>` : ''}` : t('object_deleted')}</div>
          <div class="row">
            ${r.object ? html`
              <button class="btn sm" data-action="report-hide" data-rid="${r.id}" data-type="${r.object_type}" data-id="${r.object_id}" data-value="${r.object.hidden ? '0' : '1'}">${r.object.hidden ? t('unhide') : t('hide')}</button>
              <button class="btn sm danger" data-action="report-delete" data-rid="${r.id}" data-type="${r.object_type}" data-id="${r.object_id}">${t('delete')}</button>` : ''}
            ${r.status === 'pendiente' ? html`
              <button class="btn sm" data-action="report-status" data-rid="${r.id}" data-value="resuelto">✓ ${t('resolve')}</button>
              <button class="btn sm ghost" data-action="report-status" data-rid="${r.id}" data-value="descartado">${t('dismiss')}</button>` : ''}
          </div></div>`) : html`<p class="muted">${t('no_reports')}</p>`}
      </section>
      ${data.hidden_comments.length ? html`<section class="card mt"><h2>${t('hidden_comments')}</h2>
        ${data.hidden_comments.map((c) => html`<div class="row between small" style="margin:6px 0">
          <span><a href="#/idea/${c.idea_id}">#${c.idea_id}</a> ${c.author || ''}: “${c.body.slice(0, 120)}”</span>
          <button class="btn sm" data-action="unhide-comment" data-id="${c.id}">${t('unhide')}</button></div>`)}</section>` : ''}
      <section class="card mt">
        <div class="row between"><h2 style="margin:0">${t('all_ideas')}</h2>
          <input type="search" id="q" placeholder="${t('search')}" style="max-width:260px" value="${term}"></div>
        <div id="ideas" class="mt"></div>
      </section>`);
    drawIdeas();
    el.querySelector('#q').addEventListener('input', debounce((e) => { term = e.target.value.toLowerCase(); drawIdeas(); }, 200));
  };
  const refresh = async () => { await load(); draw(); };
  const find = (id) => data.ideas.find((x) => x.id === +id);
  bindActions(el, {
    edit: async (d) => { if (await editIdeaModal(find(d.id))) await refresh(); },
    'hide-idea': async (d) => { await api(`/admin/ideas/${d.id}`, { method: 'PATCH', body: { hidden: d.value === '1' } }); await refresh(); },
    merge: async (d) => { if (await mergeModal(find(d.id), data.ideas)) await refresh(); },
    'delete-idea': async (d) => {
      if (!await confirmModal(t('confirm_delete'), t('confirm_delete_text'), t('delete'))) return;
      await api(`/admin/ideas/${d.id}`, { method: 'DELETE' }); await refresh();
    },
    'unhide-comment': async (d) => { await api(`/admin/comments/${d.id}`, { method: 'PATCH', body: { hidden: false } }); await refresh(); },
    'report-status': async (d) => { await api(`/admin/reports/${d.rid}`, { method: 'POST', body: { status: d.value } }); await refresh(); },
    'report-hide': async (d) => {
      const path = d.type === 'idea' ? `/admin/ideas/${d.id}` : `/admin/comments/${d.id}`;
      await api(path, { method: 'PATCH', body: { hidden: d.value === '1' } });
      await api(`/admin/reports/${d.rid}`, { method: 'POST', body: { status: 'resuelto' } });
      await refresh();
    },
    'report-delete': async (d) => {
      if (!await confirmModal(t('confirm_delete'), d.type === 'idea' ? t('confirm_delete_text') : '', t('delete'))) return;
      await api(d.type === 'idea' ? `/admin/ideas/${d.id}` : `/admin/comments/${d.id}`, { method: 'DELETE' });
      await refresh();
    },
  });
  await refresh();
}

// ------------------------------------------------------------------ cycle close

export async function close(el) {
  const p = await api('/admin/close-preview');
  const c = p.cycle;
  if (p.inactive || !c) {
    el.innerHTML = String(html`<h1>${t('close_title')}</h1><div class="empty">${c ? html`${cycleLabel(c)} · ${t('cycle_starts', { date: fmtDateTime(c.starts_at) })}` : t('no_cycle')}</div>`);
    return;
  }
  const list = (items, render) => (items.length ? html`<ul>${items.map((i) => html`<li>${render(i)}</li>`)}</ul>` : html`<p class="muted small">—</p>`);
  const c3 = (i) => html`<a href="#/idea/${i.id}">${i.title}</a> <span class="muted small">(${i.score > 0 ? '+' : ''}${i.score} · ${i.up}👍 ${i.down}👎)</span>`;
  el.innerHTML = String(html`
    <h1>${t('close_title')} · ${cycleLabel(c)}</h1>
    <div class="alert info mb">⏱ ${t('close_auto', { date: fmtDateTime(c.ends_at) })}</div>
    <form class="card flat row" id="endf">
      <label class="grow" style="margin:0">${t('change_end')}<input type="datetime-local" name="ends_at" value="${toLocalInput(c.ends_at)}" required></label>
      <button class="btn" type="submit" style="align-self:flex-end">${t('save')}</button>
    </form>
    <h2 class="mt">${t('close_preview')}</h2>
    <div class="grid2">
      <section class="card"><h3>🏆 ${t('will_be_finalists')} (top ${c.top_n})</h3>${list(p.finalists, c3)}</section>
      <section class="card"><h3>❄️ ${t('will_be_nonfinalists')}</h3>${list(p.non_finalists, c3)}</section>
      <section class="card"><h3>🎯 ${t('a_results')}</h3>${list(p.a_ideas, (a) => html`<a href="#/idea/${a.id}">${a.title}</a>
        ${a.validated ? html`<span class="badge ok">${t('st_validada')}</span>` : html`<span class="badge danger">${t('st_no_validada')}</span>`}
        <div class="tiny muted">${t('importance', { pct: a.stats.pct_importante })} · ${t('responses', { n: a.stats.responses })}</div>`)}</section>
      <section class="card"><h3>📌 ${t('b_results')}</h3>${list(p.b_ideas, (b) => html`<a href="#/idea/${b.id}">${b.title}</a>
        <div class="tiny muted">${t('importance', { pct: b.stats.pct_importante })} · ${t('responses', { n: b.stats.responses })}</div>`)}</section>
      <section class="card"><h3>⌛ ${t('expiring_claims')}</h3>${list(p.expiring_claims, (i) => html`<a href="#/idea/${i.id}">${i.title}</a>`)}</section>
      <section class="card"><h3>🗄 ${t('to_archive')}</h3>${list(p.to_archive, (i) => html`<a href="#/idea/${i.id}">${i.title}</a>`)}</section>
    </div>
    <div class="row mt" style="justify-content:flex-end"><button class="btn primary" id="closebtn">🔒 ${t('close_confirm')}</button></div>`);
  el.querySelector('#endf').onsubmit = safe(async (e) => {
    await api('/admin/cycle', { method: 'PATCH', body: { ends_at: e.target.ends_at.value } });
    toast(t('saved'));
    await reloadApp('/admin/cierre');
  });
  el.querySelector('#closebtn').onclick = safe(async () => {
    const ok = await confirmModal(t('close_really', { n: c.number }), t('close_really_text'), t('close_confirm'), false);
    if (!ok) return;
    await api('/admin/close-cycle', { method: 'POST' });
    toast(t('closed_ok'));
    await reloadApp('/admin/priorizacion');
  });
}

// ------------------------------------------------------------------ prioritization

const CRITERIA = ['impact', 'effort', 'revenue', 'criticality'];

export async function prioritization(el) {
  let data;
  let mode = 'table';
  let sort = { key: 'score', dir: -1 };
  const load = async () => { data = await api('/admin/prioritization'); };

  const sorted = () => [...data.rows].sort((a, b) => {
    const av = sort.key === 'title' ? a.title : a[sort.key];
    const bv = sort.key === 'title' ? b.title : b[sort.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
  });

  const select = (row, k) => html`<select data-crit="${k}" data-id="${row.id}" aria-label="${t(k)}">
    <option value="">–</option>${[1, 2, 3, 4, 5].map((v) => html`<option ${row[k] === v ? 'selected' : ''}>${v}</option>`)}</select>
    ${row.suggested[k] != null ? html`<span class="sug">${t('suggested', { v: row.suggested[k] })}</span>` : ''}`;

  const th = (key, label, cls = '') => html`<th class="${cls}" style="cursor:pointer" data-action="sort" data-key="${key}">${label}${sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;

  const actions = (r) => html`<div class="row" style="flex-wrap:nowrap">
    <button class="btn sm primary" data-action="accept" data-id="${r.id}">✓ ${t('accept')}</button>
    <button class="btn sm danger" data-action="reject" data-id="${r.id}">✕ ${t('reject')}</button>
    ${r.status !== 'pospuesta' ? html`<button class="btn sm" data-action="postpone" data-id="${r.id}">⏸ ${t('postpone')}</button>` : ''}</div>`;

  const ideaCell = (r) => html`<a href="#/idea/${r.id}"><strong>${r.title}</strong></a>
    <div class="row tiny" style="margin-top:2px">${originBadge(r.origin)} ${statusBadge(r.status)}
      ${r.cycle_number ? html`<span class="muted">${t('cycle')} #${r.cycle_number}</span>` : ''}
      ${r.entry && r.entry.score_final != null && r.type === 'C' ? html`<span class="muted">${t('score')} ${r.entry.score_final}</span>` : ''}
      ${r.type === 'A' && r.entry ? html`<span class="muted">${t('index')} ${r.entry.score_final}</span>` : ''}</div>`;

  const tableView = () => html`<div class="table-wrap card" style="padding:0"><table class="prio">
    <thead><tr>${th('title', 'Idea')}${CRITERIA.map((k) => th(k, t(k)))}${th('score', t('score'), 'num')}<th></th></tr></thead>
    <tbody>${sorted().map((r) => html`<tr>
      <td style="min-width:220px">${ideaCell(r)}</td>
      ${CRITERIA.map((k) => html`<td>${select(r, k)}</td>`)}
      <td class="num"><strong style="font-size:1.1rem">${r.score ?? '—'}</strong></td>
      <td>${actions(r)}</td></tr>`)}</tbody></table></div>`;

  const matrixView = () => {
    const placed = data.rows.filter((r) => r.impact != null && r.effort != null);
    const missing = data.rows.filter((r) => r.impact == null || r.effort == null);
    const q = (hiImpact, hiEffort) => placed.filter((r) => (r.impact >= 3) === hiImpact && (r.effort >= 3) === hiEffort);
    const chips = (rows) => rows.map((r) => html`<a class="chip" href="#/idea/${r.id}">${r.title} <span class="muted">(${r.score ?? '—'})</span></a>`);
    return html`<div class="matrix">
        <div class="axis y">${t('impact')} → ${t('high')}</div>
        <div class="q qw"><h4>⚡ ${t('q_quick')}</h4>${chips(q(true, false))}</div>
        <div class="q gb"><h4>🚀 ${t('q_big')}</h4>${chips(q(true, true))}</div>
        <div class="q"><h4>🧩 ${t('q_fill')}</h4>${chips(q(false, false))}</div>
        <div class="q dc"><h4>🗑 ${t('q_discard')}</h4>${chips(q(false, true))}</div>
        <div class="axis x">${t('effort')} → ${t('high')}</div>
      </div>
      ${missing.length ? html`<p class="muted small mt">— ${missing.map((r) => r.title).join(' · ')}</p>` : ''}`;
  };

  const draw = () => {
    el.innerHTML = String(html`
      <div class="row between"><h1 style="margin:0">${t('prio_title')}</h1>
        <div class="row"><button class="btn sm ${mode === 'table' ? 'selected' : ''}" data-action="mode" data-value="table">☰ ${t('table')}</button>
        <button class="btn sm ${mode === 'matrix' ? 'selected' : ''}" data-action="mode" data-value="matrix">▦ ${t('matrix')}</button></div></div>
      <p class="muted small">${t('prio_formula')}</p>
      ${data.rows.length ? (mode === 'table' ? tableView() : matrixView()) : html`<div class="empty">${t('prio_empty')}</div>`}
      ${data.decided.length ? html`<section class="mt"><div class="section-title"><h2>${t('decided')}</h2></div>
        <div class="card flat">${data.decided.map((r) => html`<div class="row between small" style="margin:6px 0">
          <span><a href="#/idea/${r.id}">${r.title}</a> ${r.reason ? html`<span class="muted">— ${r.reason}</span>` : ''}</span>
          ${statusBadge(r.decision)}</div>`)}</div></section>` : ''}`);
    el.querySelectorAll('select[data-crit]').forEach((s) => {
      s.onchange = safe(async () => {
        await api(`/admin/prioritization/${s.dataset.id}`, { method: 'PATCH', body: { [s.dataset.crit]: s.value || null } });
        await load(); draw();
      });
    });
  };

  const decide = (id, body) => api(`/admin/prioritization/${id}/decide`, { method: 'POST', body });
  bindActions(el, {
    mode: (d) => { mode = d.value; draw(); },
    sort: (d) => { sort = { key: d.key, dir: sort.key === d.key ? -sort.dir : (d.key === 'title' ? 1 : -1) }; draw(); },
    accept: async (d) => {
      const r = await modal({
        title: t('accept_title'), submit: t('accept'),
        body: html`<p><strong>${data.rows.find((x) => x.id === +d.id).title}</strong></p>
          <div class="field"><label>${t('period')}</label><input name="period" value="${data.default_period}" pattern="\\d{4}-(\\d{2}|Q[1-4])">
          <div class="hint">AAAA-MM / AAAA-Qn</div></div>`,
        onSubmit: (f) => decide(d.id, { decision: 'aceptar', period: f.period }),
      });
      if (r) { toast('✓'); await load(); draw(); }
    },
    reject: async (d) => {
      const r = await modal({
        title: t('reject_title'), submit: t('reject'), danger: true,
        body: html`<p><strong>${data.rows.find((x) => x.id === +d.id).title}</strong></p>
          <div class="field"><label>${t('reject_reason')}</label><textarea name="reason" required></textarea></div>`,
        onSubmit: (f) => decide(d.id, { decision: 'rechazar', reason: f.reason }),
      });
      if (r) { await load(); draw(); }
    },
    postpone: async (d) => { await decide(d.id, { decision: 'posponer' }); await load(); draw(); },
  });
  await load();
  draw();
}

// ------------------------------------------------------------------ roadmap management

function periodOptions(current) {
  const out = new Set();
  const d = new Date();
  for (let i = -2; i < 13; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
    out.add(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  for (let i = 0; i < 6; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + 3 * i, 1);
    out.add(`${x.getFullYear()}-Q${Math.floor(x.getMonth() / 3) + 1}`);
  }
  if (current) out.add(current);
  return [...out].sort();
}

export async function roadmap(el) {
  let data;
  const load = async () => { data = await api('/roadmap'); };
  const draw = () => {
    el.innerHTML = String(html`<h1>${t('admin_roadmap')}</h1>
      <p class="muted small">🔔 ${t('roadmap_admin_intro')}</p>
      <div class="kanban">${['planificada', 'en_desarrollo', 'lanzada'].map((s) => {
        const items = data.items.filter((i) => i.status === s);
        return html`<div class="column"><h3>${t('st_' + s)} <span class="badge">${items.length}</span></h3>
          ${items.map((i) => html`<article class="card">
            <div class="row" style="margin-bottom:6px">${originBadge(i.origin)} ${typeBadge(i.type)}
              ${i.cycle_number ? html`<span class="muted tiny">${t('won_in', { n: i.cycle_number })}</span>` : ''}</div>
            <h3 style="margin:0 0 8px"><a href="#/idea/${i.idea_id}" style="color:inherit">${i.title}</a></h3>
            <div class="grid2" style="grid-template-columns:1fr 1fr;gap:6px">
              <select data-field="status" data-id="${i.id}" aria-label="status">
                ${['planificada', 'en_desarrollo', 'lanzada'].map((o) => html`<option value="${o}" ${o === i.status ? 'selected' : ''}>${t('st_' + o)}</option>`)}</select>
              <select data-field="period" data-id="${i.id}" aria-label="${t('period')}">
                ${periodOptions(i.period).map((p) => html`<option value="${p}" ${p === i.period ? 'selected' : ''}>${periodLabel(p)}</option>`)}</select>
            </div>
          </article>`)}
          ${!items.length ? html`<p class="muted small center">${t('roadmap_empty')}</p>` : ''}</div>`;
      })}</div>`);
    el.querySelectorAll('select[data-field]').forEach((s) => {
      s.onchange = safe(async () => {
        await api(`/admin/roadmap/${s.dataset.id}`, { method: 'PATCH', body: { [s.dataset.field]: s.value } });
        toast(t('saved'));
        await load(); draw();
      });
    });
  };
  await load();
  draw();
}

// ------------------------------------------------------------------ settings

export async function settings(el) {
  const s = await api('/admin/settings');
  const c = s.settings.cycle;
  const cyc = s.cycle;
  const url = `${s.base_url}/#/proponer`;
  const snippet = `<a href="${url}" target="_blank" rel="noopener"\n   style="display:inline-block;padding:10px 16px;border-radius:10px;background:#4f46e5;color:#fff;font:600 14px sans-serif;text-decoration:none">\n  💡 ${t('propose')}\n</a>`;
  const num = (name, val, min, max, step = 1) => html`<div class="field"><label>${t(name)}</label>
    <input type="number" name="${name}" value="${val}" min="${min}" max="${max}" step="${step}" required></div>`;
  el.innerHTML = String(html`
    <h1>${t('settings_title')}</h1>
    ${cyc ? html`<form class="card" id="cyclef">
      <h2>${t('current_cycle')}: ${cycleLabel(cyc)} ${statusBadge(cyc.status === 'activo' ? 'en_votacion' : 'planificada')}</h2>
      <div class="row">
        <label class="grow" style="margin:0">${cyc.status === 'activo' ? t('ends_at') : t('starts_at')}
          <input type="datetime-local" name="${cyc.status === 'activo' ? 'ends_at' : 'starts_at'}" value="${toLocalInput(cyc.status === 'activo' ? cyc.ends_at : cyc.starts_at)}"></label>
        <button class="btn" type="submit" style="align-self:flex-end">${t('save')}</button>
      </div></form>` : ''}
    <form id="f" class="stack mt">
      <section class="card"><h2>${t('board_section')}</h2><div class="grid2">
        <div class="field"><label>${t('board_name')}</label><input name="name" value="${s.name}" required></div>
        <div class="field"><label>${t('slug')}</label><input name="slug" value="${s.slug}"></div>
        <div class="field"><label>${t('logo_url')}</label><input name="logo_url" value="${s.logo_url || ''}" placeholder="https://…/logo.png"></div>
        <div class="field"><label>${t('language')}</label><select name="language">
          <option value="es" ${s.language === 'es' ? 'selected' : ''}>Español</option>
          <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option></select></div>
        <div class="field"><label>${t('timezone')}</label><input name="timezone" value="${s.timezone}"></div>
      </div></section>
      <section class="card"><h2>${t('cycle_section')}</h2><div class="grid2">
        <div class="field"><label>${t('duration')}</label><select name="kind">
          <option value="mensual" ${c.kind === 'mensual' ? 'selected' : ''}>${t('mensual')}</option>
          <option value="trimestral" ${c.kind === 'trimestral' ? 'selected' : ''}>${t('trimestral')}</option></select></div>
        ${num('top_n', c.top_n, 1, 50)}
        ${num('supports_required', c.supports_required, 1, 1000)}
        ${num('cycles_to_archive', c.cycles_to_archive, 1, 24)}
      </div>
      <h3>${t('thresholds')}</h3><div class="grid2">
        ${num('a_threshold_pct', c.a_threshold_pct, 0, 100)}
        ${num('a_min_responses', c.a_min_responses, 1, 100000)}
        ${num('b_alert_pct', c.b_alert_pct, 0, 100)}
      </div></section>
      <section class="card"><h2>${t('visibility')}</h2>
        <label class="check"><input type="checkbox" name="c_show_after_vote" ${s.settings.c_show_after_vote ? 'checked' : ''}> ${t('c_show_after_vote')}</label>
        <label class="check"><input type="checkbox" name="b_public_counts" ${s.settings.b_public_counts ? 'checked' : ''}> ${t('b_public_counts')}</label>
        <div class="field mt"><label>${t('categories')}</label><textarea name="categories">${s.settings.categories.join('\n')}</textarea></div>
      </section>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">${t('save')}</button></div>
    </form>
    <section class="card mt"><h2>💡 ${t('product_button')}</h2>
      <p class="muted small">${t('product_button_hint')}</p>
      <div class="code" id="snippet">${snippet}</div>
      <div class="row mt"><button class="btn sm" id="copy">📋 ${t('copy')}</button>
        <a class="btn sm ghost" href="${url}" target="_blank" rel="noopener">${url}</a></div>
    </section>`);

  const form = el.querySelector('#f');
  form.onsubmit = safe(async () => {
    const v = (n) => form.querySelector(`[name=${n}]`);
    const body = {
      name: v('name').value, slug: v('slug').value, logo_url: v('logo_url').value, language: v('language').value, timezone: v('timezone').value,
      cycle: Object.fromEntries(['kind', 'top_n', 'supports_required', 'cycles_to_archive', 'a_threshold_pct', 'a_min_responses', 'b_alert_pct']
        .map((k) => [k, v(k).value])),
      c_show_after_vote: v('c_show_after_vote').checked, b_public_counts: v('b_public_counts').checked,
      categories: v('categories').value.split('\n').map((x) => x.trim()).filter(Boolean),
    };
    await api('/admin/settings', { method: 'PATCH', body });
    toast(t('saved'));
    await reloadApp('/admin/config');
  });
  const cf = el.querySelector('#cyclef');
  if (cf) cf.onsubmit = safe(async () => {
    await api('/admin/cycle', { method: 'PATCH', body: Object.fromEntries(new FormData(cf)) });
    toast(t('saved'));
    await reloadApp('/admin/config');
  });
  el.querySelector('#copy').onclick = async () => {
    try { await navigator.clipboard.writeText(snippet); toast(t('copied')); } catch { /* clipboard blocked */ }
  };
}
