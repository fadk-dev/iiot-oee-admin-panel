/**
 * Method demo — domain monitoring.
 *
 * Dipisah dari file god-file pada refactoring R9 (kontrak docs/DIRECTORY_STRUCTURE.md).
 * Satu file = satu domain. Barrel penggabung ada di file induknya.
 */
import { store } from './store';
import { checkAbort, assertCapability, throwValidationIssues } from './helpers';
import { ADMIN_ENDPOINTS } from '../endpoints';
import { LiveStateRecord, DowntimeEvent, DowntimeReasonResult, OperationalEvent, DowntimeCategory } from '../../../types/monitoring';
import { AuditLogItem } from '../../../types/system';
import { ApiError } from '../../../types/auth';
import { CursorPageResponse, DowntimeExportQuery, DowntimeHistoryQuery, ExportResult, OperationalEventsExportQuery, OperationalEventsQuery, SystemAuditTrailExportQuery, SystemAuditTrailQuery } from '../../../types/historical';
import { RETENTION_POLICY_DAYS, assertRetentionWindow, buildDowntimeExportEndpoint, buildDowntimeHistoryEndpoint, buildOperationalEventsEndpoint, buildOperationalEventsExportEndpoint, buildSystemAuditTrailEndpoint, buildSystemAuditTrailExportEndpoint, formatAuditTrailExportRows, formatDowntimeExportRows, formatOperationalEventExportRows, paginateWithCursor, parseExportMetadataHeaders, serializeExportRecords } from '../../../utils/historicalExport';
import { normalizeFsmState } from '../../../utils/oeeCalculations';

export const demoMonitoring = {
  // =========================================================================
  // MONITORING: LIVE STATE, DOWNTIME, OPERATIONAL EVENTS
  // =========================================================================
  async getLiveState(signal?: AbortSignal): Promise<LiveStateRecord[]> {
    checkAbort(signal);
    store.recordEndpoint('LIVE_STATE', ADMIN_ENDPOINTS.LIVE_STATE.buildPath());
    return store.liveStates.map((s) => ({
      ...s,
      fsm_state: normalizeFsmState(s.fsm_state),
    }));
  },

  async getLiveStateByDevice(deviceId: string, signal?: AbortSignal): Promise<LiveStateRecord> {
    checkAbort(signal);
    store.recordEndpoint('LIVE_STATE_BY_DEVICE', ADMIN_ENDPOINTS.LIVE_STATE_BY_DEVICE.buildPath(deviceId));
    const rec = store.liveStates.find((s) => s.device_id === deviceId);
    if (!rec) {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: `Live state untuk perangkat "${deviceId}" tidak ditemukan.`,
        httpStatus: 404,
      });
    }
    return { ...rec, fsm_state: normalizeFsmState(rec.fsm_state) };
  },

  async getActiveDowntimes(signal?: AbortSignal): Promise<DowntimeEvent[]> {
    checkAbort(signal);
    store.recordEndpoint('DOWNTIME_ACTIVE', ADMIN_ENDPOINTS.DOWNTIME_ACTIVE.buildPath());
    return store.downtimes.filter((d) => d.ended_at === null).map((d) => ({ ...d }));
  },

  async getDowntimeHistory(deviceId: string, signal?: AbortSignal): Promise<DowntimeEvent[]> {
    checkAbort(signal);
    if (!deviceId) {
      throwValidationIssues('device_id wajib dipilih untuk histori downtime.', { device_id: 'Wajib dipilih.' });
    }
    store.recordEndpoint('DOWNTIME_BY_DEVICE', ADMIN_ENDPOINTS.DOWNTIME_BY_DEVICE.buildPath(deviceId));
    return store.downtimes.filter((d) => d.device_id === deviceId).map((d) => ({ ...d }));
  },

  async getDowntimeHistoryPage(
    query: DowntimeHistoryQuery,
    signal?: AbortSignal
  ): Promise<CursorPageResponse<DowntimeEvent>> {
    checkAbort(signal);
    if (!query.device_id) {
      throwValidationIssues('device_id wajib dipilih untuk histori downtime.', { device_id: 'Wajib dipilih.' });
    }
    const endpoint = buildDowntimeHistoryEndpoint(query);
    store.recordEndpoint('DOWNTIME_BY_DEVICE', endpoint);

    let items = store.downtimes.filter((d) => d.device_id === query.device_id);
    if (query.category) {
      items = items.filter((d) => d.category === query.category);
    }
    if (query.active_only) {
      items = items.filter((d) => d.ended_at === null);
    }
    if (query.unlabeled_only) {
      // E20 P20.5 (FAT-157): `unlabeled_only` = operatorReason IS NULL
      // (§J.2) — BUKAN heuristik string 'unclassified'/'unplanned'.
      // Di demo, `reason` adalah operatorReason.
      items = items.filter((d) => !d.reason);
    }
    if (query.from) {
      const fromMs = new Date(query.from).getTime();
      if (!Number.isNaN(fromMs)) items = items.filter((d) => new Date(d.started_at).getTime() >= fromMs);
    }
    if (query.to) {
      const toMs = new Date(query.to).getTime();
      if (!Number.isNaN(toMs)) items = items.filter((d) => new Date(d.started_at).getTime() <= toMs);
    }

    return paginateWithCursor(items, (d) => d.started_at, {
      cursor: query.cursor,
      limit: query.limit ?? 50,
      maxLimit: 100,
    });
  },

  async exportDowntimeData(query: DowntimeExportQuery, signal?: AbortSignal): Promise<ExportResult> {
    checkAbort(signal);
    const endpoint = buildDowntimeExportEndpoint(query);
    assertCapability('telemetry.refresh', ['ADMIN', 'SUPERVISOR'], {
      requireLan: false,
      resourceId: query.device_id,
    });
    store.assertExportRateLimit('DOWNTIME_DEVICE_EXPORT');
    store.recordEndpoint('DOWNTIME_DEVICE_EXPORT', endpoint);

    assertRetentionWindow(query.from, query.to, new Date(), RETENTION_POLICY_DAYS);

    const fromMs = new Date(query.from).getTime();
    const toMs = new Date(query.to).getTime();
    const filtered = store.downtimes
      .filter((d) => {
        if (d.device_id !== query.device_id) return false;
        if (query.category && query.category !== 'ALL' && d.category !== query.category) return false;
        if (query.unlabeled_only && d.is_labeled) return false;
        if (query.active_only && d.ended_at !== null) return false;
        const ts = new Date(d.started_at).getTime();
        return ts >= fromMs && ts <= toMs;
      })
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    const rows = formatDowntimeExportRows(filtered);
    const { content, mimeType, extension } = serializeExportRecords(rows, query.format);
    const generatedAt = new Date().toISOString();
    const metadata = parseExportMetadataHeaders({
      'X-Export-Source': 'timescaledb:downtime_events',
      'X-Export-Generated-At': generatedAt,
      'X-Export-Device-Id': query.device_id,
      'X-Export-Time-Window': `${query.from}..${query.to}`,
    });

    return {
      filename: `downtime_${query.device_id}_${generatedAt.slice(0, 10)}.${extension}`,
      mimeType,
      format: query.format,
      content,
      rowCount: rows.length,
      metadata,
      endpoint,
    };
  },

  async classifyDowntimeReason(
    id: string,
    category: DowntimeCategory,
    reason: string,
    notes?: string
  ): Promise<DowntimeReasonResult> {
    assertCapability('downtime_event.label', ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE'], {
      resourceId: id,
    });
    const cleanReason = reason.trim();
    if (cleanReason.length < 3 || cleanReason.length > 255) {
      throwValidationIssues('Alasan downtime wajib 3–255 karakter.', {
        reason: 'Alasan wajib 3–255 karakter.',
      });
    }
    if (notes && notes.length > 500) {
      throwValidationIssues('Catatan tambahan maksimal 500 karakter.', {
        notes: 'Catatan maksimal 500 karakter.',
      });
    }

    store.recordEndpoint('DOWNTIME_REASON', ADMIN_ENDPOINTS.DOWNTIME_REASON.buildPath(id));
    const dt = store.downtimes.find((d) => d.id === id);
    if (!dt) {
      throw new ApiError({ code: 'NOT_FOUND', message: 'Insiden downtime tidak ditemukan.', httpStatus: 404 });
    }

    dt.is_overwrite = dt.is_labeled;
    dt.category = category;
    dt.reason = cleanReason;
    dt.notes = notes?.trim() || undefined;
    dt.is_labeled = true;
    dt.acknowledged_by = store.currentUserName;
    store.addAudit('CLASSIFY_DOWNTIME', 'DEVICE', dt.device_id ?? id, `Classified downtime ${id} as ${category}`, {
      device_id: dt.device_id,
      machine_id: dt.machine_id,
      machine_name: dt.machine_name,
    });
    // E20 P20.5 (FAT-157): respons kanonis §J.3 —
    // `{success, eventId, deviceId, operatorReason, isOverwrite, operator}`
    // — BUKAN `DowntimeEvent` penuh.
    // E23 Batch 3 (FAT-194, N-25): `operator` berupa objek {id, username}.
    return {
      success: true,
      eventId: id,
      deviceId: dt.device_id ?? null,
      operatorReason: cleanReason,
      isOverwrite: dt.is_overwrite,
      operator: store.currentUserName
        ? { id: store.currentUserId, username: store.currentUserName }
        : null,
    };
  },

  // Operational Events (Global + Per-Device)
  async getOperationalEventsByDevice(
    deviceId: string,
    query: Omit<OperationalEventsQuery, 'device_id'> = {},
    signal?: AbortSignal
  ): Promise<OperationalEvent[]> {
    checkAbort(signal);
    const endpoint = buildOperationalEventsEndpoint({ ...query, device_id: deviceId });
    store.recordEndpoint('OPERATIONAL_EVENTS_BY_DEVICE', endpoint);
    return store.operationalEvents.filter((e) => e.device_id === deviceId).map((e) => ({ ...e }));
  },

  async getOperationalEvents(
    query: OperationalEventsQuery = {},
    signal?: AbortSignal
  ): Promise<OperationalEvent[]> {
    const page = await demoMonitoring.getOperationalEventsPage({ ...query, limit: 200 }, signal);
    return page.data;
  },

  async getOperationalEventsPage(
    query: OperationalEventsQuery = {},
    signal?: AbortSignal
  ): Promise<CursorPageResponse<OperationalEvent>> {
    checkAbort(signal);
    const isGlobal = !query.device_id || query.device_id === 'ALL';
    const endpoint = buildOperationalEventsEndpoint(query);
    store.recordEndpoint(
      isGlobal ? 'OPERATIONAL_EVENTS_LIST' : 'OPERATIONAL_EVENTS_BY_DEVICE',
      endpoint
    );

    let items = [...store.operationalEvents];
    if (!isGlobal) {
      items = items.filter((e) => e.device_id === query.device_id);
    }
    // E20 P20.4 (FAT-156, D-12): filter lokal demo hanya untuk parameter
    // terdaftar `GET /operational-events` — tanpa `machine_id` (hanya
    // /system/audit) dan tanpa `severity` (tidak didukung).
    // P33.4 (FAT-294, B33.1/B33.4): + `category` + `alarmState` (terdaftar
    // di kontrak live 2026-11-23).
    if (query.category) {
      items = items.filter((e) => e.category === query.category);
    }
    if (query.alarm_state) {
      items = items.filter((e) => e.alarm_state === query.alarm_state);
    }
    if (query.event_type && query.event_type !== 'ALL') {
      items = items.filter((e) => e.event_type === query.event_type);
    }
    if (query.acknowledged !== undefined) {
      items = items.filter((e) => e.acknowledged === query.acknowledged);
    }
    if (query.from) {
      const fromMs = new Date(query.from).getTime();
      if (!Number.isNaN(fromMs)) items = items.filter((e) => new Date(e.recorded_at).getTime() >= fromMs);
    }
    if (query.to) {
      const toMs = new Date(query.to).getTime();
      if (!Number.isNaN(toMs)) items = items.filter((e) => new Date(e.recorded_at).getTime() <= toMs);
    }

    const page = paginateWithCursor(items, (e) => e.recorded_at, {
      cursor: query.cursor,
      limit: query.limit ?? 50,
      maxLimit: 200,
    });
    // P33.4 (FAT-294, B33.4): demo meniru kontrak server — `totalCount` =
    // total baris yang cocok dengan filter (bukan panjang halaman) +
    // `counts` per state (dipakai jumlah tab Alarm & Event).
    return {
      ...page,
      pagination: {
        ...page.pagination,
        total_count: items.length,
        counts: {
          activeUnack: items.filter((e) => e.alarm_state === 'active-unack').length,
          rtnUnack: items.filter((e) => e.alarm_state === 'rtn-unack').length,
          acked: items.filter((e) => e.alarm_state === 'acked').length,
        },
      },
    };
  },

  async exportOperationalEventsData(
    query: OperationalEventsExportQuery,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    checkAbort(signal);
    const isGlobal = !query.device_id || query.device_id === 'ALL';
    const endpoint = buildOperationalEventsExportEndpoint(query);
    assertCapability('telemetry.refresh', ['ADMIN', 'SUPERVISOR'], {
      requireLan: false,
      resourceId: query.device_id,
    });
    store.assertExportRateLimit(
      isGlobal ? 'OPERATIONAL_EVENTS_EXPORT' : 'OPERATIONAL_EVENTS_DEVICE_EXPORT'
    );
    store.recordEndpoint(
      isGlobal ? 'OPERATIONAL_EVENTS_EXPORT' : 'OPERATIONAL_EVENTS_DEVICE_EXPORT',
      endpoint
    );

    assertRetentionWindow(query.from, query.to, new Date(), RETENTION_POLICY_DAYS);

    const fromMs = new Date(query.from).getTime();
    const toMs = new Date(query.to).getTime();
    const filtered = store.operationalEvents
      .filter((e) => {
        if (!isGlobal && e.device_id !== query.device_id) return false;
        // E23 Batch 3 (FAT-201, N-34): filter event_type sisi klien
        // (paritas builder HTTP yang kini mengirimkannya ke server).
        if (query.event_type && e.event_type !== query.event_type) return false;
        const ts = new Date(e.recorded_at).getTime();
        return ts >= fromMs && ts <= toMs;
      })
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

    const rows = formatOperationalEventExportRows(filtered);
    const { content, mimeType, extension } = serializeExportRecords(rows, query.format);
    const generatedAt = new Date().toISOString();
    const deviceLabel = isGlobal ? 'ALL' : query.device_id!;
    const metadata = parseExportMetadataHeaders({
      'X-Export-Source': isGlobal
        ? 'timescaledb:operational_events_global'
        : 'timescaledb:operational_events_device',
      'X-Export-Generated-At': generatedAt,
      'X-Export-Device-Id': deviceLabel,
      'X-Export-Time-Window': `${query.from}..${query.to}`,
    });

    return {
      filename: `operational_events_${isGlobal ? 'global' : deviceLabel}_${generatedAt.slice(0, 10)}.${extension}`,
      mimeType,
      format: query.format,
      content,
      rowCount: rows.length,
      metadata,
      endpoint,
    };
  },

  async acknowledgeOperationalEvent(id: string, note?: string): Promise<OperationalEvent> {
    assertCapability('operational_event.ack', ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE'], {
      resourceId: id,
    });
    if (note && note.length > 1000) {
      throwValidationIssues('Catatan ack maksimal 1000 karakter.', { note: 'Maksimal 1000 karakter.' });
    }

    store.recordEndpoint('OPERATIONAL_EVENTS_ACK', ADMIN_ENDPOINTS.OPERATIONAL_EVENTS_ACK.buildPath(id));
    const ev = store.operationalEvents.find((e) => e.id === id);
    if (!ev) {
      throw new ApiError({ code: 'NOT_FOUND', message: 'Operational event tidak ditemukan.', httpStatus: 404 });
    }

    // Idempotent acknowledgment (preserves original timestamp if already acknowledged unless note updated)
    if (!ev.acknowledged) {
      ev.acknowledged = true;
      ev.acknowledged_by = store.currentUserName;
      ev.acknowledged_at = new Date().toISOString();
      // P33.4 (FAT-294): state alarm ikut berubah — badge membaca
      // `alarm_state` server (di demo: field ini), bukan derivasi.
      ev.alarm_state = 'acked';
    }
    if (note?.trim()) {
      ev.ack_note = note.trim();
    }
    store.addAudit(
      'ACK_EVENT',
      'DEVICE',
      ev.device_id ?? id,
      `Acknowledged event ${id}${ev.ack_note ? ` — Note: ${ev.ack_note}` : ''}`,
      { device_id: ev.device_id, machine_id: ev.machine_id, machine_name: ev.machine_name }
    );
    return { ...ev };
  },

  // =========================================================================
  // SYSTEM AUDIT TRAIL (ADMIN + LAN only -> /api/v1/system/audit-trail)
  // =========================================================================
  /**
   * P33.4 (FAT-294, B33.2): arsip audit demo membaca store TERPISAH
   * (`store.auditTrail`) — cermin `GET /system/audit-trail`. Menggantikan
   * `getSystemAuditPage` (`/system/audit`, alias feed operasional) — alias
   * lama TIDAK dipakai lagi (satu alur kanonik). Filter `machine_id`
   * dicocokkan ke record yang entitasnya mesin itu (demo tidak menyimpan
   * `machine_id` per record arsip).
   */
  async getSystemAuditTrailPage(
    query: SystemAuditTrailQuery = {},
    signal?: AbortSignal
  ): Promise<CursorPageResponse<AuditLogItem>> {
    checkAbort(signal);
    assertCapability('access_control.read', ['ADMIN']);
    const endpoint = buildSystemAuditTrailEndpoint(query);
    store.recordEndpoint('SYSTEM_AUDIT_TRAIL', endpoint);

    let items = [...store.auditTrail];
    if (query.actor) {
      items = items.filter((a) => a.actor === query.actor);
    }
    if (query.category) {
      items = items.filter((a) => a.category === query.category);
    }
    if (query.entityId) {
      items = items.filter((a) => a.entity_id === query.entityId);
    }
    if (query.entityType) {
      items = items.filter((a) => a.entity_type === query.entityType);
    }
    if (query.action && query.action !== 'ALL') {
      items = items.filter((a) => a.action === query.action);
    }
    if (query.machine_id && query.machine_id !== 'ALL') {
      items = items.filter((a) => a.entity_type === 'machine' && a.entity_id === query.machine_id);
    }
    if (query.from) {
      const fromMs = new Date(query.from).getTime();
      if (!Number.isNaN(fromMs)) items = items.filter((a) => new Date(a.recorded_at).getTime() >= fromMs);
    }
    if (query.to) {
      const toMs = new Date(query.to).getTime();
      if (!Number.isNaN(toMs)) items = items.filter((a) => new Date(a.recorded_at).getTime() <= toMs);
    }
    const page = paginateWithCursor(items, (a) => a.recorded_at, {
      cursor: query.cursor,
      limit: query.limit ?? 50,
      maxLimit: 200,
    });
    // P33.4 (FAT-294, B33.2): `totalCount` demo = total baris yang cocok
    // (cermin kontrak server) + retensi arsip demo.
    return {
      ...page,
      pagination: { ...page.pagination, total_count: items.length, retention_days: RETENTION_POLICY_DAYS },
    };
  },

  async getAuditLogs(signal?: AbortSignal): Promise<AuditLogItem[]> {
    const page = await demoMonitoring.getSystemAuditTrailPage({ limit: 200 }, signal);
    return page.data;
  },

  /**
   * P33.4 (FAT-294, B33.2): `GET /system/audit-trail/export` — csv/ndjson/
   * json (default csv), limit 1..100000 default 10000, retensi 90 hari →
   * 400 RETENTION_EXCEEDED, rate limit 5/min, guard `access_control.read`.
   * Filter sama dengan daftar KECUALI `machine_id` (tidak terdaftar di
   * endpoint ekspor live).
   */
  async exportSystemAuditTrailData(
    query: SystemAuditTrailExportQuery,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    checkAbort(signal);
    const endpoint = buildSystemAuditTrailExportEndpoint(query);
    assertCapability('access_control.read', ['ADMIN']);
    store.assertExportRateLimit('SYSTEM_AUDIT_TRAIL_EXPORT');
    store.recordEndpoint('SYSTEM_AUDIT_TRAIL_EXPORT', endpoint);

    assertRetentionWindow(query.from, query.to, new Date(), RETENTION_POLICY_DAYS);

    const fromMs = new Date(query.from).getTime();
    const toMs = new Date(query.to).getTime();
    const filtered = store.auditTrail
      .filter((a) => {
        if (query.actor && a.actor !== query.actor) return false;
        if (query.category && a.category !== query.category) return false;
        if (query.entityId && a.entity_id !== query.entityId) return false;
        if (query.entityType && a.entity_type !== query.entityType) return false;
        if (query.action && query.action !== 'ALL' && a.action !== query.action) return false;
        const ts = new Date(a.recorded_at).getTime();
        return ts >= fromMs && ts <= toMs;
      })
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

    const rows = formatAuditTrailExportRows(filtered);
    const { content, mimeType, extension } = serializeExportRecords(rows, query.format);
    const generatedAt = new Date().toISOString();
    const metadata = parseExportMetadataHeaders({
      'X-Export-Source': 'system_audit_trail',
      'X-Export-Generated-At': generatedAt,
      'X-Export-Time-Window': `${query.from}..${query.to}`,
    });

    return {
      filename: `system_audit_trail_${generatedAt.slice(0, 10)}.${extension}`,
      mimeType,
      format: query.format,
      content,
      rowCount: rows.length,
      metadata,
      endpoint,
    };
  }
};
