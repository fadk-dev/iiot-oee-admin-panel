import { DowntimeCategory } from './monitoring';

export type ExportFormat = 'csv' | 'ndjson' | 'json';

export type TimeWindowPreset = 'today' | '24h' | '7d' | '30d' | '90d' | 'custom';

export interface ExportMetadata {
  source: string;
  generatedAt: string;
  deviceId: string;
  timeWindow: string;
  contentDisposition?: string;
}

export interface ExportResult {
  filename: string;
  mimeType: string;
  format: ExportFormat;
  content: string;
  rowCount: number;
  metadata: ExportMetadata;
  endpoint: string;
}

export interface CursorPaginationMeta {
  limit: number;
  next_cursor: string | null;
  has_more: boolean;
  truncated?: boolean;
  total_count?: number;
  /**
   * P33.4 (FAT-294, B33.4): ringkasan state server untuk filter yang sama
   * (`GET /operational-events`) — dipakai jumlah tab Alarm & Event.
   * Tidak ada di endpoint lain (jangan dibaca sebagai total di sana).
   */
  counts?: { activeUnack: number; rtnUnack: number; acked: number };
  /**
   * P33.4 (FAT-294, B33.2): retensi arsip audit dalam hari
   * (`GET /system/audit-trail`) — ditampilkan halaman Audit Trail bila ada.
   */
  retention_days?: number;
}

export interface CursorPageResponse<T> {
  data: T[];
  pagination: CursorPaginationMeta;
}

export interface HistoricalTimeFilter {
  from?: string;
  to?: string;
  cursor?: string | null;
  limit?: number;
  envelope?: boolean;
}

export interface HistoryFilters {
  machineId?: string;
  deviceId?: string;
  woId?: string;
  // E20 P20.5 (FAT-157): status WO kanonis §C.1 — termasuk PENDING_CLOSE.
  status?: 'PENDING' | 'ACTIVE' | 'PENDING_CLOSE' | 'COMPLETED' | 'ABORTED';
  eventType?: string;
  category?: string;
  activeOnly?: boolean;
  unlabeledOnly?: boolean;
  isBuffered?: boolean;
  // E23 Batch 3 (FAT-195, N-26): groupBy rollup mencakup 'line'.
  groupBy?: 'machine' | 'line' | 'day' | 'month';
  bucket?: '1m' | '5m' | '15m' | '1h' | '1d';
  // E12 T12.1 (X-1 / FAT-54): filter shift — tanggal kalender shift
  // (YYYY-MM-DD, tanggal mulai shift) + ID shift (Shift.shiftId). Bila
  // keduanya terisi, from/to adalah jendela shift itu (resolveShiftWindow);
  // tanpa keduanya, from/to berlaku seperti sebelumnya (default 7 hari).
  shiftDate?: string;
  shiftId?: string;
  from: string; // ISO8601 dengan offset
  to: string;
  limit: number;
  cursor?: string;
  envelope: true;
}

export interface DowntimeHistoryQuery extends HistoricalTimeFilter {
  device_id: string;
  category?: DowntimeCategory | string;
  unlabeled_only?: boolean;
  active_only?: boolean;
}

export interface DowntimeExportQuery {
  device_id: string;
  from: string;
  to: string;
  category?: DowntimeCategory | string;
  unlabeled_only?: boolean;
  active_only?: boolean;
  format: ExportFormat;
  limit?: number;
}

/**
 * E20 P20.4 (FAT-156): `GET /operational-events` (global) hanya mendaftarkan
 * `from, to, event_type, acknowledged, limit, cursor, envelope` (API doc §I)
 * — tanpa `machine_id` (hanya `/system/audit`) dan tanpa `severity`
 * (tidak didukung; parameter tak dikenal diabaikan 200). D-12: hanya kirim
 * parameter terdaftar per endpoint.
 *
 * P33.4 (FAT-294, B33.1/B33.4): kontrak live menambahkan `category`
 * (`system|operational`) dan `alarmState` (`active-unack|rtn-unack|acked`)
 * — keduanya terdaftar di OpenAPI live 2026-11-23 dan dikirim panel.
 */
export interface OperationalEventsQuery extends HistoricalTimeFilter {
  device_id?: string; // undefined or 'ALL' => global /api/v1/operational-events
  event_type?: string;
  acknowledged?: boolean;
  category?: 'operational' | 'system';
  alarm_state?: 'active-unack' | 'rtn-unack' | 'acked';
}

/**
 * P33.4 (FAT-294, B33.2): `GET /system/audit-trail` — store audit
 * append-only (OpenAPI live 2026-11-23). Filter mengikuti daftar
 * halaman Audit Trail: `action` = nilai Event Type keluarga sistem,
 * `machine_id` = mesin. Tidak ada param `envelope` (respons selalu
 * `{data, meta, pagination}`).
 */
export interface SystemAuditTrailQuery extends HistoricalTimeFilter {
  actor?: string;
  category?: 'operational' | 'system';
  entityId?: string;
  entityType?: string;
  action?: string;
  machine_id?: string;
}

/**
 * P33.4 (FAT-294, B33.2): `GET /system/audit-trail/export` — filter sama
 * dengan daftar, KECUALI `machine_id` (tidak terdaftar di endpoint ekspor
 * live — filter mesin tidak diteruskan ke ekspor; lihat AuditTrailPage).
 */
export interface SystemAuditTrailExportQuery {
  actor?: string;
  category?: 'operational' | 'system';
  entityId?: string;
  entityType?: string;
  action?: string;
  from: string;
  to: string;
  format: ExportFormat;
  limit?: number;
}

/**
 * E20 P20.4 (FAT-156): `GET /operational-events/export` hanya mendaftarkan
 * `from, to, format, limit` (API doc §I) — tanpa `machine_id`/`event_type`
 * (D-12). Guard: policy `refresh:telemetry`, SUPERVISOR/ADMIN LAN (D-13).
 */
export interface OperationalEventsExportQuery {
  device_id?: string; // undefined or 'ALL' => global /api/v1/operational-events/export
  from: string;
  to: string;
  /**
   * E23 Batch 3 (FAT-201, N-34): spec live menerima `event_type` pada
   * ekspor op-events (global + per-device); komentar lama yang mengklaim
   * D-12/O8 'tanpa machine_id/event_type' keliru untuk event_type.
   * `machine_id` tetap TIDAK dikirim (B23: hanya /system/audit).
   */
  event_type?: string;
  format: ExportFormat;
  limit?: number;
}

export interface TelemetryHistoryQuery extends HistoricalTimeFilter {
  device_id: string;
  is_buffered?: boolean;
}

export interface TelemetryExportQuery {
  device_id: string;
  from: string;
  to: string;
  format: ExportFormat;
  limit?: number;
}

export interface WorkOrdersQuery extends HistoricalTimeFilter {
  // E23 Batch 2 (FAT-188, N-19): `wo_id` TIDAK terdaftar di spec
  // GET /work-orders — TIDAK dikirim ke server; filter diterapkan sisi
  // klien (http/workOrders.ts + demo/workOrders.ts).
  wo_id?: string;
  // E20 P20.5 (FAT-157): status WO kanonis §C.1 — termasuk PENDING_CLOSE.
  status?: 'PENDING' | 'ACTIVE' | 'PENDING_CLOSE' | 'COMPLETED' | 'ABORTED';
  machine_id?: string;
  product_id?: string;
  operator_id?: string;
}

export type SixBigLossGroup =
  | 'BREAKDOWNS'
  | 'SETUP_AND_ADJUSTMENTS'
  | 'SMALL_STOPS'
  | 'REDUCED_SPEED'
  | 'PROCESS_DEFECTS'
  | 'STARTUP_AND_PLANNED_LOSSES';

export interface SixBigLossInfo {
  group: SixBigLossGroup;
  label: string;
  oee_pillar: 'AVAILABILITY' | 'PERFORMANCE' | 'QUALITY' | 'PLANNED_EXCLUSION';
}

export type HistoricalApiErrorCode =
  | 'RETENTION_EXCEEDED'
  | 'INVALID_TIME_RANGE'
  | 'FORBIDDEN'
  | 'TOO_MANY_REQUESTS';

export class ReconciliationError extends Error {
  public readonly code: HistoricalApiErrorCode;
  public readonly status: number;
  public readonly retentionDays?: number;

  constructor(
    code: HistoricalApiErrorCode,
    message: string,
    status: number,
    retentionDays?: number
  ) {
    super(message);
    this.name = 'ReconciliationError';
    this.code = code;
    this.status = status;
    this.retentionDays = retentionDays;
  }
}

export type DowntimeSixBigLossMap = Record<DowntimeCategory, SixBigLossInfo>;
