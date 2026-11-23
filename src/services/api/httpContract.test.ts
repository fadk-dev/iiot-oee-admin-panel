// E32.2 (FAT-283): dipecah dari modeAndTransport.test.ts — kontrak HTTP
// (retry, pemetaan error, normalisasi list) + registry endpoint.
// Kode sumber tidak diubah, hanya pemecahan file tes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from './client';
import { ADMIN_ENDPOINTS, FORBIDDEN_ENDPOINT_PATTERNS } from './endpoints';
import {
  isRetryableHttpStatus,
  mapHttpErrorToApiError,
  normalizeListResponse,
  ProductionLineSchema,
} from './schemas';
import { buildOperationalEventsEndpoint } from '../../utils/historicalExport';

test('HTTP contract §4.2: retry hanya jaringan/502/503/504; 4xx tidak pernah retry', () => {
  for (const s of [0, 502, 503, 504]) assert.equal(isRetryableHttpStatus(s), true, `status ${s}`);
  for (const s of [200, 400, 401, 403, 404, 409, 422, 429]) assert.equal(isRetryableHttpStatus(s), false, `status ${s}`);
});

test('HTTP contract §4.3/§4.5: pemetaan error envelope {error, message, issues?, active_wo_id?}', () => {
  const notFound = mapHttpErrorToApiError(404, { error: 'MACHINE_NOT_FOUND', message: 'Mesin tidak ditemukan.' });
  assert.equal(notFound.code, 'MACHINE_NOT_FOUND');
  assert.equal(notFound.httpStatus, 404);
  assert.equal(notFound.message, 'Mesin tidak ditemukan.');

  const conflict = mapHttpErrorToApiError(409, {
    error: 'PRODUCT_ALREADY_EXISTS',
    message: 'Sudah ada.',
    issues: [{ field: 'product_id', code: 'duplicate', message: 'Duplikat.' }],
  });
  assert.equal(conflict.code, 'PRODUCT_ALREADY_EXISTS');
  assert.equal(conflict.issues?.[0]?.field, 'product_id');

  const unauth = mapHttpErrorToApiError(401, { error: 'UNAUTHORIZED', message: 'Sesi berakhir.' });
  assert.equal(unauth.code, 'UNAUTHORIZED');
  assert.equal(unauth.httpStatus, 401);

  const network = mapHttpErrorToApiError(0);
  assert.equal(network.code, 'NETWORK');
  assert.equal(network.httpStatus, 0);
});

test('HTTP contract D7: normalisasi list array ATAU envelope {data, meta}', () => {
  const fromArray = normalizeListResponse(
    [{ lineId: 'LINE-01', lineName: 'Lini 1', description: null, isActive: true, createdAt: '2026-01-02T07:00:00.000Z' }],
    ProductionLineSchema,
    50
  );
  assert.equal(fromArray.data.length, 1);
  assert.equal(fromArray.data[0].lineId, 'LINE-01');

  const fromEnvelope = normalizeListResponse(
    {
      data: [{ lineId: 'LINE-02', lineName: 'Lini 2', description: null, isActive: true, createdAt: '2026-01-02T07:05:00.000Z' }],
      meta: { total_count: 1, has_more: false, next_cursor: null },
    },
    ProductionLineSchema,
    50
  );
  assert.equal(fromEnvelope.data.length, 1);
  assert.equal(fromEnvelope.pagination.total_count, 1);
  assert.equal(fromEnvelope.pagination.has_more, false);
});

test('E20 P20.5 (FAT-157): registry 137 ops admin (136 + SYSTEM_ACCESS_MODE 09:23); GET /operational-events TANPA trailing slash', () => {
  assert.equal(ADMIN_ENDPOINTS.OPERATIONAL_EVENTS_LIST.buildPath(), '/api/v1/operational-events');
  assert.ok(buildOperationalEventsEndpoint({}).startsWith('/api/v1/operational-events'));
  assert.equal(buildOperationalEventsEndpoint({}).includes('/operational-events/'), false);
  assert.equal(ADMIN_ENDPOINTS.HEALTH_DETAIL.buildPath(), '/health/detail');
  assert.equal(ADMIN_ENDPOINTS.SYSTEM_AUDIT_TRAIL_EXPORT.buildPath(), '/api/v1/system/audit-trail/export');
  assert.equal(Object.keys(ADMIN_ENDPOINTS).length, 137);
  for (const p of ['/command', '/dispatch', '/complete', '/work-orders/validate-zone', '/work-orders/initiate-from-zones']) {
    assert.ok((FORBIDDEN_ENDPOINT_PATTERNS as readonly string[]).includes(p), `forbidden: ${p}`);
  }
  // Actuation HMI tidak ada di permukaan apiClient (ADR-003)
  const client = apiClient as unknown as Record<string, unknown>;
  assert.equal(client.sendDeviceCommand, undefined);
  assert.equal(client.dispatchWorkOrder, undefined);
  assert.equal(client.completeWorkOrder, undefined);
});

test('E14 Fase 0: K-03 config GET tanpa trailing slash (E23 Batch 4 N-39); E20 P20.2 provision kanonis di /devices/provision', () => {
  // E23 Batch 4 (FAT-208, N-39): registry memakai path spec
  // /api/v1/mqtt/configuration (tanpa slash akhir); K-03 lama mencatat
  // server menerima keduanya, panel kini memakai bentuk spec.
  assert.equal(ADMIN_ENDPOINTS.MQTT_CONFIG_GET.buildPath(), '/api/v1/mqtt/configuration');
  // E20 P20.2 (X1/R23, K-11): rute lama /mqtt/dynamic-security/clients/provision
  // DIHAPUS dari registry; pengganti kanonis POST /api/v1/devices/provision.
  assert.equal((ADMIN_ENDPOINTS as Record<string, unknown>).MQTT_DYNSEC_CLIENTS_PROVISION, undefined);
  assert.equal(ADMIN_ENDPOINTS.DEVICES_PROVISION.buildPath(), '/api/v1/devices/provision');
  assert.equal(ADMIN_ENDPOINTS.DEVICES_PROVISION.method, 'POST');
  assert.equal(ADMIN_ENDPOINTS.DEVICES_REVOKE.buildPath('STM32-OEE-01'), '/api/v1/devices/STM32-OEE-01/revoke');
  assert.equal(ADMIN_ENDPOINTS.DEVICES_CREDENTIALS.buildPath('STM32-OEE-01'), '/api/v1/devices/STM32-OEE-01/credentials');
  assert.ok((FORBIDDEN_ENDPOINT_PATTERNS as readonly string[]).includes('/mqtt/dynamic-security/clients/provision'));
  assert.ok((FORBIDDEN_ENDPOINT_PATTERNS as readonly string[]).includes('/mqtt/dynamic-security/provision'));
});
