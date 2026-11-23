import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAuditTrailRecord, mapOperationalEvent } from './monitoring-events';

// ---------------------------------------------------------------------------
// P33.4 (FAT-294, E33 Opsi 3): mapper kontrak live B33.1/B33.2/B33.4.
// - mapOperationalEvent: `category` + `alarmState` + `condition` dibaca
//   dari server; fallback hanya untuk respons backend lama.
// - mapAuditTrailRecord: record arsip `GET /system/audit-trail` (§2) —
//   `oldValue`/`newValue` dipertahankan apa adanya, termasuk null eksplisit.
// ---------------------------------------------------------------------------

function rawEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1148,
    recordedAt: '2026-11-20T09:53:00.000Z',
    deviceId: 'STM32-OEE-SIM',
    machineId: 'CNC-MILLING-SIM',
    machineName: 'Milling 5-Axis CNC (Simulation)',
    woId: null,
    eventType: 'DEVICE_OFFLINE',
    triggerSource: 'DEVICE',
    eventCode: null,
    snapshotTotalCount: null,
    snapshotRunSec: null,
    description: 'Device offline',
    createdAt: '2026-11-20T09:53:00.000Z',
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedBy: null,
    ackNote: null,
    ...overrides,
  };
}

test('mapOperationalEvent: category + alarmState + condition server dibaca apa adanya', () => {
  const ev = mapOperationalEvent(
    rawEvent({ category: 'operational', alarmState: 'rtn-unack', condition: 'CLEAR' })
  );
  assert.equal(ev.category, 'operational');
  assert.equal(ev.alarm_state, 'rtn-unack');
  assert.equal(ev.condition, 'CLEAR');
});

test('mapOperationalEvent: snake_case alarm_state/condition juga dibaca', () => {
  const ev = mapOperationalEvent(rawEvent({ alarm_state: 'acked', condition: 'NORMAL' }));
  assert.equal(ev.alarm_state, 'acked');
  assert.equal(ev.condition, 'NORMAL');
});

test('mapOperationalEvent: tanpa category → fallback system (bukan hilang)', () => {
  const ev = mapOperationalEvent(rawEvent({ category: undefined }));
  assert.equal(ev.category, 'system');
});

test('mapOperationalEvent: category tidak dikenal → fallback system', () => {
  const ev = mapOperationalEvent(rawEvent({ category: 'misteri' }));
  assert.equal(ev.category, 'system');
});

test('mapOperationalEvent: tanpa alarmState → acked bila sudah di-ack, selainnya active-unack', () => {
  const acked = mapOperationalEvent(rawEvent({ acknowledgedAt: '2026-11-20T10:00:00.000Z' }));
  assert.equal(acked.alarm_state, 'acked');
  const unacked = mapOperationalEvent(rawEvent({}));
  assert.equal(unacked.alarm_state, 'active-unack');
});

test('mapOperationalEvent: condition tidak dikenal → null (tidak dikarang)', () => {
  const ev = mapOperationalEvent(rawEvent({ condition: 'WEIRD' }));
  assert.equal(ev.condition, null);
});

function rawAuditTrail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'aud-20261121-000123',
    seq: 123,
    recordedAt: '2026-11-21T03:33:00.000Z',
    actor: 'ADM-001',
    actorRole: 'ADMIN',
    action: 'OPERATOR_PROVISIONED',
    category: 'system',
    entityType: 'operator',
    entityId: 'OPR-1001',
    entityLabel: 'Operator 1001',
    oldValue: null,
    newValue: { operatorId: 'OPR-1001', role: 'OPERATOR' },
    reason: 'Penambahan operator shift pagi',
    source: 'panel',
    prevHash: '9f2c',
    hash: 'a41d',
    ...overrides,
  };
}

test('mapAuditTrailRecord: semua field record arsip dipetakan', () => {
  const rec = mapAuditTrailRecord(rawAuditTrail());
  assert.equal(rec.id, 'aud-20261121-000123');
  assert.equal(rec.seq, 123);
  assert.equal(rec.recorded_at, '2026-11-21T03:33:00.000Z');
  assert.equal(rec.actor, 'ADM-001');
  assert.equal(rec.actor_role, 'ADMIN');
  assert.equal(rec.action, 'OPERATOR_PROVISIONED');
  assert.equal(rec.category, 'system');
  assert.equal(rec.entity_type, 'operator');
  assert.equal(rec.entity_id, 'OPR-1001');
  assert.equal(rec.entity_label, 'Operator 1001');
  assert.equal(rec.old_value, null);
  assert.deepEqual(rec.new_value, { operatorId: 'OPR-1001', role: 'OPERATOR' });
  assert.equal(rec.reason, 'Penambahan operator shift pagi');
  assert.equal(rec.source, 'panel');
  assert.equal(rec.prev_hash, '9f2c');
  assert.equal(rec.hash, 'a41d');
});

test('mapAuditTrailRecord: oldValue null eksplisit dipertahankan (bukan hilang); newValue null = penghapusan', () => {
  const rec = mapAuditTrailRecord(rawAuditTrail({ oldValue: { name: 'Lama' }, newValue: null }));
  assert.deepEqual(rec.old_value, { name: 'Lama' });
  assert.equal(rec.new_value, null);
});

test('mapAuditTrailRecord: snake_case dibaca; source di luar enum → system', () => {
  const rec = mapAuditTrailRecord({
    id: 'aud-1',
    seq: 1,
    recorded_at: '2026-11-21T00:00:00Z',
    actor: 'ADM-001',
    actor_role: null,
    action: 'MASTER_DATA_MUTATION',
    category: 'system',
    entity_type: 'machine',
    entity_id: 'M-01',
    entity_label: null,
    old_value: null,
    new_value: null,
    reason: null,
    source: ' entah',
    prev_hash: null,
    hash: null,
  });
  assert.equal(rec.source, 'system');
  assert.equal(rec.seq, 1);
});
