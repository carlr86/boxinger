'use client';
import React from 'react';
import { Tooltip } from 'antd';
import { ini, avatarColor } from '@/lib/format';
import { useI18n } from '@/lib/i18n/client';
import { RATE_C, type Tone, TEXT3, TEXT2, BORDER } from '@/lib/constants';

export function Tag({ tone, children, style, title }: { tone?: Tone; children: React.ReactNode; style?: React.CSSProperties; title?: string }) {
  const t = tone || { bg: '#fff', bd: '#d9d9d9', fg: TEXT2, l: '' };
  return (
    <span
      title={title}
      style={{ fontSize: 12, lineHeight: '20px', padding: '0 7px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid ' + t.bd, background: t.bg, color: t.fg, whiteSpace: 'nowrap', ...style }}
    >
      {children}
    </span>
  );
}

export function ProPill({ style }: { style?: React.CSSProperties }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 400, lineHeight: '18px', padding: '0 6px', borderRadius: 4, border: '1px solid #a9cbc2', background: '#d1fae5', color: '#059669', ...style }}>Pro</span>
  );
}

export function WarnPill({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', borderRadius: 4, border: '1px solid #ffe58f', background: '#fffbe6', color: '#d48806' }}>{children}</span>;
}

export const TeamIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);
export const CommunityIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="11.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" /><path d="M1.5 13.5c.6-2.2 2.4-3.5 4.5-3.5s3.9 1.3 4.5 3.5M10.5 10.2c1.8-.3 3.4.8 4 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);

export function Box({ children, style, className, onClick }: { children: React.ReactNode; style?: React.CSSProperties; className?: string; onClick?: () => void }) {
  return (
    <div className={className} onClick={onClick} style={{ background: '#fff', borderRadius: 8, border: '1px solid ' + BORDER, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, ...style }}>
      {children}
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, lineHeight: 1.35 }}>{title}</h1>
        {sub && <p style={{ margin: 0, color: TEXT3, fontSize: 14, textWrap: 'pretty' }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Segmented control as drawn in the prototype (grey track, white selected pill). */
export function Seg<T extends string>({ options, value, onChange, small, style }: {
  options: [T, React.ReactNode][]; value: T; onChange: (v: T) => void; small?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, background: '#ebebeb', padding: 2, borderRadius: 6, alignSelf: 'flex-start', flexWrap: 'wrap', ...style }}>
      {options.map(([v, l]) => {
        const on = v === value;
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{ border: 0, cursor: 'pointer', fontSize: small ? 13 : 14, padding: small ? '3px 10px' : '4px 12px', borderRadius: 4, background: on ? '#fff' : 'transparent', color: on ? 'rgba(0,0,0,0.88)' : TEXT2, boxShadow: on ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** Button group where the selected option is filled (categories, visibility, priority…). */
export function Choice<T extends string>({ options, value, onChange, tones, style }: {
  options: [T, React.ReactNode][]; value: T | null | undefined; onChange: (v: T) => void; tones?: Record<string, Tone>; style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', ...style }}>
      {options.map(([v, l], n) => {
        const on = v === value;
        const t = tones?.[v];
        const radius = options.length === 1 ? '6px' : n === 0 ? '6px 0 0 6px' : n === options.length - 1 ? '0 6px 6px 0' : '0';
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{ height: 32, padding: '0 14px', fontSize: 14, cursor: 'pointer', marginLeft: n ? -1 : 0, position: 'relative', zIndex: on ? 1 : 0, borderRadius: radius,
              border: '1px solid ' + (on ? (t ? t.bd : '#059669') : '#d9d9d9'), background: on ? (t ? t.bg : '#059669') : '#fff', color: on ? (t ? t.fg : '#fff') : 'rgba(0,0,0,0.88)' }}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Dots({ v, k, big, hover, onPick, onHover }: {
  v: number; k: 'impact' | 'effort'; big?: boolean; hover?: number; onPick?: (n: number) => void; onHover?: (n: number) => void;
}) {
  const shown = hover || v;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: big ? 6 : 3 }} onMouseLeave={onHover ? () => onHover(0) : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= shown;
        const size = on ? (big ? 16 : 10) : big ? 6 : 4;
        return (
          <span key={n} onClick={onPick ? () => onPick(n) : undefined} onMouseEnter={onHover ? () => onHover(n) : undefined}
            style={{ width: big ? 18 : 10, height: big ? 18 : 10, display: 'grid', placeItems: 'center', cursor: onPick ? 'pointer' : 'default' }}>
            <span style={{ width: size, height: size, borderRadius: '50%', background: on ? (hover && n > v ? RATE_C[k] + 'aa' : RATE_C[k]) : '#d0d0d0', transition: 'all .1s' }} />
          </span>
        );
      })}
    </span>
  );
}

export function Avatar({ name, id, url, size = 32, square, color, style }: {
  name: string; id?: string; url?: string | null; size?: number; square?: boolean; color?: string; style?: React.CSSProperties;
}) {
  const radius = square ? (size >= 36 ? 8 : size >= 22 ? 5 : 4) : '50%';
  // Google profile photos rate-limit hotlinking with a Referer; fall back to initials if it still fails.
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [url]);
  if (url && !broken)
    return <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ flex: 'none', width: size, height: size, borderRadius: radius, objectFit: 'cover', ...style }} />;
  return (
    <span style={{ flex: 'none', width: size, height: size, borderRadius: radius, background: color || avatarColor(id || name), color: '#fff', display: 'grid', placeItems: 'center',
      fontSize: Math.max(10, Math.round(size * (square ? 0.36 : 0.4))), fontWeight: square ? 700 : 600, ...style }}>
      {ini(name)}
    </span>
  );
}

export function ProLock({ title, text, onGo }: { title: string; text: string; onGo: () => void }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid ' + BORDER, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', maxWidth: 640 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 600 }}>{title} <ProPill /></span>
      <span style={{ fontSize: 14, color: TEXT2, textWrap: 'pretty' }}>{text}</span>
      <button type="button" className="bx-btn-primary" onClick={onGo}>Ver plan Pro</button>
    </div>
  );
}

export function Note({ tone = 'info', children, style }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode; style?: React.CSSProperties }) {
  const c = { info: ['#e6f4ff', '#91caff'], warn: ['#fffbe6', '#ffe58f'], error: ['#fff2f0', '#ffccc7'], success: ['#f6ffed', '#b7eb8f'] }[tone];
  return <div style={{ background: c[0], border: '1px solid ' + c[1], borderRadius: 8, padding: '8px 12px', fontSize: 14, textWrap: 'pretty', ...style }}>{children}</div>;
}

export function Field({ label, error, hint, children, style }: { label: React.ReactNode; error?: string; hint?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, ...style }}>
      {label}
      {children}
      {error ? <span style={{ fontSize: 13, color: '#ff4d4f' }}>{error}</span> : hint ? <span style={{ fontSize: 12, color: TEXT3 }}>{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, note, big }: { label: string; value: React.ReactNode; note?: React.ReactNode; big?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid ' + BORDER, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 14, color: TEXT3 }}>{label}</span>
      <span style={{ fontSize: big === false ? 20 : 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {note && <span style={{ fontSize: 12, color: TEXT3 }}>{note}</span>}
    </div>
  );
}

export function Rows({ rows }: { rows: { l: string; v: React.ReactNode; fg?: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => (
        <div key={r.l + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid ' + BORDER, fontSize: 14 }}>
          <span style={{ color: TEXT3 }}>{r.l}</span>
          <span style={{ color: r.fg || 'rgba(0,0,0,0.88)', textAlign: 'right' }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 14, fontWeight: 600 }}>{children}</span>;
}

export function Empty({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: '56px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
      <svg width="64" height="41" viewBox="0 0 64 41" aria-hidden><g transform="translate(0 1)" fill="none" fillRule="evenodd"><ellipse fill="#f5f5f5" cx="32" cy="33" rx="32" ry="7" /><g fillRule="nonzero" stroke="#d9d9d9"><path d="M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z" /><path d="M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35h-40.1C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z" fill="#fafafa" /></g></g></svg>
      <span style={{ color: TEXT3, fontSize: 14 }}>{text}</span>
      {cta}
    </div>
  );
}

/** Horizontal bar used in breakdowns and funnels. */
export function Bar({ pct, color, h = 8, track = '#f5f5f5' }: { pct: string; color: string; h?: number; track?: string }) {
  return (
    <div style={{ height: h, background: track, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct, background: color, borderRadius: 4 }} />
    </div>
  );
}

/** Email input that turns each address into a chip on Enter or comma (prototype's invite field). */
export function EmailChips({ value, onChange, placeholder = 'email@ejemplo.com y Enter', onInvalid }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string; onInvalid?: (e: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = React.useState('');
  const add = () => {
    const parts = text.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const bad = parts.find((p) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p));
    if (bad) { onInvalid ? onInvalid(bad) : alert(t('Email inválido: {email}', { email: bad })); return; }
    onChange(Array.from(new Set(value.concat(parts))));
    setText('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 6px', minHeight: 32, background: '#fff' }}>
      {value.map((em) => (
        <span key={em} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: '22px', padding: '0 4px 0 8px', borderRadius: 4, background: 'rgba(0,0,0,0.06)' }}>
          {em}<a onClick={() => onChange(value.filter((x) => x !== em))} style={{ color: TEXT3, fontSize: 14, lineHeight: 1 }}>×</a>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={value.length ? '' : t(placeholder)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
        onBlur={add}
        style={{ flex: 1, minWidth: 160, border: 0, outline: 'none', fontSize: 14, height: 24, background: 'transparent' }} />
    </div>
  );
}

/** On/off switch drawn like the prototype (44×22, primary green). */
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ flex: 'none', position: 'relative', width: 44, height: 22, borderRadius: 11, border: 0, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, background: on ? '#059669' : 'rgba(0,0,0,0.25)', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 24 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,35,11,0.2)', transition: 'left .2s' }} />
    </button>
  );
}

/** Label + description + switch, for permission settings. */
export function ToggleRow({ label, desc, on, onChange, disabled }: { label: React.ReactNode; desc?: React.ReactNode; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14 }}>{label}</span>
        {desc && <span style={{ fontSize: 13, color: TEXT3 }}>{desc}</span>}
      </div>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Small "?" that explains a number or setting (hover on desktop, tap on phones). */
export function Help({ children, label = 'Cómo se calcula' }: { children: React.ReactNode; label?: string }) {
  const { t } = useI18n();
  return (
    <Tooltip title={<div style={{ fontSize: 13, lineHeight: 1.5 }}>{children}</div>} trigger={['hover', 'click']} styles={{ root: { maxWidth: 300 } }}>
      <span role="button" tabIndex={0} aria-label={t(label)} onClick={(e) => e.stopPropagation()}
        style={{ display: 'inline-grid', placeItems: 'center', width: 16, height: 16, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.25)', color: 'rgba(0,0,0,0.45)', fontSize: 11, fontWeight: 600, lineHeight: 1, cursor: 'help', flex: 'none', verticalAlign: 'middle' }}>?</span>
    </Tooltip>
  );
}
