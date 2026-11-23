// E32.3 (FAT-284): dipecah dari deviceMachineBinding.test.ts — alur manajemen device (READ/CREATE/UPDATE/DELETE, validasi, preservasi histori).
// Kode sumber tidak diubah, hanya pemecahan file tes per domain.
// snapshotStore/restoreStore diduplikasi di tiap file (pola yang sama
// dengan helper stub di e23-batch*): tiap file tes mandiri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, store } from '../../services/api/client';
import { ApiError } from '../../types/auth';
import { validateDeviceInput, normalizeMacAddress, isValidIpAddress } from '../../utils/capabilities';

function snapshotStore() {
  return {
    machines: store.machines.map((m) => ({ ...m })),
    devices: store.devices.map((d) => ({ ...d })),
    liveStates: store.liveStates.map((l) => ({ ...l })),
    workOrders: store.workOrders.map((w) => ({ ...w })),
    downtimes: store.downtimes.map((dt) => ({ ...dt })),
    operationalEvents: store.operationalEvents.map((ev) => ({ ...ev })),
    auditTrail: store.auditTrail.map((al) => ({ ...al })),
    iamAuditDecisions: store.iamAuditDecisions.map((d) => ({ ...d })),
    role: apiClient.getUserRole(),
    network: apiClient.getNetworkMode(),
    isAuthenticated: store.isAuthenticated,
    authToken: store.authToken,
    tokenAuthzVersion: store.tokenAuthzVersion,
    iamMode: store.iamInfo.mode,
    hooks: { ...store.hooks },
  };
}

function restoreStore(snap: ReturnType<typeof snapshotStore>) {
  store.machines = snap.machines;
  store.devices = snap.devices;
  store.liveStates = snap.liveStates;
  store.workOrders = snap.workOrders;
  store.downtimes = snap.downtimes;
  store.operationalEvents = snap.operationalEvents;
  store.auditTrail = snap.auditTrail;
  store.iamAuditDecisions = snap.iamAuditDecisions;
  apiClient.setNetworkMode(snap.network);
  apiClient.setIamMode(snap.iamMode);
  apiClient.setUserRole(snap.role);
  store.isAuthenticated = snap.isAuthenticated;
  store.authToken = snap.authToken;
  store.tokenAuthzVersion = snap.tokenAuthzVersion;
  apiClient.setAuthHooks(snap.hooks);
}

test('Test A — Device Management Workflow (READ list/detail, CREATE, UPDATE immutable guard, DELETE history preservation)', async () => {
  const snap = snapshotStore();
  try {
    apiClient.setNetworkMode('LAN');
    apiClient.setUserRole('ADMIN');
    apiClient.setSessionActive(true);
    apiClient.resetEndpointTracker();

    // A1: READ list & detail with boundMachine enrichment
    const list = await apiClient.getDevices();
    assert.ok(list.length >= 5);
    const dev01 = await apiClient.getDeviceById('STM32-OEE-01');
    assert.equal(dev01.bound_machine_id, 'CNC-MILLING-01');
    assert.equal(dev01.boundMachine?.machine_id, 'CNC-MILLING-01');
    assert.equal(dev01.boundMachine?.modbus_slave_id, 1);

    await assert.rejects(
      () => apiClient.getDeviceById('STM32-UNKNOWN-999'),
      (err: any) => err instanceof ApiError && err.httpStatus === 404 && err.code === 'DEVICE_NOT_FOUND'
    );

    // A2: Validation rules (deviceId regex, MAC EUI-48, compressed IPv6)
    assert.ok(validateDeviceInput({ deviceId: 'BAD-01', macAddress: '00:11:22:33:44:55', isCreate: true }).deviceId);
    assert.ok(validateDeviceInput({ deviceId: 'STM32-OK-01', macAddress: 'invalid-mac', isCreate: true }).macAddress);
    assert.equal(isValidIpAddress('2001:db8::1'), true);
    assert.equal(isValidIpAddress('::1'), true);
    assert.equal(isValidIpAddress('999.999.999.999'), false);
    assert.equal(normalizeMacAddress('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');

    // A3: CREATE device valid (with '-' MAC normalized to uppercase ':') + IPv6
    // E23 Batch 4 (FAT-206, N-37): spec live POST /devices tanpa
    // model/serial_number — keduanya tidak lagi dikirim.
    const created = await apiClient.registerDevice({
      device_id: 'STM32-TEST-90',
      mac_address: 'aa-bb-cc-11-22-90',
      ip_address: '2001:db8::90',
      firmware_version: 'v2.5.0',
    });
    assert.equal(created.device_id, 'STM32-TEST-90');
    assert.equal(created.mac_address, 'AA:BB:CC:11:22:90');
    assert.equal(created.ip_address, '2001:db8::90');
    assert.equal(created.bound_machine_id, null);
    assert.equal(created.boundMachine, null);

    // A4: Duplicate deviceId -> 409 DEVICE_ALREADY_REGISTERED (E20 P20.2 D10)
    await assert.rejects(
      () =>
        apiClient.registerDevice({
          device_id: 'STM32-TEST-90',
          mac_address: 'AA:BB:CC:11:22:99',
        }),
      (err: any) => err.httpStatus === 409 && err.code === 'DEVICE_ALREADY_REGISTERED'
    );

    // A5: Duplicate MAC across ':' vs '-' -> 409
    await assert.rejects(
      () =>
        apiClient.registerDevice({
          device_id: 'STM32-TEST-91',
          mac_address: 'AA:BB:CC:11:22:90',
        }),
      (err: any) => err.httpStatus === 409 && err.code === 'CONFLICT'
    );

    // A6: UPDATE allowed fields only (ip_address & firmware_version)
    const updated = await apiClient.updateDevice('STM32-TEST-90', {
      ip_address: '10.10.20.90',
      firmware_version: 'v2.6.0-rtos',
    });
    assert.equal(updated.ip_address, '10.10.20.90');
    assert.equal(updated.firmware_version, 'v2.6.0-rtos');

    // A7: Attempt to mutate immutable device_id or mac_address via PUT -> 400
    await assert.rejects(
      () =>
        apiClient.updateDevice('STM32-TEST-90', {
          device_id: 'STM32-HACKED',
          mac_address: 'FF:FF:FF:FF:FF:FF',
        } as any),
      (err: any) => err.httpStatus === 400 && err.code === 'VALIDATION_ERROR'
    );

    // A8: DELETE bound device whose machine has ACTIVE WO -> 409 CONFLICT (E20 P20.2 D10)
    await assert.rejects(
      () => apiClient.deleteDevice('STM32-OEE-01'),
      (err: any) => err.httpStatus === 409 && err.code === 'CONFLICT' && err.activeWoId === 'WO-2026-101'
    );

    // A9: DELETE device preserves historical downtimes & operationalEvents with device_id = null
    // Attach historical downtime and operational event to STM32-TEST-90 first
    store.downtimes.unshift({
      id: 'dt-hist-test-90',
      device_id: 'STM32-TEST-90',
      machine_id: null,
      machine_name: 'Unbound Test Machine',
      started_at: '2026-11-10T08:00:00Z',
      ended_at: '2026-11-10T08:15:00Z',
      duration_seconds: 900,
      category: 'EQUIPMENT_FAILURE',
      reason: 'SENSOR_RESET',
      notes: 'Historical check',
      is_labeled: true,
      acknowledged_by: 'ADM-001',
      created_at: '2026-11-10T08:00:00Z',
    });
    store.operationalEvents.unshift({
      id: 'opev-hist-test-90',
      recorded_at: '2026-11-10T08:04:00Z',
      device_id: 'STM32-TEST-90',
      station_label: null,
      machine_id: null,
      machine_name: null,
      wo_id: null,
      event_type: 'DEVICE_OFFLINE',
      category: 'operational',
      alarm_state: 'acked',
      condition: 'ACTIVE',
      trigger_source: 'DEVICE',
      event_code: null,
      snapshot_total_count: null,
      snapshot_run_sec: null,
      description: 'Historical reconnect',
      acknowledged: true,
      acknowledged_by: 'ADM-001',
      acknowledged_at: '2026-11-10T08:05:00Z',
      ack_note: 'ok',
      created_at: '2026-11-10T08:04:00Z',
    });

    const delRes = await apiClient.deleteDevice('STM32-TEST-90');
    assert.equal(delRes.success, true);
    assert.equal(store.devices.some((d) => d.device_id === 'STM32-TEST-90'), false);

    const preservedDt = store.downtimes.find((d) => d.id === 'dt-hist-test-90');
    assert.ok(preservedDt, 'Historical downtime record must be preserved');
    assert.equal(preservedDt.device_id, null);

    const preservedEv = store.operationalEvents.find((e) => e.id === 'opev-hist-test-90');
    assert.ok(preservedEv, 'Historical operational event record must be preserved');
    assert.equal(preservedEv.device_id, null);

    assert.ok(apiClient.getCalledEndpointKeys().includes('DEVICES_LIST'));
    assert.ok(apiClient.getCalledEndpointKeys().includes('DEVICES_GET'));
    assert.ok(apiClient.getCalledEndpointKeys().includes('DEVICES_CREATE'));
    assert.ok(apiClient.getCalledEndpointKeys().includes('DEVICES_UPDATE'));
    assert.ok(apiClient.getCalledEndpointKeys().includes('DEVICES_DELETE'));
  } finally {
    restoreStore(snap);
  }
});
