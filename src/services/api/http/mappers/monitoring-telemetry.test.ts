import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRollup } from './monitoring-telemetry';

// FAT-307: groupKey rollup mengikuti groupBy baris — day/month memakai
// `bucket` (tanggal), bukan machineId. Regresi dari verifikasi visual live
// 2026-11-23: rollup Per Hari menampilkan "CNC-MILLING-SIM" di kolom
// TANGGAL karena pick selalu mendahulukan machineId.
const baseRow = {
  totalCount: 100,
  goodCount: 90,
  rejectCount: 10,
  operatingSec: 3600,
  runSec: 1800,
  availabilityPct: 50,
  performancePct: 80,
  qualityPct: 90,
  oeePct: 36,
  sampleCount: 5,
  provisional: false,
};

test('mapRollup: groupBy=day memakai bucket (tanggal) sebagai groupKey, bukan machineId', () => {
  const item = mapRollup({
    ...baseRow,
    groupBy: 'day',
    bucket: '2026-11-23',
    machineId: 'CNC-MILLING-SIM',
    deviceId: 'STM32-OEE-SIM',
  });
  assert.equal(item.groupKey, '2026-11-23');
  assert.equal(item.bucket, '2026-11-23');
});

test('mapRollup: groupBy=month memakai bucket sebagai groupKey', () => {
  const item = mapRollup({ ...baseRow, groupBy: 'month', bucket: '2026-11', machineId: 'CNC-MILLING-SIM' });
  assert.equal(item.groupKey, '2026-11');
});

test('mapRollup: groupBy=machine tetap memakai machineId sebagai groupKey', () => {
  const item = mapRollup({ ...baseRow, groupBy: 'machine', bucket: '2026-11-23', machineId: 'CNC-MILLING-SIM' });
  assert.equal(item.groupKey, 'CNC-MILLING-SIM');
});

test('mapRollup: groupBy=line tetap memakai lineId sebagai groupKey', () => {
  const item = mapRollup({ ...baseRow, groupBy: 'line', bucket: '2026-11-23', lineId: 'LINI-01' });
  assert.equal(item.groupKey, 'LINI-01');
});

test('mapRollup: groupBy=day tanpa bucket jatuh ke machineId (graceful)', () => {
  const item = mapRollup({ ...baseRow, groupBy: 'day', bucket: null, machineId: 'CNC-MILLING-SIM' });
  assert.equal(item.groupKey, 'CNC-MILLING-SIM');
});
