import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, store } from '../services/api/client';
import { ADMIN_ENDPOINTS } from '../services/api/endpoints';
import { ReconciliationError } from '../types/historical';
import {
  RETENTION_POLICY_DAYS,
  buildDowntimeExportEndpoint,
  buildDowntimeHistoryEndpoint,
  buildOperationalEventsEndpoint,
  buildOperationalEventsExportEndpoint,
  buildSystemAuditTrailEndpoint,
  buildSystemAuditTrailExportEndpoint,
  buildTelemetryExportEndpoint,
  buildTelemetryHistoryEndpoint,
  buildTelemetryHourlyExportEndpoint,
  buildTelemetryRollupEndpoint,
  canExportHistoricalData,
  detectTimeWindowPreset,
  formatIsoWithOffset,
  isTodayWindow,
  mapDowntimeToSixBigLoss,
  paginateWithCursor,
  parseExportMetadataHeaders,
  resolveTimeWindowPreset,
  serializeExportRecords,
  validateRetentionWindow,
} from './historicalExport';

test('Retention policy: validateRetentionWindow rejects >90 days with RETENTION_EXCEEDED 400', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  const within90d = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString();
  const beyond90d = new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  const ok = validateRetentionWindow(within90d, to, now, RETENTION_POLICY_DAYS);
  assert.equal(ok.valid, true);

  const exceeded = validateRetentionWindow(beyond90d, to, now, RETENTION_POLICY_DAYS);
  assert.equal(exceeded.valid, false);
  assert.equal(exceeded.code, 'RETENTION_EXCEEDED');
  assert.equal(exceeded.status, 400);
  assert.match(exceeded.message ?? '', /RETENTION_EXCEEDED/);

  const reversed = validateRetentionWindow(to, within90d, now, RETENTION_POLICY_DAYS);
  assert.equal(reversed.valid, false);
  assert.equal(reversed.code, 'INVALID_TIME_RANGE');
});

test('Export authorization grants ADMIN/SUPERVISOR and denies OPERATOR/MAINTENANCE with 403', () => {
  assert.equal(canExportHistoricalData('ADMIN').allowed, true);
  assert.equal(canExportHistoricalData('SUPERVISOR').allowed, true);

  const opRes = canExportHistoricalData('OPERATOR');
  assert.equal(opRes.allowed, false);
  assert.equal(opRes.status, 403);

  const maintRes = canExportHistoricalData('MAINTENANCE');
  assert.equal(maintRes.allowed, false);
  assert.equal(maintRes.status, 403);
});

test('paginateWithCursor orders descending and iterates opaque Base64URL cursors without overlap', () => {
  const items = Array.from({ length: 12 }, (_, idx) => ({
    id: `ev-${String(idx + 1).padStart(2, '0')}`,
    ts: new Date(Date.UTC(2026, 10, 1 + idx, 10, 0, 0)).toISOString(),
  }));

  const page1 = paginateWithCursor(items, (x) => x.ts, { limit: 5 });
  assert.equal(page1.data.length, 5);
  assert.equal(page1.data[0].id, 'ev-12');
  assert.equal(page1.data[4].id, 'ev-08');
  assert.equal(page1.pagination.has_more, true);
  assert.ok(page1.pagination.next_cursor);

  const page2 = paginateWithCursor(items, (x) => x.ts, {
    limit: 5,
    cursor: page1.pagination.next_cursor,
  });
  assert.equal(page2.data.length, 5);
  assert.equal(page2.data[0].id, 'ev-07');
  assert.equal(page2.data[4].id, 'ev-03');
  assert.equal(page2.pagination.has_more, true);

  const page3 = paginateWithCursor(items, (x) => x.ts, {
    limit: 5,
    cursor: page2.pagination.next_cursor,
  });
  assert.equal(page3.data.length, 2);
  assert.equal(page3.data[0].id, 'ev-02');
  assert.equal(page3.data[1].id, 'ev-01');
  assert.equal(page3.pagination.has_more, false);
  assert.equal(page3.pagination.next_cursor, null);
});

test('mapDowntimeToSixBigLoss maps canonical categories to Six Big Losses & OEE pillars', () => {
  assert.equal(mapDowntimeToSixBigLoss('EQUIPMENT_FAILURE').group, 'BREAKDOWNS');
  assert.equal(mapDowntimeToSixBigLoss('SETUP_AND_ADJUSTMENT').oee_pillar, 'AVAILABILITY');
  assert.equal(mapDowntimeToSixBigLoss('IDLING_AND_MINOR_STOPPAGE').group, 'SMALL_STOPS');
  assert.equal(mapDowntimeToSixBigLoss('REDUCED_SPEED').oee_pillar, 'PERFORMANCE');
  assert.equal(mapDowntimeToSixBigLoss('PROCESS_DEFECT').oee_pillar, 'QUALITY');
  assert.equal(mapDowntimeToSixBigLoss('PLANNED_MAINTENANCE').oee_pillar, 'PLANNED_EXCLUSION');
});

test('Endpoint builders match authoritative backend routes & parse X-Export-* metadata headers', () => {
  const dtHist = buildDowntimeHistoryEndpoint({
    device_id: 'STM32-OEE-01',
    unlabeled_only: true,
    limit: 10,
  });
  assert.match(dtHist, /^\/api\/v1\/downtime-events\/STM32-OEE-01\?/);
  assert.match(dtHist, /unlabeled_only=true/);

  const dtExp = buildDowntimeExportEndpoint({
    device_id: 'STM32-OEE-01',
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-12T00:00:00Z',
    format: 'csv',
  });
  assert.match(dtExp, /^\/api\/v1\/downtime-events\/STM32-OEE-01\/export\?/);

  // E20 P20.4 (FAT-156, O4/O13/R9, D-12): tanpa trailing slash; `acknowledged`
  // dikirim; `machine_id` TIDAK dikirim ke endpoint global (hanya /system/audit).
  const opGlobal = buildOperationalEventsEndpoint({ device_id: 'ALL', acknowledged: false });
  assert.match(opGlobal, /^\/api\/v1\/operational-events\?/);
  assert.match(opGlobal, /acknowledged=false/);
  assert.doesNotMatch(opGlobal, /machine_id/);
  assert.doesNotMatch(opGlobal, /severity/);

  const opPerDevice = buildOperationalEventsEndpoint({ device_id: 'STM32-OEE-02', event_type: 'DEVICE_OFFLINE', acknowledged: true });
  assert.match(opPerDevice, /^\/api\/v1\/operational-events\/STM32-OEE-02\?/);
  assert.match(opPerDevice, /acknowledged=true/);

  // P33.4 (FAT-294, B33.1/B33.4): `category` + `alarmState` dikirim.
  const opCategory = buildOperationalEventsEndpoint({ device_id: 'ALL', category: 'operational', alarm_state: 'rtn-unack' });
  assert.match(opCategory, /category=operational/);
  assert.match(opCategory, /alarmState=rtn-unack/);

  // P33.4 (FAT-294, B33.2): builder audit-trail — path + filter `action`.
  const auditTrail = buildSystemAuditTrailEndpoint({
    action: 'OPERATOR_PROVISIONED',
    machine_id: 'CNC-MILLING-01',
    limit: 50,
  });
  assert.match(auditTrail, /^\/api\/v1\/system\/audit-trail\?/);
  assert.match(auditTrail, /action=OPERATOR_PROVISIONED/);
  assert.match(auditTrail, /machine_id=CNC-MILLING-01/);
  assert.doesNotMatch(auditTrail, /envelope/);

  const opGlobalExp = buildOperationalEventsExportEndpoint({
    device_id: 'ALL',
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-12T00:00:00Z',
    format: 'csv',
  });
  assert.match(opGlobalExp, /^\/api\/v1\/operational-events\/export\?/);
  // E20 P20.4 (FAT-156, D-12): ekspor global hanya from/to/format/limit.
  assert.doesNotMatch(opGlobalExp, /machine_id/);
  assert.doesNotMatch(opGlobalExp, /event_type/);

  // P33.4 (FAT-294, B33.2): ekspor audit-trail memakai filter daftar
  // (action, bukan event_type; tanpa machine_id — tidak terdaftar).
  const auditExp = buildSystemAuditTrailExportEndpoint({
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-12T00:00:00Z',
    action: 'OPERATOR_PROVISIONED',
    format: 'ndjson',
    limit: 100,
  });
  assert.match(auditExp, /^\/api\/v1\/system\/audit-trail\/export\?/);
  assert.match(auditExp, /action=OPERATOR_PROVISIONED/);
  assert.doesNotMatch(auditExp, /machine_id/);
  assert.match(auditExp, /format=ndjson/);

  const opDevExp = buildOperationalEventsExportEndpoint({
    device_id: 'STM32-OEE-03',
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-12T00:00:00Z',
    format: 'ndjson',
  });
  assert.match(opDevExp, /^\/api\/v1\/operational-events\/STM32-OEE-03\/export\?/);

  const telHist = buildTelemetryHistoryEndpoint({ device_id: 'STM32-OEE-01', limit: 10 });
  assert.match(telHist, /^\/api\/v1\/telemetry\/STM32-OEE-01\?/);

  const telExp = buildTelemetryExportEndpoint({
    device_id: 'STM32-OEE-01',
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-12T00:00:00Z',
    format: 'json',
  });
  assert.match(telExp, /^\/api\/v1\/telemetry\/STM32-OEE-01\/export\?/);

  const telHourlyExp = buildTelemetryHourlyExportEndpoint({
    device_id: 'STM32-OEE-01',
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-12T00:00:00Z',
    format: 'csv',
  });
  assert.match(telHourlyExp, /^\/api\/v1\/telemetry\/STM32-OEE-01\/hourly\/export\?/);

  const meta = parseExportMetadataHeaders({
    'X-Export-Source': 'timescaledb:downtime_events',
    'X-Export-Generated-At': '2026-11-12T10:00:00Z',
    'X-Export-Device-Id': 'STM32-OEE-03',
    'X-Export-Time-Window': '2026-11-01T00:00:00Z..2026-11-12T00:00:00Z',
  });
  assert.equal(meta.source, 'timescaledb:downtime_events');
  assert.equal(meta.deviceId, 'STM32-OEE-03');
});

test('E12 T12.8 (F-9): telemetry endpoint builders delegate path to ADMIN_ENDPOINTS registry', () => {
  // URL lengkap (path + query string) harus IDENTIK dengan sebelum delegasi:
  // builder hanya menempel query string di atas ADMIN_ENDPOINTS.*.buildPath().
  const from = '2026-11-01T00:00:00Z';
  const to = '2026-11-12T00:00:00Z';

  const hist = buildTelemetryHistoryEndpoint({
    device_id: 'STM32-OEE-01',
    from,
    to,
    is_buffered: false,
    cursor: 'abc',
    limit: 10,
  });
  assert.equal(
    hist,
    '/api/v1/telemetry/STM32-OEE-01?from=2026-11-01T00%3A00%3A00Z&to=2026-11-12T00%3A00%3A00Z&is_buffered=false&cursor=abc&limit=10&envelope=true'
  );
  assert.equal(hist.split('?')[0], ADMIN_ENDPOINTS.TELEMETRY_HISTORY.buildPath('STM32-OEE-01'));

  const rollup = buildTelemetryRollupEndpoint({
    group_by: 'machine',
    machine_id: 'M1',
    device_id: 'STM32-OEE-01',
    from,
    to,
    limit: 20,
    cursor: 'c1',
  });
  assert.equal(
    rollup,
    '/api/v1/telemetry/rollup?group_by=machine&machine_id=M1&device_id=STM32-OEE-01&from=2026-11-01T00%3A00%3A00Z&to=2026-11-12T00%3A00%3A00Z&limit=20&cursor=c1'
  );
  assert.equal(rollup.split('?')[0], ADMIN_ENDPOINTS.TELEMETRY_ROLLUP.buildPath());

  const exp = buildTelemetryExportEndpoint({ device_id: 'STM32-OEE-01', from, to, format: 'csv', limit: 100 });
  assert.equal(
    exp,
    '/api/v1/telemetry/STM32-OEE-01/export?from=2026-11-01T00%3A00%3A00Z&to=2026-11-12T00%3A00%3A00Z&format=csv&limit=100'
  );
  assert.equal(exp.split('?')[0], ADMIN_ENDPOINTS.TELEMETRY_EXPORT.buildPath('STM32-OEE-01'));

  const hourlyExp = buildTelemetryHourlyExportEndpoint({
    device_id: 'STM32-OEE-01',
    from,
    to,
    format: 'json',
    limit: 50,
  });
  assert.equal(
    hourlyExp,
    '/api/v1/telemetry/STM32-OEE-01/hourly/export?from=2026-11-01T00%3A00%3A00Z&to=2026-11-12T00%3A00%3A00Z&format=json&limit=50'
  );
  assert.equal(hourlyExp.split('?')[0], ADMIN_ENDPOINTS.TELEMETRY_HOURLY_EXPORT.buildPath('STM32-OEE-01'));

  // Encoding device_id mengikuti registry (enc = encodeURIComponent) — sama
  // seperti builder lama, bukan perilaku baru.
  const encoded = buildTelemetryHistoryEndpoint({ device_id: 'STM32 OEE/01', limit: 5 });
  assert.equal(encoded, '/api/v1/telemetry/STM32%20OEE%2F01?limit=5&envelope=true');
  assert.equal(encoded.split('?')[0], ADMIN_ENDPOINTS.TELEMETRY_HISTORY.buildPath('STM32 OEE/01'));
});

test('E12 T12.8 (F-9): getTelemetryHistory (non-page) removed; getTelemetryHistoryPage remains', async () => {
  const clientSurface = apiClient as unknown as Record<string, unknown>;
  assert.equal('getTelemetryHistory' in clientSurface, false);
  assert.equal(typeof clientSurface.getTelemetryHistoryPage, 'function');

  const page = await apiClient.getTelemetryHistoryPage({ device_id: 'STM32-OEE-01', limit: 5 });
  assert.ok(Array.isArray(page.data));
  assert.ok(page.data.length > 0);
  assert.ok(page.data.length <= 5);
});

test('serializeExportRecords escapes CSV commas/quotes and outputs valid NDJSON and JSON', () => {
  const sample = [
    { id: '1', note: 'Drop, "140 bar"', value: 42 },
    { id: '2', note: 'Normal', value: 10 },
  ];

  const csv = serializeExportRecords(sample, 'csv');
  assert.match(csv.content, /"Drop, ""140 bar"""/);

  const ndjson = serializeExportRecords(sample, 'ndjson');
  const lines = ndjson.content.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).id, '1');

  const json = serializeExportRecords(sample, 'json');
  assert.equal(JSON.parse(json.content).length, 2);
});

test('apiClient export contracts enforce 90-day retention, RBAC 403, and read-only tunnel compatibility', async () => {
  const now = new Date();
  const validFrom = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const expiredFrom = new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  // 1. OPERATOR is rejected with 403 Forbidden
  apiClient.setUserRole('OPERATOR');
  apiClient.setNetworkMode('LAN');
  await assert.rejects(
    async () => {
      await apiClient.exportDowntimeData({ device_id: 'STM32-OEE-01', from: validFrom, to, format: 'csv' });
    },
    (err: unknown) =>
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string; httpStatus?: number; status?: number }).code === 'FORBIDDEN' &&
      ((err as { httpStatus?: number; status?: number }).httpStatus === 403 ||
        (err as { httpStatus?: number; status?: number }).status === 403)
  );

  // 2. ADMIN over REMOTE_TUNNEL succeeds for read-only export & includes X-Export-* metadata
  apiClient.setUserRole('ADMIN');
  apiClient.setNetworkMode('REMOTE_TUNNEL');
  const dtExport = await apiClient.exportDowntimeData({
    device_id: 'STM32-OEE-01',
    from: validFrom,
    to,
    format: 'json',
  });
  assert.equal(dtExport.metadata.source, 'timescaledb:downtime_events');
  assert.equal(dtExport.metadata.deviceId, 'STM32-OEE-01');
  assert.ok(dtExport.rowCount > 0);
  const parsedDt = JSON.parse(dtExport.content);
  assert.ok(parsedDt[0].six_big_loss_group, 'Exported downtime rows must include Six Big Losses');

  // 3. >90 days rejected with RETENTION_EXCEEDED 400 on downtime, operational-events, telemetry, and telemetry hourly
  for (const runExport of [
    () => apiClient.exportDowntimeData({ device_id: 'STM32-OEE-01', from: expiredFrom, to, format: 'csv' }),
    () => apiClient.exportOperationalEventsData({ device_id: 'ALL', from: expiredFrom, to, format: 'ndjson' }),
    () =>
      apiClient.exportOperationalEventsData({ device_id: 'STM32-OEE-01', from: expiredFrom, to, format: 'csv' }),
    () => apiClient.exportTelemetryData({ device_id: 'STM32-OEE-01', from: expiredFrom, to, format: 'json' }),
    () =>
      apiClient.exportTelemetryHourlyData({ device_id: 'STM32-OEE-01', from: expiredFrom, to, format: 'csv' }),
  ]) {
    await assert.rejects(
      runExport,
      (err: unknown) =>
        err instanceof ReconciliationError && err.code === 'RETENTION_EXCEEDED' && err.status === 400
    );
  }

  // 3b. Dynamic ALLOW: OPERATOR tanpa baseline export, diberi policy
  // refresh:telemetry via role kustom → export diizinkan dan tercatat
  // sebagai ALLOW dengan aksi kunci capability `telemetry.refresh`.
  // (Demo hanya mencatat ALLOW untuk grant policy dinamis; export
  // baseline ADMIN/SUPERVISOR tidak dicatat sebagai ALLOW.)
  apiClient.setNetworkMode('LAN');
  apiClient.setUserRole('ADMIN');
  apiClient.setSessionActive(true);
  store.currentUserId = 'ADM-001';
  store.currentUserRole = 'ADMIN';
  store.isAuthenticated = true;
  store.tokenAuthzVersion = store.iamInfo.authzVersion;
  const allowRole = await apiClient.createIamRole({
    name: 'EXPORT_ALLOW',
    description: 'Role uji dynamic allow export',
  });
  await apiClient.addIamRolePermission(allowRole.id, 'perm-06', {
    resourcePattern: 'telemetry:*',
    effect: 'ALLOW',
  });
  await apiClient.assignIamUserRole({
    operatorId: 'OP-115',
    roleName: 'EXPORT_ALLOW',
    scopeType: 'ORGANIZATION',
  });
  try {
    await apiClient.login('OP-115', 'AnyPass123');
    const opExport = await apiClient.exportTelemetryData({
      device_id: 'STM32-OEE-01',
      from: validFrom,
      to,
      format: 'json',
    });
    assert.ok(opExport.rowCount > 0);
  } finally {
    store.currentUserId = 'ADM-001';
    store.currentUserName = 'Alexandria Vance';
    store.currentUserRole = 'ADMIN';
    store.currentUserLineId = 'ORG-ALL';
    store.isAuthenticated = true;
    store.tokenAuthzVersion = store.iamInfo.authzVersion;
    await apiClient.revokeIamUserRole({
      operatorId: 'OP-115',
      roleName: 'EXPORT_ALLOW',
      scopeType: 'ORGANIZATION',
    });
    await apiClient.removeIamRolePermission(allowRole.id, 'perm-06');
    await apiClient.deleteIamRole(allowRole.id);
  }

  // 4. Authz decision audit recorded export ALLOW/DENY decisions
  // (aksi tercatat memakai kunci capability `telemetry.refresh`).
  assert.ok(store.iamAuditDecisions.some((d) => d.action === 'telemetry.refresh' && d.decision === 'ALLOW'));
  assert.ok(
    store.iamAuditDecisions.some((d) => d.action === 'telemetry.refresh' && d.decision === 'DENY')
  );

  // Restore defaults
  apiClient.setNetworkMode('LAN');
  apiClient.setUserRole('ADMIN');
});

// ---------------------------------------------------------------------------
// E12 T12.9 (X-2 / FAT-62): preset "Hari ini" + deteksi preset dari rentang
// aktif — pemilih periode halaman OEE.
// ---------------------------------------------------------------------------

test("resolveTimeWindowPreset('today') mengembalikan tengah malam hari ini sampai sekarang", () => {
  const now = new Date(2026, 10, 17, 10, 24, 0);
  const range = resolveTimeWindowPreset('today', now);
  // E12 T12.11 (X-4 / FAT-59): tengah malam Asia/Jakarta — `now` lokal
  // 2026-11-17 10:24 (VM UTC) = 17:24 WIB 17 Nov, jadi from = 00:00 WIB.
  assert.equal(range.from, '2026-11-17T00:00:00+07:00');
  assert.equal(range.to, formatIsoWithOffset(now));
});

test('isTodayWindow hanya benar untuk jendela hari ini (from tengah malam, to hari ini)', () => {
  const now = new Date('2026-11-17T10:24:00+07:00');
  assert.equal(isTodayWindow('2026-11-17T00:00:00+07:00', '2026-11-17T10:24:00+07:00', now), true);
  // Kemarin 00:00 -> bukan hari ini.
  assert.equal(isTodayWindow('2026-11-16T00:00:00+07:00', '2026-11-16T10:24:00+07:00', now), false);
  // 24 jam terakhir (kemarin 10:24 -> hari ini) bukan "hari ini".
  assert.equal(isTodayWindow('2026-11-16T10:24:00+07:00', '2026-11-17T10:24:00+07:00', now), false);
  // Tanpa offset / tidak valid -> false.
  assert.equal(isTodayWindow('2026-11-17T00:00:00', '2026-11-17T10:24:00+07:00', now), false);
  assert.equal(isTodayWindow('bukan-tanggal', '2026-11-17T10:24:00+07:00', now), false);
});

test('detectTimeWindowPreset mengenali preset dari rentang aktif, kustom untuk sisanya', () => {
  const now = new Date('2026-11-17T10:24:00+07:00');
  for (const preset of ['today', '24h', '7d', '30d', '90d'] as const) {
    const range = resolveTimeWindowPreset(preset, now);
    assert.equal(detectTimeWindowPreset(range.from, range.to, now), preset);
  }
  // Jendela shift 8 jam (07:00-15:00) bukan preset -> kustom.
  assert.equal(
    detectTimeWindowPreset('2026-11-16T07:00:00+07:00', '2026-11-16T15:00:00+07:00', now),
    'custom'
  );
  // Rentang 3 hari sembarang -> kustom.
  assert.equal(
    detectTimeWindowPreset('2026-11-02T00:00:00+07:00', '2026-11-05T00:00:00+07:00', now),
    'custom'
  );
  // Tidak valid / terbalik -> kustom.
  assert.equal(detectTimeWindowPreset('bukan-tanggal', '2026-11-17T10:24:00+07:00', now), 'custom');
  assert.equal(
    detectTimeWindowPreset('2026-11-17T10:24:00+07:00', '2026-11-16T10:24:00+07:00', now),
    'custom'
  );
});
