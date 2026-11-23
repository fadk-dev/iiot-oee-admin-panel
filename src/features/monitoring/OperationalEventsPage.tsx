import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { OperationalEvent } from '../../types/monitoring';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/industrial/DataTable';
import { HistoricalExportToolbar } from '../../components/industrial/HistoricalExportToolbar';
import { DEFAULT_HISTORY_PAGE_LIMIT } from '../../utils/historicalExport';
import { useHistoryFilters } from '../shared/historyFilters';
import { useMasterAssetsQuery, useOperationalEventsQuery } from '../shared/useHistoricalQueries';
import { useOperationalEvents } from './hooks/useOperationalEvents';
import { useOperationalEventColumns } from './hooks/useOperationalEventColumns';
import { OperationalEventsFilters } from './components/OperationalEventsFilters';
import { OperationalEventAckModal } from './components/OperationalEventAckModal';
import { OperationalEventViewTabs } from './components/OperationalEventViewTabs';
import {
  acknowledgedParamForView,
  describeTabCounts,
  filterEventsByState,
  sortActionView,
  type OperationalEventStateFilter,
  type OperationalEventView,
} from './eventView';

export const OperationalEventsPage: React.FC = () => {
  const { filters, isValid, validationErrors, updateFilters, resetFilters } = useHistoryFilters({
    limit: DEFAULT_HISTORY_PAGE_LIMIT,
  });

  // FAT-300 (P33.5, E33 tahap A analisis halaman Opsi 3 §3): dua tampilan
  // dalam satu halaman. 'action' ("Perlu Tindakan", default) hanya
  // menampilkan yang belum di-ack; 'history' ("Riwayat") menampilkan semua
  // event. Filter State menyaring client-side atas halaman yang dimuat.
  const [view, setView] = useState<OperationalEventView>('action');
  const [stateFilter, setStateFilter] = useState<OperationalEventStateFilter>('ALL');
  const [customDeviceInput, setCustomDeviceInput] = useState('');
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const activeCursor = cursorStack[cursorStack.length - 1];

  const deviceFilter = filters.deviceId || 'ALL';

  const handleFilterChange = (patch: Parameters<typeof updateFilters>[0]) => {
    setCursorStack([undefined]);
    updateFilters(patch);
  };

  // Pindah tampilan tidak mengganti filter lain (device, tipe, rentang) —
  // hanya menyaring state ack dan kembali ke halaman 1. 'ACKED' tidak
  // berlaku di tampilan Perlu Tindakan, jadi kembalikan ke 'ALL'.
  const handleViewChange = (nextView: OperationalEventView) => {
    setCursorStack([undefined]);
    if (nextView === 'action' && stateFilter === 'ACKED') {
      setStateFilter('ALL');
    }
    setView(nextView);
  };

  const handleStateChange = (value: OperationalEventStateFilter) => {
    setCursorStack([undefined]);
    setStateFilter(value);
  };

  const handleApplyCustomDevice = () => {
    if (customDeviceInput.trim()) {
      handleFilterChange({ deviceId: customDeviceInput.trim() });
    }
  };

  const {
    preset,
    isExporting,
    cooldownSeconds,
    exportError,
    setExportError,
    lastExport,
    setLastExport,
    ackTarget,
    setAckTarget,
    isAcking,
    actionError,
    handlePresetChange,
    handleExport,
    confirmAck,
  } = useOperationalEvents({
    filters,
    deviceFilter,
    onFilterChange: handleFilterChange,
  });

  const { data: masterData } = useMasterAssetsQuery();
  const devices = masterData?.devices ?? [];

  const eventsQuery = useOperationalEventsQuery(
    deviceFilter,
    filters,
    activeCursor,
    {
      acknowledged: acknowledgedParamForView(view),
    },
    isValid
  );

  // P33.4 (FAT-294, B33.4): jumlah tab butuh angka server untuk filter
  // yang SAMA tanpa batasan tampilan (`acknowledged`) — di tampilan
  // 'action' query daftar memakai `acknowledged=false` sehingga
  // `totalCount`-nya hanya mencakup yang belum di-ack. Query ringan
  // kedua (limit=1) mengambil `pagination.counts`/`totalCount` tanpa
  // filter tampilan; di tampilan 'history' query daftar SUDAH tanpa
  // filter tampilan, jadi query kedua tidak diperlukan (enabled=false).
  const tabCountsQuery = useOperationalEventsQuery(
    deviceFilter,
    { ...filters, limit: 1 },
    undefined,
    {},
    view === 'action' && isValid
  );
  const countsPagination = view === 'action' ? tabCountsQuery.data?.pagination : eventsQuery.data?.pagination;

  const events = eventsQuery.data?.data ?? [];
  const pagination = eventsQuery.data?.pagination;

  // FAT-300 (P33.5) + P33.4 (FAT-294): kolom Ack membaca `alarm_state`
  // server per baris — tanpa derivasi, tanpa daftar referensi.
  const columns = useOperationalEventColumns(setAckTarget);

  // Daftar tampil: saring menurut Filter State (`alarm_state` server),
  // lalu urutkan tampilan Perlu Tindakan (aktif dulu, lalu clear).
  // Tampilan Riwayat memakai urutan server (terbaru dulu).
  const displayEvents = useMemo(() => {
    const filtered = filterEventsByState(events, stateFilter);
    return view === 'action' ? sortActionView(filtered) : filtered;
  }, [events, stateFilter, view]);

  // Jumlah tab dari angka server (`totalCount`/`counts`) bila ada —
  // pasti, tanpa "+". Belum ada data → tanpa angka.
  const tabCounts = useMemo(
    () =>
      eventsQuery.data
        ? describeTabCounts({
            events,
            pageIndex: cursorStack.length - 1,
            hasMore: Boolean(pagination?.has_more),
            totalCount: countsPagination?.total_count,
            counts: countsPagination?.counts,
          })
        : undefined,
    [eventsQuery.data, events, cursorStack.length, pagination?.has_more, countsPagination]
  );

  const isGlobalScope = deviceFilter === 'ALL';

  const deviceOptions = useMemo(() => {
    const ids = new Set(devices.map((d) => d.device_id));
    if (
      deviceFilter !== 'ALL' &&
      deviceFilter !== 'STM32-OEE-90-DEL' &&
      !ids.has(deviceFilter)
    ) {
      return [
        ...devices,
        {
          device_id: deviceFilter,
          bound_machine_name: '[dihapus / historis]',
        },
      ];
    }
    return devices;
  }, [devices, deviceFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Alarm &amp; Event
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {view === 'action'
              ? isGlobalScope
                ? 'Daftar kerja — event yang belum di-ack di seluruh perangkat pabrik; yang masih aktif didahulukan, lalu yang sudah clear.'
                : `Daftar kerja khusus perangkat ${deviceFilter} — event yang belum di-ack.`
              : isGlobalScope
                ? 'Riwayat kejadian operasional seluruh perangkat pabrik beserta fitur ack idempoten dan ekspor.'
                : `Riwayat kejadian operasional khusus perangkat ${deviceFilter}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* FAT-292 (P33.2): tautan silang ke arsip audit — halaman ini
              adalah daftar kerja, bukan audit.
              FAT-302 (P33.7): tambah tautan ke Audit IAM — ketiga halaman
              Opsi 3 saling bertaut. */}
          <Link
            to="/admin/system-audit"
            className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
          >
            Lihat Audit Trail →
          </Link>
          <Link
            to="/admin/iam-audit"
            className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
          >
            Lihat Audit IAM →
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => eventsQuery.refetch()}
            isLoading={eventsQuery.isFetching}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

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

      <OperationalEventViewTabs
        view={view}
        onViewChange={handleViewChange}
        actionCount={tabCounts?.action}
        historyCount={tabCounts?.history}
      />

      <OperationalEventsFilters
        filters={filters}
        deviceOptions={deviceOptions}
        view={view}
        stateFilter={stateFilter}
        customDeviceInput={customDeviceInput}
        onCustomDeviceInputChange={setCustomDeviceInput}
        onFilterChange={handleFilterChange}
        onStateChange={handleStateChange}
        onApplyCustomDevice={handleApplyCustomDevice}
      />

      <HistoricalExportToolbar
        preset={preset}
        onPresetChange={handlePresetChange}
        fromIso={filters.from}
        toIso={filters.to}
        onCustomRangeChange={(from, to) => handleFilterChange({ from, to })}
        onExport={handleExport}
        isExporting={isExporting}
        exportError={exportError}
        onDismissError={() => setExportError(null)}
        lastExport={lastExport}
        onDismissExport={() => setLastExport(null)}
        resourceId={deviceFilter}
        scopeLabel={isGlobalScope ? 'Scope: Global Plant Feed' : `Scope: ${deviceFilter}`}
        cooldownSeconds={cooldownSeconds}
      />

      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-900 dark:text-red-200"
        >
          {actionError}
        </div>
      )}

      <DataTable
        data={displayEvents}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={eventsQuery.isLoading}
        isFetching={eventsQuery.isFetching}
        error={eventsQuery.error}
        onRetry={() => eventsQuery.refetch()}
        dataUpdatedAt={eventsQuery.dataUpdatedAt}
        emptyTitle={
          view === 'action'
            ? 'Tidak ada event yang perlu tindakan'
            : 'Tidak ada operational event'
        }
        emptyDescription={
          view === 'action'
            ? 'Tidak ada kejadian yang belum di-ack sesuai filter aktif.'
            : 'Tidak ada kejadian operasional yang sesuai filter aktif.'
        }
        emptyActionLabel="Reset Filter"
        onEmptyAction={() => {
          setView('action');
          setStateFilter('ALL');
          resetFilters();
        }}
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

      <OperationalEventAckModal
        target={ackTarget}
        isSubmitting={isAcking}
        onClose={() => {
          if (!isAcking) setAckTarget(null);
        }}
        onConfirmAck={confirmAck}
      />
    </div>
  );
};
