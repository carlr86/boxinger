// Formatting helpers shared by server and client. All copy is es-AR.

const DAY = 864e5;

export function fmtPrice(v: number): string {
  v = Math.round(v * 100) / 100;
  return Number.isInteger(v)
    ? v.toLocaleString('es-AR')
    : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function money(currency: 'USD' | 'ARS', v: number): string {
  return (currency === 'ARS' ? 'ARS ' : 'USD ') + fmtPrice(v);
}

const ts = (d: string | number | Date) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : new Date(d).getTime());

export function rel(d: string | number | Date): string {
  const m = (Date.now() - ts(d)) / 6e4;
  if (m < 60) return 'hace unos minutos';
  const h = m / 60;
  if (h < 24) return 'hace ' + Math.floor(h) + (Math.floor(h) === 1 ? ' hora' : ' horas');
  const days = Math.floor(h / 24);
  if (days < 30) return 'hace ' + days + (days === 1 ? ' día' : ' días');
  const mo = Math.floor(days / 30);
  return 'hace ' + mo + (mo === 1 ? ' mes' : ' meses');
}

export const exact = (d: string | number | Date) =>
  new Date(ts(d)).toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const dshort = (d: string | number | Date) => new Date(ts(d)).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
export const ddmmyyyy = (d: string | number | Date) =>
  new Date(ts(d)).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const dlong = (d: string | number | Date) =>
  new Date(ts(d)).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
export const daysSince = (d: string | number | Date) => Math.max(0, Math.floor((Date.now() - ts(d)) / DAY));
export const daysL = (n: number) => (n === 0 ? 'Hoy' : n + (n === 1 ? ' día' : ' días'));

export const ini = (n: string) =>
  (n || '?')
    .trim()
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

export function slugify(n: string): string {
  return n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

const AV = ['#6b5b95', '#7c5cbf', '#c2703d', '#3a78b5', '#a8487a', '#5b8a3a', '#8a6d3b', '#4f6d8a'];
export function avatarColor(id: string): string {
  let h = 7;
  for (const ch of id || '') h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AV[Math.abs(h) % AV.length];
}
