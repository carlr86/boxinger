'use client';
import { useEffect } from 'react';
import { sendClientError } from '@/components/ErrorReporter';
import { useI18n } from '@/lib/i18n/client';

// A screen crashed while rendering: report it and offer to retry instead of a blank page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => { sendClientError({ message: error.message || 'Render error', stack: error.stack, digest: error.digest, kind: 'render' }); }, [error]);
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 32, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{t('Algo salió mal')}</h1>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Ya nos llegó el aviso del error. Probá de nuevo; si sigue pasando, escribinos a hola@boxinger.com.')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="bx-btn-primary" onClick={reset}>{t('Reintentar')}</button>
          <a href="/app" className="bx-btn" style={{ display: 'inline-flex', alignItems: 'center' }}>{t('Ir a Boxinger')}</a>
        </div>
      </div>
    </div>
  );
}
