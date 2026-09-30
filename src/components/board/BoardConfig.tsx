'use client';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Popconfirm } from 'antd';
import { rpc, flushEmails } from '@/lib/rpc';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Avatar, EmailChips, Note, PageHead, ProPill, Seg, ToggleRow } from '@/components/ui';
import { displayUrl, boardUrl } from '@/lib/env';
import { rel, plural } from '@/lib/format';
import type { BoardApi } from './shared';
import { useToast } from '@/components/Providers';
import { VisibilityModal } from './VisibilityModal';
import { VISIBILITY } from '@/lib/constants';

type Tab = 'general' | 'cats' | 'com';
const SUB: Record<Tab, string> = {
  general: 'Nombre, descripción y logo que ve la Comunidad.',
  cats: 'Categorías para clasificar las ideas de este buzón.',
  com: 'Invitaciones y miembros de la Comunidad.',
};

export function BoardConfig({ api }: { api: BoardApi }) {
  const [tab, setTab] = useState<Tab>(api.isAdmin ? 'general' : 'com');
  const tabs: [Tab, string][] = api.isAdmin ? [['general', 'General'], ['cats', 'Categorías'], ['com', 'Comunidad']] : [['com', 'Comunidad']];
  return (
    <>
      <PageHead title="Configuración del buzón" sub={SUB[tab]} />
      {tabs.length > 1 && <Seg options={tabs} value={tab} onChange={setTab} />}
      <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tab === 'general' && <General api={api} />}
        {tab === 'cats' && <Categories api={api} />}
        {tab === 'com' && <Community api={api} />}
      </div>
    </>
  );
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 };

function General({ api }: { api: BoardApi }) {
  const toast = useToast();
  const b = api.data.board;
  const [name, setName] = useState(b.name);
  const [desc, setDesc] = useState(b.description);
  const [logo, setLogo] = useState(b.logo_url);
  const [busy, setBusy] = useState(false);
  const [paidNote, setPaidNote] = useState(false);
  const [visOpen, setVisOpen] = useState(false);

  async function upload(file: File) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return toast.err(new Error('Elegí una imagen PNG o JPG'));
    if (file.size > 2 * 1024 * 1024) return toast.err(new Error('La imagen puede pesar hasta 2 MB'));
    setBusy(true);
    const path = `logos/${b.id}/logo-${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
    const sb = supabaseBrowser();
    const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type });
    if (error) { setBusy(false); return toast.err(new Error('No pudimos subir la imagen: ' + error.message)); }
    const url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    await api.run(rpc('update_board', { p_board: b.id, p_logo_url: url }), 'Logo actualizado');
    setLogo(url);
    setBusy(false);
    api.reload();
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Datos del buzón</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>Nombre
        <input className="bx-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', textAlign: 'right' }}>{name.length} / 60</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>Descripción corta
        <textarea className="bx-input" value={desc} maxLength={200} rows={3} onChange={(e) => setDesc(e.target.value)} />
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', textAlign: 'right' }}>{desc.length} / 200</span>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>Visibilidad
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, lineHeight: '22px', padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fafafa' }}>{VISIBILITY[b.visibility].l}</span>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{VISIBILITY[b.visibility].short}</span>
          <button type="button" className="bx-btn" onClick={() => setVisOpen(true)}>Cambiar visibilidad</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          Quiénes pueden crear ideas
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>El dueño del equipo y quien creó el buzón siempre pueden. Votar y comentar no cambia.</span>
        </div>
        {api.pro && (
          <ToggleRow label="Miembros del equipo" desc="Los miembros con acceso a este buzón." on={b.members_can_create_ideas}
            onChange={async (v) => { await api.run(rpc('set_board_idea_permissions', { p_board: b.id, p_members: v, p_guests: null }), v ? 'Los miembros pueden crear ideas' : 'Los miembros ya no pueden crear ideas'); api.reload(); }} />
        )}
        {b.visibility !== 'private' ? (
          <ToggleRow label="Invitados" desc={b.visibility === 'invite' ? 'Las personas que invitaste a este buzón.' : 'La Comunidad que se sumó con el link o por invitación.'} on={b.guests_can_create_ideas}
            onChange={async (v) => { await api.run(rpc('set_board_idea_permissions', { p_board: b.id, p_members: null, p_guests: v }), v ? 'Los invitados pueden crear ideas' : 'Los invitados ya no pueden crear ideas'); api.reload(); }} />
        ) : (
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Los buzones privados no tienen invitados.</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          Qué ven los invitados
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Siempre ven Buzón, Ranking y Backlog. Matriz, Status y la configuración son solo del Equipo.</span>
        </div>
        {b.visibility === 'private' ? (
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Los buzones privados no tienen invitados.</span>
        ) : (
          <ToggleRow label={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Roadmap (solo lectura) <ProPill /></span>}
            desc="Ven las columnas y en qué etapa está cada idea. No ven prioridad, impacto, esfuerzo ni puntaje, y no pueden mover nada."
            on={b.roadmap_setting && api.pro}
            onChange={async (v) => {
              if (v && !api.pro) return api.goPro();
              await api.run(rpc('set_board_roadmap_public', { p_board: b.id, p_on: v }), v ? 'Los invitados ya ven el Roadmap' : 'El Roadmap vuelve a ser solo del Equipo');
              api.reload();
            }} />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>Logo
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ width: 104, height: 104, border: '1px dashed #d9d9d9', borderRadius: 8, background: '#fafafa', display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 13, color: 'rgba(0,0,0,0.65)', cursor: 'pointer', overflow: 'hidden' }}>
            {logo ? <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>+<br />Subir</span>}
            <input type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          </label>
          {logo && <a className="bx-link-muted" onClick={async () => { await api.run(rpc('update_board', { p_board: b.id, p_clear_logo: true }), 'Logo quitado'); setLogo(null); api.reload(); }}>Quitar logo</a>}
        </div>
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>PNG o JPG, hasta 2 MB</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="bx-btn-primary" disabled={busy}
          onClick={async () => {
            if (!name.trim()) return toast.err(new Error('El nombre es obligatorio'));
            await api.run(rpc('update_board', { p_board: b.id, p_name: name, p_description: desc }), 'Buzón actualizado');
            api.reload();
          }}>Guardar cambios</button>
        <button type="button" className="bx-btn" onClick={() => (api.pro ? (window.location.href = '/app/buzones?crear=1') : setPaidNote(true))}>Crear otro buzón</button>
      </div>
      {paidNote && <Note>Buzones ilimitados en el plan Pro. <a onClick={api.goPro}>Ver planes</a></Note>}
      <VisibilityModal board={visOpen ? { id: b.id, name: b.name, visibility: b.visibility, guests: b.guests } : null} pro={api.pro}
        onClose={() => setVisOpen(false)} onDone={() => api.reload()} onGoPro={api.goPro} />
    </div>
  );
}

function Categories({ api }: { api: BoardApi }) {
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [del, setDel] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>('');
  const cats = api.cats;
  const used = (id: string) => api.data.ideas.filter((i) => i.category_id === id).length;
  const only = cats.length <= 1;
  const dc = del ? cats.find((c) => c.id === del) : null;
  const targets = dc ? cats.filter((c) => c.id !== dc.id) : [];
  const dn = dc ? used(dc.id) : 0;

  async function add() {
    const v = newName.trim();
    if (!v) return setErr('Escribí un nombre');
    if (cats.some((c) => c.name.toLowerCase() === v.toLowerCase())) return setErr('Ya existe una categoría con ese nombre');
    if (cats.length >= 12) return setErr('Máximo 12 categorías');
    const r = await api.run(rpc('add_category', { p_board: api.data.board.id, p_name: v }), 'Categoría agregada');
    if (r !== undefined) { setNewName(''); setErr(''); api.reload(); }
  }
  async function saveEdit() {
    if (!editVal.trim()) return toast.err(new Error('El nombre no puede quedar vacío'));
    const r = await api.run(rpc('rename_category', { p_id: edit, p_name: editVal }), 'Categoría actualizada');
    if (r !== undefined) { setEdit(null); api.reload(); }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Categorías</div>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>Se usan al cargar ideas y para filtrar el Buzón, el Ranking y el Backlog. El buzón necesita al menos 1 categoría.</span>
      </div>
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8 }}>
        {cats.map((c) => {
          const n = used(c.id);
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #f0f0f0', minHeight: 52 }}>
              {edit === c.id ? (
                <>
                  <input autoFocus className="bx-input" style={{ flex: 1, minWidth: 0, borderColor: '#059669' }} maxLength={40} value={editVal} onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null); }} />
                  <a onClick={saveEdit} style={{ fontSize: 14 }}>Guardar</a>
                  <a onClick={() => setEdit(null)} className="bx-link-muted" style={{ fontSize: 14 }}>Cancelar</a>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{n === 0 ? 'Sin ideas' : plural(n, 'idea', 'ideas')}</span>
                  </div>
                  <a onClick={() => { setEdit(c.id); setEditVal(c.name); }} style={{ fontSize: 14 }}>Editar</a>
                  <a onClick={() => (only ? toast.info('El buzón necesita al menos 1 categoría') : (setDel(c.id), setMoveTo('')))} title={only ? 'El buzón necesita al menos 1 categoría' : ''}
                    style={{ fontSize: 14, color: only ? 'rgba(0,0,0,0.25)' : '#cf1322', cursor: only ? 'not-allowed' : 'pointer' }}>Eliminar</a>
                </>
              )}
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8, padding: 12 }}>
          <input className={'bx-input' + (err ? ' err' : '')} style={{ flex: 1, minWidth: 0 }} placeholder="Nueva categoría" maxLength={40} value={newName}
            onChange={(e) => { setNewName(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button type="button" className="bx-btn" onClick={add}>+ Agregar</button>
        </div>
        {err && <span style={{ fontSize: 13, color: '#ff4d4f', padding: '0 12px 12px', display: 'block' }}>{err}</span>}
      </div>
      <a style={{ fontSize: 14, alignSelf: 'flex-start' }} onClick={async () => {
        const n = await api.run(rpc<number>('reset_categories', { p_board: api.data.board.id }));
        if (n === undefined) return;
        toast.info(n === 0 ? 'Ya tenés las categorías por defecto' : n === 1 ? 'Se agregó 1 categoría por defecto' : 'Se agregaron ' + n + ' categorías por defecto');
        api.reload();
      }}>Restaurar categorías por defecto</a>

      <Modal open={!!dc} onCancel={() => setDel(null)} title={dc ? `Eliminar "${dc.name}"` : ''} width={440} destroyOnHidden
        okText="Eliminar" cancelText="Cancelar" okButtonProps={{ danger: true }}
        onOk={async () => {
          const to = moveTo || targets[0]?.id;
          const r = await api.run(rpc<number>('delete_category', { p_id: dc!.id, p_move_to: dn ? to : null }));
          if (r === undefined) return;
          toast.ok(dn ? `Categoría eliminada · ${plural(dn, 'idea movida', 'ideas movidas')}` : 'Categoría eliminada');
          setDel(null);
          api.reload();
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
            {dn > 0 ? `${dn === 1 ? '1 idea usa' : dn + ' ideas usan'} esta categoría. Elegí a qué categoría moverlas antes de eliminarla.` : 'Ninguna idea usa esta categoría. Esta acción no se puede deshacer.'}
          </span>
          {dn > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Mover las ideas a
              <select className="bx-select" value={moveTo || targets[0]?.id} onChange={(e) => setMoveTo(e.target.value)}>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** Pro: anyone with a verified email from these domains can enter an invite-only board. */
function AllowedDomains({ api }: { api: BoardApi }) {
  const b = api.data.board;
  const [list, setList] = useState<string[]>(b.allowed_domains || []);
  const [input, setInput] = useState('');
  useEffect(() => { setList(b.allowed_domains || []); }, [b.allowed_domains]);
  async function save(next: string[], msg: string) {
    const r = await api.run(rpc<string[]>('set_board_domains', { p_board: b.id, p_domains: next }), msg);
    if (r) { setList(r); setInput(''); api.reload(); }
  }
  const add = () => { const d = input.trim().toLowerCase().replace(/^@/, ''); if (d) save([...list, d], 'Dominio agregado'); };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600 }}>Acceso por dominio <ProPill /></div>
      <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
        Cualquiera que ingrese con un email verificado de estos dominios entra como invitado, sin que tengas que invitarlo. Ideal para los empleados de un cliente: por ejemplo, <b>cliente.com</b>.
      </span>
      {!api.pro ? (
        <Note>El acceso por dominio está disponible en Pro. <a onClick={api.goPro}>Ver planes</a></Note>
      ) : (
        <>
          {list.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {list.map((d) => (
                <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: '24px', padding: '0 4px 0 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fafafa' }}>
                  @{d}
                  <button type="button" aria-label={'Quitar ' + d} onClick={() => save(list.filter((x) => x !== d), 'Dominio quitado')}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'rgba(0,0,0,0.45)', fontSize: 15, lineHeight: 1, padding: '0 4px' }}>×</button>
                </span>
              ))}
            </div>
          )}
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input className="bx-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="cliente.com" style={{ flex: 1, minWidth: 180, maxWidth: 320 }} />
            <button type="submit" className="bx-btn" disabled={!input.trim()}>Agregar dominio</button>
          </form>
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>No se aceptan dominios de email personal (gmail.com, hotmail.com…), porque dejarían entrar a cualquiera.</span>
        </>
      )}
    </div>
  );
}

type Guest = { user_id: string; name: string; email: string; avatar_url: string | null; joined_at: string; status: 'active' | 'blocked' };

function Community({ api }: { api: BoardApi }) {
  const toast = useToast();
  const b = api.data.board;
  const [data, setData] = useState<{ guests: Guest[]; pending: { id: string; email: string; created_at: string }[]; invite_code: string } | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const load = useCallback(async () => {
    try { setData(await rpc('get_board_community', { p_board: b.id })); } catch (e) { toast.err(e); }
  }, [b.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const link = boardUrl(b.slug) + '?invitacion=' + (data?.invite_code || b.invite_code || '');
  const priv = b.visibility === 'private';

  return (
    <>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Invitar a la Comunidad</div>
        {priv ? (
          <Note>Los buzones privados son solo para el Equipo y no admiten invitados de la Comunidad.</Note>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>{b.visibility === 'invite' ? 'Link del buzón' : 'Link público'}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 4px 4px 11px', background: '#fafafa' }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(b.slug)}</span>
                <a style={{ padding: '4px 10px' }} onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); toast.ok('Link del buzón copiado'); }}>Copiar</a>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                {b.visibility === 'invite'
                  ? 'Solo funciona para quienes invitaste por email' + (b.allowed_domains?.length ? ' o tienen un email de los dominios permitidos' : '') + '. Si le llega a otra persona, no ve el buzón.'
                  : `Quien se registre desde este link queda como Comunidad de ${b.name}.`}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>Invitar por email
              <EmailChips value={emails} onChange={setEmails} />
            </div>
            <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                if (!emails.length) return toast.info('Agregá al menos un email');
                const n = await api.run(rpc<number>('invite_guests', { p_board: b.id, p_emails: emails }));
                if (n === undefined) return;
                flushEmails();
                toast.ok(n === 0 ? 'Esas personas ya son parte de la Comunidad' : n === 1 ? 'Invitación enviada' : n + ' invitaciones enviadas');
                setEmails([]);
                load();
              }}>Enviar invitaciones</button>
            {!!data?.pending.length && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Invitaciones pendientes</span>
                {data.pending.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{p.email} <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>· {rel(p.created_at)}</span></span>
                    <a className="bx-link-muted" onClick={async () => { await api.run(rpc('revoke_invitation', { p_id: p.id }), 'Invitación cancelada'); load(); }}>Cancelar</a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {b.visibility === 'invite' && b.allowed_domains && <AllowedDomains api={api} />}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Miembros de la Comunidad · {data?.guests.length ?? '…'}</div>
        {data && data.guests.length === 0 && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>Todavía no hay miembros de la Comunidad. {b.visibility === 'invite' ? 'Invitá personas por email para sumarlas.' : 'Compartí el link del buzón para sumar personas.'}</span>}
        {data?.guests.map((m) => (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: m.status === 'blocked' ? 0.5 : 1 }}>
            <Avatar name={m.name} id={m.user_id} url={m.avatar_url} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14 }}>{m.name}</span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email} · se unió {rel(m.joined_at)}</span>
            </div>
            {m.status === 'blocked' && <span style={{ fontSize: 12, color: '#cf1322' }}>Bloqueado</span>}
            {m.status === 'blocked' ? (
              <a style={{ color: '#059669', fontSize: 14 }} onClick={async () => { await api.run(rpc('set_guest_status', { p_board: b.id, p_user: m.user_id, p_status: 'active' }), 'Miembro desbloqueado'); load(); }}>Desbloquear</a>
            ) : (
              <Popconfirm title={`¿Bloquear a ${m.name}?`} description="Deja de poder participar. Su contenido queda visible." okText="Bloquear" cancelText="Cancelar" okButtonProps={{ danger: true }}
                onConfirm={async () => { await api.run(rpc('set_guest_status', { p_board: b.id, p_user: m.user_id, p_status: 'blocked' }), 'Miembro bloqueado: ya no puede participar'); load(); }}>
                <a style={{ color: '#cf1322', fontSize: 14 }}>Bloquear</a>
              </Popconfirm>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
