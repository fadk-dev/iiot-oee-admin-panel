// E32.3 (FAT-284): dipecah dari deviceMachineBinding.test.ts — alur manajemen machine (CREATE slave default, bind atomik, guard DELETE).
// Kode sumber tidak diubah, hanya pemecahan file tes per domain.
// snapshotStore/restoreStore diduplikasi di tiap file (pola yang sama
// dengan helper stub di e23-batch*): tiap file tes mandiri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, store } from '../../services/api/client';
import { telemetrySocket, TelemetryWsEvent } from '../../services/ws/telemetrySocket';
import { validateMachineInput } from '../../utils/capabilities';

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

test('Test B — Machine Management Workflow (CREATE default slave=1, optional deviceId, UPDATE reject relation mutation, DELETE history & WO/DT guards)', async () => {
  const snap = snapshotStore();
  try {
    apiClient.setNetworkMode('LAN');
    apiClient.setUserRole('ADMIN');
    apiClient.setSessionActive(true);

    // B1: READ cursor-paginated list + detail with boundDevice enrichment
    const page = await apiClient.getMachinesPage({ limit: 10 });
    assert.ok(page.data.length >= 5);
    const m1 = await apiClient.getMachineById('CNC-MILLING-01');
    assert.equal(m1.bound_device_id, 'STM32-OEE-01');
    assert.equal(m1.boundDevice?.mac_address, '00:08:DC:55:01:01');

    // B2: Validation checks
    assert.ok(validateMachineInput({ machineId: 'BAD-MACHINE', machineName: 'Valid Name', modbusSlaveId: 10, isCreate: true }).machineId);
    assert.ok(validateMachineInput({ machineId: 'CNC-TEST-01', machineName: 'AB', modbusSlaveId: 10, isCreate: true }).machineName);
    assert.ok(validateMachineInput({ machineId: 'CNC-TEST-01', machineName: 'Valid Name', modbusSlaveId: 0, isCreate: true }).modbusSlaveId);
    assert.ok(validateMachineInput({ machineId: 'CNC-TEST-01', machineName: 'Valid Name', modbusSlaveId: 248, isCreate: true }).modbusSlaveId);

    // B3: Default modbusSlaveId = 1 when omitted (free slave 1 from CNC-MILLING-01 temporarily to verify default=1)
    await apiClient.updateMachine('CNC-MILLING-01', { modbus_slave_id: 91 });
    const createdDefaultSlave = await apiClient.createMachine({
      machine_id: 'CNC-DEFAULT-01',
      name: 'CNC Default Slave Test',
    });
    assert.equal(createdDefaultSlave.modbus_slave_id, 1);
    assert.equal(createdDefaultSlave.bound_device_id, null);
    assert.equal(createdDefaultSlave.boundDevice, null);

    // B4: CREATE machine with unbound deviceId (atomic bind + WS events)
    const wsEvents: TelemetryWsEvent[] = [];
    const unsub = telemetrySocket.subscribe((ev) => wsEvents.push(ev));
    try {
      const createdWithDev = await apiClient.createMachine({
        machine_id: 'CNC-ATOMIC-02',
        name: 'CNC Atomic Bound',
        modbus_slave_id: 22,
        bound_device_id: 'STM32-OEE-05',
      });
      assert.equal(createdWithDev.bound_device_id, 'STM32-OEE-05');
      assert.equal(createdWithDev.boundDevice?.device_id, 'STM32-OEE-05');
      const dev05 = await apiClient.getDeviceById('STM32-OEE-05');
      assert.equal(dev05.bound_machine_id, 'CNC-ATOMIC-02');
      assert.ok(wsEvents.some((e) => e.type === 'MACHINE_CREATED'));
      assert.ok(wsEvents.some((e) => e.type === 'MACHINE_BOUND'));
    } finally {
      unsub();
    }

    // B5: CREATE machine with already bound deviceId -> 409 DEVICE_ALREADY_BOUND
    await assert.rejects(
      () =>
        apiClient.createMachine({
          machine_id: 'CNC-CONFLICT-03',
          name: 'Conflict Bind',
          modbus_slave_id: 23,
          bound_device_id: 'STM32-OEE-05',
        }),
      (err: any) => err.httpStatus === 409 && err.code === 'DEVICE_ALREADY_BOUND'
    );

    // B6: CREATE machine with nonexistent deviceId -> 404 DEVICE_NOT_FOUND
    await assert.rejects(
      () =>
        apiClient.createMachine({
          machine_id: 'CNC-NOTFOUND-04',
          name: 'Missing Dev',
          modbus_slave_id: 24,
          bound_device_id: 'STM32-MISSING-99',
        }),
      (err: any) => err.httpStatus === 404 && err.code === 'DEVICE_NOT_FOUND'
    );

    // B7: CREATE machine with duplicate modbus_slave_id -> 409 MODBUS_SLAVE_CONFLICT
    await assert.rejects(
      () =>
        apiClient.createMachine({
          machine_id: 'CNC-SLAVE-DUP',
          name: 'Slave Conflict',
          modbus_slave_id: 22,
        }),
      (err: any) => err.httpStatus === 409 && err.code === 'MODBUS_SLAVE_CONFLICT'
    );

    // B8: PUT update machine rejects bound_device_id mutation -> 400 VALIDATION_ERROR
    await assert.rejects(
      () =>
        apiClient.updateMachine('CNC-DEFAULT-01', {
          name: 'Updated Name',
          bound_device_id: 'STM32-OEE-05',
        } as any),
      (err: any) => err.httpStatus === 400 && err.code === 'VALIDATION_ERROR'
    );

    // B9: PUT update allowed fields syncs device bound_machine_name
    const updated = await apiClient.updateMachine('CNC-ATOMIC-02', {
      name: 'CNC Atomic Renamed',
      modbus_slave_id: 25,
    });
    assert.equal(updated.name, 'CNC Atomic Renamed');
    assert.equal(updated.modbus_slave_id, 25);
    const devAfterRename = await apiClient.getDeviceById('STM32-OEE-05');
    assert.equal(devAfterRename.bound_machine_name, 'CNC Atomic Renamed');

    // B10: DELETE machine with active WO -> 409 MACHINE_HAS_ACTIVE_WO
    await assert.rejects(
      () => apiClient.deleteMachine('CNC-MILLING-01'),
      (err: any) => err.httpStatus === 409 && err.code === 'MACHINE_HAS_ACTIVE_WO'
    );

    // B11: DELETE machine with active open downtime -> 409 MACHINE_HAS_ACTIVE_DOWNTIME
    store.downtimes.unshift({
      id: 'dt-open-atomic',
      device_id: 'STM32-OEE-05',
      machine_id: 'CNC-ATOMIC-02',
      machine_name: 'CNC Atomic Renamed',
      started_at: '2026-11-14T01:00:00Z',
      ended_at: null,
      duration_seconds: 0,
      category: 'EQUIPMENT_FAILURE',
      reason: 'Unlabeled downtime',
      is_labeled: false,
      created_at: '2026-11-14T01:00:00Z',
    });
    await assert.rejects(
      () => apiClient.deleteMachine('CNC-ATOMIC-02'),
      (err: any) => err.httpStatus === 409 && err.code === 'MACHINE_HAS_ACTIVE_DOWNTIME'
    );

    // Close the downtime and add completed WO/history, then DELETE machine -> succeeds & preserves history with [deleted]
    const openDt = store.downtimes.find((d) => d.id === 'dt-open-atomic')!;
    openDt.ended_at = '2026-11-14T01:10:00Z';
    openDt.duration_seconds = 600;
    store.workOrders.unshift({
      wo_id: 'WO-HIST-ATOMIC',
      order_number: 'ORD-HIST-ATOMIC',
      product_id: 'PRD-GEAR-01',
      product_name: 'Precision Helical Gear',
      machine_id: 'CNC-ATOMIC-02',
      machine_name: 'CNC Atomic Renamed',
      operator_id: 'OP-001',
      operator_name: 'Budi Santoso',
      shift_name: 'Shift 1',
      target_quantity: 100,
      status: 'COMPLETED',
      planned_start: '2026-11-13T08:00:00Z',
      actual_start_at: '2026-11-13T08:00:00Z',
      actual_end_at: '2026-11-13T16:00:00Z',
    });

    const delOk = await apiClient.deleteMachine('CNC-ATOMIC-02');
    assert.equal(delOk.success, true);
    const dev05AfterDel = await apiClient.getDeviceById('STM32-OEE-05');
    assert.equal(dev05AfterDel.bound_machine_id, null);
    assert.equal(dev05AfterDel.boundMachine, null);
    assert.equal(openDt.machine_id, null);
    assert.equal(openDt.machine_name, '[deleted]');
    const woHist = store.workOrders.find((w) => w.wo_id === 'WO-HIST-ATOMIC')!;
    assert.equal(woHist.machine_id, null);
    assert.equal(woHist.machine_name, null);
  } finally {
    restoreStore(snap);
  }
});
