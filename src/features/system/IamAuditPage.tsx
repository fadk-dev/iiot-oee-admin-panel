import React from 'react';
import { Link } from 'react-router-dom';
import { Download, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useIamAudit } from './hooks/useIamAudit';
import { IamAuditFilterBar } from './components/IamAuditFilterBar';
import { IamAuditTable } from './components/IamAuditTable';

/**
 * Audit IAM — halaman penuh (P33.6, FAT-301; analisis halaman Opsi 3 §5).
 * Naik dari tab "Riwayat Pemeriksaan" di Hak Akses: satu halaman untuk
 * satu store (keputusan otorisasi `GET /access-control/audit`).
 *
 * Baca saja, tanpa aksi mutasi — keputusan audit tidak dapat diubah.
 * Tautan silang ke Audit Trail + Hak Akses (tautan lengkap ke halaman 1
 * Alarm & Event dikerjakan P33.7).
 */
export const IamAuditPage: React.FC = () => {
  const iamAudit = useIamAudit();

  if (!iamAudit.canRead.canInteract) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
          <ShieldAlert className="w-5 h-5" />
          <span>Akses Audit IAM Terkunci</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {iamAudit.canRead.reason || 'Halaman audit IAM hanya tersedia untuk peran Admin.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Audit IAM
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Catatan keputusan otorisasi — siapa mencoba melakukan apa terhadap apa, diizinkan
            atau ditolak, dengan alasan apa. Keputusan ini tidak dapat diubah.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Daftar kerja alarm &amp; event ada di{' '}
            <Link to="/admin/alarms" className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
              Alarm &amp; Event →
            </Link>{' '}
            · Arsip sistem yang tidak berubah ada di{' '}
            <Link to="/admin/system-audit" className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
              Audit Trail →
            </Link>{' '}
            · Kelola role &amp; permission di{' '}
            <Link to="/admin/access-control" className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
              Hak Akses Pengguna →
            </Link>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={iamAudit.exportCsv}
            isLoading={iamAudit.isExporting}
            disabled={iamAudit.isLoading}
            title="Unduh semua baris hasil filter sebagai CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {iamAudit.exportError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center justify-between gap-2"
        >
          <span>{iamAudit.exportError}</span>
          <button
            type="button"
            onClick={() => iamAudit.exportCsv()}
            className="font-bold px-1.5 cursor-pointer"
          >
            Coba lagi
          </button>
        </div>
      )}

      {iamAudit.exportTruncated && (
        <div
          role="status"
          className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200"
        >
          Ekspor dibatasi 1.000 baris pertama yang cocok dengan filter — masih ada keputusan
          di luar itu di server. Sempitkan filter (mis. rentang tanggal) bila butuh semua baris.
        </div>
      )}

      <IamAuditFilterBar
        draft={iamAudit.draft}
        onDraftChange={iamAudit.updateDraft}
        onApply={iamAudit.applyFilters}
        onReset={iamAudit.resetFilters}
        onDenyOnly={iamAudit.applyDenyOnly}
        isApplying={iamAudit.isApplying}
        resultCount={iamAudit.totalCount}
        pageMatchCount={iamAudit.filteredCount}
      />

      <IamAuditTable
        decisions={iamAudit.pageRows}
        isLoading={iamAudit.isLoading}
        isFetching={iamAudit.isPaging}
        error={iamAudit.error}
        onRetry={iamAudit.reload}
        pageIndex={iamAudit.pageIndex}
        hasMore={iamAudit.hasMore}
        hasPrev={iamAudit.hasPrev}
        onNextPage={iamAudit.nextPage}
        onPrevPage={iamAudit.prevPage}
        onResetPage={iamAudit.resetPage}
      />
    </div>
  );
};
