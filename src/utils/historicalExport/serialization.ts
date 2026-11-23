import { DowntimeEvent, OperationalEvent } from '../../types/monitoring';
import { HourlyOeePoint, TelemetryHistoryRecord, TelemetryRollupItem } from '../../types/analytics';
import { ExportFormat, ExportMetadata } from '../../types/historical';
import type { AuditTrailRecord } from '../../types/system';
import type { IamAuditDecision } from '../../types/iam';
import { mapDowntimeToSixBigLoss } from './sixBigLoss';

/**
 * E12 T12.7 (F-8 / FAT-60): daftar kolom CSV ekspor — disamakan dengan layar.
 *
 * Prinsip: *what you see is what you export*. Setiap kolom layar
 * (TelemetryRawColumns / TelemetryHourlyColumns / TelemetryRollupColumns)
 * punya tepat satu kolom CSV dengan nama yang sama, dan satuan mengikuti
 * layar: durasi dalam detik (`*_sec`), suhu °C (`temperature_c`), cycle
 * dalam detik (`cycle_time_sec` — layar menampilkan detik, bukan ms).
 * Dipakai sebagai pendekatan "samakan kolom", BUKAN "dataset lengkap":
 * kolom yang tidak tampil di layar (`id`, `device_id`, `vibration_rms`)
 * tidak diekspor di CSV raw.
 *
 * Pengecualian hourly: kolom yang tidak tampil di layar tapi tetap
 * diekspor diberi awalan `extra_` supaya tidak ada kolom "hantu" tanpa
 * penjelasan.
 *
 * E12 T12.14 (F-10 / FAT-66): `extra_hourly_downtime_sec` DIHAPUS di sini
 * — `hourly_downtime_sec` dihapus dari kontrak (API doc §D1); downtime
 * sumber kebenarannya ada di `downtime_events.duration_sec`. Jangan
 * menambahkannya kembali sebagai kolom ekspor hourly.
 */
export const TELEMETRY_RAW_CSV_COLUMNS = [
  'timestamp',
  'fsm_state',
  'packet_mode',
  'oee',
  'availability',
  'performance',
  'quality',
  'total_count',
  'good_count',
  'reject_count',
  'operating_time_sec',
  'run_time_sec',
  'downtime_sec',
  'cycle_time_sec',
  'temperature_c',
] as const;

export const TELEMETRY_HOURLY_CSV_COLUMNS = [
  // Kolom layar (1:1 dengan TelemetryHourlyColumns).
  'hour',
  'state',
  'oee',
  'availability',
  'performance',
  'quality',
  'parts_produced',
  'defect_count',
  'sample_count',
  'provisional',
  // Kolom tambahan — awalan `extra_` membedakannya dari kolom layar.
  'extra_bucket',
  'extra_good_count',
  'extra_hourly_operating_sec',
  'extra_hourly_run_sec',
  'extra_target_per_hour',
  'extra_planned',
] as const;

export const TELEMETRY_ROLLUP_CSV_COLUMNS = [
  'group_key',
  'machine_name',
  'device_id',
  'oee_pct',
  'availability_pct',
  'performance_pct',
  'quality_pct',
  'total_count',
  'good_count',
  'reject_count',
  'operating_sec',
  'run_sec',
  'sample_count',
  'provisional',
] as const;

export function parseExportMetadataHeaders(
  headers: Headers | Record<string, string | undefined>
): ExportMetadata {
  const read = (key: string): string => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(key) || (headers as Headers).get(key.toLowerCase()) || '';
    }
    const rec = headers as Record<string, string | undefined>;
    return rec[key] ?? rec[key.toLowerCase()] ?? '';
  };

  return {
    source: read('X-Export-Source') || 'timescaledb-hypertable',
    generatedAt: read('X-Export-Generated-At') || new Date().toISOString(),
    deviceId: read('X-Export-Device-Id') || 'ALL',
    timeWindow: read('X-Export-Time-Window') || '',
    contentDisposition: read('Content-Disposition') || undefined,
  };
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeExportRecords<T extends Record<string, unknown>>(
  records: T[],
  format: ExportFormat,
  columns?: (keyof T)[]
): { content: string; mimeType: string; extension: string } {
  if (format === 'json') {
    return {
      content: JSON.stringify(records, null, 2),
      mimeType: 'application/json;charset=utf-8',
      extension: 'json',
    };
  }

  if (format === 'ndjson') {
    return {
      content: records.map((r) => JSON.stringify(r)).join('\n'),
      mimeType: 'application/x-ndjson;charset=utf-8',
      extension: 'ndjson',
    };
  }

  const cols: (keyof T)[] =
    columns && columns.length > 0
      ? columns
      : records.length > 0
      ? (Object.keys(records[0]) as (keyof T)[])
      : [];

  const headerLine = cols.map((c) => escapeCsvCell(String(c))).join(',');
  const rows = records.map((row) => cols.map((c) => escapeCsvCell(row[c])).join(','));

  return {
    content: [headerLine, ...rows].join('\n'),
    mimeType: 'text/csv;charset=utf-8',
    extension: 'csv',
  };
}

export function formatDowntimeExportRows(events: DowntimeEvent[]): Record<string, unknown>[] {
  return events.map((ev) => {
    const sbl = mapDowntimeToSixBigLoss(ev.category);
    return {
      id: ev.id,
      device_id: ev.device_id ?? '[deleted]',
      machine_id: ev.machine_id ?? '[deleted]',
      machine_name: ev.machine_name,
      category: ev.category,
      six_big_loss_group: sbl.group,
      six_big_loss_label: sbl.label,
      oee_pillar: sbl.oee_pillar,
      reason: ev.reason,
      notes: ev.notes ?? '',
      is_labeled: ev.is_labeled,
      started_at: ev.started_at,
      ended_at: ev.ended_at ?? '',
      duration_seconds: ev.duration_seconds,
      duration_formatted: ev.durationFormatted ?? '',
      acknowledged_by: ev.acknowledged_by ?? '',
      created_at: ev.created_at,
    };
  });
}

/**
 * E20 P20.4 (FAT-156): baris ekspor = kolom `OperationalEventItem` FR-034-01
 * (API doc §I) — `recorded_at` + `description`, tanpa `severity` (tidak ada
 * di dokumen) dan tanpa `timestamp`/`message` lama.
 */
export function formatOperationalEventExportRows(events: OperationalEvent[]): Record<string, unknown>[] {
  return events.map((ev) => ({
    id: ev.id,
    recorded_at: ev.recorded_at,
    device_id: ev.device_id ?? '[deleted]',
    machine_id: ev.machine_id ?? '',
    machine_name: ev.machine_name ?? '',
    wo_id: ev.wo_id ?? '',
    event_type: ev.event_type,
    trigger_source: ev.trigger_source ?? '',
    event_code: ev.event_code ?? '',
    snapshot_total_count: ev.snapshot_total_count ?? '',
    snapshot_run_sec: ev.snapshot_run_sec ?? '',
    description: ev.description,
    acknowledged: ev.acknowledged,
    acknowledged_by: ev.acknowledged_by ?? '',
    acknowledged_at: ev.acknowledged_at ?? '',
    ack_note: ev.ack_note ?? '',
    created_at: ev.created_at,
  }));
}

/**
 * P33.4 (FAT-294, B33.2): baris ekspor arsip audit = kolom record
 * `AuditTrailRecord` (§2 docs/BACKEND_REQUIREMENTS_E33_PAGES.md) —
 * `old_value`/`new_value` diserialkan sebagai JSON (string) supaya satu
 * sel CSV memuat satu nilai JSON utuh; null eksplisit → string kosong.
 * Menggantikan `formatSystemAuditExportRows` (alias `/system/audit`).
 */
export function formatAuditTrailExportRows(records: AuditTrailRecord[]): Record<string, unknown>[] {
  return records.map((r) => ({
    id: r.id,
    seq: r.seq,
    recorded_at: r.recorded_at,
    actor: r.actor,
    actor_role: r.actor_role ?? '',
    action: r.action,
    category: r.category,
    entity_type: r.entity_type ?? '',
    entity_id: r.entity_id ?? '',
    entity_label: r.entity_label ?? '',
    old_value: r.old_value === null || r.old_value === undefined ? '' : JSON.stringify(r.old_value),
    new_value: r.new_value === null || r.new_value === undefined ? '' : JSON.stringify(r.new_value),
    reason: r.reason ?? '',
    source: r.source,
    prev_hash: r.prev_hash ?? '',
    hash: r.hash ?? '',
  }));
}

/**
 * P33.6 (FAT-301): kolom CSV ekspor Audit IAM = kolom layar
 * (timestamp, subject, decision, mode, action, resource, reason).
 */
export function formatIamAuditExportRows(decisions: IamAuditDecision[]): Record<string, unknown>[] {
  return decisions.map((d) => ({
    timestamp: d.timestamp,
    subject: d.subject,
    decision: d.decision,
    mode: d.mode,
    action: d.action,
    resource: d.resource,
    reason: d.reason ?? '',
  }));
}

/**
 * E12 T12.7 (F-8 / FAT-60): kolom CSV raw = kolom layar (lihat
 * TelemetryRawColumns): timestamp, FSM state, packet mode, OEE/A/P/Q,
 * counters T/G/R, durasi Op/Run/Down (detik), cycle (detik, sama seperti
 * layar — bukan `cycle_time_ms`), suhu °C. `id`/`device_id`/`vibration_rms`
 * tidak tampil di layar sehingga tidak diekspor (perangkat sudah ada di
 * nama file + header metadata ekspor).
 */
export function formatTelemetryExportRows(records: TelemetryHistoryRecord[]): Record<string, unknown>[] {
  return records.map((t) => ({
    timestamp: t.timestamp,
    fsm_state: t.fsm_state,
    packet_mode: t.is_buffered ? 'BUFFERED' : 'REALTIME',
    oee: t.oee,
    availability: t.availability,
    performance: t.performance,
    quality: t.quality,
    total_count: t.total_count,
    good_count: t.good_count,
    reject_count: t.reject_count,
    operating_time_sec: t.operatingTimeSec ?? '',
    run_time_sec: t.runTimeSec ?? '',
    downtime_sec: t.downtimeSec ?? '',
    cycle_time_sec:
      t.lastCycleTimeSec !== undefined && t.lastCycleTimeSec !== null
        ? t.lastCycleTimeSec
        : t.cycle_time_ms / 1000,
    temperature_c: t.temperature_c ?? '',
  }));
}

/**
 * E12 T12.7 (F-8 / FAT-60): kolom CSV hourly = kolom layar
 * (TelemetryHourlyColumns) + kolom tambahan berawalan `extra_`.
 * E12 T12.14 (F-10 / FAT-66): `extra_hourly_downtime_sec` dihapus —
 * `hourly_downtime_sec` bukan lagi bagian kontrak (API doc §D1).
 */
export function formatTelemetryHourlyExportRows(points: HourlyOeePoint[]): Record<string, unknown>[] {
  return points.map((h) => ({
    hour: h.hour,
    state: h.state ?? '',
    oee: h.oee,
    availability: h.availability,
    performance: h.performance,
    quality: h.quality,
    parts_produced: h.parts_produced,
    defect_count: h.defect_count,
    sample_count: h.sampleCount ?? 0,
    provisional: h.provisional ?? false,
    extra_bucket: h.bucket ?? '',
    extra_good_count: h.good_count ?? '',
    extra_hourly_operating_sec: h.hourly_operating_sec ?? '',
    extra_hourly_run_sec: h.hourly_run_sec ?? '',
    extra_target_per_hour: h.targetPerHour ?? '',
    extra_planned: h.planned ?? false,
  }));
}

/**
 * E12 T12.7 (F-8 / FAT-60): kolom CSV rollup = kolom layar
 * (TelemetryRollupColumns) dari baris yang sedang tampil. Satu sel layar
 * "Mesin / Perangkat" dipecah menjadi tiga kolom (`group_key`,
 * `machine_name`, `device_id`) supaya nilainya tetap bisa dipetakan 1:1.
 * `performance_pct` null (kapasitas 0/unknown, layar menampilkan
 * "— (Kapasitas 0/Unknown)") diekspor sebagai kosong.
 */
export function formatTelemetryRollupExportRows(items: TelemetryRollupItem[]): Record<string, unknown>[] {
  return items.map((r) => ({
    group_key: r.groupKey,
    machine_name: r.machine_name ?? '',
    device_id: r.device_id ?? '',
    oee_pct: r.oeePct,
    availability_pct: r.availabilityPct,
    performance_pct: r.performancePct ?? '',
    quality_pct: r.qualityPct,
    total_count: r.totalCount,
    good_count: r.goodCount,
    reject_count: r.rejectCount,
    operating_sec: r.operatingSec,
    run_sec: r.runSec,
    sample_count: r.sampleCount,
    provisional: r.provisional,
  }));
}
