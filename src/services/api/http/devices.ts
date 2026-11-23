/**
 * Method HTTP — domain devices.
 *
 * Dipisah dari file god-file pada refactoring R9 (kontrak docs/DIRECTORY_STRUCTURE.md).
 * Satu file = satu domain. Barrel penggabung ada di file induknya.
 */
import { MUTATION_TIMEOUT_MS, assertLanForMutation, assertAuthenticatedHttp, reqJson, reqAllPages, checkAbortHttp } from './transport';
import { mapDevice, mapDeviceHealth } from './mappers';
import { ADMIN_ENDPOINTS } from '../endpoints';
import { EdgeDevice, DeviceHealth, DeviceCredential, ProvisionDeviceResult, RotateDeviceCredentialsResult } from '../../../types/assets';
import { invalidResponse } from './primitives';

/**
 * E20 P20.2 (§E.3a/3c): kredensial sekali tampil dari respons provision/rotasi.
 * Diparse di sini dan diteruskan apa adanya ke modal sekali-tampil — TIDAK
 * disimpan di store/state persisten dan TIDAK di-log.
 */
function parseDeviceCredential(raw: unknown): DeviceCredential {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = (r.credential ?? {}) as Record<string, unknown>;
  const credential: DeviceCredential = {
    username: typeof c.username === 'string' ? c.username : '',
    password: typeof c.password === 'string' ? c.password : '',
    clientId: typeof c.clientId === 'string' ? c.clientId : '',
    topicPrefix: typeof c.topicPrefix === 'string' ? c.topicPrefix : '',
  };
  if (!credential.username || !credential.password) {
    throw invalidResponse('Respons provision/rotasi tidak memuat kredensial sekali tampil.');
  }
  return credential;
}

/**
 * FAT-309: pemetaan SATU baris daftar devices yang toleran terhadap stasiun.
 *
 * Server mengirim stasiun (STATION-/KIOSK-/ADMIN-, mis. ADMIN-CONSOLE-01)
 * sebagai baris devices biasa, tetapi EdgeDeviceSchema menolak device_id
 * non-STM32 — satu baris stasiun membuat mapDevice() melempar
 * INVALID_RESPONSE untuk SELURUH daftar (live 2026-11-23: /admin/devices
 * 0 perangkat + useMasterAssetsQuery gagal → Analytics ringkasan/timeline/
 * Per Jam gagal muat). Baris non-STM32 dilewati di sini (return null,
 * dibuang reqList) — BUKAN error: stasiun dilayani getStations/mapStation
 * di halaman Stations. Regex sama dengan EdgeDeviceSchema
 * (schemas/dto-assets.ts) supaya kedua tempat tidak bisa menyimpang.
 */
const STM32_DEVICE_ID = /^STM32-[A-Za-z0-9_-]+$/;

export function mapEdgeDeviceRow(raw: unknown): EdgeDevice | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = r.deviceId ?? r.device_id;
  if (typeof id !== 'string' || !STM32_DEVICE_ID.test(id)) return null;
  return mapDevice(raw);
}

export const httpDevices = {
  // -- Devices (9 ops; command HMI-only — tidak ada di sini) ---------------
  async getDevices(signal?: AbortSignal): Promise<EdgeDevice[]> {
    checkAbortHttp(signal);
    return reqAllPages(ADMIN_ENDPOINTS.DEVICES_LIST.buildPath(), mapEdgeDeviceRow, signal, 'DEVICES_LIST');
  },

  async getDeviceById(deviceId: string, signal?: AbortSignal): Promise<EdgeDevice> {
    checkAbortHttp(signal);
    return reqJson(
      { path: ADMIN_ENDPOINTS.DEVICES_GET.buildPath(deviceId), signal, endpointKey: 'DEVICES_GET', capability: 'device.read', resourceId: deviceId },
      mapDevice,
    );
  },

  async getDeviceHealth(deviceId: string, signal?: AbortSignal): Promise<DeviceHealth> {
    checkAbortHttp(signal);
    return reqJson(
      { path: ADMIN_ENDPOINTS.DEVICES_HEALTH.buildPath(deviceId), signal, endpointKey: 'DEVICES_HEALTH', capability: 'device.read', resourceId: deviceId },
      mapDeviceHealth,
    );
  },

  // E23 Batch 4 (FAT-206, N-37): spec live POST /devices body =
  // {deviceId*, macAddress?, ipAddress?, firmwareVersion?} — TIDAK ada
  // `model`/`serial_number`, dan `macAddress` OPSIONAL. Tipe input lama
  // menerima model/serial (lalu dibuang diam-diam transport) dan
  // mewajibkan mac_address. Kini: tanpa model/serial; mac dikirim hanya
  // bila diisi.
  async registerDevice(data: {
    device_id: string;
    mac_address?: string;
    ip_address?: string | null;
    firmware_version?: string | null;
  }): Promise<EdgeDevice> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    return reqJson(
      {
        method: 'POST',
        path: ADMIN_ENDPOINTS.DEVICES_CREATE.buildPath(),
        body: {
          deviceId: data.device_id.trim(),
          ...(data.mac_address?.trim() ? { macAddress: data.mac_address.trim() } : {}),
          ...(data.ip_address ? { ipAddress: data.ip_address.trim() } : {}),
          ...(data.firmware_version ? { firmwareVersion: data.firmware_version.trim() } : {}),
        },
        timeoutMs: MUTATION_TIMEOUT_MS,
        retry: false,
        endpointKey: 'DEVICES_CREATE',
        capability: 'device.manage',
        resourceId: data.device_id,
      },
      mapDevice,
    );
  },

  /**
   * E20 P20.2 (§E.3a, spec 015): alur kanonis menambah perangkat — satu aksi
   * membuat identitas broker + baris registry PROVISIONED; password dibuat
   * backend dan hanya dikembalikan sekali. Guard 409: DEVICE_ALREADY_REGISTERED
   * / DEVICE_ID_HAS_HISTORY / MACHINE_ALREADY_BOUND / MQTT_CLIENT_EXISTS;
   * 500 PROVISION_ROLLED_BACK; 502 MQTT_PROVISION_FAILED; 503 MQTT_UNAVAILABLE.
   */
  async provisionDevice(data: {
    deviceId: string;
    machineId?: string;
    model?: string;
  }): Promise<ProvisionDeviceResult> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    const raw = await reqJson<Record<string, unknown>>({
      method: 'POST',
      path: ADMIN_ENDPOINTS.DEVICES_PROVISION.buildPath(),
      body: {
        deviceId: data.deviceId.trim(),
        ...(data.machineId ? { machineId: data.machineId.trim() } : {}),
        ...(data.model ? { model: data.model.trim() } : {}),
      },
      timeoutMs: MUTATION_TIMEOUT_MS,
      retry: false,
      endpointKey: 'DEVICES_PROVISION',
      capability: 'device.manage',
      resourceId: data.deviceId,
    });
    return { device: mapDevice(raw), credential: parseDeviceCredential(raw) };
  },

  /**
   * E20 P20.2 (§E.3b): cabut kredensial — selalu diizinkan, termasuk saat WO
   * ACTIVE. Body {reason} 1..200 wajib. 409 DEVICE_ALREADY_REVOKED.
   */
  async revokeDevice(deviceId: string, reason: string): Promise<EdgeDevice> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    const raw = await reqJson<Record<string, unknown>>({
      method: 'POST',
      path: ADMIN_ENDPOINTS.DEVICES_REVOKE.buildPath(deviceId),
      body: { reason },
      timeoutMs: MUTATION_TIMEOUT_MS,
      retry: false,
      endpointKey: 'DEVICES_REVOKE',
      capability: 'device.manage',
      resourceId: deviceId,
    });
    const deviceRaw = (raw as Record<string, unknown>).device ?? raw;
    return mapDevice(deviceRaw);
  },

  /**
   * E20 P20.2 (§E.3c): rotasi kredensial — password baru sekali tampil.
   * Guard produksi: device online + WO ACTIVE tanpa force:true → 409
   * DEVICE_IN_PRODUCTION; device REVOKED → 409 DEVICE_REVOKED.
   */
  async rotateDeviceCredentials(
    deviceId: string,
    input: { force: boolean; reason: string },
  ): Promise<RotateDeviceCredentialsResult> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    const raw = await reqJson<Record<string, unknown>>({
      method: 'POST',
      path: ADMIN_ENDPOINTS.DEVICES_CREDENTIALS.buildPath(deviceId),
      body: { force: input.force, reason: input.reason },
      timeoutMs: MUTATION_TIMEOUT_MS,
      retry: false,
      endpointKey: 'DEVICES_CREDENTIALS',
      capability: 'device.manage',
      resourceId: deviceId,
    });
    return {
      credential: parseDeviceCredential(raw),
      forced: (raw as Record<string, unknown>).forced === true,
    };
  },

  async updateDevice(
    deviceId: string,
    patch: { ip_address?: string | null; firmware_version?: string | null },
  ): Promise<EdgeDevice> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    return reqJson(
      {
        method: 'PUT',
        path: ADMIN_ENDPOINTS.DEVICES_UPDATE.buildPath(deviceId),
        body: {
          // E23 Batch 2 (FAT-184, N-15): spec live PUT /devices —
          // `ipAddress` harus string ipv4|ipv6 bila ada, `firmwareVersion`
          // string bila ada; `null` TIDAK diizinkan untuk keduanya.
          // Field yang dikosongkan DI-OMIT (bukan dikirim null) — server
          // mempertahankan nilai lama; kirim null → 400 VALIDATION_ERROR.
          ...(patch.ip_address?.trim() ? { ipAddress: patch.ip_address.trim() } : {}),
          ...(patch.firmware_version?.trim() ? { firmwareVersion: patch.firmware_version.trim() } : {}),
        },
        timeoutMs: MUTATION_TIMEOUT_MS,
        retry: false,
        endpointKey: 'DEVICES_UPDATE',
        capability: 'device.manage',
        resourceId: deviceId,
      },
      mapDevice,
    );
  },

  async deleteDevice(deviceId: string): Promise<{ success: boolean }> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    const raw = await reqJson<{ success?: boolean; message?: string } | undefined>({
      method: 'DELETE',
      path: ADMIN_ENDPOINTS.DEVICES_DELETE.buildPath(deviceId),
      timeoutMs: MUTATION_TIMEOUT_MS,
      retry: false,
      endpointKey: 'DEVICES_DELETE',
      capability: 'device.manage',
      resourceId: deviceId,
    });
    return { success: raw?.success ?? true };
  }
};
