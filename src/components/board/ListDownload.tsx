'use client';
import { useState } from 'react';
import { Dropdown } from 'antd';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import { downloadListCsv, downloadListPdf, type ListExport } from '@/lib/brainstorm-export';

/** «Descargar» › Excel (CSV) or PDF, for a list the page builds (Brainstorming: Agrupar and Backlog). */
export function ListDownload({ build }: { build: () => ListExport }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function go(kind: 'csv' | 'pdf') {
    const x = build();
    if (kind === 'csv') return downloadListCsv(x);
    setBusy(true);
    try { await downloadListPdf(x); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  return (
    <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [
      { key: 'csv', icon: <FileExcelOutlined />, label: t('Excel (CSV)'), onClick: () => go('csv') },
      { key: 'pdf', icon: <FilePdfOutlined />, label: t('PDF para compartir'), onClick: () => go('pdf') },
    ] }}>
      <button type="button" className="bx-btn" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <DownloadOutlined />{busy ? t('Armando el PDF…') : t('Descargar')}
      </button>
    </Dropdown>
  );
}
