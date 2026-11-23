import React, { useMemo, useState } from 'react';
import { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import { Download, ExternalLink, History, RefreshCw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuditTrailRecord } from '../../types/system';
import { eventTypeOptionsForCategory } from '../monitoring/eventCategory';
import { useCapability } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { DataTable } from '../../components/industrial/DataTable';
import { formatIsoWithOffset, triggerBrowserDownload, withExportAbortTimeout } from '../../utils/historicalExport';
import { formatDateTime } from '../../utils/formatDate';
import { useHistoryFilters } from '../shared/historyFilters';
import { useMasterAssetsQuery, useSystemAuditTrailQuery } from '../shared/useHistoricalQueries';

/** Nilai JSON audit (old/new) sebagai teks ringkas — null eksplisit = '—'. */
function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  } catch {
    return '—';
  }
}

export const AuditTrailPage: React.FC = () => {
  const canReadAudit = useCapability('access_control.read');
  const { filters, isValid, validationErrors, updateFilters, resetFilters } = useHistoryFilters({
    limit: 20,
  });

  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const activeCursor = cursorStack[cursorStack.length - 1];
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // P33.4 (FAT-294, B33.2): arsip audit append-only dari
  // `GET /system/audit-trail` — store TERPISAH dari feed operasional.
  const auditQuery = useSystemAuditTrailQuery(filters, activeCursor, canReadAudit.canInteract && isValid);

  const logs = auditQuery.data?.data ?? [];
  const pagination = auditQuery.data?.pagination;

  const { data: masterData } = useMasterAssetsQuery(canReadAudit.canInteract);
  const machines = masterData?.machines ?? [];
  const machineFilter = filters.machineId || 'ALL';
  const eventTypeFilter = filters.eventType || 'ALL';

  const applyTimeWindow = (nextFrom: string, nextTo: string) => {
    setCursorStack([undefined]);
    const patch: { from?: string; to?: string } = {};
    if (nextFrom) {
      const d = new Date(nextFrom);
      if (!Number.isNaN(d.getTime())) patch.from = formatIsoWithOffset(d);
    }
    if (nextTo) {
      const d = new Date(nextTo);
      if (!Number.isNaN(d.getTime())) patch.to = formatIsoWithOffset(d);
    }
    if (Object.keys(patch).length > 0) {
      updateFilters(patch);
    }
  };

  // P33.4 (FAT-294, B33.2): ekspor arsip audit — `GET
  // /system/audit-trail/export`, guard `access_control.read`, format csv
  // default. Filter Event Type halaman dipetakan ke param `action`;
  // filter Mesin TIDAK diteruskan (endpoint ekspor live tidak
  // mendaftarkan `machine_id` — ketidaksesuaian kontrak, dicatat di sini
  // supaya tidak diam-diam dianggap tersaring).
  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await withExportAbortTimeout(undefined, (signal) =>
        apiClient.exportSystemAuditTrailData(
          {
            from: filters.from,
            to: filters.to,
            action: eventTypeFilter === 'ALL' ? undefined : eventTypeFilter,
            format: 'csv',
          },
          signal
        )
      );
      triggerBrowserDownload(result.filename, result.content, result.mimeType);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Gagal mengekspor audit sistem.');
    } finally {
      setIsExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<AuditTrailRecord, unknown>[]>(
    () => [
      {
        id: 'seq',
        header: 'No.',
        cell: ({ row }) => (
          <span className="font-tabular text-xs text-slate-500 whitespace-nowrap">
            #{row.original.seq}
          </span>
        ),
      },
      {
        id: 'timestamp',
        header: 'Timestamp',
        cell: ({ row }) => (
          <span className="font-tabular text-xs text-slate-500 whitespace-nowrap">
            {row.original.recorded_at ? formatDateTime(row.original.recorded_at) : '—'}
          </span>
        ),
      },
      {
        id: 'action',
        header: 'Aksi & Pelaku',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                <History className="w-3.5 h-3.5 shrink-0" />
                <span className="break-words">{item.action || '—'}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {item.actor}
                {item.actor_role ? <span className="text-slate-400"> · {item.actor_role}</span> : null}
              </div>
            </div>
          );
        },
      },
      {
        id: 'entity',
        header: 'Entitas',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="text-[11px] text-slate-500 space-y-0.5">
              <div className="font-tabular">{item.entity_label ?? item.entity_id ?? '—'}</div>
              <div className="font-tabular">{item.entity_type ?? '—'}</div>
            </div>
          );
        },
      },
      {
        id: 'change',
        header: 'Perubahan (lama → baru)',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 max-w-md break-words">
              <div>
                <span className="text-slate-400">Lama: </span>
                {formatAuditValue(item.old_value)}
              </div>
              <div>
                <span className="text-slate-400">Baru: </span>
                {formatAuditValue(item.new_value)}
              </div>
            </div>
          );
        },
      },
      {
        id: 'reason',
        header: 'Alasan',
        cell: ({ row }) => (
          <span className="text-xs text-slate-700 dark:text-slate-300 block max-w-xs break-words">
            {row.original.reason ?? '—'}
          </span>
        ),
      },
      {
        id: 'source',
        header: 'Sumber',
        cell: ({ row }) => (
          <span className="text-xs font-tabular text-slate-500">{row.original.source}</span>
        ),
      },
    ],
    []
  );

  if (!canReadAudit.canInteract) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
          <ShieldAlert className="w-5 h-5" />
          <span>Akses System Audit Trail Dibatasi</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {canReadAudit.reason ||
            'Riwayat audit sistem hanya dapat dilihat oleh Admin melalui jaringan lokal pabrik.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Riwayat Audit Aktivitas Sistem
          </h1>
          {/* P33.4 (FAT-294, B33.2): arsip append-only dari
              `GET /system/audit-trail` — store TERPISAH dari feed
              operasional (E33 Opsi 3). Baris tidak bisa diubah; setiap
              mutasi tercatat dengan pelaku, entitas, perubahan old→new,
              dan alasan. Catatan "alias" lama (P33.1) DIHAPUS — halaman ini
              bukan lagi alias feed operasional. */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Arsip audit append-only (ADMIN + LAN). Setiap mutasi sistem dan aksi manusia tercatat
            dengan nomor urut, pelaku, entitas, perubahan lama → baru, dan alasan — baris arsip
            tidak bisa diubah.
            {pagination?.retention_days ? ` Retensi arsip: ${pagination.retention_days} hari.` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* FAT-302 (P33.7): tautan silang ke dua halaman Opsi 3 lainnya. */}
          <Link
            to="/admin/iam-audit"
            className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
          >
            Lihat Audit IAM →
          </Link>
          <Link
            to="/admin/alarms"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <span>Lihat Alarm &amp; Event</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Button size="sm" variant="secondary" onClick={handleExport} isLoading={isExporting}>
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => auditQuery.refetch()}
            isLoading={auditQuery.isFetching}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center justify-between gap-2"
        >
          <span>{exportError}</span>
          <Button size="sm" variant="ghost" onClick={() => setExportError(null)}>
            Tutup
          </Button>
        </div>
      )}

      {!isValid && (
        <div
          role="alert"
          className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2"
        >
          <span>Filter tidak valid: {Object.values(validationErrors).join(' · ')}</span>
          <Button size="sm" variant="secondary" onClick={resetFilters}>
            Reset Filter
          </Button>
        </div>
      )}

      {/* Time + Audit Filters */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-from" className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            Dari (From)
          </label>
          <input
            id="audit-from"
            type="datetime-local"
            value={fromInput}
            onChange={(e) => {
              setFromInput(e.target.value);
              applyTimeWindow(e.target.value, toInput);
            }}
            className="px-3 py-1.5 text-xs font-tabular bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            Sampai (To)
          </label>
          <input
            id="audit-to"
            type="datetime-local"
            value={toInput}
            onChange={(e) => {
              setToInput(e.target.value);
              applyTimeWindow(fromInput, e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-tabular bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
          />
        </div>
        {(fromInput || toInput) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFromInput('');
              setToInput('');
              setCursorStack([undefined]);
              resetFilters();
            }}
          >
            Reset Waktu
          </Button>
        )}
        <Select
          id="audit-event-type"
          label="Event Type"
          value={eventTypeFilter}
          onChange={(e) => {
              setCursorStack([undefined]);
              updateFilters({ eventType: e.target.value === 'ALL' ? undefined : e.target.value });
            }}
          // FAT-304 (P33.8): dropdown Event Type halaman Audit Trail hanya
          // menawarkan keluarga SISTEM (18 nilai) — dipakai sebagai filter
          // `action` ke GET /system/audit-trail (P33.4). Daftarnya sama
          // dengan tabel §1 docs/BACKEND_REQUIREMENTS_E33_PAGES.md.
          options={[{ value: 'ALL', label: 'Semua Event Type' }, ...eventTypeOptionsForCategory('system').map((t) => ({ value: t, label: t }))]}
        />
        <Select
          id="audit-machine"
          label="Mesin"
          value={machineFilter}
          onChange={(e) => {
              setCursorStack([undefined]);
              updateFilters({ machineId: e.target.value === 'ALL' ? undefined : e.target.value });
            }}
          options={[{ value: 'ALL', label: 'Semua Mesin' }, ...machines.map((m) => ({ value: m.machine_id, label: m.machine_id }))]}
        />
      </div>

      <DataTable
        data={logs}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={auditQuery.isLoading}
        isFetching={auditQuery.isFetching}
        error={auditQuery.error}
        onRetry={() => auditQuery.refetch()}
        dataUpdatedAt={auditQuery.dataUpdatedAt}
        emptyTitle="Tidak ada log audit sistem"
        emptyDescription="Belum ada mutasi sistem yang tercatat pada rentang waktu yang dipilih."
        cursorPagination={{
          hasMore: Boolean(pagination?.has_more),
          hasPrev: cursorStack.length > 1,
          totalCount: pagination?.total_count,
          pageIndex: cursorStack.length - 1,
          onNextPage: () => {
            if (pagination?.next_cursor) {
              setCursorStack((prev) => [...prev, pagination.next_cursor ?? undefined]);
            }
          },
          onPrevPage: () =>
            setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)),
          onResetPage: () => setCursorStack([undefined]),
        }}
      />
    </div>
  );
};
