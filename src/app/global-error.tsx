'use client';
import { useEffect } from 'react';
import { reloadIfStale, sendClientError } from '@/components/ErrorReporter';

// Last resort when even the root layout fails (no translations here: shown in both languages).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { if (!reloadIfStale(error.message || '', error.stack)) sendClientError({ message: error.message || 'Root error', stack: error.stack, digest: error.digest, kind: 'root' }); }, [error]);
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: '-apple-system,Segoe UI,Arial,sans-serif', background: '#f5f5f5', minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 32, maxWidth: 420 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Algo salió mal · Something went wrong</h1>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>Ya nos llegó el aviso. · We’ve been notified.</p>
          <button type="button" onClick={reset} style={{ height: 32, padding: '0 15px', border: 0, borderRadius: 6, background: '#059669', color: '#fff', cursor: 'pointer' }}>Reintentar · Retry</button>
        </div>
      </body>
    </html>
  );
}
