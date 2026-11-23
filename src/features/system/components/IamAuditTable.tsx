import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/industrial/DataTable';
import { formatDateTime } from '../../../utils/formatDate';
import type { IamAuditDecision } from '../../../types/iam';

interface IamAuditTableProps {
  decisions: IamAuditDecision[];
  isLoading?: boolean;
  /** Halaman sedang diambil ulang (Berikutnya/Sebelumnya/Awal) — tombol paging dikunci. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  pageIndex: number;
  hasMore: boolean;
  hasPrev: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onResetPage: () => void;
}

/**
 * Tabel keputusan otorisasi Audit IAM (P33.6, FAT-301; paging server-side
 * P33.9, FAT-305) — kolom dipindah dari AuditTab (tab lama) tanpa
 * perubahan isi: Waktu, Subjek, Keputusan, Action & Resource, Alasan.
 * Halaman yang tampil adalah SATU halaman server (25 baris); mundur
 * memakai tumpukan cursor di hook, bukan cache halaman.
 *
 * Subjek menaut ke Pemeriksa Izin Pengguna (`/admin/access-control`
 * tab inspector) — belum ada rute detail pengguna, jadi tautan memakai
 * deep-link `?tab=inspector&operator=<subject>` yang sudah didukung
 * useInspector (auto-inspeksi operator dari param URL).
 */
export const IamAuditTable: React.FC<IamAuditTableProps> = ({
  decisions,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  pageIndex,
  hasMore,
  hasPrev,
  onNextPage,
  onPrevPage,
  onResetPage,
}) => {
  const columns = useMemo<ColumnDef<IamAuditDecision, unknown>[]>(
    () => [
      {
        id: 'timestamp',
        header: 'Waktu',
        cell: ({ row }) => (
          <div className="text-xs font-tabular text-slate-500">
            {formatDateTime(row.original.timestamp)}
          </div>
        ),
      },
      {
        id: 'subject',
        header: 'Subjek',
        cell: ({ row }) => (
          <Link
            to={`/admin/access-control?tab=inspector&operator=${encodeURIComponent(row.original.subject)}`}
            title="Lihat izin efektif subjek di Pemeriksa Izin Pengguna"
            className="text-xs font-tabular font-semibold text-sky-600 dark:text-sky-400 hover:underline"
          >
            {row.original.subject}
          </Link>
        ),
      },
      {
        id: 'decision',
        header: 'Keputusan',
        cell: ({ row }) => {
          const d = row.original;
          return (
            <Badge variant={d.decision === 'ALLOW' ? 'success' : 'danger'}>
              {d.decision} ({d.mode})
            </Badge>
          );
        },
      },
      {
        id: 'action',
        header: 'Action & Resource',
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="text-xs font-mono text-[11px]">
              <div className="break-words">{d.action}</div>
              <div className="text-slate-500 break-words">{d.resource}</div>
            </div>
          );
        },
      },
      {
        id: 'reason',
        header: 'Alasan',
        cell: ({ row }) => (
          <div className="text-xs text-slate-600 dark:text-slate-300 break-words">
            {row.original.reason || '-'}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      data={decisions}
      columns={columns}
      getRowId={(d) => d.id}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      onRetry={onRetry}
      emptyTitle="Belum ada keputusan audit"
      emptyDescription="Tidak ada keputusan otorisasi yang cocok dengan filter."
      cursorPagination={{
        hasMore,
        hasPrev,
        pageIndex,
        onNextPage,
        onPrevPage,
        onResetPage,
      }}
    />
  );
};
