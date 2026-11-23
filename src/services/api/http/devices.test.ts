/**
 * FAT-309 — getDevices toleran terhadap baris stasiun di daftar devices.
 *
 * Regresi live 2026-11-23: server mengirim stasiun (ADMIN-CONSOLE-01,
 * terdaftar 10:12 WIB) sebagai baris devices biasa; EdgeDeviceSchema menolak
 * device_id non-STM32 sehingga mapDevice() melempar INVALID_RESPONSE untuk
 * SELURUH daftar — /admin/devices 0 perangkat + useMasterAssetsQuery gagal
 * → Analytics ringkasan/timeline/Per Jam gagal muat. Perbaikan: getDevices
 * melewati baris non-STM32 (bukan error); stasiun dilayani getStations.
 *
 * Client HTTP asli + stub server lokal (pola auth.test.ts). Port segar per
 * tes — pelajaran FAT-280: reuse port → galat NETWORK palsu dari koneksi
 * keep-alive mati.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpApiClient } from '../httpClient';
import { clearStoredHttpToken, clearStoredRefreshToken, setHttpToken, setRefreshToken } from './transport';

// --- Stub sessionStorage (Node tidak punya) ---------------------------------
const storageMap = new Map<string, string>();
const storageStub = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storageMap.set(k, v);
  },
  removeItem: (k: string) => {
    storageMap.delete(k);
  },
  clear: () => storageMap.clear(),
  get length() {
    return storageMap.size;
  },
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
};
(globalThis as { sessionStorage?: unknown }).sessionStorage = storageStub;

function resetState(): void {
  setHttpToken(null);
  setRefreshToken(null);
  clearStoredHttpToken();
  clearStoredRefreshToken();
  storageMap.clear();
}

// --- Stub server ------------------------------------------------------------
// Baris devices yang dikembalikan GET /api/v1/devices (diatur per tes).
let stubDeviceRows: Array<Record<string, unknown>> = [];

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' });
  res.end(JSON.stringify(body));
}

async function withStubServer(fn: () => Promise<void>, port: number): Promise<void> {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/v1/auth/admin/login') {
      sendJson(res, 200, {
        success: true,
        token: 'access-1',
        expires_in: 900,
        operator: { id: 'ADM-001', username: 'Admin', role: 'ADMIN' },
      });
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/v1/devices')) {
      sendJson(res, 200, stubDeviceRows);
      return;
    }
    sendJson(res, 404, { error: 'NOT_FOUND', message: 'Not found' });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const prevApiUrl = process.env.VITE_API_URL;
  try {
    process.env.VITE_API_URL = `http://127.0.0.1:${port}`;
    await fn();
  } finally {
    httpApiClient.setSessionActive(false, null);
    if (prevApiUrl === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = prevApiUrl;
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
}

function edgeRow(device_id: string, mac_address: string): Record<string, unknown> {
  return { device_id, mac_address, ip_address: null, firmware_version: '1.0', online: true, last_seen: '2026-11-23T03:00:00.000Z', bound_machine_id: null, created_at: '2026-11-23T03:00:00.000Z' };
}

function stationRow(device_id: string): Record<string, unknown> {
  return { device_id, mac_address: '', ip_address: null, firmware_version: null, online: false, last_seen: null, bound_machine_id: null, created_at: '2026-11-23T03:12:00.000Z' };
}

test('FAT-309: daftar campuran STM32 + stasiun → getDevices kembalikan hanya STM32, tanpa throw', async () => {
  await withStubServer(async () => {
    resetState();
    await httpApiClient.login('ADM-001', 'secret');
    stubDeviceRows = [
      edgeRow('STM32-OEE-01', 'AA:BB:CC:00:00:01'),
      stationRow('ADMIN-CONSOLE-01'),
      stationRow('STATION-LINI-01'),
      edgeRow('STM32-OEE-02', 'AA:BB:CC:00:00:02'),
    ];
    const devices = await httpApiClient.getDevices();
    assert.deepEqual(devices.map((d) => d.device_id), ['STM32-OEE-01', 'STM32-OEE-02']);
  }, 3071);
});

test('FAT-309: daftar hanya stasiun → getDevices kembalikan [] (bukan INVALID_RESPONSE)', async () => {
  await withStubServer(async () => {
    resetState();
    await httpApiClient.login('ADM-001', 'secret');
    stubDeviceRows = [stationRow('ADMIN-CONSOLE-01'), stationRow('KIOSK-LINI-02')];
    const devices = await httpApiClient.getDevices();
    assert.deepEqual(devices, []);
  }, 3072);
});
