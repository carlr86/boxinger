// Development mailbox: every email the app "sends" when SMTP isn't configured.
import { html, raw, api, debounce } from '../ui.js';
import { t, fmtDateTime } from '../i18n.js';
import { me } from '../store.js';

function linkify(text) {
  // Escape first, then turn URLs into links (same-origin ones open in the app).
  const escaped = String(html`${text}`);
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const u = url.replace(/&amp;/g, '&');
    const local = u.startsWith(location.origin) ? u.slice(location.origin.length) : null;
    return `<a href="${local || url}" ${local ? '' : 'target="_blank" rel="noopener"'}>${url}</a>`;
  });
}

export async function render(el, ctx) {
  let email = ctx.query.email ?? (me() ? me().email : '');
  let last = '';
  const draw = async () => {
    const data = await api('/dev/mail?email=' + encodeURIComponent(email));
    const sig = email + '|' + data.items.map((m) => m.id).join(',');
    if (sig === last) return; // keep opened/closed state while polling
    last = sig;
    el.querySelector('#list').innerHTML = data.items.length ? data.items.map((m, n) => String(html`<details class="mail" ${n === 0 ? 'open' : ''}>
      <summary><strong>${m.subject}</strong><span class="muted small">→ ${m.email}</span><span class="muted tiny" style="margin-left:auto">${fmtDateTime(m.created_at)}</span></summary>
      <div class="mbody">${raw(linkify(m.body))}</div></details>`)).join('')
      : String(html`<div class="empty">${t('no_mail')}</div>`);
  };
  el.innerHTML = String(html`<h1>📬 ${t('dev_title')}</h1><p class="muted">${t('dev_intro')}</p>
    <div class="filters"><input type="search" id="q" placeholder="${t('filter_email')}" value="${email}"></div>
    <div id="list"></div>`);
  el.querySelector('#q').addEventListener('input', debounce((e) => { email = e.target.value.trim(); draw(); }, 250));
  await draw();
  const timer = setInterval(() => { if (!document.hidden) draw().catch(() => {}); }, 5000);
  return () => clearInterval(timer);
}
