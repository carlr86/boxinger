import { api } from './ui.js';
import { setLang, setZone } from './i18n.js';

export const store = { state: null };

const LANG_KEY = 'ib_lang';
export function preferredLang(state) {
  try { const l = localStorage.getItem(LANG_KEY); if (l) return l; } catch { /* storage unavailable */ }
  return (state.me && state.me.lang) || (state.board && state.board.language) || (navigator.language || 'es').slice(0, 2);
}
export function rememberLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ } }

export async function refreshState() {
  store.state = await api('/state');
  setLang(preferredLang(store.state));
  if (store.state.board) setZone(store.state.board.timezone);
  return store.state;
}

export const me = () => store.state && store.state.me;
export const isAdmin = () => !!(me() && me().role === 'admin');
