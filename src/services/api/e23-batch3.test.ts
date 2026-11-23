import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpApiClient } from './httpClient';
import { buildDowntimeHistoryEndpoint, buildTelemetryRollupEndpoint, buildOperationalEventsExportEndpoint } from '../../utils/historicalExport';

// ---------------------------------------------------------------------------
// E23 Batch 3 (FAT-192–FAT-201, N-23–N-31 + N-34 Medium 2): perbaikan
// frontend terhadap spec live `~/workspace/oee-live-openapi.json`
// (141 operasi). Setiap stub mengembalikan BENTUK SPEC LIVE (bukan bentuk
// api_docs lama); setiap test meng-assert mapper/transport berperilaku
// benar terhadap bentuk itu.
//
// Port 3038–3049: 3001–3037 sudah dipakai stub lain (undici keep-alive
// rusak bila port dipakai ulang); VITE_API_URL di-set dan di-restore di
// try/finally.
// ---------------------------------------------------------------------------

const LOGIN_BODY = {
  success: true,
  token: 'stub-token',
  expires_in: 900,
  operator: { id: 'ADM-001', username: 'Alexandria Vance', role: 'ADMIN', line_id: 'ORG-ALL' },
};

type SeenReq = { method: string | undefined; path: string; url: string; body: unknown };

function startStub(
  port: number,
  handler: (req: http.IncomingMessage, url: URL, body: unknown) => { status: number; payload: unknown; raw?: string; contentType?: string } | null,
) {
  const seen: SeenReq[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      let body: unknown;
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      } catch {
        body = undefined;
      }
      seen.push({ method: req.method, path: url.pathname, url: url.pathname + url.search, body });
      if (req.method === 'POST' && url.pathname === '/api/v1/auth/admin/login') {
        res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify(LOGIN_BODY));
        return;
      }
      const out = handler(req, url, body);
      if (out) {
        if (out.raw !== undefined) {
          res.writeHead(out.status, { 'Content-Type': out.contentType ?? 'text/csv', Connection: 'close' });
          res.end(out.raw);
          return;
        }
        res.writeHead(out.status, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify(out.payload));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Rute stub tidak dikenal: ${url.pathname}` }));
    });
  });
  return { server, seen };
}

async function withStub(
  port: number,
  handler: (req: http.IncomingMessage, url: URL, body: unknown) => { status: number; payload: unknown; raw?: string; contentType?: string } | null,
  run: (seen: SeenReq[]) => Promise<void>,
) {
  const prevApiUrl = process.env.VITE_API_URL;
  process.env.VITE_API_URL = `http://localhost:${port}/api/v1`;
  const { server, seen } = startStub(port, handler);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  try {
    httpApiClient.setNetworkMode('LAN');
    await httpApiClient.login('ADM-001', 'Admin@2026!');
    await run(seen);
  } finally {
    httpApiClient.setSessionActive(false, null);
    await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
    if (prevApiUrl === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = prevApiUrl;
  }
}

const FROM = '2026-11-10T00:00:00.000Z';
const TO = '2026-11-17T00:00:00.000Z';
const CSV = 'a,b\n1,2\n3,4\n';

// ---------------------------------------------------------------------------
// N-23 (FAT-192): limit wajib — rejects (default 50), OEE/telemetry hourly
// (default 72), ekspor op-events (default 10000).
// ---------------------------------------------------------------------------

test('E23 N-23 (FAT-192): rejects global + per-device selalu mengirim limit=50 (spec live)', async () => {
  await withStub(3038, (_req, url) => {
    if (url.pathname === '/api/v1/quality/rejects') {
      return { status: 200, payload: { data: [{ reason: 'UNCLASSIFIED', count: 5, pct: 100 }], meta: { limit: 50, hasMore: false, nextCursor: null, count: 1 } } };
    }
    if (url.pathname === '/api/v1/quality/rejects/STM32-OEE-01') {
      return { status: 200, payload: { data: [{ reason: 'UNCLASSIFIED', count: 3, pct: 100 }], meta: { limit: 50, hasMore: false, nextCursor: null, count: 1 } } };
    }
    return null;
  }, async (seen) => {
    const global = await httpApiClient.getRejectParetoGlobal();
    assert.equal(global[0]?.count, 5);
    const byDevice = await httpApiClient.getRejectPareto('STM32-OEE-01');
    assert.equal(byDevice[0]?.count, 3);
    for (const seenUrl of seen.filter((s) => s.path.startsWith('/api/v1/quality/rejects')).map((s) => new URL(s.url, 'http://localhost:3038'))) {
      assert.equal(seenUrl.searchParams.get('limit'), '50');
    }
  });
});

test('E23 N-23 (FAT-192): OEE hourly + telemetry hourly tanpa limit mengirim limit=72; eksplisit dihormati', async () => {
  const hourlyRow = {
    bucket: '2026-11-11T09:00:00+07:00', deviceId: 'STM32-OEE-01', machineId: 'CNC-MILLING-01', woId: 'WO-1',
    availabilityPct: '90', performancePct: '92', qualityPct: '98', oeePct: '81',
    totalCount: 10, rejectCount: 1, goodCount: 9, operatingSec: 3600, runSec: 3300,
    sampleCount: 60, targetPerHour: 50, state: 'RUNNING', planned: true, provisional: false,
  };
  await withStub(3039, (_req, url) => {
    if (url.pathname === '/api/v1/oee/hourly' || url.pathname === '/api/v1/telemetry/STM32-OEE-01/hourly') {
      return { status: 200, payload: { data: [hourlyRow], meta: { limit: 72, hasMore: false, nextCursor: null, count: 1 } } };
    }
    return null;
  }, async (seen) => {
    await httpApiClient.getOeeHourly({ machine_id: 'CNC-MILLING-01' });
    await httpApiClient.getHourlyTrend('STM32-OEE-01');
    for (const s of seen.filter((x) => x.path.includes('hourly'))) {
      assert.equal(new URL(s.url, 'http://localhost:3039').searchParams.get('limit'), '72');
    }
    await httpApiClient.getOeeHourly({ machine_id: 'CNC-MILLING-01', limit: 10 });
    const explicit = seen.filter((x) => x.path === '/api/v1/oee/hourly').at(-1);
    assert.equal(new URL(explicit!.url, 'http://localhost:3039').searchParams.get('limit'), '10');
  });
});

test('E23 N-23/N-34 (FAT-192/FAT-201): ekspor op-events mengirim limit=10000 + event_type, tanpa machine_id', async () => {
  await withStub(3040, (_req, url) => {
    if (url.pathname.endsWith('/export')) {
      return { status: 200, payload: null, raw: JSON.stringify(CSV), contentType: 'application/json' };
    }
    return null;
  }, async (seen) => {
    const res = await httpApiClient.exportOperationalEventsData({
      device_id: 'ALL', from: FROM, to: TO, format: 'csv', event_type: 'DEVICE_OFFLINE',
    });
    assert.equal(res.content, CSV);
    const globalUrl = new URL(seen.find((s) => s.path === '/api/v1/operational-events/export')!.url, 'http://localhost:3040');
    assert.equal(globalUrl.searchParams.get('limit'), '10000');
    assert.equal(globalUrl.searchParams.get('event_type'), 'DEVICE_OFFLINE');
    assert.equal(globalUrl.searchParams.has('machine_id'), false);
    await httpApiClient.exportOperationalEventsData({
      device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv', event_type: 'DEVICE_ONLINE',
    });
    const devUrl = new URL(seen.find((s) => s.path === '/api/v1/operational-events/STM32-OEE-01/export')!.url, 'http://localhost:3040');
    assert.equal(devUrl.searchParams.get('event_type'), 'DEVICE_ONLINE');
    assert.equal(devUrl.searchParams.get('limit'), '10000');
  });
  // Builder murni: event_type ikut, machine_id tidak pernah.
  const built = buildOperationalEventsExportEndpoint({ device_id: 'ALL', from: FROM, to: TO, format: 'csv', event_type: 'DEVICE_OFFLINE' });
  assert.match(built, /event_type=DEVICE_OFFLINE/);
  assert.doesNotMatch(built, /machine_id/);
  assert.match(built, /limit=10000/);
});

// ---------------------------------------------------------------------------
// N-24 (FAT-193): ekspor JSON-encoded — body string JSON diuraikan ke CSV.
// ---------------------------------------------------------------------------

test('E23 N-24 (FAT-193): keenam jalur ekspor menguraikan body JSON-encoded menjadi CSV benar', async () => {
  await withStub(3041, (_req, url) => {
    if (url.pathname === '/api/v1/downtime-events/STM32-OEE-01/export') {
      // Jalur ini mengembalikan CSV polos (bukan JSON-encoded) — tetap jalan.
      return { status: 200, payload: null, raw: CSV, contentType: 'text/csv' };
    }
    if (url.pathname.endsWith('/export')) {
      return { status: 200, payload: null, raw: JSON.stringify(CSV), contentType: 'application/json' };
    }
    return null;
  }, async () => {
    const dt = await httpApiClient.exportDowntimeData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(dt.content, CSV);
    assert.equal(dt.rowCount, 2);
    const opGlobal = await httpApiClient.exportOperationalEventsData({ device_id: 'ALL', from: FROM, to: TO, format: 'csv' });
    assert.equal(opGlobal.content, CSV);
    assert.equal(opGlobal.rowCount, 2);
    const opDev = await httpApiClient.exportOperationalEventsData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(opDev.content, CSV);
    assert.equal(opDev.rowCount, 2);
    const audit = await httpApiClient.exportSystemAuditTrailData({ from: FROM, to: TO, format: 'csv' });
    assert.equal(audit.content, CSV);
    assert.equal(audit.rowCount, 2);
    const tel = await httpApiClient.exportTelemetryData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(tel.content, CSV);
    assert.equal(tel.rowCount, 2);
    const telHourly = await httpApiClient.exportTelemetryHourlyData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(telHourly.content, CSV);
    assert.equal(telHourly.rowCount, 2);
  });
});

// ---------------------------------------------------------------------------
// N-25 (FAT-194): downtime tanpa category — mapper 'UNKNOWN', query tanpa
// param category (filter sisi klien), operator objek {id, username}.
// ---------------------------------------------------------------------------

const SPEC_DOWNTIME_ITEM = {
  id: 42,
  deviceId: 'STM32-OEE-01',
  machineId: 'CNC-MILLING-01',
  machineName: 'CNC Milling 01',
  woId: 'WO-1',
  startTime: '2026-11-11T09:00:00+07:00',
  endTime: '2026-11-11T09:30:00+07:00',
  durationSec: 1800,
  durationFormatted: '30m',
  triggerSource: 'FSM',
  operatorReason: 'Bearing aus',
  isLabeled: true,
  isActive: false,
  createdAt: '2026-11-11T09:00:00+07:00',
};

test('E23 N-25 (FAT-194): item downtime spec (tanpa category) → category UNKNOWN; URL tanpa category; operator objek', async () => {
  await withStub(3042, (req, url, body) => {
    if (req.method === 'GET' && url.pathname === '/api/v1/downtime-events/STM32-OEE-01') {
      return { status: 200, payload: { data: [SPEC_DOWNTIME_ITEM], meta: { limit: 50, hasMore: false, nextCursor: null, count: 1 } } };
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/downtime-events/42/reason') {
      assert.deepEqual(body, { category: 'EQUIPMENT_FAILURE', reason: 'Bearing aus' });
      return {
        status: 200,
        payload: {
          success: true, eventId: 42, deviceId: 'STM32-OEE-01',
          operatorReason: 'Bearing aus', isOverwrite: false,
          operator: { id: 'ADM-001', username: 'Alexandria Vance' },
        },
      };
    }
    return null;
  }, async (seen) => {
    const page = await httpApiClient.getDowntimeHistoryPage({ device_id: 'STM32-OEE-01', limit: 50 });
    assert.equal(page.data[0]?.category, 'UNKNOWN');
    assert.equal(page.data[0]?.reason, 'Bearing aus');
    assert.equal(page.data[0]?.is_labeled, true);
    const histUrl = new URL(seen.find((s) => s.path.startsWith('/api/v1/downtime-events/STM32-OEE-01'))!.url, 'http://localhost:3042');
    assert.equal(histUrl.searchParams.has('category'), false);
    // Filter kategori diterapkan sisi klien pada halaman yang diambil.
    const filteredOut = await httpApiClient.getDowntimeHistoryPage({ device_id: 'STM32-OEE-01', category: 'OTHER', limit: 50 });
    assert.equal(filteredOut.data.length, 0);
    const kept = await httpApiClient.getDowntimeHistoryPage({ device_id: 'STM32-OEE-01', category: 'UNKNOWN', limit: 50 });
    assert.equal(kept.data.length, 1);
    const res = await httpApiClient.classifyDowntimeReason('42', 'EQUIPMENT_FAILURE', 'Bearing aus');
    assert.deepEqual(res.operator, { id: 'ADM-001', username: 'Alexandria Vance' });
  });
  const built = buildDowntimeHistoryEndpoint({ device_id: 'STM32-OEE-01', category: 'OTHER', limit: 50 });
  assert.doesNotMatch(built, /category/);
});

// ---------------------------------------------------------------------------
// N-26 (FAT-195): rollup group_by 'line' + tanpa envelope=true.
// ---------------------------------------------------------------------------

test('E23 N-26 (FAT-195): baris rollup groupBy line tidak melempar; lineId dipetakan; URL tanpa envelope', async () => {
  await withStub(3043, (_req, url) => {
    if (url.pathname === '/api/v1/telemetry/rollup') {
      return {
        status: 200,
        payload: {
          data: [{
            groupBy: 'line', bucket: null, machineId: 'CNC-MILLING-01', lineId: 'LINE-01',
            totalCount: 100, goodCount: 95, rejectCount: 5, operatingSec: 3600, runSec: 3300,
            availabilityPct: 90, performancePct: 92, qualityPct: 95, oeePct: 78.7,
            sampleCount: 60, provisional: false,
          }],
          meta: { limit: 500, hasMore: false, nextCursor: null, count: 1 },
        },
      };
    }
    return null;
  }, async (seen) => {
    const page = await httpApiClient.getTelemetryRollup({ group_by: 'line', from: FROM, to: TO });
    assert.equal(page.data[0]?.groupBy, 'line');
    assert.equal(page.data[0]?.lineId, 'LINE-01');
    assert.equal(page.data[0]?.groupKey, 'LINE-01');
    const rollupUrl = new URL(seen.find((s) => s.path === '/api/v1/telemetry/rollup')!.url, 'http://localhost:3043');
    assert.equal(rollupUrl.searchParams.get('group_by'), 'line');
    assert.equal(rollupUrl.searchParams.has('envelope'), false);
  });
  const built = buildTelemetryRollupEndpoint({ group_by: 'line', from: FROM, to: TO });
  assert.match(built, /group_by=line/);
  assert.doesNotMatch(built, /envelope/);
});

// ---------------------------------------------------------------------------
// N-27 (FAT-196): shift-summary — parts dari Σ hourly, null tanpa hourly;
// nama shift/mesin null (bukan 'Shift'/'').
// ---------------------------------------------------------------------------

const SPEC_SHIFT_SUMMARY = {
  oee: 81.4, availability: 90, performance: 92.5, quality: 97.7,
  time_sec: { operating: 25200, run: 23280, downtime: 1920 },
  window: { from: '2026-11-11T07:00:00+07:00', to: '2026-11-11T15:00:00+07:00', tz: 'Asia/Jakarta' },
  target_per_hour: 50,
  hourly: [
    {
      bucket: '2026-11-11T09:00:00+07:00', deviceId: 'STM32-OEE-01', machineId: 'CNC-MILLING-01', woId: 'WO-1',
      availabilityPct: '90', performancePct: '92', qualityPct: '98', oeePct: '81',
      totalCount: 100, rejectCount: 2, goodCount: 98, operatingSec: 3600, runSec: 3300,
      sampleCount: 60, targetPerHour: 50, state: 'RUNNING', planned: true, provisional: false,
    },
    {
      bucket: '2026-11-11T10:00:00+07:00', deviceId: 'STM32-OEE-01', machineId: 'CNC-MILLING-01', woId: 'WO-1',
      availabilityPct: '91', performancePct: '93', qualityPct: '97', oeePct: '82',
      totalCount: 50, rejectCount: 1, goodCount: 49, operatingSec: 3600, runSec: 3400,
      sampleCount: 60, targetPerHour: 50, state: 'RUNNING', planned: true, provisional: false,
    },
  ],
};

test('E23 N-27 (FAT-196): shift-summary spec — parts = Σ hourly, nama null; tanpa hourly parts null', async () => {
  await withStub(3044, (_req, url) => {
    if (url.pathname === '/api/v1/oee/shift-summary') {
      const withHourly = url.searchParams.get('include_hourly') === 'true';
      const { hourly, ...rest } = SPEC_SHIFT_SUMMARY;
      return { status: 200, payload: withHourly ? SPEC_SHIFT_SUMMARY : rest };
    }
    return null;
  }, async () => {
    const withHourly = await httpApiClient.getShiftSummary('CNC-MILLING-01', undefined, { include_hourly: true });
    assert.equal(withHourly.total_parts, 150);
    assert.equal(withHourly.good_parts, 147);
    assert.equal(withHourly.defect_parts, 3);
    assert.equal(withHourly.shift_name, null);
    assert.equal(withHourly.machine_name, null);
    const withoutHourly = await httpApiClient.getShiftSummary('CNC-MILLING-01');
    assert.equal(withoutHourly.total_parts, null);
    assert.equal(withoutHourly.good_parts, null);
    assert.equal(withoutHourly.defect_parts, null);
    assert.equal(withoutHourly.shift_name, null);
  });
});

// ---------------------------------------------------------------------------
// N-28 (FAT-197): overview — status enum, lastOperation objek, reason.
// ---------------------------------------------------------------------------

const SPEC_LAST_OPERATION = {
  operation_id: 'op-9', version_id: 'v9', type: 'APPLY', status: 'SUCCEEDED',
  domainStatus: 'SUCCEEDED', domainAction: 'APPLY', phase: 'done',
  actorId: 'ADM-001', actorName: 'Alexandria Vance', reason: 'apply v9',
  startedAt: '2026-11-19T07:00:00Z', finishedAt: '2026-11-19T07:00:02Z',
  steps: [], error: null,
  result: { previousVersionId: 'v8', appliedVersionId: 'v9', rollbackAttempted: false, rollbackSucceeded: false },
};

test('E23 N-28 (FAT-197): overview memetakan status CONNECTING + lastOperation objek', async () => {
  await withStub(3045, (_req, url) => {
    if (url.pathname === '/api/v1/mqtt/overview') {
      return {
        status: 200,
        payload: {
          dynamicSecurity: {
            available: true, enabled: true, status: 'CONNECTING',
            clientsCount: 3, rolesCount: 2, groupsCount: 1,
            lastError: null, measuredAt: '2026-11-19T08:00:00Z',
          },
          configuration: {
            status: 'IN_SYNC', activeVersionId: 'v9', lastAppliedAt: '2026-11-19T07:00:00Z',
            mutationLocked: false, lastOperation: SPEC_LAST_OPERATION, measuredAt: '2026-11-19T08:00:00Z',
          },
        },
      };
    }
    return null;
  }, async () => {
    const ov = await httpApiClient.getBrokerOverview();
    assert.equal(ov.dynamicSecurity.status, 'CONNECTING');
    assert.equal(ov.configuration.lastOperation?.operation_id, 'op-9');
    assert.equal(ov.configuration.lastOperation?.type, 'APPLY');
    assert.equal(ov.configuration.lastOperation?.actorName, 'Alexandria Vance');
    assert.equal(ov.configuration.lastOperation?.status, 'SUCCEEDED');
  });
});

test('E23 N-28 (FAT-197): overview varian available=false membawa reason; count null dipertahankan', async () => {
  await withStub(3046, (_req, url) => {
    if (url.pathname === '/api/v1/mqtt/overview') {
      return {
        status: 200,
        payload: {
          dynamicSecurity: {
            available: false, reason: 'plugin tidak aktif',
            clientsCount: null, rolesCount: null, groupsCount: null,
            lastError: null, measuredAt: '2026-11-19T08:00:00Z',
          },
          configuration: {
            status: 'UNAVAILABLE', activeVersionId: null, lastAppliedAt: null,
            mutationLocked: false, lastOperation: null, measuredAt: '2026-11-19T08:00:00Z',
          },
        },
      };
    }
    return null;
  }, async () => {
    const ov = await httpApiClient.getBrokerOverview();
    assert.equal(ov.dynamicSecurity.available, false);
    assert.equal(ov.dynamicSecurity.reason, 'plugin tidak aktif');
    assert.equal(ov.dynamicSecurity.status, 'DISCONNECTED');
    assert.equal(ov.dynamicSecurity.clientsCount, null);
    assert.equal(ov.configuration.lastOperation, null);
  });
});

// ---------------------------------------------------------------------------
// N-29 (FAT-198): config GET — unmanaged objek, null tetap null.
// N-30 (FAT-199): config raw — text + metadata dari JSON.
// ---------------------------------------------------------------------------

test('E23 N-29 (FAT-198): config GET memetakan unmanaged objek; max_queued/inflight null tetap null', async () => {
  await withStub(3047, (_req, url) => {
    // E23 Batch 4 (FAT-208, N-39): path spec tanpa trailing slash.
    if (url.pathname === '/api/v1/mqtt/configuration') {
      return {
        status: 200,
        payload: {
          version: '2.0.18-rel-5',
          general: {
            per_listener_settings: true, allow_anonymous: false, autosave_interval_seconds: null,
            persistence: true, persistence_location: '/var/lib/mosquitto/', log_dest: [], log_type: [], connection_messages: true,
          },
          limits: {
            max_connections: null, max_packet_size_bytes: null, max_queued_messages: null,
            max_queued_bytes: null, max_inflight_messages: null,
          },
          listeners: [], tls_profiles: [], bridges: [],
          unmanaged: [
            { key: 'custom_key', section: 'general', line: 42, reason: 'custom key' },
            { key: 'other_key', section: 'listeners', line: 7, reason: 'legacy' },
          ],
        },
      };
    }
    return null;
  }, async () => {
    const cfg = await httpApiClient.getBrokerConfig();
    assert.equal(cfg.limits.max_queued_messages, null);
    assert.equal(cfg.limits.max_inflight_messages, null);
    assert.deepEqual(cfg.unmanaged, [
      { key: 'custom_key', section: 'general', line: 42, reason: 'custom key' },
      { key: 'other_key', section: 'listeners', line: 7, reason: 'legacy' },
    ]);
  });
});

test('E23 N-30 (FAT-199): config raw mengembalikan text mosquitto.conf + metadata, bukan dokumen JSON', async () => {
  const confText = 'per_listener_settings true\nallow_anonymous false\n';
  await withStub(3048, (_req, url) => {
    if (url.pathname === '/api/v1/mqtt/configuration/raw') {
      return {
        status: 200,
        payload: {
          metadata: {
            source: '/etc/mosquitto/mosquitto.conf', checksum: 'abc123', sizeBytes: 48,
            modifiedAt: '2026-11-19T07:00:00Z', mosquittoVersion: '2.0.18',
          },
          text: confText,
        },
      };
    }
    return null;
  }, async () => {
    const raw = await httpApiClient.getBrokerConfigRaw();
    assert.equal(raw.text, confText);
    assert.doesNotMatch(raw.text, /metadata/);
    assert.equal(raw.metadata?.checksum, 'abc123');
    assert.equal(raw.metadata?.sizeBytes, 48);
    assert.equal(raw.metadata?.mosquittoVersion, '2.0.18');
    assert.equal(raw.metadata?.source, '/etc/mosquitto/mosquitto.conf');
  });
});

// ---------------------------------------------------------------------------
// N-31 (FAT-200): operations — type spec APPLY/ROLLBACK/DISCARD, field yang
// dulu dibuang, timestamp dari startedAt (bukan epoch 1970).
// ---------------------------------------------------------------------------

test('E23 N-31 (FAT-200): operasi memetakan type APPLY + phase/actor/waktu/error/result; timestamp bukan epoch', async () => {
  await withStub(3049, (_req, url) => {
    if (url.pathname === '/api/v1/mqtt/configuration/operations') {
      return {
        status: 200,
        payload: {
          data: [{
            operation_id: 'op-9', version_id: 'v9', type: 'APPLY', status: 'SUCCEEDED',
            domainStatus: 'SUCCEEDED', domainAction: 'APPLY', phase: 'done',
            actorId: 'ADM-001', actorName: 'Alexandria Vance', reason: 'apply v9',
            startedAt: '2026-11-19T07:00:00Z', finishedAt: '2026-11-19T07:00:02Z',
            steps: [{ name: 'VALIDATE', status: 'SUCCEEDED', startedAt: '2026-11-19T07:00:00Z', finishedAt: '2026-11-19T07:00:01Z' }],
            error: null,
            result: { previousVersionId: 'v8', appliedVersionId: 'v9', rollbackAttempted: false, rollbackSucceeded: false },
          }],
          meta: { limit: 50, hasMore: false, nextCursor: null, count: 1 },
        },
      };
    }
    if (url.pathname === '/api/v1/mqtt/configuration/operations/op-null') {
      return {
        status: 200,
        payload: {
          operation_id: 'op-null', version_id: 'v9', type: null, status: 'FAILED',
          domainStatus: 'FAILED', domainAction: 'RECOVERY', phase: 'recovery',
          actorId: 'ADM-001', actorName: 'Alexandria Vance', reason: 'recovery',
          startedAt: null, finishedAt: null, steps: [],
          error: { code: 'APPLY_FAILED', message: 'broker menolak reload' },
          result: { previousVersionId: 'v8', appliedVersionId: null, rollbackAttempted: true, rollbackSucceeded: true },
        },
      };
    }
    return null;
  }, async () => {
    const ops = await httpApiClient.getBrokerConfigOperations();
    assert.equal(ops[0]?.type, 'APPLY');
    assert.equal(ops[0]?.timestamp, '2026-11-19T07:00:00Z');
    assert.notEqual(ops[0]?.timestamp, '1970-01-01T00:00:00.000Z');
    assert.equal(ops[0]?.completed_at, '2026-11-19T07:00:02Z');
    assert.equal(ops[0]?.phase, 'done');
    assert.equal(ops[0]?.actorName, 'Alexandria Vance');
    assert.equal(ops[0]?.domainStatus, 'SUCCEEDED');
    assert.equal(ops[0]?.result?.appliedVersionId, 'v9');
    const failed = await httpApiClient.getBrokerConfigOperation('op-null');
    assert.equal(failed?.type, null);
    assert.equal(failed?.timestamp, '');
    assert.notEqual(failed?.timestamp, '1970-01-01T00:00:00.000Z');
    assert.equal(failed?.error?.code, 'APPLY_FAILED');
    assert.equal(failed?.result?.rollbackSucceeded, true);
  });
});
