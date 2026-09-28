// Sign in (password or magic link), sign up, email verification and profile.
import { html, api, toast, go } from '../ui.js';
import { t, errText, relTime } from '../i18n.js';
import { store, me, rememberLang } from '../store.js';
import { statusBadge } from '../components.js';
import { reloadApp } from '../main.js';

const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

function bindForm(el, sel, fn) {
  const form = el.querySelector(sel);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = form.querySelector('.err');
    const btn = form.querySelector('[type=submit]');
    if (err) err.hidden = true;
    btn.disabled = true;
    try { await fn(Object.fromEntries(new FormData(form))); } catch (ex) {
      if (err) { err.hidden = false; err.textContent = errText(ex.code); }
    } finally { btn.disabled = false; }
  };
}

export async function login(el, ctx) {
  const next = safeNext(ctx.query.next);
  if (me()) return go(next);
  el.innerHTML = String(html`<div class="card auth-box">
    <h1>${t('login_title', { board: store.state.board.name })}</h1>
    <form id="pw" novalidate>
      <div class="field"><label for="email">${t('email')}</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="password">${t('password')}</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
      <div class="alert danger err" hidden></div>
      <button class="btn primary block mt" type="submit">${t('login')}</button>
    </form>
    <div class="divider">${t('or')}</div>
    <form id="magic" novalidate>
      <div class="field"><label for="memail">${t('email')}</label><input id="memail" name="email" type="email" autocomplete="email" required></div>
      <div class="alert danger err" hidden></div>
      <button class="btn block" type="submit">✨ ${t('magic_link')}</button>
    </form>
    <p class="center small mt">${t('no_account')} <a href="#/registro?next=${encodeURIComponent(next)}">${t('register')}</a></p>
  </div>`);
  bindForm(el, '#pw', async (d) => {
    await api('/auth/login', { method: 'POST', body: d });
    await reloadApp(next);
  });
  bindForm(el, '#magic', async (d) => {
    await api('/auth/magic', { method: 'POST', body: { ...d, lang: document.documentElement.lang } });
    el.querySelector('#magic').innerHTML = String(html`<div class="alert ok">📬 ${t('magic_sent', { email: d.email })}</div>`);
  });
}

export async function register(el, ctx) {
  const next = safeNext(ctx.query.next);
  if (me()) return go(next);
  el.innerHTML = String(html`<div class="card auth-box">
    <h1>${t('register_title')}</h1>
    <p class="muted small">${t('register_hint')}</p>
    <form id="reg" novalidate>
      <div class="field"><label for="name">${t('name')}</label><input id="name" name="name" autocomplete="name" required maxlength="80"></div>
      <div class="field"><label for="email">${t('email')}</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="password">${t('password')}</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="alert danger err" hidden></div>
      <button class="btn primary block mt" type="submit">${t('register')}</button>
    </form>
    <p class="center small mt">${t('have_account')} <a href="#/login?next=${encodeURIComponent(next)}">${t('login')}</a></p>
  </div>`);
  bindForm(el, '#reg', async (d) => {
    await api('/auth/register', { method: 'POST', body: { ...d, lang: document.documentElement.lang } });
    await reloadApp(next);
  });
}

export async function consume(el, ctx) {
  el.innerHTML = String(html`<div class="card auth-box center"><p>${t('verifying')}</p></div>`);
  try {
    await api('/auth/consume', { method: 'POST', body: { token: ctx.query.token } });
    toast(t('verified_ok'));
    await reloadApp('/');
  } catch (e) {
    el.innerHTML = String(html`<div class="card auth-box center"><div class="alert danger">${errText(e.code)}</div>
      <p class="mt"><a href="#/login">${t('login')}</a></p></div>`);
  }
}

export async function profile(el) {
  const u = me();
  if (!u) return go('/login?next=/perfil');
  const act = await api('/me/activity');
  const prefKeys = Object.keys(u.prefs).filter((k) => u.role === 'admin' || !['new_report', 'cycle_ending', 'b_alert'].includes(k));
  el.innerHTML = String(html`
    <h1>👤 ${t('profile_title')}</h1>
    <div class="layout-2">
      <div class="stack">
        <section class="card">
          <h2>${t('my_ideas')}</h2>
          ${act.ideas.length ? html`<div class="table-wrap"><table><tbody>${act.ideas.map((i) => html`<tr>
            <td><a href="#/idea/${i.id}">${i.title}</a></td><td>${statusBadge(i.status)}</td><td class="muted small nowrap">${relTime(i.created_at)}</td></tr>`)}
            </tbody></table></div>` : html`<p class="muted">${t('none_yet')}</p>`}
        </section>
        <section class="card">
          <h2>${t('my_votes')}</h2>
          ${act.votes.length ? html`<div class="table-wrap"><table><tbody>${act.votes.map((v) => html`<tr>
            <td><a href="#/idea/${v.idea_id}">${v.title}</a></td>
            <td class="nowrap">${v.value === 'up' ? '👍' : v.value === 'down' ? '👎' : t('v_' + v.value)}</td>
            <td class="muted small nowrap">${t('cycle')} #${v.cycle_number}</td></tr>`)}
            </tbody></table></div>` : html`<p class="muted">${t('none_yet')}</p>`}
        </section>
      </div>
      <form class="card" id="prof">
        <div class="field"><label>${t('email')}</label><input value="${u.email}" disabled>
          <div class="hint">${u.verified ? '✅' : '⚠️ ' + t('verify_banner')}</div></div>
        <div class="field"><label for="pname">${t('name')}</label><input id="pname" name="name" value="${u.name}" maxlength="80"></div>
        <div class="field"><label for="plang">${t('language')}</label><select id="plang" name="lang">
          <option value="es" ${u.lang === 'es' ? 'selected' : ''}>Español</option>
          <option value="en" ${u.lang === 'en' ? 'selected' : ''}>English</option></select></div>
        <h3>${t('notifications')}</h3>
        ${prefKeys.map((k) => html`<label class="check"><input type="checkbox" name="pref_${k}" ${u.prefs[k] ? 'checked' : ''}> ${t('pref_' + k)}</label>`)}
        <div class="alert danger err" hidden></div>
        <button class="btn primary block mt" type="submit">${t('save')}</button>
      </form>
    </div>`);
  const form = el.querySelector('#prof');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const prefs = {};
    prefKeys.forEach((k) => { prefs[k] = form.querySelector(`[name=pref_${k}]`).checked; });
    await api('/me', { method: 'PATCH', body: { name: form.querySelector('[name=name]').value, lang: form.querySelector('[name=lang]').value, prefs } });
    rememberLang(form.querySelector('[name=lang]').value);
    toast(t('saved'));
    await reloadApp();
  };
}
