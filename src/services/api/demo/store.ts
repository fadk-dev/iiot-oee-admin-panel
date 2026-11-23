/**
 * Store in-memory demo (MemoryStore + singleton store).
 *
 * Dipisah dari file god-file pada refactoring R9 (kontrak docs/DIRECTORY_STRUCTURE.md).
 * Satu file = satu domain. Barrel penggabung ada di file induknya.
 */
import { AuthClientHooks } from './helpers';
import { INITIAL_MACHINES, INITIAL_DEVICES, INITIAL_DEVICE_HEALTH_OVERRIDES, INITIAL_PRODUCTS, INITIAL_OPERATORS, INITIAL_WORK_ORDERS, INITIAL_LIVE_STATES, INITIAL_DOWNTIME_EVENTS, INITIAL_OPERATIONAL_EVENTS, INITIAL_AUDIT_TRAIL, INITIAL_MQTT_CLIENTS, INITIAL_MQTT_ROLES, INITIAL_MQTT_GROUPS, INITIAL_BROKER_CONFIG, INITIAL_CONFIG_VERSIONS, INITIAL_BROKER_OPERATIONS, INITIAL_BROKER_BACKUPS, INITIAL_SYSTEM_HEALTH, INITIAL_HEALTH_DETAIL, INITIAL_IAM_ROLES, INITIAL_IAM_PERMISSIONS, INITIAL_IAM_ASSIGNMENTS, INITIAL_IAM_POLICIES, INITIAL_IAM_AUDIT_DECISIONS, INITIAL_PRODUCTION_LINES, INITIAL_SHIFTS, INITIAL_SHIFT_SCHEDULES } from '../mockData';
import { AdminEndpointKey, FORBIDDEN_ENDPOINT_PATTERNS, isValidEndpointPrefix } from '../endpoints';
import { OperationalEvent } from '../../../types/monitoring';
import { AuditTrailRecord } from '../../../types/system';
import { BrokerConfigSchema, BrokerOperation, BrokerBackup } from '../../../types/mqtt';
import { IamInfo } from '../../../types/iam';
import { UserRole, NetworkAccessMode, ApiError } from '../../../types/auth';

/**
 * E20 P20.4 (FAT-156): petakan aksi internal demo ke nilai enum `event_type`
 * kanonis FR-034-26/27 (API doc §I). Demo-only — backend sungguhan yang
 * menentukan nilai ini.
 */
function mapDemoAuditActionToEventType(action: string): OperationalEvent['event_type'] {
  switch (action) {
    case 'MACHINE_BOUND':
    case 'MACHINE_UNBOUND':
    case 'PRODUCT_DELETED':
    case 'WORK_ORDER_CANCELLED':
      return action;
    case 'PASSWORD_CHANGED':
    case 'ROTATE_OPERATOR_PASSWORD':
      return 'OPERATOR_PASSWORD_ROTATED';
    case 'CREATE_OPERATOR':
      return 'OPERATOR_PROVISIONED';
    case 'DELETE_OPERATOR':
      return 'OPERATOR_DELETED';
    case 'UPDATE_OPERATOR':
    case 'UPDATE_OPERATOR_STATUS':
      return 'OPERATOR_UPDATED';
    case 'PROVISION_DEVICE':
    case 'REGISTER_DEVICE':
      return 'DEVICE_PROVISIONED';
    case 'REVOKE_DEVICE':
    case 'DELETE_DEVICE':
      return 'DEVICE_REVOKED';
    case 'ROTATE_DEVICE_CREDENTIALS':
      return 'DEVICE_CREDENTIAL_ROTATED';
    case 'BROKER_CONFIG_APPLIED':
      return 'MOSQUITTO_CONFIG_APPLIED';
    case 'BROKER_CONFIG_ROLLBACK':
      return 'MOSQUITTO_CONFIG_ROLLED_BACK';
    case 'ACK_EVENT':
      return 'OPERATIONAL_EVENT_ACKNOWLEDGED';
    default:
      // Aksi admin MQTT (`MQTT_CLIENT_CREATED`, `MQTT_ROLE_ACL_ADDED`, …)
      // → pola MQTT_ADMIN_<op>; sisanya mutasi master data.
      if (action.startsWith('MQTT_')) {
        return `MQTT_ADMIN_${action.slice('MQTT_'.length)}`;
      }
      return 'MASTER_DATA_MUTATION';
  }
}

class MemoryStore {
  machines = [...INITIAL_MACHINES];
  devices = [...INITIAL_DEVICES];
  /** E20 P20.2 (§E.3a): deviceId yang pernah terdaftar lalu dihapus — provision
   * ulang id ini ditolak 409 DEVICE_ID_HAS_HISTORY agar data lama tidak tercampur. */
  deviceHistoryIds = new Set<string>();
  deviceHealthOverrides = { ...INITIAL_DEVICE_HEALTH_OVERRIDES };
  products = [...INITIAL_PRODUCTS];
  operators = [...INITIAL_OPERATORS];
  productionLines = [...INITIAL_PRODUCTION_LINES];
  shifts = [...INITIAL_SHIFTS];
  shiftSchedules = [...INITIAL_SHIFT_SCHEDULES];
  workOrders = [...INITIAL_WORK_ORDERS];
  liveStates = [...INITIAL_LIVE_STATES];
  downtimes = [...INITIAL_DOWNTIME_EVENTS];
  operationalEvents = [...INITIAL_OPERATIONAL_EVENTS];
  /**
   * P33.4 (FAT-294, B33.2): store audit demo TERPISAH dari
   * `operationalEvents` — cermin `GET /system/audit-trail` (append-only).
   * `addAudit` menulis ke kedua store: feed operasional (kompatibilitas
   * tampilan lama) + arsip ini (satu entri per mutasi, `seq` naik).
   */
  auditTrail: AuditTrailRecord[] = [...INITIAL_AUDIT_TRAIL];
  mqttClients = [...INITIAL_MQTT_CLIENTS];
  mqttRoles = [...INITIAL_MQTT_ROLES];
  mqttGroups = [...INITIAL_MQTT_GROUPS];
  brokerConfig = JSON.parse(JSON.stringify(INITIAL_BROKER_CONFIG)) as BrokerConfigSchema;
  configVersions = [...INITIAL_CONFIG_VERSIONS];
  brokerOperations: BrokerOperation[] = [...INITIAL_BROKER_OPERATIONS];
  brokerBackups: BrokerBackup[] = [...INITIAL_BROKER_BACKUPS];
  systemHealth = { ...INITIAL_SYSTEM_HEALTH };
  healthDetail = JSON.parse(JSON.stringify(INITIAL_HEALTH_DETAIL)) as typeof INITIAL_HEALTH_DETAIL;

  iamInfo: IamInfo = {
    mode: 'enforce',
    authzVersion: 7,
    effectiveInMode: 'ABAC + Scope Enforcement Active',
    // E23 Batch 4 (FAT-205, N-36): `catalogueVersion` wajib di spec live.
    catalogueVersion: '1.0.0',
    enforcedDomains: ['work_orders', 'operators', 'assets', 'mqtt', 'access_control', 'audit'],
  };
  iamRoles = [...INITIAL_IAM_ROLES];
  iamPermissions = [...INITIAL_IAM_PERMISSIONS];
  iamAssignments = [...INITIAL_IAM_ASSIGNMENTS];
  iamPolicies = [...INITIAL_IAM_POLICIES];
  iamAuditDecisions = [...INITIAL_IAM_AUDIT_DECISIONS];
  operatorPasswords = new Map<string, string>();

  currentUserId = 'ADM-001';
  currentUserName = 'Alexandria Vance';
  currentUserRole: UserRole = 'ADMIN';
  currentUserLineId = 'ORG-ALL';
  networkAccessMode: NetworkAccessMode = 'LAN';
  authToken: string | null = 'mem_jwt_initial_admin_lan';
  isAuthenticated = true;
  tokenAuthzVersion = 7;

  /**
   * Spec 043 (§L) — operator dengan password sementara yang wajib diganti.
   * Di-seed dengan MNT-208 (Elena Rostova, MAINTENANCE); di-clear oleh
   * demo `changePassword`. Gerbang ditegakkan `assertAuthenticated`.
   */
  operatorMustChangePassword = new Set<string>(['MNT-208']);

  endpointCalls = new Map<AdminEndpointKey, string[]>();
  reconciliationCallTimestamps: number[] = [];
  exportCallTimestamps = new Map<string, number[]>();
  hooks: AuthClientHooks = {};

  assertExportRateLimit(endpointKey: string) {
    const now = Date.now();
    const recent = (this.exportCallTimestamps.get(endpointKey) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 5) {
      throw new ApiError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Batas ekspor 5 permintaan/menit tercapai. Tunggu hingga hitung mundur selesai.',
        httpStatus: 429,
      });
    }
    recent.push(now);
    this.exportCallTimestamps.set(endpointKey, recent);
  }

  recordEndpoint(key: AdminEndpointKey, resolvedPath: string) {
    const clean = resolvedPath.split('?')[0];
    if (!isValidEndpointPrefix(clean)) {
      throw new ApiError({
        code: 'CONTRACT_VIOLATION',
        message: `Invalid endpoint prefix "${resolvedPath}"`,
        httpStatus: 400,
      });
    }
    for (const forbidden of FORBIDDEN_ENDPOINT_PATTERNS) {
      if (clean.includes(forbidden)) {
        throw new ApiError({
          code: 'CONTRACT_VIOLATION',
          message: `Forbidden HMI or legacy endpoint "${resolvedPath}"`,
          httpStatus: 403,
        });
      }
    }
    const existing = this.endpointCalls.get(key) || [];
    existing.push(resolvedPath);
    this.endpointCalls.set(key, existing);
  }

  /**
   * E20 P20.4 (FAT-156): entri audit demo = `OperationalEventItem` FR-034-01
   * (API doc §I) — tanpa field karangan. Aksi internal demo (mis.
   * 'CREATE_MACHINE', 'MQTT_CLIENT_CREATED') dipetakan ke nilai enum
   * kanonis terdekat; yang tidak punya padanan → 'MASTER_DATA_MUTATION'.
   * `resource_type`/`resource_id` pemanggil dipertahankan di tanda tangan
   * demi kompatibilitas, tapi TIDAK disimpan (tidak ada di FR-034-01).
   * Catatan: mutasi IAM di sini hanya jejak demo — feed kanonisnya adalah
   * `/access-control/audit`, bukan `/system/audit` (O12).
   *
   * P33.3 (FAT-293): satu sumber seperti live — entri audit demo kini
   * ditulis ke `operationalEvents` (dulu `auditLogs` terpisah, dihapus);
   * `/system/audit` dan `/operational-events` membaca store yang sama.
   */
  addAudit(
    action: string,
    resource_type: string,
    resource_id: string,
    details: string,
    extras?: { device_id?: string | null; machine_id?: string | null; machine_name?: string | null; wo_id?: string | null }
  ) {
    void resource_type;
    const now = new Date().toISOString();
    const eventType = mapDemoAuditActionToEventType(action);
    this.operationalEvents.unshift({
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      recorded_at: now,
      device_id: extras?.device_id ?? null,
      station_label: null,
      machine_id: extras?.machine_id ?? null,
      machine_name: extras?.machine_name ?? null,
      wo_id: extras?.wo_id ?? null,
      event_type: eventType,
      // P33.4 (FAT-294): feed operasional memakai keluarga tabel §1 —
      // aksi audit demo adalah keluarga sistem (kecuali yang operasional).
      category: eventType === 'WORK_ORDER_CANCELLED' ? 'operational' : 'system',
      alarm_state: 'active-unack',
      condition: 'NORMAL',
      trigger_source: 'ADMIN_PANEL',
      event_code: null,
      snapshot_total_count: null,
      snapshot_run_sec: null,
      description: details,
      acknowledged: false,
      acknowledged_at: null,
      acknowledged_by: null,
      ack_note: null,
      created_at: now,
    });
    // P33.4 (FAT-294, B33.2/B33.3): mutasi yang sama menulis SATU entri ke
    // arsip audit terpisah — cermin backend (ack → entri
    // OPERATIONAL_EVENT_ACKNOWLEDGED). `seq` monoton naik; `old_value` /
    // `new_value` null — demo tidak melacak nilai sebelum/sesudah per
    // mutasi (jujur: null, bukan karangan); `reason` = deskripsi aksi.
    this.auditTrail.unshift({
      id: `aud-trail-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      seq: (this.auditTrail[0]?.seq ?? 0) + 1,
      recorded_at: now,
      actor: this.currentUserId,
      actor_role: this.currentUserRole,
      action: eventType,
      category: 'system',
      entity_type: resource_type,
      entity_id: resource_id,
      entity_label: resource_id,
      old_value: null,
      new_value: null,
      reason: details,
      source: 'panel',
      prev_hash: null,
      hash: null,
    });
  }

  /**
   * E20 P20.4 (FAT-156): entri operational-event demo = FR-034-01 — tanpa
   * `severity` (tidak ada di dokumen), `machine_name` null bila tak ada
   * (bukan 'Plant System').
   */
  addOperationalEvent(
    event_type: OperationalEvent['event_type'],
    description: string,
    extras?: { device_id?: string | null; machine_id?: string | null; machine_name?: string | null; wo_id?: string | null }
  ) {
    const now = new Date().toISOString();
    this.operationalEvents.unshift({
      id: `op-ev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      recorded_at: now,
      device_id: extras?.device_id ?? null,
      station_label: null,
      machine_id: extras?.machine_id ?? null,
      machine_name: extras?.machine_name ?? null,
      wo_id: extras?.wo_id ?? null,
      event_type,
      // P33.4 (FAT-294): kategori dari tabel §1 (pola DEVICE_EVENT_* =
      // operasional; selainnya ikut `eventCategory` — di sini dihitung
      // inline supaya store tidak mengimpor fitur monitoring).
      category: event_type.startsWith('DEVICE_EVENT_') ||
        ['DEVICE_OFFLINE', 'DEVICE_ONLINE', 'MACHINE_BOUND', 'MACHINE_UNBOUND', 'WORK_ORDER_COMPLETED', 'WORK_ORDER_CANCELLED'].includes(event_type)
        ? 'operational'
        : 'system',
      alarm_state: 'active-unack',
      condition: event_type === 'DEVICE_OFFLINE' ? 'ACTIVE' : 'NORMAL',
      trigger_source: 'ADMIN_PANEL',
      event_code: null,
      snapshot_total_count: null,
      snapshot_run_sec: null,
      description,
      acknowledged: false,
      acknowledged_at: null,
      acknowledged_by: null,
      ack_note: null,
      created_at: now,
    });
  }

  addAuthzDecision(decision: 'ALLOW' | 'DENY', action: string, resource: string, reason?: string) {
    this.iamAuditDecisions.unshift({
      id: `dec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      subject: this.currentUserId,
      decision,
      mode: this.iamInfo.mode === 'shadow' ? 'shadow' : 'enforce',
      action,
      resource,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  private assetTxChain: Promise<void> = Promise.resolve();

  /**
   * Serializes asset/binding mutations and restores snapshots on error so concurrent
   * operations or mid-flight failures can never leave partial state or violate 1:1 binding.
   */
  runAssetTransaction<T>(fn: () => T): Promise<T> {
    const run = this.assetTxChain.then(() => {
      const snapshot = {
        machines: this.machines.map((m) => ({ ...m })),
        devices: this.devices.map((d) => ({ ...d })),
        deviceHistoryIds: new Set(this.deviceHistoryIds),
        liveStates: this.liveStates.map((l) => ({ ...l })),
        workOrders: this.workOrders.map((w) => ({ ...w })),
        downtimes: this.downtimes.map((dt) => ({ ...dt })),
        operationalEvents: this.operationalEvents.map((ev) => ({ ...ev })),
        auditTrail: this.auditTrail.map((a) => ({ ...a })),
      };
      try {
        return fn();
      } catch (err) {
        this.machines = snapshot.machines;
        this.devices = snapshot.devices;
        this.deviceHistoryIds = snapshot.deviceHistoryIds;
        this.liveStates = snapshot.liveStates;
        this.workOrders = snapshot.workOrders;
        this.downtimes = snapshot.downtimes;
        this.operationalEvents = snapshot.operationalEvents;
        this.auditTrail = snapshot.auditTrail;
        throw err;
      }
    });
    this.assetTxChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

export const store = new MemoryStore();
