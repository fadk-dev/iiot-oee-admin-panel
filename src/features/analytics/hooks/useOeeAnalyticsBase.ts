import { useMemo, useState } from 'react';
import { TelemetryRollupGroupBy } from '../../../types/analytics';
import { useCapability } from '../../../context/AuthContext';
import { useHistoryFilters } from '../../shared/historyFilters';
import {
  useMasterAssetsQuery,
  useShiftsQuery,
} from '../../shared/useHistoricalQueries';
import { buildOeeAnalyticsQueryKeys, OeeAnalyticsQueryKeys, RollupScope, TimelineBucket } from './oeeQueryKeys';
import { DEFAULT_ROLLUP_GROUP_BY, DEFAULT_TIMELINE_BUCKET } from '../telemetryDefaults';
import { resolveMachineDeviceId, resolveDefaultMachineId } from '../../shared/defaultDevice';

export type { TimelineBucket, RollupScope };

/**
 * E31 (FAT-266): konteks bersama halaman OEE — dipisah dari
 * `useOeeAnalytics` (hook itu 247 baris, sisa 3 ke batas keras 250)
 * mengikuti aturan R4 (satu hook = satu alur data).
 *
 * Hook ini BUKAN alur data: ia hanya memegang state halaman yang
 * dipakai bersama ketiga alur (filter + mesin + device terderiva +
 * pilihan UI + queryKey). Alur datanya tinggal di hook domain:
 * `useOeeRollup` (summary/hourly/rollup), `useShiftTimeline`
 * (timeline + overlay downtime), `useRejectPareto` (pareto reject).
 * Ketiganya menerima konteks ini sebagai parameter — bukan memanggil
 * `useHistoryFilters`/`useMasterAssetsQuery` sendiri — supaya filter
 * dan master data hanya dibaca SEKALI per render halaman (tiga
 * instans `useHistoryFilters` akan berisiko desinkronisasi).
 *
 * QueryKey dibangun sekali di sini dari satu input yang konsisten
 * (`buildOeeAnalyticsQueryKeys`) — semua query halaman memuat from/to
 * (E12 T12.9, gap G1).
 */
export const useOeeAnalyticsBase = () => {
  const canReadOee = useCapability('oee.read');
  const canReadQuality = useCapability('quality.read');

  const { filters, updateFilters } = useHistoryFilters({
    groupBy: DEFAULT_ROLLUP_GROUP_BY,
    limit: 20,
  });

  const rollupGroupBy: TelemetryRollupGroupBy = filters.groupBy ?? DEFAULT_ROLLUP_GROUP_BY;
  const [timelineBucket, setTimelineBucket] = useState<TimelineBucket>(DEFAULT_TIMELINE_BUCKET);
  const [selectedSegmentIdx, setSelectedSegmentIdx] = useState<number | null>(null);
  const [paretoScope, setParetoScope] = useState<'GLOBAL' | 'DEVICE'>('GLOBAL');
  // E12 T12.10 (X-3 / FAT-57): scope rollup 'MACHINE' vs 'ALL' —
  // sengaja TIDAK di-reset saat ganti mesin (rollup 'ALL' tetap plant-wide).
  const [rollupScope, setRollupScope] = useState<RollupScope>('MACHINE');

  const { data: masterData } = useMasterAssetsQuery(canReadOee.canInteract);
  const machines = masterData?.machines ?? [];

  // FAT-306: default mesin dari daftar live — BUKAN hardcode
  // 'CNC-MILLING-01' (mesin itu tidak ada di live; live = CNC-MILLING-SIM).
  // Pola yang sama dengan FAT-170 untuk device (TelemetryHistoryPage):
  // mesin terikat device online pertama, lalu mesin pertama; daftar kosong
  // → '' (tanpa mesin terpilih — query berjalan tanpa machine_id, bukan
  // mesin karangan). URL ?machine_id=… tetap menang (historyParams).
  // Demo tidak berubah: seed demo menempatkan CNC-MILLING-01 terikat
  // STM32-OEE-01 (online, urutan pertama).
  const selectedMachine =
    filters.machineId || resolveDefaultMachineId(machines, masterData?.devices ?? []) || '';

  // E12 T12.1 (X-1 / FAT-54): daftar shift untuk pemilih shift + kode
  // shift yang dikirim ke shift-summary/timeline (API doc §I `?date=&shift=`).
  // E28 Batch B (FAT-220, E2E-06): loading/error query shift diteruskan
  // ke halaman — peringatan "tidak tersedia" hanya setelah query gagal.
  const shiftsQuery = useShiftsQuery(canReadOee.canInteract);
  const shifts = shiftsQuery.data?.data ?? [];
  const selectedShift = shifts.find((s) => s.shiftId === filters.shiftId);
  const shiftCode = selectedShift?.shiftCode;
  const shiftDate = filters.shiftDate;

  // E28 Batch B (FAT-170, N-2): ikatan mesin utama; fallback dari daftar
  // live, bukan hardcode 'STM32-OEE-01' (daftar kosong → `undefined`).
  const resolvedDeviceId = useMemo(
    () => resolveMachineDeviceId(machines, masterData?.devices ?? [], selectedMachine),
    [machines, masterData, selectedMachine]
  );

  // E12 T12.9 (X-2 / FAT-62): semua queryKey dibangun dari satu fungsi
  // murni (`oeeQueryKeys`) — semuanya memuat from/to (gap G1).
  const queryKeys: OeeAnalyticsQueryKeys = buildOeeAnalyticsQueryKeys({
    machineId: selectedMachine,
    deviceId: resolvedDeviceId,
    from: filters.from,
    to: filters.to,
    shiftDate,
    shiftId: filters.shiftId,
    timelineBucket,
    rollupGroupBy,
    rollupScope,
    baseFilters: filters,
  });

  return {
    canReadOee,
    canReadQuality,
    filters,
    updateFilters,
    selectedMachine,
    rollupGroupBy,
    rollupScope,
    setRollupScope,
    machines,
    shifts,
    shiftsLoading: shiftsQuery.isLoading,
    shiftsError: shiftsQuery.isError,
    selectedShift,
    shiftCode,
    shiftDate,
    timelineBucket,
    setTimelineBucket,
    selectedSegmentIdx,
    setSelectedSegmentIdx,
    paretoScope,
    setParetoScope,
    resolvedDeviceId,
    queryKeys,
  };
};

/** Konteks bersama yang diterima ketiga hook domain halaman OEE. */
export type OeeAnalyticsBase = ReturnType<typeof useOeeAnalyticsBase>;
