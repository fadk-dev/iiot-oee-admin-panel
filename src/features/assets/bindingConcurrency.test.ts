// E32.3 (FAT-284): dipecah dari deviceMachineBinding.test.ts — konkurensi & atomisitas binding (bind bersamaan, register MAC bersamaan).
// Kode sumber tidak diubah, hanya pemecahan file tes per domain.
// snapshotStore/restoreStore diduplikasi di tiap file (pola yang sama
// dengan helper stub di e23-batch*): tiap file tes mandiri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, store } from '../../services/api/client';
import { ApiError } from '../../types/auth';

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

test('Test D — Concurrency & Atomicity (Concurrent Bind, Unbind, Register MAC)', async () => {
  const snap = snapshotStore();
  try {
    apiClient.setNetworkMode('LAN');
    apiClient.setUserRole('ADMIN');
    apiClient.setSessionActive(true);

    const mA = await apiClient.createMachine({ machine_id: 'CNC-CONC-A', name: 'Concurrent A', modbus_slave_id: 101 });
    const mB = await apiClient.createMachine({ machine_id: 'CNC-CONC-B', name: 'Concurrent B', modbus_slave_id: 102 });
    const d1 = await apiClient.registerDevice({ device_id: 'STM32-CONC-1', mac_address: '11:22:33:44:55:01' });
    const d2 = await apiClient.registerDevice({ device_id: 'STM32-CONC-2', mac_address: '11:22:33:44:55:02' });

    // D1: Same device bound concurrently to two machines -> exactly 1 succeeds, 1 rejects 409
    const r1 = await Promise.allSettled([
      apiClient.bindDevice(mA.machine_id, { device_id: d1.device_id }),
      apiClient.bindDevice(mB.machine_id, { device_id: d1.device_id }),
    ]);
    assert.equal(r1.filter((r) => r.status === 'fulfilled').length, 1);
    const rej1 = r1.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rej1.reason as ApiError).httpStatus, 409);

    // D2: Two devices bound concurrently to same machine mB -> wait: if mA got d1, let's free both first
    const d1Check = await apiClient.getDeviceById(d1.device_id);
    if (d1Check.bound_machine_id) {
      await apiClient.unbindDevice(d1Check.bound_machine_id);
    }

    const r2 = await Promise.allSettled([
      apiClient.bindDevice(mA.machine_id, { device_id: d1.device_id }),
      apiClient.bindDevice(mA.machine_id, { device_id: d2.device_id }),
    ]);
    assert.equal(r2.filter((r) => r.status === 'fulfilled').length, 1);
    const rej2 = r2.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rej2.reason as ApiError).httpStatus, 409);

    // D3: Concurrent bind + unbind on mA serialized cleanly
    const r3 = await Promise.allSettled([
      apiClient.unbindDevice(mA.machine_id),
      apiClient.bindDevice(mB.machine_id, { device_id: d2.device_id }),
    ]);
    assert.equal(r3.filter((r) => r.status === 'fulfilled').length, 2);

    // Verify 1:1 invariant across ALL devices & machines
    const allMachines = await apiClient.getMachines();
    const allDevices = await apiClient.getDevices();
    const boundDeviceIds = allMachines.map((m) => m.bound_device_id).filter(Boolean);
    assert.equal(new Set(boundDeviceIds).size, boundDeviceIds.length, 'No duplicate bound_device_id across machines');
    for (const m of allMachines) {
      if (m.bound_device_id) {
        const d = allDevices.find((dev) => dev.device_id === m.bound_device_id);
        assert.equal(d?.bound_machine_id, m.machine_id, '1:1 reciprocal consistency violated');
      }
    }

    // D4: Concurrent register duplicate MAC with ':' vs '-' -> 1 succeeds, 1 fails 409
    const r4 = await Promise.allSettled([
      apiClient.registerDevice({ device_id: 'STM32-MAC-RACE-1', mac_address: 'AA:BB:CC:99:88:77' }),
      apiClient.registerDevice({ device_id: 'STM32-MAC-RACE-2', mac_address: 'aa-bb-cc-99-88-77' }),
    ]);
    assert.equal(r4.filter((r) => r.status === 'fulfilled').length, 1);
    const rej4 = r4.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rej4.reason as ApiError).httpStatus, 409);
  } finally {
    restoreStore(snap);
  }
});
