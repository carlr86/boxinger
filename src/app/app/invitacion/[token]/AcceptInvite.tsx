'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpc } from '@/lib/rpc';
import { Note } from '@/components/ui';
import { useSession, useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const toast = useToast();
  const { t, tm } = useI18n();
  const { refresh } = useSession();
  const [error, setError] = useState('');
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    rpc<{ kind: string; slug: string | null }>('accept_invitation', { p_token: token })
      .then(async (r) => {
        await refresh();
        toast.ok(r.kind === 'team' ? 'Ya sos parte del equipo' : 'Ya sos parte de la Comunidad');
        router.replace(r.slug ? '/app/b/' + r.slug : '/app/buzones');
      })
      .catch((e) => setError((e as Error).message));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <Note tone="error">{tm(error)}</Note>;
  return <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{t('Aceptando la invitación…')}</span>;
}
