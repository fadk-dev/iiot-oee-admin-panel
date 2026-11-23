import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpApiClient } from './httpClient';


test('E20 P20.4: health/detail + hapus sintesis; op-events FR-034-01 + export audit-trail P33.4 (stub, port 3007)', async () => {
  // Port 3007: 3001–3006 sudah dipakai stub lain — undici keep-alive rusak
  // bila port dipakai ulang; VITE_API_URL di-set/restore di try/finally.
  const prevApiUrl = process.env.VITE_API_URL;
  process.env.VITE_API_URL = 'http://localhost:3007/api/v1';
  const seen: Array<{ method: string | undefined; path: string; search: string; body: unknown }> = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost:3007');
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      let body: unknown;
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      } catch {
        body = undefined;
      }
      seen.push({ method: req.method, path: url.pathname, search: url.search, body });
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify(payload));
      };
      if (req.method === 'POST' && url.pathname === '/api/v1/auth/admin/login') {
        json(200, {
          success: true,
          token: 'stub-jwt',
          expires_in: 900,
          operator: { id: 'ADM-001', username: 'Alexandria Vance', role: 'ADMIN', line_id: 'ORG-ALL' },
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        // Bentuk lean (API doc §A) — tanpa label/environment/latency.
        json(200, {
          status: 'ok',
          uptime: 3600.42,
          timestamp: '2026-11-19T03:00:00.000Z',
          ws_clients: 2,
          db_connected: true,
          buffer_pending: 0,
          buffer_dropped: 0,
          metrics: null,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health/detail') {
        json(200, {
          measuredAt: '2026-11-19T03:00:00.000Z',
          application: {
            status: 'UP',
            name: 'iiot-oee-backend',
            version: '1.0.0',
            environment: 'production',
            commit: null,
            uptimeSeconds: 3600.42,
            measuredAt: '2026-11-19T03:00:00.000Z',
          },
          database: { status: 'UP', latencyMs: 1.87, measuredAt: '2026-11-19T03:00:00.000Z' },
          mqtt: {
            status: 'UP',
            adminConnection: {
              connected: true,
              pluginReady: true,
              lastError: null,
              lastConnectedAt: '2026-11-19T02:00:00.000Z',
            },
            clientsCount: 12,
            measuredAt: '2026-11-19T03:00:00.010Z',
          },
          websocket: { status: 'UP', clients: 3, measuredAt: '2026-11-19T03:00:00.010Z' },
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/operational-events') {
        json(200, {
          data: [
            {
              id: 42,
              recordedAt: '2026-11-19T02:10:00.000Z',
              deviceId: 'STM32-OEE-01',
              machineId: 'M-01',
              machineName: 'Press Line 1',
              woId: 'WO-2026-001',
              eventType: 'MASTER_DATA_MUTATION',
              category: 'system',
              condition: 'NORMAL',
              alarmState: 'active-unack',
              triggerSource: 'ADMIN_PANEL',
              eventCode: 0,
              snapshotTotalCount: null,
              snapshotRunSec: null,
              description: 'Machine renamed',
              acknowledged: false,
              acknowledgedAt: null,
              acknowledgedBy: null,
              ackNote: null,
              createdAt: '2026-11-19T02:10:01.000Z',
            },
            {
              id: 43,
              recordedAt: '2026-11-19T01:00:00.000Z',
              deviceId: 'STM32-OEE-01',
              machineId: null,
              machineName: null,
              woId: null,
              eventType: 'DEVICE_OFFLINE',
              category: 'operational',
              condition: 'CLEAR',
              alarmState: 'acked',
              triggerSource: 'DEVICE',
              eventCode: null,
              snapshotTotalCount: null,
              snapshotRunSec: null,
              description: 'Device offline',
              acknowledged: false,
              acknowledgedAt: '2026-11-19T01:05:00.000Z',
              acknowledgedBy: 'ADM-001',
              ackNote: 'Checked',
              createdAt: '2026-11-19T01:00:01.000Z',
            },
          ],
          meta: { limit: 50, hasMore: false, nextCursor: null, count: 2 },
        });
        return;
      }
      // P33.4 (FAT-294, B33.2): arsip audit — record BUKAN OperationalEvent.
      if (req.method === 'GET' && url.pathname === '/api/v1/system/audit-trail') {
        json(200, {
          data: [
            {
              id: 'aud-20261119-000044',
              seq: 44,
              recordedAt: '2026-11-19T02:10:00.000Z',
              actor: 'ADM-001',
              actorRole: 'ADMIN',
              action: 'WORK_ORDER_CANCELLED',
              category: 'system',
              entityType: 'work-order',
              entityId: 'WO-2026-001',
              entityLabel: 'Work Order WO-2026-001',
              oldValue: { status: 'ACTIVE' },
              newValue: { status: 'CANCELLED' },
              reason: 'Cancelled WO',
              source: 'panel',
              prevHash: null,
              hash: null,
            },
          ],
          meta: { limit: 50, hasMore: false, nextCursor: null, count: 1, totalCount: 1, retentionDays: 90 },
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/system/audit-trail/export') {
        res.writeHead(200, {
          'Content-Type': 'text/csv',
          Connection: 'close',
          'Content-Disposition': 'attachment; filename="system_audit_trail_2026-11-19.csv"',
          'X-Export-Source': 'system_audit_trail',
          'X-Export-Generated-At': '2026-11-19T03:00:00.000Z',
          'X-Export-Time-Window': '2026-11-01T00:00:00Z..2026-11-12T00:00:00Z',
        });
        res.end('id,seq,recorded_at,action\naud-20261119-000044,44,2026-11-19T02:10:00.000Z,WORK_ORDER_CANCELLED\n');
        return;
      }
      if (req.method === 'PATCH' && url.pathname === '/api/v1/operational-events/42/ack') {
        json(200, {
          id: 42,
          acknowledgedAt: '2026-11-19T03:05:00.000Z',
          acknowledgedBy: 'ADM-001',
          ackNote: 'Noted',
          acknowledged: true,
        });
        return;
      }
      json(404, { error: 'NOT_FOUND', message: `Rute stub tidak dikenal: ${req.method} ${url.pathname}` });
    });
  });
  await new Promise<void>((resolve) => server.listen(3007, resolve));
  try {
    const loggedIn = await httpApiClient.login('ADM-001', 'Admin@2026!');
    assert.equal(loggedIn.token, 'stub-jwt');

    // /health lean: tidak ada sintesis — label/environment/latency null,
    // mqtt UNKNOWN + connected_clients null (bukan fallback wsClients).
    const health = await httpApiClient.getSystemHealth();
    assert.equal(health.backend.label, null);
    assert.equal(health.backend.environment, null);
    assert.equal(health.backend.latency_ms, null);
    assert.equal(health.backend.status, 'UNKNOWN');
    assert.equal(health.mqtt.status, 'UNKNOWN');
    assert.equal(health.mqtt.connected_clients, null);
    assert.equal(health.mqtt.dynamic_security, null);
    assert.equal(health.metrics, null);

    // /health/detail: per-komponen + measuredAt; null dipertahankan (commit).
    const detail = await httpApiClient.getHealthDetail();
    assert.equal(detail.application.status, 'UP');
    assert.equal(detail.application.name, 'iiot-oee-backend');
    assert.equal(detail.application.version, '1.0.0');
    assert.equal(detail.application.environment, 'production');
    assert.equal(detail.application.commit, null);
    assert.equal(detail.application.uptimeSeconds, 3600.42);
    assert.equal(detail.application.measuredAt, '2026-11-19T03:00:00.000Z');
    assert.equal(detail.database.status, 'UP');
    assert.equal(detail.database.latencyMs, 1.87);
    assert.equal(detail.mqtt.adminConnection?.connected, true);
    assert.equal(detail.mqtt.adminConnection?.pluginReady, true);
    assert.equal(detail.mqtt.adminConnection?.lastError, null);
    assert.equal(detail.mqtt.clientsCount, 12);
    assert.equal(detail.websocket.clients, 3);

    // Op-events: mapper FR-034-01 — description/recordedAt dibaca,
    // acknowledged DITURUNKAN dari acknowledgedAt (baris 43: field
    // `acknowledged: false` diabaikan karena acknowledgedAt terisi),
    // machineName null bila mesin dihapus, meta.count = baris halaman.
    // P33.4 (FAT-294): `category`/`alarmState`/`condition` server dibaca.
    const page = await httpApiClient.getOperationalEventsPage({ acknowledged: true, category: 'operational' });
    assert.equal(page.data.length, 2);
    assert.equal(page.pagination.total_count, 2);
    assert.equal(page.data[0].description, 'Machine renamed');
    assert.equal(page.data[0].recorded_at, '2026-11-19T02:10:00.000Z');
    assert.equal(page.data[0].machine_name, 'Press Line 1');
    assert.equal(page.data[0].acknowledged, false);
    assert.equal(page.data[0].category, 'system');
    assert.equal(page.data[0].alarm_state, 'active-unack');
    assert.equal(page.data[0].condition, 'NORMAL');
    assert.equal(page.data[1].machine_name, null);
    assert.equal(page.data[1].acknowledged, true);
    assert.equal(page.data[1].acknowledged_by, 'ADM-001');
    assert.equal(page.data[1].category, 'operational');
    assert.equal(page.data[1].alarm_state, 'acked');
    assert.equal(page.data[1].condition, 'CLEAR');

    const find = (method: string, path: string) =>
      seen.find((s) => s.method === method && s.path === path);
    // Filter acknowledged + category dikirim; machine_id TIDAK ke endpoint global.
    const opCall = find('GET', '/api/v1/operational-events');
    assert.ok(opCall?.search.includes('acknowledged=true'));
    assert.ok(opCall?.search.includes('category=operational'));
    assert.equal(opCall?.search.includes('machine_id'), false);

    // /system/audit-trail (P33.4): record arsip — seq/actor/action/
    // old→new — BUKAN OperationalEvent; tanpa field karangan.
    const auditPage = await httpApiClient.getSystemAuditTrailPage({
      machine_id: 'CNC-MILLING-01',
      action: 'WORK_ORDER_CANCELLED',
    });
    assert.equal(auditPage.data.length, 1);
    assert.equal(auditPage.data[0].action, 'WORK_ORDER_CANCELLED');
    assert.equal(auditPage.data[0].seq, 44);
    assert.equal(auditPage.data[0].actor, 'ADM-001');
    assert.equal(auditPage.data[0].actor_role, 'ADMIN');
    assert.deepEqual(auditPage.data[0].old_value, { status: 'ACTIVE' });
    assert.deepEqual(auditPage.data[0].new_value, { status: 'CANCELLED' });
    assert.equal(auditPage.data[0].reason, 'Cancelled WO');
    assert.equal(auditPage.data[0].source, 'panel');
    assert.equal('event_type' in auditPage.data[0], false);
    assert.equal('acknowledged' in auditPage.data[0], false);
    assert.equal(auditPage.pagination.total_count, 1);
    assert.equal(auditPage.pagination.retention_days, 90);
    const auditCall = find('GET', '/api/v1/system/audit-trail');
    assert.ok(auditCall?.search.includes('machine_id=CNC-MILLING-01'));
    assert.ok(auditCall?.search.includes('action=WORK_ORDER_CANCELLED'));

    // Export audit-trail: format + filter + header X-Export-*.
    const exported = await httpApiClient.exportSystemAuditTrailData({
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-12T00:00:00Z',
      action: 'WORK_ORDER_CANCELLED',
      format: 'csv',
    });
    assert.equal(exported.filename, 'system_audit_trail_2026-11-19.csv');
    assert.equal(exported.format, 'csv');
    assert.equal(exported.rowCount, 1);
    assert.equal(exported.metadata.source, 'system_audit_trail');
    const exportCall = find('GET', '/api/v1/system/audit-trail/export');
    assert.ok(exportCall?.search.includes('action=WORK_ORDER_CANCELLED'));
    assert.ok(exportCall?.search.includes('format=csv'));

    // Ack: acknowledged diturunkan dari acknowledgedAt respons.
    const acked = await httpApiClient.acknowledgeOperationalEvent('42', 'Noted');
    assert.equal(acked.acknowledged, true);
    assert.equal(acked.acknowledged_at, '2026-11-19T03:05:00.000Z');
    assert.equal(acked.ack_note, 'Noted');
    assert.deepEqual(find('PATCH', '/api/v1/operational-events/42/ack')?.body, { note: 'Noted' });
  } finally {
    httpApiClient.setSessionActive(false, null);
    if (prevApiUrl === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = prevApiUrl;
    await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
  }
});
