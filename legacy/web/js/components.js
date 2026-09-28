// Shared idea UI: badges, vote controls, idea cards and the vote / claim flows.
import { html, api, modal, toast, go } from './ui.js';
import { t, relTime, monthName, periodLabel } from './i18n.js';
import { me, isAdmin } from './store.js';

const STATUS_TONE = {
  en_votacion: 'primary', finalista: 'ok', no_finalista: 'outline', reclamada: 'warn', validada: 'ok', no_validada: 'danger',
  aceptada: 'ok', rechazada: 'danger', pospuesta: 'warn', en_roadmap: 'primary', lanzada: 'ok', archivada: 'outline',
  planificada: 'outline', en_desarrollo: 'primary', en_evaluacion: 'warn', medida: 'outline',
};

export const originBadge = (origin) =>
  html`<span class="badge ${origin === 'equipo' ? 'team' : 'community'}">${t('origin_' + origin)}</span>`;
export const statusBadge = (s) => html`<span class="badge ${STATUS_TONE[s] || ''}">${t('st_' + s)}</span>`;
export const typeBadge = (type) => (type === 'C' ? '' : html`<span class="badge outline">${type} · ${t('type_' + type)}</span>`);

export function progress(pct, tone = '') {
  return html`<div class="progress ${tone}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
}

// ------------------------------------------------------------ vote controls

export function voteControl(idea) {
  if (idea.type === 'C') return upDown(idea);
  const options = idea.type === 'A' ? ['importante', 'deseable', 'no_importante'] : ['importante', 'no_importante'];
  const disabled = !idea.can_vote;
  return html`<div class="choice" role="group">
    ${options.map((o) => html`<button class="btn sm ${idea.my_vote === o ? 'selected' : ''}" data-action="vote" data-id="${idea.id}"
      data-value="${o}" ${disabled ? 'disabled' : ''} aria-pressed="${idea.my_vote === o}">${t('v_' + o)}</button>`)}
  </div>`;
}

function upDown(idea) {
  const c = idea.counts;
  const disabled = !idea.can_vote;
  const title = idea.is_author && idea.status === 'en_votacion' ? t('own_idea') : (!idea.can_vote ? t('votes_frozen') : '');
  return html`<div class="updown" title="${title}">
    <button class="vbtn up ${idea.my_vote === 'up' ? 'on' : ''}" data-action="vote" data-id="${idea.id}" data-value="up"
      aria-label="${t('v_up')}" aria-pressed="${idea.my_vote === 'up'}" ${disabled ? 'disabled' : ''}>👍</button>
    <span class="score" title="${c ? '' : t('counts_after_vote')}">${c ? c.score : '?'}</span>
    <button class="vbtn down ${idea.my_vote === 'down' ? 'on' : ''}" data-action="vote" data-id="${idea.id}" data-value="down"
      aria-label="${t('v_down')}" aria-pressed="${idea.my_vote === 'down'}" ${disabled ? 'disabled' : ''}>👎</button>
    ${c ? html`<span class="split">${c.up} 👍 · ${c.down} 👎</span>` : ''}
  </div>`;
}

export function statsLine(idea) {
  const c = idea.counts;
  if (idea.type === 'C' || !c) {
    if (idea.type === 'A' && !c) return html`<span class="muted small">🔒 ${t('your_answer_private')}</span>`;
    if (idea.type === 'B' && !c) return html`<span class="muted small">🔒 ${t('counts_private')}</span>`;
    return '';
  }
  const tone = idea.type === 'A' && idea.threshold && idea.threshold.validated ? 'ok' : '';
  return html`<div class="small">
    <div class="row between"><span>${t('importance', { pct: c.pct_importante })}</span>
      <span class="muted">${t('responses', { n: c.responses })}${c.index != null ? html` · ${t('index')} ${c.index}` : ''}</span></div>
    ${progress(c.pct_importante, tone)}
  </div>`;
}

// ------------------------------------------------------------ idea card

export function ideaCard(idea, { showRank = false } = {}) {
  const hidden = idea.hidden ? html`<span class="badge danger">${t('hidden_badge')}</span>` : '';
  const left = idea.type === 'C' && ['en_votacion'].includes(idea.status) ? upDown(idea) : '';
  const rank = showRank && idea.rank ? html`<div class="rank ${idea.rank <= 3 ? 'top' : ''}">#${idea.rank}</div>` : '';
  let extra = '';
  if (idea.type !== 'C' && idea.status === 'en_votacion') {
    extra = html`<div class="mt stack">${voteControl(idea)}${statsLine(idea)}</div>`;
  }
  if (['no_finalista', 'reclamada'].includes(idea.status)) extra = nonFinalistBlock(idea);
  return html`<article class="card idea ${idea.hidden ? 'is-hidden' : ''}" data-idea="${idea.id}">
    ${rank}${left}
    <div class="body">
      <h3><a href="#/idea/${idea.id}">${idea.title}</a></h3>
      ${idea.description ? html`<p class="desc">${idea.description}</p>` : ''}
      <div class="meta">
        ${originBadge(idea.origin)} ${typeBadge(idea.type)}
        ${idea.status !== 'en_votacion' ? statusBadge(idea.status) : ''}
        ${idea.category ? html`<span class="badge outline">${idea.category}</span>` : ''} ${hidden}
        <span>💬 ${idea.comments_count}</span>
        ${idea.author && idea.author.name && idea.origin === 'comunidad' ? html`<span>${t('by', { name: idea.author.name })}</span>` : ''}
        <span>${relTime(idea.created_at)}</span>
        ${idea.status === 'en_votacion' && idea.last_entry ? html`<span title="${t('history')}">↺ ${historyLine(idea.last_entry)}</span>` : ''}
      </div>
      ${extra}
    </div>
  </article>`;
}

export function historyLine(e) {
  if (!e || e.up == null) return '';
  return t('history_line', { up: e.up, down: e.down, period: monthName(e.cycle_start) });
}

export function nonFinalistBlock(idea) {
  const cl = idea.claim;
  const hist = idea.last_entry ? html`<div class="frozen">❄️ ${historyLine(idea.last_entry)}</div>` : '';
  if (idea.status === 'reclamada' && cl) {
    const pct = (100 * cl.supports) / cl.required;
    return html`<div class="mt stack">
      ${hist}
      <div class="row between small"><strong>${t('claimed_missing', { n: cl.missing })}</strong>
        <span class="muted">${cl.supports}/${cl.required}</span></div>
      ${progress(pct, 'warn')}
      <div class="row">
        <button class="btn sm primary" data-action="support" data-id="${idea.id}" ${cl.supported ? 'disabled' : ''}>
          ${cl.supported ? '✓ ' + t('supported') : '🙌 ' + t('support')}</button>
        <span class="muted tiny">${t('claimed_by', { name: cl.started_by })}</span>
      </div>
    </div>`;
  }
  return html`<div class="mt row between">
    ${hist}
    <button class="btn sm" data-action="claim" data-id="${idea.id}">✋ ${t('claim')}</button>
  </div>`;
}

// ------------------------------------------------------------ flows

function requireAccount() {
  const u = me();
  if (!u) {
    modal({
      title: t('login_needed'), body: html`<p>${t('login_needed_text')}</p>`, submit: t('login'),
    }).then((r) => { if (r) go('/login?next=' + encodeURIComponent(location.hash.slice(1))); });
    return false;
  }
  if (!u.verified) { toast(t('err_email_not_verified'), 'error'); return false; }
  return true;
}

// Returns the updated idea or null.
export async function voteFlow(idea, value) {
  if (!requireAccount()) return null;
  let next = idea.my_vote === value ? null : value;
  let reason;
  if (next === 'down' && !isAdmin()) {
    const r = await modal({
      title: t('down_reason_title'), submit: t('vote_down'),
      body: html`<div class="field"><textarea name="reason" maxlength="500" placeholder="${t('down_reason_ph')}"></textarea>
        <div class="hint">🔒 ${t('down_reason_hint')}</div></div>`,
    });
    if (!r) return null;
    reason = r.reason;
  }
  return api(`/ideas/${idea.id}/vote`, { method: 'POST', body: { value: next, reason } });
}

export async function claimFlow(id, kind) {
  if (!requireAccount()) return null;
  return api(`/ideas/${id}/${kind}`, { method: 'POST' });
}

export async function reportFlow(objectType, objectId) {
  if (!requireAccount()) return;
  const r = await modal({
    title: t('report_title'), submit: t('send'),
    body: html`<div class="field"><label>${t('report_reason')}</label>
      <textarea name="reason" required maxlength="500" placeholder="${t('report_ph')}"></textarea></div>`,
    onSubmit: (d) => api('/reports', { method: 'POST', body: { object_type: objectType, object_id: objectId, reason: d.reason } }),
  });
  if (r) toast(t('report_sent'));
}

export function roadmapLine(rm) {
  return rm ? html`${statusBadge(rm.status)} <span class="muted small">${periodLabel(rm.period)}</span>` : '';
}
