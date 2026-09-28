// Idea detail: vote, counts by visibility, cycle history, comments + official reply, follow, report, admin tools.
import { html, api, bindActions, modal, confirmModal, toast, go } from '../ui.js';
import { t, relTime, fmtDateTime, monthYear } from '../i18n.js';
import { me, isAdmin, store } from '../store.js';
import {
  originBadge, statusBadge, typeBadge, voteControl, statsLine, nonFinalistBlock, voteFlow, claimFlow, reportFlow,
  roadmapLine, progress,
} from '../components.js';

export async function render(el, ctx) {
  const id = +ctx.params[0];
  let idea = await api('/ideas/' + id);
  const draw = () => { el.innerHTML = String(view(idea)); bindForm(); };

  const reload = async () => { idea = await api('/ideas/' + id); draw(); };

  function bindForm() {
    const form = el.querySelector('#comment-form');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = form.body.value.trim();
      if (!body) return;
      form.querySelector('button').disabled = true;
      try {
        await api(`/ideas/${id}/comments`, { method: 'POST', body: { body } });
        await reload();
      } catch (ex) { form.querySelector('button').disabled = false; throw ex; }
    };
  }

  bindActions(el, {
    vote: async (d) => { const u = await voteFlow(idea, d.value); if (u) await reload(); },
    claim: async () => { if (await claimFlow(id, 'claim')) await reload(); },
    support: async () => { if (await claimFlow(id, 'support')) await reload(); },
    follow: async () => {
      if (!me()) return go('/login?next=' + encodeURIComponent('/idea/' + id));
      await api(`/ideas/${id}/follow`, { method: 'POST', body: { follow: !idea.following } });
      await reload();
    },
    report: (d) => reportFlow(d.type, +d.id),
    hide: async (d) => {
      await api(`/admin/ideas/${id}`, { method: 'PATCH', body: { hidden: d.value === '1' } });
      await reload();
    },
    'hide-comment': async (d) => {
      await api(`/admin/comments/${d.id}`, { method: 'PATCH', body: { hidden: d.value === '1' } });
      await reload();
    },
    'delete-comment': async (d) => {
      if (!await confirmModal(t('confirm_delete'), '', t('delete'))) return;
      await api(`/admin/comments/${d.id}`, { method: 'DELETE' });
      await reload();
    },
    edit: async () => { if (await editIdeaModal(idea)) await reload(); },
    delete: async () => {
      if (!await confirmModal(t('confirm_delete'), t('confirm_delete_text'), t('delete'))) return;
      await api(`/admin/ideas/${id}`, { method: 'DELETE' });
      go('/');
    },
    merge: async () => { const r = await mergeModal(idea); if (r) go('/idea/' + r.target_id); },
  });

  draw();
  if (idea.merged_into && !isAdmin()) go('/idea/' + idea.merged_into);
}

function view(i) {
  const u = me();
  const isC = i.type === 'C';
  const c = i.counts;
  let voteArea = '';
  if (isC && i.status === 'en_votacion') voteArea = voteControl(i);
  else if (isC && c) {
    voteArea = html`<div class="updown"><span class="score">${c.score}</span><span class="split">${c.up} 👍 · ${c.down} 👎</span>
      <span class="frozen">❄️ ${t('votes_frozen')}</span></div>`;
  }
  const canComment = !!u;
  return html`
    <a href="#/" class="small">${t('back')}</a>
    ${i.merged_into ? html`<div class="alert info mt">${t('merged_into')} <a href="#/idea/${i.merged_into}">#${i.merged_into}</a></div>` : ''}
    <div class="layout-2 mt">
      <div class="stack">
        <article class="card">
          <div class="detail-head">
            ${voteArea}
            <div class="grow">
              <div class="row mb" style="margin-bottom:8px">
                ${originBadge(i.origin)} ${typeBadge(i.type)} ${statusBadge(i.status)}
                ${i.category ? html`<span class="badge outline">${i.category}</span>` : ''}
                ${i.hidden ? html`<span class="badge danger">${t('hidden_badge')}</span>` : ''}
                ${i.roadmap ? roadmapLine(i.roadmap) : ''}
              </div>
              <h1>${i.title}</h1>
              <div class="muted small">
                ${i.origin === 'comunidad' && i.author.name ? t('by', { name: i.author.name }) + ' · ' : ''}${relTime(i.created_at)}
                ${i.cycle ? html` · ${t('cycle')} #${i.cycle.number}` : ''}
              </div>
            </div>
          </div>
          ${i.description ? html`<p class="pre mt">${i.description}</p>` : ''}
          ${i.status === 'rechazada' && i.reject_reason ? html`<div class="alert danger">${t('rejected_reason', { reason: i.reject_reason })}</div>` : ''}
          ${!isC ? html`<div class="stack mt">${voteControl(i)}${statsLine(i)}</div>` : ''}
          ${isC && i.status === 'en_votacion' && !c ? html`<p class="muted small mt">🔒 ${t('counts_after_vote')}</p>` : ''}
          ${isC && i.is_author && i.status === 'en_votacion' ? html`<p class="muted small mt">${t('own_idea')}</p>` : ''}
          ${['no_finalista', 'reclamada'].includes(i.status) ? nonFinalistBlock(i) : ''}
          <div class="row mt">
            <button class="btn sm ${i.following ? 'selected' : ''}" data-action="follow">${i.following ? '🔔 ' + t('following') : '🔕 ' + t('follow')}</button>
            <button class="btn sm ghost" data-action="report" data-type="idea" data-id="${i.id}">⚑ ${t('report')}</button>
          </div>
        </article>

        <section>
          <div class="section-title"><h2>${t('comments')} (${i.comments.length})</h2></div>
          ${i.comments.length ? i.comments.map(commentView) : html`<div class="empty">${t('no_comments')}</div>`}
          ${canComment ? html`<form id="comment-form" class="card flat mt">
              <textarea name="body" required maxlength="2000" placeholder="${t('comment_ph')}" aria-label="${t('comment_ph')}"></textarea>
              <div class="row between mt">
                <span class="muted small">${isAdmin() ? '⭐ ' + t('official_hint') : (i.type === 'A' ? '🔒 ' + t('comment_private') : '')}</span>
                <button class="btn primary" type="submit">${t('comment_send')}</button>
              </div></form>`
            : html`<p class="mt"><a href="#/login?next=${encodeURIComponent('/idea/' + i.id)}">${t('login')}</a> · ${t('login_needed_text')}</p>`}
        </section>
      </div>

      <aside class="stack">
        ${i.history && i.history.length ? html`<div class="card"><h3>${t('history')}</h3>
          <div class="table-wrap"><table><thead><tr><th>${t('cycle')}</th><th class="num">${t('score')}</th><th>${t('result')}</th></tr></thead>
          <tbody>${i.history.map((h) => html`<tr>
            <td>#${h.cycle_number}<div class="tiny muted">${monthYear(h.cycle_start)}</div></td>
            <td class="num">${h.up != null ? html`${h.score}<div class="tiny muted">${h.up}👍 ${h.down}👎</div>` :
              (h.responses != null ? html`${h.responses}<div class="tiny muted">${t('responses', { n: '' }).trim()}</div>` : '—')}</td>
            <td>${statusBadge(h.result)}${h.position ? html` <span class="tiny muted">#${h.position}</span>` : ''}</td></tr>`)}
          </tbody></table></div></div>` : ''}
        ${i.status_log && i.status_log.length > 1 ? html`<div class="card"><h3>${t('status_history')}</h3>
          ${i.status_log.map((s) => html`<div class="small row between" style="margin:4px 0">${statusBadge(s.to_status)}<span class="muted tiny">${fmtDateTime(s.created_at)}</span></div>`)}
          </div>` : ''}
        ${isAdmin() ? adminPanel(i) : ''}
      </aside>
    </div>`;
}

function commentView(c) {
  return html`<div class="comment ${c.official ? 'official' : ''} ${c.hidden ? 'is-hidden' : ''}">
    <div class="who">${c.author.name || '—'}
      ${c.official ? html`<span class="badge warn">⭐ ${t('official_reply')}</span>` : ''}
      ${c.private ? html`<span class="badge outline">🔒 ${t('private_comment')}</span>` : ''}
      ${c.hidden ? html`<span class="badge danger">${t('hidden_badge')}</span>` : ''}
      <span class="muted tiny">${relTime(c.created_at)}</span>
    </div>
    <div class="pre">${c.body}</div>
    <div class="row" style="margin-top:4px">
      ${!c.mine ? html`<button class="btn sm ghost tiny" data-action="report" data-type="comment" data-id="${c.id}">⚑ ${t('report')}</button>` : ''}
      ${isAdmin() ? html`
        <button class="btn sm ghost tiny" data-action="hide-comment" data-id="${c.id}" data-value="${c.hidden ? '0' : '1'}">${c.hidden ? t('unhide') : t('hide')}</button>
        <button class="btn sm ghost tiny" data-action="delete-comment" data-id="${c.id}">${t('delete')}</button>` : ''}
    </div>
  </div>`;
}

function adminPanel(i) {
  const downs = (i.voters || []).filter((v) => v.value === 'down' && v.reason);
  return html`<div class="card">
    <h3>🛠 ${t('admin_tools')}</h3>
    ${i.type === 'A' && i.threshold ? html`<div class="stack small mb">
      <div>${t('threshold', { pct: i.threshold.pct, min: i.threshold.min })}</div>
      <div class="badge ${i.threshold.validated ? 'ok' : 'warn'}">${i.threshold.validated ? t('would_validate') : t('would_not_validate')}</div>
      ${i.counts ? html`
        <div class="bar-row"><span>${t('v_importante')}</span>${progress(pct(i.counts.importante, i.counts.responses), 'ok')}<span class="num">${i.counts.importante}</span></div>
        <div class="bar-row"><span>${t('v_deseable')}</span>${progress(pct(i.counts.deseable, i.counts.responses))}<span class="num">${i.counts.deseable}</span></div>
        <div class="bar-row"><span>${t('v_no_importante')}</span>${progress(pct(i.counts.no_importante, i.counts.responses), 'warn')}<span class="num">${i.counts.no_importante}</span></div>` : ''}
    </div>` : ''}
    <div class="row">
      <button class="btn sm" data-action="edit">✏️ ${t('edit')}</button>
      <button class="btn sm" data-action="hide" data-value="${i.hidden ? '0' : '1'}">${i.hidden ? '👁 ' + t('unhide') : '🙈 ' + t('hide')}</button>
      <button class="btn sm" data-action="merge">🔀 ${t('merge')}</button>
      <button class="btn sm danger" data-action="delete">🗑 ${t('delete')}</button>
    </div>
    ${downs.length ? html`<h3 class="mt">${t('reasons_down')}</h3>${downs.map((v) => html`<div class="small" style="margin:6px 0">“${v.reason}” <span class="muted">— ${v.name}</span></div>`)}` : ''}
    <h3 class="mt">${t('voters')}</h3>
    ${(i.voters || []).length ? html`<div class="table-wrap"><table><tbody>${i.voters.map((v) => html`<tr>
        <td>${v.name}<div class="tiny muted">${v.email}</div></td><td>${t('v_' + v.value)}</td></tr>`)}</tbody></table></div>`
      : html`<p class="muted small">${t('no_voters')}</p>`}
  </div>`;
}

const pct = (a, n) => (n ? (100 * a) / n : 0);

export async function editIdeaModal(idea) {
  const cats = store.state.board.settings.categories || [];
  return modal({
    title: t('edit_idea'),
    body: html`<div class="field"><label>${t('title')}</label><input name="title" value="${idea.title}" required maxlength="120"></div>
      <div class="field"><label>${t('description')}</label><textarea name="description" maxlength="4000">${idea.description}</textarea></div>
      <div class="field"><label>${t('category')}</label><select name="category"><option value="">${t('none')}</option>
        ${cats.map((c) => html`<option ${idea.category === c ? 'selected' : ''}>${c}</option>`)}</select></div>`,
    onSubmit: (d) => api(`/admin/ideas/${idea.id}`, { method: 'PATCH', body: d }),
  });
}

export async function mergeModal(idea, candidates) {
  const list = candidates || (await api('/admin/moderation')).ideas;
  const options = list.filter((x) => x.id !== idea.id && x.type === idea.type);
  return modal({
    title: t('merge_title'), submit: t('merge'),
    body: html`<p class="small muted">${t('merge_hint')}</p>
      <p><strong>${idea.title}</strong> →</p>
      <div class="field"><label>${t('merge_into')}</label><select name="target_id" required>
        ${options.map((o) => html`<option value="${o.id}">#${o.id} · ${o.title} (${t('st_' + o.status)})</option>`)}</select></div>`,
    onSubmit: (d) => api(`/admin/ideas/${idea.id}/merge`, { method: 'POST', body: { target_id: +d.target_id } }),
  }).then((r) => { if (r) toast('✓'); return r; });
}
