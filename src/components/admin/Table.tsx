'use client';
import { useState } from 'react';
import { Dropdown, type MenuProps } from 'antd';

export type MenuItems = NonNullable<MenuProps['items']>;

export type Col<T> = {
  key: string; title: string; width: string; sort?: (r: T) => number | string; render: (r: T) => React.ReactNode;
};

const Arrow = ({ up, on }: { up?: boolean; on: boolean }) => (
  <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden style={up ? { transform: 'rotate(180deg)' } : undefined}><path d="M0 0h8L4 5z" fill={on ? '#059669' : '#bfbfbf'} /></svg>
);
const More = () => (<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="3.5" cy="8" r="1.3" fill="currentColor" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="12.5" cy="8" r="1.3" fill="currentColor" /></svg>);

/** Admin table as drawn in the prototype: sortable headers, sticky actions column. */
export function Table<T>({ cols, rows, rowKey, menu, empty, minWidth }: {
  cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; menu?: (r: T) => MenuItems; empty?: string; minWidth: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const col = sort && cols.find((c) => c.key === sort.key);
  const shown = col?.sort ? rows.slice().sort((a, b) => {
    const x = col.sort!(a), y = col.sort!(b);
    const c = typeof x === 'string' ? x.localeCompare(String(y), 'es') : (x as number) - (y as number);
    return sort!.dir === 'asc' ? c : -c;
  }) : rows;
  const grid = cols.map((c) => c.width).join(' ') + (menu ? ' 70px' : '');
  const cell: React.CSSProperties = { padding: '12px 16px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' };

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', overflowX: 'auto' }}>
      <div style={{ minWidth }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontSize: 14, fontWeight: 600 }}>
          {cols.map((c) => {
            const on = sort?.key === c.key;
            return (
              <div key={c.key} title={c.sort ? 'Ordenar por ' + c.title.toLowerCase() : ''}
                onClick={c.sort ? () => setSort(!on ? { key: c.key, dir: 'asc' } : sort!.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : undefined}
                style={{ ...cell, cursor: c.sort ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                {c.title}
                {c.sort && <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><Arrow up on={on && sort!.dir === 'asc'} /><Arrow on={on && sort!.dir === 'desc'} /></span>}
              </div>
            );
          })}
          {menu && <div style={{ ...cell, position: 'sticky', right: 0, background: '#fafafa', boxShadow: '-8px 0 8px -8px rgba(0,0,0,0.15)' }} />}
        </div>
        {shown.map((r) => (
          <div key={rowKey(r)} style={{ display: 'grid', gridTemplateColumns: grid, borderBottom: '1px solid #f0f0f0', fontSize: 14, alignItems: 'center' }}>
            {cols.map((c) => <div key={c.key} style={cell}>{c.render(r)}</div>)}
            {menu && (
              <div style={{ ...cell, position: 'sticky', right: 0, background: '#fff', boxShadow: '-8px 0 8px -8px rgba(0,0,0,0.15)' }}>
                <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: menu(r) }}>
                  <button type="button" title="Acciones" className="bx-icon-btn"><More /></button>
                </Dropdown>
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{empty || 'No hay resultados.'}</div>}
      </div>
    </div>
  );
}
