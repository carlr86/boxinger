// Tiny rendering + API helpers. `html` escapes every interpolation unless wrapped in raw().
import { t, errText } from './i18n.js';

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += fmt(vals[i]); });
  return new Raw(out);
}

export async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'generic');
    e.code = data.error || 'generic';
    e.status = res.status;
    throw e;
  }
  return data;
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
export const toastError = (e) => toast(errText(e && e.code), 'error');

// Modal with a form. Resolves with onSubmit's result (or the form data), or null if cancelled.
export function modal({ title, body = '', submit = t('save'), cancel = t('cancel'), danger = false, onSubmit }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = String(html`<div class="modal-backdrop"><form class="modal" role="dialog" aria-modal="true" novalidate>
      <h2>${title}</h2>${body}
      <div class="alert danger err mt" hidden></div>
      <div class="actions">
        <button type="button" class="btn" data-close>${cancel}</button>
        <button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${submit}</button>
      </div></form></div>`);
    const form = root.querySelector('form');
    const err = root.querySelector('.err');
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const close = (v) => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); resolve(v); };
    document.addEventListener('keydown', onKey);
    root.querySelector('[data-close]').onclick = () => close(null);
    root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(null);
    });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = onSubmit ? await onSubmit(data) : data;
        close(r === undefined ? data : r);
      } catch (ex) {
        err.hidden = false;
        err.textContent = errText(ex.code);
        btn.disabled = false;
      }
    };
    const first = form.querySelector('textarea, input, select');
    (first || form.querySelector('[type=submit]')).focus();
  });
}

export const confirmModal = (title, text, submit, danger = true) =>
  modal({ title, body: html`<p>${text}</p>`, submit, danger });

export const isModalOpen = () => !!document.querySelector('#modal-root .modal');

// Delegated click handling: <button data-action="vote" data-id="3">
export function bindActions(el, actions) {
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a || !el.contains(a)) return;
    const fn = actions[a.dataset.action];
    if (!fn) return;
    e.preventDefault();
    if (a.disabled) return;
    try { await fn(a.dataset, a, e); } catch (ex) { console.error(ex); toastError(ex); }
  });
}

export function spinner() { return html`<div class="spinner" aria-label="…"></div>`; }

export function debounce(fn, ms) {
  let h;
  return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
}

export function go(path) { location.hash = '#' + path; }
