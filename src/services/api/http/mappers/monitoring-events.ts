/**
 * Mapper backend→lokal — operational event + audit trail.
 *
 * Dipisah dari mappers/monitoring.ts pada refactoring E31.15 (FAT-278, R10:
 * satu file mapper = satu domain). Barrel penggabung: mappers/monitoring.ts.
 */
import { AuditTrailRecord, AuditTrailSource } from '../../../../types/system';
import { AlarmState, EventCategory, EventCondition, OperationalEvent } from '../../../../types/monitoring';
import { num, str, pick } from '../primitives';

/** Nilai `category` server yang sah; selainnya → fallback 'system' (di bawah). */
function readEventCategory(v: unknown): EventCategory | null {
  return v === 'operational' || v === 'system' ? v : null;
}

/** Nilai `alarmState` server yang sah; selainnya → null (fallback di pemanggil). */
function readAlarmState(v: unknown): AlarmState | null {
  return v === 'active-unack' || v === 'rtn-unack' || v === 'acked' ? v : null;
}

function readEventCondition(v: unknown): EventCondition | null {
  return v === 'ACTIVE' || v === 'CLEAR' || v === 'NORMAL' ? v : null;
}

/**
 * E20 P20.4 (FAT-156): `OperationalEventItem` FR-034-01 persis (API doc §I).
 * - `acknowledged` DITURUNKAN dari `acknowledgedAt` (bukan dibaca dari field).
 * - `machineName` null bila mesin dihapus (jangan default 'Plant System').
 * - Baca `description` + `recordedAt`; `snapshotTotalCount`/`snapshotRunSec`
 *   dibuang bila tak ada (null) — jangan dikarang. Tidak ada `severity`.
 * - `event_type` diteruskan apa adanya (enum tertutup + pola); bila absen
 *   kosong — jangan default ke nilai tebakan ('STATE_CHANGE' dihapus).
 * - `recorded_at`/`created_at` kosong ('') bila tak ada — jangan isi epoch
 *   (primitif `iso()` mengarang 1970-01-01).
 * - E27 (FAT-233, T2): `station_label` dibaca TOLERAN (camelCase/snake_case)
 *   — event lama tanpa field ini → null, tidak throw. Nilai mentah dari
 *   klien (UNTRUSTED): tampilkan apa adanya, jangan jadikan key/lookup.
 */
export function mapOperationalEvent(raw: unknown): OperationalEvent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const deviceId = pick(r.deviceId, r.device_id);
  const machineId = pick(r.machineId, r.machine_id);
  const machineName = pick(r.machineName, r.machine_name);
  const recordedAt = pick(r.recordedAt, r.recorded_at);
  const createdAt = pick(r.createdAt, r.created_at);
  const acknowledgedAt = pick(r.acknowledgedAt, r.acknowledged_at);
  const strOrEmpty = (v: unknown): string => (typeof v === 'string' ? v : '');
  const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const acknowledged = acknowledgedAt !== undefined && acknowledgedAt !== null;
  return {
    id: String(pick(r.id) ?? ''),
    recorded_at: strOrEmpty(recordedAt),
    device_id: deviceId === '[deleted]' ? null : (deviceId as string | null) ?? null,
    station_label: strOrNull(pick(r.stationLabel, r.station_label)),
    machine_id: machineId === '[deleted]' ? null : (machineId as string | null) ?? null,
    machine_name: machineName === '[deleted]' ? null : (machineName as string | null) ?? null,
    wo_id: (pick(r.woId, r.wo_id) as string | null) ?? null,
    event_type: (pick(r.eventType, r.event_type) as OperationalEvent['event_type']) ?? ('' as OperationalEvent['event_type']),
    trigger_source: strOrNull(pick(r.triggerSource, r.trigger_source)),
    event_code: numOrNull(pick(r.eventCode, r.event_code)),
    snapshot_total_count: numOrNull(pick(r.snapshotTotalCount, r.snapshot_total_count)),
    snapshot_run_sec: numOrNull(pick(r.snapshotRunSec, r.snapshot_run_sec)),
    description: str(pick(r.description), ''),
    acknowledged,
    acknowledged_at: strOrNull(acknowledgedAt),
    acknowledged_by: strOrNull(pick(r.acknowledgedBy, r.acknowledged_by)),
    ack_note: strOrNull(pick(r.ackNote, r.ack_note, r.note)),
    created_at: strOrEmpty(createdAt ?? recordedAt),
    // P33.4 (FAT-294, B33.1/B33.4): `category` + `alarmState` + `condition`
    // dibaca dari server (kontrak live, OpenAPI 2026-11-23). Fallback hanya
    // untuk respons backend lama yang belum mengirimnya — BUKAN tebakan
    // atas data baru: kategori → 'system' (lebih aman tampil di arsip
    // audit daripada hilang dari kedua keluarga — alasan yang sama dengan
    // `eventCategory.ts`); alarm → 'acked' bila sudah di-ack, selainnya
    // 'active-unack' (tampilkan "Belum Ack", jangan sembunyikan baris);
    // `condition` null bila tak ada (tidak ada default yang aman).
    category: readEventCategory(pick(r.category)) ?? 'system',
    alarm_state: readAlarmState(pick(r.alarmState, r.alarm_state)) ?? (acknowledged ? 'acked' : 'active-unack'),
    condition: readEventCondition(pick(r.condition)),
  };
}

/**
 * P33.4 (FAT-294, B33.2): mapper record arsip audit — `GET
 * /system/audit-trail` (§2 docs/BACKEND_REQUIREMENTS_E33_PAGES.md).
 * Bentuknya BUKAN `OperationalEventItem`: `seq`, `actor`, `action`,
 * `entity*`, `oldValue`/`newValue`, `reason`, `source`, `prevHash`/`hash`.
 * `oldValue`/`newValue` dipertahankan APA ADANYA (JSON bebas — objek,
 * skalar, atau null eksplisit); null eksplisit bermakna (pembuatan /
 * penghapusan) sehingga dibaca langsung dari field, bukan lewat `pick`
 * (pick melewatkan null). `source` di luar enum kanonik → 'system'
 * (aksi otomatis — nilai paling netral).
 */
export function mapAuditTrailRecord(raw: unknown): AuditTrailRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  const strOrEmpty = (v: unknown): string => (typeof v === 'string' ? v : '');
  const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  const valueOrNull = (camel: string, snake: string): unknown =>
    r[camel] !== undefined ? r[camel] : r[snake] !== undefined ? r[snake] : null;
  const sourceRaw = pick(r.source);
  const source: AuditTrailSource =
    sourceRaw === 'panel' || sourceRaw === 'hmi' || sourceRaw === 'api' || sourceRaw === 'system'
      ? sourceRaw
      : 'system';
  return {
    id: String(pick(r.id) ?? ''),
    seq: num(pick(r.seq), 0),
    recorded_at: strOrEmpty(pick(r.recordedAt, r.recorded_at)),
    actor: str(pick(r.actor), 'system'),
    actor_role: strOrNull(pick(r.actorRole, r.actor_role)),
    action: str(pick(r.action), ''),
    category: readEventCategory(pick(r.category)) ?? 'system',
    entity_type: strOrNull(pick(r.entityType, r.entity_type)),
    entity_id: strOrNull(pick(r.entityId, r.entity_id)),
    entity_label: strOrNull(pick(r.entityLabel, r.entity_label)),
    old_value: valueOrNull('oldValue', 'old_value'),
    new_value: valueOrNull('newValue', 'new_value'),
    reason: strOrNull(pick(r.reason)),
    source,
    prev_hash: strOrNull(pick(r.prevHash, r.prev_hash)),
    hash: strOrNull(pick(r.hash, r.hash)),
  };
}
