// First run: create organization, board, admin account and the first cycle.
import { html, api, go } from '../ui.js';
import { t, errText } from '../i18n.js';
import { store } from '../store.js';
import { reloadApp } from '../main.js';

function firstOfNextMonth() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
}

export async function render(el) {
  if (!store.state.setup_needed) return go('/');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires';
  el.innerHTML = String(html`<div class="card" style="max-width:640px;margin:0 auto">
    <h1>🚀 ${t('setup_title')}</h1>
    <p class="muted">${t('setup_intro')}</p>
    <form id="f" novalidate>
      <h3>${t('board_section')}</h3>
      <div class="grid2">
        <div class="field"><label>${t('board_name')}</label><input name="board_name" required placeholder="Acme App"></div>
        <div class="field"><label>${t('org_name')}</label><input name="org_name" placeholder="Acme"></div>
        <div class="field"><label>${t('language')}</label><select name="language">
          <option value="es">Español</option><option value="en">English</option></select></div>
        <div class="field"><label>${t('timezone')}</label><input name="timezone" value="${tz}"></div>
        <div class="field"><label>${t('duration')}</label><select name="kind">
          <option value="mensual">${t('mensual')}</option><option value="trimestral">${t('trimestral')}</option></select></div>
        <div class="field"><label>${t('start_date')}</label><input type="date" name="start_date" value="${firstOfNextMonth()}">
          <div class="hint">${t('start_hint')}</div></div>
      </div>
      <h3>Admin</h3>
      <div class="grid2">
        <div class="field"><label>${t('name')}</label><input name="name" required autocomplete="name"></div>
        <div class="field"><label>${t('email')}</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>${t('password')}</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      </div>
      <div class="alert danger" id="err" hidden></div>
      <button class="btn primary block mt" type="submit">${t('create_board')}</button>
    </form></div>`);
  const form = el.querySelector('#f');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = el.querySelector('#err');
    err.hidden = true;
    try {
      await api('/setup', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      await reloadApp('/admin');
    } catch (ex) { err.hidden = false; err.textContent = errText(ex.code); }
  };
}
