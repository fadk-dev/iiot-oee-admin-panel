# IIoT OEE Backend API Documentation

> **Catatan 19 Nov 2026 (E20):** salinan ini adalah API docs **lama**
> (sebelum backend upgrade). Sumber kebenaran kini API docs terupdate
> (`~/workspace/user/files/pasted-text.txt`) — diff panel vs api_docs di
> `docs/API_SYNC_DIFF.md`, diff yang perlu ditinjau kembali di
> `docs/API_SYNC_REVIEW.md`. Satu perbedaan yang diketahui: namespace WS di
> salinan ini masih menyebut `DOWNTIME_STARTED|DOWNTIME_ENDED` (baris 1578);
> bentuk kanonis baru `DOWNTIME_EVENT_OPENED|DOWNTIME_EVENT_CLOSED`.
>
> **Adendum 23 Nov 2026 (E33, Opsi 3 — arsitektur 3 store, ADR
> `docs/ADR-E33-three-store-architecture.md`):** kontrak baru yang TIDAK ada
> di salinan lama ini — `GET /system/audit-trail` (store audit append-only
> terpisah); param `category` (`operational`|`system`) + field `category` /
> `alarmState` / `condition` dan pagination `counts`/`totalCount` pada
> `GET /operational-events`; `auditEntry` pada respons `PATCH
> /operational-events/{id}/ack`; `timestamp` ISO + param `cursor`/`limit` +
> pagination `totalCount` pada `GET /access-control/audit`. Sumber kebenaran
> kontrak ini: OpenAPI live 2026-11-23
> (`~/workspace/oee-live-openapi-2026-11-23.json`) dan
> `docs/BACKEND_REQUIREMENTS_E33_PAGES.md`. `/system/audit` tetap alias lama
> (deprecated di sisi panel setelah P33.4). Enum event tetap 32 nilai.

**Fastify 5.x Ingestion Daemon, MQTT Engine & Real-time WebSocket Relay**

Dokumentasi teknis resmi untuk seluruh endpoint REST API dan koneksi WebSocket pada sistem **IIoT OEE (Overall Equipment Effectiveness)**.

---

## 1. Informasi Akses & Arsitektur Jaringan

Sistem IIoT OEE menerapkan arsitektur segmentasi perimeter ganda (_Dual-Vhost Partitioning_) untuk memisahkan operasional pabrik lokal dengan pemantauan jarak jauh via internet:

| Layanan                          | Protokol / Port                  | Alamat Basis                                              | Keterangan & Batas Perimeter                                                                                                                                                                  |
| :------------------------------- | :------------------------------- | :-------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local Factory LAN Gateway**    | HTTP / Port `80`                 | `http://localhost/`                                       | Pintu masuk utama lokal untuk Browser HMI, Web Andon, REST API penuh, & eksekusi kontrol mesin.                                                                                               |
| **Remote Tunnel Ingress**        | HTTP / Port `8080`               | `http://localhost:8080/`                                  | Pintu masuk terowongan Cloudflare Tunnel (`oee-monitor.example.com`). **Strictly Read-Only** (GET/OPTIONS). Aktuasi mesin diblokir (403), mutasi diblokir (403), `/docs` disembunyikan (404). |
| **Fastify Direct Daemon**        | HTTP / Port `3001`               | `http://localhost:3001/`                                  | Akses langsung ke backend ingestion daemon (internal Docker).                                                                                                                                 |
| **Interactive Docs (Scalar UI)** | HTTP / Port `3001` & `80`        | `http://localhost:3001/docs` atau `http://localhost/docs` | Antarmuka interaktif OpenAPI 3.1 Scalar (Hanya dapat diakses di Local LAN; di-shield 404 dari Remote Tunnel).                                                                                 |
| **OpenAPI Spec (JSON)**          | HTTP / Port `3001` & `80`        | `http://localhost:3001/docs/openapi.json`                 | Definisi OpenAPI 3.1 JSON mentah (terproteksi di perimeter tunnel).                                                                                                                           |
| **Real-time WebSocket Relay**    | WS / Port `80`, `8080`, & `3001` | `ws://localhost/ws/telemetry`                             | Hot-path decoupled live stream telemetri (< 50ms). Dilengkapi _rate limiting_ (120 koneksi/menit) dan validasi Origin.                                                                        |

---

## 2. Format Respons & Penanganan Error Terpusat

Semua endpoint REST API menggunakan validasi skema berbasis **Zod** (`fastify-type-provider-zod`) dengan serialisasi berkecepatan tinggi (`fast-json-stringify`).

### Struktur Respons Sukses

Setiap respons sukses mengembalikan `Content-Type: application/json; charset=utf-8` dengan HTTP Status `200 OK` (atau `201 Created`).

### Struktur Respons Error Terstandarisasi

Jika terjadi kesalahan validasi atau domain error, sistem mengembalikan struktur JSON konsisten:

```json
{
  "error": "STRING_ERROR_CODE",
  "message": "Deskripsi rinci mengenai kesalahan yang terjadi.",
  "issues": [] // Opsional: array detail kesalahan validasi Zod jika status 400
}
```

### Tabel Kode Error Domain

| Kode Error HTTP | Kode Error JSON (`error`)                                                                                               | Penyebab / Skenario                                                                                                                                                    |
| :-------------: | :------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     **400**     | `VALIDATION_ERROR` / `INVALID_POLICY` / `INERT_PERMISSION`                                                                  | Parameter query, path, atau body tidak sesuai kontrak skema Zod, predikat/policy tidak sah, atau permission tanpa rute penjaga.                                            |
|     **401**     | `UNAUTHORIZED`                                                                                                            | Token Bearer Operator tidak disertakan, kedaluwarsa, atau signature tidak valid.                                                                                       |
|     **403**     | `FORBIDDEN` / `POLICY_DENIED` / `PROTECTED_ACCOUNT` / `PRIVILEGE_ESCALATION_DENIED` / `ADMIN_SINGLETON_DENIED` / `RESERVED_PERMISSION` | Peran tidak berwenang, subnet non-pabrik, remote tunnel, `ADM-001` terproteksi, atau policy reserved diperluas. |
|     **404**     | `NOT_FOUND` / `DEVICE_NOT_FOUND` / `MACHINE_NOT_FOUND` / `PRODUCT_NOT_FOUND` / `OPERATOR_NOT_FOUND` / `WO_NOT_FOUND`     | Sumber daya tidak ditemukan, atau endpoint dokumentasi diakses melalui remote tunnel.                                                                                    |
|     **409**     | `CONFLICT` / `MACHINE_ALREADY_EXISTS` / `DEVICE_ALREADY_BOUND` / `MACHINE_ALREADY_BOUND` / `MACHINE_HAS_ACTIVE_WO` / `MACHINE_HAS_ACTIVE_DOWNTIME` / `PRODUCT_ALREADY_EXISTS` / `PRODUCT_HAS_ACTIVE_WO` / `OPERATOR_HAS_ACTIVE_WO` / `MODBUS_SLAVE_CONFLICT` / `WORK_ORDER_CONFLICT` / `WORK_ORDER_NOT_ACTIVE` | Konflik bisnis: mesin sudah menjalankan WO aktif, device sudah terikat, modbus duplikat, produk masih dipakai PENDING/ACTIVE WO, operator punya ACTIVE WO. |
|     **429**     | `TOO_MANY_REQUESTS`                                                                                                       | Rate limiting Nginx (100r/s general, 10r/m refresh cagg) atau WebSocket (120/menit, close 4429) atau global Fastify `X-Forwarded-For`.                               |
|     **503**     | `DEVICE_OFFLINE`                                                                                                          | Edge controller STM32 sedang offline (MQTT LWT menunjukkan offline).                                                                                                   |
|     **500**     | `INTERNAL_SERVER_ERROR`                                                                                                   | Kesalahan internal, kegagalan I/O database, atau fail-closed audit log rejection.                                                                                       |

> **History Preservation (015, ADR-0009):** `DELETE /machines`, `DELETE /products`, `DELETE /operators`, `DELETE /devices` menggunakan `ON DELETE SET NULL` — historis `oee_telemetry_logs`, `downtime_events`, `operational_events`, `work_orders` **tetap tersimpan** meski master dihapus. `oee_telemetry_logs` tidak pernah dihapus saat delete device.

---

## 3. Direktori Lengkap Endpoint REST API

### A. Health & Diagnostics (`Tag: Health`)

#### `GET /health`

- **Deskripsi**: Memeriksa status kesehatan sistem, koneksi database pool TimescaleDB, antrean buffer micro-batching, jumlah subscriber WebSocket aktif, dan metrik ingest telemetri.
- **Header Respons**: `200 OK`
- **Contoh Respons**:
  ```json
  {
    "status": "ok",
    "uptime": 450.12,
    "timestamp": "2026-09-04T11:15:00.000Z",
    "ws_clients": 2,
    "db_connected": true,
    "buffer_pending": 0,
    "metrics": {
      "totalReceived": 1500,
      "validIngested": 1495,
      "invalidDiscarded": 5,
      "lastIngestedAt": "2026-09-04T11:14:59.000Z"
    }
  }
  ```
- **Contoh cURL**:
  ```bash
  curl -s http://localhost:3001/health
  ```

---

### B. Live State Snapshots (`Tag: Live State`)

#### 1. `GET /api/v1/live-state`

- **Deskripsi**: Mengambil snapshot instan state terkini seluruh mesin dari tabel `device_live_state` (digunakan untuk _initial load_ HMI tablet dan TV Andon dalam latensi sub-milidetik < 2ms).
- **Header Respons**: `200 OK`
- **Skema Respons**: Array objek state perangkat:
  ```json
  [
    {
      "deviceId": "STM32-OEE-01",
      "machineId": "CNC-MILLING-01",
      "woId": "WO-20260903-01",
      "currentState": "RUNNING",
      "availability": "92.50",
      "performance": "95.00",
      "quality": "97.40",
      "oee": "85.50",
      "totalCount": 2000,
      "goodCount": 1948,
      "rejectCount": 52,
      "lastCycleTimeSec": "4.45",
      "operatingTimeSec": 28800,
      "runTimeSec": 26640,
      "downtimeSec": 2160,
      "spindleRpm": "1450.00",
      "machineTempC": "42.50",
      "plcAlarmCode": 0,
      "uptimeSeconds": 86400,
      "freeHeapBytes": 48200,
      "lastTelemetryAt": "2026-09-04T11:10:00.000Z",
      "updatedAt": "2026-09-04T11:10:00.000Z"
    }
  ]
  ```
- **Contoh cURL**:
  ```bash
  curl -s http://localhost:3001/api/v1/live-state
  ```

#### 2. `GET /api/v1/live-state/:deviceId`

- **Deskripsi**: Mengambil snapshot telemetri dan OEE terkini untuk 1 perangkat spesifik.
- **Parameter Path**:
  - `deviceId` (string, required): Identifier edge controller (contoh: `STM32-OEE-01`).
- **Header Respons**: `200 OK` atau `404 Not Found`.
- **Contoh cURL**:
  ```bash
  curl -s http://localhost:3001/api/v1/live-state/STM32-OEE-01
  ```

---

### C. Work Order Dispatch & Management (`Tag: Work Orders`)

> **015 — Full Admin Resource Layer:** Selain dispatch 4-zone, kini tersedia query & lifecycle (list, detail, complete, cancel) dengan history-preserving `product_id`/`operator_id` `SET NULL`.

#### 1. `GET /api/v1/work-orders` — List Work Orders (015)

- **Deskripsi**: Query daftar Work Orders dengan filter & cursor pagination keyset `O(log N)` (Base64URL `created_at + wo_id`). Jika `product_id`/`operator_id` `SET NULL` karena hard delete, response `product_name`/`operator_name` menjadi `null` (historis tetap ada).
- **Otorisasi**: Public read (tanpa auth). `envelope=true` mengembalikan `data/meta`.
- **Query Parameters**:
  - `status` (enum `PENDING|ACTIVE|COMPLETED|ABORTED`, optional)
  - `machine_id` (string, optional)
  - `product_id` (string, optional)
  - `operator_id` (string, optional)
  - `from` / `to` (ISO8601 `datetime`, optional, filter `createdAt`)
  - `limit` (1..100, default 50)
  - `cursor` (Base64URL, optional)
  - `envelope` (boolean, optional — jika `true` kembalikan `{data, meta}`)
- **Header Respons**: `200 OK` → `WorkOrderListItem[]` atau `{data, meta}`
- **Contoh Respons**:
  ```json
  {
    "data": [
      {
        "wo_id": "WO-20260903-01",
        "machine_id": "CNC-MILLING-01",
        "machine_name": "Milling 5-Axis CNC #1",
        "product_id": "PRD-GEAR-BOX-12",
        "product_name": "Helical Gearbox 12mm",
        "operator_id": "OPR-1001",
        "operator_name": "Budi Santoso",
        "target_qty": 500,
        "status": "ACTIVE",
        "created_at": "2026-09-06T03:58:15.984Z",
        "start_time": "2026-09-06T10:46:26.120Z",
        "end_time": null
      }
    ],
    "meta": { "limit": 50, "hasMore": false, "nextCursor": null, "count": 1 }
  }
  ```
- **Contoh cURL**:
  ```bash
  curl -s "http://localhost/api/v1/work-orders?status=ACTIVE&limit=10&envelope=true"
  ```

#### 2. `GET /api/v1/work-orders/:wo_id` — Detail (015)

- **Deskripsi**: Plain get tanpa `device_id` (beda dari `/:wo_id/resolve`). History-preserving: jika product/operator di-hard delete, field `product_id`/`operator_id` menjadi `null`.
- **Parameter Path**: `wo_id` (string, required)
- **Header Respons**: `200 OK` atau `404 WO_NOT_FOUND`
- **Contoh cURL**:
  ```bash
  curl -s http://localhost/api/v1/work-orders/WO-20260903-01
  ```

#### 3. `GET /api/v1/work-orders/:wo_id/resolve`

- **Deskripsi**: Menyelesaikan relasi Work Order, Mesin, Produk, Operator, dan parameter Shift Plan, **tanpa** publish MQTT (safe read). Untuk dispatch gunakan `POST /:wo_id/dispatch`.
- **Parameter Path**: `wo_id` (string, required)
- **Query Parameters**: `device_id` (string, required)
- **Header Respons**: `200 OK` / `400` / `404` / `409` / `503 DEVICE_OFFLINE`
- **Contoh Respons (200 OK)**:
  ```json
  {
    "success": true,
    "work_order": {
      "wo_id": "WO-20260903-01",
      "machine_id": "CNC-MILLING-01",
      "product_id": "PRD-GEAR12",
      "product_name": "Gear Transmisi 12mm",
      "std_cycle_time_sec": 4.5,
      "operator_id": "OP-001",
      "operator_name": "Budi Santoso",
      "target_qty": 5000,
      "shift_plan": {
        "shift_start": "07:00",
        "shift_end": "16:00",
        "planned_break_min": 60,
        "planned_operating_sec": 28800
      },
      "status": "PENDING"
    }
  }
  ```
- **Contoh cURL**:
  ```bash
  curl -s "http://localhost:3001/api/v1/work-orders/WO-20260903-01/resolve?device_id=STM32-OEE-01"
  ```

#### 4. `POST /api/v1/work-orders/:wo_id/dispatch`

- **Deskripsi**: Dispatch terotentikasi (JWT + subnet LAN) — publish `SET_JOB_CONFIG` ke `oee/device/{device_id}/config` QoS 1, watchdog 15s, audit `WO_DISPATCH_INITIATED` fail-closed sebelum publish.
- **Otorisasi**: `enforceSubnetOrigin` + `verifyOperatorAuth(["OPERATOR","SUPERVISOR","ADMIN"])`
- **Request Body**: `{device_id: string, notes?: string}`
- **Header Respons**: `200 OK` / `401` / `403` / `404` / `409 CONFLICT` / `503 DEVICE_OFFLINE`

#### 5. `POST /api/v1/work-orders/:wo_id/complete`

- **Deskripsi**: Complete ACTIVE Work Order, rekonsiliasi scrap (`finalRejectCount ≤ totalCount`), transisi atomik `ACTIVE→COMPLETED`, `device_live_state` `BATCH_FINISHED`, publish `CLEAR_CONFIG` ke `oee/device/{device_id}/command`, WS `WORK_ORDER_COMPLETED`, audit `WORK_ORDER_COMPLETED`.
- **Otorisasi**: `OPERATOR/SUPERVISOR/ADMIN` LAN
- **Request Body**: `{finalRejectCount: integer ≥0, notes?: string max 500}`
- **Header Respons**: `200 OK` / `400 SCRAP_COUNT_INVALID` / `409 WORK_ORDER_CONFLICT` / `409 UNCLASSIFIED_DOWNTIME_CONFLICT`

#### 6. `POST /api/v1/work-orders/:wo_id/cancel` — Cancel (015)

- **Deskripsi**: Batalkan `PENDING/ACTIVE` → `ABORTED` (ADMIN LAN only). Atomic `UPDATE work_orders` + `device_live_state UNCONFIGURED` + audit `WORK_ORDER_CANCELLED` + MQTT `CLEAR_CONFIG` + WS `WORK_ORDER_CANCELLED`. Jika `COMPLETED/ABORTED` → 409 `WORK_ORDER_CONFLICT`.
- **Otorisasi**: `enforceSubnetOrigin` + `verifyOperatorAuth(["ADMIN"])`
- **Request Body**: `{reason?: string max 500}`
- **Header Respons**: `200 {success, work_order: {wo_id, status: "ABORTED", machine_id}}` / `401` / `403` / `404` / `409`
- **Contoh cURL**:
  ```bash
  curl -s -X POST http://localhost/api/v1/work-orders/WO-20260903-01/cancel \
    -H "Authorization: Bearer <ADMIN_JWT>" \
    -H "Content-Type: application/json" \
    -d '{"reason":"Order dibatalkan customer"}'
  ```

#### 7. `POST /api/v1/work-orders/validate-zone`

- **Deskripsi**: Pre-flight validation zona individual (PRODUCT|MACHINE|OPERATOR|SHIFT).
- **Request Body**: `{zone_type, device_id, raw_string}`
- **Header Respons**: `200 OK` / `400` / `409` / `503`

#### 8. `POST /api/v1/work-orders/initiate-from-zones`

- **Deskripsi**: Inisiasi dari komposit 4 Zona QR, auto-generate `wo_id`, auto-upsert product/machine/operator, dispatch `SET_JOB_CONFIG`.
- **Request Body**: `{device_id, zones: {product, machine, operator, shift}}`
- **Header Respons**: `200 OK` / `400` / `409` / `503`

---

### D. Device Commands & Control (`Tag: Device Commands`)

#### `POST /api/v1/devices/:device_id/command`

- **Deskripsi**: Mengirimkan perintah aktuasi fisik / kontrol mesin jarak jauh ke edge controller STM32 melalui topik MQTT `oee/device/{device_id}/command` (`QoS 1`) dengan jaminan keamanan multi-lapis (JWT, RBAC, Subnet Origin, & Fail-Closed Audit Logging).
- **Persyaratan Keamanan & Perimeter**:
  - **Autentikasi Wajib**: Header `Authorization: Bearer <token_jwt>` (HS256 dengan payload `id`, `username`, `role`).
  - **Batas Subnet Lokal (OT Safety)**: Permintaan **harus** berasal dari subnet pabrik lokal (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, atau `127.0.0.1`). Diperiksa pada `X-Real-IP` dan seluruh transit chain `X-Forwarded-For`.
  - **Perimeter Ingress Block**: Akses melalui Remote Tunnel (Port 8080) secara mutlak **ditolak di level Nginx** dengan `403 Forbidden` (_"Remote machine actuation is blocked from external tunnel"_).
  - **Matriks Otorisasi Peran (RBAC)**:
    - `PAUSE`: Diizinkan untuk `OPERATOR`, `SUPERVISOR`, `ADMIN`.
    - `RESUME`: Diizinkan untuk `OPERATOR`, `SUPERVISOR`, `ADMIN` (Dilarang untuk `MAINTENANCE` demi keselamatan mesin).
    - `RESET_COUNTER`: Hanya diizinkan untuk `SUPERVISOR` dan `ADMIN` (Dilarang untuk `OPERATOR` demi integritas metrik OEE).
  - **Fail-Closed Audit Logging**: Sebelum pesan diterbitkan ke MQTT, server wajib mencatat event ke tabel `operational_events` (`machine_id` nullable `SET NULL` jika unbound). Jika penulisan database gagal, perintah **batal diterbitkan ke MQTT** dan mengembalikan status `500`.
- **Parameter Path**:
  - `device_id` (string, required): ID perangkat tujuan (misal: `STM32-OEE-01`).
- **Request Body (JSON)**:
  ```json
  {
    "command": "PAUSE", // Enum: "PAUSE" | "RESUME" | "RESET_COUNTER"
    "reason": "Penyesuaian posisi feeder sebelum reload material" // Wajib: string min 5 karakter
  }
  ```
- **Header Respons**:
  - `200 OK`: Perintah berhasil divalidasi, diaudit ke DB, dan di-publish ke broker MQTT.
  - `400 Bad Request`: Skema tidak valid atau panjang `reason` < 5 karakter.
  - `401 Unauthorized`: Token Bearer tidak ada atau tanda tangan JWT tidak valid.
  - `403 Forbidden`: Peran operator tidak memiliki hak akses, IP pemanggil berada di luar subnet lokal, atau diakses melalui remote tunnel.
  - `404 Not Found`: Perangkat tujuan tidak ditemukan.
  - `500 Internal Server Error`: Gagal melakukan audit record ke DB (fail-closed protection).
- **Contoh Respons (200 OK)**:
  ```json
  {
    "success": true,
    "transaction_id": "CMD-357IBZ",
    "command": "PAUSE",
    "device_id": "STM32-OEE-01",
    "timestamp": 1788545321
  }
  ```
- **Contoh cURL (Local Factory LAN)**:
  ```bash
  curl -s -X POST "http://localhost/api/v1/devices/STM32-OEE-01/command" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <OPERATOR_JWT_TOKEN>" \
    -d '{"command": "PAUSE", "reason": "Feeder adjustment during live test"}'
  ```

---

### E. Device Registry Management (`Tag: Devices`)

> **History Preservation (015):** `DELETE /:deviceId` kini `SET NULL` untuk `downtime_events`/`operational_events` dan **tidak menghapus** `oee_telemetry_logs` — historis tetap query-able via `GET /telemetry/:device_id`.

#### 1. `GET /api/v1/devices`

- **Deskripsi**: Mengambil daftar seluruh perangkat controller STM32 yang terdaftar beserta relasi mesin terikat (`boundMachine: {machineId, machineName} | null`) dan `model`.
- **Header Respons**: `200 OK` → `DeviceResponse[]`
- **Contoh Respons**:
  ```json
  [
    {
      "deviceId": "STM32-OEE-01",
      "model": "STM32F4-W5500",
      "macAddress": "00:08:DC:55:01:0A",
      "ipAddress": "192.168.1.101",
      "firmwareVersion": "v1.0.0",
      "isOnline": false,
      "lastSeenAt": null,
      "createdAt": "2026-09-06T03:58:15.976Z",
      "boundMachine": {
        "machineId": "CNC-MILLING-01",
        "machineName": "Milling 5-Axis CNC #1"
      }
    }
  ]
  ```

#### 2. `GET /api/v1/devices/:deviceId`

- **Deskripsi**: Mengambil detail profil dan status koneksi perangkat edge tunggal. `404 DEVICE_NOT_FOUND` jika tidak ada.

#### 3. `POST /api/v1/devices`

- **Deskripsi**: Mendaftarkan perangkat edge STM32 baru ke dalam sistem. **ADMIN LAN only** (`enforceSubnetOrigin` + `ADMIN`).
- **Request Body (JSON)**:
  ```json
  {
    "deviceId": "STM32-OEE-02", // regex ^STM32-[A-Za-z0-9_-]+$
    "macAddress": "00:08:DC:02:03:04", // EUI-48 colon/hyphen
    "ipAddress": "192.168.1.102", // optional ipv4/ipv6
    "firmwareVersion": "v1.0.0" // optional max 50
  }
  ```
- **Status Code**: `201 Created` / `400 VALIDATION_ERROR` / `401` / `403` / `409 CONFLICT` (deviceId/macAddress duplikat).

#### 4. `PUT /api/v1/devices/:deviceId`

- **Deskripsi**: Memperbarui metadata perangkat (IP address, versi firmware). **ADMIN LAN only**.
- **Request Body**: `{ipAddress?: ipv4|ipv6, firmwareVersion?: string max 50}`
- **Status Code**: `200 OK` / `404 DEVICE_NOT_FOUND`.

#### 5. `DELETE /api/v1/devices/:deviceId`

- **Deskripsi**: Menghapus perangkat dari registry. Guard: jika bound machine punya `ACTIVE` WO → `409 CONFLICT`. Jika lolos: `device_live_state` CASCADE, `downtime/operational_events` `SET NULL` (bukan DELETE), `oee_telemetry_logs` **dipertahankan**, `machines.deviceId` `SET NULL` (unbind). **ADMIN LAN only**.
- **Status Code**: `200 {success, message}` / `404` / `409` / `401` / `403`.

#### `GET /api/v1/devices/:deviceId/health`

- **Deskripsi**: Mengambil cached health terbaru STM32 edge controller (MQTT QoS0, in-memory). Payload: `deviceId`, `timestamp`, `heapFree`, `tasksHealthy`, `tasksTotal`, `staleCount`, `staleTasks[]`, `eventFlags`, `ageSec`. Cache miss → `ageSec: 999999` + field nol (tidak fabri data). `404 DEVICE_NOT_FOUND` jika perangkat tidak terdaftar.
- **Header Respons**: `200 {deviceHealth}` / `404`

---

### F. Machines Master & Bind Lifecycle (`Tag: Machines`) — 015 Full Admin Resource Layer

> **1:1 Binding Fisik:** `machines.device_id UNIQUE` — 1 device ↔ 1 mesin. Semua mutasi `ADMIN` LAN only, audit `MASTER_DATA_MUTATION`/`MACHINE_BOUND`/`MACHINE_UNBOUND` ke `operational_events`, WS broadcast `MACHINE_BOUND/UNBOUND/DELETED`. FK `ON DELETE SET NULL` menjaga historis.

#### 1. `GET /api/v1/machines`

- **Deskripsi**: List semua mesin produksi beserta `boundDevice` (`{deviceId, macAddress, isOnline} | null`). Cursor pagination `O(log N)` (`limit` 1..100, `cursor` Base64URL, `envelope`).
- **Request**: `GET /api/v1/machines?limit=50&envelope=true` — **Publik** (tanpa auth, untuk TV Andon).
- **Contoh cURL**:
  ```bash
  curl -s http://localhost/api/v1/machines
  curl -s "http://localhost/api/v1/machines?limit=10&envelope=true"
  ```
- **Response 200 (tanpa envelope)**:
  ```json
  [
    {
      "machineId": "CNC-MILLING-01",
      "machineName": "Milling 5-Axis CNC #1",
      "deviceId": "STM32-OEE-01",
      "modbusSlaveId": 1,
      "createdAt": "2026-09-06T03:58:15.976Z",
      "boundDevice": {
        "deviceId": "STM32-OEE-01",
        "macAddress": "00:08:DC:55:01:0A",
        "isOnline": false
      }
    },
    {
      "machineId": "CNC-LATHE-02",
      "machineName": "Lathe Turning CNC #2",
      "deviceId": null,
      "modbusSlaveId": 2,
      "createdAt": "2026-09-06T03:58:15.976Z",
      "boundDevice": null
    }
  ]
  ```
- **Response 200 (envelope)**:
  ```json
  {
    "data": [ { "machineId": "CNC-MILLING-01", "machineName": "Milling 5-Axis CNC #1", "deviceId": "STM32-OEE-01", "modbusSlaveId": 1, "createdAt": "2026-09-06T03:58:15.976Z", "boundDevice": { "deviceId": "STM32-OEE-01", "macAddress": "00:08:DC:55:01:0A", "isOnline": false } } ],
    "meta": { "limit": 50, "hasMore": false, "nextCursor": null, "count": 1 }
  }
  ```

#### 2. `GET /api/v1/machines/:machineId`

- **Deskripsi**: Detail 1 mesin.
- **Request**: `GET /api/v1/machines/CNC-MILLING-03` — Publik.
- **Response 200**:
  ```json
  {
    "machineId": "CNC-MILLING-03",
    "machineName": "Milling 5-Axis #3",
    "deviceId": "STM32-OEE-03",
    "modbusSlaveId": 3,
    "createdAt": "2026-09-06T03:58:15.976Z",
    "boundDevice": {
      "deviceId": "STM32-OEE-03",
      "macAddress": "00:08:DC:11:22:33",
      "isOnline": true
    }
  }
  ```
- **Response 404**:
  ```json
  { "error": "MACHINE_NOT_FOUND", "message": "Machine CNC-UNKNOWN not found." }
  ```

#### 3. `POST /api/v1/machines`

- **Deskripsi**: Buat mesin baru. **ADMIN LAN only** (`enforceSubnetOrigin` + `verifyOperatorAuth(["ADMIN"])`).
- **Request Headers**: `Authorization: Bearer <ADMIN_JWT>`, `X-Forwarded-For: 192.168.1.50` (LAN)
- **Request Body**:
  ```json
  {
    "machineId": "CNC-MILLING-03",
    "machineName": "Milling 5-Axis #3",
    "deviceId": "STM32-OEE-03",
    "modbusSlaveId": 3
  }
  ```
  - `machineId` regex `^CNC-[A-Z0-9_-]{3,32}$` (required)
  - `machineName` 3..100 char (required)
  - `deviceId` regex `^STM32-[A-Za-z0-9_-]+$` (optional, must exist & not bound elsewhere)
  - `modbusSlaveId` 1..247 unique (optional, default 1)
- **Contoh cURL**:
  ```bash
  curl -s -X POST http://localhost/api/v1/machines \
    -H "Authorization: Bearer <ADMIN_JWT>" \
    -H "Content-Type: application/json" \
    -d '{"machineId":"CNC-MILLING-03","machineName":"Milling 5-Axis #3","modbusSlaveId":3}'
  ```
- **Response 201**:
  ```json
  {
    "machineId": "CNC-MILLING-03",
    "machineName": "Milling 5-Axis #3",
    "deviceId": null,
    "modbusSlaveId": 3,
    "createdAt": "2026-09-07T03:59:58.035Z",
    "boundDevice": null
  }
  ```
- **Response 409**:
  ```json
  { "error": "MACHINE_ALREADY_EXISTS", "message": "Machine ID CNC-MILLING-03 already exists." }
  { "error": "DEVICE_ALREADY_BOUND", "message": "Device STM32-OEE-03 is already bound to another machine." }
  { "error": "MODBUS_SLAVE_CONFLICT", "message": "Modbus slave ID 3 already assigned to machine CNC-MILLING-01." }
  ```
- **Response 401/403**: `{ "error": "UNAUTHORIZED", "message": "Missing Bearer" }` / `{ "error": "FORBIDDEN", "message": "Role not authorized" }` + audit `SECURITY_REJECTION` jika dari remote tunnel.

#### 4. `PUT /api/v1/machines/:machineId`

- **Deskripsi**: Update `machineName` dan/atau `modbusSlaveId`. **ADMIN LAN only**.
- **Request**: `PUT /api/v1/machines/CNC-MILLING-03`
  ```json
  { "machineName": "Milling 5-Axis #3 Updated", "modbusSlaveId": 5 }
  ```
- **Response 200**:
  ```json
  {
    "machineId": "CNC-MILLING-03",
    "machineName": "Milling 5-Axis #3 Updated",
    "deviceId": null,
    "modbusSlaveId": 5,
    "createdAt": "2026-09-06T03:58:15.976Z",
    "boundDevice": null
  }
  ```
- **Response 404/409**: `{ "error": "MACHINE_NOT_FOUND" }` / `{ "error": "MODBUS_SLAVE_CONFLICT" }`

#### 5. `DELETE /api/v1/machines/:machineId`

- **Deskripsi**: Hard delete mesin. Guard: `ACTIVE` WO → `409 MACHINE_HAS_ACTIVE_WO`, `active downtime (end_time IS NULL)` → `409 MACHINE_HAS_ACTIVE_DOWNTIME`. Jika lolos: `device_live_state.machineId` `SET NULL`, FK `downtime/operational_events` `SET NULL` (historis tetap), audit `MASTER_DATA_MUTATION`, WS `MACHINE_DELETED`. **ADMIN LAN only**.
- **Request**: `DELETE /api/v1/machines/CNC-MILLING-03` + `Authorization: Bearer <ADMIN_JWT>`
- **Response 200**:
  ```json
  { "success": true, "message": "Machine CNC-MILLING-03 deleted successfully." }
  ```
- **Response 409**:
  ```json
  { "error": "MACHINE_HAS_ACTIVE_WO", "message": "Cannot delete machine CNC-MILLING-03: has active Work Order (WO-20260903-01)." }
  { "error": "MACHINE_HAS_ACTIVE_DOWNTIME", "message": "Cannot delete machine CNC-MILLING-03: has active downtime event (id=42)." }
  ```

#### 6. `POST /api/v1/machines/:machineId/bind`

- **Deskripsi**: Bind device ke mesin (1:1). **ADMIN LAN only**.
- **Request**: `POST /api/v1/machines/CNC-MILLING-03/bind`
  ```json
  { "device_id": "STM32-OEE-03" }
  ```
- **Response 200**:
  ```json
  {
    "machineId": "CNC-MILLING-03",
    "machineName": "Milling 5-Axis #3",
    "deviceId": "STM32-OEE-03",
    "modbusSlaveId": 3,
    "createdAt": "2026-09-06T03:58:15.976Z",
    "boundDevice": {
      "deviceId": "STM32-OEE-03",
      "macAddress": "00:08:DC:11:22:33",
      "isOnline": false
    }
  }
  ```
- **Response 409/404**:
  ```json
  { "error": "MACHINE_ALREADY_BOUND", "message": "Machine CNC-MILLING-03 already has a bound device. Unbind first." }
  { "error": "DEVICE_ALREADY_BOUND", "message": "Device STM32-OEE-03 is already bound to another machine." }
  { "error": "DEVICE_NOT_FOUND", "message": "Device STM32-OEE-03 not found." }
  ```
- **Side-effects**: `UPDATE machines SET device_id`, audit `MACHINE_BOUND` ke `operational_events`, WS `MACHINE_BOUND`
- **Contoh cURL**:
  ```bash
  curl -s -X POST http://localhost/api/v1/machines/CNC-MILLING-03/bind \
    -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" \
    -d '{"device_id":"STM32-OEE-03"}'
  ```

#### 7. `POST /api/v1/machines/:machineId/unbind`

- **Deskripsi**: Unbind device dari mesin. Guard: `ACTIVE` WO → `409 MACHINE_HAS_ACTIVE_WO`, `not bound` → `400 MACHINE_NOT_BOUND`. **ADMIN LAN only**.
- **Request**: `POST /api/v1/machines/CNC-MILLING-03/unbind` (tanpa body)
- **Response 200**:
  ```json
  {
    "machineId": "CNC-MILLING-03",
    "machineName": "Milling 5-Axis #3",
    "deviceId": null,
    "modbusSlaveId": 3,
    "createdAt": "2026-09-06T03:58:15.976Z",
    "boundDevice": null
  }
  ```
- **Response 409/400**:
  ```json
  { "error": "MACHINE_HAS_ACTIVE_WO", "message": "Cannot unbind machine CNC-MILLING-03: has active Work Order (WO-20260903-01)." }
  { "error": "MACHINE_NOT_BOUND", "message": "Machine CNC-MILLING-03 is not bound to any device." }
  ```
- **Side-effects**: `UPDATE machines SET device_id=NULL`, audit `MACHINE_UNBOUND`, WS `MACHINE_UNBOUND`

#### 8. `GET /api/v1/machines/:machineId/status-history` — 027

- **Deskripsi**: Riwayat status mesin sebagai interval (mulai, selesai, durasi, status) — G10/N4. Interval terbuka (`ended_at = null`) ditandai `isActive: true`. Tidak menyimpan alasan (alasan tetap di `downtime_events`). **Publik (baca mesin)**.
- **Query**: `from`, `to` (ISO 8601), `state` (`READY|RUNNING|PLANNED_DOWNTIME|UNPLANNED_DOWNTIME|BATCH_FINISHED|UNCONFIGURED|OFFLINE`), `limit` (1..1000, default 200), `cursor` (Base64URL), `envelope` (boolean).
- **Request**: `GET /api/v1/machines/CNC-MILLING-03/status-history?limit=50&envelope=true`
- **Response 200 (envelope)**:
  ```json
  {
    "data": [
      {
        "id": 10231,
        "deviceId": "STM32-OEE-01",
        "machineId": "CNC-MILLING-03",
        "state": "RUNNING",
        "startedAt": "2026-11-15T01:00:00.000Z",
        "endedAt": "2026-11-15T03:15:00.000Z",
        "durationSec": 8100,
        "triggerSource": "TELEMETRY_TRANSITION",
        "isActive": false
      }
    ],
    "meta": { "limit": 50, "hasMore": false, "truncated": false, "nextCursor": null, "count": 1 }
  }
  ```
- **Response 400/404**: `INVALID_RANGE` (`from >= to`), `MACHINE_NOT_FOUND` (mesin tidak ada).

---

### G. Products Master (`Tag: Products`) — 015

> **Hard Delete:** `DELETE` diizinkan hanya jika tidak ada `PENDING/ACTIVE` WO yang referensi product tersebut; `COMPLETED/ABORTED` WO diperbolehkan — FK `SET NULL` menjaga historis (`work_orders.product_id` null, `GET /work-orders` `product_name: null`).

#### 1. `GET /api/v1/products`

- **Deskripsi**: List semua produk master (`productId`, `productName`, `stdCycleTimeSec`, `createdAt`). Cursor pagination `limit` 1..100, `cursor` Base64URL, `envelope` boolean. **Publik**.
- **Request**: `GET /api/v1/products?limit=50&envelope=true`
- **Response 200 (array)**:
  ```json
  [
    {
      "productId": "PRD-GEAR-BOX-12",
      "productName": "Helical Gearbox 12mm",
      "stdCycleTimeSec": "12.00",
      "createdAt": "2026-09-06T03:58:15.980Z"
    }
  ]
  ```
- **Response 200 (envelope)**:
  ```json
  {
    "data": [{ "productId": "PRD-GEAR-BOX-12", "productName": "Helical Gearbox 12mm", "stdCycleTimeSec": "12.00", "createdAt": "2026-09-06T03:58:15.980Z" }],
    "meta": { "limit": 50, "hasMore": false, "nextCursor": null, "count": 1 }
  }
  ```

#### 2. `GET /api/v1/products/:productId`

- **Deskripsi**: Detail 1 produk.
- **Request**: `GET /api/v1/products/PRD-GEAR-BOX-12`
- **Response 200**:
  ```json
  {
    "productId": "PRD-GEAR-BOX-12",
    "productName": "Helical Gearbox 12mm",
    "stdCycleTimeSec": "12.00",
    "createdAt": "2026-09-06T03:58:15.980Z"
  }
  ```
- **Response 404**:
  ```json
  { "error": "PRODUCT_NOT_FOUND", "message": "Product PRD-UNKNOWN not found." }
  ```

#### 3. `POST /api/v1/products`

- **Deskripsi**: Buat produk baru. **ADMIN LAN only** (`enforceSubnetOrigin` + `ADMIN`).
- **Request Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "productId": "PRD-GEAR-99",
    "productName": "Gear 99mm",
    "stdCycleTimeSec": 9.5
  }
  ```
  - `productId` regex `^[A-Z0-9_-]{3,32}$` (required)
  - `productName` 3..100 char (required)
  - `stdCycleTimeSec` number >0 max 9999 (required)
- **Contoh cURL**:
  ```bash
  curl -s -X POST http://localhost/api/v1/products \
    -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" \
    -d '{"productId":"PRD-GEAR-99","productName":"Gear 99mm","stdCycleTimeSec":9.5}'
  ```
- **Response 201**:
  ```json
  {
    "productId": "PRD-GEAR-99",
    "productName": "Gear 99mm",
    "stdCycleTimeSec": "9.50",
    "createdAt": "2026-09-07T03:59:58.113Z"
  }
  ```
- **Response 409**:
  ```json
  { "error": "PRODUCT_ALREADY_EXISTS", "message": "Product ID PRD-GEAR-99 already exists." }
  ```

#### 4. `PUT /api/v1/products/:productId`

- **Deskripsi**: Update `productName` / `stdCycleTimeSec`. **ADMIN LAN only**.
- **Request**: `PUT /api/v1/products/PRD-GEAR-99`
  ```json
  { "productName": "Gear 99mm Updated", "stdCycleTimeSec": 11 }
  ```
- **Response 200**:
  ```json
  {
    "productId": "PRD-GEAR-99",
    "productName": "Gear 99mm Updated",
    "stdCycleTimeSec": "11.00",
    "createdAt": "2026-09-06T03:58:15.980Z"
  }
  ```
- **Response 404**: `{ "error": "PRODUCT_NOT_FOUND" }`

#### 5. `DELETE /api/v1/products/:productId`

- **Deskripsi**: Hard delete produk. Guard `PENDING/ACTIVE` WO → `409 PRODUCT_HAS_ACTIVE_WO`. Jika hanya `COMPLETED/ABORTED` → `200` dan `work_orders.product_id` `SET NULL` (historis tetap, `GET /work-orders/:id` `product_id: null`). **ADMIN LAN only**.
- **Request**: `DELETE /api/v1/products/PRD-GEAR-99` + `Authorization: Bearer <ADMIN_JWT>`
- **Response 200**:
  ```json
  { "success": true, "message": "Product PRD-GEAR-99 deleted successfully." }
  ```
- **Response 409**:
  ```json
  { "error": "PRODUCT_HAS_ACTIVE_WO", "message": "Cannot delete product PRD-GEAR-99: referenced by ACTIVE Work Order (WO-20260903-01)." }
  ```
- **Verifikasi historis**: `SELECT product_id FROM work_orders WHERE wo_id='WO-...'` → `null`; `GET /work-orders/WO-...` tetap 200 dengan `product_id: null`

---

### H. Operators Extended (`Tag: Operators`) — 015 Completion, 020 Password Auth

> 7 rute (`GET /`, `POST /`, `PATCH /:id/password`, `PATCH /:id/status`, `GET /:id`, `PUT /:id`, `DELETE /:id`). Semua read `ADMIN/SUPERVISOR` LAN, semua mutasi `ADMIN` LAN only, FK `work_orders.operator_id` `SET NULL` menjaga historis. Kredensial = username (`operator_id`) + password (020/ADR-0012, PIN dihapus total).

#### 1. `GET /api/v1/operators`

- **Deskripsi**: List semua operator tanpa `passwordHash`/`passwordSalt`. **ADMIN/SUPERVISOR LAN only** (`enforceSubnetOrigin` + `ADMIN,SUPERVISOR`).
- **Request**: `GET /api/v1/operators` + `Authorization: Bearer <ADMIN_JWT>`
- **Response 200**:
  ```json
  [
    {
      "operatorId": "OPR-1001",
      "operatorName": "Budi Santoso",
      "role": "OPERATOR",
      "lineId": "LINE-01",
      "isActive": true,
      "createdAt": "2026-09-06T03:58:15.982Z"
    }
  ]
  ```
- **Response 401/403**: `{ "error": "UNAUTHORIZED" }` / `{ "error": "FORBIDDEN", "message": "Role not authorized" }`

#### 2. `GET /api/v1/operators/:id`

- **Deskripsi**: Detail 1 operator tanpa kredensial. **ADMIN/SUPERVISOR LAN only**.
- **Request**: `GET /api/v1/operators/OPR-1001` + `Authorization: Bearer <ADMIN_JWT>`
- **Response 200**:
  ```json
  {
    "operatorId": "OPR-1001",
    "operatorName": "Budi Santoso",
    "role": "OPERATOR",
    "lineId": "LINE-01",
    "isActive": true,
    "createdAt": "2026-09-06T03:58:15.982Z"
  }
  ```
- **Response 404**:
  ```json
  { "error": "OPERATOR_NOT_FOUND", "message": "Operator 'OPR-NONEXISTENT' was not found." }
  ```

#### 3. `POST /api/v1/operators`

- **Deskripsi**: Provision operator baru dengan `passwordHash` PBKDF2 salt 16-byte, iterasi dari `AUTH_PBKDF2_ITERATIONS` (default 10k) SHA256, policy min `AUTH_PASSWORD_MIN_LENGTH` (default 8). **ADMIN/SUPERVISOR LAN only**. Otorisasi ditentukan oleh guard policy `create:operator` + role efektif (bukan hierarki level; FR-032-20) dan `assertAdminSingletonTarget` (larangan ADMIN ganda). `operator_id` unik via PK (tanpa validasi tabrakan kredensial — tiap akun punya salt acak).
- **Request Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "operatorId": "OP-042",
    "operatorName": "Siti Rahayu",
    "role": "OPERATOR",
    "password": "siti-jaya-8",
    "lineId": "LINE-02"
  }
  ```
- **Response 201**:
  ```json
  {
    "operatorId": "OP-042",
    "operatorName": "Siti Rahayu",
    "role": "OPERATOR",
    "lineId": "LINE-02",
    "isActive": true,
    "createdAt": "2026-09-07T03:59:58.113Z"
  }
  ```
- **Response 400**: `{ "error": "VALIDATION_ERROR" }` (termasuk password < min) / `{ "error": "WEAK_PASSWORD" }` (service-level)
- **Response 409**:
  ```json
  { "error": "OPERATOR_ALREADY_EXISTS", "message": "Operator with ID 'OP-042' already exists." }
  ```

#### 4. `PUT /api/v1/operators/:id` — Update (015)

- **Deskripsi**: Update `operatorName` / `role` / `lineId`. **ADMIN LAN only** (guard policy `update:operator`). `role` hanya label legacy — perubahan label dicek terhadap larangan ADMIN ganda (`ADMIN_SINGLETON_DENIED`) dan perlindungan akun, bukan hierarki level (FR-032-20). Audit `OPERATOR_UPDATED`.
- **Request**: `PUT /api/v1/operators/OP-042` + `Authorization: Bearer <ADMIN_JWT>`
  ```json
  { "operatorName": "Siti Rahayu Updated", "role": "SUPERVISOR", "lineId": "LINE-03" }
  ```
- **Response 200**:
  ```json
  {
    "operatorId": "OP-042",
    "operatorName": "Siti Rahayu Updated",
    "role": "SUPERVISOR",
    "lineId": "LINE-03",
    "isActive": true,
    "createdAt": "2026-09-06T03:58:15.982Z"
  }
  ```
- **Response 403**: `{ "error": "ADMIN_SINGLETON_DENIED", "message": "Role ADMIN is reserved for the root account 'ADM-001'." }` (mencoba menetapkan ADMIN ke akun non-root) atau `{ "error": "FORBIDDEN" }` bila peran pemanggil tidak memiliki `update:operator`.

#### 5. `DELETE /api/v1/operators/:id` — Hard Delete (015)

- **Deskripsi**: Hard delete operator. Guard `ADM-001` → `403 PROTECTED_ACCOUNT`, `ACTIVE` WO → `409 OPERATOR_HAS_ACTIVE_WO`. FK `work_orders.operator_id` `SET NULL` (WO historis tetap, `GET /work-orders/:id` `operator_id: null`). **ADMIN LAN only**.
- **Request**: `DELETE /api/v1/operators/OP-042` + `Authorization: Bearer <ADMIN_JWT>`
- **Response 200**:
  ```json
  { "success": true, "message": "Operator OP-042 deleted successfully." }
  ```
- **Response 403/409**:
  ```json
  { "error": "PROTECTED_ACCOUNT", "message": "Root administrator account ADM-001 is protected and cannot be deleted." }
  { "error": "OPERATOR_HAS_ACTIVE_WO", "message": "Cannot delete operator OP-042: has active Work Order (WO-20260903-01)." }
  ```

#### 6. `PATCH /api/v1/operators/:id/password` (020, ganti `/pin`)

- **Deskripsi**: Rotate password dengan salt baru (`generateSalt`) + `hashPassword` PBKDF2 (iterasi env), policy min-8, audit `OPERATOR_PASSWORD_ROTATED`. **ADMIN/SUPERVISOR LAN only**.
- **Request**: `PATCH /api/v1/operators/OP-042/password` + `Authorization: Bearer <ADMIN_JWT>`
  ```json
  { "newPassword": "siti-baru-8" }
  ```
- **Response 200**:
  ```json
  { "success": true, "message": "Password for operator 'OP-042' was successfully updated." }
  ```
- **Response 400**: `{ "error": "VALIDATION_ERROR" }` / `{ "error": "WEAK_PASSWORD" }`

#### 7. `PATCH /api/v1/operators/:id/status`

- **Deskripsi**: Activate/deactivate `isActive`. Guard `ADM-001` nonaktif → `400 PROTECTED_ACCOUNT`. **ADMIN/SUPERVISOR LAN only**.
- **Request**: `PATCH /api/v1/operators/OP-042/status`
  ```json
  { "isActive": false }
  ```
- **Response 200**:
  ```json
  {
    "operatorId": "OP-042",
    "operatorName": "Siti Rahayu",
    "role": "OPERATOR",
    "lineId": "LINE-02",
    "isActive": false,
    "createdAt": "2026-09-06T03:58:15.982Z"
  }
  ```

---

### I. Operational Events Audit Trail (`Tag: Operational Events`)

#### `GET /api/v1/operational-events`

- **Deskripsi**: Mengambil riwayat log audit global (seluruh perangkat) dengan filter waktu, event type, cursor pagination. `deviceId`/`machineId` nullable `SET NULL` → fallback `null`/`[deleted]`.
- **Query Parameters**:
  - `from` (ISO8601, optional)
  - `to` (ISO8601, optional)
  - `event_type` (string, optional)
  - `limit` (1..200 default 50)
  - `cursor` (Base64URL `t+id`)
  - `envelope` (boolean)
- **Header Respons**: `200 OK` → `OperationalEventItem[]` atau `{data, meta}`

#### `GET /api/v1/system/audit`

- **Deskripsi**: Alias audit trail global (operational events) untuk Admin Panel. Query sama dengan `GET /api/v1/operational-events` (`from`, `to`, `limit`, `cursor`, `envelope`).
- **Header Respons**: `200 OK` → `OperationalEventItem[]` atau `{data, meta}`

#### `GET /api/v1/operational-events/export`

- **Deskripsi**: Bulk export audit operational-event global (CSV/NDJSON/JSON) dengan enforce retensi `RETENTION_POLICY_DAYS` (default 90 hari). Rentang di luar retensi → `400 RETENTION_EXCEEDED`. Rate limit `5/min`, **SUPERVISOR/ADMIN LAN only** (policy `refresh:telemetry`).
- **Query Parameters**: `from`, `to`, `format` (`csv` default, `ndjson`, `json`), `limit` (1..100000 default 10000)
- **Header Respons**: `200 OK` `text/csv` / `application/x-ndjson` / `application/json` attachment + `X-Export-Source/Generated-At/Time-Window`

#### `GET /api/v1/operational-events/:deviceId`

- **Deskripsi**: Mengambil riwayat log audit peristiwa diskrit (alarm PLC, start/stop WO, perintah kontrol, mutasi master `MASTER_DATA_MUTATION`/`MACHINE_BOUND`/`PRODUCT_DELETED`/`WORK_ORDER_CANCELLED`, pergantian shift, dsb.). `deviceId`/`machineId` nullable `SET NULL` setelah hard delete — response `null` atau `[deleted]` fallback.
- **Query Parameters**:
  - `from` (ISO8601, optional)
  - `to` (ISO8601, optional)
  - `event_type` (string, optional, contoh `COMMAND_PAUSE_DISPATCHED`, `WO_DISPATCH_ACK_SUCCESS`, `MASTER_DATA_MUTATION`)
  - `limit` (1..200 default 50)
  - `cursor` (Base64URL `t+id`)
  - `envelope` (boolean)
- **Header Respons**: `200 OK` → `OperationalEventItem[]` atau `{data, meta}`
- **Contoh cURL**:
  ```bash
  curl -s "http://localhost:3001/api/v1/operational-events/STM32-OEE-01?limit=10"
  ```

#### `GET /api/v1/operational-events/:deviceId/export`

- **Deskripsi**: Bulk export audit operational-event per perangkat (CSV/NDJSON/JSON) dengan enforce retensi 90 hari. Rate limit `5/min`, **SUPERVISOR/ADMIN LAN only**.
- **Query Parameters**: `from`, `to`, `format` (`csv` default, `ndjson`, `json`), `limit` (1..100000 default 10000)
- **Header Respons**: `200 OK` attachment + `X-Export-*`

#### `PATCH /api/v1/operational-events/:id/ack`

- **Deskripsi**: Acknowledge alarm/event operasional (idempoten). Menerima `operatorId` atau `operator_id` + `note` opsional. Mengembalikan `id`, `acknowledgedAt`, `acknowledgedBy`, `ackNote`. Guard `enforceSubnetOrigin` + policy `ack:operational_event`.
- **Request Body**: `{operatorId?: string, operator_id?: string, note?: string}`
- **Header Respons**: `200 {id, acknowledgedAt, acknowledgedBy, ackNote}` / `400` / `401` / `403` / `404`

---

### J. Downtime Events & Six Big Losses (`Tag: Downtime Events`)

#### 1. `GET /api/v1/downtime-events/active`

- **Deskripsi**: Mengambil snapshot seluruh insiden downtime yang sedang aktif (belum selesai / `end_time is null`) di seluruh lini produksi pabrik (< 1ms).
- **Header Respons**: `200 OK` → `DowntimeEventResponse[]` (deviceId/machineId fallback `"[deleted]"` jika master dihapus)

#### 2. `GET /api/v1/downtime-events/:device_id`

- **Deskripsi**: Query histori insiden downtime untuk perangkat tertentu dengan dukungan filter rentang tanggal dan kategori. `deviceId`/`machineId` nullable `SET NULL` — historis tetap.
- **Query Parameters**: `from`, `to`, `category`, `limit` (1..100 default 50), `cursor`, `envelope` (`active_only`, `unlabeled_only`)
- **Header Respons**: `200 OK` → `DowntimeEventResponse[]` atau `{data, meta}`

#### 2b. `GET /api/v1/downtime-events/:device_id/export`

- **Deskripsi**: Bulk export downtime history per perangkat (CSV/NDJSON/JSON) dengan enforce retensi 90 hari. Rate limit `5/min`, **SUPERVISOR/ADMIN LAN only** (policy `refresh:telemetry`).
- **Query Parameters**: `from`, `to`, `format` (`csv` default, `ndjson`, `json`), `limit` (1..100000 default 10000), `active_only`, `unlabeled_only`
- **Header Respons**: `200 OK` attachment + `X-Export-Source/Generated-At/Device-Id/Time-Window`

#### 3. `POST /api/v1/downtime-events/:id/reason`

- **Deskripsi**: Input alasan downtime dan kategori Six Big Losses oleh operator melalui panel HMI. Audit `DOWNTIME_REASON_LABELED/UPDATED` ke `operational_events` dengan `operator` attribution.
- **Parameter Path**:
  - `id` (integer, required): ID kejadian downtime.
- **Request Body (JSON)**:
  ```json
  {
    "category": "EQUIPMENT_FAILURE", // Enum: EQUIPMENT_FAILURE|SETUP_AND_ADJUSTMENT|IDLING_AND_MINOR_STOPPAGE|REDUCED_SPEED|PROCESS_DEFECT|MATERIAL_SHORTAGE|PLANNED_MAINTENANCE|REST_BREAK|CLEANING_5S|OTHER
    "reason": "Patah Pahat Bubut Mata 12mm - aus", // min 3 max 255
    "notes": "Pahat aus dan patah saat pengerjaan gear batch 3" // optional max 500
  }
  ```
- **Otorisasi**: `OPERATOR/SUPERVISOR/MAINTENANCE/ADMIN` LAN
- **Header Respons**: `200 OK` `{success, eventId, deviceId, operatorReason, isOverwrite, operator}` + WS `DOWNTIME_REASON_LABELED` / `400` / `401` / `403` / `404`

---

### K. Telemetry & Backlog Reconciliation (`Tag: Telemetry & Reconciliation`)

> **History Preservation:** `oee_telemetry_logs` hypertable **tanpa FK** — `DELETE /devices` tidak menghapus histori telemetry. Query `GET /:device_id` tetap mengembalikan data historis meski device dihapus.

#### 1. `GET /api/v1/telemetry/:device_id`

- **Deskripsi**: Query data histori telemetri time-series dari hypertable TimescaleDB dengan filter waktu. Cursor pagination `O(log N)`.
- **Query Parameters**: `from` (ISO string), `to` (ISO string), `limit` (max 1000), `cursor`, `envelope` (`is_buffered` filter)
- **Header Respons**: `200 OK` → `TelemetryHistoryResponse[]` atau `{data, meta}`

#### 2. `GET /api/v1/telemetry/:device_id/hourly`

- **Deskripsi**: Mengambil data ringkasan OEE per jam yang dihitung secara continuous oleh TimescaleDB Continuous Aggregate (`oee_hourly_summary`). Refresh policy `5 minutes` (end_offset `1 minute`).
- **Query Parameters**: `from`, `to`, `limit`, `cursor`, `envelope`. `from` lebih tua dari `OEE_HISTORY_RETENTION_DAYS` → `400 RETENTION_EXCEEDED`.
- **Header Respons**: `200 OK`; setiap item memuat `provisional` (`true` bila bucket belum final).

#### 3. `GET /api/v1/telemetry/:device_id/export`

- **Deskripsi**: Bulk export `CSV`/`NDJSON`/`JSON` untuk analisis offline. Rate limit `5/min`, **SUPERVISOR/ADMIN LAN only** (policy `refresh:telemetry`), enforce retensi 90 hari.
- **Query Parameters**: `from`, `to`, `format` (`csv` default, `ndjson`, `json`), `limit` (1..100000 default 10000)
- **Header Respons**: `200 OK` `text/csv` / `application/x-ndjson` / `application/json` attachment

#### 3b. `GET /api/v1/telemetry/:device_id/hourly/export`

- **Deskripsi**: Bulk export ringkasan OEE per jam (CSV/NDJSON/JSON) dengan enforce `OEE_HISTORY_RETENTION_DAYS`. Rate limit `5/min`, **SUPERVISOR/ADMIN LAN only**.
- **Query Parameters**: `from`, `to`, `format` (`csv` default, `ndjson`, `json`), `limit` (1..100000 default 10000)
- **Header Respons**: `200 OK` attachment + `X-Export-*`; header CSV menyertakan kolom `provisional`.

#### 3c. `GET /api/v1/telemetry/rollup`

- **Deskripsi**: Rollup OEE multi-mesin / harian / bulanan dari CAgg `oee_daily_summary` (SUM komponen absolut; bulanan dihitung saat baca).
- **Query Parameters**: `group_by` (`machine|day|month`, default `day`), `from` (default `now − 30 days`), `to` (default `now`), `machine_id?`, `device_id?`, `limit` (1..2000 default 500), `cursor`.
- **Header Respons**: `200 OK` → `{ data: OeeRollupItem[], meta: { limit, hasMore, truncated, nextCursor, count } }`; `400 RETENTION_EXCEEDED` bila `from` lebih tua dari `OEE_HISTORY_RETENTION_DAYS`; `400 INVALID_RANGE`; `400 INVALID_CURSOR`.
- **Field item**: `groupBy`, `bucket` (null untuk `machine`), `machineId`, `totalCount`, `goodCount`, `rejectCount`, `operatingSec`, `runSec`, `availabilityPct`, `performancePct`, `qualityPct`, `oeePct`, `sampleCount`, `provisional`. Performance memakai kapasitas berbobot waktu (`target_per_hour × operating_sec / 3600`); kapasitas nol/unknown → `null`.

#### 4. `GET /api/v1/telemetry/:device_id/aggregate`

- **Deskripsi**: Agregasi fleksibel on-demand via `time_bucket` (downsampling dinamis) berbasis `SUM(delta_*)`.
- **Query Parameters**: `from`, `to`, `bucket` (`1m|5m|15m|1h|1d`), `limit` (1..2000 default 500), `cursor`, `envelope`. Tanpa `LIMIT` implisit 500.
- **Header Respons**: `200 OK` → array polos, atau `{data, meta}` bila `cursor`/`envelope=true`; `meta.truncated` = `hasMore`; item memuat `provisional`.

#### 5. `GET /api/v1/telemetry/reconciliation/jobs`

- **Deskripsi**: Memeriksa status penjadwalan continuous aggregate background workers dan refresh policies pada TimescaleDB engine.
- **Header Respons**: `200 OK`

#### 6. `POST /api/v1/telemetry/reconciliation/refresh`

- **Deskripsi**: Memicu (_manual trigger_) rekonsiliasi seketika untuk continuous aggregate ketika edge device baru saja selesai mengunggah data _backlog store-and-forward_ (hingga 72 jam lampau). Rate limit `10/min`, **SUPERVISOR/ADMIN LAN only**.
- **Request Body (JSON)**:
  ```json
  {
    "from": "2026-09-01T00:00:00.000Z",
    "to": "2026-09-04T12:00:00.000Z"
  }
  ```
- **Header Respons**: `200 OK` / `400` / `401` / `403` / `429`

---

### L. Authentication (`Tag: Authentication`) — 020 Password Auth

#### `POST /api/v1/auth/login`

- **Deskripsi**: Verifikasi username (`operator_id`) + password (PBKDF2 salted, timing-safe) dan issue JWT `HS256` TTL dari `AUTH_JWT_TTL_SEC` (default 900s). Rate limit dari env (`AUTH_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_WINDOW_MS`, default `5/60s`) per IP+station. `401`/`429` fail-closed audit `SECURITY_REJECTION` ke `operational_events`. 401 generik tanpa user-enumeration.
- **Request Body**: `{operator_id: string, password: string min-8, station_id?: string}`
- **Header Respons**: `200 {success, token, expires_in, operator: {id, username, role, line_id}}` / `400` / `401` / `429`
- **Legacy**: `POST /api/v1/auth/operator-pin` DIHAPUS total → `404`. Klien PIN lama wajib pindah ke `/login`.

#### `POST /api/v1/auth/refresh`

- **Deskripsi**: Sliding TTL refresh JWT. Menerima token lama, mengembalikan token baru + `expires_in` (default 900s). Setiap refresh sukses mencatat audit `AUTH_TOKEN_REFRESHED`. Token kedaluwarsa/invalid → `401 UNAUTHORIZED`. Hanya dari LAN factory (`enforceSubnetOrigin`); remote tunnel read-only menolak.
- **Request Body**: `{token: string}`
- **Header Respons**: `200 {success, token, expires_in}` / `400` / `401`

#### `POST /api/v1/auth/password/change`

- **Deskripsi**: Ganti password operator yang terautentikasi (PBKDF2 salted, timing-safe). Wajib login terlebih dahulu. Rate limit sesuai kebijakan auth.
- **Request Body**: `{current_password: string, new_password: string min-8}`
- **Header Respons**: `200 {success, message}` / `400` / `401` / `403`

#### `GET /api/v1/auth/me`

- **Deskripsi**: Proyeksi capability operator saat ini (`allow`/`deny`/`unknown`) per domain + mode otorisasi, `Cache-Control: no-store`. Katalog mencakup seluruh domain berjaga (termasuk `production_line`, `shift`, `shift_schedule`); `catalogueVersion` diturunkan dari isi katalog sehingga berubah bila isi berubah (FR-032-40/42). Digunakan frontend untuk menampilkan UI yang sesuai hak akses.
- **Header Respons**: `200 {capabilities: {...}, mode: {...}}` / `401`

#### Env switches auth & guard (020, lihat `apps/backend/.env.example`)

- `OPERATOR_JWT_SECRET` [REQUIRED prod, min-16] · `AUTH_PASSWORD_MIN_LENGTH=8` · `AUTH_PBKDF2_ITERATIONS=10000` · `AUTH_JWT_TTL_SEC=900` · `AUTH_RATE_LIMIT_MAX=5` · `AUTH_RATE_LIMIT_WINDOW_MS=60000` · `ENFORCE_SUBNET_GUARD=false` (default OFF; ON = tolak IP di luar `ALLOWED_SUBNETS`, penolakan `remote-tunnel` selalu aktif).

---

### M. Mosquitto Dynamic Security (`Tag: MQTT Security`) — ADR-009 / spec 008

Mengelola klien, peran, grup, dan ACL Mosquitto Dynamic Security (dynsec) melalui REST API. Tanpa `mosquitto_ctrl` di runtime. Semua endpoint **ADMIN-only** (`verifyOperatorAuth(["ADMIN"])`); mutasi tambahan dipatok `enforceSubnetOrigin` (LAN pabrik saja; remote tunnel 403). OpenAPI tag: `MQTT Security`. Swagger UI di `/docs` (hanya LAN).

#### Arsitektur singkat

Backend berbicara ke mosquitto dynsec melalui satu koneksi MQTT.js persisten (`MosquittoDynamicSecurityService`) pada topik kontrol `$CONTROL/dynamic-security/v1`. `MqttAdminService` membungkusnya dengan daftar perintah yang diizinkan (allowlist), validasi input, pemetaan error broker, audit logging (`operational_events`, eventType `MQTT_ADMIN_*`), dan pengiriman kredensial sekali pakai.

Perilaku utama:

- Perintah dipublikasikan **QoS 0** (perintah QoS 1 tidak mendapat respons dynsec).
- Antrean perintah ter-serialisasi; pencocokan correlationData dengan fallback nama perintah.
- Timeout request dapat dikonfigurasi (`MQTT_REQUEST_TIMEOUT`, default 8000 ms).
- Tidak ada auto-retry untuk perintah non-idempoten; daftar perintah eksplisit (allowlist).
- Default-deny klien: pembuatan klien wajib ≥1 peran (FR-DSEC-007).
- Password **tidak pernah dicatat atau dikembalikan ulang** setelah pembuatan (`generatePassword()` hanya sekali).
- Pengguna yang ada (`backend_worker`, `simulator_01`, `edge_stm32_01`) tetap pada `password_file`/`acl_file`; dynsec menunda pengguna yang tidak diketahui ke file tersebut (coexistence).

#### Base path

`/api/v1/mqtt/dynamic-security/*`

#### Klien

| Metode | Path | Status | Deskripsi |
|--------|------|--------|-----------|
| GET | `/clients` | 200 | Daftar semua klien MQTT (tanpa kredensial) |
| GET | `/clients/{name}` | 200 | Ambil satu klien MQTT |
| POST | `/clients` | 201 | Buat klien (password dikembalikan sekali; ≥1 peran wajib) |
| DELETE | `/clients/{name}` | 204 | Hapus klien MQTT |
| PATCH | `/clients/{name}/password` | 200 | Rotasi password klien |
| PATCH | `/clients/{name}/enable` | 200 | Enable/disable klien (`false` = nonaktifkan/kick) |
| POST | `/clients/{name}/roles` | 201 | Assign peran ke klien |
| DELETE | `/clients/{name}/roles/{rolename}` | 204 | Hapus peran dari klien |

#### Peran

| Metode | Path | Status | Deskripsi |
|--------|------|--------|-----------|
| GET | `/roles` | 200 | Daftar semua peran dengan ACL |
| GET | `/roles/{name}` | 200 | Ambil satu peran dengan ACL-nya |
| POST | `/roles` | 201 | Buat peran (+ ACL opsional) |
| DELETE | `/roles/{name}` | 204 | Hapus peran |
| POST | `/roles/{name}/acls` | 201 | Tambah ACL ke peran |
| DELETE | `/roles/{name}/acls` | 204 | Hapus ACL dari peran (body: `{acltype, topic}`) |

#### Grup

| Metode | Path | Status | Deskripsi |
|--------|------|--------|-----------|
| GET | `/groups` | 200 | Daftar semua grup |
| GET | `/groups/{name}` | 200 | Ambil satu grup dengan anggota dan peran |
| POST | `/groups` | 201 | Buat grup |
| DELETE | `/groups/{name}` | 204 | Hapus grup |
| POST | `/groups/{name}/clients` | 201 | Tambah klien ke grup |
| DELETE | `/groups/{name}/clients/{username}` | 204 | Hapus klien dari grup |
| POST | `/groups/{name}/roles` | 201 | Assign peran ke grup |
| DELETE | `/groups/{name}/roles/{rolename}` | 204 | Hapus peran dari grup |

#### Provisioning perangkat (`POST /clients`)

Satu panggilan untuk provisioning perangkat: membuat peran per-device `device-<username>` dengan grant publish/subscribe eksplisit di bawah `oee/device/<deviceId>/#`, lalu membuat klien dengan peran tersebut. Path: `POST /api/v1/mqtt/dynamic-security/clients` dengan body `{deviceId, access, username?, password?, textname?, textdescription?}`. Mengembalikan password **sekali**; tidak disimpan, tidak dikembalikan ulang.

#### Contoh cURL

```bash
# Status integrasi dynsec
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/mqtt/dynamic-security/status

# Daftar klien
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/mqtt/dynamic-security/clients

# Buat klien baru (password dikembalikan sekali dalam respons)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"username":"edge_stm32_02","password":"s3cr3tP@ssw0rd","clientid":"STM32-02","roles":[{"rolename":"device-edge_stm32_02","priority":0}]}' \
  http://localhost:3001/api/v1/mqtt/dynamic-security/clients

# Provisioning perangkat (peran + klien dalam satu panggilan)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"username":"edge_stm32_03","deviceId":"STM32-03","access":"readwrite","password":"s3cr3tP@ssw0rd"}' \
  http://localhost:3001/api/v1/mqtt/dynamic-security/clients/provision

# Rotasi password
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"password":"baruP@ssw0rd!"}' \
  http://localhost:3001/api/v1/mqtt/dynamic-security/clients/edge_stm32_02/password
```

#### Pemetaan error

Error string broker dynsec → HTTP:

| Pesan broker | HTTP | Kode error |
|--------------|------|------------|
| already exists | 409 | `MQTT_CLIENT_ALREADY_EXISTS` / `MQTT_ROLE_ALREADY_EXISTS` / `MQTT_GROUP_ALREADY_EXISTS` |
| not found | 404 | `MQTT_CLIENT_NOT_FOUND` / `MQTT_ROLE_NOT_FOUND` / `MQTT_GROUP_NOT_FOUND` |
| invalid / empty / UTF-8 | 400 | `MQTT_INVALID_ARGUMENT` |
| error broker lain | 502 | `MQTT_ADMIN_ERROR` |

Error transport:

| Kondisi | HTTP | Kode error |
|-----------|------|------------|
| broker tidak terjangkau / tidak terhubung | 503 | `MQTT_BROKER_UNAVAILABLE` |
| timeout request | 504 | `MQTT_RESPONSE_TIMEOUT` |

Struktur respons error standar: `{error: "STRING_ERROR_CODE", message: "…"}` (lihat Bagian 2).

#### Dokumentasi lengkap

Lihat [`docs/mosquitto-dynamic-security.md`](../../../docs/mosquitto-dynamic-security.md) untuk arsitektur, konfigurasi broker, bootstrap satu kali (`dynsec-init.sh`), variabel env, dan uji coba.

### 3.3a MQTT Broker Overview (`/api/v1/mqtt/overview`)

- **Deskripsi**: Read model broker yang menggabungkan status dynamic security dan status configuration. Metrik versi/uptime/throughput broker tidak disediakan karena tidak ada sumber data nyata; frontend menyesuaikan.
- **Header Respons**: `200 OK` → `{dynamicSecurity, configuration}`

### 3.3b MQTT Configuration Versioning (`/api/v1/mqtt/configuration`) — ADR-009 / spec 008

Mengelola konfigurasi broker Mosquitto secara versioned: create/apply/rollback, diff, backup, operasi async. Semua endpoint **ADMIN-only** (`verifyOperatorAuth(["ADMIN"])`); mutasi dipatok `enforceSubnetOrigin` (LAN). Base path `/api/v1/mqtt/configuration`.

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/` | Status koneksi konfigurasi + versi aktif |
| GET | `/raw` | Konfigurasi mentah broker saat ini |
| GET | `/status` | Status engine konfigurasi |
| GET | `/configurations` | Daftar versi konfigurasi |
| POST | `/configurations` | Buat versi konfigurasi baru |
| GET | `/configurations/:versionId` | Detail versi |
| GET | `/configurations/:versionId/diff` | Diff antar versi |
| DELETE | `/configurations/:versionId` | Hapus versi (bukan aktif) |
| POST | `/configurations/:versionId/apply` | Apply versi ke broker |
| POST | `/configurations/:versionId/rollback` | Rollback ke versi |
| GET | `/operations` | Daftar operasi async |
| GET | `/operations/:operationId` | Detail operasi |
| GET | `/backups` | Daftar backup konfigurasi |

### 3.4 Admin API Dynamic Access Control (`/api/v1/access-control`)

> Spesifikasi lengkap: `apps/backend/specs/021-dynamic-access-control/spec.md` (FR-ADM-001..005, ADR-0013), `apps/backend/specs/024-abac-first-authorization/spec.md`, dan `apps/backend/specs/032-authz-fidelity-hardening/spec.md` (ADR-0019). Semua endpoint di bawah requires `fastify.enforceSubnetOrigin` (tunnel ingress ditolak tanpa syarat) → `fastify.authorize("manage"|"read", "access_control")`.
>
> Guard role tidak lagi berupa array statis per rute — matriks role dipindah ke seed policy (`apps/backend/src/authz/seed.ts`) dan ditegakkan oleh plugin `authorization`. Tunnel ingress tetap ditolak tanpa syarat (BR-002, guard jaringan terpisah dari otorisasi policy).

| Endpoint | Method | Deskripsi | Akses |
|---|---|---|---|
| `/info` | GET | Mode otorisasi, versi cache authz, dan mode efektif | ADMIN + `read` access_control |
| `/roles` | GET | Daftar semua role beserta policies-nya | ADMIN + `read` access_control |
| `/roles` | POST | Buat role baru (bukan sistem/template) | ADMIN + `manage` access_control |
| `/roles/:id` | PUT | Update deskripsi role | ADMIN + `manage` access_control |
| `/roles/:id` | DELETE | Hapus role non-sistem | ADMIN + `manage` access_control |
| `/roles/:id/permissions` | POST | Assign permission (jadi policy) ke role; `abacCondition` divalidasi struktur → `400 INVALID_POLICY` | ADMIN + `manage` access_control |
| `/roles/:id/permissions/:permissionId` | DELETE | Hapus semua policy role terhadap permission | ADMIN + `manage` access_control |
| `/permissions` | GET | Daftar katalog action × resource_type | ADMIN + `read` access_control |
| `/permissions` | POST | Buat permission baru; pasangan (action, resourceType) wajib memiliki rute penjaga — selain itu `400 INERT_PERMISSION` | ADMIN + `manage` access_control |
| `/user-roles` | GET | Daftar assignment operator → role (+ scope) | ADMIN + `read` access_control |
| `/user-roles` | POST | Assign role ke operator pada scope (ORGANIZATION/SITE/AREA/LINE/MACHINE/DEVICE) | ADMIN + `manage` access_control |
| `/user-roles` | DELETE | Revoke assignment role operator | ADMIN + `manage` access_control |
| `/policies` | GET | Daftar semua casbin policy (termasuk ABAC condition) | ADMIN + `read` access_control |
| `/policies` | POST | Buat policy; `subjectMatch` dan `abacCondition` divalidasi (grammar + whitelist atribut/operator) → `400 INVALID_POLICY`; policy reserved → `403 RESERVED_PERMISSION` | ADMIN + `manage` access_control |
| `/policies/:id` | PUT | Ubah `subjectMatch` / `resource_pattern` / `effect` / `abac_condition` / `enabled`; pelebaran policy reserved ditolak `403 RESERVED_PERMISSION`; predikat tidak sah → `400 INVALID_POLICY` | ADMIN + `manage` access_control |
| `/policies/:id` | DELETE | Hapus policy | ADMIN + `manage` access_control |
| `/audit` | GET | Daftar audit keputusan otorisasi (filter subject/decision/mode/from/to) | ADMIN + `read` access_control |

Anti-escalation & idempotensi seed:
- Role preset: hanya `ADMIN` yang immutable dan reserved untuk `ADM-001`. `SUPERVISOR`, `OPERATOR`, dan `MAINTENANCE` adalah preset opsional — dapat diubah atau dihapus bila tidak dipakai (FR-RL-002).
- Penghapusan role preset dan pencabutan pemberian bersifat **permanen**: seed berjalan **sekali per basis data** (`authz_seed_state`, migrasi `0020`) sehingga perubahan tidak dihidupkan kembali saat proses dinyalakan ulang (FR-032-11/12).
- Operator yang `is_protected` tidak dapat kehilangan role ADMIN melalui API (root protection).
- Policy DENY atau disabled pada role ADMIN ditolak (anti-lockout).
- Reserved permission (`manage:access_control`, `manage:mqtt_admin`, `manage:mqtt_configuration`, `read_raw:mqtt_configuration`) hanya dapat dipegang `subject_match = operator:ADM-001`; pemberian ke role lain ditolak `403 RESERVED_PERMISSION`.
- `subject_match` yang sah: `*`, `role:<nama>`, atau `operator:<id>`. Kedua bentuk bernama harus diawali huruf dan berpanjang 2–64 karakter; input lain → `400 INVALID_POLICY`.
- `abac_condition` adalah predikat JSON terstruktur (whitelist 10 atribut, 6 comparator: `eq`, `neq`, `in`, `contains`, `prefix`, `suffix`, plus operator `all`/`any`/`not`). Atribut/operator tak dikenal atau *leaf* dengan lebih dari satu comparator ditolak `400 INVALID_POLICY` (FR-032-31/35).
- Setiap mutasi → `reloadPolicy` enforcer → `bump authz_version` (invalidasi cache token terkait).

#### Mode keputusan (FR-PLG-004)

| Mode | Sumber keputusan | Perilaku |
|---|---|---|
| `AUTHZ_MODE=shadow` (default) | Baseline beku di memori (preset templates, `authz/baseline.ts`) — identik 1:1 dengan seed, dibuktikan `test/authz-seed-equivalence.test.ts` | Respons identik pra-migrasi (AC#3); policy dinamis dievaluasi paralel dan setiap divergensi dicatat `SHADOW_MISMATCH` (FR-032-01/03) |
| `AUTHZ_ENFORCE_DOMAINS=<domain>` | Policy dinamis untuk domain yang terdaftar | Contoh `operator,device` — flip per-domain (Fase C) |
| `AUTHZ_MODE=enforce` | Policy dinamis untuk seluruh domain | Fail-closed DENY → 403 bila tidak ada policy yang cocok (BR-001) |

Domain = `resource_type`: `operator`, `device`, `machine`, `product`, `work_order`, `device_command`, `telemetry`, `operational_event`, `downtime_event`, `mqtt_admin`, `mqtt_configuration`, `access_control`, `production_line`, `shift`, `shift_schedule`.

Env terkait: `AUTHZ_MODE` · `AUTHZ_ENFORCE_DOMAINS` · `AUTHZ_SHADOW_AUDIT` · `AUTHZ_CACHE_TTL_MS` · `AUTHZ_SHADOW_MISMATCH_WINDOW_MS` (throttle audit `SHADOW_MISMATCH` per subjek/aksi/resource, default `60000` ms) · `AUTHZ_ADMIN_SINGLETON_MODE`.

---

### N. Production Lines Master (`Tag: Production Lines`) — 028

Semua mutasi `ADMIN` LAN only (`enforceSubnetOrigin` + `authorize`), audit `MASTER_DATA_MUTATION` ke `operational_events`, WS broadcast `PRODUCTION_LINE_*`. FK `machines.line_id` `ON DELETE RESTRICT` melindungi line yang masih digunakan.

#### 1. `GET /api/v1/production-lines`

- **Deskripsi**: List semua production line. Cursor pagination (`limit` 1..100, `cursor`, `envelope`).
- **Request**: `GET /api/v1/production-lines?limit=50&envelope=true` — ADMIN LAN only.
- **Response 200 (envelope)**:
  ```json
  {
    "data": [{
      "lineId": "LINE-01",
      "lineName": "Lini Produksi 1",
      "description": null,
      "isActive": true,
      "createdAt": "2026-11-14T00:00:00.000Z"
    }],
    "meta": { "limit": 50, "hasMore": false, "truncated": false, "nextCursor": null, "count": 1 }
  }
  ```

#### 2. `GET /api/v1/production-lines/:lineId`

- **Deskripsi**: Detail 1 production line.
- **Request**: `GET /api/v1/production-lines/LINE-01` — ADMIN LAN only.
- **Response 200**:
  ```json
  { "lineId": "LINE-01", "lineName": "Lini Produksi 1", "description": null, "isActive": true, "createdAt": "2026-11-14T00:00:00.000Z" }
  ```
- **Response 404**: `{ "error": "PRODUCTION_LINE_NOT_FOUND", "message": "Production line LINE-99 not found." }`

#### 3. `POST /api/v1/production-lines`

- **Deskripsi**: Buat production line baru. **ADMIN LAN only**.
- **Request Body**:
  ```json
  { "lineId": "LINE-02", "lineName": "Lini Produksi 2", "description": null, "isActive": true }
  ```
  - `lineId` regex `^[A-Z0-9_-]{1,64}$` (required)
  - `lineName` 3..100 char (required)
  - `description` max 255 char (optional)
  - `isActive` boolean (optional, default true)
- **Response 201**: production line object.
- **Response 409**: `{ "error": "PRODUCTION_LINE_ALREADY_EXISTS", "message": "Production line LINE-02 already exists." }`

#### 4. `PATCH /api/v1/production-lines/:lineId`

- **Deskripsi**: Update `lineName`/`description`/`isActive`. **ADMIN LAN only**.
- **Response 200**: production line object.
- **Response 404**: `{ "error": "PRODUCTION_LINE_NOT_FOUND", ... }`

#### 5. `DELETE /api/v1/production-lines/:lineId`

- **Deskripsi**: Hapus production line. Guard: masih dirujuk `machines` atau `work_order` snapshot → `409 PRODUCTION_LINE_IN_USE`. **ADMIN LAN only**.
- **Response 200**:
  ```json
  { "success": true, "message": "Production line LINE-02 deleted successfully." }
  ```

---

### O. Shifts Master (`Tag: Shifts`) — 028

Semua mutasi `ADMIN` LAN only (`enforceSubnetOrigin` + `authorize`), audit `MASTER_DATA_MUTATION`, WS broadcast `SHIFT_*`.

#### 1. `GET /api/v1/shifts`

- **Deskripsi**: List semua shift. Cursor pagination.
- **Request**: `GET /api/v1/shifts?envelope=true` — ADMIN LAN only.

#### 2. `GET /api/v1/shifts/:shiftId`

- **Deskripsi**: Detail 1 shift.
- **Request**: `GET /api/v1/shifts/PAGI` — ADMIN LAN only.
- **Response 200**:
  ```json
  { "shiftId": "PAGI", "shiftName": "Pagi", "shiftCode": "PAGI", "startTime": "07:00", "endTime": "16:00", "isActive": true, "createdAt": "2026-11-14T00:00:00.000Z" }
  ```

#### 3. `POST /api/v1/shifts`

- **Deskripsi**: Buat shift baru. `start_time` harus `< end_time`. **ADMIN LAN only**.
- **Request Body**:
  ```json
  { "shiftId": "PAGI", "shiftName": "Pagi", "shiftCode": "PAGI", "startTime": "07:00", "endTime": "16:00", "isActive": true }
  ```
- **Response 201**: shift object.
- **Response 409**: `SHIFT_ALREADY_EXISTS`, `SHIFT_CODE_CONFLICT`, `SHIFT_INVALID_RANGE`.

#### 4. `PATCH /api/v1/shifts/:shiftId` — 5. `DELETE /api/v1/shifts/:shiftId`

- **Deskripsi**: Update/hapus shift. Hapus ditolak jika masih dirujuk `shift_schedules` atau `work_order` snapshot → `409 SHIFT_IN_USE`. **ADMIN LAN only**.

---

### P. Shift Schedules Master (`Tag: Shift Schedules`) — 028

Jadwal shift mingguan per production_line (`day_of_week`: 1=Senin … 7=Minggu). Semua mutasi `ADMIN` LAN only, audit `MASTER_DATA_MUTATION`, WS broadcast `SHIFT_SCHEDULE_*`. Validasi tumpang tindih waktu per `line_id` + `day_of_week` → `409 SHIFT_SCHEDULE_OVERLAP`.

#### 1. `GET /api/v1/shift-schedules`

- **Deskripsi**: List semua jadwal shift. Filter query `line_id`, `day_of_week`, `shift_id`, `is_active`. Cursor pagination.
- **Request**: `GET /api/v1/shift-schedules?line_id=LINE-01&day_of_week=1&envelope=true` — ADMIN LAN only.

#### 2. `GET /api/v1/shift-schedules/:scheduleId`

- **Deskripsi**: Detail 1 jadwal shift (termasuk `shiftName`, `shiftCode`).
- **Request**: `GET /api/v1/shift-schedules/<uuid>` — ADMIN LAN only.

#### 3. `POST /api/v1/shift-schedules`

- **Deskripsi**: Buat jadwal baru. Referensi `line_id` dan `shift_id` harus ada. Tidak boleh tumpang tindih dengan jadwal aktif lain pada `line_id` + `day_of_week` yang sama. **ADMIN LAN only**.
- **Request Body**:
  ```json
  { "lineId": "LINE-01", "shiftId": "PAGI", "dayOfWeek": 1, "isActive": true }
  ```
- **Response 201**: jadwal object (termasuk `scheduleId` UUID).
- **Response 409**: `SHIFT_SCHEDULE_OVERLAP`.

#### 4. `PATCH /api/v1/shift-schedules/:scheduleId` — 5. `DELETE /api/v1/shift-schedules/:scheduleId`

- **Deskripsi**: Update/hapus jadwal shift. Update juga menjalani validasi tumpang tindih. **ADMIN LAN only**.

---

## 4. Spesifikasi Protokol WebSocket Real-Time

- **Endpoint URL**:
  - **LAN HMI / Andon (Port 80)**: `ws://localhost/ws/telemetry`
  - **Remote Tunnel Ingress (Port 8080)**: `ws://localhost:8080/ws/telemetry` (Observation-Only)
  - **Fastify Direct Daemon (Port 3001)**: `ws://localhost:3001/ws/telemetry`
- **Protokol Handshake**: RFC 6455 `101 Switching Protocols`
- **Arsitektur**: Decoupled Hot-Path (< 50ms latensi relay dari MQTT broker ke browser HMI).

### Fitur Keamanan & Perlindungan Koneksi (Hardening)

1. **Validasi Origin (FR-008)**:
   - Setiap request HTTP Upgrade divalidasi header `Origin`-nya terhadap daftar host yang diizinkan (`ALLOWED_WS_ORIGINS`).
   - Mengizinkan origin lokal (`localhost`, `127.0.0.1`, RFC 1918 subnets) dan host tunnel resmi (`oee-monitor.example.com`).
   - Origin penyerang atau situs asing (misal `https://evil.attacker.com`) ditolak secara _fail-closed_ dengan status HTTP `403 Forbidden` dan pemutusan socket TCP seketika untuk mencegah memory/socket leak.
2. **Rate Limiting Koneksi per IP (FR-007 / AC-004)**:
   - Menggunakan algoritma _sliding window_ dengan kuota maksimum **120 koneksi baru per menit** untuk tiap alamat IP unik.
   - Koneksi yang melampaui batas kuota ditolak dengan WebSocket Close Code khusus: `4429` (_"Rate limit exceeded: max 120 connections per minute"_).
3. **Pelacakan Siklus Hidup Klien Aktif**:
   - Jumlah koneksi WebSocket aktif dilacak secara deterministik (`activeClients.size`) dan terekspos langsung pada payload `GET /health` (`ws_clients`).

### Heartbeat / Ping-Pong

- **Level**: application-level text frames (bukan WS protocol ping/pong).
- **Client Send**: Teks `"ping"`
- **Server Reply**: Teks `"pong"`
- **Server Idle Timeout**: tidak ada idle timeout server-side khusus; koneksi
  bertahan selama TCP hidup. Rate limit handshake 120 koneksi/menit/IP
  (close `4429`). Pesan klien selain `"ping"` diabaikan.
  (FR-BIGR-018, AC-BIGR-009)

### Format Pesan Broadcast (Server → Client)

**Telemetri (MQTT `oee/device/{id}/telemetry` → WS):**

```json
{
  "timestamp": 1772629200,
  "device_id": "STM32-OEE-01",
  "machine_id": "CNC-MILLING-01",
  "wo_id": "WO-20260903-01",
  "fsm_state": "RUNNING",
  "counters": {
    "total": 1420,
    "good": 1402,
    "reject": 18,
    "last_cycle_sec": 4.48
  },
  "time_metrics_sec": {
    "operating_time": 14400,
    "run_time": 12960,
    "downtime": 1440
  },
  "oee": {
    "availability": 90.0,
    "performance": 94.31,
    "quality": 98.73,
    "total_oee": 83.8
  },
  "plc_modbus": {
    "spindle_rpm": 1450.0,
    "temp_c": 42.5,
    "alarm_code": 0
  },
  "hw_diag": {
    "uptime_sec": 86420,
    "free_heap": 48200
  },
  "is_buffered": false
}
```

> **Catatan Pemisahan Backlog**: Jika payload membawa `is_buffered: true` (data histori LittleFS), relay WebSocket secara otomatis mengabaikannya agar tidak menginterupsi visual dashboard 60 FPS. Data langsung dialirkan ke in-memory micro-batch buffer untuk persistensi database.

**Broadcast Baru 015:**

```json
// Machine lifecycle
{"type": "MACHINE_BOUND", "machine_id": "CNC-MILLING-03", "device_id": "STM32-OEE-03"}
{"type": "MACHINE_UNBOUND", "machine_id": "CNC-MILLING-01", "device_id": "STM32-OEE-01"}
{"type": "MACHINE_DELETED", "machine_id": "CNC-MILLING-03"}
// Product lifecycle
{"type": "PRODUCT_DELETED", "product_id": "PRD-GEAR-BOX-12"}
// Work order lifecycle
{"type": "WORK_ORDER_CANCELLED", "device_id": "STM32-OEE-01", "machine_id": "CNC-MILLING-01", "data": {"wo_id": "WO-20260903-01", "status": "ABORTED"}}
```

---

## 5. Integrasi Zero Trust & Identitas Cloudflare Access

Pada saat sistem diakses dari luar pabrik melalui Cloudflare Tunnel (Remote Ingress Port 8080):

1. **Header Identity Assertion**:
   - Cloudflare Edge menambahkan header `Cf-Access-Jwt-Assertion` setelah pengguna berhasil melewati autentikasi SSO Zero Trust (IdP).
   - Nginx meneruskan header ini ke Fastify backend daemon.
2. **Dekorasi Request Fastify (`request.remoteUser`)**:
   - Plugin [`backend/src/plugins/zero-trust.ts`](../src/plugins/zero-trust.ts) membaca dan mengekstrak klaim identitas:
     ```typescript
     request.remoteUser = {
       id: decoded.sub,
       email: decoded.email,
       userUuid: decoded.user_uuid,
     };
     ```
   - Jika permintaan berasal dari LAN pabrik (Port 80), header ini tidak ada dan `request.remoteUser` disetel `undefined` secara aman tanpa melempar exception.
   - Identitas `remoteUser` otomatis tercatat dalam structured log pino untuk audit trail akses remote.

---

## 6. Kontrak Integrasi 016 (FR-BIGR-014..018)

### A. Himpunan FSM Kanonis (FR-BIGR-014)

Sumber kebenaran: `FsmStateEnum` di `src/infrastructure/mqtt/schema.ts`:

`UNCONFIGURED`, `READY`, `RUNNING`, `PLANNED_DOWNTIME`, `UNPLANNED_DOWNTIME`, `BATCH_FINISHED`.

`LiveStateResponseSchema` (`GET /api/v1/live-state`) memakai `currentState: string` dengan nilai dari himpunan di atas. Frontend menormalkan backward-compatible.

### B. Tabel Mutasi 204-vs-Body (FR-BIGR-015)

| Endpoint | Success | Body |
|---|---|---|
| `POST /api/v1/devices` (register) | `201` | `DeviceResponse` |
| `PUT /api/v1/devices/:id` | `200` | `DeviceResponse` |
| `DELETE /api/v1/devices/:id` | `200` | `{success,message}` |
| `POST /api/v1/devices/:id/command` | `200` | `DeviceCommandResponse` |
| `POST /api/v1/machines` (create) | `201` | `MachineResponse` |
| `PUT /api/v1/machines/:id` | `200` | `MachineResponse` |
| `DELETE /api/v1/machines/:id` | `200` | `{success,message}` |
| `POST /api/v1/machines/:id/bind` | `200` | `MachineResponse` |
| `POST /api/v1/machines/:id/unbind` | `200` | `MachineResponse` |
| `POST /api/v1/operators` (create) | `201` | `OperatorResponse` |
| `PUT /api/v1/operators/:id` | `200` | `OperatorResponse` |
| `PATCH /api/v1/operators/:id/password` | `200` | `{success,message}` |
| `PATCH /api/v1/operators/:id/status` | `200` | `OperatorResponse` |
| `DELETE /api/v1/operators/:id` | `200` | `{success,message}` |
| `POST /api/v1/work-orders/:id/dispatch` | `200` | `{success,dispatch_tx_id,work_order}` |
| `POST /api/v1/work-orders/:id/complete` | `200` | `{success,work_order,summary?}` |
| `POST /api/v1/work-orders/:id/cancel` | `200` | `{success,work_order}` |
| `POST /api/v1/downtime-events/:id/reason` | `200` | `{success,eventId,operatorReason,isOverwrite}` |
| `PATCH /api/v1/operational-events/:id/ack` | `200` | `{id,acknowledgedAt,acknowledgedBy,ackNote}` |
| `POST /api/v1/auth/login` | `200` | `{success,token,expires_in,operator}` |
| `POST /api/v1/auth/refresh` | `200` | `{success,token,expires_in}` |
| `POST /api/v1/auth/password/change` | `200` | `{success,message}` |
| `GET /api/v1/auth/me` | `200` | `{capabilities, mode}` |
| `GET /api/v1/devices/:id/health` | `200` | `DeviceHealthResponse` |
| `PATCH /api/v1/operational-events/:id/ack` | `200` | `{id,acknowledgedAt,acknowledgedBy,ackNote}` |

Tidak ada endpoint mutasi yang memakai `204 No Content`; seluruh mutasi mengembalikan body JSON di atas.

### C. Bentuk `GET /api/v1/live-state` (FR-BIGR-016)

Tetap **naked array** (`200: LiveStateResponse[]`). Frontend sudah envelope-tolerant. Tidak ada perubahan ke envelope `{data,meta}`.

### D. Kebijakan Auth TTL / Refresh (FR-BIGR-017, G13)

- TTL token operator: **900 detik (15 menit)**.
- Refresh: `POST /api/v1/auth/refresh {token}` → `{success,token,expires_in:900}` dengan sliding TTL; token kedaluwarsa/invalid → `401 UNAUTHORIZED`. Setiap refresh sukses mencatat audit `AUTH_TOKEN_REFRESHED`.
- Refresh hanya dari LAN factory (`enforceSubnetOrigin`); tunnel read-only.

### E. Break Window & Hourly Trend (FR-BIGR-004/006/007)

- `GET /api/v1/work-orders/:id/resolve` mengembalikan aditif: `targetPerHour` (`round(targetQty/plannedOperatingSec*3600)`) dan `break: {start,end,minutes}`. Konvensi: break menempati `planned_break_min` menit terakhir sebelum `shift_end` (cross-midnight safe). `shift_plan` lama tetap dipertahankan.
- `GET /api/v1/telemetry/:id/hourly` mengembalikan aditif per bucket: `targetPerHour`, `state` (FSM dominan dari `oee_telemetry_logs` per jam), `planned` (`true` bila `state` adalah `PLANNED_DOWNTIME`/`PLANNED_STOP`). Query `from`/`to` dihormati; default 72 bucket terakhir bila tanpa filter.

### F. Reject Breakdown & Edge Health (FR-BIGR-001..003/008..010)

- `GET /api/v1/quality/rejects?from=&to=&limit=&cursor=&envelope=` → pareto tingkat plant (agregasi UNCLASSIFIED lintas device). Tanpa data → `[]`.
- `GET /api/v1/quality/rejects/:device_id?from=&to=&limit=&cursor=&envelope=` → pareto `[{reason,count,pct}]` (G1: `UNCLASSIFIED` delta `reject_count`, total dapat direkonsiliasi dengan `device_live_state.rejectCount`). Tanpa data → `[]` (jujur, no fabrikasi).
- `GET /api/v1/devices/:id/health` → cache MQTT `oee/device/{id}/health` terakhir `{deviceId,timestamp,heapFree,tasksHealthy,tasksTotal,staleCount,staleTasks[],eventFlags,ageSec}`. Cache miss → `ageSec: 999999` + field nol.
  Konvensi casing: respons memakai camelCase (konsisten `live-state`/`DeviceResponse`); gap doc G3/G4 mengusulkan snake_case — `PATCH /operational-events/:id/ack` menerima **kedua** `operatorId`/`operator_id`.

---

## 7. Kontrak Alignment 019 (FR-SHIFT, FR-WS, FR-SCHEMA, FR-PRES, FR-WO, FR-DT, FR-AUTH, FR-DATA)

### A. WS Relay Envelope Kanonis (FR-WS-001, AC-M3/D3)

Setiap broadcast WS memakai envelope `{type, device_id?, machine_id?, data, received_at/timestamp}`:

```json
// TELEMETRY_UPDATE (MQTT oee/device/{id}/telemetry QoS1 → WS, no DB di hot-path)
{"type": "TELEMETRY_UPDATE", "topic": "oee/device/STM32-OEE-01/telemetry",
 "device_id": "STM32-OEE-01", "machine_id": "CNC-MILLING-01",
 "data": {"timestamp": 1790751450, "counters": {"total": 1420, "good": 1402, "reject": 18},
          "oee": {"availability": 90.0, "performance": 94.31, "quality": 98.73, "total_oee": 83.8},
          "plc_modbus": {"spindle_rpm": 1450.0, "temp_c": 42.5, "alarm_code": 0}},
 "received_at": "2026-09-30T08:50:46.000Z"}
// HEALTH_UPDATE (MQTT oee/device/{id}/health QoS0 → WS, no DB per FR-MQTT-006)
{"type": "HEALTH_UPDATE", "device_id": "STM32-OEE-01",
 "data": {"timestamp": 1790751450, "heap_free": 48200, "tasks_healthy": 9, "tasks_total": 9,
          "stale_count": 0, "event_flags": 0},
 "timestamp": "2026-09-30T08:50:46.000Z"}
```

- `data.timestamp` dalam **detik** Unix (mis. `1790751450`), bukan milidetik.
- Klien MUST abaikan `type` yang tidak dikenal (ignore-unknown by design); server MAY tambah advisory types tanpa versioning.
- Reserved namespace (FR-WS-002): `DOWNTIME_STARTED|DOWNTIME_ENDED {device_id, machine_id, data: {id, category, start_time, end_time?}}`, `SHIFT_*`.

### B. Time Keys per Endpoint (FR-SCHEMA-003, AC-D2)

| Endpoint | Time key | Satuan |
|---|---|---|
| WS frame `data.timestamp` | `timestamp` | detik Unix |
| `GET /telemetry/:id` rows | `recordedAt` | ISO string |
| `GET /telemetry/:id/hourly|aggregate` buckets | `bucket` | ISO string |
| `GET /live-state` | `lastTelemetryAt`, `updatedAt` | ISO string |

Clean payload tidak menghasilkan titik 1970-epoch (klien fallback epoch hanya bila semua key absen).

> **D1 reconciliation (FR-SCHEMA-002):** `*Pct`/`availabilityPct/performancePct/qualityPct/oeePct` dan `totalCount/rejectCount/goodCount` adalah **SUM komponen absolut dari delta per-bucket** (fitur `025`, ADR-0015), sedangkan `live-state` adalah **kumulatif lifetime**. Keduanya hanya sebanding bila bucket berisi produksi aktif: bucket idle (mis. SIM `UNCONFIGURED`, counter 0) benar menghasilkan `0` — bukan bug. Bucket `RUNNING` dengan sampel non-zero MUST menghasilkan time fields non-zero; bila tidak, itu regresi agregasi. Perbandingan `oee` vs `live-state` ±0.1 hanya valid pada jam produksi yang sama. `hourlyDowntimeSec` dihapus (downtime sumber kebenarannya ada di `downtime_events.duration_sec`).

### C. `machineName` Informational (FR-SCHEMA-005, AC-D5)

`machineName` di `GET /live-state` bersifat informational-only (fallback display bila registry unreachable); kontrak memakai `machineId` join `machines`.

### D. FSM Kanonis + STANDBY (FR-SCHEMA-006, AC-D6, ADR-0011)

Kanonis 6 nilai (`FsmStateEnum`): `UNCONFIGURED`, `READY`, `RUNNING`, `PLANNED_DOWNTIME`, `UNPLANNED_DOWNTIME`, `BATCH_FINISHED`. Legacy `STANDBY` (satu baris `STM32-OEE-02`, bukan emisi producer) dinormalisasi server → `READY` di read boundary (`live-state`, `shift-timeline`).

### E. Aturan `isOnline` (FR-PRES-001/002, AC-L1)

`isOnline` = proyeksi TTL atas `last_seen_at` (default `DEVICE_PRESENCE_TTL_SEC=300`, sweep 30 s, throttle tulis 1/device/30 s, transition-only, `health` excluded — ADR-008 + 017). `last_seen_at` dimajukan setiap frame valid. `resolve` memakai proyeksi TTL, bukan flag mentah: telemetry < 30 s → `isOnline: true`, `resolve` 200; `DEVICE_OFFLINE` (503) hanya bila `last_seen_at` lampaui TTL.

### F. 409 `active_wo_id` (FR-WO-001, AC-L2)

Konflik WO mengembalikan aditif `{error: "CONFLICT", active_wo_id: "WO-…", message: "…"}`; `active_wo_id` langsung resolvable via `resolve` dengan `device_id` sama.

### G. Downtime Flags Kanonis (FR-DT-001, AC-L3)

`GET /api/v1/downtime-events/:device?active_only=true&unlabeled_only=true` = `end_time IS NULL` + `operatorReason IS NULL`. Nama parameter final, tidak berubah.

### H. Tabel Auth per Endpoint (FR-AUTH-001, AC-L4, ADR-0010)

| Endpoint | GET read | Mutasi | Keterangan |
|---|---|---|---|
| `/devices`, `/:id`, `/:id/health` | open | ADMIN LAN | health public read |
| `/machines`, `/products` | open | ADMIN LAN | list/detail public |
| `/operators` | **ADMIN/SUPERVISOR LAN Bearer** | ADMIN/SUPERVISOR LAN | **protected** — roster identitas, bukan deskriptor terbuka |
| `/live-state`, `/telemetry/*`, `/quality/*`, `/oee/*` | open | — | read-only, tunnel-safe |
| `/downtime-events/*` read | open | OPERATOR+ LAN | label mutasi operator |
| `/operational-events` read+ack | open read | OPERATOR+ LAN | ack idempoten |
| `/work-orders` resolve/dispatch/complete/cancel | — | OPERATOR+ LAN | resolve baca tapi gate `DEVICE_OFFLINE` |
| `/auth/login`, `/auth/refresh` | LAN | LAN | login username/password + refresh sliding TTL env (`AUTH_JWT_TTL_SEC`, default 900 s), token lama TIDAK diinvalidasi (stateless JWT, expiry = revocation), audit `AUTH_TOKEN_REFRESHED` best-effort |

### J. Schema Canon per Endpoint (FR-SCHEMA-001, AC-D1)

Kanonis `hourly`/`aggregate`: `availabilityPct/performancePct/qualityPct/oeePct` (string-numeric nullable, rasio dari total SUM, bukan `AVG`) + `totalCount/rejectCount/goodCount` (`SUM` dari delta counter, `good = max(0, output − reject)`) + `operatingSec/runSec` (delta) + `sampleCount` + aditif `targetPerHour/state/planned`. Raw history kanonis: `totalCount/goodCount/rejectCount` + `recordedAt`. Tidak ada nama legacy ganda di dokumentasi; respons tidak menghapus field existing. `hourlyDowntimeSec` dihapus.

### I. Shift Endpoints (FR-SHIFT-001/002, AC-M1/M2)

- `GET /api/v1/oee/shift-summary?machine_id=&device_id=&from=&to=&date=&shift=` → `{oee, availability, performance, quality, time_sec: {operating, run, downtime}, window: {from, to, tz}, target_per_hour, hourly?}`. `window` cerminkan `shift_start/end` WO aktif (overnight-safe); tanpa WO → window dari `from`/`to` eksplisit; tanpa sampel → fallback `live-state` terdokumentasi.
- `GET /api/v1/oee/shift-timeline?...&bucket=1m|5m|15m|1h` → gapless `[{start, end, state, planned, downtime_id?}]`; bucket kosong → state terakhir / `UNCONFIGURED`; `1m` dibatasi window ≤ 6 h.
- `GET /api/v1/oee/hourly?machine_id=&device_id=&from=&to=&limit=&cursor=&envelope=` → ringkasan OEE per jam yang diselesaikan dari `machine_id` atau `device_id` (delegasi ke `/telemetry/:device_id/hourly`).

## 024 ABAC-First Authorization (ringkas)

- Role adalah data dengan nama string bebas (`[A-Za-z][A-Za-z0-9_-]{1,63}`), bukan enum compile-time.
- `operators.role` adalah **label** tampilan/legacy, bukan sumber otorisasi. `effectiveRoles` (dari `authz_user_roles`) adalah otoritas.
- `GET /api/v1/auth/me` memproyeksikan capability `allow/deny/unknown` + mode per domain, `Cache-Control: no-store`.
- Reserved permission (`manage:access_control`, `manage:mqtt_admin`, `manage:mqtt_configuration`, `read_raw:mqtt_configuration`) hanya `ADMIN`/`ADM-001`.
- Bootstrap: instalasi baru hanya `ADM-001`; bootstrap sekali pakai via `BOOTSTRAP_ADMIN_PASSWORD` atau `BOOTSTRAP_ADMIN_PASSWORD_FILE`.
