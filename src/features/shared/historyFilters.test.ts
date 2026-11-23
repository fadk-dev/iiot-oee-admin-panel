import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHistoryFilterPatch,
  correlateWorkOrderData,
  formatRollupPerformance,
  parseHistoryFiltersFromSearchParams,
  resolveWorkOrderDeviceId,
  resolveWorkOrderWindow,
  serializeHistoryFiltersToSearchParams,
} from './historyFilters';
import { WorkOrder } from '../../types/production';
import { Machine } from '../../types/assets';
import { resolveTimeWindowPreset } from '../../utils/historicalExport';

test('parseHistoryFiltersFromSearchParams validates ISO 8601 with offset and rejects naive timestamps', () => {
  const validParams = new URLSearchParams({
    machine_id: 'CNC-MILLING-01',
    status: 'COMPLETED',
    from: '2026-11-01T00:00:00+07:00',
    to: '2026-11-08T00:00:00+07:00',
    limit: '25',
  });
  const validResult = parseHistoryFiltersFromSearchParams(validParams);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.filters.machineId, 'CNC-MILLING-01');
  assert.equal(validResult.filters.status, 'COMPLETED');
  assert.equal(validResult.filters.limit, 25);
  assert.equal(validResult.filters.envelope, true);

  // Naive datetime without timezone offset must fail Zod validation
  const invalidParams = new URLSearchParams({
    from: '2026-11-01T00:00:00',
    to: '2026-11-08T00:00:00+07:00',
  });
  const invalidResult = parseHistoryFiltersFromSearchParams(invalidParams);
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.errors.from);
});

test('applyHistoryFilterPatch resets cursor on any non-cursor filter change and preserves cursor when paging', () => {
  const initial = parseHistoryFiltersFromSearchParams(
    new URLSearchParams({
      from: '2026-11-01T00:00:00+07:00',
      to: '2026-11-08T00:00:00+07:00',
      cursor: 'cursor-page-2',
    })
  ).filters;

  assert.equal(initial.cursor, 'cursor-page-2');

  const paged = applyHistoryFilterPatch(initial, { cursor: 'cursor-page-3' });
  assert.equal(paged.cursor, 'cursor-page-3');

  const filtered = applyHistoryFilterPatch(paged, { status: 'ACTIVE' });
  assert.equal(filtered.status, 'ACTIVE');
  assert.equal(filtered.cursor, undefined);

  const serialized = serializeHistoryFiltersToSearchParams(filtered);
  assert.equal(serialized.get('cursor'), null);
  assert.equal(serialized.get('envelope'), 'true');
  assert.equal(serialized.get('status'), 'ACTIVE');
});

// ---------------------------------------------------------------------------
// E12 T12.1 (FAT-54 / X-1): filter shift di URL + aturan patch.
// ---------------------------------------------------------------------------

test('parseHistoryFiltersFromSearchParams membaca shift_date/shift_id dan serialize mempertahankannya', () => {
  const params = new URLSearchParams({
    from: '2026-11-16T07:00:00+07:00',
    to: '2026-11-16T15:00:00+07:00',
    shift_date: '2026-11-16',
    shift_id: 'SHIFT-1',
  });
  const result = parseHistoryFiltersFromSearchParams(params);
  assert.equal(result.valid, true);
  assert.equal(result.filters.shiftDate, '2026-11-16');
  assert.equal(result.filters.shiftId, 'SHIFT-1');

  const serialized = serializeHistoryFiltersToSearchParams(result.filters);
  assert.equal(serialized.get('shift_date'), '2026-11-16');
  assert.equal(serialized.get('shift_id'), 'SHIFT-1');
  assert.equal(serialized.get('from'), '2026-11-16T07:00:00+07:00');
  assert.equal(serialized.get('to'), '2026-11-16T15:00:00+07:00');

  // Round-trip: serialize -> parse menghasilkan filter yang sama.
  const reparsed = parseHistoryFiltersFromSearchParams(serialized);
  assert.equal(reparsed.valid, true);
  assert.equal(reparsed.filters.shiftDate, '2026-11-16');
  assert.equal(reparsed.filters.shiftId, 'SHIFT-1');
});

test('parseHistoryFiltersFromSearchParams menolak shift_date tanpa shift_id (dan sebaliknya)', () => {
  const onlyDate = parseHistoryFiltersFromSearchParams(
    new URLSearchParams({
      from: '2026-11-16T07:00:00+07:00',
      to: '2026-11-16T15:00:00+07:00',
      shift_date: '2026-11-16',
    })
  );
  assert.equal(onlyDate.valid, false);
  assert.ok(onlyDate.errors.shiftDate);

  const onlyId = parseHistoryFiltersFromSearchParams(
    new URLSearchParams({
      from: '2026-11-16T07:00:00+07:00',
      to: '2026-11-16T15:00:00+07:00',
      shift_id: 'SHIFT-1',
    })
  );
  assert.equal(onlyId.valid, false);
  assert.ok(onlyId.errors.shiftDate);
});

test('applyHistoryFilterPatch membersihkan pilihan shift bila rentang diganti manual, mempertahankannya bila patch menyebut shift', () => {
  const initial = parseHistoryFiltersFromSearchParams(
    new URLSearchParams({
      from: '2026-11-16T07:00:00+07:00',
      to: '2026-11-16T15:00:00+07:00',
      shift_date: '2026-11-16',
      shift_id: 'SHIFT-1',
    })
  ).filters;
  assert.equal(initial.shiftDate, '2026-11-16');
  assert.equal(initial.shiftId, 'SHIFT-1');

  // Preset ekspor / rentang kustom tanpa shift -> pilihan shift dibersihkan.
  const manualRange = applyHistoryFilterPatch(initial, {
    from: '2026-11-09T10:00:00+07:00',
    to: '2026-11-16T10:00:00+07:00',
  });
  assert.equal(manualRange.shiftDate, undefined);
  assert.equal(manualRange.shiftId, undefined);
  assert.equal(manualRange.from, '2026-11-09T10:00:00+07:00');

  // Patch pemilih shift (menyebut shift + from/to) -> dipertahankan.
  const shiftPatch = applyHistoryFilterPatch(initial, {
    shiftDate: '2026-11-15',
    shiftId: 'SHIFT-1',
    from: '2026-11-15T07:00:00+07:00',
    to: '2026-11-15T15:00:00+07:00',
  });
  assert.equal(shiftPatch.shiftDate, '2026-11-15');
  assert.equal(shiftPatch.shiftId, 'SHIFT-1');

  // Perubahan filter lain (bukan rentang) tidak menyentuh pilihan shift.
  const other = applyHistoryFilterPatch(initial, { status: 'ACTIVE' });
  assert.equal(other.shiftDate, '2026-11-16');
  assert.equal(other.shiftId, 'SHIFT-1');

  // Serialisasi setelah dibersihkan tidak lagi memuat shift_date/shift_id.
  const serialized = serializeHistoryFiltersToSearchParams(manualRange);
  assert.equal(serialized.get('shift_date'), null);
  assert.equal(serialized.get('shift_id'), null);
});

// E12 T12.9 (X-2 / FAT-62): memilih rentang baru di pemilih periode
// menulis from/to ke URL (dan bisa dibaca kembali) — inilah jalur yang
// dipakai `PeriodRangePicker` lewat `updateFilters({ from, to })`.
test('memilih rentang baru menulis from/to ke URL dan membersihkan filter shift', () => {
  const initial = parseHistoryFiltersFromSearchParams(
    new URLSearchParams({
      from: '2026-11-16T07:00:00+07:00',
      to: '2026-11-16T15:00:00+07:00',
      shift_date: '2026-11-16',
      shift_id: 'SHIFT-1',
    })
  ).filters;

  const range30d = resolveTimeWindowPreset('30d', new Date('2026-11-16T10:00:00+07:00'));
  const next = applyHistoryFilterPatch(initial, { from: range30d.from, to: range30d.to });
  const serialized = serializeHistoryFiltersToSearchParams(next);
  assert.equal(serialized.get('from'), range30d.from);
  assert.equal(serialized.get('to'), range30d.to);
  assert.equal(serialized.get('shift_date'), null);
  assert.equal(serialized.get('shift_id'), null);

  // Parse balik dari URL: halaman membaca from/to baru (bisa di-refresh /
  // dibagikan) dan label scope + query memakai rentang itu.
  const reparsed = parseHistoryFiltersFromSearchParams(serialized).filters;
  assert.equal(reparsed.from, range30d.from);
  assert.equal(reparsed.to, range30d.to);
  assert.equal(reparsed.shiftDate, undefined);
  assert.equal(reparsed.shiftId, undefined);
});

test('correlateWorkOrderData links machine->device, preserves [dihapus] labels, and counts window matches', () => {
  const machines: Machine[] = [
    {
      machine_id: 'CNC-MILLING-01',
      name: 'CNC Milling Center Alpha',
      code: 'CNC-M01',
      modbus_slave_id: 1,
      bound_device_id: 'STM32-OEE-01',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    },
  ];

  const wo: WorkOrder = {
    wo_id: 'WO-2026-092',
    order_number: 'WO-2026-092',
    product_id: null,
    product_name: null,
    machine_id: 'CNC-MILLING-01',
    machine_name: 'CNC Milling Center Alpha',
    operator_id: null,
    operator_name: null,
    shift_name: 'Shift 1 (07:00-15:00)',
    target_quantity: 100,
    target_qty: 100,
    status: 'COMPLETED',
    planned_start: '2026-11-01T07:00:00+07:00',
    start_time: '2026-11-01T07:00:00+07:00',
    end_time: '2026-11-01T15:00:00+07:00',
  };

  assert.equal(resolveWorkOrderDeviceId(wo, machines), 'STM32-OEE-01');
  const win = resolveWorkOrderWindow(wo);
  assert.match(win.from, /[+-]\d{2}:\d{2}$/);
  assert.match(win.to, /[+-]\d{2}:\d{2}$/);

  const summary = correlateWorkOrderData({
    workOrder: wo,
    machines,
    telemetryRecords: [
      {
        id: 't1',
        device_id: 'STM32-OEE-01',
        timestamp: '2026-11-01T09:00:00+07:00',
        fsm_state: 'RUNNING',
        total_count: 50,
        good_count: 48,
        reject_count: 2,
        totalCount: 50,
        goodCount: 48,
        rejectCount: 2,
        oee: 85.0,
        availability: 95.0,
        performance: 92.0,
        quality: 96.0,
        cycle_time_ms: 42000,
      },
      {
        id: 't-out',
        device_id: 'STM32-OEE-01',
        timestamp: '2026-11-02T09:00:00+07:00',
        fsm_state: 'RUNNING',
        total_count: 99,
        good_count: 99,
        reject_count: 0,
        oee: 99,
        availability: 100,
        performance: 100,
        quality: 100,
        cycle_time_ms: 40000,
      },
    ],
    hourlyPoints: [
      {
        hour: '14:00',
        oee: 84,
        availability: 92,
        performance: 93,
        quality: 98,
        parts_produced: 47,
        defect_count: 1,
        provisional: true,
      },
    ],
    downtimeEvents: [
      {
        id: 'dt1',
        device_id: 'STM32-OEE-01',
        machine_id: 'CNC-MILLING-01',
        machine_name: 'CNC Milling Center Alpha',
        started_at: '2026-11-01T10:00:00+07:00',
        ended_at: '2026-11-01T10:15:00+07:00',
        duration_seconds: 900,
        category: 'EQUIPMENT_FAILURE',
        reason: 'Alarm',
        is_labeled: true,
        created_at: '2026-11-01T10:00:00+07:00',
      },
    ],
    operationalEvents: [
      {
        id: 'op1',
        recorded_at: '2026-11-01T14:55:00+07:00',
        device_id: 'STM32-OEE-01',
        station_label: null,
        machine_id: 'CNC-MILLING-01',
        machine_name: 'CNC Milling Center Alpha',
        wo_id: null,
        event_type: 'WORK_ORDER_COMPLETED',
        category: 'operational',
        alarm_state: 'acked',
        condition: 'NORMAL',
        trigger_source: 'ADMIN_PANEL',
        event_code: null,
        snapshot_total_count: null,
        snapshot_run_sec: null,
        description: 'Done',
        acknowledged: true,
        acknowledged_at: null,
        acknowledged_by: null,
        ack_note: null,
        created_at: '2026-11-01T14:55:00+07:00',
      },
    ],
  });

  assert.equal(summary.productDeleted, true);
  assert.equal(summary.productLabel, '[dihapus]');
  assert.equal(summary.operatorDeleted, true);
  assert.equal(summary.operatorLabel, '[dihapus]');
  assert.equal(summary.telemetrySampleCount, 1);
  assert.equal(summary.totalGoodParts, 48);
  assert.equal(summary.totalRejectParts, 2);
  assert.equal(summary.downtimeCount, 1);
  assert.equal(summary.totalDowntimeSec, 900);
  assert.equal(summary.operationalEventCount, 1);
  assert.equal(summary.provisionalHourlyCount, 1);
});

test('formatRollupPerformance formats numeric strings and handles null/zero/unknown capacity', () => {
  assert.equal(formatRollupPerformance(null), '— (Kapasitas 0/Unknown)');
  assert.equal(formatRollupPerformance(undefined), '— (Kapasitas 0/Unknown)');
  assert.equal(formatRollupPerformance('93.4'), '93.40%');
  assert.equal(formatRollupPerformance(88.125), '88.13%');
});
