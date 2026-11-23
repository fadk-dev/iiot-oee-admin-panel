import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, store } from '../../services/api/client';
import { telemetrySocket, TelemetryWsEvent } from '../../services/ws/telemetrySocket';
import { ApiError } from '../../types/auth';
import { validateDeviceInput, validateMachineInput, normalizeMacAddress, isValidIpAddress } from '../../utils/capabilities';

function snapshotStore() {
  return {
    machines: store.machines.map((m) => ({ ...m })),
    devices: store.devices.map((d) => ({ ...d })),
    liveStates: store.liveStates.map((l) => ({ ...l })),
    workOrders: store.workOrders.map((w) => ({ ...w })),
    downtimes: store.downtimes.map((dt) => ({ ...dt })),
    operationalEvents: store.operationalEvents.map((ev) => ({ ...ev })),
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

test('Test C — Device-Machine Binding (1:1 Invariant, BIND, UNBIND, Audit, OperationalEvent & WS)', async () => {
  const snap = snapshotStore();
  try {
    apiClient.setNetworkMode('LAN');
    apiClient.setUserRole('ADMIN');
    apiClient.setSessionActive(true);

    const wsEvents: TelemetryWsEvent[] = [];
    const unsub = telemetrySocket.subscribe((ev) => wsEvents.push(ev));
    try {
      const prevOpEventCount = store.operationalEvents.length;

      // C1: Bind unbound STM32-OEE-05 -> unbound CNC-GRIND-05
      const boundMachine = await apiClient.bindDevice('CNC-GRIND-05', { device_id: 'STM32-OEE-05' });
      assert.equal(boundMachine.bound_device_id, 'STM32-OEE-05');
      assert.equal(boundMachine.boundDevice?.device_id, 'STM32-OEE-05');

      const dev05 = await apiClient.getDeviceById('STM32-OEE-05');
      assert.equal(dev05.bound_machine_id, 'CNC-GRIND-05');
      assert.equal(dev05.boundMachine?.machine_id, 'CNC-GRIND-05');

      // P33.3 dedup (FAT-293): bind menulis SATU entri ke satu store
      // (addOperationalEvent saja) + WS emitted
      assert.equal(store.operationalEvents.length, prevOpEventCount + 1);
      assert.equal(store.operationalEvents[0].event_type, 'MACHINE_BOUND');
      assert.ok(wsEvents.some((e) => e.type === 'MACHINE_BOUND' && (e as any).payload.device_id === 'STM32-OEE-05'));

      // C2: Bind another device to already bound CNC-GRIND-05 -> 409 MACHINE_ALREADY_BOUND
      const extraDev = await apiClient.registerDevice({
        device_id: 'STM32-EXTRA-99',
        mac_address: 'AA:BB:CC:DD:EE:99',
      });
      await assert.rejects(
        () => apiClient.bindDevice('CNC-GRIND-05', { device_id: extraDev.device_id }),
        (err: any) => err.httpStatus === 409 && err.code === 'MACHINE_ALREADY_BOUND'
      );

      // C3: Bind already bound STM32-OEE-05 to new unbound machine -> 409 DEVICE_ALREADY_BOUND
      const unboundM = await apiClient.createMachine({
        machine_id: 'CNC-UNBOUND-99',
        name: 'Unbound Target 99',
        modbus_slave_id: 99,
      });
      await assert.rejects(
        () => apiClient.bindDevice(unboundM.machine_id, { device_id: 'STM32-OEE-05' }),
        (err: any) => err.httpStatus === 409 && err.code === 'DEVICE_ALREADY_BOUND'
      );

      // C4: Unbind CNC-GRIND-05 -> succeeds, emits OperationalEvent + WS MACHINE_UNBOUND
      const unboundResult = await apiClient.unbindDevice('CNC-GRIND-05');
      assert.equal(unboundResult.bound_device_id, null);
      assert.equal(unboundResult.boundDevice, null);
      const dev05Freed = await apiClient.getDeviceById('STM32-OEE-05');
      assert.equal(dev05Freed.bound_machine_id, null);
      assert.equal(store.operationalEvents[0].event_type, 'MACHINE_UNBOUND');
      assert.ok(wsEvents.some((e) => e.type === 'MACHINE_UNBOUND' && (e as any).payload.machine_id === 'CNC-GRIND-05'));

      // C5: Unbind already unbound machine -> 400 MACHINE_NOT_BOUND
      await assert.rejects(
        () => apiClient.unbindDevice('CNC-GRIND-05'),
        (err: any) => err.httpStatus === 400 && err.code === 'MACHINE_NOT_BOUND'
      );

      // C6: Unbind machine with ACTIVE/PENDING WO -> 409 MACHINE_HAS_ACTIVE_WO
      await assert.rejects(
        () => apiClient.unbindDevice('CNC-MILLING-01'),
        (err: any) => err.httpStatus === 409 && err.code === 'MACHINE_HAS_ACTIVE_WO'
      );

      // C7: Re-bind freed device to CNC-UNBOUND-99 -> succeeds
      const rebound = await apiClient.bindDevice('CNC-UNBOUND-99', { device_id: 'STM32-OEE-05' });
      assert.equal(rebound.bound_device_id, 'STM32-OEE-05');
    } finally {
      unsub();
    }
  } finally {
    restoreStore(snap);
  }
});

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

test('Test E — Authorization, Network Perimeter & Zero Side-Effects on Denial', async () => {
  const snap = snapshotStore();
  try {
    const wsEvents: TelemetryWsEvent[] = [];
    const unsub = telemetrySocket.subscribe((ev) => wsEvents.push(ev));
    try {
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

      // E4: Zero operational events or WS events leaked from denied operations
      assert.equal(store.operationalEvents.length, initialOpEvents);
      assert.equal(wsEvents.length, 0);
    } finally {
      unsub();
    }
  } finally {
    restoreStore(snap);
  }
});
