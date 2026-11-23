// E32.3 (FAT-284): dipecah dari deviceMachineBinding.test.ts — otorisasi, perimeter jaringan & zero side-effect saat penolakan.
// Kode sumber tidak diubah, hanya pemecahan file tes per domain.
// snapshotStore/restoreStore diduplikasi di tiap file (pola yang sama
// dengan helper stub di e23-batch*): tiap file tes mandiri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, store } from '../../services/api/client';
import { telemetrySocket, TelemetryWsEvent } from '../../services/ws/telemetrySocket';

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

test('Test E — Authorization, Network Perimeter & Zero Side-Effects on Denial', async () => {
  const snap = snapshotStore();
  try {
    const wsEvents: TelemetryWsEvent[] = [];
    const unsub = telemetrySocket.subscribe((ev) => wsEvents.push(ev));
    try {
      const initialAudits = store.auditTrail.length;
      const initialOpEvents = store.operationalEvents.length;

      // E1: Non-ADMIN roles on LAN cannot mutate devices, machines, or bindings
      for (const role of ['OPERATOR', 'SUPERVISOR', 'MAINTENANCE'] as const) {
        apiClient.setNetworkMode('LAN');
        apiClient.setUserRole(role);
        apiClient.setSessionActive(true);

        await assert.rejects(
          () => apiClient.registerDevice({ device_id: 'STM32-DENIED', mac_address: '00:11:22:33:44:99' }),
          (e: any) => e.httpStatus === 403
        );
        await assert.rejects(
          () => apiClient.updateDevice('STM32-OEE-05', { firmware_version: 'v9.9.9' }),
          (e: any) => e.httpStatus === 403
        );
        await assert.rejects(() => apiClient.deleteDevice('STM32-OEE-05'), (e: any) => e.httpStatus === 403);
        await assert.rejects(
          () => apiClient.createMachine({ machine_id: 'CNC-DENIED-01', name: 'Denied', modbus_slave_id: 200 }),
          (e: any) => e.httpStatus === 403
        );
        await assert.rejects(
          () => apiClient.updateMachine('CNC-GRIND-05', { name: 'Denied Rename' }),
          (e: any) => e.httpStatus === 403
        );
        await assert.rejects(() => apiClient.deleteMachine('CNC-GRIND-05'), (e: any) => e.httpStatus === 403);
        await assert.rejects(
          () => apiClient.bindDevice('CNC-GRIND-05', { device_id: 'STM32-OEE-05' }),
          (e: any) => e.httpStatus === 403
        );
        await assert.rejects(() => apiClient.unbindDevice('CNC-WELD-04'), (e: any) => e.httpStatus === 403);
      }

      // E2: ADMIN on REMOTE_TUNNEL is denied 403 with observation-mode message
      apiClient.setUserRole('ADMIN');
      apiClient.setNetworkMode('REMOTE_TUNNEL');
      await assert.rejects(
        () => apiClient.registerDevice({ device_id: 'STM32-TUNNEL', mac_address: '00:11:22:33:44:88' }),
        (e: any) => e.httpStatus === 403 && String(e.message).includes('Mode observasi')
      );
      await assert.rejects(
        () => apiClient.bindDevice('CNC-GRIND-05', { device_id: 'STM32-OEE-05' }),
        (e: any) => e.httpStatus === 403 && String(e.message).includes('Mode observasi')
      );
      // Public reads remain accessible in REMOTE_TUNNEL
      const tunnelDevices = await apiClient.getDevices();
      const tunnelMachines = await apiClient.getMachines();
      assert.ok(tunnelDevices.length > 0 && tunnelMachines.length > 0);

      // E3: Unauthenticated session returns 401 & fires onUnauthorized hook
      apiClient.setNetworkMode('LAN');
      let unauthFired = false;
      apiClient.setAuthHooks({
        onUnauthorized: () => {
          unauthFired = true;
        },
      });
      apiClient.setSessionActive(false);
      await assert.rejects(
        () => apiClient.bindDevice('CNC-GRIND-05', { device_id: 'STM32-OEE-05' }),
        (e: any) => e.httpStatus === 401
      );
      assert.equal(unauthFired, true);

      // E4: Zero audit logs, operational events, or WS events leaked from denied operations
      assert.equal(store.auditTrail.length, initialAudits);
      assert.equal(store.operationalEvents.length, initialOpEvents);
      assert.equal(wsEvents.length, 0);
    } finally {
      unsub();
    }
  } finally {
    restoreStore(snap);
  }
});
