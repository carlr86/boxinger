// Propose a community idea (type C), with duplicate suggestions while typing.
import { html, api, debounce, toast, go } from '../ui.js';
import { t, errText } from '../i18n.js';
import { store, me } from '../store.js';
import { statusBadge } from '../components.js';

export async function render(el) {
  const u = me();
  if (!u) return go('/login?next=' + encodeURIComponent('/proponer'));
  const cats = store.state.board.settings.categories || [];
  const cycle = store.state.cycle;
  el.innerHTML = String(html`
    <a href="#/" class="small">${t('back')}</a>
    <div class="card mt" style="max-width:680px">
      <h1>💡 ${t('propose_title')}</h1>
      <p class="muted small">${t('propose_hint')}</p>
      ${!u.verified ? html`<div class="alert mb">${t('verify_banner')}</div>` : ''}
      ${!cycle || cycle.status !== 'activo' ? html`<div class="alert mb">${t('err_no_active_cycle')}</div>` : ''}
      <form id="f" novalidate>
        <div class="field"><label for="title">${t('title')}</label>
          <input id="title" name="title" maxlength="120" required placeholder="${t('title_ph')}" autocomplete="off"></div>
        <div id="similar"></div>
        <div class="field"><label for="description">${t('description')}</label>
          <textarea id="description" name="description" maxlength="4000" placeholder="${t('description_ph')}"></textarea></div>
        <div class="field"><label for="category">${t('category')}</label>
          <select id="category" name="category"><option value="">${t('none')}</option>
          ${cats.map((c) => html`<option>${c}</option>`)}</select></div>
        <div class="alert danger" id="err" hidden></div>
        <div class="row between mt"><a href="#/" class="btn ghost">${t('cancel')}</a>
          <button class="btn primary" type="submit" ${!u.verified ? 'disabled' : ''}>${t('publish')}</button></div>
      </form>
    </div>`);

  const sim = el.querySelector('#similar');
  el.querySelector('#title').addEventListener('input', debounce(async (e) => {
    const v = e.target.value.trim();
    if (v.length < 3) { sim.innerHTML = ''; return; }
    const r = await api('/ideas/similar?q=' + encodeURIComponent(v));
    sim.innerHTML = r.items.length ? String(html`<div class="similar field"><strong>🔎 ${t('similar_title')}</strong>
      ${r.items.map((i) => html`<a href="#/idea/${i.id}" target="_blank" rel="noopener">${i.title} ${statusBadge(i.status)}</a>`)}</div>`) : '';
  }, 300));

  const form = el.querySelector('#f');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = el.querySelector('#err');
    err.hidden = true;
    const body = Object.fromEntries(new FormData(form));
    try {
      const r = await api('/ideas', { method: 'POST', body });
      toast(t('published'));
      go('/idea/' + r.id);
    } catch (ex) {
      err.hidden = false;
      err.textContent = errText(ex.code);
    }
  };
}
