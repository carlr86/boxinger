// App shell: hash router, header/nav, verification banner, live countdowns.
import { html, api, toast, toastError, spinner, go } from './ui.js';
import { t, setLang, getLang, errText } from './i18n.js';
import { store, refreshState, me, isAdmin, rememberLang } from './store.js';
import * as board from './views/board.js';
import * as idea from './views/idea.js';
import * as propose from './views/propose.js';
import * as pub from './views/public.js';
import * as account from './views/account.js';
import * as admin from './views/admin.js';
import * as setup from './views/setup.js';
import * as devmail from './views/devmail.js';

const ROUTES = [
  [/^\/$/, (el, c) => board.render(el, { ...c, tab: 'comunidad' })],
  [/^\/equipo$/, (el, c) => board.render(el, { ...c, tab: 'equipo' })],
  [/^\/nofinalistas$/, (el, c) => board.render(el, { ...c, tab: 'nofinalistas' })],
  [/^\/idea\/(\d+)$/, idea.render],
  [/^\/proponer$/, propose.render],
  [/^\/finalistas$/, pub.finalists],
  [/^\/roadmap$/, pub.roadmap],
  [/^\/login$/, account.login],
  [/^\/registro$/, account.register],
  [/^\/auth$/, account.consume],
  [/^\/perfil$/, account.profile],
  [/^\/setup$/, setup.render],
  [/^\/dev\/mail$/, devmail.render],
  [/^\/admin$/, admin.dashboard, true],
  [/^\/admin\/equipo$/, admin.team, true],
  [/^\/admin\/moderacion$/, admin.moderation, true],
  [/^\/admin\/cierre$/, admin.close, true],
  [/^\/admin\/priorizacion$/, admin.prioritization, true],
  [/^\/admin\/roadmap$/, admin.roadmap, true],
  [/^\/admin\/config$/, admin.settings, true],
];

let cleanup = null;
let renderSeq = 0;

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function route() {
  const seq = ++renderSeq;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const { path, query } = parseHash();
  const st = store.state;
  if (st.setup_needed && path !== '/setup' && path !== '/dev/mail') return go('/setup');
  renderChrome(path);
  // Each render gets a fresh container so delegated listeners never leak between views.
  const view = document.createElement('div');
  document.getElementById('view').replaceChildren(view);
  const match = ROUTES.find(([rx]) => rx.test(path));
  if (!match) { view.innerHTML = String(html`<div class="empty">${t('err_not_found')}</div>`); return; }
  const [rx, fn, adminOnly] = match;
  if (adminOnly && !isAdmin()) return go(me() ? '/' : '/login?next=' + encodeURIComponent(path));
  view.innerHTML = String(spinner());
  const params = rx.exec(path).slice(1);
  try {
    const ctx = { params, query, path, rerender: () => route(), isCurrent: () => seq === renderSeq };
    const c = await fn(view, ctx);
    if (seq !== renderSeq) { if (typeof c === 'function') c(); return; }
    if (typeof c === 'function') cleanup = c;
  } catch (e) {
    console.error(e);
    if (seq === renderSeq) view.innerHTML = String(html`<div class="empty">${errText(e.code)}</div>`);
  }
  if (!('noscroll' in query)) window.scrollTo(0, 0);
  tickCountdowns();
}

function renderChrome(path) {
  const st = store.state;
  const b = st.board;
  document.title = b ? b.name + ' · Insight Backlog' : 'Insight Backlog';
  document.getElementById('brand').innerHTML = String(b
    ? html`${b.logo_url ? html`<img src="${b.logo_url}" alt="">` : html`<span class="logo">${b.name.slice(0, 1).toUpperCase()}</span>`}<span>${b.name}</span>`
    : html`<span class="logo">IB</span><span>Insight Backlog</span>`);
  const inIdeas = path === '/' || path === '/equipo' || path === '/nofinalistas' || path.startsWith('/idea') || path === '/proponer';
  const link = (href, label, active) => html`<a href="#${href}" class="${active ? 'active' : ''}">${label}</a>`;
  document.getElementById('mainnav').innerHTML = b ? String(html`
    ${link('/', t('nav_ideas'), inIdeas)}
    ${link('/finalistas', t('nav_finalists'), path === '/finalistas')}
    ${link('/roadmap', t('nav_roadmap'), path === '/roadmap')}
    ${isAdmin() ? link('/admin', t('nav_admin'), path.startsWith('/admin')) : ''}`) : '';

  const u = me();
  const langSel = html`<select id="langsel" aria-label="Language" style="width:auto;min-height:32px;padding:4px 6px">
      <option value="es" ${getLang() === 'es' ? 'selected' : ''}>ES</option>
      <option value="en" ${getLang() === 'en' ? 'selected' : ''}>EN</option></select>`;
  document.getElementById('usermenu').innerHTML = String(html`
    ${st.dev ? html`<a class="btn sm ghost" href="#/dev/mail" title="${t('dev_mail')}">📬</a>` : ''}
    ${langSel}
    ${b ? (u
      ? html`<a class="btn sm ghost" href="#/perfil" title="${u.email}">👤 ${u.name.split(' ')[0]}</a>
             <button class="btn sm ghost" id="logout">${t('logout')}</button>`
      : html`<a class="btn sm" href="#/login">${t('login')}</a>`) : ''}`);
  document.getElementById('langsel').onchange = async (e) => {
    setLang(e.target.value);
    rememberLang(e.target.value);
    if (me()) api('/me', { method: 'PATCH', body: { lang: e.target.value } }).catch(() => {});
    route();
  };
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = async () => { await api('/auth/logout', { method: 'POST' }); await refreshState(); go('/'); route(); };

  const banner = document.getElementById('banner');
  banner.innerHTML = u && !u.verified ? String(html`<div class="alert">✉️ ${t('verify_banner')}
      <button class="btn sm" id="resend" style="margin-left:8px">${t('resend')}</button></div>`) : '';
  const rs = document.getElementById('resend');
  if (rs) rs.onclick = async () => { try { await api('/auth/resend', { method: 'POST' }); toast(t('resent')); } catch (e) { toastError(e); } };

  const an = document.getElementById('adminnav');
  an.hidden = !(isAdmin() && path.startsWith('/admin'));
  if (!an.hidden) {
    const items = [['/admin', 'admin_dashboard'], ['/admin/equipo', 'admin_team'], ['/admin/moderacion', 'admin_moderation'],
      ['/admin/cierre', 'admin_close'], ['/admin/priorizacion', 'admin_prioritization'], ['/admin/roadmap', 'admin_roadmap'],
      ['/admin/config', 'admin_settings']];
    an.innerHTML = String(html`<span class="label">Admin</span>${items.map(([h, k]) => link(h, t(k), path === h))}`);
  }
  document.getElementById('footer').innerHTML = String(html`<a href="#/" class="muted">⚡ ${t('made_with')}</a>`);
}

// Live countdowns: <div data-countdown="1700000000">
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    let s = Math.max(0, Math.floor(+el.dataset.countdown - Date.now() / 1000 + (store.skew || 0)));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const units = [[d, t('days')], [h, t('hours')], [m, t('minutes')], [s, t('seconds')]];
    el.innerHTML = String(html`${units.map(([v, l]) => html`<div class="unit"><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`)}`);
  });
}

async function start() {
  try {
    await refreshState();
    store.skew = store.state.server_time ? Date.now() / 1000 - store.state.server_time : 0;
  } catch (e) {
    document.getElementById('view').innerHTML = String(html`<div class="empty">${t('err_generic')}</div>`);
    return;
  }
  window.addEventListener('hashchange', route);
  setInterval(tickCountdowns, 1000);
  route();
}

// Exposed for views that change session/state.
export async function reloadApp(path) {
  await refreshState();
  if (path) { if (location.hash === '#' + path) route(); else go(path); } else route();
}

start();
