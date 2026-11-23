// E32.3 (FAT-284): dipecah dari contractAlignment.test.ts — matriks 100% ADMIN_ENDPOINTS — satu tes kohesif, dipertahankan utuh (prinsip 0).
// Kode sumber tidak diubah, hanya pemecahan file tes per domain.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_ENDPOINTS,
  AdminEndpointKey,
} from './endpoints';
import { apiClient, store } from './client';

test('100% of ADMIN_ENDPOINTS catalog keys are wired and callable through apiClient', async () => {
  apiClient.setNetworkMode('LAN');
  apiClient.setUserRole('ADMIN');
  apiClient.setSessionActive(true);
  apiClient.resetEndpointTracker();

  const nowIso = new Date().toISOString();
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Auth, Health, WS (6)
  await apiClient.login('ADM-001', 'admin1234'); // E29: login admin tanpa station_id
  await apiClient.refreshSession();
  await apiClient.changePassword('admin1234', 'NewAdminPass123!');
  await apiClient.getAuthMe();
  await apiClient.getSystemHealth();
  // E20 P20.4 (FAT-156): GET /health/detail (ADMIN + LAN).
  await apiClient.getHealthDetail();
  // E20 P20.5 (FAT-157): GET /api/v1/system/access-mode (09:23, JWT).
  await apiClient.getSystemAccessMode();
  apiClient.getTelemetryWebSocketUrl();

  // Devices (9)
  await apiClient.getDevices();
  await apiClient.getDeviceById('STM32-OEE-01');
  await apiClient.getDeviceHealth('STM32-OEE-01');
  // E23 Batch 4 (FAT-206, N-37): spec live POST /devices tanpa
  // serial_number — tidak lagi dikirim.
  const dev = await apiClient.registerDevice({
    device_id: 'STM32-OEE-99',
    mac_address: '00:08:DC:55:99:99',
    ip_address: '192.168.10.199',
    firmware_version: 'v2.4.1-test',
  });
  await apiClient.updateDevice(dev.device_id, { firmware_version: 'v2.4.2-test' });
  await apiClient.deleteDevice(dev.device_id);

  // E20 P20.2 (§E.3a/3b/3c): provision kanonis + rotasi + revoke.
  const provisioned = await apiClient.provisionDevice({ deviceId: 'STM32-OEE-98', model: 'STM32H723-W5500' });
  assert.equal(provisioned.device.device_id, 'STM32-OEE-98');
  assert.equal(provisioned.device.enrollmentState, 'PROVISIONED');
  assert.equal(provisioned.device.mac_address, '');
  assert.equal(provisioned.credential.username, 'STM32-OEE-98');
  assert.equal(provisioned.credential.password.length, 32);
  assert.equal(provisioned.credential.clientId, 'STM32-OEE-98');
  assert.equal(provisioned.credential.topicPrefix, 'oee/device');
  const rotated = await apiClient.rotateDeviceCredentials('STM32-OEE-98', { force: false, reason: 'Contract verification rotate' });
  assert.equal(rotated.forced, false);
  assert.equal(rotated.credential.password.length, 32);
  const revoked = await apiClient.revokeDevice('STM32-OEE-98', 'Contract verification revoke');
  assert.equal(revoked.enrollmentState, 'REVOKED');
  await apiClient.deleteDevice('STM32-OEE-98');

  // Machines (7)
  await apiClient.getMachines();
  await apiClient.getMachineById('CNC-MILLING-01');
  await apiClient.getMachineStatusHistory('CNC-MILLING-01');
  const mach = await apiClient.createMachine({
    machine_id: 'CNC-TEST-99',
    name: 'Test CNC Mill 99',
    modbus_slave_id: 99,
    bound_device_id: null,
  });
  await apiClient.updateMachine(mach.machine_id, { name: 'Test CNC Mill 99 Updated' });
  await apiClient.bindDevice(mach.machine_id, 'STM32-OEE-05');
  await apiClient.unbindDevice(mach.machine_id);
  await apiClient.deleteMachine(mach.machine_id);

  // Products (5)
  await apiClient.getProducts();
  await apiClient.getProductById('PRD-ARM-001');
  const prod = await apiClient.createProduct({
    product_id: 'PRD-TEST-99',
    sku: 'SKU-TEST-99',
    name: 'Test Gasket 99',
    ideal_cycle_time_seconds: 18,
    active: true,
  });
  await apiClient.updateProduct(prod.product_id, { name: 'Test Gasket 99 v2' });
  await apiClient.deleteProduct(prod.product_id);

  // Operators (7)
  await apiClient.getOperators();
  await apiClient.getOperatorById('OP-115');
  const op = await apiClient.createOperator({
    operator_id: 'OP-999',
    name: 'Test Operator 999',
    role: 'OPERATOR',
    line_id: 'LINE-01',
    password: 'OperatorPass99!',
    is_active: true,
  });
  await apiClient.updateOperator(op.operator_id, { line_id: 'LINE-02' });
  await apiClient.rotateOperatorPassword(op.operator_id, 'NewSecurePass99!');
  await apiClient.toggleOperatorStatus(op.operator_id, false);
  await apiClient.deleteOperator(op.operator_id);


  // Production Lines / Shifts / Shift Schedules (15)
  await apiClient.getProductionLinesPage();
  await apiClient.getProductionLineById('LINE-01');
  const testLine = await apiClient.createProductionLine({ lineId: 'LINE-TEST-99', lineName: 'Test Line 99' });
  await apiClient.updateProductionLine(testLine.lineId, { lineName: 'Test Line 99 Updated' });
  await apiClient.deleteProductionLine(testLine.lineId);
  await apiClient.getShiftsPage();
  await apiClient.getShiftById('SHIFT-1');
  const testShift = await apiClient.createShift({
    shiftId: 'SHIFT-TEST-99',
    shiftName: 'Test Shift 99',
    shiftCode: 'ST',
    startTime: '08:00',
    endTime: '16:00',
  });
  await apiClient.updateShift(testShift.shiftId, { shiftName: 'Test Shift 99 Updated' });
  await apiClient.deleteShift(testShift.shiftId);
  await apiClient.getShiftSchedulesPage();
  await apiClient.getShiftScheduleById('sched-0101-s1');
  const testSch = await apiClient.createShiftSchedule({ lineId: 'LINE-02', shiftId: 'SHIFT-1', dayOfWeek: 7 });
  await apiClient.updateShiftSchedule(testSch.scheduleId, { dayOfWeek: 6 });
  await apiClient.deleteShiftSchedule(testSch.scheduleId);

  // Work Orders (4)
  await apiClient.getWorkOrders();
  await apiClient.getWorkOrderById('WO-2026-101');
  await apiClient.resolveWorkOrder('WO-2026-101', 'STM32-OEE-01');
  const wo103 = store.workOrders.find((w) => w.wo_id === 'WO-2026-103');
  const prev103Status = wo103?.status ?? 'PENDING';
  const cancelRes = await apiClient.cancelWorkOrder('WO-2026-103', 'Contract matrix check');
  assert.equal(cancelRes.work_order.status, 'ABORTED');
  if (wo103) {
    wo103.status = prev103Status;
    delete wo103.actual_end_at;
  }

  // Monitoring & Downtime (4)
  await apiClient.getLiveState();
  await apiClient.getLiveStateByDevice('STM32-OEE-01');
  await apiClient.getActiveDowntimes();
  await apiClient.getDowntimeHistory('STM32-OEE-01');
  await apiClient.exportDowntimeData({
    device_id: 'STM32-OEE-01',
    from: weekAgoIso,
    to: nowIso,
    format: 'csv',
  });
  await apiClient.classifyDowntimeReason('dt-ev-05', 'EQUIPMENT_FAILURE', 'Contract test classification');

  // Operational Events & System Audit (6)
  await apiClient.getOperationalEventsPage({ device_id: 'ALL' });
  await apiClient.getOperationalEventsByDevice('STM32-OEE-01');
  await apiClient.exportOperationalEventsData({
    device_id: 'ALL',
    from: weekAgoIso,
    to: nowIso,
    format: 'json',
  });
  await apiClient.exportOperationalEventsData({
    device_id: 'STM32-OEE-01',
    from: weekAgoIso,
    to: nowIso,
    format: 'ndjson',
  });
  await apiClient.acknowledgeOperationalEvent('op-ev-101', 'Verified in contract test');
  await apiClient.getAuditLogs();
  // E20 P20.4 (FAT-156, O9): ekspor system-audit (guard access_control.read).
  const auditExport = await apiClient.exportSystemAuditTrailData({
    from: weekAgoIso,
    to: nowIso,
    format: 'csv',
  });
  assert.equal(auditExport.format, 'csv');
  assert.ok(auditExport.rowCount >= 0);

  // Telemetry, OEE, Quality, Reconciliation (12)
  // E12 T12.8 (F-9 / FAT-61): getTelemetryHistory (non-page) dihapus —
  // hanya dipakai contract test ini, bukan UI. Cakupan endpoint
  // TELEMETRY_HISTORY kini dibawa getTelemetryHistoryPage (jalur UI).
  await apiClient.getTelemetryHistoryPage({ device_id: 'STM32-OEE-01', limit: 10 });
  await apiClient.getHourlyTrend('STM32-OEE-01');
  await apiClient.getTelemetryAggregate('STM32-OEE-01');
  await apiClient.getTelemetryRollup({
    group_by: 'machine',
    from: weekAgoIso,
    to: nowIso,
    limit: 20,
    envelope: true,
  });
  await apiClient.exportTelemetryData({
    device_id: 'STM32-OEE-01',
    from: weekAgoIso,
    to: nowIso,
    format: 'csv',
  });
  await apiClient.exportTelemetryHourlyData({
    device_id: 'STM32-OEE-01',
    from: weekAgoIso,
    to: nowIso,
    format: 'csv',
  });
  await apiClient.getReconciliationJobs();
  await apiClient.triggerReconciliationRefresh({ startWindow: weekAgoIso, endWindow: nowIso });
  await apiClient.getShiftSummary('CNC-MILLING-01');
  await apiClient.getOeeHourly({ machine_id: 'CNC-MILLING-01' });
  await apiClient.getShiftTimeline('CNC-MILLING-01');
  await apiClient.getRejectParetoGlobal();
  await apiClient.getRejectPareto('STM32-OEE-01');

  // IAM (18)
  await apiClient.getIamInfo();
  await apiClient.getIamRoles();
  const customRole = await apiClient.createIamRole({
    name: 'TEMP_AUDITOR',
    description: 'Read-only auditor',
  });
  await apiClient.updateIamRole(customRole.id, { description: 'Updated auditor' });
  await apiClient.getIamPermissions();
  // createIamPermission diizinkan (§3.4): pasangan tanpa rute penjaga
  // → 400 INERT_PERMISSION; pasangan terjaga baru → dibuat.
  await assert.rejects(
    () =>
      apiClient.createIamPermission({
        action: 'audit_export',
        resourceType: 'telemetry',
        description: 'No guard route for this pair',
      }),
    (err: any) => err.httpStatus === 400 && err.code === 'INERT_PERMISSION'
  );
  const createdPerm = await apiClient.createIamPermission({
    action: 'read',
    resourceType: 'quality',
    description: 'Melihat analitik kualitas',
  });
  assert.equal(createdPerm.action, 'read');
  assert.equal(createdPerm.resourceType, 'quality');
  await apiClient.addIamRolePermission(customRole.id, 'perm-22', {
    resourcePattern: 'telemetry:*',
    effect: 'ALLOW',
  });
  await apiClient.removeIamRolePermission(customRole.id, 'perm-22');
  await apiClient.deleteIamRole(customRole.id);
  store.operatorPasswords.delete('ADM-001');
  await apiClient.getIamUserRoles();
  const asg = await apiClient.assignIamUserRole({
    operatorId: 'OP-115',
    roleName: 'QUALITY_AUDITOR',
    scopeType: 'MACHINE',
    scopeId: 'CNC-MILLING-01',
  });
  await apiClient.revokeIamUserRole({
    id: asg.id,
    operatorId: 'OP-115',
    roleName: 'QUALITY_AUDITOR',
    scopeType: 'MACHINE',
    scopeId: 'CNC-MILLING-01',
  });
  await apiClient.getIamPolicies();
  const pol = await apiClient.createIamPolicy({
    roleId: 'role-operator',
    permissionId: 'perm-22',
    resourcePattern: 'telemetry:LINE-01',
    effect: 'ALLOW',
  });
  await apiClient.toggleIamPolicy(pol.id, false);
  await apiClient.deleteIamPolicy(pol.id);
  await apiClient.getSubjectEffectivePermissions('OP-115');
  await apiClient.getIamAuditDecisions();

  // MQTT Overview + Dynamic Security (1 + 22 = 23)
  await apiClient.getBrokerOverview();
  await apiClient.getMqttDynamicSecurityStatus();
  await apiClient.getMqttClients();
  const createdClient = await apiClient.createMqttClient({
    username: 'test_mqtt_user',
    clientid: 'TEST_CLIENT',
    roles: ['edge_publisher'],
    groups: ['machining_floor'],
  });
  assert.ok(createdClient.generatedPassword, 'createMqttClient without password returns one-time generatedPassword');
  await apiClient.getMqttClient('test_mqtt_user');
  await apiClient.toggleMqttClient('test_mqtt_user', false);
  await apiClient.rotateMqttClientPassword('test_mqtt_user', 'NewMqttPass123!');
  await apiClient.addMqttClientRole('test_mqtt_user', 'telemetry_sender');
  await apiClient.removeMqttClientRole('test_mqtt_user', 'telemetry_sender');
  await apiClient.deleteMqttClient('test_mqtt_user');
  await apiClient.getMqttRoles();
  await apiClient.createMqttRole({
    rolename: 'test_mqtt_role',
    acls: [{ acltype: 'publishClientSend', topic: 'test/#', allow: true }],
  });
  await apiClient.getMqttRole('test_mqtt_role');
  await apiClient.addMqttRoleAcl('test_mqtt_role', { acltype: 'subscribePattern', topic: 'test/ack/#', allow: true });
  await apiClient.removeMqttRoleAcl('test_mqtt_role', 'subscribePattern', 'test/ack/#');
  await apiClient.getMqttGroups();
  await apiClient.createMqttGroup({
    groupname: 'test_mqtt_group',
    roles: ['edge_publisher'],
    clients: [],
  });
  await apiClient.getMqttGroup('test_mqtt_group');
  await apiClient.addMqttGroupClient('test_mqtt_group', 'test_mqtt_user');
  await apiClient.removeMqttGroupClient('test_mqtt_group', 'test_mqtt_user');
  await apiClient.addMqttGroupRole('test_mqtt_group', 'test_mqtt_role');
  await apiClient.removeMqttGroupRole('test_mqtt_group', 'test_mqtt_role');
  await apiClient.deleteMqttGroup('test_mqtt_group');
  await apiClient.deleteMqttRole('test_mqtt_role');
  await apiClient.deleteMqttClient('test_mqtt_user');

  // MQTT Configuration Manager (13)
  const cfg = await apiClient.getBrokerConfig();
  await apiClient.getBrokerConfigRaw();
  await apiClient.getBrokerConfigStatus();
  const staged = await apiClient.stageBrokerConfig(cfg, 'Test staging');
  await apiClient.getBrokerConfigVersions();
  await apiClient.getBrokerConfigVersion(staged.version_id);
  await apiClient.getBrokerConfigDiff(staged.version_id);
  const applyRes = await apiClient.applyBrokerConfigVersion(staged.version_id, {
    confirm: true,
    reason: 'Contract verification apply',
  });
  assert.ok(applyRes.version.version_id && applyRes.operation.operation_id);

  const rbRes = await apiClient.rollbackBrokerConfig('cfg-v2.0.18-rel-3', {
    confirm: true,
    reason: 'Contract verification rollback',
  });
  assert.ok(rbRes.version.version_id && rbRes.operation.operation_id);

  const disposableStage = await apiClient.stageBrokerConfig(cfg, 'Disposable stage');
  await apiClient.deleteBrokerConfigVersion(disposableStage.version_id);
  const ops = await apiClient.getBrokerConfigOperations();
  await apiClient.getBrokerConfigOperation(ops[0].operation_id);
  await apiClient.getBrokerConfigBackups();

  // Check 100% ADMIN_ENDPOINTS catalog coverage
  const called = new Set(apiClient.getCalledEndpointKeys());
  const allKeys = Object.keys(ADMIN_ENDPOINTS) as AdminEndpointKey[];
  const missing = allKeys.filter((k) => !called.has(k));
  assert.deepEqual(missing, [], `Uncovered ADMIN_ENDPOINTS keys: ${missing.join(', ')}`);

  // Restore active baseline config
  await apiClient.rollbackBrokerConfig('cfg-v2.0.18-rel-4', { confirm: true, reason: 'Restore baseline' });
  assert.equal(store.iamRoles.length > 0, true);
});
