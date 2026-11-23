import {
  DowntimeExportQuery,
  DowntimeHistoryQuery,
  OperationalEventsExportQuery,
  OperationalEventsQuery,
  SystemAuditTrailExportQuery,
  SystemAuditTrailQuery,
  TelemetryExportQuery,
  TelemetryHistoryQuery,
  WorkOrdersQuery,
} from '../../types/historical';
import { TelemetryRollupQuery } from '../../types/analytics';
// E12 T12.8 (F-9 / FAT-61): builder telemetry mendelegasikan path ke registry
// (ADMIN_ENDPOINTS) — satu sumber kebenaran path, sesuai kontrak
// docs/DIRECTORY_STRUCTURE.md §4 aturan 6. Builder di sini hanya menambah
// query string di atas path registry; template path tidak lagi diduplikasi.
// Arah impor: utils/historicalExport → services/api/endpoints (barrel) →
// services/api/endpoints/telemetry → definition. Tidak ada siklus: registry
// endpoint tidak mengimpor apa pun dari utils/ maupun dari demo/http.
import { ADMIN_ENDPOINTS } from '../../services/api/endpoints';

function buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
      sp.set(k, String(v));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function buildWorkOrdersEndpoint(query: WorkOrdersQuery = {}): string {
  // E23 Batch 2 (FAT-188, N-19): spec live GET /work-orders TIDAK punya
  // param `wo_id` (hanya status, machine_id, product_id, operator_id,
  // from, to, limit, cursor, envelope) — mengirimnya membuat server
  // mengabaikannya diam-diam sehingga filter WO ID tak berfungsi (D-12:
  // hanya kirim param terdaftar). `query.wo_id` TIDAK dikirim; filter
  // diterapkan sisi klien di http/workOrders.ts + demo/workOrders.ts.
  const qs = buildQueryString({
    status: query.status,
    machine_id: query.machine_id,
    product_id: query.product_id,
    operator_id: query.operator_id,
    from: query.from,
    to: query.to,
    limit: query.limit,
    cursor: query.cursor,
    envelope: query.envelope ?? true,
  });
  return `/api/v1/work-orders${qs}`;
}

export function buildDowntimeHistoryEndpoint(query: DowntimeHistoryQuery): string {
  const deviceId = encodeURIComponent(query.device_id);
  // E23 Batch 3 (FAT-194, N-25): spec live TIDAK mendaftarkan param
  // `category` (hanya from/to/unlabeled_only/active_only/limit/cursor/
  // envelope) — `query.category` TIDAK dikirim; filter kategori
  // diterapkan sisi klien (http/demo getDowntimeHistoryPage).
  const qs = buildQueryString({
    from: query.from,
    to: query.to,
    unlabeled_only: query.unlabeled_only ? 'true' : undefined,
    active_only: query.active_only ? 'true' : undefined,
    cursor: query.cursor,
    limit: query.limit,
    envelope: query.envelope ?? true,
  });
  return `/api/v1/downtime-events/${deviceId}${qs}`;
}

export function buildDowntimeExportEndpoint(query: DowntimeExportQuery): string {
  const deviceId = encodeURIComponent(query.device_id);
  // E23 Batch 3 (FAT-194, N-25): `category` tidak terdaftar di spec —
  // tidak dikirim (lihat buildDowntimeHistoryEndpoint).
  // E23 Batch 3 (FAT-192, N-23): spec MEWAJIBKAN `limit` (default 10000).
  const qs = buildQueryString({
    from: query.from,
    to: query.to,
    unlabeled_only: query.unlabeled_only ? 'true' : undefined,
    active_only: query.active_only ? 'true' : undefined,
    format: query.format,
    limit: query.limit ?? 10000,
  });
  return `/api/v1/downtime-events/${deviceId}/export${qs}`;
}

/**
 * E20 P20.4 (FAT-156, O4/O13/R9, D-12): hanya kirim parameter terdaftar
 * `GET /operational-events` (from, to, event_type, acknowledged, limit,
 * cursor, envelope) — tanpa trailing slash, tanpa `machine_id` (hanya
 * /system/audit), tanpa `severity`. Filter `acknowledged` yang sebelumnya
 * dibuang kini dikirim.
 *
 * P33.4 (FAT-294, B33.1/B33.4): + `category` (`system|operational`) dan
 * `alarmState` (`active-unack|rtn-unack|acked`) — terdaftar di OpenAPI
 * live 2026-11-23. `category` adalah keluarga halaman: Alarm & Event
 * selalu mengirim `operational` (lihat `useOperationalEventsQuery`).
 */
export function buildOperationalEventsEndpoint(query: OperationalEventsQuery): string {
  const isGlobal = !query.device_id || query.device_id === 'ALL';
  const base = isGlobal
    ? '/api/v1/operational-events'
    : `/api/v1/operational-events/${encodeURIComponent(query.device_id!)}`;
  const qs = buildQueryString({
    from: query.from,
    to: query.to,
    event_type: query.event_type,
    acknowledged: query.acknowledged !== undefined ? String(query.acknowledged) : undefined,
    category: query.category,
    alarmState: query.alarm_state,
    cursor: query.cursor,
    limit: query.limit,
    envelope: query.envelope ?? true,
  });
  return `${base}${qs}`;
}

/**
 * E20 P20.4 (FAT-156, O8/O13, D-12): `GET /operational-events/export` hanya
 * mendaftarkan `from, to, format, limit` — tanpa `machine_id`/`event_type`.
 * E23 Batch 3 (FAT-201, N-34): KOREKSI — spec live JUSTRU mendaftarkan
 * `event_type` (dan `machine_id`/`machineId`) pada ekspor op-events;
 * klaim lama 'tanpa machine_id/event_type' keliru untuk event_type.
 * `event_type` kini dikirim bila filter diisi; `machine_id` tetap TIDAK
 * dikirim (B23: hanya /system/audit yang memuatnya).
 * E23 Batch 3 (FAT-192, N-23): spec MEWAJIBKAN `limit` (default 10000).
 */
export function buildOperationalEventsExportEndpoint(query: OperationalEventsExportQuery): string {
  const isGlobal = !query.device_id || query.device_id === 'ALL';
  const base = isGlobal
    ? '/api/v1/operational-events/export'
    : `/api/v1/operational-events/${encodeURIComponent(query.device_id!)}/export`;
  const qs = buildQueryString({
    from: query.from,
    to: query.to,
    event_type: query.event_type,
    format: query.format,
    limit: query.limit ?? 10000,
  });
  return `${base}${qs}`;
}

/**
 * P33.4 (FAT-294, B33.2): `GET /system/audit-trail` — filter daftar
 * halaman Audit Trail (actor, category, entityId, entityType, action,
 * machine_id, from, to, limit, cursor). Tanpa param `envelope` (respons
 * selalu `{data, meta, pagination}`).
 */
export function buildSystemAuditTrailEndpoint(query: SystemAuditTrailQuery): string {
  const qs = buildQueryString({
    actor: query.actor,
    category: query.category,
    entityId: query.entityId,
    entityType: query.entityType,
    action: query.action,
    machine_id: query.machine_id,
    from: query.from,
    to: query.to,
    limit: query.limit,
    cursor: query.cursor,
  });
  return `${ADMIN_ENDPOINTS.SYSTEM_AUDIT_TRAIL.buildPath()}${qs}`;
}

/**
 * P33.4 (FAT-294, B33.2): `GET /system/audit-trail/export` — filter sama
 * dengan daftar KECUALI `machine_id` (tidak terdaftar di endpoint ekspor
 * live — lihat `SystemAuditTrailExportQuery`). Menggantikan
 * `buildSystemAuditExportEndpoint` (/system/audit/export, alias lama).
 */
export function buildSystemAuditTrailExportEndpoint(query: SystemAuditTrailExportQuery): string {
  // E23 Batch 3 (FAT-192, N-23): spec MEWAJIBKAN `limit` (default 10000).
  const qs = buildQueryString({
    actor: query.actor,
    category: query.category,
    entityId: query.entityId,
    entityType: query.entityType,
    action: query.action,
    from: query.from,
    to: query.to,
    format: query.format,
    limit: query.limit ?? 10000,
  });
  return `${ADMIN_ENDPOINTS.SYSTEM_AUDIT_TRAIL_EXPORT.buildPath()}${qs}`;
}

export function buildTelemetryHistoryEndpoint(query: TelemetryHistoryQuery): string {
  const qs = buildQueryString({
    from: query.from,
    to: query.to,
    is_buffered: query.is_buffered !== undefined ? String(query.is_buffered) : undefined,
    cursor: query.cursor,
    limit: query.limit,
    envelope: query.envelope ?? true,
  });
  return `${ADMIN_ENDPOINTS.TELEMETRY_HISTORY.buildPath(query.device_id)}${qs}`;
}

export function buildTelemetryRollupEndpoint(query: TelemetryRollupQuery): string {
  // E23 Batch 3 (FAT-195, N-26): spec live TIDAK mendaftarkan param
  // `envelope` (respons selalu {data,meta}) — dulu selalu dikirim true.
  const qs = buildQueryString({
    group_by: query.group_by,
    machine_id: query.machine_id,
    device_id: query.device_id,
    from: query.from,
    to: query.to,
    limit: query.limit,
    cursor: query.cursor,
  });
  return `${ADMIN_ENDPOINTS.TELEMETRY_ROLLUP.buildPath()}${qs}`;
}

export function buildTelemetryExportEndpoint(query: TelemetryExportQuery): string {
  // E23 Batch 3 (FAT-192, N-23): spec MEWAJIBKAN `limit` (default 5000).
  const qs = buildQueryString({
    from: query.from,
    to: query.to,
    format: query.format,
    limit: query.limit ?? 5000,
  });
  return `${ADMIN_ENDPOINTS.TELEMETRY_EXPORT.buildPath(query.device_id)}${qs}`;
}

export function buildTelemetryHourlyExportEndpoint(query: TelemetryExportQuery): string {
  // E23 Batch 3 (FAT-192, N-23): spec MEWAJIBKAN `limit` (default 10000).
  const qs = buildQueryString({
    from: query.from,
    to: query.to,
    format: query.format,
    limit: query.limit ?? 10000,
  });
  return `${ADMIN_ENDPOINTS.TELEMETRY_HOURLY_EXPORT.buildPath(query.device_id)}${qs}`;
}
