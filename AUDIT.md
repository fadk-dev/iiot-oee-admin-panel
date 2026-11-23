# Audit Codebase — IIoT OEE Admin Panel

**Tanggal:** 16 November 2026
**Repo:** `fadk-dev/iiot-oee-admin-panel` (branch `main`)
**Dokumen acuan:** `API_DOCUMENTATION.md` (1780 baris) + `ADMIN_PANEL_BUILD_GUIDE.md` (1553 baris)
**Hasil akhir:** `tsc --noEmit` **0 error** · `npm test` **70/70 lolos** · `npm run build` **sukses**

> Audit ini membandingkan codebase dengan kedua dokumen di atas, lalu memperbaiki
> semua gap yang ditemukan. Backend belum ada: panel berjalan dalam **mode Demo**
> (store in-memory) secara default, dengan **mode Real** (HTTP ke backend)
> yang bisa diaktifkan tanpa mengubah satu pun halaman.

---

## 1. Cara memakai mode Demo / Real

| Cara | Keterangan |
| --- | --- |
| Default | `demo` — data seed di memori, login demo `ADM-001` / password apa pun ≥ 4 karakter |
| Env | `VITE_API_MODE=demo\|real` di `.env` (lihat `.env.example`) — **satu-satunya sumber mode** |
| Topbar | Bila `VITE_ALLOW_API_MODE_SWITCH=true` (dev lokal saja): pilih **API: Demo / Real** — halaman dimuat ulang. Bila terkunci (default): Topbar hanya menampilkan badge read-only |
| Query | `?api=real` atau `?api=demo` — hanya berlaku bila switch diizinkan di env |

Prioritas saat switch diizinkan: `?api=` > `localStorage['iiot-oee-api-mode']` > `VITE_API_MODE` > `demo`.
Saat switch terkunci (default produksi): mode = `VITE_API_MODE` > `demo`; query +
localStorage diabaikan. Pilihan mode tersimpan di localStorage (bukan token — token
tetap **hanya di memori**, D5). Detail lengkap + daftar semua variabel env: lihat
§8 (audit konfigurasi env 2026-11-16).

**Mode Real butuh backend** dengan base URL `VITE_API_URL` (kosong = `origin + /api/v1`,
Nginx dual-vhost). Tanpa backend, mode Real akan gagal koneksi (pesan `NETWORK`) —
itu perilaku yang benar, bukan bug. WebSocket memakai `VITE_WS_URL` atau
`ws(s)://<host>/ws/telemetry`.

---

## 2. Temuan audit & status perbaikan

### 2.1 Gap utama (semua sudah diperbaiki)

| # | Temuan | Bukti | Perbaikan |
| --- | --- | --- | --- |
| 1 | **Tidak ada HTTP sama sekali** — `client.ts` 0 `fetch`, murni mock in-memory; tidak ada switch demo/real | `grep fetch src/services/api/client.ts` → 0 | `src/services/api/mode.ts` (resolusi mode) + `src/services/api/httpClient.ts` (transport HTTP lengkap, ~3400 baris) + selector `apiClient` di akhir `client.ts` |
| 2 | **Login demo rusak (tersembunyi)** — `login()` mem-`parse` respons dengan field `user`, padahal `LoginResponseSchema` mewajibkan `operator: {id, username, role, line_id}` → ZodError setiap login | `client.ts` lama baris ~764 | `login()` kini mengembalikan `operator`; `refreshSession()` kini menyertakan `success: true` (juga wajib skema, sebelumnya hilang) |
| 3 | **Sesi pra-login melanggar §4.4/D5** — `AuthProvider` start dengan `isAuthenticated=true` sebagai ADM-001 + token `mem_jwt_initial_admin_lan` | `AuthContext.tsx` lama | `isAuthenticated=false`, `currentUser` kosong, `authzVersion=0`, TTL 0 — pengguna **wajib login** lewat `/login` |
| 4 | **3 method client hilang** — `useProductionLinesQuery`/`useShiftsQuery`/`useShiftSchedulesQuery` memanggil `getProductionLinesPage`/`getShiftsPage`/`getShiftSchedulesPage` yang tidak ada (crash saat halaman dipakai) | diff panggilan vs definisi apiClient | Method + store + CRUD demo lengkap untuk ketiganya; halaman baru `ProductionLinesPage`, `ShiftsPage`, `ShiftSchedulesPage` + route `/admin/lines`, `/admin/shifts`, `/admin/shift-schedules` + entri Sidebar (grup Assets) |
| 5 | **Route §5 belum lengkap** — tidak ada halaman/route/sidebar untuk lines, shifts, shift-schedules | `Router.tsx` lama | Lihat #4 |
| 6 | **Trailing slash wajib hilang** — `GET /operational-events` tanpa `/` (Guide §6.7: wajib) | `endpoints.ts`, `historicalExport.ts:423` | Template + builder diubah ke `/api/v1/operational-events/`; 2 regex test lama yang mengassert path tanpa slash diperbarui |
| 7 | **`npm install` gagal** — esbuild `^0.25.0` bentrok peer vite 8.3 (`^0.27.0 \|\| ^0.28.0`) | ERESOLVE | esbuild → `^0.28.0`; install sukses (191 paket) |
| 8 | **Tidak ada test runner** — 8 file test `node:test` tapi tanpa script | `package.json` lama | `"test": "tsx --test \"src/**/*.test.ts\""` + file test baru `modeAndTransport.test.ts` (10 test) |
| 9 | **WebSocket demo reconnect-loop** — `telemetrySocket` mencoba WS sungguhan ke origin tanpa server | `telemetrySocket.ts` | Mode Demo: simulasi lokal `TELEMETRY_UPDATE` tiap 5 detik (4 device seed, jitter OEE/counter); mode Real: WS sungguhan tidak berubah |
| 10 | **Pengalih peran di Topbar tembus mode Real** — `setRole` bisa mengalihkan peran tanpa login | `AuthContext.tsx`, `Topbar.tsx` | **DIHAPUS TOTAL (2026-11-16, §8):** `AuthContext.setRole` + select Role di Topbar dihapus — ganti peran HANYA lewat login (logout dulu, login sebagai operator lain). `demoApiClient.setUserRole` dipertahankan sebagai seam store untuk test saja, tidak terjangkau UI; `httpApiClient.setUserRole` tetap no-op |
| 11 | **Komentar registry salah** — header mengklaim "111 Admin REST candidates" | `endpoints.ts:2` | Dikoreksi: **131** Admin REST candidates + 1 WebSocket = 132 |
| 12 | **`.env.example` berisi variabel AI Studio** (`GEMINI_API_KEY`, `APP_URL`) | `.env.example` lama | Dihapus; ditambah `VITE_API_MODE=demo` + komentar §4.1 |

### 2.2 Yang LOLOS audit (tidak perlu diperbaiki)

- **Safety boundary (ADR-003):** tidak ada implementasi `POST /devices/:id/command`,
  `dispatch` / `complete` / `validate-zone` / `initiate-from-zones` / `clients/provision`
  di mana pun; test `iamAndSecurity` mengassert ketiadaan method tersebut. ✅
- **Registry endpoint:** 131 pasangan method+template, mencakup 130/131 kandidat admin
  (kekurangan 1 = trailing slash #6, sudah diperbaiki). 5 operasi HMI/aktuasi
  benar-benar dikecualikan. ✅
- **Kontrak HTTP §4.2 sudah tersedia sebagai util:** `normalizeListResponse`,
  `mapHttpErrorToApiError`, `isRetryableHttpStatus`, `retryIdempotentRead`,
  envelope error, Zod schemas — dipakai ulang oleh transport baru. ✅
- **IAM fidelity §4.6g:** transport HTTP **tidak** mengirim `privilege_level`
  (body create role = `{name, description?}`) dan tidak menegakkan hierarki
  client-side; server yang memutuskan (403 final). ✅

### 2.3 Transport HTTP (mode Real) — kontrak yang dipenuhi

- Base URL `VITE_API_URL` atau `origin + /api/v1`; `/health` tanpa prefix
  (perbaikan bug: prefix sempat ganda `/api/v1/api/v1/...`, ketahuan oleh test stub).
- `Authorization: Bearer <token>` per panggilan; token **hanya di memori** (D5).
- Timeout: baca 10 dtk, mutasi 15 dtk, ekspor 120 dtk (env §4.1).
- Retry **hanya** GET yang gagal jaringan / 502 / 503 / 504, maks 3x,
  backoff eksponensial + jitter. Tidak pernah retry 4xx atau mutasi.
- Normalisasi list: array langsung **atau** `{data, meta}` (D7);
  `meta.limit` opsional (backend boleh tidak menyertakannya).
- Error envelope `{error, message, issues?, active_wo_id?}` dipetakan terpusat;
  401 → logout, 403 → capability diturunkan (AuthContext).
- Ekspor mengembalikan file: baca `Content-Disposition` + header `X-Export-*`.
- `204 No Content` (hapus dynsec) tidak diharapkan berisi JSON.
- Mutasi diblokir saat `REMOTE_TUNNEL` (D1, kecuali ekspor).
- Pemetaan casing: backend campuran camelCase/snake_case dinormalkan ke
  snake_case lokal, jadi ganti mode tidak mengubah UI.
- Seluruh 131 operasi admin tersedia di `httpApiClient` dengan **nama +
  signature identik** dengan demo client (termasuk `getTelemetryHistoryPage`,
  `getHourlyTrend`, `getRejectPareto(Global)`, `getShiftSummary`,
  `getBrokerConfig*`, `toggleIamPolicy`, `triggerReconciliationRefresh`, dll).

---

## 3. Diskrepansi antar dokumen (dicatat, bukan diasumsikan)

| # | Topik | API Documentation | Build Guide | Yang dipakai implementasi |
| --- | --- | --- | --- | --- |
| D-1 | `POST /auth/password/change` body | `{current_password, new_password}` (§L) | `{old_password, new_password}` (Lamp. J) | API doc §L |
| D-2 | `GET /auth/me` shape | `{operator, authz: {...}}` (§L) | Bentuk flat (§4.9) | **Keduanya** — `mapAuthMe` menangani kedua bentuk secara defensif |

---

## 4. Deviasi demo-only yang diketahui (terdokumentasi, bukan bug)

- **Hierarki peran demo:** demo `createIamRole` masih memvalidasi `privilege_level`
  + `CUSTOM_ROLE_MAX_LEVEL` (kini **29**, sesuai Guide §6.8/§7.1 — sebelumnya 100,
  padahal pesan error-nya sendiri menulis "(1–29)"). Backend sudah menghapus
  hierarki statis (§4.6g); transport HTTP tidak mengirim `privilege_level`.
- **Katalog permission demo = 29** (22 awal + 7 master device/lines/shifts).
  Dokumen tidak mengenumerasi jumlah katalog; test `Test B` diperbarui ke 29.
- **Kunci katalog permission memakai singular** (`ack:operational_event`,
  `create:operator`, `update:operator`) sesuai policy di API doc; bukan plural.

---

## 5. Bug pra-ada yang ikut diperbaiki (di luar gap audit, ditemukan saat verifikasi)

`tsc --noEmit` awal: **166 error** → **0**. `npm test` awal (pohon bersih):
**10 gagal** → **0 gagal** (65/65). Yang diperbaiki:

| Area | Masalah |
| --- | --- |
| `SystemHealth` | Tipe + seed hanya bentuk lean (`status: 'ok'`, tanpa `backend`/`uptime_seconds`/dst), padahal `SystemHealthPage`, `OverviewPage`, dan test kontrak membaca bentuk rich → halaman akan crash (`health.backend.status` dari `undefined`). Tipe dilebarkan ke bentuk rich, seed + mapper HTTP dilengkapi. |
| `Product` | Tipe tidak punya `sku`/`active` padahal dipakai `ProductsPage` + `createProduct`/`updateProduct`. Ditambah ke tipe + seed (4 produk). |
| `DeviceHealth.eventFlags` | Skema + seed memakai bitmask angka, tapi demo `getDeviceHealth` (2 dari 3 jalur) + drawer memakai `string[]` → `DeviceHealthSchema.parse` melempar ZodError untuk device offline/sehat. Diseragamkan ke `string[]` (seed + skema + mapper HTTP dekode bitmask). |
| `Machine` / `EdgeDevice` | Tipe ketinggalan `updated_at`, `code`, `serial_number` yang dipakai kode. Ditambah (opsional). |
| `HourlyOeePoint` / `TelemetryRollupItem` | Ketinggalan `hourly_downtime_sec`, `groupKey` (dipakai paginasi cursor). Ditambah; `getTelemetryRollup` demo tidak mengisi `groupBy`/`machineId` (ZodError) — dilengkapi di 3 cabang (machine/day/month). |
| `RejectParetoItem.pct` | Wajib di tipe tapi tidak ada di seed demo → dibuat opsional. |
| `getSystemAuditPage` | Param `event_type` dipakai pemanggil tapi tidak ada di tipe query (demo + HTTP). Ditambah + diteruskan. |
| `CUSTOM_ROLE_MAX_LEVEL` | 100, padahal Guide + pesan error sendiri bilang 29. Diubah ke 29. |
| `isSystemRoleName` | Hardcode `=== 'ADMIN'` padahal `SYSTEM_ROLE_NAMES` ada — SUPERVISOR/OPERATOR/MAINTENANCE lolos proteksi update/delete. Kini memakai array 4 nama. |
| `PaginationMetaSchema` | `limit` wajib padahal normalizer sudah fallback — dibuat opsional (D7). |
| Login di test | `iamWorkflows.test.ts` mengassert bentuk lama `loginRes.user.*` / `authz_version` (bentuk yang rusak itu) — diperbarui ke `operator.*`. |
| `refreshSession` demo | Mengembalikan `parsed.authz_version` yang tidak ada di skema — diganti sumber `store.iamInfo.authzVersion`. |

---

## 6. Yang BELUM diverifikasi (butuh backend / browser sungguhan)

- **Mode Real end-to-end:** belum ada backend untuk diuji — transport HTTP
  diverifikasi terhadap stub server lokal (`node:http` di `modeAndTransport.test.ts`:
  login, retry 503→200, trailing slash, 409 tanpa retry, header Bearer).
- **Tampilan visual di browser sungguhan:** tidak bisa dari VM ini (loopback/tunnel
  diblokir, sama seperti proyek sebelumnya). Build terverifikasi serve HTTP 200
  via `vite preview`; cek visual 3 halaman baru + Topbar (badge API read-only,
  tanpa select Role) dilakukan Fathur setelah `npm run dev`.
- **Live broker / MQTT / ESP32:** tidak ada — WebSocket mode Real belum diuji
  terhadap broker sungguhan.

---

## 7. Menjalankan

```bash
npm install        # esbuild ^0.28.0 (vite 8.3)
npm run dev        # http://localhost:3000 — login ADM-001 / password apa pun ≥4 karakter (demo)
npm run lint       # tsc --noEmit — harus 0 error
npm test           # tsx --test — harus 70/70
npm run build      # vite build (peringatan chunk >500 kB sudah ada sebelumnya)
```

File kunci: `src/services/api/mode.ts`, `src/services/api/httpClient.ts`,
`src/services/api/client.ts` (demo + selector), `src/services/api/modeAndTransport.test.ts`,
`AUDIT.md` (file ini).

---

## 8. Audit konfigurasi env — tindak lanjut 2026-11-16

**Permintaan:** konfigurasi & switch sistem yang sebaiknya di env dipindahkan
ke env; preset login demo tetap ada tapi mati di env `!demo`; tombol non-standar
di admin panel (ganti role langsung) dihapus/dipindahkan — ganti peran harus
lewat login (logout dulu).

**Temuan audit:** sebelum perbaikan, env hanya memegang 6 variabel
(`VITE_API_MODE/API_URL/WS_URL/AUTH_TTL_FALLBACK_SEC/REQUEST_TIMEOUT_MS/EXPORT_TIMEOUT_MS`)
dan kalah prioritas dari `?api=` + localStorage + select Topbar. Switch lain
hidup di UI/hardcode: select Role Topbar (ganti peran tanpa login),
tombol simulasi mode jaringan di banner (bisa mengklaim LAN palsu dari tunnel),
port tunnel `8080`, timeout mutasi 15s, retry maks 3, TTL demo `900`,
heartbeat WS 25s, backoff 30s, simulasi demo 5s, lockout login 5×/30s,
label `Plant 01`, station default — semua hardcoded; `LoginPage` selalu
prefill `ADM-001`/`Admin@2026!` + tombol preset di mode apa pun.

**Perbaikan — satu sumber kebenaran `src/services/api/mode.ts`** (semua baca
`import.meta.env`/`process.env` hanya lewat `readEnv()` di file itu):

| Konfigurasi / switch | Sebelum | Sesudah (env) |
| --- | --- | --- |
| Mode API | `?api=` > localStorage > env | **Env menang (terkunci)**; override runtime hanya bila `VITE_ALLOW_API_MODE_SWITCH=true` (dev lokal) |
| Switch mode di Topbar | Select selalu aktif | Badge read-only bila terkunci; select hanya bila switch diizinkan |
| Preset login demo | Selalu tampil + prefill di semua mode | `isDemoPresetLoginEnabled()`: hidup hanya bila mode efektif `demo` **DAN** `VITE_API_MODE ≠ real` **DAN** `VITE_DEMO_PRESET_LOGIN ≠ false` — mati total di env real, sekalipun mode dialihkan ke demo |
| Ganti role langsung | Select Role di Topbar (`AuthContext.setRole`) | **Dihapus**: `setRole` + select dihapus; ganti peran = logout → login sebagai operator lain. `demoApiClient.setUserRole` tinggal seam test, tak terjangkau UI |
| Simulasi mode jaringan | Tombol "Mode Remote Tunnel" / "Kembali ke LAN" selalu tampil | Banner jadi indikator saja; tombol hanya bila `VITE_ALLOW_NETWORK_MODE_SIMULATION=true` (dev lokal) |
| Deteksi jaringan D1 | Port `8080` hardcoded | `VITE_NETWORK_MODE` (override) + `VITE_TUNNEL_PORT` (default 8080) |
| Timeout mutasi / retry | `15_000` / `3` hardcoded di httpClient | `VITE_MUTATION_TIMEOUT_MS` (15s), `VITE_HTTP_RETRY_MAX_ATTEMPTS` (3, dijepit 1–5) |
| TTL sesi demo | `expires_in: 900` hardcoded (login + refresh) | `VITE_AUTH_TTL_FALLBACK_SEC` via `resolveAuthTtlFallbackSec()`; `AuthContext` tidak lagi baca `import.meta.env` langsung |
| WS | `resolveWsUrl` duplikat di telemetrySocket; heartbeat 25s, backoff 30s, sim demo 5s hardcoded | Satu `resolveWsUrl` (mode.ts); `VITE_WS_HEARTBEAT_MS`, `VITE_WS_RECONNECT_MAX_MS`, `VITE_DEMO_SIM_INTERVAL_MS` |
| Lockout login | 5× / 30 detik hardcoded | `VITE_LOGIN_MAX_ATTEMPTS` (5), `VITE_LOGIN_COOLDOWN_SEC` (30) |
| Identitas deployment | `Plant 01`, `ADMIN-CONSOLE-01` hardcoded | `VITE_PLANT_LABEL`, `VITE_DEFAULT_STATION_ID` |

**Variabel env baru** (lihat `.env.example` — lengkap dengan komentar):
`VITE_ALLOW_API_MODE_SWITCH`, `VITE_DEMO_PRESET_LOGIN`,
`VITE_MUTATION_TIMEOUT_MS`, `VITE_HTTP_RETRY_MAX_ATTEMPTS`,
`VITE_NETWORK_MODE`, `VITE_TUNNEL_PORT`, `VITE_ALLOW_NETWORK_MODE_SIMULATION`,
`VITE_WS_HEARTBEAT_MS`, `VITE_WS_RECONNECT_MAX_MS`, `VITE_DEMO_SIM_INTERVAL_MS`,
`VITE_LOGIN_MAX_ATTEMPTS`, `VITE_LOGIN_COOLDOWN_SEC`,
`VITE_PLANT_LABEL`, `VITE_DEFAULT_STATION_ID`.
Semua default = perilaku lama, jadi deployment yang sudah jalan tidak berubah
kecuali dua penguncian yang memang diminta: switch mode + tombol simulasi
jaringan kini mati secara default, dan preset login mati di env real.

**Verifikasi:** `tsc` 0 error; `npm test` **70/70** (65 lama + 5 baru di
`modeAndTransport.test.ts`: mode terkunci env real, preset hidup/mati,
switch dev, semua resolver + default, TTL login mengikuti env);
`npm run build` sukses; `vite preview` HTTP 200. Yang tetap belum
terverifikasi: visual di browser sungguhan + mode Real end-to-end (lihat §6).

## 9. Mode akses Private / Public — switch LAN vs internet (2026-11-16)

**Permintaan:** switch untuk mengaktifkan mode Private (akses penuh hanya di
LAN/lokal pabrik) dan mode Public (akses penuh boleh via internet publik),
plus kebutuhan backend-nya.

**Matriks akses efektif** (`resolveEffectiveAccess` di `mode.ts`):

| Kanal \ Mode | Private (default) | Public |
| --- | --- | --- |
| LAN pabrik | Boleh mutasi | Boleh mutasi |
| Internet (tunnel) | **Read-only** (mutasi 403) | Boleh mutasi |

**Implementasi panel (frontend):**

| Lapisan | Perubahan |
| --- | --- |
| Env (`mode.ts`, satu-satunya sumber kebenaran) | `VITE_ACCESS_MODE` (`private`\|`public`, default `private`); `VITE_ALLOW_ACCESS_MODE_SWITCH` (default `false` = terkunci, pola sama dengan `VITE_ALLOW_API_MODE_SWITCH` — override `?access=`/localStorage hanya dev). Resolver baru: `resolveEnvAccessMode`, `isAccessModeSwitchAllowed`, `resolveAccessMode`, `setAccessMode`, `resolveEffectiveAccess(channel)`, `isMutationAllowed(channel?)`. Tipe `AccessMode` tinggal di `types/auth.ts` (dipakai capability juga). |
| Demo (`client.ts`) | `assertLanAccess` kini memakai `resolveEffectiveAccess(store.networkAccessMode)` — tunnel + public lolos, tunnel + private tetap 403 `FORBIDDEN` + keputusan DENY tercatat. Pesan penolakan dipertahankan ("Mode observasi — …") supaya copy yang sudah diuji tidak berubah. |
| HTTP (`httpClient.ts`) | `assertLanForMutation` sama — menolak SEBELUM fetch bila akses efektif read-only. |
| Capability UI (`capabilities.ts`) | `EvaluateCapabilityContext` + field opsional `accessMode` (default `private` = perilaku lama); penolakan `requiresLan` kini berdasarkan akses efektif. `canPerformMutation`/`canCancelWorkOrder`/`canForceReconciliationRefresh` (`oeeCalculations.ts`) mendapat parameter opsional `accessMode` (param ke-2 yang dulu bernama `accessMode` padahal isinya network mode — diganti nama jadi `networkMode`). |
| Context (`NetworkAccessContext.tsx`) | Mengekspos `accessMode`, `canMutate`, dan `isReadOnly = !canMutate` (dulu `mode === 'REMOTE_TUNNEL'`). Semua pemakai `isReadOnly` (LoginPage, Topbar) otomatis mengikuti mode akses tanpa perubahan. |
| Auth (`AuthContext.tsx`) | `checkCapability` meneruskan `accessMode` dari context ke `evaluateCapability`. |
| Banner (`NetworkModeBanner.tsx`) | 4 keadaan: LAN + Private, LAN + Public, Tunnel + Private (amber, observasi), Tunnel + Public (emerald, "Internet Publik — Akses Penuh (Mode Public)" + peringatan TLS/login). |
| Topbar (`Topbar.tsx`) | Badge/select "Akses: Private/Public" di samping badge API, pola sama (select hanya bila switch diizinkan, badge read-only bila terkunci). Private = biru, Public = amber (peringatan: terbuka ke internet). Title tombol ganti password digeneralisasi ke "(mode observasi)". |
| Env (`.env.example`) | Dua variabel baru + komentar, termasuk peringatan bahwa backend WAJIB menegakkan aturan yang sama. |

**Kebutuhan backend:** ditulis lengkap di
`docs/BACKEND_REQUIREMENTS_ACCESS_MODE.md` (B1–B25 + checklist V1–V12).
Intinya: satu flag server `ACCESS_MODE` (default `private`, fail-closed);
klasifikasi kanal dari ingress nyata (tidak bisa dipalsukan client);
**middleware yang menolak semua mutasi dari tunnel saat `private` (403,
envelope standar)**; endpoint `GET /api/v1/system/access-mode` +
`GET /auth/me` yang mempublikasikan mode + kanal ke panel; endpoint admin
`PUT /admin/access-mode` (ADMIN-only, audit trail, `reason` wajib); bila
mode `public` dipakai: TLS wajib + auth penuh + rate limit lebih ketat di
tunnel + log kanal. **Tanpa penegakan server, switch di panel hanyalah
kosmetik** — curl langsung ke API bisa bypass panel.

**Verifikasi:** `tsc` 0 error; `npm test` **76/76** (70 lama + 6 baru di
`src/services/api/accessMode.test.ts`: resolver default/public/invalid,
switch terkunci/terbuka, matriks 4 kombinasi, demo tunnel private vs public,
HTTP vs stub port 3002 — 403 sebelum fetch vs 201, capability + helper);
`npm run build` sukses; `vite preview` HTTP 200. Yang tetap belum
terverifikasi: visual di browser sungguhan + mode Real end-to-end (lihat §6)
+ seluruh daftar B1–B25/V1–V12 di sisi backend (belum ada backend).

## 10. Refactoring struktur direktori — kontrak & pemisahan god-file (2026-11-16)

**Latar:** 81 file `src`, 34.784 baris; 6 god-file di atas batas keras
(`client.ts` 4.602, `httpClient.ts` 3.371, `mockData.ts` 1.574,
`capabilities.ts` 1.115, `endpoints.ts` 883, `schemas.ts` 603). Riset
anggaran (Clean Code Bab 5: file jarang > 500 baris, sweet spot 100–200;
umum: optimal 100–300, maks 500; route/komponen < 500; fungsi 5–20/maks 50).

**Kontrak:** `docs/DIRECTORY_STRUCTURE.md` + checker
`scripts/check-directory-contract.mjs` (`npm run check:structure`, terikat
di `npm run lint`). Baseline checker: **6 FAIL**; setelah refactoring:
**0 FAIL** (18 WARN di atas batas lunak, 10 pengecualian halaman tercatat
di kontrak §4 — R9.5, belum dikerjakan).

**Yang dipecah (script migrasi `/tmp/split-api.mjs`, stages 1–4; bukan
bagian repo — parser berbasis baris + hitung kurung karena proyek memakai
TypeScript 7 tanpa API klasik):**

| Stage | Dari | Menjadi | Hasil |
| --- | --- | --- | --- |
| R9.2a | `mockData.ts` 1.574 | `seeds/{production,assets,operators,monitoring,mqtt,system}.ts` + barrel | file ≤ 400 |
| R9.2b | `schemas.ts` 603 | `schemas/{transport,dto}.ts` + barrel | 225 / 391 |
| R9.2c | `endpoints.ts` 883 | `endpoints/{definition + 11 domain}.ts` + barrel, urutan 131 key dipertahankan | file ≤ 276 |
| R9.3a | `client.ts` 4.610 | `demo/{store,helpers,core,auth,health,devices,machines,products,production,operators,workOrders,monitoring,telemetry,mqttDynsec,mqttConfig,iam}.ts` + barrel 50 baris | file ≤ 574 |
| R9.3b | `httpClient.ts` 3.379 | `http/{primitives,transport,auth,health,devices,machines,products,operators,production,workOrders,monitoring,telemetry,iam,mqttDynsec,mqttConfig}.ts` + `http/mappers/{assets,monitoring,system}.ts` + barrel 40 baris | file ≤ 394 |
| R9.4 | `capabilities.ts` 1.126 | `capabilities/{specs,abac,engine,casbin,network,validators}.ts` + barrel | file ≤ 335 |

**Aturan yang ditegakkan script:** batas kelompok dari NAMA method pertama
tiap section (bukan nomor baris — tahan terhadap edit mode akses +8 baris);
`this.X` antar-method ditulis ulang ke objek domain (`demoX.Y` /
`httpX.Y`); impor di-prune + digeser sedalam subfolder; deklarasi
non-export di file baru diberi `export`; state modul HTTP yang ditulis
method domain (`httpToken`) diakses lewat setter `setHttpToken`
(binding impor ESM read-only); `AuthClientHooks` lokal dipindah ke
`demo/helpers.ts`; header doc §4.2 dipertahankan di `http/transport.ts`.

**Kode mati yang dihapus (R9.4, diverifikasi 0 pemakaian di seluruh src
termasuk internal & test):** `decodeDeviceEventFlags`,
`validateSubjectMatch` + `SUBJECT_MATCH_REGEX`, `computeCatalogueVersion`,
`isGuardedPermissionPair` + `GUARDED_PERMISSION_PAIRS`. Yang TIDAK dihapus
meski audit awal menduganya mati: kelima validator `validate*Input`
(ternyata dipakai halaman + demo) dan `validateAbacCondition` (dipakai
`matchAbacCondition`).

**Perilaku dipertahankan:** permukaan publik tidak berubah — `apiClient`,
`store`, `ADMIN_ENDPOINTS` (131 key, urutan sama), semua `map*`, semua
validator. Tidak ada perubahan UI/fitur.

**Verifikasi:** `tsc` 0 error; `npm test` **76/76**; `npm run build`
sukses (peringatan chunk-size lama); `vite preview` HTTP 200;
`npm run check:structure` **0 FAIL**. Yang tetap belum terverifikasi:
visual di browser sungguhan + mode Real end-to-end (lihat §6).

**Sisa:** R9.6 (verifikasi akhir) — R9.5 selesai 2026-11-16 malam, lihat §11.

## 11. Refactoring R9.5 — ekstraksi 11 halaman/tab-modal (2026-11-16)

Rencana `/tmp/r95-plan.md` (§0–§15) dieksekusi penuh, satu file per langkah
dalam urutan §13, tiap file diverifikasi hijau (tsc 0 + `npm test` penuh)
sebelum file berikutnya dimulai. Total **9.576 → 2.269 baris** (11 file
sumber), **97 file baru** (hook + komponen + 2 helper), semua page kini
≤ lunak 400. Tidak ada perubahan permukaan publik; perilaku dipertahankan
verbatim kecuali keputusan §0 dan perbaikan yang dicatat di bawah.

| # | File | Sebelum → sesudah | File baru | Commit lokal |
|---|---|---|---|---|
| 1 | `src/utils/historicalExport.ts` | 618 → 10 (barrel) | 8 (`utils/historicalExport/*`) | `8d45399` |
| 2 | `features/analytics/OeeAnalyticsPage.tsx` | 593 → 143 | 5 | `7dc33fc` (+ fixup `f3202a3`) |
| 3 | `features/monitoring/OperationalEventsPage.tsx` | 610 → 234 | 4 | `5509650` (+ fixup `87f5ae0`) |
| 4 | `features/assets/DevicesPage.tsx` | 652 → 221 | 4 | `68e702e` |
| 5 | `features/production/OperatorsPage.tsx` | 1.012 → 228 | 9 | `fb982f7` |
| 6 | `features/assets/MachinesPage.tsx` | 884 → 273 | 8 + `MachineDetailModal` dipindah ke `components/` | `f212cdf` |
| 7 | `features/analytics/TelemetryHistoryPage.tsx` | 862 → 213 | 9 | `8e5c1ea` |
| 8 | `features/production/WorkOrdersPage.tsx` | 859 → 189 | 8 | `6c86258` |
| 9 | `features/mqtt/BrokerConfigManagerPage.tsx` | 627 → 233 | 8 | `123e6f2` |
| 10 | `features/mqtt/DynamicSecurityPage.tsx` | 858 → 219 | 12 | `dd796bf` |
| 11 | `features/system/AccessControlPage.tsx` | 2.001 → 306 | 22 (6 hook + 14 komponen + 2 helper) | `860319f` |

**Keputusan pola §0 yang diterapkan di semua file:** form state milik modal
(page/hook hanya open flag + target); submit error milik modal (modal
memanggil `onSubmit(payload): Promise` dan memetakan error sendiri);
feedback disatukan ke satu objek `FeedbackState` ala Machines; per-row
`checkCapability` dipassing sebagai fungsi (bukan boolean precompute, bukan
`useAuth()` kedua di tabel); delete membersihkan (cross-clear) modal detail
yang terbuka. Pengecualian yang dicatat: state form Bind (8 field) tetap di
`useRolePermissions` — kedua opener + 8 state HARUS dalam satu hook agar
locked side tidak desync (rencana §6.4); `onClose` bind modal Machines kini
membersihkan kedua target (perbaikan bug laten).

**Kode mati yang dihapus:** `visibleWorkOrders` (L409–413, no-op) +
destructure `products` yang tidak dipakai di `WorkOrdersPage`. Yang TIDAK
dihapus sesuai aturan: 3 fungsi tanpa pemanggil produksi (tetap
di-re-export); builder endpoint `historicalExport` TIDAK didelegasikan ke
registry (langkah terpisah setelah split).

**Perbaikan perilaku yang disengaja (bukan sekadar pindah kode):**
- **OeeAnalyticsPage:** rencana §10.4 salah mendeskripsikan sumber — Refresh
  asli me-refetch KEENAM query (termasuk `shiftSummaryQuery` +
  `downtimeOverlayQuery`); dikembalikan verbatim (fixup `f3202a3`).
- **OperationalEventsPage:** `ackNote` modal sempat di-prefill dari
  `target.ack_note`; sumber asli selalu mulai `''` — dikembalikan (fixup
  `87f5ae0`).
- **DynamicSecurityPage:** bug stale-closure `loadAll` diperbaiki (default
  form pindah ke modal, loader hanya memuat 3 list); secret MQTT one-time
  di-WIPE (`null`) saat modal ditutup, bukan disembunyikan; 5 mutasi inline
  tanpa error handling (`deleteRole`, `removeAcl`, `deleteGroup`,
  `addGroupClient`, `addGroupRole`) diarahkan lewat named handler dengan
  try/catch + feedback. TIDAK ditambah konfirmasi delete (di luar lingkup).
- **WorkOrdersPage:** tombol Tutup modal detail kini memakai satu `onClose`
  (`closeDetail`) — tidak teramati, karena `handleOpenDetail` selalu me-reset
  resolve state di setiap bukaan.
- Pesan validasi submit kini tampil inline di modal (teks sama persis);
  kegagalan API tetap juga men-set banner feedback (preseden `useDevices`).

**Yang TIDAK dilakukan:** tidak ada test colocated baru; tidak ada file
shared baru selain `features/system/iamValidation.ts`
(`parseAbacCondition`, `validateRoleLevelDesc` — menggantikan ABAC parse
×3 + validasi role ×2) dan `features/system/accessControlTypes.ts`
(`IamTab` di satu tempat); tidak ada `useCursorPagination` / `useFeedback`
bersama (kandidat §12.2 diputuskan tidak dibuat); `isProtectedOperator(op)`
ditambahkan sebagai ekspor aditif di `utils/capabilities.ts`.

**Verifikasi akhir (setelah file ke-11):** `npx tsc --noEmit` **0 error**;
`npm test` **76/76**; `npm run build` sukses (hanya peringatan chunk-size
lama); `vite preview` **HTTP 200**; `npm run check:structure` **0 FAIL,
0 pengecualian tercatat** (25 WARN — hanya file di atas lunak, di bawah
keras; dari R9.5: `OperatorDetailModal` 257, `useBrokerConfig` 223,
`RolesTab` 207, `useRolePermissions` 194, `useDevices` 189,
`useOperatorCrud` 187, `useOeeAnalytics` 175; sisanya file lama di luar
R9.5). Semua 13 commit lokal R9.5 (11 file + 2 fixup) sudah di-push ke
GitHub sebagai `1e0bfe9` (local `b495453`), dan FAT-39 ditandai Done di
Linear setelah verifikasi independen. Yang tetap belum
terverifikasi: visual di browser sungguhan + mode Real end-to-end (lihat
§6).

## 12. Keputusan: reject dihitung tanpa kategori alasan (2026-11-16)

**Keputusan (atas permintaan Fathur):** reject hanya dihitung sebagai angka
biasa, tanpa kategori/alasan reject. Alasannya faktual: perangkat OEE hanya
punya **1 tombol Reject**, jadi yang tercatat di sumber hanyalah counter
reject — tidak ada alasan yang bisa didistribusikan.

**Dasar di dokumen acuan:** API doc §R (FR-BIGR-001..003) sudah
mengantisipasi ini — sumber pareto adalah delta `UNCLASSIFIED` per jendela,
dan totalnya harus dapat direkonsiliasi dengan
`device_live_state.rejectCount` (G1). Pareto tanpa kategori memang bukan
Pareto yang bermakna (satu bar, 100%); karena itu yang ditampilkan panel
adalah jumlah reject apa adanya, dan distribusi 80/20 yang jujur adalah
per device — yang sudah tersedia lewat kolom `rejectCount` di tabel rollup
OEE (`OeeRollupTable`), bukan lewat alasan cacat.

**Yang diubah:**
- `src/services/api/demo/helpers.ts` — `REJECT_PARETO_BY_DEVICE`: seed
  multi-alasan yang dibuat-buat (mis. "Dimension Tolerance Exceeded",
  "Surface Roughness", "Thread Pitch Defect") **dihapus** dan diganti satu
  item `UNCLASSIFIED` per device, dengan count = `reject_count` live state
  (`seeds/monitoring.ts`): STM32-OEE-01: 8, -02: 3, -03: 14; -04/-05 tetap
  `[]`. Agregasi plant-wide (`getRejectParetoGlobal`) kini menghasilkan
  satu baris `UNCLASSIFIED` 25 pcs (100%) — tanpa perubahan logika.
- `src/features/analytics/rejectReasonLabel.ts` (baru) —
  `displayRejectReason()`: `UNCLASSIFIED` ditampilkan sebagai
  "Belum diklasifikasi"; alasan lain (bila kelak ada) tampil apa adanya.
  Dipakai `QualityRejectPareto.tsx` dan `QualityRejectsPage.tsx`.
- Copy UI yang mengklaim distribusi/kategori cacat diperbaiki:
  `QualityRejectPareto` — "Jumlah reject tanpa klasifikasi alasan —
  perangkat hanya punya 1 tombol Reject"; `QualityRejectsPage` —
  "Rekapitulasi jumlah reject tanpa klasifikasi alasan…" dan judul
  "Jumlah Reject — tanpa klasifikasi alasan".

**Yang TIDAK diubah:** kontrak endpoint `{reason, count, pct}` (API doc §R)
dan mapper HTTP `paretoFromRows`/`mapReject` — keduanya sudah memakai
`UNCLASSIFIED` sebagai nilai kanonis tanpa alasan (bahkan sebagai default
bila `reason` hilang); matematika OEE/Quality (`rejectCount`, `good =
output − reject`) dan `finalRejectCount` pada WO complete — semuanya sudah
bekerja dari angka polos tanpa alasan.

**Kebutuhan backend (bila klasifikasi alasan suatu hari diinginkan):**
klasifikasi TIDAK bisa datang dari tombol Reject — harus dari alur lain
(mis. klasifikasi QC di panel setelah reject terjadi, atau stasiun QC
terpisah). Itu lingkup baru, bukan bagian dari keputusan ini; sampai ada
alur itu, backend cukup mengembalikan baris `UNCLASSIFIED` (atau `[]` bila
kosong) dan JANGAN memfabrikasi alasan.

**Verifikasi:** `npx tsc --noEmit` **0 error**; `npm test` **76/76**;
`npm run build` sukses (hanya peringatan chunk-size lama);
`vite preview` **HTTP 200**; `npm run check:structure` **0 FAIL,
0 pengecualian tercatat**.

## 13. Audit Telemetry History, OEE Per Jam & Timeline Shift (2026-11-16)

Laporan lengkap: `docs/TELEMETRY_AUDIT.md` (25 gap: 4 Tinggi, 10 Sedang,
11 Rendah; 24 usulan peningkatan). Empat gap Tinggi — semuanya
terverifikasi terhadap kode sebelum dilaporkan: **G1** jendela waktu tidak
sejajar di halaman OEE (shift summary + timeline tidak mengirim `from`/`to`,
sementara hourly/rollup memakai 7 hari sliding); **G2** total tidak bisa
direkonsiliasi antar tampilan bahkan di demo (timeline RUNNING 409 mnt vs
`run_time_min` 388; planned 45 vs 60; unplanned 15 vs 32); **G3** filter
tanggal tidak berpengaruh di tab Hourly & Aggregate Telemetry History
(`from`/`to` tidak dikirim ke server); **G4** rollup halaman OEE
mengabaikan mesin terpilih (selalu plant-wide tanpa label). Prioritas
usulan dalam scope: F-1 (kirim `from`/`to` ke hourly & aggregate) → F-2
(ikat summary/timeline ke periode) → F-3 (rollup ikut mesin / label scope)
→ F-4 (seed demo terrekoniliasi) → U-1 (label scope eksplisit). Belum
diputuskan Fathur mana yang diimplementasikan.

## 14. Implementasi perbaikan Telemetry & OEE — Epic E11 (2026-11-16)

Atas persetujuan Fathur, kelima usulan prioritas dari §13 diimplementasikan
sebagai Epic E11 (FAT-43) + T11.1–T11.5, dikerjakan satu fix per langkah
dengan verifikasi `tsc` + test per fix. Semua panel saja; tidak ada
perubahan perilaku di luar deskripsi tiap fix.

- **T11.1 (FAT-44) / F-1 — kirim `from`/`to` ke hourly & aggregate
  (G3).** Commit `722f4af`. Tipe bersama baru `TelemetryRangeOptions
  {from?, to?, limit?}` (`types/analytics.ts`); `useTelemetryQueries`
  meneruskan `filters.from/to/limit` ke `getHourlyTrend` /
  `getTelemetryAggregate` (queryKey aggregate kini memuat from/to/limit);
  HTTP mengirim ketiganya sebagai query string; demo menghormati rentang
  (hourly memproyeksikan 8 bucket seed ke tanggal `to` lalu membuang bucket
  di luar rentang; aggregate menskala `sample_count`/`total_parts`
  sebanding panjang rentang). Bukti: rentang 09:00–12:00 → 4 bucket;
  00:00–06:00 → `[]`; stub HTTP menerima
  `?from=…&to=…&limit=50`. 10 test baru (`telemetryRange.test.ts`).
- **T11.2 (FAT-47) / F-2 — ikat shift summary + timeline ke periode
  (G1).** Commit `301725c`. queryKey `oee-shift-summary` dan
  `oee-shift-timeline` kini memuat `filters.from/to`; `getShiftSummary` /
  `getShiftTimeline` mendapat `options?: TelemetryRangeOptions` di demo +
  HTTP dan mengirim `from`/`to` ke `GET /api/v1/oee/shift-summary` dan
  `/shift-timeline` (API doc §Q.1/§Q.3). Demo memproyeksikan jendela/segmen
  ke tanggal `to` dan hanya mengembalikan segmen yang bersinggungan dengan
  rentang. **Catatan mode Real: belum terverifikasi** — tidak ada backend
  hidup; yang dipastikan hanya klien mengirim param yang benar. Backend
  harus menghormati `from`/`to` agar fix ini efektif di Real. 10 test baru.
- **T11.3 (FAT-48) / F-3 — rollup halaman OEE mengikuti mesin terpilih
  (G4).** Commit `a885dca`. `rollupFilters` kini `machineId:
  selectedMachine` (bukan `undefined`); judul tabel "Rollup —
  <nama mesin>". Sengaja hanya `machineId`, bukan `deviceId` hasil
  resolusi: `CNC-GRIND-05` tidak punya device terikat dan fallback ke
  `STM32-OEE-01` akan membuat rollup-nya kosong. Demo + HTTP sudah
  menghormati filter (tidak diubah). Bukti: `CNC-MILLING-01` → 1 baris
  (`totalCount` 1400); `CNC-LATHE-02` → 1 baris (732); tanpa filter →
  plant-wide. 5 test baru.
- **T11.4 (FAT-46) / F-4 — seed demo terrekoniliasi (G2).** Commit
  `8b2719b`. Hanya demo/seed. Timeline kanonis baru 5 segmen (07:00–09:15
  RUNNING 135 · 09:15–09:47 UNPLANNED 32 · 09:47–12:00 RUNNING 133 ·
  12:00–13:00 PLANNED 60 · 13:00–15:00 RUNNING 120); segmen
  BATCH_FINISHED 11 mnt dilipat ke RUNNING (summary tidak punya bucket
  itu; mesin berlari sampai 15:00). Jam 07:00 dikoreksi run 3168→3250 dtk
  (availability 88,0→90,3; oee 78,4→80,5); jam 12:00 tidak diubah (G8,
  urusan backend). Event `dt-ev-02` (09:15–09:47, 1920 dtk) dan `dt-ev-04`
  (12:00–13:00, 3600 dtk, dipindah ke STM32-OEE-01, kini `ended_at`
  terisi) disesuaikan; rollup `machine` kini `bucket: null` (sesuai
  dokumen API). **Keputusan bucket:** re-bucketing memakai split eksak
  pada batas perubahan state (peta per menit), BUKAN mayoritas per bucket
  — mayoritas membulatkan unplanned 32 mnt → 30 mnt (5m/15m) atau 60 mnt
  (1h) dan mengulang G2 dalam bentuk kecil. Σ per state tetap 388/60/32 di
  semua bucket (1m: 480 segmen; 5m: 97; 15m: 33; 1h: 10). Bukti
  rekonsiliasi (diukur dari API demo): Σ RUNNING 388, PLANNED 60,
  UNPLANNED 32, Σ `hourly_run_sec` 23.280 dtk, Σ downtime 5.520 dtk,
  Σ `hourly_operating_sec` 25.200 dtk. 8 test rekonsiliasi baru.
- **T11.5 (FAT-45) / U-1 — label scope eksplisit di setiap widget (G1,
  G4, G23).** Commit `f3dcdda`. Helper baru
  `features/analytics/scopeLabels.ts` (pure formatter; kosong bila data
  tidak bisa diparse — tidak menebak). Label dari filter/query yang sudah
  ada: `OeeSummaryCards` "Shift 1 (07:00-15:00) · Asia/Jakarta · Mesin
  …"; `OeeHourlyTable` "7 hari terakhir · Mesin …"; `OeeRollupTable`
  "Rollup — <mesin> · 7 hari terakhir"; `ShiftTimeline` "Shift 1
  (07:00-15:00) · Asia/Jakarta · bucket 15m"; tab Telemetry History
  "7 hari terakhir · Perangkat STM32-OEE-01" (rollup memakai
  `rollupDeviceFilter` + `groupBy`-nya sendiri). Tanpa perubahan
  logika/data/fetch. 8 test baru (`scopeLabels.test.ts`).

**Koreksi angka audit:** G2 "Σ `hourly_run_sec` = 25.198 dtk (≈ 420 m)"
ternyata salah salin — nilai sebenarnya dari seed adalah **23.198 dtk
(≈ 386,6 m)**, hanya 82 dtk di bawah `run_time_min` (388). Angka G2 lain
(409/45/15, downtime ≈ 93 mnt) sudah benar; temuan G2 tetap Tinggi.
`docs/TELEMETRY_AUDIT.md` sudah dibetulkan (baris G2 + tabel (c) + catatan
koreksi di kepala dokumen).

**Yang TIDAK selesai / batasan yang dicatat:**
- Rollup day/month demo masih konstanta yang sama untuk semua mesin
  (T11.3/T11.4). Membuatnya berbeda per mesin butuh faktor skala yang
  diada-adakan tanpa ground truth, dan semantik jendelanya sendiri
  bertentangan (machine ≈ 8 jam, day = 16 jam/hari, month = 18 hari).
  Perlu pendefinisian ulang semantik jendela rollup (keputusan
  desain/backend), bukan sekadar ubah konstanta.
- Σ parts hourly vs summary masih tidak cocok (Σ parts 334 vs
  `total_parts` 350; good 328 vs 342; defect 6 vs 8) — di luar target
  rekonsiliasi waktu T11.4; memperbaikinya butuh menurunkan ulang
  performance/quality/oee per jam (keputusan seed terpisah).
- Distribusi per jam timeline ↔ hourly masih berbeda (micro-stop hourly
  tersebar di jam RUNNING; timeline menampilkan state dominan). Yang
  direkonsiliasi adalah total shift, sesuai tuntutan G2/F-4.
- **Checker 1 FAIL:** `services/api/demo/telemetry.ts` 726 baris
  (batas keras 600) — SUDAH FAIL di baseline sebelum E11 (624 baris di
  `a885dca`), memburuk karena logika re-bucketing T11.4. Pemecahan file
  ini adalah refactoring ala R9, di luar scope E11 — perlu
  issue/keputusan terpisah. Selain itu 26 WARN (lunak) dan 0 pengecualian.

**Verifikasi akhir (setelah T11.5):** `npx tsc --noEmit` **0 error**;
`npm test` **117/117** (76 awal + 41 baru: 10 T11.1 + 10 T11.2 + 5 T11.3
+ 8 T11.4 + 8 T11.5); `npm run build` sukses (hanya peringatan
chunk-size lama); `vite preview` **HTTP 200**; `npm run check:structure`
**1 FAIL** (di atas, pre-existing) + 26 WARN + 0 pengecualian. Status
Linear T11.1–T11.5 → Done di `docs/LINEAR.md` §1.3 + §8 dan
`docs/linear-seed.json` v6 — perubahan status di Linear sendiri dilakukan
setelah verifikasi independen; 5 commit lokal E11 belum di-push ke GitHub.
Yang tetap belum terverifikasi: visual di browser sungguhan + mode Real
end-to-end (lihat §6).

**Tindak lanjut T11.6 (FAT-49) — pecah `demo/telemetry.ts`:** klaim di atas
tentang checker ("SUDAH FAIL di baseline sebelum E11") **tidak benar** —
verifikasi independen parent: file itu **519 baris** di commit pre-E11
`23f3dea`, di bawah keras 600; membengkak ke 725 baris karena T11.1/T11.2/
T11.4. Karena itu dibuat issue T11.6 (FAT-49) dan file dipecah per domain
mengikuti pola R9.2: barrel `demo/telemetry.ts` 20 baris +
`telemetry/{helpers 124, oee 231, rollup 192, quality 47, history 131,
reconciliation 85}` — semua ≤231 baris, permukaan publik `demoTelemetry`
identik (pemindahan murni; hanya 3 penulisan ulang pemanggilan antar-method
+ impor yang di-prune). **Verifikasi akhir setelah T11.6:** `npx tsc
--noEmit` **0 error**; `npm test` **117/117**; `npm run build` sukses;
`vite preview` **HTTP 200**; `npm run check:structure` **0 FAIL, 0
pengecualian tercatat** (251 file, 26 WARN lunak). Dengan ini E11 tuntas
penuh: T11.1–T11.6 Done, checker kembali 0 FAIL.

## 15. Lanjutan perbaikan Telemetry & OEE — Epic E12 (2026-11-17)

Atas persetujuan Fathur, 19 usulan lanjutan dari §13 (`docs/E12_PROPOSAL.md`,
gap G5–G24) diimplementasikan sebagai Epic E12 (FAT-50) + T12.1–T12.19, satu
fix per langkah dengan verifikasi `tsc` + test per fix dan satu commit lokal
per fix. Cakupan HANYA admin-panel; infra (konfigurasi Nginx / deployment
V8.4) dan backend (A10.2, V8.2, V8.3, state FSM SETUP/IDLE G25, definisi
availability server G8) dikecualikan. Tidak ada perubahan perilaku di luar
deskripsi tiap fix.

### Wave 1

- **T12.1 (FAT-54) / X-1 — filter shift (tanggal + shift).** Commit
  `7cd850d`. Shift dari `INITIAL_SHIFTS` (S1 07:00–15:00, S2 15:00–23:00,
  S3 00:00–07:00); komponen baru `ShiftFilterBar`; `date`/`shift` dikirim
  ke summary/timeline sesuai API doc §I; termasuk perbaikan forward
  `getOeeHourly` demo. 27 test baru (144 total).
- **T12.2 (FAT-51) / F-5 — tab Aggregate deret per-bucket.** Commit
  `21a857b`. Tab Aggregate kini menampilkan deret per-bucket (bukan satu
  angka agregat); komponen baru `TelemetryAggregateChart` +
  `TelemetryAggregateColumns`. 11 test baru (155 total).
- **T12.3 (FAT-53) / F-6 — kolom tabel per jam + presisi.** Commit
  `f63e312`. Kolom tabel per jam dilengkapi dan presisi disamakan ke 2
  desimal. 11 test baru (166 total).
- **T12.4 (FAT-55) / F-7 — planned downtime, sisi panel saja.** Commit
  `ae21d74`. Mapper HTTP kini membaca `time_sec.planned` bila dikirim
  server; definisi availability untuk jam planned penuh TIDAK diubah —
  itu keputusan backend (G8, dikecualikan). 6 test baru (172 total).
- **T12.5 (FAT-52) / U-2 — empty/loading/error state.** Commit
  `9b0836c`. Semua tabel dan kartu kini punya state kosong / memuat /
  galat yang eksplisit (komponen baru `TableStateRow`, hook
  `oeeWidgetState`). 26 test baru (198 total).
- **T12.6 (FAT-56) / U-3 — indikator rekonsiliasi + investigasi selisih
  parts.** Commit `644498f`. Indikator rekonsiliasi baru
  (`reconciliation.ts` + `ReconciliationFootnote`); investigasi selisih
  Σ parts hourly vs summary selesai — lihat "Keputusan: selisih parts"
  di bawah. 14 test baru (212 total).

### Wave 2

- **T12.7 (FAT-60) / F-8 — ekspor = layar + ekspor rollup.** Commit
  `1517c42`. Kolom ekspor disamakan dengan kolom yang tampil di layar;
  ditambah ekspor rollup. 6 test baru (218 total).
- **T12.8 (FAT-61) / F-9 — builder endpoint → registry.** Commit
  `9413cd0`. Builder endpoint didelegasikan ke registry
  (`utils/historicalExport/endpoints.ts`); `getTelemetryHistory` versi
  non-page dihapus. 2 test baru (220 total).
- **T12.9 (FAT-62) / X-2 — kontrol periode halaman OEE.** Commit
  `e517aed`. Date-range picker baru (`PeriodRangePicker`) di halaman OEE;
  queryKey kini memuat periode. 13 test baru (233 total).
- **T12.10 (FAT-57) / X-3 — toggle scope rollup.** Commit `213aec5`.
  Toggle "mesin ini / semua mesin" pada rollup halaman OEE. 15 test baru
  (248 total).
- **T12.11 (FAT-59) / X-4 — zona waktu Asia/Jakarta + sumbu waktu
  timeline.** Commit `9a4df2c`. Helper baru `utils/historicalExport/
  timezone.ts`; semua label/kunci waktu di scope fix memakai
  Asia/Jakarta; demo timeline disamakan ke ISO 8601. 22 test baru
  (270 total).
- **T12.12 (FAT-58) / X-5 — flag provisional konsisten.** Commit
  `5d725fd`. Marker provisional timeline diturunkan dari jam-jam hourly
  yang provisional (`timelineProvisional.ts`); flag tampil konsisten di
  tabel hourly, rollup, dan timeline. 12 test baru (282 total).
- **T12.13 (FAT-63) / X-6 — downtime overlay "N dari M" + paginasi.**
  Commit `ae52283`. Overlay downtime menampilkan "N dari M" dan memakai
  paginasi cursor (`useInfiniteQuery`). 16 test baru (298 total).

### Wave 3

- **T12.14 (FAT-66) / F-10 — hapus `hourly_downtime_sec`.** Commit
  `26f511f`. Field hantu dihapus dari tipe, seed, dan CSV; downtime per
  jam kini diturunkan sebagai `operating − run` (= 1.920 dtk unplanned
  per jam); downtime penuh 5.520 dtk tetap terbukti lewat
  `downtime_events`. 3 test baru (301 total).
- **T12.15 (FAT-67) / F-11 — mapping `cycle_time_ms` per satuan.** Commit
  `d115abf`. Mapper membaca satuan field sebelum mengonversi
  `cycle_time_ms`. 7 test baru (308 total).
- **T12.16 (FAT-68) / F-12 — komentar `refetchAll` + `isRefreshing`.**
  Commit `d837971`. Komentar `refetchAll` diperbaiki;
  `isRefreshing` kini mencakup keenam query. 3 test baru (311 total).
- **T12.17 (FAT-69) / F-13 — reset segmen saat ganti bucket.** Commit
  `15afd30`. Pilihan segmen timeline direset saat bucket berubah,
  sehingga tidak ada lagi segmen basi dari bucket lama. 2 test baru
  (313 total).
- **T12.18 (FAT-65) / U-4 — samakan default dengan dokumen.** Commit
  `11968d3`. Keenam default G15 diubah ke nilai dokumen (bukan
  dipertahankan diam-diam): groupBy rollup `machine` → **`day`** (API doc
  §K.3c); bucket aggregate `1h` → **`5m`** (Guide §4.1); bucket timeline
  `15m` → **`5m`** (API doc §Q.3); limit hourly `100` → **`72`** (Guide +
  API doc §E); limit rollup `50` → **`500`** (API doc §K.3c); timeout
  ekspor klien `90.000` → **`120.000 ms`** (Guide §4.2; transport HTTP
  sudah 120.000 ms via `VITE_EXPORT_TIMEOUT_MS`, jadi abort 90 dtk
  sebelumnya memotong ekspor yang transport-nya masih mengizinkan).
  Satu sumber kebenaran baru `features/analytics/telemetryDefaults.ts`
  dipakai kedua halaman agar tidak drift lagi; demo aggregate/rollup
  disamakan (paritas demo/real), termasuk plafon demo rollup
  `maxLimit: 100` → `500` supaya default 500 tidak terpotong diam-diam.
  5 test baru (318 total).
- **T12.19 (FAT-64) / U-5 — tampilan kanonis OEE per jam + tautan
  silang.** Commit `db7c953`. Tampilan kanonis = `OeeHourlyTable` di
  halaman Analytics OEE (badge "Tampilan kanonis", catatan sumber, tautan
  "Lihat di Telemetry History →" ke `/telemetry?tab=hourly`); tab Per Jam
  di Telemetry History menjadi tampilan ringkas dengan catatan + tautan
  balik ke Analytics (`oeeAnalyticsHref` dari mesin yang terikat perangkat
  terpilih). Tab awal kini bisa diminta lewat URL `?tab=hourly`. Tanpa
  perubahan perhitungan/filter/data. 6 test baru (324 total).

### Keputusan yang diambil

- **Keputusan: selisih parts (T12.6) — Opsi A DITERAPKAN (T12.6a, FAT-70,
  keputusan Fathur 2026-11-17, commit `ec49a2a`).** Investigasi menemukan
  akar masalahnya: summary mengambil parts dari counter kumulatif
  live-state (`INITIAL_LIVE_STATES` STM32-OEE-01: total 350 / good 342 /
  reject 8), BUKAN total shift — jadi Σ hourly (334 / 328 / 6) dan summary
  (350 / 342 / 8) adalah besaran yang berbeda dari sumber yang berbeda,
  bukan salah ketik. Opsi A diterapkan (demo saja): summary memakai parts
  dari Σ hourly + turunkan ulang P/Q/OEE dari basis shift yang sama —
  OEE 84,6→86,6, A 92,4 tetap, P 94,1→95,4, Q 97,4→98,2, parts
  350/342/8→334/328/6; seed hourly tidak disentuh; `target_per_hour`
  summary 64→50 (memakai 64 memberi P = 74,6%, tidak masuk akal); live
  state tetap 350/342/8 (benar sebagai kumulatif). Implementasi:
  `deriveShiftSummaryFromHourly` (pure, di `demo/telemetry/oee.ts`) —
  A = Σ run / Σ operating, P = Σ parts / (target × Σ operating jam),
  Q = Σ good / Σ parts, OEE = A × P × Q / 10000, dibulatkan 1 desimal;
  seed titik per jam diekstrak ke `buildDemoHourlyPoints` supaya summary
  dan hourly membaca seed yang sama; fallback ke live-state bila tidak
  bisa diturunkan (STM32-OEE-05, kapasitas unknown → null). Rollup ×4
  (1400) dan aggregate 333 tetap tidak konsisten secara terpisah —
  di luar scope T12.6a.
- **Keputusan: T12.4 — sisi panel saja.** Mapper membaca
  `time_sec.planned` bila ada; definisi availability jam planned penuh
  tetap urusan backend (G8).
- **Keputusan: T12.18 — satu deviasi dipertahankan.** Ukuran paginasi UI
  rollup tetap **50** (`DEFAULT_HISTORY_PAGE_LIMIT`); yang diubah ke 500
  hanyalah fallback transport bila pemanggil tidak mengirim `limit`.
  Halaman tetap mengirim `limit=50` eksplisit. Alasan: 50 adalah ukuran
  halaman UI yang dipakai bersama halaman raw history, downtime, dan
  operational events — menaikkannya ke 500 akan ikut mengubah semua
  halaman itu, di luar daftar G15. Bila Fathur ingin tab rollup memuat
  500 baris per halaman, itu keputusan terpisah (override `limit` khusus
  rollup di query).

### Yang TIDAK selesai / batasan yang dicatat

- Selisih parts 334 vs 350 — SELESAI via Opsi A (T12.6a di atas); rollup
  ×4 (1400) dan aggregate 333 tetap tidak konsisten secara terpisah.
- Rollup day/month demo masih konstanta yang sama untuk semua mesin
  (bawaan dari §14) — belum disentuh E12.
- Ekspor demo hourly masih mengabaikan `from`/`to` untuk isi (catatan
  T12.7); kolomnya sudah sama dengan layar, isinya belum difilter
  rentang.
- Sapuan zona waktu (T12.11) terbatas pada scope fix:
  `toLocaleString()` tanpa tz masih ada di halaman di luar scope
  (assets, monitoring, MQTT, production, system) — sengaja tidak
  disentuh.
- Kartu `ShiftSummary` tidak bisa membawa flag provisional (T12.12) —
  server tidak mengirim flag itu; hanya tampilan hourly/rollup/timeline
  yang konsisten.
- Mekanisme stale-index yang sama seperti T12.17 juga ada pada ganti
  periode/shift (observasi T12.17) — kandidat follow-up, di luar scope
  F-13.
- **Batas keras file (headroom menipis):** `useOeeAnalytics.ts` tepat
  **250/250 baris** (batas keras hook) dan `TelemetryTabPanels.tsx`
  **296/300 baris** setelah T12.18/T12.19 — perubahan berikutnya pada
  kedua file itu hampir pasti harus memecahnya per domain mengikuti pola
  R9.2.

**Verifikasi akhir (setelah T12.19):** `npx tsc --noEmit` **0 error**;
`npm test` **324/324** (117 awal E11 + 207 baru E12); `npm run build`
sukses (hanya peringatan chunk-size lama); `vite preview` **HTTP 200**;
`npm run check:structure` **0 FAIL, 0 pengecualian tercatat** (292 file,
28 WARN lunak). Status Linear T12.1–T12.19 → Done di `docs/LINEAR.md`
§1.3 + §8 dan `docs/linear-seed.json` v10 — perubahan status di Linear
sendiri dilakukan setelah verifikasi independen; 19 commit lokal E12
di-push ke GitHub `af5011f` (snapshot-push, 320 path). Epic E12 (FAT-50)
tuntas dan ditutup 2026-11-17.

**Tindak lanjut T12.6a (Opsi A, 2026-11-17, commit `ec49a2a`):** atas
keputusan Fathur, Opsi A diterapkan — lihat "Keputusan: selisih parts"
di atas. Verifikasi: `tsc` 0 error, `npm test` **330/330** (324 + 6 baru:
4 unit `deriveShiftSummaryFromHourly`/`buildDemoHourlyPoints` + 1
rekonsiliasi + 1 catatan kaki), build OK, preview HTTP 200, checker
**0 FAIL + 0 pengecualian** (293 file, 29 WARN). Fixture ringkasan di
`reconciliation.test.ts`, `ReconciliationFootnote.test.ts`, dan
`scopeLabels.test.ts` disamakan ke angka baru; mekanisme peringatan
parts tetap diuji lewat fixture legacy (counter live lama 350/342/8).
Payload stub HTTP di `telemetryRange.test.ts`/`shiftFilter.test.ts`
tidak diubah (data server sembarang, bukan seed demo); rollup tetap
dari live state (1400). Status Linear T12.6a (FAT-70) → Done setelah
verifikasi independen; Epic E12 kembali Done.
Yang tetap belum terverifikasi: visual di browser sungguhan (termasuk
badge/catatan + kedua tautan silang T12.19) + mode Real end-to-end
(lihat §6); perilaku default 72/500 di sisi server backend hidup juga
belum terverifikasi — yang dipastikan hanya klien tidak lagi
mengirim/mengasumsikan nilai lama.

## 16. Gap backend — Fungsionalitas System Admin (2026-11-17)

**Permintaan Fathur:** periksa apakah fungsionalitas System Admin (tidak
termasuk infra jaringan) membutuhkan penyesuaian dari sisi backend; bila ada,
buatkan issue/dokumen gap perbaikan untuk backend.

**Metode:** audit perbandingan — setiap halaman admin (IAM/Access Control,
System Audit, Health, MQTT DynSec + Config + Overview, Lines/Shifts/
Schedules, Operators) dicocokkan dengan `API_DOCUMENTATION.md` +
`ADMIN_PANEL_BUILD_GUIDE.md`, lewat endpoint + mapper di `http/*` dan
workaround di `demo/*`. Temuan High di-spot-check independen ke kode dan
dokumen (rotasi POST vs PATCH, toggle `{disabled}`, `accessMap`,
`{roles:[...]}`, body policy snake_case, sintesis health,
`OperationalEventItem` tanpa skema field, `mustChangePassword` tidak dipakai,
filter schedule API snake_case vs Guide camelCase, trailing slash config).

**Hasil: 50 gap (SYS-B1–SYS-B50): 12 High, 23 Medium, 15 Low.**
Registry endpoint panel lengkap (59 kunci di irisan ini; 131 operasi admin)
— **tidak ada satu pun endpoint yang hilang dari registry**. Hampir semua gap
adalah ketidaksesuaian **bentuk kontrak** (body/method/field/filter/skema
respons), bukan endpoint yang belum didaftarkan. Dokumen lengkap:
`docs/BACKEND_GAPS_SYSTEM_ADMIN.md` (50 gap + daftar "tidak ada gap" +
temuan sisi panel/demo + 22 pertanyaan terbuka).

**Enam tema:** (1) skema respons tidak tertulis untuk hampir seluruh
permukaan admin — panel menebak field dengan default diam-diam; (2) panel
mengirim snake_case / array jamak, dokumen menetapkan camelCase / objek
tunggal; (3) method salah di transport panel (PATCH vs PUT di IAM, POST vs
PATCH di dynsec); (4) filter yang dikirim panel tapi tidak ada di dokumen /
bertentangan antar-dokumen, tanpa aturan apakah query param tak dikenal
diabaikan atau ditolak 400; (5) Demo menutupi kegagalan Real mode; (6)
kontradiksi dokumen-vs-dokumen (D-1/D-2 sudah diketahui §3; D-3–D-7 baru).

**Blok terbesar:** bentuk dynsec (B28–B32, B36, B37 — 7 dari 23 operasi
dynsec: method, body tunggal vs jamak, nilai `access`, nama field password
sekali tampil, bentuk objek klien/peran/grup); tulis policy + ABAC (B1–B3);
kontrak audit + health (B19, B20 — halaman tampil salah tanpa error);
kontrak config broker (B38–B43).

**Linear:** Epic E13 (FAT-71) + 50 child SYS-B1–SYS-B50 (FAT-72–FAT-121),
semua Todo; `docs/LINEAR.md` §1.1/§1.3/§8 + `docs/linear-seed.json` v12
(117 issue: 58 Done / 1 In Progress / 58 Todo). **Bukan implementasi panel**
— tidak ada perubahan kode di repo ini untuk E13 (hanya dokumen gap +
entri Linear). Acceptance criteria tiap gap harus diuji melawan backend
sungguhan di mode Real, bukan Demo.

**Dikecualikan dari audit ini:** infra jaringan (Nginx/dual-vhost/port/TLS/
tunnel) dan mode akses Private/Public — sudah tercakup
`docs/BACKEND_REQUIREMENTS_ACCESS_MODE.md` (B1–B25, A10.2); telemetry/OEE/
analytics — sudah diaudit E11/E12 (§14–§15).

## 17. Tindak lanjut panel keputusan Fase 0 — Epic E14 (2026-11-17)

Fathur mencatat 12 dari 15 keputusan Fase 0 (K-01–K-15) di decision log
Lampiran C `docs/BACKEND_UPGRADE_PLAN.md` (17 November 2026); K-05, K-06,
K-07 ditunda. Epic ini menerapkan perubahan panel yang mengikuti keputusan
yang sudah diputuskan — di luar keputusan yang masih di-skip. Dua keputusan
menyimpang dari rekomendasi rencana: K-03 memilih (a) wajib slash (bukan
(c) terima keduanya) dan K-11 memilih (b) `POST /clients/provision`
(bukan (a) `POST /clients`); keduanya diterapkan apa adanya.

**P14.1 — K-03 trailing slash config (FAT-123).** Registry
`src/services/api/endpoints/mqtt.ts` `MQTT_CONFIG_GET`: template +
buildPath menjadi `/api/v1/mqtt/configuration/` (sebelumnya tanpa slash).
`http/mqttConfig.ts` dan demo memakai `buildPath()` sehingga ikut otomatis;
transport tidak menormalisasi slash (terverifikasi).

**P14.2 — K-10 PUT IAM (FAT-124).** `src/services/api/http/iam.ts`
`updateIamRole` + `updateIamPolicy`: method PATCH → PUT (registry sudah
PUT: `IAM_ROLES_UPDATE`, `IAM_POLICIES_UPDATE`); parameter `patch`
di-rename ke `changes`. Pemanggil positional (`setIamRoleActive`) tidak
berubah.

**P14.3 — K-10 PATCH dynsec (FAT-125).**
`src/services/api/http/mqttDynsec.ts` `rotateMqttClientPassword`: POST →
PATCH; `toggleMqttClient`: POST → PATCH + body `{disabled: !enabled}` →
`{enabled}`. Registry sudah PATCH (`MQTT_DYNSEC_CLIENTS_PASSWORD`,
`MQTT_DYNSEC_CLIENTS_ENABLE`).

**P14.4 — K-11 provisioning lewat `POST /clients/provision` (FAT-126).**
Registry baru `MQTT_DYNSEC_CLIENTS_PROVISION` (POST,
`/api/v1/mqtt/dynamic-security/clients/provision`) di
`src/services/api/endpoints/mqtt.ts`; `/mqtt/dynamic-security/clients/provision`
dihapus dari `FORBIDDEN_ENDPOINT_PATTERNS` + komentar header
`src/services/api/endpoints.ts` (jalur `/mqtt/dynamic-security/provision`
tanpa `/clients` TETAP diblokir). `http/mqttDynsec.ts` `createMqttClient`:
cabang deviceId+access (tanpa roles) memakai endpoint PROVISION, cabang
roles tetap CREATE; `demo/mqttDynsec.ts` `recordEndpoint` mengikuti cabang
yang sama. Registry kini **132 operasi REST admin** (+1 WebSocket = 133);
`modeAndTransport.test.ts` diperbarui 131 → 132; komentar header
`endpoints.ts` diperbarui.

**Terverifikasi tidak butuh perubahan panel.** K-14 (a): `acknowledgeOperationalEvent`
(`http/monitoring.ts`) sudah mengirim body `{note?}` saja, tanpa
`operatorId`. K-09 (b): `createIamPermission` tidak punya pemanggil UI
(hanya test) — panel tidak pernah memanggil `POST /permissions`; endpoint
dihapus dari dokumen backend, bukan dari panel.

**Test baru.** `modeAndTransport.test.ts`: test registry K-03/K-11 +
test stub HTTP port 3003 yang menegaskan method + path + body keempat
perubahan (PUT roles/policies, PATCH rotate/toggle dengan body
`{enabled: false}`, POST provision dengan body deviceId+access,
GET config berslash; plus asersi negatif: tidak ada lagi POST
rotate/toggle atau PATCH IAM). `contractAlignment.test.ts`: alur
`createMqttClient` deviceId ditambahkan agar cakupan 100% katalog
(`MQTT_DYNSEC_CLIENTS_PROVISION` ikut terpanggil).

**Catatan.**
- Stub test kedua dalam satu file HARUS memakai port berbeda (3003; stub
  pertama memakai 3001): pool keep-alive undici memakai ulang soket mati
  ke 3001 sehingga login gagal NETWORK. Pola yang sama dipakai
  `accessMode.test.ts` (port 3002).
- B35 (`mapMqttClient` membaca `disabled`, bukan `enabled`) TIDAK
  diperbaiki di sini — di luar keputusan Fase 0; bentuk respons backend
  belum diputuskan. Stub test mendokumentasikannya dengan mengirim
  `{disabled: true}` untuk toggle.
- B1/B3 (bentuk body policy + grammar ABAC) tetap menunggu keputusan
  backend — tidak ada K-item yang menutupnya; menjadi bagian Fase 3.
- K-05/K-06/K-07 yang ditunda memblokir Fase 2 (dynsec) dan Fase 5
  (kontrak config broker); Fase 1 bisa berjalan untuk bagian yang
  keputusannya sudah ada, kecuali skema dynsec dan config.
- Mode Real tetap belum terverifikasi end-to-end (belum ada backend);
  keempat perubahan di atas diverifikasi melawan stub HTTP lokal, bukan
  server sungguhan.

**Verifikasi (independen):** `tsc` 0 error; tests **332/332** (330 + 2
baru); `vite build` OK (peringatan chunk-size yang sudah ada);
preview HTTP 200; checker **0 FAIL** (293 file, 32 WARN lunak — naik dari
29: `modeAndTransport.test.ts` 568, `contractAlignment.test.ts` 509,
`http/mqttDynsec.ts` 401; semua di bawah hard cap).

**Linear:** Epic E14 (FAT-122) + 5 child P14.1–P14.5 (FAT-123–FAT-127),
semua Done; `docs/LINEAR.md` §1.1/§1.3/§8 + `docs/linear-seed.json` v13
(123 issue: 64 Done / 1 In Progress / 58 Todo).

## 18. K-05/K-06/K-07: ikuti desain API_DOCUMENTATION — Epic E15 (2026-11-17)

**Keputusan (Fathur, 2026-11-17 15:30 WIB):** "terkait poin K-05, K-06,
K-07 ikuti API_DOCUMENTATION design saja dulu sembari mencatat poinnya
untuk guide peningkatan backend" — panel mengikuti desain dokumen; poin
yang tidak bisa diputuskan dari dokumen dicatat di
`docs/BACKEND_UPGRADE_PLAN.md` (decision log Lampiran C + item Fase 2/5)
sebagai tugas dokumentasi backend.

**Dasar dokumen (dibaca langsung sebelum implementasi):**

- API doc §M: endpoint dynsec hanya mencantumkan method/path/status —
  TIDAK memberi skema body/respons sub-operasi. Bentuk objek tunggal ada
  di Guide Lampiran A: `POST /clients/:name/roles {rolename, priority?}`,
  `POST /roles/:name/acls {acltype, topic, ...}`,
  `POST /groups/:name/clients {username, priority?}`,
  `POST /groups/:name/roles {rolename, priority?}`. ("Lampiran O" di
  `docs/BACKEND_GAPS_SYSTEM_ADMIN.md` = sub-bagian O di dalam Lampiran A.)
- API §M: password "tidak pernah dicatat atau dikembalikan ulang setelah
  pembuatan (`generatePassword()` hanya sekali)"; contoh cURL selalu
  menyertakan password eksplisit; Guide §7.2: password klien MQTT min 8
  (env), maks 128.
- API §3.3b: hanya tabel endpoint config — TIDAK ada skema JSON config.
  API §3.3a: overview `{dynamicSecurity: object | null, configuration:
  object | null}` (null bila plugin tidak aktif).

**Perubahan (E15, FAT-128–133):**

- P15.1 K-05 (FAT-129): `http/mqttDynsec.ts` — 4 body ke objek tunggal:
  `addMqttClientRole {roles:[{rolename, priority}]}` →
  `{rolename, priority}`; `addMqttRoleAcl {acls:[acl]}` → `acl` (objek
  tunggal; field `allow` tetap dikirim — UI mengumpulkannya, dokumen
  tidak menyebut `allow`/`priority`); `addMqttGroupClient
  {clients:[{username}]}` → `{username}`; `addMqttGroupRole
  {roles:[{rolename}]}` → `{rolename}`. Registry tidak berubah
  (method/path sudah benar).
- P15.2 K-06 B33 (FAT-130): `CreateMqttClientModal.tsx` — password wajib:
  subtitle/label/placeholder janji auto-generate dihapus; validasi min 8
  maks 128 dengan pesan error (guard di `submit()` karena footer
  memanggil `submit()` langsung, bypass validasi HTML5 form; `required
  minLength maxLength` juga dipasang di Input).
- P15.3 K-06 B35 (FAT-131): `mappers/system.ts` `mapMqttClient` — logika
  `enabled` diperbaiki: `enabled` bila ada dipakai langsung; bila hanya
  `disabled` yang ada, turunkan darinya; bila tidak ada keduanya, default
  aktif. Bentuk lama membalik `{enabled:false}` (klien nonaktif tampil
  aktif).
- P15.4 K-07 B44 (FAT-132): `types/mqtt.ts` —
  `BrokerOverviewInfo['configuration']['status']` tambah `'UNAVAILABLE'`;
  `mapBrokerOverview` — `configuration: null` → status `'UNAVAILABLE'`
  (bukan `IN_SYNC`). Halaman `BrokerOverviewPage.tsx` tidak diubah —
  sudah me-render status mentah (badge warning untuk non-IN_SYNC).

**Tanpa perubahan panel (dicatat sebagai tugas backend):**

- B34: dokumen tidak menamai field password sekali tampil — panel tetap
  menebak `raw.generatedPassword ?? raw.password`; backend wajib
  mendokumentasikan nama field (item 2.5).
- B43: API §3.3b tidak memberi skema config — panel mempertahankan
  skema asumsinya; backend wajib mempublikasikan skema JSON + contoh
  (item 5.1).
- B32: dokumen tidak menyebut `allow`/`priority` pada ACL — backend
  wajib mendokumentasikan (item 2.2).
- B33 (demo): demo tetap auto-generate password (`dynsec_<acak>`) untuk
  pemanggilan `apiClient` langsung (test seam;
  `contractAlignment.test.ts` mengandalkannya) — BUKAN perilaku Real mode.

**Catatan.**

- Kontradiksi K-11 (bukan bagian E15, dicatat di sini): Guide §9.1
  menyatakan "Tidak ada `POST /clients/provision`; dokumen API lama
  menyebutnya, tetapi rute itu tidak terdaftar", sementara API §M memberi
  contoh cURL `POST /clients/provision` — Fathur sudah memilih (b) di
  K-11; Guide harus dikoreksi (sudah tercatat di decision log K-11).
- Stub test ketiga dalam satu file HARUS memakai port berbeda (3004; E14
  memakai 3003) — pelajaran yang sama seperti §17.
- K-05/K-06/K-07 kini tidak lagi menunda Fase 2/Fase 5 dari sisi
  keputusan; yang tertunda adalah penulisan dokumen/skema backend (item
  2.5/2.6/5.1).
- Mode Real tetap belum terverifikasi end-to-end (belum ada backend);
  perubahan di atas diverifikasi melawan stub HTTP lokal + unit test
  mapper, bukan server sungguhan.

**Verifikasi (independen):** `tsc` 0 error; tests **335/335** (332 + 3
baru: 2 unit mapper `system.test.ts`, 1 stub `modeAndTransport.test.ts`
port 3004); `vite build` OK (peringatan chunk-size yang sudah ada);
preview HTTP 200; checker **0 FAIL** (294 file, 32 WARN lunak).

**Linear:** Epic E15 (FAT-128) + 5 child P15.1–P15.5 (FAT-129–FAT-133),
semua Done; `docs/LINEAR.md` §1.1/§1.3/§8 + `docs/linear-seed.json` v14
(129 issue: 70 Done / 1 In Progress / 58 Todo).

## 19. Sinkronisasi dokumen panduan upgrade backend — Epic E16 (2026-11-17)

**Permintaan (Fathur, 2026-11-17 16:30 WIB):** "lakukan singronisasi atau
pembaruan terhadap BACKEND_UPGRADE_PLAN dan dokumen terkait lain yang akan
digunakan sebagai panduan upgrade backend jika belum" — periksa dan perbarui
dokumen panduan agar cocok dengan keadaan panel kini.

**Temuan sapuan:** 4 dokumen panduan masih memuat angka/pernyataan basi
pasca-E14/E15:

- `docs/BACKEND_UPGRADE_PLAN.md`: Status Linear 117 issue (58 Done / 1 In
  Progress / 58 Todo); registry 131 operasi; tests 330/330; referensi
  `AUDIT.md` §14–§16; Versi 1.0.
- `docs/BACKEND_GAPS_SYSTEM_ADMIN.md`: "131 operasi"; tema 2 masih
  menggambarkan panel mengirim array jamak dynsec; tiap gap
  B2/B28/B29/B31/B32/B33/B35/B36/B37/B38/B44 masih menulis perilaku panel
  saat audit tanpa catatan perubahan.
- `docs/BACKEND_REQUIREMENTS_ACCESS_MODE.md`: B7 "131 operasi admin".
- `docs/TELEMETRY_AUDIT.md`: tanpa penanda bahwa proposal panel sudah
  diimplementasikan (E11/E12).

**Perubahan (E16, FAT-134–138):**

- P16.1 (FAT-135): plan → v1.1: Linear 129 issue (70 Done / 1 In Progress /
  58 Todo) + E14/E15 Done; registry 132 operasi; tests 335/335; referensi
  AUDIT.md §14–§18 (header, P-3, footer); item 7.7 "132 operasi admin";
  catatan perubahan v1.1.
- P16.2 (FAT-136): gaps doc — bagian baru "Status panel pasca-audit —
  E14/E15" (tabel 11 gap: perilaku saat audit vs kini vs tugas backend
  tersisa) + catatan gap yang tidak berubah (B1/B3/B30/B39/B40/B41/B42);
  Ringkasan "132 operasi"; tema 2 diperbarui (K-05 (a) diputuskan, panel
  sudah objek tunggal).
- P16.3 (FAT-137): access-mode B7 → 132 operasi; telemetry audit header +
  baris status E11/E12 (yang tersisa hanya item sisi server Fase 8).
- P16.4 (FAT-138): verifikasi + bookkeeping.

**Yang sengaja TIDAK diubah:** AUDIT.md §16/§17 (catatan historis — §18
sudah mengoreksinya); `docs/linear-seed.json` `notes` (changelog historis);
prinsip proses Fase 0 di plan ("tergantung padanya ditunda, bukan dikerjakan
dengan asumsi") — bukan status basi.

**Verifikasi:** grep keempat dokumen panduan: 0 kemunculan "117 issue",
"131 operasi", "330/330", "§14–§16"; "ditunda" tersisa 1× di plan baris 255
(prinsip proses, benar dipertahankan). Tidak ada perubahan kode — tidak ada
test yang dijalankan ulang (terakhir 335/335, tsc 0, build OK, preview HTTP
200, checker 0 FAIL — E15).

**Linear:** Epic E16 (FAT-134) + 4 child P16.1–P16.4 (FAT-135–FAT-138),
semua Done; `docs/LINEAR.md` §1.1/§1.3/§8 + `docs/linear-seed.json` v15
(134 issue: 75 Done / 1 In Progress / 58 Todo).

## 20. Pull keputusan backend 18 Nov + analisis relevansi Fase 0 — Epic E17 (2026-11-18)

**Permintaan (Fathur, 2026-11-18 19:36 WIB):** "coba pull dan analisa
apakah file upgrade backend yang sudah diberikan keputusan perubahan tetap
relevan terhadap real-case industri karena ada beberapa keputusan yang
diberikan solusi alternatif?"

**Pull:** remote head baru `393fb09` "Docs: catat keputusan backend System
Admin 18 Nov 2026 (SYS-B8..B50)" oleh Fathur (19:11 WIB) — dicatat di
`docs/BACKEND_GAPS_SYSTEM_ADMIN.md` § "Keputusan backend — 18 November
2026": lima modul remediasi (specs/034–038 di repo `iiot-oee`),
implementasi belum dimulai. Di-cherry-pick ke lokal (`f7a4b5f`,
authorship dipertahankan); remote `d056e85` (E16) adalah ancestor-nya,
tidak ada konflik. **Temuan pull:** file yatim di remote
`src/features/assets/MachineDetailModal.tsx` (222 baris, ada sejak commit
awal `c59db6c`) — tidak ada di lokal, tidak diimpor apa pun; modal yang
benar ada di `src/features/assets/components/MachineDetailModal.tsx`.
Kemungkinan sisa snapshot-push awal (snapshot-push tidak menghapus file
remote). Penghapusan menunggu persetujuan Fathur.

**Analisis** (`docs/BACKEND_DECISIONS_REALITY_CHECK.md`, E17 FAT-139–143):
dari 15 keputusan Fase 0 — **7 dikonfirmasi** backend (K-05, K-06, K-07,
K-08, K-10, K-13, K-14), **1 disempurnakan** (K-04: `issues[]` +
`details`), **3 dibalik** (K-03 → terima keduanya; K-09 → endpoint
didukung + guard; K-11 → tidak ada `/clients/provision`, pakai
`POST /clients`), **3 masih terbuka** (K-01, K-02, K-12), **1 belum
tercakup** (K-15, Fase 8 telemetry). Grounding industri: Fastify
`ignoreTrailingSlash`, protokol native Mosquitto dynsec
(`$CONTROL/dynamic-security/v1`, objek perintah tunggal), RFC 7807/9457
+ pola Zod `issues`, NIST SP 800-63B §5.1.1.2 (min 8), definisi OEE
textbook / ISO 22400-2, pola provisioning AWS IoT / Azure DPS, Postel's
law vs Stripe untuk query param tak dikenal (K-08 dicatat sebagai
trade-off nyata, bukan konsensus — risiko typo filter tepat mengenai
konflik casing B45).

**Tindak lanjut panel yang ditimbulkan (belum dikerjakan — perlu
keputusan Fathur):** P-A revert K-11 (registry PROVISION + cabang
`isProvision` → 404 di Real mode; registry 132 → 131); P-B hapus
`accessMap` (kirim `access` verbatim); P-C polling apply/rollback sampai
status terminal (saat ini sekali); P-D/P-E filter server-side B11/B17;
P-F aturan anti-eskalasi B18; P-K koreksi decision log K-03/K-09/K-11 +
item rencana; P-L catatan B2/B5 di gaps doc sudah basi (E14 sudah PUT).
Tidak ada perubahan kode di E17 — analisis dokumen saja.

**Linear:** Epic E17 (FAT-139) + 4 child P17.1–P17.4 (FAT-140–FAT-143),
semua Done; `docs/LINEAR.md` §1.1/§1.3/§8 + `docs/linear-seed.json` v16
(139 issue: 80 Done / 1 In Progress / 58 Todo).

## 21. Penutupan keputusan gap — delegasi Fathur (2026-11-18 malam, Epic E18)

**Permintaan (Fathur, 2026-11-18 21:32 WIB):** "saya serahkan keputusan
kepadamu dengan tetap mereferensikan ke kebutuhan real-case dengan menutup
gap antara backend dan admin-panel tanpa membuat duplikasi/deprecated flow
logic" — Fathur mendelegasikan seluruh keputusan dari panduan penutupan
gap (`~/workspace/panduan-penutupan-keputusan-gap.md`, 22 item) ke Muse.
**Belum ke implementasi** (sesuai arahan sebelumnya): langkah ini hanya
memutuskan + mencatat; implementasi panel menjadi epic berikutnya.

**Koreksi pencatatan (ditemukan saat mengerjakan):** Bagian B panduan
(K-01/K-02/K-12/K-15) sempat ditulis sebagai "masih terbuka" — sebenarnya
keempatnya sudah diputuskan Fathur 17 Nov 2026 (semua (a), Lampiran C).
Yang terbuka adalah **konfirmasi backend** (D-1/D-2, aturan
`authz_version`, K-15 di luar lima modul). Panduan sudah diperbaiki;
keputusan delegasi untuk keempatnya adalah **konfirmasi tetap (a)**.

**Keputusan (22/22, tanpa skip):**

- **A — konfirmasi pembalikan backend 18 Nov:** K-03 → (c) terima kedua
  bentuk; K-04 → dual `issues[]`+`details` (panel baca `issues` saja);
  K-09 → (a) didukung + guard; K-11 → (a) `POST /clients` (rute
  provision tidak ada).
- **B — Fase 0 dikonfirmasi tetap:** K-01 (a) `current_password`, K-02
  (a) nested, K-12 (a) setiap mutasi bump, K-15 (a) excluded + "planned".
- **C — gap baru diputuskan:** B1 (b) body policy camelCase kanonis +
  `subjectMatch` terstruktur; B3 (a) ABAC scope minimal; B4 (a) alur paksa
  `mustChangePassword`; B6 (a) publikasikan skema respons IAM; B7 (a)
  `409 ROLE_IN_USE`; B16 (a) samakan 5/60 + `Retry-After`; enum
  `event_type` (a) tertutup (daftar dari backend).
- **D — arah panel:** P-A revert K-11 **Ya**, P-B hapus `accessMap`
  **Ya**, P-C polling terminal **Ya**, P-D/P-E filter **Ya**, P-F
  anti-eskalasi **Ya**, P-I `GET /health/detail` **Ya — tertunda sampai
  backend menyediakan endpoint**, P-J export audit **Ya**.

**Aturan satu alur kanonis (mengikat implementasi berikutnya):** hapus
cabang PROVISION + registry-nya seluruhnya (bukan dipertahankan sebagai
fallback deprecated); hapus `accessMap` + default `'telemetry'`
seluruhnya; panel membaca `issues` saja (bukan dual); satu casing body
policy (camelCase, tanpa fallback snake_case); satu aturan lockout
(server 5/60, panel tidak menegakkan hitungannya sendiri); satu alur
ganti-password-wajib. Tidak ada flow kedua yang dipertahankan "untuk
jaga-jaga".

**Rencana implementasi (epic berikutnya, belum dikerjakan):**

1. P-A — revert K-11: hapus `MQTT_DYNSEC_CLIENTS_PROVISION` dari registry
   + cabang `isProvision` (http + demo) + kembalikan pola provision ke
   daftar terlarang; sesuaikan tes; registry 132 → 131.
2. P-B — hapus `accessMap` (`http/mqttDynsec.ts:74,87`); kirim `access`
   verbatim; tanpa default.
3. P-C — polling apply/rollback sampai status terminal
   (`useBrokerConfig.ts:169-170` sekali → loop + timeout) + hormati
   `acknowledgeUnvalidated`.
4. P-D/P-E — filter server-side IAM audit (`getIamAuditDecisions`, limit
   100 tanpa filter → filter + limit s.d. 1000) + filter
   `operatorId`/`roleId` (setelah verifikasi dukungan backend).
5. P-F — sesuaikan aturan anti-eskalasi panel ke backend.
6. P-J — tombol export system audit (`GET /system/audit/export`) +
   transport + demo.
7. P-I — **tertunda**: transport `GET /health/detail` boleh disiapkan,
   rewire halaman menunggu endpoint backend (tanpa fallback ganda).
8. P-K/P-L — koreksi dokumen mengikuti jawaban A (sudah dikerjakan di
   E18: decision log §C.1a, item 1.5/2.3/3.9, gaps doc B2/B5).

**Pencatatan:** panduan terisi 22/22; Lampiran C §C.1a (rencana) + item
1.5/2.3/3.9 + checklist C.2; gaps doc § Keputusan lanjutan + tabel luar
modul + D-1/D-2 Terjawab + "Masih terbuka" diperbarui; reality-check §8;
Linear E18 (FAT-144) + 4 child (FAT-145–FAT-148), semua Done;
`docs/LINEAR.md` §1.1/§1.3/§8 + `docs/linear-seed.json` v17 (144 issue:
85 Done / 1 In Progress / 58 Todo).

**Yang masih terbuka setelah putaran ini:** tipe `operator.role` untuk
label custom, satuan `uptime`, overlap jadwal lintas tengah malam;
konfirmasi backend atas K-01/K-02/K-12; implementasi Fase 8 (K-15);
daftar enum `event_type` dari kode backend.

## 22. Gaps doc: semua gap SYS-B1–B50 tertutup — status (2026-11-18 malam, Epic E19)

**Permintaan (Fathur, 2026-11-18 21:43 WIB):** "sekarang perbarui dokumen
BACKEND_GAPS_SYSTEM_ADMIN.md agar semua gab tertutup, dan push".

**Yang dikerjakan:** `docs/BACKEND_GAPS_SYSTEM_ADMIN.md` mendapat section
baru "Status seluruh gap — 18 November 2026 (semua tertutup)" — tabel
50 baris (Gap | Disposisi | Keputusan/status), diverifikasi
programmatis: **50/50 baris, ID 1–50 lengkap**; disposisi 39 backend
18 Nov + 6 delegasi E18 (B1, B3, B4, B6, B7, B16) + 2 panel-side
selesai E14 (B2, B5) + 3 panel-side tindak lanjut epic berikut (B11
P-D, B17 P-E, B18 P-F); **"Belum diputuskan" = 0** di seluruh dokumen.
Pointer header ditambah.

**Arti "tertutup" — dicatat eksplisit di dokumen:** keputusan tercatat,
BUKAN implementasi selesai. Implementasi backend belum dimulai;
**SYS-B1–SYS-B50 tetap Todo di Linear (E13, FAT-71)** sampai backend
mengimplementasikannya dan acceptance criteria lolos di mode Real.
Tindak lanjut panel (P-A–P-J) disetujui di E18 tetapi belum
diimplementasikan — menjadi epic berikut. Yang masih terbuka setelah
putaran ini (bukan gap): tipe `operator.role` untuk label custom,
satuan `uptime`, overlap jadwal lintas tengah malam; konfirmasi backend
atas K-01/K-02/K-12; implementasi Fase 8 (K-15); daftar enum
`event_type` dari kode backend.

**Linear:** E19 (FAT-149) + P19.1 (FAT-150) + P19.2 (FAT-151), semua
Done; `docs/LINEAR.md` §1.1/§1.3/§8 + `docs/linear-seed.json` v18
(147 issue: 88 Done / 1 In Progress / 58 Todo — Todo tetap 58 karena
SYS-B1–SYS-B50 tidak ditutup di Linear).

## 23. E20 — Diff API docs terupdate + keputusan D-1–D-14 + arsip gaps (2026-11-19)

**Permintaan (Fathur, 2026-11-19 07:47 WIB):** "ini adalah api docs yang sudah
terupdate mengikuti backend upgrade. sekarang singkronkan admin-panel
menggunakan api ini. buat tanpa meninggalkan deprecated" — API docs baru
`~/workspace/user/files/pasted-text.txt` (2100 baris, Fastify 5.x + spec
015/020/027/032/034/035/036/037/042/043).

**P20.1 — Diff (FAT-153, Done):** `docs/API_SYNC_DIFF.md` (374 baris) — 3
peneliti paralel (registry+transport, mapper+demo+types, UI+pages+auth),
**294 entri: 162 OK / 102 CHANGE / 21 NEW / 9 REMOVE**. Temuan terberat:
`POST /devices/provision` nol hit di `src` (panel masih cabang `isProvision`
→ `/clients/provision` + `accessMap` hidup); `mapDevice` melempar untuk device
terikat; body tulis policy snake_case akan 400 `INVALID_POLICY`;
effective-permissions baca `effectiveRoles` yang dilarang; gerbang
`mustChangePassword` belum ada; lockout lokal masih hidup; mapper op-event
mengarang `severity` + `machine_name: 'Plant System'`; null `*Pct` di-koersi
ke 0; health sintetis. Daftar hapusan deprecated **X1–X34**; **22 kontradiksi
internal dokumen (C1–C22)** — termasuk C15: `401 PASSWORD_CHANGE_REQUIRED`
tidak ada di dokumen (yang ada flag + `403 PASSWORD_ROTATION_REQUIRED`).
Verifikasi independen parent: provision 0 hit ✓, accessMap di
`http/mqttDynsec.ts:74,87` ✓, `mustChangePassword` 0 hit ✓, lockout env di
`mode.ts:433-438` ✓, `severity` default `'INFO'` di `mappers/monitoring.ts:81`
✓, `PASSWORD_CHANGE_REQUIRED` 0 di dokumen vs `PASSWORD_ROTATION_REQUIRED` 1
✓, `must_change_password=<redacted>` di 3 baris dokumen ✓ (C20).

**Fakta baru dari api_docs (menggantikan keputusan lama):** provisioning resmi
= `POST /api/v1/devices/provision` (spec 015, ADR-009) — **K-11 E18
(`POST /clients`) DIGANTIKAN**; `POST /devices` manual = legacy/deprecated;
`GET /health/detail` terdefinisi lengkap (P-I tidak terblokir); skema
`OperationalEventItem` FR-034-01; enum `event_type` 32 nilai + pola; gate
`mustChangePassword` spec 043; panel dilarang lockout paralel; IAM kanonis
camelCase tanpa `privilege_level`; PIN dihapus total.

**P20.7 — Keputusan + tinjau-ulang + arsip (FAT-159, Done):** Fathur (19 Nov):
"ikuti api_docs dulu". **D-1–D-14 diputuskan mengikuti api_docs** (D-1 flag +
403; D-2 panel toleran 3 bentuk `/auth/me`; D-3 minta daftar ABAC; D-4 OFFLINE
nilai item; D-5 legacy `POST /devices` dipertahankan berlabel; D-6 cancel
ADMIN; D-7 operator ADMIN/SUPERVISOR; D-8 `oeePct` null; D-9
`MACHINE_NOT_BOUND`; D-10 camelCase saja; D-11 panel abaikan §M; D-12 hanya
kirim parameter terdaftar; D-13 guard ekspor per endpoint; D-14 semantik flag
jelas dari konteks). **Dokumen baru `docs/API_SYNC_REVIEW.md`** — 15 item yang
perlu ditinjau kembali backend (R-1–R-15) + tabel pertanyaan lama yang sudah
terjawab api_docs (uptime detik, overlap lintas tengah malam, enum event_type,
K-01/K-02/K-12/K-15, B1/B4/B6/B7/B16, Fase 8). **Gaps lama diarsipkan:**
`docs/BACKEND_GAPS_SYSTEM_ADMIN.md` → `docs/archive/` (header arsip
ditambahkan; pointer di `BACKEND_UPGRADE_PLAN.md`); referensi historis di
AUDIT.md/LINEAR.md/reality-check dibiarkan sebagai riwayat.

**Status E20:** diff + keputusan + arsip selesai. Implementasi batch
(P20.2–P20.5) **belum dimulai** — menunggu kata Fathur ("mulai"). Tidak ada
perubahan kode di putaran ini (hanya dokumen).

## 24. E20 — Implementasi sinkronisasi ke API docs terupdate (2026-11-19)

**Permintaan (Fathur, 2026-11-19 08:12 WIB):** "mulai implementasikan
singkronisasi terhadap admin-panel". Koordinator + 4 worker berurutan (satu
worker per batch, satu commit lokal per batch, verifikasi hijau per batch).
**Tidak di-push** (menunggu kata Fathur). Linear tidak disentuh koordinator —
parent menutup issue setelah verifikasi independen (di bawah).

**P20.2 — Batch 1 provisioning (`331ce38`, 25 file, +1367/−197):**
`POST /api/v1/devices/provision` (registry + transport + demo + UI onboarding
— kredensial sekali tampil `{credential: {username, password, clientId,
topicPrefix}}`), `POST /devices/:deviceId/revoke`, `POST
/devices/:deviceId/credentials` (guard 409 `DEVICE_IN_PRODUCTION`),
`GET /devices/:deviceId/health`; field baru (`enrollmentState`,
`provisionedAt`, `credentialRotatedAt`, `boundMachine {machineId,
machineName}`); `mapDevice` diperbaiki (tidak lagi melempar untuk device
terikat). **Dihapus seluruhnya:** registry `MQTT_DYNSEC_CLIENTS_PROVISION` +
cabang `isProvision` (HTTP + demo) + `accessMap` + default `'telemetry'`.
Modal register manual legacy tetap ada berlabel legacy (D-5).

**P20.3 — Batch 2 auth + IAM (`3ca57c8`, 73 file, +2620/−1461):** gerbang
`mustChangePassword` spec 043 — flag dari login + `403
PASSWORD_ROTATION_REQUIRED` → halaman ganti password (satu alur, tanpa jalur
kedua); **lockout lokal dihapus** (`LoginPage` + `mode.ts` env
`VITE_LOGIN_MAX_ATTEMPTS`/`VITE_LOGIN_COOLDOWN_SEC` + `.env.example`) —
throttle hanya server 5/60s + `Retry-After`; refresh mengembalikan
`authzVersion` server, 401 `AUTHZ_STALE` → login ulang; demo login password
min 8. Body tulis IAM **camelCase** (`{roleId, permissionId, resourcePattern,
effect, abacCondition}`, `{action, resourceType}`); `reason` dihapus dari
baris policy; default `privilege_level`/`policy_count` + badge Level +
validasi level demo dihapus; hanya **ADMIN immutable** (preset lain bisa
diubah/dihapus bila tak dipakai), `deleteIamRole` membedakan `ROLE_IMMUTABLE`
vs `ROLE_IN_USE` (sebut operatorId); revoke tanpa baris cocok → 200
`{success: true, removed: 0}`; demo `createIamPermission` diizinkan (guard
`INERT_PERMISSION`/`PERMISSION_EXISTS`); effective-permissions baca `roles`
saja (tanpa alias `effectiveRoles`); `access_control.read` ditambahkan, kunci
capability karangan dihapus; validator ABAC dipertahankan (whitelist menunggu
backend — R-1); `mapAuthMe` toleran 3 bentuk; filter audit IAM
(subject/decision/mode/from/to); role string bebas (`ROLE_LEVELS`/
`canManageTargetRole` dihapus; default `UNASSIGNED`); demo `updateOperator`
cek `ADMIN_SINGLETON_DENIED`; toggle `ADM-001` → 400 (bukan 403). Kunci
capability baru dari pembaruan api_docs 09:23: `cancel:work_order`,
`create:machine`, `read:mqtt_admin`, `manage:mqtt_admin`.

**P20.4 — Batch 3 health + audit (`00eadb6`, 39 file, +1496/−455):**
`GET /health/detail` (ADMIN+LAN) + **sintesis di `http/health.ts` dihapus**
(label 'API v1', environment 'production', latency 0, mqtt 'UP'); mapper
`OperationalEventItem` FR-034-01 persis (description, recordedAt, acknowledged
turunan acknowledgedAt, machineName null bila mesin dihapus, **tanpa severity**,
tanpa 'Plant System'); enum `event_type` kanonis 32 nilai + pola (gantikan
dropdown 15 tebakan); filter + kolom + tipe severity dihapus; builder kirim
`acknowledged` + `machine_id` hanya ke `/system/audit`; `mapAuditLog` tanpa
field karangan; ack note max 1000; export system-audit `GET
/system/audit/export` (tombol + transport + demo, format csv/ndjson/json,
retensi 90 hari).

**P20.5 — Batch 4 telemetry/OEE/mesin/config (`d4ea63e`, 72 file, +1497/−391):**
null `*Pct` dipertahankan null (koersi ke 0 + skema tak-nullable dihapus;
`oeePct` null saat kapasitas unknown — D-8); shift-summary baca `hourly[]`
bila `include_hourly`; `HourlyOeePoint` tambah deviceId/machineId/woId;
timeline bucket default 5m; `assertAuthenticatedHttp` dihapus pada read
OEE/telemetri; refresh rekonsiliasi body `{from, to}`; demo hourly bucket ISO
+ provisional; demo shift-summary hapus hardcode menit + fallback target 64
(pakai turunan demo 50); live-state hapus `device_online: true` hardcode +
field fabrikasi; FSM `OFFLINE` nilai item sah (D-4); status-history kirim
filter state + validasi from>=to; operators create kirim `isActive`; resolve
`device_id` required; trailing slash `/operational-events/` dihapus; MQTT
overview status `READY` + count null + available/lastError/measuredAt/
lastOperation; config GET field tanpa sumber = null; config status bentuk
dokumen; apply/rollback harap 202 `{operationId, versionId}` + polling
`GET /operations/:operationId` sampai terminal + `{confirm: true}`;
**`POST /backups` dihapus** dari registry + UI; `mapDowntime` baca
`duration_sec`; demo `unlabeled_only` = operatorReason IS NULL;
`classifyDowntimeReason` bentuk dokumen; `mapWorkOrder` baca
`dispatched_at`/`acked_at`/`actual_start_at`/`actual_end_at`/
`provisional`/`count_uncertain` + status `PENDING_CLOSE` (field karangan
dihapus); demo unbind hanya blokir WO ACTIVE; WS
`DOWNTIME_EVENT_OPENED`/`CLOSED`; fallback kode error 502/503 + teruskan
`details` pada 422 + baca `Retry-After`. **Endpoint baru dari pembaruan
09:23:** `GET /api/v1/system/access-mode` (registry + transport + demo +
wiring UI — prefer nilai server di mode Real, fallback derivasi env+kanal;
demo kembalikan nilai turunan env). Registry **132 → 137 kunci** (test
menegaskan).

**Verifikasi independen parent (2026-11-19, semua hijau):** `tsc` 0 error;
tests **368/368**; `vite build` OK (peringatan chunk yang sudah ada);
preview HTTP 200; checker **0 FAIL + 0 pengecualian** (305 file, 37 WARN
lunak). Dua temuan saat verifikasi — diperbaiki parent sebelum penutupan:
(1) test `PeriodRangePicker` 'Hari ini' gagal 367/368 — **bukan akibat E20**
(file tidak disentuh E20 sejak E12; fixture tanggal tetap 2026-11-17
sedangkan deteksi preset memakai `new Date()` sungguhan → lolos hanya bila
dijalankan 2026-11-17); diperbaiki test saja (`now` dinamis: hari ini Jakarta
10:24). (2) worker Batch 1 tidak mengembalikan `/clients/provision` ke
`FORBIDDEN_ENDPOINT_PATTERNS` (bertentangan dengan keputusan E18 P-A) —
dikembalikan parent (`endpoints.ts` + asersi test dibalik) dan suite hijau
kembali 368/368.

**Yang tetap belum terverifikasi:** Real mode end-to-end (tidak ada backend);
visual di browser sungguhan (Fathur cek setelah `npm run dev`); item
R-1–R-15 (`API_SYNC_REVIEW.md` §2) masih menunggu backend. **E21** (FAT-160)
menunggu giliran: penutupan backend sync/gaps di Linear setelah E20.

### 24.1 Koreksi + tindak lanjut laporan koordinator E20 (parent, 2026-11-19)

Laporan akhir koordinator (4 batch) diterima setelah §24 ditulis. Verifikasi
parent atas poin-poinnya:

- **Koreksi hitungan enum (kesalahan saya, bukan implementasi):** dokumen
  menulis **33** nilai eksplisit `event_type`, yang benar **32** — dihitung
  langsung dari `pasted-text.txt` baris 1074 (32 backtick; panel
  `OPERATIONAL_EVENT_TYPES` di `src/types/monitoring.ts` sudah benar 32
  sejak Batch 3). Dikoreksi 33 → 32 di `API_SYNC_DIFF.md` (O2, §15),
  `API_SYNC_REVIEW.md` §3, AUDIT.md §23/§24, dan MEMORY.md. Laporan ke
  Fathur sebelumnya menyebut "33 nilai" — dikoreksi di pesan lanjutan.
- **`CursorPaginationBar` diperbaiki:** bar menampilkan akumulasi "loaded
  count" sebagai "dari total" — padahal server tidak pernah mengirim total
  dataset (envelope `meta.count` = baris halaman). Kini "dari {totalCount}"
  hanya tampil bila `hasMore` false (saat itu semua rekaman sudah dimuat,
  jadi total = jumlah dimuat); bila masih ada halaman lanjutan, tampil
  "Menampilkan {loadedCount} rekaman" + "Halaman lanjutan tersedia".
  Satu file komponen, tanpa perubahan call-site (6 halaman).
- **Batasan yang dicatat (bukan diputuskan sepihak):** bentuk pasti JSON
  `GET /mqtt/configuration/status` tidak sepenuhnya dispesifikasi dokumen
  (mapper Batch 4 membaca defensif; `lastOperation: string | null`) —
  verifikasi melawan backend sungguhan. Fallback 502 generik: 502 →
  `MQTT_PROVISION_FAILED`; `DEVICE_OFFLINE` bersifat per-device sehingga
  tidak dipakai sebagai fallback umum.
- **Salinan API doc lama di repo** (`docs/API_DOCUMENTATION.md:1578`) masih
  menyebut `DOWNTIME_STARTED|DOWNTIME_ENDED` — bukan kode panel, jadi tidak
  diubah isinya; ditambahkan catatan kepala dokumen bahwa salinan ini sudah
  digantikan api_docs terupdate.
- **Hitungan test per batch (koordinator):** 343/344 → 350/351 → 351/352 →
  367/368 — satu-satunya yang gagal di tiap batch adalah test
  `PeriodRangePicker` yang sama (pre-existing, dibuktikan koordinator gagal
  identik di tree bersih `84c692a`); sudah diperbaiki parent (§24).

## 25. E21 — Penutupan backend sync/gaps di Linear (2026-11-19)

Epic E21 (FAT-160) + anak P21.1–P21.7 (FAT-161–FAT-167), semua Done
2026-11-19. Syarat Fathur terpenuhi: dilaksanakan SETELAH E20 selesai +
terverifikasi. Metode: 6 worker paralel (5 kelompok gap + R-items/
kontradiksi), tiap verdict dikutip pasal + nomor baris api_docs terupdate
(`~/workspace/user/files/pasted-text.txt`, 2100 baris, upload 07:47 WIB).
Deliverable: `docs/BACKEND_SYNC_CLOSURE.md` (commit lokal `59e4ffc`;
koordinator, tanpa ubah kode, tanpa push, tanpa tutup Linear sendiri).

### 25.1 Verdict 50 gap (parent verifikasi independen)

- **34 TERSELESAIKAN** (implementasi backend tercermin di api_docs) +
  **2 BERUBAH/DIGANTIKAN** (B13: `reason` hanya di audit IAM, tidak pernah
  di baris policy §3.4:1507; B30: provisioning kini `POST /devices/provision`
  tanpa field `access` §E.3a:442–478) = **36 issue ditutup di Linear** —
  FAT-72, 73, 75, 76, 78, 79, 80, 81, 84, 85, 86, 87, 89, 90, 91, 92, 93, 95,
  96, 97, 98, 99, 100, 101, 109, 110, 111, 113, 114, 115, 116, 117, 118, 119,
  120, 121.
- **14 MASIH TERBUKA** — tetap Todo: B3, B6, B11, B12, B17, B23, B31–B37,
  B41 (FAT-74, 77, 82, 83, 88, 94, 102–108, 112). Pola: DynSec paling belum
  selesai (7/10 terbuka — rute terkonfirmasi, seluruh skema body sub-op dan
  skema objek klien absen); Master Data paling tuntas (6/6, spec 036).
- Verifikasi parent: tabel §2 dokumen = 50 baris, ID 1–50 lengkap; hitungan
  verdict per baris 34/14/2 persis dengan §1; close+todo = 72–121 lengkap
  dan saling lepas; spot-check bukti di file (B41 `acknowledgeUnvalidated`
  0 hit; B23 list global tanpa `machine_id` :1007–1018; §H.4:940 PUT
  operator "ADMIN LAN only"; §K:1163 aturan null; `lastSeenAt` :411/:463).
- "Tutup" di sini = implementasi backend tercermin di api_docs — BUKAN
  bukti terhadap backend yang sedang berjalan. Verifikasi terhadap backend
  sungguhan tetap langkah terpisah (Real E2E, V8.2/FAT-28); bila backend
  nyata menyimpang, issue dapat dibuka kembali dengan bukti divergensi.

### 25.2 Keputusan lama vs api_docs baru

- Terkonfirmasi: K-01, K-03 (c), K-04 (dual), K-07, K-09 (a), K-10, K-12,
  K-13, K-14, K-15; B1, B4 (koreksi kode: gerbang 403, bukan "401 khusus"
  seperti redaksi E18), B7, B16; spec 036 + 038 seluruhnya; enum
  `event_type` 32 nilai eksplisit.
- Dibalik lagi: K-11 (kedua pilihan lama digantikan `/devices/provision`);
  B23 dibalik sebagian (`machine_id` hanya di `/system/audit` + export-nya).
- Tidak terkonfirmasi: K-02 (masih 3 varian `/auth/me`), K-05/K-06 (tidak
  ada skema body sub-op dynsec maupun skema objek klien), K-08 global
  (klausul abaikan param hanya untuk `/system/audit`); B3, B6 sebagian.

### 25.3 R-items, kontradiksi, item baru

- R-1–R-15: **3 terjawab** (R-7, R-11, R-15), **2 berubah** (R-3, R-9
  sebagian — keduanya bersandar amandemen 09:23, lihat §25.4), **10 masih
  terbuka** (R-1, R-2, R-4, R-5, R-6, R-8, R-10, R-12, R-13, R-14).
- C1–C22: 4 terjawab (C13, C14, C15, C18), 4 berubah, 13 masih terbuka,
  1 fakta (C10).
- Item baru **R-16–R-23** (§5.3 dokumen penutupan): R-16
  `acknowledgeUnvalidated`, R-17 PUT `/operators` ADMIN-only vs D-7, R-18
  `machine_id` global, R-19 filter `acknowledged` di `/system/audit`, R-20
  skema dynsec, R-21 skema `GET /info` + `GET /access-control/audit`, R-22
  filter `operatorId`/`roleId`, R-23 salinan api_docs baru.
- Prioritas tindak lanjut backend: P0 — R-1, R-2, R-4+R-17, R-6, R-20, R-23;
  P1 — R-9/R-3/C8/C21, R-8, R-10, R-5, R-18, R-19, R-16, R-21, R-22;
  P2 — R-12, R-13, R-14, C6, C22, C20.
- Koreksi penilaian E20 awal (diterapkan ke `API_SYNC_REVIEW.md`): R-7
  ternyata sudah terjawab (§K:1163); R-15 premisnya salah (`DeviceResponse`
  membawa `lastSeenAt`); D-7 perlu ditinjau ulang untuk PUT (§H.4:940).

### 25.4 Caveat metodologi — salinan file vs amandemen 09:23 (PENTING)

Salinan `pasted-text.txt` di disk bermtime 19 Nov 00:47 UTC (= 07:47 WIB)
— salinan upload asli. Amandemen 09:23 dari Fathur **tidak ada dalam file
ini** — diverifikasi parent: 0 hit `access-mode`, 0 hit
`authorize("cancel"`, baris 1340 masih `/clients/provision`. Verdict yang
bersandar pada amandemen (R-3/C8 cancel ADMIN, C21 §M ke model
`authorize(...)`, R-9/C1/C5 sebagian, keberadaan
`GET /api/v1/system/access-mode`) berstatus *tercatat dari amandemen, belum
terverifikasi di dokumen*; penutupan definitifnya menunggu salinan api_docs
baru (R-23). Tidak ada gap B yang verdictnya semata-mata amandemen.

### 25.5 Linear — terverifikasi live 2026-11-19

**163 issue = 140 Done / 1 In Progress (hanya E10 FAT-34) / 22 Todo.**
Todo tersisa: 14 SYS-B terbuka + E13 (FAT-71) + V8.1–V8.5 + A10.2 (FAT-40)
+ E8 (FAT-7). LINEAR.md + seed v21. Pemetaan E21:
`~/workspace/tmp-e21-mapping.json`.

## 26. Pembaruan dokumen pasca-E20/E21 — arsip + sinkronisasi dokumen live (2026-11-19, FAT-168)

Koordinator FAT-168. **Tanpa ubah kode panel, tanpa push.** Semua perubahan
adalah file `.md` di bawah; commit lokal `5560c2d` (verifikasi parent +
penutupan di commit terpisah).

### 26.1 Dokumen yang diarsipkan (3 dokumen, ke `docs/archive/`)

| Dokumen | Alasan pengarsipan |
|---|---|
| `docs/TELEMETRY_AUDIT.md` → `docs/archive/TELEMETRY_AUDIT.md` | Audit telemetry/OEE 2026-11-16 (25 gap G1–G25); 19 usulan sudah dikerjakan di sisi panel pada E11/E12; sisa sisi server kini dilacak sebagai Fase 8 di `docs/BACKEND_UPGRADE_PLAN.md` dan item R-1–R-23. Dipertahankan sebagai riwayat audit. |
| `docs/BACKEND_DECISIONS_REALITY_CHECK.md` → `docs/archive/BACKEND_DECISIONS_REALITY_CHECK.md` | Analisis relevansi keputusan backend 18 Nov 2026 (E17, FAT-139–143); keputusannya sudah tercatat di decision log `BACKEND_UPGRADE_PLAN.md` Lampiran C §C.1a dan ditutup E19/E21. Dipertahankan sebagai riwayat analisis. |
| `docs/E12_PROPOSAL.md` → `docs/archive/E12_PROPOSAL.md` | Proposal Epic E12 Telemetry & OEE; E12 selesai + ditutup 2026-11-17 (FAT-50 + 19 child Done). Dipertahankan sebagai riwayat proposal. |

Sebelumnya sudah diarsipkan (E20/P20.7): `docs/BACKEND_GAPS_SYSTEM_ADMIN.md` →
`docs/archive/BACKEND_GAPS_SYSTEM_ADMIN.md` (50 gap SYS-B1–SYS-B50; keputusan
tertutup E19, verdict vs api_docs di `docs/BACKEND_SYNC_CLOSURE.md`).

### 26.2 Dokumen yang diperbarui (7 dokumen)

| Dokumen | Ringkasan perubahan |
|---|---|
| `docs/BACKEND_UPGRADE_PLAN.md` (v1.1 → v1.2) | Header/status E21: 36/50 gap tercermin di api_docs, 14 terbuka, R-16–R-23 baru, K-11 digantikan `POST /devices/provision`, registry 137, tests 368/368, Linear 163 = 140/1/22. Semua acuan ke dokumen gap/telemetry/reality-check diarahkan ke `docs/archive/`. Koreksi isi Fase 1–9 yang E21 putuskan: K-05/K-06 tidak terkonfirmasi (R-20), K-02 masih 3 varian (R-2), K-08 global belum terkonfirmasi (R-10); item 1.2 tanpa `severity`; item 2.3 provisioning kanonis baru; item 4.4 `severity` tidak didukung + `acknowledged` didukung; item 4.5 `machine_id` hanya di `/system/audit` (B23 dibalik sebagian); item 5.4 `acknowledgeUnvalidated` 0 hit (R-16); item 5.5 `POST /backups` diputuskan tidak ada; item 6.1 filter schedule hanya snake_case; item 7.7/7.13: 137 operasi + `GET /system/access-mode` ada (amandemen 09:23, JWT wajib). Roadmap Fase 1–9 TETAP — tidak dihapus. |
| `docs/API_SYNC_DIFF.md` | Catatan kepala baru: E21 memverifikasi diff ini (`docs/BACKEND_SYNC_CLOSURE.md`); koreksi R-7 (terjawab §K:1163) dan R-15 (premis salah — `DeviceResponse` membawa `lastSeenAt`); koreksi enum `event_type` 33 → **32** (sisa terakhir, §16); caveat amandemen 09:23 tidak ada di salinan file (R-23). |
| `docs/API_SYNC_REVIEW.md` | Status disamakan dengan E21: R-1–R-15 = 3 terjawab (R-7, R-11, R-15) / 2 berubah (R-3, R-9) / 10 terbuka; R-11 dikoreksi terbuka → **terjawab** (dua guard ekspor tertulis eksplisit §I:1081 vs :1085–1087); tabel R-16–R-23 ditambahkan (§2); ringkasan status baru §5. |
| `docs/BACKEND_REQUIREMENTS_ACCESS_MODE.md` | Status 19 Nov 2026: `GET /api/v1/system/access-mode` (B13) sudah ada menurut amandemen 09:23 dan sudah dikonsumsi panel (E20 P20.5) — dengan koreksi JWT wajib (bukan tanpa auth); B16 ditandai sudah dikerjakan sisi panel; B7 132 → 137 operasi; checklist V1–V12 masih pending. **A10.2 keseluruhan tetap Blocked** (FAT-40) — enforcement server-side B7/B11 belum ada; seluruh persyaratan B1–B25 tetap berlaku, tidak ada yang dihapus. |
| `docs/admin-panel/ADMIN_PANEL_DOCUMENTATION.md` | **Perubahan terbesar.** Catatan kepala E20/E21 + koreksi: (a) status WO + `PENDING_CLOSE`; (b) `/system/audit` = alias feed operasional, `/access-control/audit` = audit IAM terpisah; (c) `GET /operational-events` global ada (tanpa `machine_id`); (d) mode AUTHZ hanya `shadow`/`enforce`, tanpa `"partial"`; (e) role operator string bebas, default `UNASSIGNED`; (f) provisioning kanonis `POST /devices/provision`; (g) gerbang `mustChangePassword` → `403 PASSWORD_ROTATION_REQUIRED` + `/force-change-password` (§3.1a baru); (h) `GET /devices/:id/health` + `GET /health/detail` + `GET /system/access-mode` + `AUTH_ME`/`AUTH_PASSWORD_CHANGE`; (i) klaim salah dihapus: dispatch/complete/validate-zone/initiate HMI-only (bukan endpoint panel), `POST /permissions` didukung (bukan read-only), hanya `ADMIN` immutable, wildcard `*` diizinkan, `401 AUTHZ_STALE` (bukan `AUTHZ_VERSION_STALE`), dynsec enable via `PATCH /clients/{name}/enable`, tanpa ekspor downtime global, field device-health `heapFree/tasksHealthy/...`, apply/rollback 202 + polling, tanpa `severity`. |
| `PAGE_DOCUMENTATION.md` (21 → 25 halaman) | Verifikasi ulang ke-21 halaman terhadap `src/app/Router.tsx` + komponen; 4 halaman baru: §22 Force Change Password, §23 Production Lines, §24 Shifts, §25 Shift Schedules. Isi yang diperbarui E20: Login (tanpa lockout lokal, throttle server + `Retry-After`, preset demo env-gated, redirect gerbang); Shell (tanpa pemilih role, access-mode dari server); Overview §D (list global, tanpa severity); Work Orders (`PENDING_CLOSE`, dispatch/complete HMI-only, tanpa wizard — hanya Detail + resolve preview + Cancel ADMIN); Operational Events (enum 32, tanpa severity, ack note 1000, list global); Devices (provision/revoke/rotasi kredensial, `enrollmentState`); Operators (role string bebas, `UNASSIGNED`, `isActive`, ADM-001 400/403); Shift Analytics (bucket 5m, null `*Pct`); Broker Overview (`READY`, count `null`); Dynamic Security (3 tab, tanpa modal provision); Broker Config (5 tab, apply/rollback 202 + polling, tanpa `POST /backups`); System Health (`/health/detail`); Access Control (`/access-control/info` dibaca, hanya ADMIN immutable, `POST /permissions` didukung, tab Inspector, audit IAM berfilter); Audit Trail (sumber `GET /system/audit` + ekspor); System Info (mode `shadow`/`enforce`). |
| `ADMIN_PANEL_DESIGN_SPEC.md` | **Hanya catatan status singkat di kepala** — bodi spec v1.0 (12 Nov 2026) tidak ditulis ulang: dokumen dipertahankan utuh sebagai arsip desain historis; kontrak otoritatif kini `docs/admin-panel/ADMIN_PANEL_DOCUMENTATION.md` (19 Nov 2026) + `AUDIT.md` §23–§25. |

### 26.3 Status dokumen live vs arsip sesudah tugas ini

**Live (dokumen kerja aktif):** `AUDIT.md`, `docs/API_SYNC_DIFF.md`,
`docs/API_SYNC_REVIEW.md`, `docs/BACKEND_SYNC_CLOSURE.md`,
`docs/BACKEND_UPGRADE_PLAN.md` (v1.2, roadmap Fase 1–9),
`docs/BACKEND_REQUIREMENTS_ACCESS_MODE.md`,
`docs/admin-panel/ADMIN_PANEL_DOCUMENTATION.md` (kontrak Spec 025),
`PAGE_DOCUMENTATION.md` (25 halaman), `ADMIN_PANEL_DESIGN_SPEC.md` (arsip
desain historis — bodi beku, hanya catatan kepala),
`docs/API_DOCUMENTATION.md` (salinan lama, berheader "sudah digantikan
api_docs terupdate"), `docs/LINEAR.md`, `docs/DIRECTORY_STRUCTURE.md`.

**Arsip (`docs/archive/`, riwayat — jangan dijadikan acuan kontrak aktif):**
`BACKEND_GAPS_SYSTEM_ADMIN.md`, `TELEMETRY_AUDIT.md`,
`BACKEND_DECISIONS_REALITY_CHECK.md`, `E12_PROPOSAL.md`.

Catatan: penyebutan path asli ketiga dokumen yang diarsipkan di bagian
historis bertanggal — AUDIT.md §13–§22 dan LINEAR.md §8 — sengaja dibiarkan
apa adanya sebagai rekaman; file-file itu kini berada di `docs/archive/`.

### 26.4 Keputusan parent (verifikasi 2026-11-19)

- **`docs/linear-seed.json` dibiarkan sebagai snapshot historis.**
  27 kemunculan path lama ada di dalam array `issues` (deskripsi issue saat
  dibuat); menulis ulang berarti mengubah rekaman historis. Yang diperbarui
  hanya `created.issueMap` + `verified` (FAT-168 masuk, seed v22).
- **Referensi internal di dalam file arsip dibiarkan** sebagai isi historis
  (preseden E20 — hanya header arsip yang ditambahkan).
- **Komentar kode `src/services/api/http/mappers/monitoring.ts:313`**
  ("TELEMETRY_AUDIT F-7") dibiarkan — di luar cakupan tugas dokumen, dan
  tugas ini tanpa ubah kode panel.

**Yang tidak diputuskan dalam tugas ini (butuh keputusan/konfirmasi lain):**
- Verifikasi definitif butir amandemen 09:23 (`GET /system/access-mode`,
  otorisasi `authorize(...)`, cURL §M) menunggu salinan api_docs baru (R-23)
  — semua penanda "(amandemen 09:23, belum terverifikasi di dokumen)"
  dipertahankan apa adanya di dokumen yang diperbarui.
- R-1–R-23 (18 masih terbuka) tetap menunggu jawaban backend; tidak ada
  R-item yang ditutup atau diputuskan dalam tugas ini.
- `GET /mqtt/configuration/status`: bentuk pasti JSON-nya tidak sepenuhnya
  dispesifikasi api_docs (AUDIT.md §24.1) — mapper panel membaca defensif;
  verifikasi melawan backend sungguhan.

## 27. Aktivasi Real mode vs API live oee.fadik.web.id (2026-11-19)

Fathur: "API sudah berjalan di oee.fadik.web.id. fungsikan admin-panel
dengan endpoint api tersebut." V8.2 (FAT-28) tidak lagi Blocked — backend
ada dan menjawab; A10.2 (FAT-40) juga tidak lagi Blocked (label `blocked`
dihapus dari keduanya; FAT-28 → In Progress, FAT-40 tetap Todo menunggu
verifikasi terautentikasi).

### 27.1 Konfigurasi panel (lokal, `.env` — gitignored, TIDAK ter-commit)

```env
VITE_API_MODE=real
VITE_API_URL=https://oee.fadik.web.id/api/v1
VITE_WS_URL=wss://oee.fadik.web.id/ws/telemetry
```

Catatan implementasi (dibaca dari `src/services/api/mode.ts`):
`VITE_API_URL` dipakai apa adanya — harus lengkap termasuk `/api/v1`
(origin saja akan salah rute). `VITE_WS_URL` wajib diisi eksplisit bila
panel dijalankan dari dev server lokal, karena bila kosong WS diturunkan
dari origin panel (`ws://localhost:5173/ws/telemetry`), bukan dari API.
`VITE_NETWORK_MODE` dibiarkan kosong (deteksi port → LAN di dev server);
kewenangan mutasi pasca-login berasal dari server
(`GET /system/access-mode` → `mutations_allowed`, E20 P20.5).
Untuk deploy Vercel, ketiga nilai di atas diisi sebagai env vars dashboard
(Fathur) — bukan dari file ini.

### 27.2 Hasil probe API live (curl, 19 Nov 15:08–15:10 WIB)

| Endpoint | Hasil | Arti |
|---|---|---|
| `GET /health` | 200 `{status:"ok", uptime:~8266 dtk, db_connected:true, ws_clients:0, buffer 0/0, metrics totalReceived 0}` | Backend hidup ~2,3 jam; DB terhubung; **belum ada telemetri masuk** (0 sampel) |
| `GET /api/v1/health` | 404 `Route GET:/api/v1/health not found` | Benar per dokumen — health ada di root, bukan `/api/v1` |
| `GET /api/v1/system/access-mode` | 401 `UNAUTHORIZED` (Bearer wajib) | Endpoint **ada** dan butuh JWT — amandemen 09:23 terkonfirmasi HIDUP di backend, meski tidak ada di salinan api_docs |
| `GET /api/v1/auth/me` | 401 | Ada, butuh JWT |
| `GET /api/v1/live-state` | 200 array (STM32-OEE-01 RUNNING, oee 100.00, total 100/100/0) | Public (tanpa auth); data seed, bukan perangkat live |
| `GET /api/v1/machines` | 200 (CNC-ZTPH-01, CNC-MILLING-SIM, `boundDevice` + `macAddress`, `isOnline:false`) | Public; data seed 12–15 Nov |
| `GET /api/v1/products` | 200 (PRD-019-FX-01, PRD-COUPLING-M10, PRD-FLANGE-HUB-15) | Public; data seed |
| `GET /api/v1/operators` | 401 `Authentication required` | Tergating benar |
| `GET /api/v1/devices` | **500 `INTERNAL_SERVER_ERROR`** (tanpa token MAUPUN dengan Bearer invalid) | **Bug backend** — seharusnya 401 untuk token hilang/tidak valid, per kontrak |
| `GET /api/v1/work-orders` | **500 `INTERNAL_SERVER_ERROR`** (idem) | **Bug backend** — sama; perlu kabar ke tim backend |
| `GET /health/detail` | **403 `FORBIDDEN` "Health detail is not available through remote tunnel ingress."** | **Bukti enforcement server-side**: domain publik = kanal tunnel; endpoint ADMIN+LAN ditolak dari tunnel. A10.2 terkonfirmasi sebagian |
| `POST /api/v1/auth/login` (kredensial salah) | 401 `{"error":"UNAUTHORIZED","message":"Invalid operator credentials"}` | Rute login ada, envelope benar, kredensial salah ditolak (1 percobaan; limit 5/60) |
| `POST /api/v1/auth/login` (body kosong) | 400 `VALIDATION_ERROR` (Zod: `operator_id`/`password` wajib) | Validasi jalan |

### 27.3 Verifikasi panel

- `npm run build` hijau (peringatan chunk-size sudah ada sebelumnya).
  Bundle mengandung `oee.fadik.web.id` (API + WS). Preview lokal HTTP 200.
- **Cek visual halaman login GAGAL karena infra, bukan aplikasi:**
  browser cloud berjalan di VM terpisah dan tidak dapat mencapai preview
  lokal `http://127.0.0.1:4173` (connection refused); tidak ada Chromium
  headless di VM ini. Halaman login (badge mode Real, tanpa preset demo)
  dan percobaan login TEST-000 **tidak terlaksana** — tidak ada kredensial
  yang dimasukkan di mana pun. Yang butuh tangan Fathur: jalankan
  `npm run dev` lalu buka `http://localhost:5173/login` di browser sendiri,
  atau minta panel di-deploy publik (Vercel) agar verifikasi visual bisa
  dilakukan dari sisi saya.
- Implikasi kanal: panel yang diakses via domain publik berada di kanal
  tunnel. Selama access mode backend = private, mutasi dari panel publik
  akan 403 (server final); panel menampilkan nilai server
  (`mutations_allowed`) setelah login. Login penuh + uji mutasi menunggu
  kredensial operator sungguhan (Fathur: login sendiri, atau berikan via
  Secure Vault bila ingin saya yang menguji).

### 27.4 Linear

- FAT-28 (V8.2 Real E2E) Todo Blocked → **In Progress** (label `blocked`
  dihapus; blok "tidak ada backend" gugur).
- FAT-40 (A10.2) tetap Todo, label `blocked` dihapus — enforcement tunnel
  sudah terbukti (§27.2); verifikasi lengkap butuh sesi terautentikasi.
- E10 (FAT-34) tetap satu-satunya epic In Progress selain V8.2.

## 28. Audit API live Fase 1 — pemeriksaan menyeluruh tanpa auth (2026-11-19)

Atas permintaan Fathur ("backend api sudah diperbarui. jalankan
pemeriksaan menyeluruh api terhadap admin-panel ... jalankan tes
fungsional penuh"). Fase 1 = tanpa autentikasi (koordinator + 4 worker,
144 probe: 137 operasi registry + 7 discovery). Dokumen lengkap:
`docs/API_LIVE_AUDIT.md` (commit `8466d02`, koreksi parent `b73e6fa`).

### 28.1 Hasil utama

- **Registry 137/137 ada** — tidak satu pun operasi panel hilang di live.
  Status probe: 401×58, 400×47, 200×14, 404×17, 403×4, 502×1 (N-1,
  lihat koreksi di bawah).
- **Regresi §27 TERPERBAIKI (2):** `GET /devices` 500 → **200**,
  `GET /work-orders` 500 → **200**. Tidak ada lagi 500 di irisan B.
- **Shape 9/9 endpoint publik KOMPATIBEL** — 0 memecahkan mapper
  (persentase string, `stdCycleTimeSec` string, bare array, field opsional
  absen — semua ditoleransi).
- **Suite panel penuh:** `npm test` 368/368, `tsc` 0, build OK,
  `check:structure` 0 FAIL.
- **Yang terkonfirmasi benar:** penghapusan E20 hidup (`/clients/provision`
  404, `POST /backups` 404); aktuasi HMI-only 403 tunnel; apply/rollback
  403 tunnel; OEE butuh `machine_id`/`device_id` (400); audit feed live
  aktif (50 event, terbaru `SECURITY_REJECTION` dari `PERIMETER_GATEWAY`).

### 28.2 Gap baru (E22, FAT-169)

| Gap | Isi | Severity | Sisi |
|---|---|---|---|
| N-2 (FAT-170) | Default device panel hardcoded `STM32-OEE-01` — ambil dari daftar live | Low | Panel |
| N-3 (FAT-171) | Urutan gate auth-vs-validasi tidak konsisten pada mutasi | Low | Backend |
| N-4 (FAT-173) | Dua teks pesan 401 berbeda (dua auth guard) | Low | Backend |
| N-5 (FAT-172) | Produk live tanpa `sku`/`isActive` | Low | Backend + panel |

**N-1 TIDAK dijadikan issue.** PATCH dynsec enable → 502 `text/plain`
hanya muncul sekali dalam sweep; verifikasi ulang parent 16:03 WIB
menghasilkan 400 (tanpa body) / 401 (dengan body) — tidak terreproduksi.
Penyebab paling mungkin: jendela restart backend ~15:52 WIB (uptime
687 dtk pada 16:03; restart sebelumnya ~15:27 WIB). Tercatat sebagai
transien di API_LIVE_AUDIT.md §11; bila Fase 2 ber-auth mereproduksinya,
buka kembali.

**N-2 turun Medium → Low.** Pada jam probe (sebelum 15:54 WIB) hanya ada
`STM32-OEE-SIM`; pada 15:54:40 WIB backend men-seed `STM32-OEE-01` +
`CNC-MILLING-01` + `WO-001` (operator ADM-001), dan telemetri -01 mengalir
(08:04–08:54Z, OEE 92.80, RUNNING). Gap berubah menjadi hardening panel
saja. `/health` metrics masih 0 — counter in-memory yang ter-reset oleh
restart 15:52 WIB, bukan tidak ada telemetri.

### 28.3 Fase 2 — tes fungsional penuh terautentikasi (MENUNGGU KEPUTUSAN FATHUR)

Kredensial operator sudah tersimpan di Secure Vault (Fathur, 15:58 WIB).
Yang TIDAK bisa diperiksa tanpa auth (API_LIVE_AUDIT.md §7): semua bentuk
respons GET tergating, `MQTT_OVERVIEW` + `MQTT_CONFIG_STATUS`, handshake WS,
alur login/refresh/change-password, akar N-1, 4 endpoint WO HMI-only,
mutasi apa pun, `mutations_allowed` tunnel vs LAN + `/system/access-mode`
ber-auth.

**Blokir Fase 2 bukan kredensial, melainkan jangkauan panel:** browser cloud
saya tidak dapat mencapai preview lokal (`127.0.0.1:4173` — sudah terbukti
gagal 15:12 WIB) dan tidak ada Chromium headless di VM ini. Opsi untuk
Fathur: (a) deploy panel ke Vercel (publik, login-gated; env vars di
dashboard) agar saya bisa menguji lewat browser; (b) jalankan panel di
browser sendiri (`npm run dev` → `localhost:5173/login`) dan uji login
sendiri, atau pasang Muse for Chrome supaya saya bisa memakai browsernya;
(c) expose preview lokal via tunnel. Fase 2 jalan setelah salah satu opsi
dipilih.

### 28.4 Linear

- E22 (FAT-169, Todo, Medium) + N-2–N-5 (FAT-170/171/173/172, Low, Todo).
- Linear kini 169 issue: 141 Done / 2 In Progress / 26 Todo; seed v24.
- FAT-28 (V8.2) tetap In Progress — Fase 2 adalah kelanjutannya.

## 29. Audit endpoint vs api_docs live (OpenAPI) — Fase 2a (2026-11-19)

Atas permintaan Fathur ("catat setiap temuan endpoint dan fitur frontend
dengan yang ada di api docs https://oee.fadik.web.id/docs ke linear,
pastikan seluruh endpoint di test dari sisi api docs langsung ataupun
melalui admin-panel"). Spec diunduh dari
`https://oee.fadik.web.id/docs/openapi.json` (OpenAPI 3.0.3, 104 paths,
141 operasi; dump Zod mentah tanpa operationId). Dokumen lengkap:
`docs/API_DOCS_AUDIT.md` (commit `8e07d73`; koordinator + 5 worker).

### 29.1 Hasil utama

- **Cakupan: LENGKAP.** 141 operasi spec − 5 excluded-by-design (aktuasi
  `/command` + 4 WO HMI-only) = 136 HTTP + 1 WS = 137 registry.
  **MISSING = 0, registry HTTP usang = 0.** Satu mismatch path: trailing
  slash `MQTT_CONFIG_GET` (N-39). Nama parameter identik di semua 75
  pasangan berparameter.
- **Kontrak: 67 OK / 55 MISMATCH / 19 KNOWN** (14 BREAKS / 37 ERROR-PRONE /
  4 COSMETIC). Panel statis: 121 WIRED_UI / 16 TRANSPORT_ONLY /
  0 UNREFERENCED; endpoint baru E20 semuanya terhubung UI.
- **Probe live 138 operasi (tanpa auth): 0 rute hilang, 0 5xx**
  (200×14, 401×58, 403×4, 400×52, 404×10). 121/138 cocok dengan spec;
  17 anomali = endpoint Access Control yang spec-nya tak deklarasikan
  respons error (N-40). N-1 (502) tidak muncul lagi — konsisten transien
  restart (backend di-restart 3× hari ini: ~15:27, ~15:52, ~16:18 WIB).

### 29.2 Gap baru (E23, FAT-174): N-6 Critical + N-7–N-41 (35)

| Severity | Gap |
|---|---|
| Critical (1) | N-6 (FAT-175) — CORS origin panel Vercel tidak diizinkan; blokir semua akses browser + tes fungsional |
| High (7) | N-7 (FAT-176) roles string[] dibaca objek; N-8 (FAT-177) refresh {from,to} vs {startWindow,endWindow} — membalikkan keputusan E20; N-9 (FAT-178) 7 sub-op DynSec {success} saja; N-10 (FAT-179) config status bentuk spec baru; N-11 (FAT-180) aggregate delta vs count; N-12 (FAT-181) config stage bridges + validation/impact/diff; N-13 (FAT-182) config diff lines[] |
| Medium (19) | N-14–N-31 (FAT-183–FAT-200) + N-34 (FAT-201): lineId mesin, PUT device null, ShiftSchema HH:MM, dayOfWeek, lineId di PATCH schedule, filter WO ID, health/detail DEGRADED, telemetry history, reconciliation jobs, limit wajib, encoding ekspor, downtime mapper, rollup 'line', shift-summary counts, MQTT overview, config unmanaged/raw/operations, ekspor op-events event_type |
| Low (9) | N-32 (FAT-202) eventFlags, N-33 (FAT-203) DynSec status laten, N-35 (FAT-204) WO cancel/resolve fabrikasi, N-36 (FAT-205) catalogueVersion, N-37 (FAT-206) legacy POST /devices, N-38 (FAT-207) login tanpa badge mode, N-39 (FAT-208) trailing slash, N-40 (FAT-209) spec tanpa 401/400, N-41 (FAT-210) 404 vs [] inkonsisten |

Verifikasi parent atas klaim High (langsung ke spec mentah): N-7 `roles`
= array-of-string + `assignments[]` objek; N-8 body `{startWindow?,
endWindow?}`; N-10 `runtime{mode, available, validation, …}`;
N-11 item aggregate punya `outputDelta/goodDelta/rejectDelta` tanpa
`totalCount` — semua terkonfirmasi. N-8 membalikkan keputusan E20
(R11/T9/X29); spec live menang.

### 29.3 Yang masih terblokir

- **N-6 (CORS):** tes panel via browser TERBLOKIR; seluruh verifikasi
  runtime halaman terautentikasi menunggu perbaikan backend. Tanpa auth:
  bentuk respons GET tergating hanya statis; handshake WS, mutasi, perilaku
  exact N-8, encoding ekspor N-24, dan data shift/shift-schedule live belum
  terverifikasi.
- **vercel.json (ae3424a) benar tapi BELUM berlaku di live** — remote masih
  `9653612`; `/login` tetap 404 sampai di-push + redeploy. Keputusan push
  (sekarang vs tunggu perbaikan CORS) masih menunggu jawaban Fathur
  (ditanyakan 16:26 WIB).

### 29.4 Linear

- E23 (FAT-174, Todo, High) + 36 anak N-6–N-41 (FAT-175–FAT-210).
- Linear kini 206 issue: 141 Done / 2 In Progress / 63 Todo; seed v25.
- FAT-28 (V8.2) tetap In Progress — kelanjutannya menunggu perbaikan N-6.

## 30. Debugging ulang — konsumsi API frontend (2026-11-19 16:45 WIB)

Atas permintaan Fathur ("ulangi debugging ... periksa konsumsi api di
frontend"). Hasil: SAMA seperti sebelumnya — tidak ada perubahan di sisi
backend maupun deployment.

### 30.1 Re-verifikasi (curl, 16:45 WIB)

- OPTIONS `/api/v1/auth/login` + Origin Vercel → **403**
  `{"statusCode":403,"error":"Forbidden","message":"CORS origin not allowed:
  https://iiot-oee-admin-panel.vercel.app"}` — CORS BELUM diperbaiki.
- GET `/health` + Origin Vercel → 403; tanpa Origin → 200 (backend jalan).
- Vercel `/login` → masih **404** (vercel.json belum live — belum di-push).

### 30.2 Uji ulang browser (16:45–16:47 WIB, 2 percobaan login)

- Login ADM-001 (Secure Vault) gagal 2× dengan pesan yang sama persis:
  "Koneksi jaringan terputus atau backend tidak terjangkau." — bukan
  kredensial salah, bukan lockout, bukan OTP.
- Backend terbukti HIDUP dari browser yang sama (direct GET `/api/v1` dan
  `/api/v1/auth/login` menjawab JSON 404 yang diharapkan) — jadi bukan
  "backend down", melainkan kegagalan cross-origin.
- Batasan jujur: DevTools browser tidak bisa dibuka di sesi itu, jadi baris
  CORS persis di Console / status OPTIONS tidak tertangkap dari browser.
  Bukti langsung penolakan preflight tetap dari curl §30.1 (403 eksplisit).
  Hipotesis "base URL salah" SUDAH gugur: bundle deployment terverifikasi
  memuat `VITE_API_URL=https://oee.fadik.web.id/api/v1`.

### 30.3 Konsumsi API di frontend (inspeksi kode)

- Base URL: `fullUrl()` = `resolveOriginBaseUrl()` + path absolut
  (`https://oee.fadik.web.id` + `/api/v1/...`) — benar; mode Real memilih
  `httpApiClient`, bukan demo (`client.ts`, `mode.ts`).
- Login: `httpAuth.login()` → POST `/api/v1/auth/login` body JSON
  `{operator_id, password, station_id}`, timeout 15 dtk, tanpa retry.
  `assertLanForMutation()` lolos (networkMode LAN di Vercel).
- Transport (`http/transport.ts`, `fetchRaw`): native `fetch`, mode CORS
  default, tanpa cookies; header `Accept: application/json` selalu,
  `Content-Type: application/json` bila ada body, `Authorization: Bearer`
  setelah login; token hanya di memori (D5).
- Rantai kegagalan: body JSON → browser wajib preflight OPTIONS → backend
  menjawab 403 "CORS origin not allowed" → `fetch` reject (TypeError) →
  ditangkap sebagai `ApiError NETWORK` (`transport.ts:243`) → pesan generik
  di atas. GET pun akan gagal sama (backend 403-kan juga simple GET dengan
  Origin Vercel). Pesan generik itu by design tak terhindarkan: browser
  sengaja tidak memberi tahu alasan fetch gagal.
- **Kesimpulan: tidak ada yang perlu diperbaiki di frontend.** Satu-satunya
  penghalang tetap N-6 (allowlist CORS backend, FAT-175). Alternatif bila
  backend belum bisa diubah: deploy panel di origin yang SUDAH diizinkan
  (isi allowlist saat ini tidak diketahui panel — tanyakan ke tim backend).

## 31. Debugging ulang #2 — CORS diklaim diperbaiki, ternyata belum (2026-11-19 16:54–16:56 WIB)

Atas permintaan Fathur ("CORS sudah diperbaiki, sekarang ulangi
pengetesan, periksa kebutuhan env admin-panel untuk bisa menggunakan api").
Hasil: **CORS BELUM teratasi untuk origin panel Vercel** — klaim perbaikan
tidak terbukti dari sisi curl maupun browser.

### 31.1 Bukti curl (16:55 WIB, pasca-restart backend ~16:41)

- OPTIONS preflight `/api/v1/auth/login` + Origin Vercel → **403**
  `{"statusCode":403,"error":"Forbidden","message":"CORS origin not allowed:
  https://iiot-oee-admin-panel.vercel.app"}`.
- POST `/auth/login` + header Origin Vercel (request asli, bukan preflight)
  → **403** yang sama. GET `/health` + Origin → **403**.
- Tanpa Origin: `/health` → 200; POST login dummy → 401 (backend sehat).
- `/health` uptime 839 dtk pada 16:55:21 → backend restart ~16:41 WIB
  (deploy perbaikan kemungkinan sudah jalan), TAPI allowlist tetap tidak
  memuat origin Vercel. Respons membawa header Cloudflare (CF-RAY), namun
  body 403 adalah JSON aplikasi sendiri — penolakan datang dari aplikasi,
  bukan dari Cloudflare.

### 31.2 Uji ulang browser (16:55–16:56 WIB, 2 percobaan login)

- Login ADM-001 gagal 2×, pesan sama: "Koneksi jaringan terputus atau
  backend tidak terjangkau." Bukan kredensial salah, bukan lockout, dan
  TIDAK ada pesan tunnel/mode observasi/read-only di layar — request login
  tetap tidak mencapai backend. Dashboard tidak pernah tampil.
- Yang perlu dicek di backend: origin PERSIS apa yang masuk allowlist
  (browser mengirim `https://iiot-oee-admin-panel.vercel.app`, https, tanpa
  trailing slash), dan apakah perubahan allowlist sudah ter-deploy ke
  instance yang melayani domain ini.

### 31.3 Kebutuhan env panel untuk memakai API (diperiksa 16:55 WIB)

Wajib (build-time, `VITE_*` dibakar ke bundle — ubah = deploy ulang):
- `VITE_API_MODE=real` — tanpa ini panel jalan mode Demo.
- `VITE_API_URL=https://oee.fadik.web.id/api/v1` — HARUS lengkap dengan
  `/api/v1` (dipakai apa adanya); bila kosong, panel memakai origin-nya
  sendiri + `/api/v1` (salah di Vercel).
- `VITE_WS_URL=wss://oee.fadik.web.id/ws/telemetry` — bila kosong, WS ikut
  alamat panel (salah di Vercel).
Ketiganya SUDAH ada di bundle Vercel yang live (deploy 9653612, terverifikasi
dari bundle) — dari sisi env tidak ada yang perlu diubah.
Perhatian pasca-CORS: `VITE_ACCESS_MODE` default `private`; server
memperlakukan trafik internet publik sebagai tunnel — mutasi dari panel
Vercel dapat ditolak 403 oleh server meski CORS lolos (gerbang mode akses,
bukan CORS). Login adalah mutasi pertama yang akan menguji gerbang ini.

## 32. Implementasi perbaikan frontend E23 (2026-11-19 17:09–17:55 WIB)

Atas perintah Fathur ("hentikan proses berjalan untuk backend ... lakukan
perbaikan di frontend", lalu "tunda pengecekan backend", "fokus perbaikan
frontend"): koordinator backend dihentikan; pengecekan backend DITUNDA
(catatan: worker backend sempat mengklaim selesai, tetapi tidak ada file
bukti yang tersimpan di disk dan dokumen gabungannya tidak ada — bila
dilanjutkan nanti, sweep harus diulang dari awal). Implementasi frontend
dikerjakan koordinator + 4 worker berurutan, satu commit per batch.

### 32.1 Verifikasi independen parent

- Git: `21a72b7` → `32fb9b4` (Batch 1 High) → `30d9bd5` (Batch 2 Medium 1)
  → `fad898a` (Batch 3 Medium 2) → `6d54f97` (Batch 4 Low); tree bersih.
- `npx tsc --noEmit`: **0 error**. `npm test`: **428 pass / 0 fail**
  (dari 368 sebelum E23, +60 test baru). `npm run build`: OK.
  `npm run check:structure`: **0 FAIL** (311 file, 39 WARN lunak).
- Spot-check parent: N-8 `{startWindow, endWindow}` di `http/telemetry.ts`
  + anotasi pembalikan keputusan E20 di `API_SYNC_REVIEW.md` §5 dan
  `API_SYNC_DIFF.md` (footnote `[^n8]`); N-7 mapper `assignments[]`;
  N-10 `BrokerConfigStatus {runtime, lock, current, lastOperation,
  lastAppliedVersionId}`; N-38 badge mode API + label akses di LoginPage;
  N-39 template tanpa trailing slash; N-25 kategori `'UNKNOWN'`. Semua
  terkonfirmasi.
- Koreksi worker yang dicatat (mengikuti spec live, bukan audit): N-12
  password bridge ternyata opsional (hanya `remote_address` wajib); N-15
  `firmwareVersion` juga opsional; N-20 enum DEGRADED hanya untuk
  database/mqtt; N-21 `actualCycleTimeSec` string nullable; N-22 respons
  jobs array polos, `jobId` numerik; N-31 spec tidak punya field `timestamp`
  di operasi config; N-36 mode IAM spec hanya `shadow|enforce`.

### 32.2 Yang ditutup (31 issue → Done di Linear)

- Batch 1 (High): FAT-176–182 (N-7–N-13). Batch 2: FAT-183–191
  (N-14–N-22). Batch 3: FAT-192–201 (N-23–N-31 + N-34). Batch 4:
  FAT-203–206, 208 (N-33, N-35–N-37, N-39). Mode Demo tetap jalan.
- **FAT-207 (N-38) tetap Todo (parsial):** badge mode API + label mode
  akses di LoginPage selesai; indikator status koneksi backend TIDAK
  dibuat — keputusan worker yang dicatat (di Demo tidak ada backend untuk
  di-ping; saat itu ping `/health` akan gagal karena CORS). CORS sudah
  diperbaiki live 17:06 WIB, jadi indikator itu kini layak — dicatat di
  deskripsi issue sebagai sisa pekerjaan.
- Tidak disentuh: N-6 (FAT-175, backend CORS — sudah diperbaiki live),
  N-32 (FAT-202, eventFlags — butuh jawaban backend soal definisi bit),
  N-40/N-41 (FAT-209/210, backend/spec).

### 32.3 Hitungan Linear (terverifikasi live, paginasi penuh)

**210 issue: 172 Done / 2 In Progress / 36 Todo**; 28 tanpa parent, 182
child. Koreksi: total ini mencakup 4 issue onboarding bawaan Linear
(FAT-1–FAT-4, Todo, bukan kerja proyek) yang tidak masuk hitungan 169/206
sebelumnya; tanpa keempatnya, total proyek = 206. Seed v25 → v26.
Belum terverifikasi: Real-mode E2E + visual di browser untuk batch ini,
dan perilaku live N-8 (400 vs jendela default) — butuh probe ber-auth.
Push 4 commit E23 + vercel.json menunggu perintah Fathur (snapshot-push;
remote masih `9653612`).

## 33. Tes fungsional Fase 2 — pasca-push + CORS diperbaiki (2026-11-19 18:05–18:07 WIB)

Login + navigasi panel Vercel melawan API live **BERHASIL untuk pertama
kalinya** (browser task 18:05–18:06 WIB; probe curl 18:07 WIB).

### 33.1 Hasil — login & navigasi LULUS

- Root → `/login` (200, tanpa 404) → login ADM-001 (Secure Vault,
  ADMIN-CONSOLE-01) → `/admin` Dashboard. Tanpa error jaringan, tanpa 403
  tunnel/mode observasi. **Gerbang tunnel server TIDAK memblokir login.**
- Badge: halaman login "API Mode: Real" + "Mode Akses: Private" (N-38
  terkonfirmasi live); Topbar "API: Real", "Akses: Private", "Koneksi Mesin
  Aktif", "Basis Data Aktif". Sesi aktif (tersisa 14:20), tidak logout.
- Dashboard: Plant Average OEE 0.0% ("Rata-rata 0 mesin online"), Machines
  Running 1/2, Active Downtimes 0, System Health "ok". Devices: 2 device,
  PROVISIONED, OFFLINE. Machines: 2 mesin, keduanya Terikat; CNC-MILLING-01
  RUNNING, CNC-MILLING-SIM UNCONFIGURED. Telemetry STM32-OEE-01: 200 sampel
  agregat, 50 baris raw halaman 1. Analytics 7-hari CNC-MILLING-01: Shift
  Total OEE 92.8% (A 95.5%, P 98.2%, Q 99.1%).
- Tidak ada error banner di halaman mana pun; tidak ada mutasi yang
  disubmit. Keterbatasan: browser task tanpa network inspector — temuan di
  bawah didasarkan pada tampilan UI + probe curl langsung (bukan log HTTP
  per-request).

### 33.2 Temuan — nilai live 0 padahal telemetri DB 92.8% (N-42, backend)

Dashboard 0.0% / parts 0/0 dan semua device OFFLINE **bukan kesalahan
panel** — panel merender setia apa yang dikembalikan API (probe curl
18:07 WIB):
- `GET /live-state`: kedua device `oee/avail/perf/quality "0.00"`,
  `totalCount/goodCount/rejectCount 0`, `operatingTimeSec/runTimeSec 0`,
  sementara `currentState` STM32-OEE-01 = RUNNING; `lastTelemetryAt`
  terakhir 15:54:40 WIB.
- `GET /devices`: `isOnline false` + `lastSeenAt null` untuk kedua device.
- `GET /health`: `metrics totalReceived/validIngested 0`,
  `lastIngestedAt null`; `ws_clients 1`; uptime 2117 dtk (restart ~17:31
  WIB — ke-6 hari ini).
- `GET /oee/shift-summary?device_id=STM32-OEE-01`: OEE 92.8% (A 95.5%,
  P 98.2%, Q 99.1%), `time_sec run 5940` — benar dari DB.
- Pola konsisten: live-state/presence tampaknya in-memory — nol setelah
  restart backend dan tidak dibangun ulang dari telemetri DB; tidak ada
  telemetri baru sejak 15:54 WIB untuk mengisi ulang. **Tiket: N-42
  (FAT-212, backend, High).**

### 33.3 Temuan — agregat all-null ditampilkan 0% (N-43, panel)

- `GET /telemetry/STM32-OEE-01/aggregate` (bucket 5m): semua `*Pct`/delta/
  `runSec` = `null` (sampleCount 9–10/bucket, provisional false) — sesuai
  aturan null ADR-019 — sementara baris raw/history membawa nilai 92.8%.
- Panel menghitung rata-rata dengan aturan E20 "bila semua null → 0"
  (`http/monitoring.ts`, `mean1`) + `total_parts = Σ totalCount` (null → 0),
  sehingga tab aggregate menampilkan "OEE Rata-rata 0%, Parts Total 0".
  Aturan itu dibuat saat null masih hipotetis; di produksi tampilannya
  menyesatkan. **Tiket: N-43 (FAT-213, panel, Low)** — tampilkan '—' bila
  semua nilai null, dengan catatan perubahan keputusan E20.

### 33.4 Observasi (tanpa tiket — butuh analisis lebih lanjut)

- **Reconciliation warning** ("2 differences exceed threshold"): RUNNING
  timeline vs summary 235 vs 99 mnt (+136); total timeline vs shift window
  10.080 vs 99 mnt (+9.981). Sebagian residual E11/E12 yang sudah dikenal
  (timeline↔hourly beda distribusi); selisih 10.080 mnt = 7 hari vs jendela
  shift 99 mnt — kemungkinan perbandingan jendela yang tidak sebanding di
  cek rekonsiliasi. Perlu analisis sebelum dijadikan tiket.
- **Catatan shift sementara** di Telemetry ("Daftar shift tidak tersedia —
  periksa akses shift.read / koneksi.") muncul saat loading lalu hilang
  sendiri (filter Pagi/Siang/Malam tersedia) — kemungkinan race loading.
- **"Last seen" device di laporan browser** (STM32-OEE-01 "18:05:10",
  SIM "16:54:51") **tidak terverifikasi**: API mengembalikan
  `lastSeenAt null` dan kode panel (`DeviceTable.tsx:94`) menampilkan
  'Belum ada data' bila null — kemungkinan agen browser membaca stempel
  "updated" halaman. Bukan temuan.
- Entri `SECURITY_REJECTION` di feed event Dashboard (17:08 WIB) adalah
  peristiwa lama sebelum login ini (403 health/detail tunnel + 401/400
  auth) — bukan error dari sesi ini.
- FAT-28 (V8.2 Real E2E) tetap In Progress: login + navigasi baca terbukti;
  mutasi + konsistensi data + visual lengkap belum terverifikasi.

## 34. Uji end-to-end pasca-push (2026-11-19 18:12–18:15 WIB)

Tiga sumber: (1) browser — 18 halaman dikunjungi (login ADM-001,
ADMIN-CONSOLE-01, baca saja, tanpa mutasi, tanpa network inspector);
(2) pemetaan statis konsumsi endpoint per halaman
(`~/workspace/tmp-e2e-static.md`); (3) probe curl 14 endpoint publik
tanpa auth (~18:13 WIB). Dokumen gabungan: `docs/E2E_TEST.md`
(ditulis koordinator; koreksi pasca-merge di §8 dokumen itu).

### 34.1 Yang berfungsi — halaman master-data tampil bersih

Devices (2, PROVISIONED, OFFLINE), Machines (2, Terikat), Products (5,
semua ACTIVE), Operators (5, semua ACTIVE), Lines (1), Shifts (3),
Shift Schedules (7), Access Control (Roles 4, Assignments 5, Policies
62, Permissions 41, Riwayat 44, status SHADOW), MQTT Overview (DynSec
READY — Clients 1, Roles 1, Groups 0) + DynSec (client backend-admin,
ENABLED), Downtime (empty state bersih, konsisten dengan 0 downtime
aktif). Login + navigasi sidebar berfungsi; indikator "Koneksi Langsung:
Terhubung", "API: Real", "Akses: Private", System Health "ok".

### 34.2 Inkonsistensi data antar-halaman (keluarga N-42)

- OEE: Dashboard 0.0% vs Analytics 92.8% vs Telemetry raw 92.8% vs
  Telemetry aggregate 0%. Parts: Dashboard/WO 0/0 vs raw counters
  hingga 199. CNC-MILLING-01 RUNNING sekaligus OFFLINE; "Machines
  Running 1/2" vs "0 mesin online".
- Telemetry hourly (Delta Per Jam): 2 bucket (15:00, 14:00), OEE "—",
  A/P/Q "—", "0 pcs · 0 reject" padahal counter raw naik. Aggregate
  (Downsampling): 21 bucket, semua OEE "—", "0 pcs · 0 reject",
  "OEE rata-rata 0%", catatan "(kapasitas unknown)". Rollup: "Tidak ada
  data rollup" (Telemetry) dan "Tidak ada data pada rentang ini"
  (Analytics).
- Analytics: Shift Total OEE 92.8% (A 95.5% Run 99m, P 98.2%, Q 99.1%)
  tetapi "0 good / 0 defect"; hourly "Kapasitas 0/Unknown", Parts 0/13;
  Target/Jam "—", Break 0m. Rekonsiliasi: "2 selisih melebihi ambang"
  (RUNNING timeline vs ringkasan 240 vs 99 mnt, +141; total timeline vs
  jendela shift 10.080 vs 99 mnt, +9.981).
- Akar yang sudah bertiket: N-42 (FAT-212, live-state nol/stale) +
  N-43 (FAT-213, agregat all-null → 0%). **Baru: E2E-04 (FAT-218)** —
  `OEE_HOURLY` mengembalikan `totalCount` null (sampleCount 91–109)
  dan `mapHourly` menghitung `parts_produced = num(totalCount, 0)` → 0.
  **Baru: E2E-07 (FAT-221)** — tiket investigasi selisih rekonsiliasi.

### 34.3 Satu halaman error keras — MQTT Config (E2E-08, backend)

`/admin/mqtt/configuration`: banner merah "Live configuration
'/mosquitto/config/mosquitto.conf' is not readable: ENOENT: no such
file or directory, open '/mosquitto/config/mosquitto.conf'"; body di
bawah tab kosong; Riwayat Versi & Perbedaan (0), Riwayat Penerapan (0),
Cadangan (0); halaman lambat (~10 dtk "Memuat pengaturan koneksi
mesin..."). Panel hanya menampilkan error backend — file config live
tidak ada/tidak dapat dibaca di server. **Tiket: E2E-08 (FAT-222,
backend, High).**

### 34.4 Halaman yang menelan error diam-diam (panel)

- **E2E-01 (FAT-215, High):** `OverviewPage.tsx:56` `catch {}` +
  `LiveStatePage.tsx:33` `catch {}` ("Handle silently") — gagal load =
  kartu kosong/0 tanpa banner, tanpa skeleton, tanpa empty state.
- **E2E-02 (FAT-216, Medium):** `QualityRejectsPage.tsx:37` `catch` →
  `setItems([])` — error tampil sebagai empty state "Tidak ada data
  reject…" yang menyesatkan.
- **E2E-03 (FAT-217, Medium):** `SystemHealthPage.tsx` — gagal `HEALTH`
  hanya menampilkan "Memuat status kesehatan sistem..." selamanya
  (catch → setHealth(null), tanpa banner); hanya gagal `HEALTH_DETAIL`
  yang diberi banner amber.
- Pola paling lengkap (pembanding): halaman `DataTable`
  (WO/downtime/audit/telemetry/system-audit) — skeleton + banner per
  kode HTTP + "Coba Lagi" + empty state; Analytics — error + retry per
  widget (4× onRetry).

### 34.5 Temuan lain yang bertiket (E25)

- **E2E-05 (FAT-219, Low):** 4 halaman CRUD (products/lines/shifts/
  shift-schedules) + Reconciliation tanpa teks empty-state.
- **E2E-06 (FAT-220, Low):** peringatan shift "tidak tersedia" sempat
  muncul saat loading /telemetry lalu hilang — kemungkinan race.
- **E2E-09 (FAT-223, backend, Medium):** audit feed — 20 baris
  SECURITY_REJECTION semuanya diatribusikan ke CNC-MILLING-01 /
  STM32-OEE-01 (termasuk penolakan CORS/auth dari panel sendiri), dan
  kolom Detail menampilkan description JSON mentah terpotong.
- **E2E-10 (FAT-224, Low):** kerapian list — sel WO "WO-001 WO-001 ·"
  (`WorkOrderColumns.tsx:36`: baris 2 `{order_number} · {shift_name}`,
  data live order_number == wo_id dan shift_name kosong); "SN:" kosong
  (API tak kirim serial_number, N-37); "CYCLE / TEMP 0.0s · -°C"
  (telemetri tak bawa suhu); sel LINE/SCOPE ADM-001 kosong.
- **E2E-11 (FAT-225, Low):** timeline Analytics — label sumbu
  berantakan/tumpang tindih; "Downtime ID: 2 tidak ditemukan di antara
  2 event downtime" (`ShiftTimelineDetail.tsx:121,137`).

### 34.6 Koreksi pencocokan (TRANSPORT_ONLY + route)

- Dari 16 TRANSPORT_ONLY di `API_DOCS_AUDIT.md` §8: **11 tetap
  TRANSPORT_ONLY**, **5 kini DIPAKAI UI secara tidak langsung**
  (`MQTT_CONFIG_VERSION_GET` — internal apply/rollback;
  `MQTT_DYNSEC_CLIENTS_GET`/`GROUPS_GET`/`ROLES_GET` — internal
  mutasi DynSec; `OPERATIONAL_EVENTS_BY_DEVICE` — builder path bersama)
  — semuanya hanya di mode Real kecuali yang terakhir. **WIRED_UI
  121 → 126**; UNREFERENCED tetap 0. Ke-11 sisanya temuan cakupan,
  bukan cacat (keputusan produk apakah UI-nya dibutuhkan).
- **Koreksi route:** rute top-level `/devices`, `/machines`, `/products`,
  `/operators` TIDAK ADA — hanya `/admin/*` (`Router.tsx:34,54-79`).
  Top-level yang ada: `/work-orders`, `/telemetry`, `/analytics`,
  `/downtime`, `/audit`, `/system-audit`. `/admin/audit` ADA di Router
  (tetap belum terverifikasi live — navigasi langsung menjatuhkan sesi
  ke /login). 25 halaman unik + 1 alias (`/admin/shift-analytics`).
- **Probe publik (~18:13 WIB): 12× 200** (health, live-state, devices,
  machines, products, work-orders, downtime-events/active,
  telemetry/:id, telemetry/:id/aggregate, oee/shift-summary, oee/hourly,
  quality/rejects), **1× 401 valid** (`/system/audit`), **1× 403 tunnel
  valid** (`/health/detail`), **1× 404 path probe salah**
  (`/telemetry/:device_id/history` — bukan temuan; registry panel benar).
  Backend saat probe: uptime ~41,5 mnt, ws_clients 5, db_connected true,
  metrics /health nol sejak restart.

### 34.7 Observasi tanpa tiket

- **"Last seen" Fase 2 terklarifikasi:** E2E ini menampilkan "Belum ada
  data" di Devices — membenarkan §33.4: bacaan "18:05:10" di Fase 2
  adalah stempel "updated" halaman, bukan last-seen device.
- Sesi hilang pada navigasi URL langsung (token in-memory only) —
  **by design (D5)**, bukan cacat; navigasi sidebar berfungsi.
- Kolom Shifts (SIANG/Siang/SIANG) adalah tiga field berbeda yang diisi
  seed backend dengan nilai nyaris sama — bukan cacat panel.
- System Health: layanan UNKNOWN ("Waktu Respons: —") + warning
  "Detail infrastruktur hanya tersedia untuk ADMIN di jaringan lokal
  pabrik", sementara header tetap "Koneksi Mesin Aktif · Basis Data
  Aktif" — terkait sisa N-38 (FAT-207, indikator koneksi).
- Access Control live: 41 permission (ADMIN 41, MAINTENANCE 3, OPERATOR
  8, SUPERVISOR 10) vs seed demo panel 30 — data live dibaca dari API;
  seed demo tertinggal, bukan cacat Real mode.
- MQTT Overview IN_SYNC dengan Active Version ID "—" / Last Applied "—"
  — null dirender "—" dengan benar.
- Baris SECURITY_REJECTION di audit feed adalah peristiwa historis
  pra-perbaikan CORS (17:08 WIB), bukan error sesi ini.
- Rollup kosong di Telemetry + Analytics belum teratribusi (bisa jadi
  memang kosong di DB) — butuh probe rollup langsung dengan parameter
  panel sebelum dijadikan tiket.

### 34.8 Yang BELUM terverifikasi (tetap)

Semua mutasi (11 IAM, 14 DynSec, Devices/Machines/Operators/Products/
Lines/Shifts/Schedules, RECONCILIATION_REFRESH, WO resolve/cancel,
DOWNTIME_REASON, ack, AUTH_CHANGE_PASSWORD, staging/apply/rollback
config); seluruh endpoint 401-gated (respons live vs mapper hanya
dibandingkan statis terhadap spec); WS handshake `/ws/telemetry`
(hanya `ws_clients: 5` di /health, tanpa kaitan ke sesi panel);
`/force-change-password` (hanya tampil bila mustChangePassword);
mapper downtime/rejects terhadap item nyata (data kosong saat ini);
N-16/N-17/N-18 laten; N-32 butuh jawaban backend. **FAT-28 (V8.2 Real
E2E) tetap In Progress.**

## 35. Uji mutasi end-to-end panel (2026-11-19 18:58–19:34 WIB)

Dua sesi browser berurutan, login ADM-001, station ADMIN-CONSOLE-01,
panel Vercel live terhadap API live `oee.fadik.web.id`, mengikuti
`docs/E2E_MUTATION_PLAN.md` (45 langkah + 13 cleanup). Dokumen lengkap
per langkah: `docs/E2E_MUTATION_TEST.md`. Bagian A (18:58–19:10 WIB):
master data + WO + ack + downtime + reconciliation. Bagian B
(19:11–19:34 WIB): IAM + DynSec + config. Semua mutasi yang dieksekusi
berhasil kecuali satu kegagalan persisten (L31, MUT-02); satu guard
probe gagal seperti yang diharapkan (L24).

### 35.1 Kesimpulan utama — mutasi dari Vercel lolos tanpa satu pun 403

Seluruh mutasi Bagian A dan Bagian B dieksekusi dari Vercel (ingress
tunnel, bukan LAN pabrik) dengan badge panel "API: Real" + "Mode
Akses: Private" — dan **tidak satu pun mengembalikan 403**, baik 403
klien (`assertLanForMutation`) maupun 403 gerbang tunnel server.
Termasuk di dalamnya: provision/register device, create/bind/edit
machine, create/edit product/operator, suspend/activate, rotasi
password operator, rotasi/revoke kredensial device, create/update/
toggle/delete role & policy IAM, assign/revoke role, create role &
ACL & group DynSec, ack event, overwrite label downtime, refresh
rekonsiliasi, dan cancel WO.

Pernyataan ini dibatasi secara hati-hati sebagai **bukti empiris**:
sesi login bertahan dan semua mutasi di atas lolos dari Vercel dalam
sesi uji ini. Uji ini **tidak membuktikan** penegakan sisi server mode
akses (A10.2 / FAT-40) selesai, dan juga **tidak membuktikan** ia
gagal — penegakan server tidak diuji secara khusus (tidak ada probe
negatif dari tunnel terhadap endpoint yang seharusnya ditolak, dan
tidak ada pembanding dari LAN pabrik). Jangan jadikan §35 ini vonis
atas A10.2 ke arah mana pun; yang tercatat adalah fakta bahwa gerbang
tidak menutup satu pun mutasi uji dari Vercel pada 19 Nov 2026 malam.

### 35.2 Hasil per domain

| Domain | Langkah | Hasil |
|---|---|---|
| Master data: device | L3 provision TEST01, L4 register TEST02, L7 edit, L14 rotasi kredensial, L15 revoke | Semua OK; kredensial sekali-tampil disalin sebelum dialog ditutup |
| Master data: machine | L5 create CNC-TEST-E2E-01, L6 bind TEST01 | OK; validasi server menolak Slave ID 1 duplikat ("already assigned to machine CNC-MILLING-01"), diulang Slave ID 2 |
| Master data: product | L8 create, L9 edit | OK; SKU yang diisi tidak dikirim — SKU default = Product ID (lihat §35.4) |
| Master data: operator | L10 create, L11 edit, L12 suspend→activate, L13 rotasi password | OK; tombol Suspend ADM-001 disabled ("Akun dilindungi (ADM-001)") |
| IAM (Access Control) | L16–L23, L25–L28 | OK; authz_version naik #1→#10 (dengan pengecualian observasi §35.4); L24 guard probe gagal seperti diharapkan |
| DynSec | L29 role, L30 ACL, L35 group, L37 role→group | OK (dengan deviasi, lihat §35.4); L31 create client GAGAL persisten (MUT-02); L32–L34, L36 dilewati karena tidak ada client |
| Config | L38–L40 | TIDAK DAPAT DIUJI — tab Editor kosong, banner ENOENT persisten (E2E-08, FAT-222); tidak ada Apply/Rollback yang diklik |
| WO / event / downtime / rekonsiliasi | L41 resolve-preview (baca), L42 ack, L43(a) overwrite label, L44 refresh, L45 cancel WO | OK kecuali L41 (panel kesiapan tidak muncul — controller offline) dan L43(b) (tidak ada event unlabeled) |

Hitungan: 35 mutasi berhasil + 1 guard probe yang gagal sesuai
harapan (L24, `ROLE_IN_USE`) + 1 kegagalan persisten (L31). Tanpa
429/cooldown pada refresh rekonsiliasi (L44). Sesi berakhir satu kali
setelah full-page reload (~12:22 UTC), sesuai advisory
authz_version; login ulang 1× sebagai ADM-001, lanjut tanpa 403.

### 35.3 Temuan MUT-01 – MUT-04

- **MUT-01 (panel): banner network-error palsu + list stale di
  DynSec.** Mutasi DynSec berulang kali menampilkan banner merah
  "Koneksi jaringan terputus atau backend tidak terjangkau." padahal
  mutasi sukses di server (L29 create role, L30 add ACL, L35 create
  group, L37 add role ke group — masing-masing terkonfirmasi tercipta
  setelah load baru; retry melaporkan "already exists"). List tampil
  stale sampai halaman di-remount via navigasi sidebar; load baru
  mengungkap keadaan sebenarnya. Pola yang sama tidak terlihat di
  domain lain pada sesi ini.
- **MUT-02 (backend): create MQTT client selalu "Role not
  found".**
  Sisi: BACKEND (dengan satu caveat terbuka). Panel mengirim body
  sesuai persis skema server: `roles` sebagai array objek
  `{rolename: <nama>, priority: 1}` (mqttDynsec.ts:62-79), dan server
  menerima bentuk itu — galat "Role not found" adalah galat lookup
  bisnis, bukan validasi skema. Lookup gagal bahkan untuk role
  `admin` (8 ACL) dan `E2E-TEST-ROLE` yang baru dibuat lewat panel
  sendiri. Caveat: modal create-client meng-hardcode default
  `cRoles=['edge_publisher']` (CreateMqttClientModal.tsx:21); bila
  payload uji memuat `edge_publisher` yang tidak ada di server, satu
  entri itu saja sudah cukup menjelaskan galatnya — perlu log body
  request aktual untuk menutup caveat ini.
  L31 create client `e2e-test-client` gagal persisten: banner merah
  "Role not found". Direproduksi 5× — role E2E-TEST-ROLE ×4 (termasuk
  dari halaman yang baru di-remount) dan role admin yang sudah ada ×1.
  Client tidak pernah tercipta (DynSec Clients tetap 1). Akibatnya
  L32 attach role, L33 rotasi password client, L34 disable/enable
  client, dan L36 add client ke group tidak dapat diuji.
- **MUT-03 (panel): policy create dengan ABAC kosong mengirim
  `abacCondition: null`, server menolak (expected record).**
  Sisi: PANEL. Saat field ABAC dikosongkan, panel mengirim
  `"abacCondition": null` eksplisit — percobaan pertama L18 gagal
  ("Invalid policy: abacCondition Invalid input: expected record,
  received null") dan L21 gagal ("body/abacCondition Invalid input:
  expected record, received null") — padahal skema server untuk kedua
  jalur create (POST /policies dan POST /roles/{id}/permissions)
  mendefinisikan `abacCondition` sebagai optional record, bukan
  nullable; panel seharusnya meng-omit field saat kosong. Rantai
  null: `parseAbacCondition` mengembalikan `value: null` untuk teks
  kosong (iamValidation.ts:10-11), diteruskan apa adanya oleh
  `createPolicy`/`handleBindPermission`, lalu
  `createIamPolicy`/`addIamRolePermission` menyertakan kunci karena
  `null !== undefined` (iam.ts:248-266, 124/135), dan
  `JSON.stringify` mempertahankan `null`. Perbaikan di panel: omit
  field saat kosong (dan perbaiki asumsi salah di
  schemas/dto.ts:235 yang menganggap null sah). Catatan: jalur PUT
  /policies/{id} justru mengizinkan nullable(record) — hanya kedua
  jalur POST create yang salah.
- **MUT-04 (panel): label downtime asli tidak bisa dikembalikan
  persis.** Cleanup C1: modal overwrite label tidak punya opsi
  "Belum dikategorikan" dan selalu memberi prefix kategori, sehingga
  teks asli persis "Equipment failure" tidak bisa dikembalikan.
  Dikembalikan dengan kategori EQUIPMENT_FAILURE + alasan "Equipment
  failure" → baris kini "[EQUIPMENT_FAILURE] Equipment failure";
  kolom kategori tetap "Belum dikategorikan" seperti semula. Ini
  residu yang diterima (lihat §35.6), bukan data uji sisa.

Guard pasif ADMIN terverifikasi di Bagian B (bukan temuan): kartu role
ADMIN tanpa tombol Edit/Hapus; semua baris policy ADMIN Edit/Disable/
Delete disabled; Revoke assignment ADMIN–ADM-001 disabled dengan
catatan "Anti-Lockout Guard: role ADMIN pada akun dilindungi tidak
dapat dicabut."; di modal Add Policy dengan Role = ADMIN, opsi "DENY
(Diblokir untuk ADMIN)" disabled.

### 35.4 Koreksi terhadap rencana (`docs/E2E_MUTATION_PLAN.md`)

- **Topik ACL literal, bukan wildcard:** `publishClientSend` +
  `e2e/test/#` ditolak server ("Wildcards are not allowed in
  'publishClientSend' topics"); dipakai topik literal `e2e/test`.
  Koreksi rencana, bukan bug.
- **`read:telemetry` tidak ada di katalog live:** L18 memakai
  `refresh:telemetry`; L21 memakai `read:access_control`.
- **Badge legacy register PROVISIONED, bukan ACTIVE** (L4) —
  observasi, bukan tiket.
- **SKU produk tidak dikirim dari form create** (L8): SKU
  "SKU-E2E-TEST-01" yang diisi tidak terkirim; baris menampilkan SKU
  "PROD-TEST-E2E-01" (SKU default = Product ID). Terkonfirmasi live.
- **authz_version #7 berulang** (L21 assign-perm, L22 assign-user,
  L25 revoke — ketiganya menampilkan #7; counter tampak tidak naik
  pada assign/revoke): observasi terbuka, **bukan** tiket.
- **ABAC kosong ditolak server** (L18, L21): percobaan pertama
  dengan ABAC kosong gagal ("Invalid policy: abacCondition Invalid
  input: expected record, received null" / "body/abacCondition
  Invalid input: expected record, received null"); diulang dengan
  JSON `{"attr": "subject.line_id", "eq": "LINE-01"}` → berhasil.
  ABAC pada L20 dibiarkan berisi JSON dari L18 karena mengosongkannya
  gagal di server.
- **Rute aktual** (koreksi §34.6): `/work-orders`, `/audit`,
  `/downtime` (bukan `/admin/...`); `/admin/system-audit` adalah
  halaman terpisah tanpa filter UNACK/tombol ack.
- **Opsi RESERVED di IAM:** `manage:access_control`,
  `manage:mqtt_admin`, `manage:mqtt_configuration`,
  `read_raw:mqtt_configuration` tampil "(DIBLOKIR - RESERVED)" dan
  disabled saat bind permission (L21).

### 35.5 Yang BELUM teruji (tetap)

Panel kesiapan resolve WO (L41 — controller STM32-OEE-SIM offline,
"Planned Start: —"); label downtime baru pada event unlabeled (L43b
— tidak ada event unlabeled: STM32-OEE-01 punya 2 event historis,
keduanya sudah berlabel "Belum dikategorikan" / "Equipment failure",
1h 00m 00s, 13:55:34 dan 13:54:40 WIB; STM32-OEE-SIM 0 event);
stage/diff/discard config (L38–L40 — akar yang sama dengan E2E-08,
**jangan buat tiket baru**); create/attach/rotate/disable-enable
client MQTT (L31–L34 — terblokir MUT-02); add client ke group (L36);
hapus group yang masih berisi anggota (C6 — group sudah kosong karena
C5 otomatis membersihkan keanggotaan, lihat §35.6). Dari §34.8 tetap
belum terverifikasi: WS handshake `/ws/telemetry`,
`/force-change-password`, respons live endpoint 401-gated, dan
N-16/N-17/N-18 laten; N-32 butuh jawaban backend.

### 35.6 Perubahan permanen yang diterima + SISA kosong

Perubahan permanen (bukan SISA): event 1148 di-ack oleh ADM-001
(11/19/2026, 7:05:45 PM, "E2E-TEST ack — verifikasi uji mutasi");
WO-SIM-20260906-02 ABORTED (irreversibel, L45); alasan downtime
13:55:34 kini berprefix "[EQUIPMENT_FAILURE] " (MUT-04, C1); entri
audit trail append-only untuk semua mutasi. WO-001, ADM-001, dan role
ADMIN tidak pernah disentuh; tidak ada Apply/Rollback config.

Catatan cleanup: hapus role DynSec otomatis membersihkan keanggotaan
group (C5 — role E2E-TEST-ROLE dihapus saat masih anggota
E2E-TEST-GROUP; kartu group lalu menampilkan "Roles: (kosong)").

**SISA: KOSONG.** Verifikasi akhir Bagian A: devices hanya
STM32-OEE-01 + STM32-OEE-SIM; machines hanya CNC-MILLING-SIM +
CNC-MILLING-01; products 5 asli; operators 5 asli. Verifikasi akhir
Bagian B: Access Control Roles (4), Policies (62), Assignments (5),
tanpa TEST-E2E-ROLE/assignment TST-E2E-01; DynSec Clients (1)
backend-admin saja, Roles & ACLs (1) admin saja, Groups (0); Config
Versions (0), tanpa STAGED; Operators 5, tanpa TST-E2E-01.

## 36. Pembaruan dokumentasi pasca-uji mutasi E2E (2026-11-19)

Pemicu: hasil uji mutasi end-to-end panel vs API live (§35, E26
FAT-226) — 35 mutasi lolos, 0× 403, cleanup bersih, SISA kosong, 4
temuan MUT-01–MUT-04 sudah tercatat di Linear. Tugas ini mencatat
hasil tersebut ke dalam dokumentasi per halaman dan ke AUDIT ini.
Dokumen lengkap per langkah: `docs/E2E_MUTATION_TEST.md`; rencana
yang diikuti: `docs/E2E_MUTATION_PLAN.md`.

### 36.1 File yang diubah

| File | Oleh | Isi perubahan |
|---|---|---|
| `PAGE_DOCUMENTATION.md` (repo root) | Worker ini | Catatan status uji mutasi E2E 19 Nov 2026 disisipkan di 12 bagian halaman + 1 baris header (lihat §36.2). **Catatan lokasi:** tugas menunjuk `docs/admin-panel/PAGE_DOCUMENTATION.md`, tetapi file tersebut tidak ada — dokumen yang sebenarnya hidup di repo root (`PAGE_DOCUMENTATION.md`, terlacak git sejak `c59db6c`). Diedit file yang benar di root; tidak dibuat duplikat di `docs/admin-panel/`. |
| `docs/admin-panel/ADMIN_PANEL_DOCUMENTATION.md` | Worker paralel (terpisah) | Diperbarui oleh worker lain dalam tugas yang sama; file ini **tidak disentuh** oleh worker ini. Isi perubahannya di luar cakupan §36 ini — verifikasi saat penggabungan oleh parent. |
| `AUDIT.md` (§36 ini) | Worker ini | Bagian ini. |

Tidak ada file lain yang diubah: tidak ada perubahan kode panel,
tidak ada tiket Linear baru, tidak ada push, tidak ada perubahan di
`docs/archive/`, dan `ADMIN_PANEL_DESIGN_SPEC.md` (v1.0 frozen) tidak
disentuh.

### 36.2 Ringkasan perubahan di `PAGE_DOCUMENTATION.md`

Struktur dokumen tidak diubah; catatan status (format blockquote
`> **Status uji mutasi E2E — 19 Nov 2026**`, mengikuti konvensi
`> **Catatan E20:**` yang sudah ada) disisipkan di akhir bagian
halaman yang bersangkutan, masing-masing merujuk `AUDIT.md` §35 dan
`docs/E2E_MUTATION_TEST.md`:

- **Header** — baris pembaruan 19 Nov 2026 (E26) yang mendaftar 12
  bagian yang menerima catatan status.
- **§3 Work Orders** — cancel `WO-SIM-20260906-02` → `ABORTED`
  terverifikasi live (L45); resolve-preview BELUM teruji (controller
  `STM32-OEE-SIM` offline, perilaku informatif, bukan bug; L41).
- **§4 Downtime Events** — **MUT-04 (panel, Low — FAT-230)**:
  overwrite label tidak bisa mengembalikan "Belum dikategorikan" /
  teks asli (prefix kategori paksa; residu "[EQUIPMENT_FAILURE]
  Equipment failure" yang diterima, C1); label baru pada event
  unlabeled BELUM teruji (tidak ada event unlabeled; L43b).
- **§5 Operational Events** — ack event 1148 oleh ADM-001
  terverifikasi live (L42; tanpa banner sukses, sesuai ekspektasi).
- **§7 Edge Devices** — provision kanonis, register legacy, edit,
  rotasi kredensial, revoke, dan delete device uji terverifikasi
  live (L3–L4, L7, L14–L15, C9–C10); observasi badge register legacy
  `PROVISIONED` bukan `ACTIVE` (bukan tiket).
- **§8 Machines** — create, bind, unbind, delete terverifikasi live
  (L5–L6, C7–C8); validasi server menolak Modbus Slave ID 1
  duplikat.
- **§9 Products** — create, update, delete terverifikasi live
  (L8–L9, C11); observasi SKU yang diisi tidak dikirim (SKU default
  = Product ID; bukan tiket).
- **§10 Operators** — create, update, suspend→activate, rotasi
  password, delete terverifikasi live (L10–L13, C12); tombol Suspend
  ADM-001 disabled sesuai proteksi akun root.
- **§14 Data Reconciliation** — Force Refresh body `{}` terverifikasi
  live (L44); tanpa cooldown/429.
- **§16 Dynamic Security** — **MUT-01 (panel, Medium — FAT-227)**:
  banner network-error palsu + list stale sampai remount (L29, L30,
  L35, L37); **MUT-02 (backend, High — FAT-228)**: create MQTT
  client selalu "Role not found" (5×, termasuk role `admin`) +
  caveat modal hardcode default `cRoles=['edge_publisher']`
  (`CreateMqttClientModal.tsx:21`); attach/rotasi/enable client +
  add-client ke group terblokir (L32–L34, L36). Topik ACL literal
  `e2e/test` (wildcard ditolak server). Catatan cleanup C5/C6.
- **§17 Broker Configuration Manager** — editor tidak render saat
  live `mosquitto.conf` tidak terbaca (ENOENT) — **E2E-08 (backend,
  High — FAT-222)**; stage/diff/discard TIDAK teruji (L38–L40).
- **§19 Access Control / IAM** — **MUT-03 (panel, Medium —
  FAT-229)**: policy create ABAC kosong mengirim `abacCondition:
  null`, server menolak; akar rantai null + `schemas/dto.ts:235`;
  field harus di-omit saat kosong. Guard 409 `ROLE_IN_USE`
  terverifikasi live (L24); guard pasif ADMIN terverifikasi.
  Seluruh alur IAM L16–L28 terverifikasi live (authz_version #1→#10).
- **§20 Audit Trail** — seluruh mutasi sesi uji tercatat sebagai
  entri audit trail append-only; halaman ini tidak diuji interaktif
  (ack dilakukan lewat §5 Operational Events).

### 36.3 Nomor tiket yang dirujuk

- **E26 (FAT-226)** — epic temuan uji mutasi E2E.
- **MUT-01 (FAT-227, panel Medium)**, **MUT-02 (FAT-228, backend
  High)**, **MUT-03 (FAT-229, panel Medium)**, **MUT-04 (FAT-230,
  panel Low)** — temuan uji mutasi, dirujuk di §16, §19, dan §4.
- **E2E-08 (FAT-222, backend High)** — `mosquitto.conf` live tidak
  terbaca (ENOENT), dirujuk di §17; jangan buat tiket baru untuk ini.
- **A10.2 (FAT-40)** — penegakan sisi server mode akses: hasil §35
  adalah bukti empiris semata (0× 403 dari Vercel) dan **bukan**
  vonis selesai maupun gagal; dirujuk di §35.1, tidak diubah oleh
  tugas dokumentasi ini.

### 36.4 Verifikasi

Grep atas kedua dokumen yang diubah memastikan semua nomor FAT di
atas ada dan benar (FAT-226, FAT-227, FAT-228, FAT-229, FAT-230,
FAT-222, FAT-40 — dicocokkan dengan `docs/LINEAR.md` dan `AUDIT.md`
§35), dan tidak ada referensi path dokumen yang rusak (tidak ada
path `docs/` yang sudah diarsip yang dirujuk; `PAGE_DOCUMENTATION.md`
dirujuk pada lokasi sebenarnya di repo root). `git status` hanya
menunjukkan kedua file ini sebagai berubah; tidak ada file lain yang
tersentuh. Tidak di-commit — penggabungan dan commit oleh parent.

## 37. Spec 043 — Device Registry & Station Audit (2026-11-20)

### 37.1 Konteks

Backend commit `b4456eb` live di https://oee.fadik.web.id (restart
~23:58 WIB 19 Nov). `station_id` kini atribut konteks tervalidasi
(deviceId kiosk), bukan kredensial. Nilai tak terdaftar di tabel
`devices` → backend balas **400 `STATION_NOT_FOUND`** (bukan 401),
dan tidak menaikkan counter throttle login. Audit
`SECURITY_REJECTION` menyimpan dua kolom terpisah: `device_id` (FK ke
`devices.device_id`, null bila tak valid) dan `station_label` (label
mentah apa adanya dari klien, kolom baru, migrasi 0029). Frontend
kiosk mengirim `station_id` dari `deviceId` konteks.

Bukti live (parent): POST `/auth/login` operator dummy + station
`STATION-UNKNOWN-XYZ` →
`{"error":"STATION_NOT_FOUND","message":"station_id is not a registered station"}`;
validasi station terjadi SEBELUM cek kredensial. Login TANPA
`station_id` BERHASIL (ADM-001, 00:46 WIB, sesi 14:56, badge normal,
OEE 1.0%); login DENGAN station `ADMIN-CONSOLE-01` GAGAL 400 — jadi
`station_id` OPSIONAL bila dikosongkan, WAJIB terdaftar bila dikirim.

Spec OpenAPI live (`~/workspace/oee-live-openapi-2026-11-20.json`,
fetch 00:43 WIB) STALE terhadap perilaku ini: 0 hit `station_label` /
`STATION_NOT_FOUND` / `hostname`; 104 paths, tanpa endpoint station.
Task ini + perilaku live adalah sumber kebenaran, bukan spec.
GET `/api/v1/devices` (publik) hanya 2 baris (`STM32-OEE-01`,
`STM32-OEE-SIM`); TIDAK ADA `ADMIN-CONSOLE-01`. Probe parent
kemungkinan sudah membuat satu event `SECURITY_REJECTION` di audit
(`device_id` null, `station_label` `STATION-UNKNOWN-XYZ`) — fixture
alami untuk uji AC2/AC3.

### 37.2 Keputusan arsitektur (investigasi E27, `tmp-e27-invest.md`)

- **D-1 — Endpoint T1 memakai API devices yang ada.** Daftar GET
  `/api/v1/devices`; create POST `/api/v1/devices` (legacy register)
  `{deviceId*, macAddress?, ipAddress?, firmwareVersion?}` — BUKAN
  `/provision` (itu membuat identitas broker MQTT + kredensial sekali
  tampil, tidak masuk akal untuk kiosk); ubah PUT
  `/devices/{deviceId}` `{ipAddress?, firmwareVersion?}` saja (kosong
  di-omit, null dilarang); nonaktifkan = POST
  `/devices/{deviceId}/revoke` `{reason}` → REVOKED, tanpa un-revoke;
  DELETE tersedia dengan guard + dialog konfirmasi.
- **D-2 — Halaman baru `StationsPage`, rute `/admin/stations`** (+ alias
  `/admin/assets/stations`), item sidebar "Stations" grup Assets
  setelah "Edge Devices" (`device.read`; mutasi `device.manage`).
  Terpisah dari `/admin/devices` karena audiens dan bentuk datanya
  beda (stasiun tanpa mesin terikat/health/provision broker).
- **D-3 — T2 target `OperationalEventsPage` (`/admin/audit`)**, bukan
  `AuditTrailPage` (`/admin/system-audit` — itu audit sistem, bukan
  `operational_events`). `OperationalEvent` + `station_label: string |
  null`; mapper toleran (event lama tanpa field → null). Badge "Tidak
  terdaftar" hanya bila `device_id === null` DAN `station_label`
  non-kosong setelah trim.
- **D-4 — T3 derivasi client-side dari `SECURITY_REJECTION`**
  (distinct `station_label` trim-normalisasi, case-sensitive,
  `device_id` null) vs daftar device; panel diagnostik di
  `StationsPage` + CTA "Daftarkan" prefill form T1.
- **D-5 — Validasi client `.trim().min(1).max(64)`** mengikuti
  `HistoryFiltersSchema` (`dto.ts:422`). TIDAK ADA
  `OperatorLoginRequestSchema` di panel (grep 0 hit; hanya
  `LoginResponseSchema`) — batas 1..64 adalah konvensi panel, bukan
  batas server (spec zod tidak mengekspos checks).
- **D-6 — LoginPage: pemetaan 400 `STATION_NOT_FOUND` → "Stasiun
  tidak terdaftar"** (`mapHttpErrorToApiError` sudah menyalin `error`
  → `ApiError.code`, jadi cukup periksa `httpStatus === 400 && code ===
  'STATION_NOT_FOUND'`). **Default prefill DIKOSONGKAN**
  (`useState('')`, placeholder `ADMIN-CONSOLE-01`): bukti live 00:46
  WIB — prefill tak terdaftar membuat semua login gagal secara
  default; login tanpa station berhasil; login station terdaftar
  berhasil. `resolveDefaultStationId()` tetap ada di `mode.ts` +
  komentar peringatan. Jalur pemulihan sementara: login station
  kosong sampai `ADMIN-CONSOLE-01` didaftarkan lewat registry T1.
- **D-7 — `station_label` UNTRUSTED**: render teks biasa (React
  escape), jangan jadi key React / kunci lookup tanpa normalisasi,
  jangan `dangerouslySetInnerHTML`.
- **D-8 — Blokir kritis: `EdgeDeviceSchema.device_id` regex
  `^STM32-[A-Za-z0-9_-]+$` + `mapDevice()` `mustParse`** → respons
  device non-STM32 (mis. `ADMIN-CONSOLE-01`) gagal parse. Dibuat
  `StationSchema`/`Station` + `mapStation()` terpisah; regex edge
  device TIDAK dilonggarkan (tes membuktikan `mapDevice` melempar
  `INVALID_RESPONSE` untuk `ADMIN-CONSOLE-01`).

### 37.3 Penyimpangan dari teks tugas (ikuti API dulu, tandai diff)

- **hostname: TIDAK ADA di `DeviceResponse`** — form dan tabel tanpa
  field hostname; catatan kecil di halaman bahwa API belum mendukung
  hostname.
- **status active/inactive: TIDAK ADA** — yang ada `enrollmentState`
  PROVISIONED|ACTIVE|REVOKED + `isOnline`; status ditampilkan dari
  `enrollmentState` (Terdaftar/Aktif/Dicabut) + badge ONLINE/OFFLINE.
- **Kolom `operator_id` di tabel audit: TIDAK ditambahkan** — API
  tidak mengirim `operator_id` dan kontrak melarang mengarang field.
  Kolom lain yang disebut tugas sudah ada/tertutup: `recorded_at`
  (kolom Timestamp), `device_id`, `station_label` (baru),
  `trigger_source` (di bawah Tipe Event).
- **DELETE: tombol tetap disediakan** — kontrak tidak melarang delete;
  dialog konfirmasi merekomendasikan Nonaktifkan (revoke) untuk
  stasiun berhitori; 409 server ditampilkan via `ConflictDialog`.
- **Fixture demo `SECURITY_REJECTION`** (opsional di kontrak): tidak
  ditambahkan — verifikasi utama tetap Real mode.

### 37.4 Implementasi

Baru: `src/services/api/http/stations.ts` (231 baris),
`src/features/assets/StationsPage.tsx` (200),
`hooks/useStations.ts` (194), `hooks/useUnknownStations.ts` (92),
`stationValidation.ts` (41), `components/StationTable.tsx` (156),
`StationRegisterModal.tsx` (139), `StationEditModal.tsx` (101),
`StationRevokeDialog.tsx` (79), `UnknownStationsPanel.tsx` (84),
`stations.test.ts` (236), `src/features/monitoring/components/OperationalEventMachineCell.tsx`
(54), `src/features/auth/LoginPage.test.ts`,
`src/features/monitoring/components/OperationalEventMachineCell.test.ts`,
`src/services/api/http/mappers/monitoringStationLabel.test.ts`.
Diubah: `types/assets.ts` (+22, tipe `Station`), `schemas/dto.ts`
(+27, `StationIdSchema` + `StationSchema`), `mappers/assets.ts`
(+32, `mapStation()` saja), `Router.tsx` (+3), `Sidebar.tsx` (+2),
`types/monitoring.ts` (+8, `station_label`), `mappers/monitoring.ts`
(+4), `useOperationalEventColumns.tsx` (136 → 116),
`OperationalEventAckModal.tsx` (+24, grid FK vs label mentah),
`LoginPage.tsx` (+30/−2), `mode.ts` (+15/−1, komentar peringatan),
plus knock-on mekanis `station_label: null` di literal demo/tes
(`seeds/monitoring.ts`, `seeds/system.ts`, `demo/store.ts`,
`deviceMachineBinding.test.ts`, `historyFilters.test.ts`) — tanpa
perubahan perilaku demo.

Catatan integrasi: `readStationLabel()` di `useUnknownStations`
membaca `station_label` secara toleran dari objek mentah
(snake_case/camelCase) agar derivasi T3 jalan baik sebelum maupun
sesudah merge T2; setelah merge, field sudah tersedia lewat mapper
T2 dan pembacaan toleran ini hanya fallback defensif. Bila backend
belum mengirim field-nya (Q2), panel menampilkan empty state, bukan
error.

Verifikasi (koordinator, pasca-merge kedua worker): `tsc` 0 error;
`npm test` **454/454** lolos (428 lama + 26 baru: 15 stations +
11 T2/login); `vite build` OK; checker **0 FAIL** (326 file, 40 WARN
soft — termasuk `useStations.ts` 195/250, di bawah hard cap).

Linear: E27 FAT-231 + T1 FAT-232, T2 FAT-233, T3 FAT-234, LOGIN
FAT-235, VERIFY FAT-236 — semua Todo. Tiket implementasi sengaja
tetap Todo menunggu VERIFY live AC1–AC4 (FAT-236); penutupan setelah
bukti live, bukan hanya bukti lokal.

### 37.5 Yang belum terverifikasi live (ranah VERIFY FAT-236, parent via browser)

- **AC1**: daftarkan `ADMIN-CONSOLE-01` di Real mode lalu login
  dengan station itu — bergantung Q1 (apakah POST `/devices`
  menerima `deviceId` non-STM32?); bila server menolak, butuh tiket
  backend.
- **AC2/AC3**: event `SECURITY_REJECTION` live (`device_id` null,
  `station_label` `STATION-UNKNOWN-XYZ`) di `/admin/audit`
  menampilkan label + badge — bergantung Q2 (apakah GET
  `/operational-events` live benar-benar memuat `station_label`?);
  bila tidak ada di respons, butuh tiket backend.
- **AC4**: panel diagnostik menampilkan `STATION-UNKNOWN-XYZ`
  (bergantung Q2).
- Belum diuji di browser nyata: render halaman Stations, alur klik
  CTA → prefill → submit, perilaku revoke/delete terhadap server
  (409 `DEVICE_ID_HAS_HISTORY`).
- Q3–Q6 terbuka (lihat `tmp-e27-invest.md` §5): cara REVOKED →
  ACTIVE; DELETE device berhitori; batas panjang server; apakah
  `VITE_DEFAULT_STATION_ID` perlu jadi prefill opt-in.

## 38. E28 — Triase semua issue terbuka + implementasi panel + penutupan di Linear (2026-11-20)

### 38.1 Triase (06:13–06:40 WIB, baca saja, tanpa implementasi/mutasi/browser)

Sumber: `~/workspace/tmp-e28-triage.md`. Acuan spec: `~/workspace/oee-live-openapi-2026-11-20.json`
(104 paths, dump Zod mentah). Probe live tanpa auth 20 Nov ~06:13 WIB.

Keadaan backend saat probe: `GET /health` uptime 5133 dtk (~85 mnt, restart terakhir
~21:48 WIB 19 Nov), `db_connected: true`, `ws_clients: 3`, `totalReceived 2736`,
`validIngested 1708`, **`lastIngestedAt` 23:14:11Z = detik probe — telemetri MENGALIR**.
`GET /api/v1/live-state`: **STM32-OEE-SIM HIDUP** (oee 0.62, totalCount 5);
**STM32-OEE-01 MASIH STALE** (`lastTelemetryAt` 2026-11-19T08:54:40Z = 15:54 WIB 19 Nov,
semua 0.00, state RUNNING, `isOnline: false`, `lastSeenAt: null`). `GET /devices`: hanya
2 device. `GET /products`: 5 produk, **tetap tanpa `sku`/`isActive`** (0 hit `sku` di spec
20 Nov). Bucket aggregate SIM 23:10Z `oeePct: null`, `performancePct: null` — agregat
null masih terjadi live. CORS: `OPTIONS /api/v1/auth/login` + Origin Vercel → **204** +
`access-control-allow-origin: https://iiot-oee-admin-panel.vercel.app` — **N-6
terkonfirmasi diperbaiki**. Spec 20 Nov: **0 hit `station_label` / `STATION_NOT_FOUND`**
— spec STALE vs backend commit b4456eb (sesuai §37).

Anomali Linear: `list_issues` (limit 200) mengembalikan 185 issue dengan
`hasNextPage: false`, tetapi **FAT-71 s.d. FAT-121 (51 issue: epic E13 + SYS-B1–SYS-B50)
hilang seluruhnya** — diverifikasi satu per satu lewat `get_issue` (36 Done, 15 Todo,
persis close-list E21). Total rekonsiliasi: **236 issue = 172 Done / 62 Todo /
2 In Progress**. Issue terbuka yang ditriase = **64 (62 Todo + 2 In Progress)**.

Tabel verdict (64 issue terbuka):

| Verdict | Jumlah | FAT |
|---|---:|---|
| RELEVAN | 32 | FAT-7, 27, 28, 31, 34, 71, 169, 170, 171, 173, 174, 207, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230 |
| SUDAH SELESAI | 14 | FAT-175 (N-6), FAT-172 (N-5), FAT-82 (B11), FAT-88 (B17), FAT-94 (B23), FAT-102–108 (B31–B37, 7 issue), FAT-112 (B41), FAT-210 (N-41) |
| TERBLOKIR | 8 | FAT-74 (B3), FAT-77 (B6), FAT-83 (B12), FAT-202 (N-32), FAT-209 (N-40), FAT-30 (V8.3 LAN), FAT-40 (A10.2), FAT-29 (V8.4 Nginx — butuh keputusan Fathur) |
| BUKAN PEKERJAAN PROYEK | 4 | FAT-1, 2, 3, 4 (onboarding Linear) |
| TIDAK DINILAI (E27, skop parent) | 6 | FAT-231–236 |
| **Total** | **64** | = 62 Todo + 2 In Progress |

Temuan paling mengejutkan: **spec 20 Nov menjawab 11 dari 14 SYS-B terbuka** (B11, B17,
B23, B31–B37, B41) — tersisa 3 yang masih butuh backend (B3, B6, B12). **N-42 menyempit
drastis**: telemetri mengalir lagi dan SIM hidup; yang stale hanya STM32-OEE-01 (device
fisik offline sejak 15:54 WIB 19 Nov) — akar bukan lagi restart backend, melainkan
presence/TTL tidak menurunkan state device offline. **N-5 ternyata sudah selesai di
panel** (fallback `sku` ← `productId` di mapper + terkonfirmasi live MUT L8).
**N-40 hampir tidak bergerak**: 17/18 operasi Access Control di spec 20 Nov masih hanya
deklarasikan 200/201. **MUT-02 caveat menguat**: `edge_publisher` 0 hit di spec 20 Nov.

Adendum triase (verifikasi live E27 oleh parent, 20 Nov 06:12–06:17 WIB, Vercel 3027dcc):
AC1 GAGAL (backend, High, Q1 = TIDAK) — POST `/devices` menolak `ADMIN-CONSOLE-01`
(`Device ID must start with 'STM32-'…`); tiket baru **FAT-237** (child FAT-231, High,
Todo). AC2/AC3 TIDAK DAPAT DIVERIFIKASI (backend, High, Q2 = TIDAK) — event
`STATION_NOT_FOUND` probe parent (`STATION-UNKNOWN-XYZ`) TIDAK DITEMUKAN di
`/admin/audit` (0 baris); tiket baru **FAT-238** (child FAT-231, High, Todo). Hint
`StationRegisterModal.tsx:97` terbukti menyesatkan → diperbaiki di Batch A (butir 38.2
§7). AC4 LULUS live. Login tanpa station tetap jalan (2× login, OEE 0.6%).
Hitungan terbuka setelah adendum: 64 + 2 = **66 issue terbuka**.

### 38.2 Batch A — implementasi panel High/Medium (commit lokal `179ecf7`)

Sumber: `~/workspace/tmp-e28-batchA.md`. Verifikasi: `tsc` 0 error · `npm test` **466/466**
(454 lama + 12 baru) · `vite build` OK · `check:structure` 0 FAIL. Tanpa browser, tanpa
push, tanpa mutasi API live. 28 file diubah + 2 baru.

1. **FAT-215 E2E-01 (High)** — `LoadErrorBanner` baru (pola DataTable); `OverviewPage` +
   `LiveStatePage`: `catch {}` → `loadError` + banner + retry, data lama dipertahankan,
   skeleton + empty state eksplisit.
2. **FAT-229 MUT-03 (Medium)** — `dto.ts:235` `abacCondition: z.record(...).optional()`
   (null ditolak skema); `parseAbacCondition('')` → `undefined` (omit); `http/iam.ts`
   create + bind omit kunci bila `undefined`/`null`; PUT tetap boleh null (hapus kondisi,
   sah per spec); demo normalisasi null→undefined hanya saat baca.
3. **FAT-227 MUT-01 (Medium)** — akar TERBUKTI dari kode: `createClient` set feedback
   sukses dulu lalu `await loadAll()` yang menimpa feedback dengan error bila satu dari
   tiga GET gagal; role/group create/add bahkan tak pernah menampilkan feedback sukses.
   Perbaikan: `classifyTransportError` (AbortError → NETWORK timeout; TypeError fetch →
   NETWORK; galat lain → `TRANSPORT_ERROR` + pesan jujur); `loadAll` → `Promise<boolean>`;
   `refreshAfterMutation` satu-satunya jalur refetch pasca-mutasi (refetch senyap + 1 retry
   600 ms, lalu feedback jujur). **Residu:** hipotesis kedua (mutasi sendiri melempar
   NETWORK padahal server sudah menerapkan) belum terbukti dari kode statis — butuh repro
   browser + network inspector (parent).
4. **FAT-213 N-43 (Low) + FAT-218 E2E-04 (Medium)** — SATU aturan null: `mapShiftSummary`
   oee/availability/performance/quality → `number | null` via `pctOrNull`, UI '—';
   `mapHourly.parts_produced` null bila `totalCount` null/absen; turunan parts null bila
   satu bucket pun null. `mapAggregate`/`mapRollup` sudah nullable.
5. **FAT-216 E2E-02 (Medium)** — `QualityRejectsPage`: `catch` tidak lagi `setItems([])`;
   `loadError` + banner + panel error terpisah + 'Coba lagi'; empty state asli hanya bila
   tidak ada error.
6. **FAT-217 E2E-03 (Medium)** — `SystemHealthPage`: `healthError`; `!health` tiga arah
   (loading / gagal → banner + Refresh / sukses → konten lama).
7. **Adendum E27 butir 3 (skop FAT-232, T1 tetap Todo)** — hint `StationRegisterModal`
   diganti dari 'Station ID bebas pola STM32' (menyesatkan) menjadi kotak amber yang jujur
   (server saat ini HANYA menerima pola STM32-; ID non-STM32 ditolak 400 sampai backend
   diperbaiki, FAT-237); placeholder → `STM32-CONSOLE-01`; kemampuan create TIDAK dihapus;
   validasi klien sengaja tetap longgar supaya penolakan server tampil apa adanya.
8. **Tindak lanjut kecil (triase §4, belum ada tiket)** — (a) B17: `getIamUserRoles({operatorId})`
   → `?operatorId=`, `getIamPolicies({roleId})` → `?roleId=` (demo memfilter setara).
   (b) B41: apply/rollback menerima opsi `acknowledgeUnvalidated`; body
   `{acknowledgeUnvalidated?, confirm, reason}`; `applyBrokerConfig` kirim `true` bila
   `staged.validation.status !== 'passed'`.

### 38.3 Batch B — implementasi panel Low + repro/analisis (commit lokal `d770c2b`)

Sumber: `~/workspace/tmp-e28-batchB.md`. Verifikasi: `tsc` 0 error · `npm test` **483/483**
(466 lama + 17 baru) · `vite build` OK · `check:structure` 0 FAIL (45 WARN di atas batas
lunak). 29 file diubah + 4 baru.

1. **FAT-170 N-2** — `resolveDefaultDeviceId(devices)` baru (online pertama → pertama →
   `undefined`); Telemetry History + Downtime tanpa default hardcode (URL `device_id`
   tetap menang; list kosong → kotak info amber); OEE Analytics ikatan mesin tetap utama,
   fallback kini `resolveDefaultDeviceId`. Demo default tetap STM32-OEE-01.
2. **FAT-207 N-38 (sisa)** — `BackendHealthIndicator` baru di /login: ping `GET /health`
   saat mount + 'Periksa lagi'; memeriksa (amber) / terhubung · N ms (hijau) / tidak dapat
   diperiksa (abu-abu netral, bukan merah); timeout 8 dtk; MODE-AWARE — Demo render null
   tanpa ping. Badge API + label akses sudah ada sebelumnya (terkonfirmasi live §33.1).
3. **FAT-219 E2E-05** — SATU pola shared: `TableStateRow` + `EmptyStateBlock` (dipindah ke
   `shared/`, impor lama via shim); 4 halaman CRUD skeleton + empty state spesifik;
   Reconciliation empty state + `LoadErrorBanner` + retry saat gagal muat.
4. **FAT-230 MUT-04** — prefill overwrite kini `stripDowntimeCategoryPrefix()`; checkbox
   'Kembalikan ke Belum dikategorikan' (overwrite saja): kategori dipaksa OTHER + select
   dinonaktifkan. Spec 20 Nov `POST /downtime-events/{id}/reason` body `{category (enum 10
   nilai, WAJIB), reason, notes?}` — tidak ada nilai UNKNOWN, tidak ada endpoint unlabel.
   **Residu:** prefix '[KATEGORI] ' ditambahkan SERVER (panel selalu kirim reason tanpa
   prefix — diverifikasi grep); panel kirim OTHER + teks asli tanpa prefix. Bila live
   masih berprefix, itu tindak lanjut backend.
5. **FAT-224 E2E-10** — 'SN:' hanya bila `serial_number` terisi; `formatWorkOrderSubline`
   (duplikat `wo_id` + `shift_name` kosong dibuang, kosong → '—'); `formatCycleTemp`
   (cycle > 0 dtk, suhu bukan null, keduanya absen → '—', 0°C tetap tampil); sel
   LINE/SCOPE `op.line_id || '—'`.
6. **FAT-220 E2E-06** — TERKONFIRMASI dari kode statis: `ShiftFilterBar` sudah terima
   `shiftsLoading` tapi kedua pemanggil tidak pernah meneruskannya → peringatan 'tidak
   tersedia' tampil saat loading lalu hilang. Perbaikan: prop `shiftsError`; peringatan
   HANYA bila `!loading && shiftsError`; loading → 'Memuat daftar shift…'; sukses-kosong
   → catatan netral.
7. **FAT-221 E2E-07** — cacat panel TERKONFIRMASI + diperbaiki: timeline 7 hari
   (10.080 mnt) dibandingkan mentah dengan ringkasan 1 shift (99 mnt) → 2 warning palsu.
   Segmen timeline DIPOTONG ke jendela shift ringkasan sebelum dijumlahkan; check terpotong
   ditandai field `note` + footnote. **Residu:** bila live masih warning setelah potong,
   itu selisih NYATA di dalam shift — butuh analisis lanjutan dari data live.
8. **FAT-225 E2E-11** — dua cacat TERKONFIRMASI + diperbaiki: (a) sumbu — langkah
   diperpanjang ke `[..., 240, 360, 480, 720, 1440, 2880, 4320, 10080]`; 7 hari kini tick
   harian (8 tick). Residu kosmetik: tick harian sejajar tengah malam UTC (= 07:00 WIB),
   perlu penilaian visual parent. (b) 'Downtime ID tidak ditemukan' — akar di mapper
   `mapTimelineSegment`: `downtime_id` numerik server tidak diubah `pick` menjadi string,
   sementara peta overlay berkunci string '2' → `Map.get(2)` gagal; mapper kini selalu
   `String(v)` + normalisasi defense-in-depth di selector.

Yang masih butuh uji live oleh parent (browser) — Batch A §10 + Batch B §10: FAT-227
(banner palsu hilang + list ter-refresh pasca-mutasi DynSec, termasuk skenario refetch
gagal); FAT-215/216/217 (banner + retry saat backend/endpoint gagal); FAT-213/218
(kartu '—' pada bucket all-null live, parts '—' tanpa totalCount); FAT-229 (create
policy ABAC kosong lolos; PUT clear-ABAC tetap null dan diterima); hint stasiun
(`STM32-CONSOLE-01` sukses, `ADMIN-CONSOLE-01` 400 tampil jelas); B41 (apply/rollback
config unvalidated); FAT-170 (default kini STM32-OEE-SIM); FAT-207 (indikator /login
Real vs Demo); FAT-219 (empty state CRUD/Reconciliation); FAT-230 (overwrite live +
catat `operatorReason` + kolom kategori); FAT-224 (4 halaman kerapian); FAT-220
(peringatan tidak berkedip saat loading); FAT-221 (warning rekonsiliasi hilang tanpa
filter shift); FAT-225 (sumbu 7 hari + klik segmen downtime).

### 38.4 Penutupan di Linear — Fase 3 (20 Nov 2026)

Standar penutupan sama seperti E21: terjawab di spec/dokumen + bukti live bila ada
(untuk issue spec), atau bukti commit + `tsc` 0 + tes + build OK + checker 0 FAIL
(untuk issue panel). Setiap penutupan: bukti di-append ke deskripsi (deskripsi lama
tidak dihapus), lalu state → Done, lalu diverifikasi dengan `get_issue` sesudahnya.
Tidak ada perubahan kode di fase ini; tidak ada push GitHub; tidak ada mutasi API live.

**Ditutup 29 issue:**

| # | Issue | Bukti penutupan |
|---|---|---|
| 1 | FAT-175 N-6 CORS | OPTIONS 204 + allow-origin Vercel, probe 20 Nov 06:14 WIB + login browser lolos 19 Nov 18:05 (AUDIT §33) |
| 2 | FAT-172 N-5 | Panel fallback `sku` ← `productId` (`mappers/assets.ts:101-104`) + live MUT L8; backend tetap tanpa sku = kondisi diterima |
| 3 | FAT-82 B11 | Spec 20 Nov — parameter audit `subject, decision, mode, from, to, limit, format` terdefinisi |
| 4 | FAT-88 B17 | Spec 20 Nov — `GET /user-roles` query `operatorId`; `GET /policies` query `roleId`; pengiriman filter panel dikerjakan Batch A |
| 5 | FAT-94 B23 | Spec 20 Nov — `GET /operational-events` + export mencakup `machine_id` + `machineId` (membalik verdict E21) |
| 6 | FAT-102 B31 | Spec 20 Nov — `POST /clients/{name}/roles` body `{rolename, priority?}`; panel sudah benar (`http/mqttDynsec.ts:145`) |
| 7 | FAT-103 B32 | Spec 20 Nov — `POST /roles/{name}/acls` body `{acltype, allow, priority, topic}`; panel sudah benar |
| 8 | FAT-104 B33 | Spec 20 Nov — `POST /clients` body `{username*, password*, ...}`; password WAJIB (auto-generate hanya di `POST /devices/provision`); panel mewajibkan password min 8 |
| 9 | FAT-105 B34 | Spec 20 Nov — respons 201 `POST /clients` membawa field `password` (kanonis); panel baca defensif `generatedPassword ?? password` |
| 10 | FAT-106 B35 | Spec 20 Nov — objek klien DynSec memakai `disabled`; panel benar (`mappers/system.ts:29-36`) |
| 11 | FAT-107 B36 | Spec 20 Nov — `POST /groups/{name}/clients` body `{username, priority?}`; panel sudah benar |
| 12 | FAT-108 B37 | Spec 20 Nov — `POST /groups/{name}/roles` body `{rolename, priority?}`; panel sudah benar |
| 13 | FAT-112 B41 | Spec 20 Nov — `acknowledgeUnvalidated` ADA di body apply & rollback `{acknowledgeUnvalidated, confirm, reason}`; polling 202 cocok; panel kini mengirimnya (Batch A) |
| 14 | FAT-210 N-41 | Spec 20 Nov — aggregate/downtime hanya deklarasikan 200/400/500 (tanpa 404) vs history/hourly/quality 404; perilaku by-design, panel menoleransi keduanya |
| 15 | FAT-215 E2E-01 | Batch A `179ecf7` (tes 466/466): `LoadErrorBanner` + banner/retry Overview + Live-State |
| 16 | FAT-229 MUT-03 | Batch A `179ecf7`: omit `abacCondition` saat kosong + perbaiki `dto.ts:235` |
| 17 | FAT-227 MUT-01 | Batch A `179ecf7`: `classifyTransportError` + `refreshAfterMutation`; RESIDU: hipotesis kedua (mutasi sendiri lempar NETWORK) belum terbukti — butuh repro browser |
| 18 | FAT-213 N-43 | Batch A `179ecf7`: aturan null agregat → '—' |
| 19 | FAT-218 E2E-04 | Batch A `179ecf7`: `parts_produced` null → '—' |
| 20 | FAT-216 E2E-02 | Batch A `179ecf7`: Quality bedakan error vs empty state |
| 21 | FAT-217 E2E-03 | Batch A `179ecf7`: System Health banner + Refresh bila GET /health gagal |
| 22 | FAT-170 N-2 | Batch B `d770c2b` (tes 483/483): default device dari daftar live |
| 23 | FAT-207 N-38 | Batch B `d770c2b`: indikator koneksi backend di /login (mode-aware) |
| 24 | FAT-219 E2E-05 | Batch B `d770c2b`: empty state 5 halaman (satu pola shared) |
| 25 | FAT-230 MUT-04 | Batch B `d770c2b`: opsi kembalikan label downtime; RESIDU: prefix '[KATEGORI]' dari server — bila live masih berprefix, tindak lanjut backend |
| 26 | FAT-224 E2E-10 | Batch B `d770c2b`: kerapian list (SN kosong, WO duplikat, suhu '-', LINE/SCOPE) |
| 27 | FAT-220 E2E-06 | Batch B `d770c2b`: peringatan shift hanya setelah query benar-benar gagal (race terkonfirmasi) |
| 28 | FAT-221 E2E-07 | Batch B `d770c2b`: rekonsiliasi potong timeline ke jendela shift; RESIDU: verifikasi live oleh parent — bila masih warning, selisih nyata di dalam shift |
| 29 | FAT-225 E2E-11 | Batch B `d770c2b`: sumbu 7 hari (tick harian) + `downtime_id` numerik → string |

**Deskripsi diperbarui, tetap Todo (8 terblokir):** FAT-74 B3, FAT-77 B6, FAT-83 B12
(butuh backend: definisi/skema — R-1/R-21), FAT-202 N-32 (definisi bit `eventFlags`),
FAT-209 N-40 (deklarasi error OpenAPI), FAT-30 V8.3 (akses LAN pabrik), FAT-40 A10.2
(probe negatif tunnel + pembanding LAN), FAT-29 V8.4 (keputusan Fathur: Nginx on-prem
vs Vercel). State/prioritas tidak diubah.

**Deskripsi diperbarui, tetap Todo (6 backend/verifikasi, append ringkas):** FAT-171 N-3
(urutan gate auth-vs-validasi — butuh probe ber-auth), FAT-173 N-4 (dua teks 401 —
butuh probe ber-auth), FAT-212 N-42 (menyempit: SIM hidup, STM32-OEE-01 offline 14 jam,
presence/TTL tidak menurunkan state — butuh backend/device), FAT-222 E2E-08 (ENOENT
mosquitto.conf — butuh backend), FAT-223 E2E-09 (atribusi + JSON mentah — sisi panel
E27 T2 sudah push `3027dcc`, verifikasi ulang pasca-push oleh parent), FAT-228 MUT-02
('Role not found' persisten 5×, caveat `edge_publisher` — butuh log body request backend;
JANGAN uji mutasi ulang sebelum log tersedia).

**Tidak disentuh:** E27 FAT-231–238 (skop parent), FAT-1–FAT-4 (onboarding workspace),
semua epic payung (FAT-7, 34, 71, 169, 174, 211, 214, 226 — masih punya anak terbuka),
FAT-28 (In Progress, parent), FAT-27, FAT-31 (butuh Fathur).

**Hitungan Linear pasca-E28:** total **238** issue (236 + FAT-237/238) = **201 Done /
35 Todo / 2 In Progress**. Sebelum E28: 172 Done / 62 Todo / 2 In Progress (236) + 2
tiket baru E27 (FAT-237/238, Todo). Yang ditutup fase ini: 29 (14 spec/live + 15 panel
Batch A+B). Epic yang masih Todo dengan anak tersisa: E13 (FAT-71 — tersisa B3/B6/B12),
E22 (FAT-169 — tersisa N-3/N-4), E23 (FAT-174 — tersisa N-32/N-40), E24 (FAT-211 —
tersisa N-42), E25 (FAT-214 — tersisa E2E-08/E2E-09), E26 (FAT-226 — tersisa MUT-02),
E8 (FAT-7 — V8.1/V8.3/V8.4/V8.5), E10 (FAT-34 — A10.2).

### 38.5 Yang tetap terbuka / butuh Fathur / butuh backend

**Butuh Fathur:** FAT-29 V8.4 (Nginx on-prem vs Vercel — keputusan), FAT-31 V8.1 (cek
visual di browser), FAT-30 V8.3 (akses LAN pabrik), FAT-27 V8.5 (DoD — setelah
V8.2/V8.3), FAT-28 V8.2 (lanjutkan verifikasi Real E2E: WS handshake, `/force-change-password`,
respons 401-gated, konsistensi data N-42).

**Butuh backend:** FAT-237 (Q1 — longgarkan validasi deviceId untuk stasiun ATAU sediakan
endpoint registrasi stasiun), FAT-238 (Q2 — tulis penolakan `STATION_NOT_FOUND` sebagai
operational event + kembalikan `station_label`), FAT-228 MUT-02 (log body create-client),
FAT-222 E2E-08 (mosquitto.conf), FAT-212 N-42 (presence/TTL STM32-OEE-01), FAT-74/77/83
(B3/B6/B12 — R-1/R-21), FAT-202 N-32 (definisi bit `eventFlags`), FAT-209 N-40
(deklarasi error OpenAPI), FAT-171 N-3 + FAT-173 N-4 (probe ber-auth), FAT-223 E2E-09
(atribusi + description audit), FAT-40 A10.2 (probe negatif tunnel + pembanding LAN).

**Verifikasi live oleh parent (browser) — daftar lengkap di §38.2/§38.3 akhir:** semua
perbaikan Batch A+B yang bersifat perilaku (banner error, aturan null '—', indikator
koneksi /login, default device SIM, empty state, overwrite downtime, peringatan shift,
rekonsiliasi, sumbu timeline) belum terverifikasi di browser nyata — panel masih di
commit lokal `d770c2b`, **belum push** (push menunggu kata Fathur, seperti biasa).

Dokumen: `docs/LINEAR.md` §1.1 (baris E28) + §1.3 (baris E22/E23/E24/E25/E26) + §8
(hitungan) diperbarui; `docs/linear-seed.json` v31 (`verified` + `issueMap` dilengkapi
entri E22–E25 yang selama ini tidak tercatat). Commit dokumen lokal: SATU commit dokumen saja (pesan "E28: tutup 29 issue Linear (14 spec/live + 15 panel Batch A/B) + AUDIT §38") — tanpa perubahan kode, tanpa push; hash lihat `git log -1` (HEAD lokal).

## 39. E29 — Spec 044: Migrasi login admin ke POST /auth/admin/login (2026-11-20)

Epic Linear FAT-239 (Todo, parent menutup setelah verifikasi live) + 7 anak
FAT-240–FAT-246. Sumber kebenaran: `~/workspace/oee-live-openapi-2026-11-20b.json`
(`POST /api/v1/auth/admin/login`, summary "Admin Panel entry point — operator
credentials without station context (spec 044)"): body STRICT
`{operator_id, password}` (`catchall: never`), respons 200 sama dengan login
lama, error `200/400/401/403/429` (403 BARU — role-gate non-admin, lihat §39.4).

Batch A (commit lokal `38752fc`, tes 492/492) mengerjakan T1/T2/T4; Batch B
(commit lokal `e4d1d6a`, tes 499/499) mengerjakan T3/T5/T6/T7. TIDAK push
(push menunggu kata Fathur, seperti biasa). TIDAK ada mutasi API live, TIDAK
ada kerja browser — semua verifikasi lokal (tsc + tes stub + build + checker).

### 39.1 Keputusan: nasib `AUTH_LOGIN` — DIHAPUS (Batch A, FAT-240)

- Entri registry `AUTH_LOGIN` dihapus, diganti `AUTH_ADMIN_LOGIN` (POST
  `/api/v1/auth/admin/login`). Registry tetap **137** (terverifikasi runtime
  via tsx). Path lama `/api/v1/auth/login` masuk `FORBIDDEN_ENDPOINT_PATTERNS`
  sebagai pola full-path — pola aman: `'/api/v1/auth/admin/login'.includes(
  '/api/v1/auth/login')` → false, path lama → true; dijaga
  `contractAlignment.test.ts:33-39`.
- Alasan (aturan E18, satu alur kanonis): endpoint lama dan baru tidak boleh
  hidup berdampingan sebagai fallback; body strict endpoint baru membuat
  pengiriman `station_id` pasti ditolak 400 bila dicoba. Penghapusan hanya di
  sisi panel — backend tetap menyediakan `/auth/login` untuk kiosk/perangkat.
- Alternatif yang ditolak: mempertahankan `AUTH_LOGIN` sebagai alias/fallback
  ("untuk jaga-jaga") — menyembunyikan kegagalan migrasi bila endpoint baru
  bermasalah; bila endpoint baru gagal live, yang benar adalah tiket backend,
  bukan fallback senyap.

### 39.2 Verdict `assertLanForMutation` — TIDAK memblokir login/refresh dari Vercel (Batch A, FAT-243)

- Rantai (investigasi `tmp-e29-invest.md` §a): `networkMode` modul
  (`transport.ts:120`, default `'LAN'`) hanya ditulis `NetworkAccessContext`
  (deteksi port lokal, `mode.ts:251-262`); di Vercel (https:443)
  `window.location.port === ''` ≠ `'8080'` → selalu `'LAN'` →
  `resolveEffectiveAccess` `canMutate: true` (LAN boleh mutasi, private
  maupun public). Guard lolos BUKAN karena pengecualian bootstrap, melainkan
  karena detektor kanal tidak bisa membedakan Vercel dari LAN pabrik. Model
  dual-vhost D1 berasumsi panel disajikan Nginx pabrik (port 80) vs tunnel
  (8080); di Vercel asumsi itu runtuh dan guard sisi-klien menjadi vakum.
  Penegakan nyata di sana adalah sisi server.
- **Batasan env (TIDAK dapat diverifikasi dari repo — perlu cek dashboard
  Vercel oleh parent/Fathur):** bila `VITE_NETWORK_MODE=REMOTE_TUNNEL` diset
  di dashboard Vercel, SEMUA login dari Vercel mati 403 (`FORBIDDEN`, pesan
  "Mode observasi") — dibuktikan tes Batch A: gate menolak SEBELUM fetch
  (stub `loginHits` tetap 0). Bila suatu hari guard harus benar-benar
  membedakan Vercel dari LAN, itu pekerjaan desain baru (deteksi berbasis
  origin/host, bukan port) — di luar E29. TIDAK ada pengecualian bootstrap
  yang ditambahkan (T4 = verifikasi + dokumentasi saja).
- Channel server (`GET /system/access-mode`, `channel: lan|tunnel|unknown`)
  TIDAK PERNAH dibaca transport dan baru diambil SETELAH login — tidak
  mungkin meng-gate login. Pra-login, `isReadOnly` berasal dari derivasi
  env+kanal saja → `false` di Vercel → tombol submit LoginPage aktif.

### 39.3 T3 — LoginPage tanpa station (Batch B, FAT-242)

- Dihapus: state `stationId` + Input "Station / Terminal ID (Opsional)" +
  `mapStationNotFoundMessage` (400 `STATION_NOT_FOUND` tidak lagi mungkin
  dari login admin) + shim 3-param `AuthContext.login` (Batch A,
  `AuthContext.tsx` kini 282 baris, di bawah hard cap 300 `context/*`).
  LoginPage kini memanggil `login(operatorId, password)` 2-arg.
- Dihapus sebagai dead code: `resolveDefaultStationId()` +
  `VITE_DEFAULT_STATION_ID` (`mode.ts:447-461` + `.env.example:71` +
  komentar header `mode.ts`) beserta tesnya
  (`modeAndTransport.test.ts:617,635` + override `:627` + entri `ENV_KEYS`).
  Tidak ada pemanggil produksi yang tersisa.
- Copy diperbarui (registry stasiun `/admin/stations` TIDAK dihapus — hanya
  copy login-nya): `StationsPage.tsx:74` (stasiun = khusus login kiosk;
  login admin tidak memakai station_id) dan
  `StationRegisterModal.tsx:83` (penegas "khusus login kiosk").
- Demo login tak berubah: paritas 2-arg diuji (`e29-batchB.test.ts`, T3).

### 39.4 T5 — Role-gate 403: pembeda gate lokal vs server (Batch B, FAT-244)

- Masalah: `LoginPage.tsx:85-92` lama memetakan SEMUA 403 ke pesan
  "jaringan jarak jauh" — 403 role-gate server dari endpoint admin
  (OPERATOR, pesan generik) akan tertukar dengan pesan tunnel yang
  menyesatkan.
- **Aturan pembeda (satu-satunya yang andal dari kode): kesamaan message.**
  `assertLanForMutation` (HTTP) dan `assertLanAccess` (demo) sama-sama
  melempar `ApiError` 403 dengan message persis
  `LAN_GATE_DENY_REASON` ("Mode observasi — perubahan dinonaktifkan. Akses
  penuh tersedia dari LAN pabrik."), SEBELUM fetch — server tidak pernah
  dihubungi. Server tidak pernah mengirim string Indonesia itu (pesan server
  berbahasa Inggris, diteruskan verbatim oleh `mapHttpErrorToApiError`,
  `schemas/transport.ts:119-147`). String itu kini konstanta tunggal
  (`mode.ts`, `LAN_GATE_DENY_REASON`), dipakai `resolveEffectiveAccess` dan
  `mapLoginForbiddenMessage` (`LoginPage.tsx`, diekspor untuk tes).
- Perilaku baru: 403 dengan message == `LAN_GATE_DENY_REASON` → pesan
  observasi (tidak berubah); 403 lain → pesan server tampil VERBATIM,
  generik, TANPA tambahan alasan role (jangan bocorkan, jangan parafrasa).
- **Batasan pembeda (dicatat, bukan disembunyikan):** pembeda ini bertumpu
  pada string message, bukan flag asal-error di `ApiError` (tipe itu tidak
  membawa penanda asal gate-vs-server). Bila server suatu hari mengirim
  message yang persis sama (sangat tidak mungkin — server berbahasa Inggris)
  atau bila copy gate diubah tanpa memperbarui konstanta, klasifikasi bisa
  salah. Tes `LoginPage.test.ts` mengunci string konstanta + kesamaan alasan
  `resolveEffectiveAccess('REMOTE_TUNNEL')` agar perubahan apa pun harus
  disengaja. Pembeda berbasis konteks (`mode` dari `useNetworkAccess`) TIDAK
  dipakai — kurang andal: `isReadOnly` juga bisa true karena
  `mutations_allowed` server sementara `mode` LAN, sehingga 403 server bisa
  salah dikira gate.
- Tes (`LoginPage.test.ts`, 5 tes): 403 gate → pesan observasi; 403 server
  (dua code berbeda) → verbatim, tanpa frasa "jaringan jarak jauh" /
  "Mode observasi"; non-403 → null.

### 39.5 T6 — Refresh Real mode tanpa gate LAN (Batch B, FAT-245)

- **Verdict refresh (investigasi §b):** sliding refresh lama hanya fire bila
  `mode === 'LAN'` (`AuthContext.tsx:203-205`) — di Vercel saat ini refresh
  JALAN hanya secara kebetulan (detektor port vakum, lihat §39.2). Bug laten:
  bila `networkMode` suatu saat menjadi `REMOTE_TUNNEL` (env diset, atau
  panel disajikan via `:8080`), refresh tidak pernah fire → sesi mati di TTL
  (fallback 900 dtk) tanpa percobaan refresh sama sekali. Refresh juga salah
  digate sebagai mutasi: spec `/auth/refresh` hanya mengenal 200/400/401
  (TANPA 403) — refresh adalah pemeliharaan sesi, bukan mutasi tulis.
- Perubahan Batch B:
  - (a) `http/auth.ts refreshSession()`: `assertLanForMutation()` DIHAPUS.
    `changePassword` TETAP digate (mutasi nyata). `login` tetap digate
    (tidak berubah perilaku di Vercel).
  - (a2) `demo/auth.ts refreshSession()`: `assertLanAccess()` DIHAPUS
    (paritas, rekomendasi investigasi) — `changePassword` demo tetap digate.
  - (b) `AuthContext.tsx` sliding refresh: syarat `mode === 'LAN'` DIHAPUS
    (refresh tanpa syarat kanal). `mode` tetap dipakai `checkCapability`, jadi
    destructure tidak dihapus; `mode` dihapus dari dependency array efek.
    Logika lain TIDAK berubah: single-flight, ambang 20% tersisa, logout
    saat TTL habis, `.catch(() => {})` (401 tetap berakhir logout via hook
    `onUnauthorized`).
- Tes (`e29-batchB.test.ts`, stub port **3060** — 3051 dipakai Batch A;
  stub membalas `Connection: close` agar socket keep-alive undici yang usang
  tidak dipakai ulang tes berikutnya ke server stub baru di port sama dan
  gagal `UND_ERR_SOCKET` — flaky yang terbukti via repro, BUKAN bug produk):
  refresh HTTP lolos 200 walau `REMOTE_TUNNEL` + private (`refreshHits` 1);
  kontrol negatif changePassword tetap 403 sebelum fetch (`changePasswordHits`
  0); refresh demo lolos walau `REMOTE_TUNNEL`; demo login paritas.
- **Batasan tes:** sliding refresh `AuthContext` (interval 1 detik) TIDAK
  diuji via render — repo ini tidak punya harness render React (tanpa
  testing-library/jsdom). Yang diuji adalah prasyarat fungsionalnya
  (refreshSession ungated di kedua transport) + penghapusan kondisi
  diverifikasi via grep (`mode === 'LAN'` = 0 sisa di AuthContext kecuali
  komentar) + tsc. Uji perilaku sliding yang sesungguhnya menunggu uji
  browser parent (sesi bertahan melewati ambang 20% TTL di tunnel).

### 39.6 Q-02 — DITUTUP oleh migrasi ini

- **Q-02 TIDAK tercatat di repo sebelumnya** — `grep -rn "Q-02"` repo-wide
  (`*.md`, `*.ts`, `*.tsx`, `*.json`, termasuk `docs/API_SYNC_REVIEW.md`,
  `AUDIT.md`, `docs/*.md`) = **0 hit**; `grep "Q-01"` = 0 hit; `"Spec 044"`
  di repo = 0 hit. Satu-satunya kemunculan frasa "spec 044" adalah summary
  endpoint di file spec live `~/workspace/oee-live-openapi-2026-11-20b.json`.
  Q-02 hanya ada di teks tugas E29 — dicatat di sini (§39.6) agar terlacak.
- Isi Q-02 (dari teks tugas): pertanyaan terbuka soal login admin pasca
  Spec 044 — kini **tertutup oleh migrasi ini**: login admin satu-satunya via
  `POST /auth/admin/login` (body strict tanpa station_id, §39.1), gate LAN
  terbukti tidak memblokir di Vercel (§39.2), 403 role-gate dibedakan dari
  gate tunnel (§39.4), refresh tanpa gate LAN (§39.5). Tidak ada tindak
  lanjut Q-02 yang tersisa di sisi panel.

### 39.7 Pertanyaan TERBUKA untuk uji live parent — urutan gate vs auth di server

- **JANGAN klaim login dari tunnel sudah pasti lolos.** Yang terbukti di
  sini hanya sisi KLIEN: guard klien lolos di Vercel (detektor port) dan
  login/refresh tidak digate klien. Yang BELUM terbukti adalah sisi SERVER:
  urutan gate vs auth di server belum diketahui — login VALID dari tunnel
  bisa 403 bila gate tunnel server berjalan SETELAH validasi kredensial
  (atau bila server menegakkan role-gate / channel-gate pada
  `/auth/admin/login` dengan cara yang belum terdokumentasi di spec live).
  Hanya uji browser parent yang bisa memastikan: login dengan kredensial
  VALID dari jaringan tunnel (dan dari Vercel) pasca-push + redeploy, lalu
  amati 200 vs 403 beserta body errornya.
- Terkait: FAT-40 (A10.2, probe negatif tunnel + pembanding LAN) tetap Todo
  dan mencakup pertanyaan ini; FAT-237/238 (registrasi stasiun + event
  `STATION_NOT_FOUND`) tetap Todo backend.
- Uji live lain yang masih menunggu parent (browser, pasca-push):
  sliding refresh bertahan melewati ambang 20% TTL saat kanal tunnel;
  403 role-gate server tampil verbatim di LoginPage (butuh login OPERATOR
  non-admin — JANGAN uji dengan kredensial admin sungguhan tanpa
  persetujuan); 401 endpoint admin tetap generik
  (`Invalid operator credentials`, sudah dibuktikan via stub Batch A, belum
  live); tidak ada regresi halaman lain pasca-hapus field Station.

### 39.8 Penutupan di Linear — 7 issue (20 Nov 2026)

Ditutup SETELAH verifikasi Batch B hijau (tsc 0, tes 499/499, build OK,
checker 0 FAIL) — tiap penutupan diverifikasi via `get_issue`:

| # | Issue | Bukti |
| --- | --- | --- |
| 1 | FAT-240 T1 (registry) | Batch A `38752fc`: `AUTH_ADMIN_LOGIN` di registry 137, path lama forbidden |
| 2 | FAT-241 T2 (login strict) | Batch A `38752fc`: body strict + 401 generik + demo paritas |
| 3 | FAT-243 T4 (gate) | Batch A `38752fc`: verdict §39.2 + tes batasan env REMOTE_TUNNEL |
| 4 | FAT-242 T3 (LoginPage) | Batch B `e4d1d6a`: field Station + shim + `resolveDefaultStationId` dihapus |
| 5 | FAT-244 T5 (403) | Batch B `e4d1d6a`: `mapLoginForbiddenMessage`, 5 tes |
| 6 | FAT-245 T6 (refresh) | Batch B `e4d1d6a`: refresh ungated http+demo, sliding tanpa `mode === 'LAN'`, 4 tes |
| 7 | FAT-246 T7 (tes/dokumen) | Batch B `e4d1d6a` + commit dokumen (lihat bawah): tes 499/499 + AUDIT §39 + LINEAR/seed |

Epic **FAT-239 tetap Todo** — parent yang menutup setelah verifikasi live
(§39.7).

**Hitungan Linear pasca-E29:** total **246** issue (238 + 8 E29) =
**208 Done / 36 Todo / 2 In Progress**. Sebelum E29: 201 Done / 35 Todo /
2 In Progress. Todo pasca-E29 (36): 4 onboarding (FAT-1–FAT-4) + E13
(FAT-71) + B3/B6/B12 (FAT-74/77/83) + V8.1/V8.3/V8.4/V8.5 (FAT-31/30/29/27)
+ A10.2 (FAT-40) + E8 (FAT-7) + E22 (FAT-169) + N-3/N-4 (FAT-171/173) + E23
(FAT-174) + N-32/N-40 (FAT-202/209) + E24 (FAT-211) + N-42 (FAT-212) + E25
(FAT-214) + E2E-08/E2E-09 (FAT-222/223) + E26 (FAT-226) + MUT-02 (FAT-228)
+ E27 (FAT-231) + T1–T3 + LOGIN + VERIFY (FAT-232–236) + FAT-237 + FAT-238
+ **E29 (FAT-239, epic, menunggu verifikasi live)**.

### 39.9 Verifikasi Batch B (2026-11-20)

- `npx tsc --noEmit`: **0 error**.
- `npm test`: **499/499 pass** (492 Batch A + 9 baru: 5 T5 `LoginPage.test.ts`
  + 4 T6/T3 `e29-batchB.test.ts`), 0 fail; file batchB dijalankan 3×
  berurutan (4/4 stabil) setelah perbaikan `Connection: close`.
- `npm run build`: OK (chunk-size warning pre-existing).
- `npm run check:structure`: **0 FAIL**, 45 WARN (di atas lunak, pre-existing).
- Grep akhir: `AUTH_LOGIN` di src hanya sebagai substring
  `AUTH_ADMIN_LOGIN` (+ tes registry yang menegaskan penghapusannya);
  `/api/v1/auth/login` di src hanya entri FORBIDDEN `endpoints.ts:77`;
  `station_id` di jalur login hanya di komentar sejarah + registry stasiun
  `/admin/stations` (yang memang terpisah); `mode === 'LAN'` di AuthContext
  hanya di komentar; `resolveDefaultStationId` / `VITE_DEFAULT_STATION_ID`
  = 0 sisa di src + `.env.example` (hanya disebut di AUDIT.md historis).
- `AuthContext.tsx` 282 baris (< 300 keras `context/*`); `LoginPage.tsx`
  286 baris; `mode.ts` 452 baris (< 500 keras); `http/auth.ts` 91 baris.

Dokumen: `AUDIT.md` §39 (file ini) + `docs/LINEAR.md` §1.1 (baris E29) +
§8 (hitungan) + `docs/linear-seed.json` v32 (`verified` + `issueMap`
dilengkapi E29/E29-T1–T7). Commit dokumen lokal: SATU commit dokumen saja
(pesan "E29 Batch B: AUDIT §39 + LINEAR/seed (tutup FAT-240–246)") — tanpa
perubahan kode, tanpa push; hash lihat `git log -1` (HEAD lokal).

## 40. Perbaikan ulang FAT-213 (N-43) + FAT-221 (E2E-07) pasca verifikasi live E29 (2026-11-20)

**Konteks.** Verifikasi live E29 (browser, Vercel 6c5b123, 2026-11-20 09:14–09:15
WIB) membuktikan login Spec 044 berhasil (ADM-001 via `/auth/admin/login`,
tanpa 403; epic FAT-239 ditutup Done oleh parent), TAPI dua penutupan E28
ternyata belum lengkap — parent membuka kembali FAT-213 (N-43) dan FAT-221
(E2E-07) ke Todo. Tugas ini memperbaiki keduanya di panel; **tidak push**
(tanpa persetujuan), **tidak ubah backend**, **tidak tutup tiket di Linear**
(parent menutup setelah verifikasi live). Koordinator + 2 worker berurutan
(satu per tiket), verifikasi akhir oleh koordinator.

### 40.1 FAT-213 (N-43): ringkasan agregat all-null tampil "—"

**Bukti live.** Telemetry → tab Agregat (50 bucket 5m): baris per-bucket SUDAH
benar (kolom OEE "—" di semua baris), tapi ringkasan masih 0%: "AVG OEE 0%,
AVAIL 0.7%, PERF 0%, PARTS 23145" dan blok kedua "OEE Rata-rata 0%".

**Akar (terverifikasi di kode).** `src/services/api/http/monitoring.ts:296-297`
— `mean1([]) → 0` (aturan E20 "bila semua null → 0"); keempat rata-rata
bertipe `number` (`src/types/analytics.ts:136`, `TelemetryAggregateResult`)
sehingga ringkasan TAK BISA null. Perbaikan E28 hanya menyentuh render
per-bucket, bukan rata-rata ringkasan. `TelemetrySummaryStrip.tsx:53` dan
`TelemetryTabPanels.tsx:200` me-render `{aggData.avg_oee}%` langsung.

**Perbaikan (commit lokal `8736a10`, 8 file).**
- `src/types/analytics.ts`: `avg_oee / avg_availability / avg_performance /
  avg_quality` di `TelemetryAggregateResult` jadi `number | null`.
- `src/services/api/http/monitoring.ts`: `mean1` mengembalikan `null` bila
  daftar terfilter kosong; bila ada nilai non-null, rata-rata dari yang
  non-null saja (perilaku lama dipertahankan).
- `src/features/analytics/components/TelemetrySummaryStrip.tsx` +
  `TelemetryTabPanels.tsx`: keempat rata-rata render "—" bila null; PARTS /
  Total Parts tetap angka.
- Klien demo (`src/services/api/demo/telemetry/oee.ts`) TIDAK perlu diubah —
  nilai demo tetap angka, valid di bawah `number | null`.
- `OeeSummaryCards` / `ShiftSummary` diperiksa — TIDAK terdampak (sudah
  `number | null` + render "—" via `pctValue`, pola E28 Batch A). Tidak ada
  renderer lain dari keempat field ini (grep `avg_oee|avg_availability|
  avg_performance|avg_quality` di seluruh `src`).
- Chart agregat (`TelemetryAggregateChart`) TIDAK disentuh — header "maks
  0.0%" saat semua null adalah perilaku lama yang terpisah, di luar lingkup.

**Tes (4 baru, total 503/503 saat commit).** Baru
`src/services/api/fat213-aggregate.test.ts` (2 tes transport HTTP, stub port
fresh 3061/3062): all-null → keempat rata-rata null; campuran → rata-rata
dari non-null saja. `TelemetrySummaryStrip.test.ts` +1 (semua null → "—",
PARTS 23145 tetap tampil); `TelemetryTabPanels.test.ts` +1 (all-null di kartu
ringkasan) + perbaikan fixture performance-null (`avg_performance` 0 →
null; `avg_oee` 0 dipertahankan karena nol asli dari satu baris `oeePct: 0`).
`demo/telemetryAggregate.test.ts`: narrowing null `agg.avg_oee` (satu-satunya
error tsc akibat perubahan tipe).

### 40.2 FAT-221 (E2E-07): warning rekonsiliasi masih tampil

**Bukti live.** Analytics 09:15 WIB: "2 selisih melebihi ambang" — "RUNNING
timeline vs ringkasan: 1.145 menit vs 99 menit" dan "Total durasi timeline vs
jendela shift: 10.080 menit vs 99 menit".

**Diagnosis (terkonfirmasi probe live, bukan tebakan).** Premis E28 Batch B
SALAH: `window` respons shift-summary BUKAN jendela satu shift. Probe live
(curl, param persis panel: `machine_id=CNC-MILLING-01`, `from`/`to` 7 hari
format `+07:00`, `include_hourly=true`, bucket `5m`):
`GET /oee/shift-summary` → `window: {from: "2026-11-12T19:38:07.000Z", to:
"2026-11-19T19:38:07.000Z"}` — server **meng-echo `from`/`to` yang diminta**
bila tak ada WO aktif (api_docs §Q.1: "tanpa WO → window dari `from`/`to`
eksplisit"). Mapper `mapShiftSummary`
(`src/services/api/http/mappers/monitoring.ts:441-442`) memetakan
`window.from/to` → `shift_start/shift_end` dengan benar, jadi
`resolveSummaryWindowMs` (`reconciliation.ts`) mem-parse OK — tapi
jendelanya **7 hari**, sehingga clip E28 (timeline 7 hari → jendela 7 hari)
adalah **no-op**. Window `00:00–09:00Z` hanya muncul bila `from`/`to` TIDAK
dikirim (panel tak pernah begitu). Angka 99 mnt juga BUKAN satu shift:
`time_sec.run` 5.940 dtk mencakup 7 hari yang sama (perangkat hanya jalan 99
mnt dalam 7 hari; telemetri terakhir 19 Nov 15:54 WIB). Dua selisih live
punya penyebab BERBEDA:
- **Total 10.080 vs 99** — artefak acuan: server tak mengirim planned
  production time, mapper jatuh ke `operatingSec/60` (= 99). Membandingkan
  total 7 hari dengan waktu operasi adalah salah acuan.
- **RUNNING 1.145 vs 99** — selisih NYATA dalam jendela yang sama: timeline
  diisi gapless oleh server (bucket kosong membawa state terakhir) — terbukti
  kuantitatif: RUNNING 745 mnt pk 02:38 WIB → 1.145 mnt pk 09:15 WIB tanpa
  data baru (≈ +1 mnt/mnt carry-forward setelah perangkat offline).
  `time_sec.run` hanya menghitung detik sampel. Ini TIDAK bisa diperbaiki
  clip dan TIDAK boleh disembunyikan — perlu keputusan backend soal semantik
  fill timeline bila selisih RUNNING ini mau hilang (lihat §40.4).

**Perbaikan (commit lokal `9977be1`, 2 file;
`src/features/analytics/reconciliation.ts` 339 → 405 baris, < 500 keras).**
- Check total (`timeline-total-vs-window`): acuan kini **durasi jendela**
  (`shift_end − shift_start`) bila jendela bisa diparse — live jadi 10.080
  vs 10.080 → ok. Bila jendela tak bisa diparse: fallback
  `planned_production_time_min` (perilaku lama) + catatan fallback. Ambang
  TIDAK diubah.
- Check per-state (RUNNING/planned/unplanned): nilai tetap (jendela sudah
  sama), tapi bila jendela > 24 jam diberi catatan jelas di UI (dirender
  `ReconciliationFootnote`, tanpa ubah komponen itu): *"Ringkasan + timeline
  mencakup rentang filter 7 hari, bukan satu shift. Timeline diisi gapless
  oleh server (bucket kosong membawa state terakhir) sementara ringkasan
  menghitung detik sampel — total state timeline bisa membesar saat perangkat
  lama offline."* Clip lama dipertahankan sebagai pengaman bila timeline
  melampaui jendela.
- Komentar header file dikoreksi dengan diagnosis + bukti probe; komentar
  kode di tempat perbaikan mencatat penyebabnya.
- Tabrakan label sumbu timeline di tepi kanan ("09:15 07:00 · 20 Nov")
  TIDAK dikerjakan — residu kosmetik E28 yang sudah dicatat, di luar lingkup.

**Tes (+3, `src/features/analytics/reconciliation.test.ts`,
rekonsiliasi 16/16).** Live-shape 7 hari: total 10.080 vs 10.080 ok +
catatan "rentang filter 7 hari"; RUNNING 1.145 vs 99 TETAP warning + catatan
gapless (terdokumentasi, bukan disembunyikan); `warningCount` 1. Jendela satu
shift: acuan total = durasi jendela (480), tanpa catatan. Fallback tanpa
jendela: total pakai `planned_production_time_min` + catatan "tidak bisa
diparse"; RUNNING tanpa potong/tanpa note (perilaku lama dipertahankan).

### 40.3 Verifikasi akhir (koordinator, di atas kedua commit)

- `git log`: `9977be1` (FAT-221) + `8736a10` (FAT-213) di atas `9be9c3a`;
  tree bersih; TIDAK push.
- `npx tsc --noEmit`: **0 error**.
- `npm test` penuh: **506/506 pass** (499 sebelumnya + 4 FAT-213 + 3 FAT-221),
  0 fail.
- `npm run build`: OK (chunk-size warning pre-existing).
- `npm run check:structure`: **0 FAIL** (335 file, 45 WARN di atas lunak,
  pre-existing; `reconciliation.ts` WARN lunak 405/300; `monitoring.ts` 396
  baris di bawah lunak 400; `TelemetryTabPanels.tsx` tetap 296/300).
- Spot-check koordinator: diff `mean1` (null bila kosong) + tipe nullable
  (§40.1); diff `reconciliation.ts` (acuan total = durasi jendela + fallback
  + catatan gapless) (§40.2).

### 40.4 Yang masih perlu verifikasi live (butuh push + redeploy — di luar tugas ini)

- Telemetry → tab Agregat pada rentang all-null (50 bucket 5m seperti bukti
  awal): ringkasan harus tampil "—" di AVG OEE/AVAIL/PERF/OEE Rata-rata,
  PARTS tetap angka. Kasus campuran: rata-rata ringkasan = rata-rata bucket
  non-null saja.
- Analytics: warning total HILANG (10.080 vs 10.080, "cocok" + catatan
  rentang filter); tersisa **1 warning RUNNING 1.145 vs 99 dengan catatan
  gapless** — ini perilaku yang diinginkan per tiket (tandai, bukan
  sembunyikan); pastikan tampilannya dapat diterima Fathur.
- Residu kosmetik tabrakan label sumbu tepi kanan tetap ada (bukan bagian
  tiket ini).
- Tindak lanjut backend (bukan tiket ini, belum dibuat): semantik
  gapless-fill timeline — RUNNING carry-forward saat device offline membuat
  total state timeline membesar vs `time_sec.run` ringkasan. Bila Fathur mau
  selisih RUNNING hilang, backend perlu memutuskan semantik fill (mis. bucket
  kosong tanpa state, atau cap carry-forward saat offline). FAT-213 dan
  FAT-221 tetap Todo di Linear sampai verifikasi live di atas selesai.
- Belum teruji live (dari E29): sliding refresh melewati ambang 20% TTL;
  403 role-gate verbatim (butuh login OPERATOR).

Dokumen: `AUDIT.md` §40 (file ini) + `docs/LINEAR.md` (§1.1 baris E29 +
§8 hitungan: 207 Done / 2 In Progress / 37 Todo; FAT-239 Done, FAT-213 +
FAT-221 Todo) + `docs/linear-seed.json` v33 (`verified` 246/207/37/2;
`issueMap` tak berubah — pemetaan N-43→FAT-213, E2E-07→FAT-221, E29→FAT-239
sudah ada). Commit dokumen lokal: SATU commit dokumen saja — tanpa perubahan
kode, tanpa push; hash lihat `git log -1` (HEAD lokal).

## 41. E30 — Wave 1 perbaikan hasil audit backend↔panel (2026-11-20)

**Konteks.** Audit gap backend↔admin-panel (13 verdict issue Linear sudah
dicatat sebagai komentar; FAT-74/77/83 ternyata ID phantom — tidak ada di
Linear, kerja B3/B6/B12 dilacak lewat dokumen ini + FAT-174). Wave 1
mengejar perbaikan yang TIDAK butuh keputusan produk/keamanan Fathur:
FAT-228 (MUT-02), FAT-202 (N-32), B3 (placeholder ABAC), plus stabilisasi
infra tes yang ternyata rusak pra-ada. FAT-237/247/40 (B9/live-mode) tetap
menunggu keputusan Fathur — TIDAK disentuh.

### 41.1 FAT-228 (MUT-02): role default fiktif `edge_publisher`

**Akar (terverifikasi).** `CreateMqttClientModal.tsx` meng-hardcode
`useState(['edge_publisher'])` dan `MqttClientModals.tsx` (AttachRole)
fallback `'edge_publisher'`. Role itu TIDAK ada di broker → mosquitto
"Role not found" → create-client/attach-role selalu gagal.

**Perbaikan.**
- `CreateMqttClientModal.tsx`: default role diambil dari prop `roles`
  (`GET /mqtt/roles`), bukan hardcode. `useEffect` menyinkronkan pilihan
  saat modal dibuka / roles tiba: pertahankan pilihan yang masih valid,
  bila kosong pilih role pertama yang tersedia. Tombol "Tambah" disabled
  bila tak ada role terpilih (guard role-kosong sudah ada di disk).
- `MqttClientModals.tsx` (AttachRole): fallback `roles[0]?.rolename ?? ''`
  (tanpa `edge_publisher`); submit ditolak bila `attachRoleName` kosong.
- Seed demo (`src/services/api/seeds/*`) TIDAK diubah — `edge_publisher`
  di sana hanya data mock, bukan jalur mutasi nyata.

### 41.2 FAT-202 (N-32): tabel bit event karangan

**Akar.** `EVENT_FLAG_BITS` di `mappers/assets.ts` memakai
NTP_SYNCED/MQTT_TLS_ACTIVE/MODBUS_HEALTHY/MODBUS_RETRY — tidak cocok
firmware. Otoritatif: `firmware/App/Inc/tasks_config.h` (System Event Group
Bits, 12 bit 1..2048), didokumentasikan di `firmware/docs/11-mqtt-contract.md`.

**Perbaikan.** Ganti tabel (bukan tambah) dengan 12 bit firmware:
ETHERNET_UP=1, MQTT_CONNECTED=2, JOB_CONFIGURED=4, EMERGENCY_STOP=8,
SD_CARD_PRESENT=16, FLASH_WARNING=32, WEB_GUI_ACTIVE=64, WEB_GUI_TIMEOUT=128,
PVD_EMERGENCY=256, HEAP_LOW=512, STACK_OVERFLOW=1024, START_REJECTED=2048.
Tes baru `mappers/eventFlags.test.ts` (3 tes) mengunci tabel + decode
bitmask/array/non-number.

### 41.3 B3 (FAT-174): placeholder ABAC menyesatkan

**Akar.** Placeholder `{"line_id": "LINE-01"}` di BindPermissionModal /
EditPolicyModal / CreatePolicyModal dan pesan error `parseAbacCondition`
memakai atribut telanjang `line_id` — bukan bentuk predikat terstruktur
yang diterima backend (`authz/abac.ts`, whitelist 10 atribut bernamespace
`subject.*`/`resource.*`). Operator menyalin placeholder → kondisi tak
pernah match.

**Perbaikan.** Placeholder + contoh pesan error diseragamkan ke
`{"attr": "subject.line_id", "eq": "LINE-01"}` (bentuk predikat yang benar).
`parseAbacCondition` tetap hanya memvalidasi objek JSON (bukan whitelist
atribut) — penegakan atribut ada di backend; panel tidak menduplikasi
whitelist sebagai sumber kebenaran kedua.

### 41.4 Stabilisasi infra tes (rusak pra-ada, bukan regresi Wave 1)

**Gejala.** `npm test` gagal 5–7 tes secara flaky (NETWORK / EADDRINUSE),
padahal baseline HEAD juga gagal (dibuktikan via `git stash` + run ulang:
set gagal identik dengan/tanpa perubahan Wave 1). Tiga akar independen:

1. **Socket keep-alive undici lintas stub.** Stub HTTP per-tes ditutup lalu
   stub berikutnya listen di port sama; undici memakai ulang soket lama →
   `fetch failed` (NETWORK). Fix: `Connection: 'close'` di semua respons
   stub + `server.closeAllConnections()` sebelum `server.close()` (24 situs,
   18 file). Preseden sudah ada di `e29-batchB.test.ts`.
2. **Tabrakan port antar-file paralel.** Node test runner menjalankan file
   paralel; beberapa file memakai port stub sama (3031 dipakai e28-batchA
   & e23-batch2) → EADDRINUSE. Fix: `--test-concurrency=1` di skrip `test`
   (package.json) — file berjalan serial, port tidak bertabrakan.
3. **Port 3002 dipegang proses live.** `rootlessport` (podman) memakai 3002
   di host; `accessMode.test.ts` & `demo/telemetryRange.test.ts` listen di
   3002 → EADDRINUSE permanen. Fix: pindah ke port fresh 3008 / 3009.

**Hasil.** `npm test` 509/509 (506 lama + 3 baru N-32), `npm run lint`
0 FAIL, `npm run build` sukses. Tanpa perubahan ini, gate tes tidak bisa
hijau meski kode benar.

### 41.5 Yang TIDAK dikerjakan (sengaja)

- **B6 (silent default mapper IAM)** dan **B12 (SUP-042 inspector)**:
  `useInspector.ts:18-22` punya komentar eksplisit bahwa swallow
  `.catch(() => undefined)` deep-link DISENGAJA ("JANGAN memperbaiki jadi
  reportError") — dihormati, tidak diubah. `mapIamRole` sudah menghapus
  `privilege_level`/`policy_count` (E20 P20.3); sisa fallback
  `is_system`/`created_at` butuh keputusan kontrak fail-hard → tunda.
- **FAT-237 / FAT-247 / FAT-40 (B9 + live ACCESS_MODE)**: menunggu
  keputusan Fathur (deviceId class, semantik OEE gapless, mode akses live).
- **FAT-222 (docker volume)** + **backend spec 047**: batch terpisah
  (repo iiot-oee), bukan di panel ini.

Dokumen: `AUDIT.md` §41 (file ini). Verdict Linear sudah diposting sebagai
komentar di 13 issue (bukan perubahan status). Commit lokal Wave 1 — tanpa
push; hash lihat `git log -1`.

## 42. E30 — panel P30.1–P30.3 (HMI tanpa login, station = identitas terminal)

Keputusan Fathur 20 Nov 2026 ~17:00 WIB: kerjakan bagian admin-panel dan HMI
dulu; HMI cukup kode + tes (tanpa deployment). Epic E30 FAT-248 + 12 anak
(FAT-249–260) dibuat 20 Nov 2026; 7 tiket kerja (P30.1–P30.3, H30.1–H30.4)
dipindah ke In Progress. H30.5 (verifikasi manual kamera fisik) tetap Todo —
milik pemilik repo. D30.1 (amandemen spec/ADR-0004) tetap Todo.

### 42.1 Scope panel — apa yang BISA dibuat tanpa backend

- **P30.1 (FAT-254):** klasifikasi kelas ID stasiun — `classifyStationId()`
  baru di `stationValidation.ts` (STM32- = edge-device; STATION-/KIOSK-/ADMIN-
  = terminal; sisanya unknown). TAMPILAN SAJA: validasi klien tetap longgar
  (aturan E28), server yang memutuskan. `StationTable`: kolom baru "Jenis"
  dengan badge (terminal = info). `StationRegisterModal`: catatan dua kelas ID.
  **Batas:** pendaftaran ID kelas terminal BELUM BISA jalan live — server
  masih menolak non-STM32 (400, FAT-237); butuh backend B30.1 (FAT-257).
- **P30.2 (FAT-255):** commissioning — `StationRegisterModal` kini menampilkan
  ringkasan commissioning setelah registrasi berhasil (ID + badge jenis +
  langkah berikutnya), bukan langsung menutup. Kredensial perangkat
  "diterbitkan sekali saat provisioning" masih menunggu backend B30.1;
  sampai saat itu terminal belum bisa mengirim data. Pencabutan per station
  sudah ada (Nonaktifkan/revoke di tabel, dari E27).
- **P30.3 (FAT-256):** `UnknownStationsPanel` — logika derivasi TIDAK berubah
  (sudah sesuai bingkai baru: SECURITY_REJECTION + device_id null +
  station_label). Yang berubah: copy panel + hook + halaman Stations ke
  bingkai baru — "terminal tak dikenal mencoba kirim data", bukan
  "percobaan login". Panel tetap kosong live sampai backend menulis
  SECURITY_REJECTION untuk terminal tak dikenal (B30.2, FAT-258).
- Copy halaman Stations + `LoginPage` (komentar) + header `stations.ts`
  disesuaikan ke bingkai baru (terminal HMI, bukan login kiosk).
- HMI (H30.1–H30.4) dikerjakan subagent terpisah — kode + vitest saja,
  tanpa deployment (lihat 42.3).

### 42.2 Verifikasi panel (lokal, 20 Nov 2026)

- tsc 0; tests **509/509** (506 sebelumnya + 3 tes baru `classifyStationId`
  di `stations.test.ts` — satu ekspektasi awal salah: `kiosk-lantai-2`
  memang berprefiks KIOSK- sehingga = terminal; tes diperbaiki, bukan kode);
  build OK; checker 0 FAIL (335 file).
- **Tidak di-push** (menunggu kata Fathur, sesuai aturan). Tiket P30.1–P30.3
  tetap In Progress dengan komentar progres di Linear.

### 42.3 HMI (H30.1–H30.4) — SELESAI lokal, terverifikasi, tidak di-deploy

Dikerjakan subagent 20 Nov 2026, diverifikasi ulang oleh parent (tsc + lint:arch
+ vitest dijalankan sendiri — bukan hanya laporan subagent).

- **Baru `src/application/stationMode.ts`** — kebijakan station-mode murni
  (pure, tanpa IO): `resolveStationSession` (ada hanya bila useBackend +
  token station env + stationId tervalidasi registry — fail-closed),
  `resolveAttributionOperatorId` (sesi operator menang; mode station memakai
  operator WO aktif dari `jobConfig.operatorId` — null jujur bila tanpa WO),
  pesan penolakan aksi sensitif + pesan kredensial station invalid. KONFLIK
  ADR-0004 tercatat di header file (amandemen tetap di D30.1, bukan repo ini).
- **H30.1:** `useAuthSession` — `stationSession`/`isStationMode` baru;
  `runProtected` tidak parkir di modal login dalam mode station; interval
  refresh sliding HANYA untuk sesi operator; `hasAuthToken` true untuk token
  station env. `Container`/`DashboardPage` mewariskan `stationTokenPresent`
  (dari `env.apiToken`).
- **H30.2:** `openAuthModal`/`notifyUnauthorized` tidak membuka modal PIN
  dalam mode station; 401 boot → pesan re-commissioning, bukan login ulang.
  `loginWithPassword`/`submitPasswordChange` tetap ada untuk surface Station
  (spec 002 login-first).
- **H30.3:** `getOperatorId` di `useOeeDashboard` — mode station memakai OID
  badge WO aktif; fallback null (tidak mengarang).
- **H30.4:** batalkan WO (`useWorkOrders`), ubah konfigurasi/bind/unbind
  (`useDeviceRegistry`), apply job config manual (`useMachineActions`)
  ditolak di application layer dengan arahan ke admin panel. Catatan penting:
  alur QR `initiateFromZones` TIDAK memakai apply-job-config manual — jadi
  penolakan ini tidak memutus logging QR. Tombol tidak dihapus (layout live
  monitor BEKU). Supervisor badge/PIN tetap butuh backend (B30.1/B30.2).
- **Verifikasi HMI (parent, 20 Nov 2026):** tsc 0; lint:arch OK; vitest
  **215/215** (30 file; 199 sebelumnya + 16 tes baru `tests/station-mode.test.ts`).
  Tidak di-commit, tidak di-push, tidak di-deploy (sesuai permintaan Fathur:
  HMI cukup kode + tes).

Dokumen: `AUDIT.md` §42 (file ini) + `docs/LINEAR.md` (§1.1 baris E30 +
§8: 223 Done / 34 Todo / 2 In Progress / 1 Canceled, total 260) +
`docs/linear-seed.json` v34 (`verified` 260/223/34/2; `issueMap` E30→FAT-248,
E30-H30.1→FAT-249 … E30-D30.1→FAT-260). Belum di-push.

## 43. FAT-261 — Panel konsumsi HEALTH_UPDATE dari WS (temuan audit WS health 2026-11-20)

**Akar.** Backend mengirim `HEALTH_UPDATE` tiap ~5 dtk dengan lengkap
(heap_free, tasks_healthy/total, stale_tasks, event_flags), tapi panel
tidak membacanya sama sekali: `HEALTH_UPDATE` hanya terdaftar di
`KNOWN_WS_TYPES` lalu diteruskan sebagai lifecycle event mentah
(`payload: Record<string, unknown>`) — grep seluruh `src/` menemukan
0 consumer. Health edge device di panel hanya berasal dari snapshot HTTP
`GET /devices/{id}/health` saat drawer dibuka + tombol Refresh manual.
Saluran push yang sudah mengalir terbuang; drawer tidak pernah ter-update
live dan tidak ada indikator umur laporan berbasis WS.

**Perbaikan (panel saja — sistem health TIDAK diubah).**
1. `src/services/ws/telemetrySocket.ts`: `HEALTH_UPDATE` diparse jadi
   event bertipe `TelemetryWsHealthEvent` (fail-soft: frame tanpa `data`
   objek / tanpa `device_id` → null, koneksi tidak putus); dikeluarkan
   dari union lifecycle (tidak ada pemanggil `emitLifecycleEvent` untuk
   tipe ini). Timestamp frame (ISO, presisi ms) diutamakan atas
   `data.timestamp` (epoch detik) — konsisten dengan fallback lifecycle.
2. `src/services/api/http/mappers/assets.ts`: `mapWsHealthEventToDeviceHealth`
   (baru) — WS → `DeviceHealth` yang sama dengan snapshot HTTP, pakai
   `decodeEventFlags` 12-bit firmware. WS tidak membawa `ageSec`, jadi
   umur laporan dihitung dari timestamp frame terhadap `nowMs`
   (di-inject tes); timestamp masa depan dijepit ke 0.
3. `src/features/assets/DeviceHealthDrawer.tsx`: selagi drawer terbuka,
   subscribe WS — `HEALTH_UPDATE` untuk device yang sama memperbarui
   health secara live + badge "Live WS" dan keterangan "diperbarui
   otomatis tiap ~5 detik". HTTP tetap jadi snapshot awal + Refresh
   manual; frame device lain diabaikan; unsubscribe saat drawer tutup /
   ganti device. Mode Demo tidak berubah (sim hanya emit TELEMETRY_UPDATE,
   drawer tetap HTTP seperti semula).

**Yang TIDAK diubah (sengaja).** Endpoint `/health` + `/health/detail`,
tipe `DeviceHealth`, `mapDeviceHealth`, `useDevices` (DEVICE_STATUS_UPDATE
sudah memicu refetch), backend (HEALTH_UPDATE belum ada di OpenAPI —
catatan terpisah untuk agen lain), HMI (sudah mengonsumsi HEALTH_UPDATE
langsung — diverifikasi dari `useTelemetrySubscription.ts`).

**Prasyarat.** Tree lokal disinkronkan dulu dengan remote `34e21cc`
(26 file agen lain: FAT-228, FAT-202, B3, infra tes) sebelum
implementasi — tes gabungan terverifikasi **512/512** di tree gabungan.

**Hasil.** `tsc` 0, `npm test` **521/521** (512 + 9 baru: 5 parser
`telemetrySocket.test.ts` + 4 mapper `wsHealth.test.ts`), `build` OK,
checker 0 FAIL (338 file). Terverifikasi LIVE 20 Nov 2026 17:48–17:49 WIB
(login ADM-001, Edge Devices → drawer STM32-OEE-SIM, ~40 dtk tanpa
Refresh): badge "Live WS" muncul dalam beberapa detik dan bertahan;
"Pembaruan 4 detik lalu" → "0 detik lalu" dan tetap 0 dtk; memori 64,0 KB
+ proses 8/8 (statis, sesuai nilai tetap SIM); event flags kosong.
FAT-261 → Done.

Dokumen: `AUDIT.md` §43 (file ini). Tiket FAT-261 dibuat sebelum
implementasi, status In Progress dengan komentar progres.

## 44. FAT-262 — Hardening UI/UX sidebar: ikon Overview center + break line antar grup saat minimize

**Temuan Fathur (20 Nov 2026).** Dua cacat visual saat sidebar kiri
di-minimize (`w-16`):
1. Ikon Overview Dashboard tidak center — link-nya `flex items-center`
   tanpa `justify-center` (padding `px-3`, rata kiri), padahal ikon menu
   grup saat minimize sudah `justify-center p-2`.
2. Pemisah antar grup menu hilang — mode expand memisahkan grup lewat
   judul grup + spasi, tapi mode minimize hanya mengandalkan spasi kecil
   sehingga ikon-ikon antar grup menyatu.

**Perbaikan (`src/layouts/Sidebar.tsx` saja).**
1. Link Overview: `className` dibuat kondisional — saat minimize pakai
   `justify-center p-2` (persis pola ikon grup), saat expand tetap
   `gap-2.5 px-3 py-2`.
2. Cabang minimize tiap grup: divider `<div className="mx-2 my-2
   border-t border-slate-800" aria-hidden="true" />` sebelum grup
   ke-2 dst (indeks `idx > 0`). Warna sama dengan garis header/footer
   (`border-slate-800`). Sebelum grup pertama tidak ada garis — sama
   seperti mode expand yang juga tanpa garis di sana.

**Yang TIDAK diubah (sengaja).** Perilaku, routing, capability, tombol
collapse di header (posisinya tidak dilaporkan Fathur), footer role.

**Hasil.** `tsc` 0, `npm test` **521/521**, `build` OK, checker 0 FAIL
(338 file). Verifikasi visual menyusul di deployment live (cek
sidebar minimize: ikon Overview center + garis antar grup).

Dokumen: `AUDIT.md` §44 (file ini). Tiket FAT-262 dibuat sebelum
implementasi, status In Progress dengan komentar progres.

## 45. E31 — Audit struktur UI + aturan pondasi modular per halaman (admin-panel saja)

Perintah Fathur 2026-11-20 19:18 WIB: audit struktur UI + audit
pemisahan komponen (termasuk reusable), fokus perbaikan = refactoring
codebase lebih terstruktur dan jelas terpisah, modular per halaman;
tentukan dan tulis aturannya sebagai fondasi merapikan codebase.
Lingkup: admin-panel saja (bukan HMI/backend).

Audit (read-only, 2026-11-20 ~19:20–19:23 WIB; laporan lengkap
`~/workspace/ui-audit-findings.md`, 312 baris; tidak ada kode diubah):
338 file / 62.289 baris, checker 0 FAIL / 45 WARN.

Temuan utama (angka diverifikasi ulang oleh parent agent):
- 6 file tinggal 1–16 baris lagi dari FAIL checker: `useBrokerConfig`
  249/250, `useOeeAnalytics` 247/250, `TelemetryTabPanels` 296/300,
  `DowntimeEventsPage` 584/600, `modeAndTransport.test.ts` 792/800,
  `AuthContext` 282/300. Total 43 file melewati batas lunak.
- 4 halaman CRUD production (Shifts 413, Products 402,
  ProductionLines 379, ShiftSchedules 454) adalah klon kerangka yang
  sama: tabel inline + form modal inline + confirm + conflict,
  20–25 useState. Pola benar sudah ada di OperatorsPage/WorkOrdersPage.
- Komponen reusable ada tapi tidak dipakai: `DataTable` 5 pemakai vs
  16 tabel hand-rolled; `ui/Select` 1 pemakai vs 29 file `<select>`
  mentah; `LoadErrorBanner` 5 pemakai vs error inline di 10 file;
  `EmptyStateBlock` 2 pemakai vs "Tidak ada data" di 18 tempat.
- Hooks multi-alur: `useBrokerConfig` (5 alur, 16 useState),
  `useOeeAnalytics` (5 query domain).
- Aturan 5 kontrak (larangan import lintas-fitur) BERSIH — 0
  pelanggaran; barrel API bersih. Yang kotor di dalam fitur: komponen
  di root fitur, 7 helper longgar di root `analytics/`,
  `features/shared/` mencampur UI + logika, `dto.ts` (540) menampung
  skema semua domain.
- Sumber kebenaran ganda: `toLocaleString()` mentah di 21 file,
  literal `STM32-` di ~20 file, 4 komponen `*FilterBar` berbeda,
  string loading di 72 tempat tanpa komponen bersama.

Aturan pondasi: `docs/UI_STRUCTURE_RULES.md` (baru, 2026-11-20) —
melengkapi `docs/DIRECTORY_STRUCTURE.md` (kontrak R9 mengatur ukuran;
dokumen ini mengatur bentuk UI). Isi: 5 prinsip (page hanya
orkestrasi, reusable dulu, satu concern per file, satu sumber
kebenaran, pecah sebelum batas keras) + 10 aturan R1–R10 (semua tabel
pakai DataTable; semua select pakai ui/Select; error/empty/loading
pakai komponen shared; satu hook = satu alur; komponen tinggal di
`components/`; satu format tanggal; satu FilterBar generik; page hanya
orkestrasi; pecah dulu file di ambang batas keras; satu file
skema/type/mapper = satu domain) + anatomi halaman modular + katalog
reusable + penegakan + roadmap P0–P3.

Linear: epic E31 FAT-263 (Todo, High) + 16 anak — E31.1 audit
FAT-264 (In Progress → Done setelah push ini), P0 E31.2–E31.5
(FAT-265–268), P1 E31.6–E31.10 (FAT-269–273), P2 E31.11–E31.14
(FAT-274–277), P3 E31.15–E31.16 (FAT-278–279), semua Todo.
Urutan kerja yang disarankan: P0 dulu (mencegah checker FAIL), lalu
P1 (fondasi), lalu P2 per domain, P3 terakhir. Eksekusi refactor
BELUM dimulai — menunggu persetujuan urutan/prioritas Fathur.

Dokumen: `AUDIT.md` §45 (file ini), `docs/UI_STRUCTURE_RULES.md`,
`docs/LINEAR.md` §8, `docs/linear-seed.json` v35.

## 46. E31 ronde 1 — Refactor production + assets + analytics (prioritas Fathur)

Perintah Fathur 2026-11-20 19:33 WIB: mulai refactor, kelompok
production, assets, data analysis menjadi yang utama. Eksekusi
19:34–19:42 WIB, tiga subagent paralel (satu per kelompok), murni
pindah kode — tanpa ubah perilaku/UI.

**Production — E31.11 (FAT-274, Done).** 4 halaman CRUD diekstrak
tabel + form modal ke `components/` (8 file baru): Shifts 413→283,
Products 402→278, ProductionLines 379→269, ShiftSchedules 454→335
(total −483 baris; semua kini di bawah lunak 400). Form modal
controlled — form state, validasi, submit tetap di Page; JSX hasil
ekstraksi dicek identik dengan aslinya (hanya rename prop).
Tidak migrasi ke DataTable (E31.10) dan tidak buat CrudPage generik
(di luar tiket).

**Assets — E31.14 bagian assets (FAT-277, tetap In Progress).**
`DeviceDetailModal` + `DeviceHealthDrawer` pindah dari root fitur ke
`components/`; `DeviceDetailModal` 392 baris wajib dipecah juga saat
pindah (batas keras komponen 300) → `DeviceBindingInfo` (68) +
`DeviceCredentialActions` (176), induk 193. `DeviceHealthDrawer`
utuh 219 baris — perilaku FAT-261 (subscribe HEALTH_UPDATE + badge
"Live WS") dipertahankan persis. `mapApiIssuesToErrors` dikanonikalisasi
ke `features/assets/utils/apiErrors.ts` (salinan identik ternyata ada
juga di `useMachineCrud.ts`; 6 modal pemakai diperbarui).
`MachineDetailModal` 222→157 (info binding keluar ke
`MachineBindingInfo` 87) — klaim audit soal "histori" di modal ini
tidak cocok dengan file saat ini (tidak ada seksi histori yang
dirender). `useDevices` 224→213 (helper keluar; split `useDeviceCrud`
lanjutan tidak termasuk tiket ini). WARN lunak baru:
`DeviceHealthDrawer` 219 di `components/` (lunak 200).

**Analytics — E31.3 (FAT-266, Done) + E31.4 (FAT-267, Done) +
E31.14 bagian analytics.** `useOeeAnalytics` 247→111 (komposisi
tipis) + `useOeeAnalyticsBase` (116) + `useOeeRollup` (62) +
`useShiftTimeline` (85) + `useRejectPareto` (33); bentuk kembalian
identik (42 field, urutan sama, dicek programatik) — `OeeAnalyticsPage`
tidak perlu diubah. `TelemetryTabPanels` 296→30 (induk tipis) + 4
panel (raw 80, hourly 60, aggregate 111, rollup 114) — ternyata ada
4 tab, bukan 3 seperti tertulis di audit/tiket; tab rollup ikut
dipecah. `ShiftTimeline` 272→182 + `ShiftTimelineBar` (86) +
`ShiftTimelineAxis` (54) + `ShiftTimelineStates` (77) — detail overlay
ternyata SUDAH terpisah sejak R9.2 (`ShiftTimelineDetail.tsx`), jadi
yang dipecah adalah bar + sumbu + state, bukan overlay.

**Prinsip Fathur 2026-11-20 19:42 WIB:** "baris target jangan jadikan
target mutlak, yang terpenting adalah pemisahan komponen kontainer UI
dan pemisahan tanggung jawab." Dicatat di `docs/UI_STRUCTURE_RULES.md`
prinsip 0 + R8. Prinsip ini menyelesaikan penyimpangan E31.11
(target ~200 baris/page tidak tercapai, hasil 269–335): keempat halaman
dinyatakan selesai karena tanggung jawabnya sudah terpisah — memindah
form state ke modal hanya demi angka akan mengubah alur submit.

**Verifikasi pusat (gabungan ketiga kelompok):** tsc 0, tes 521/521,
build OK, checker 0 FAIL / 39 WARN (sebelumnya 45), 361 file
(sebelumnya 338).

**Catatan.**
1. `push_files` TIDAK bisa menghapus file — path lama
   `src/features/assets/DeviceDetailModal.tsx` +
   `src/features/assets/DeviceHealthDrawer.tsx` akan tetap ada sebagai
   orphan di remote (ditambah orphan lama `MachineDetailModal.tsx` di
   root). Penghapusan sisi repo butuh persetujuan Fathur.
2. Local git HEAD masih detached di 7095217 (stale) — `git diff`
   menampilkan ~87 entri, mayoritas konten tersinkron lama. Diverifikasi
   via blob SHA vs remote a78e577 (contoh: `telemetryDefaults.test.ts`
   6f4c76b6…, `mappers/assets.ts` 7c5838d2…, `package.json`
   3b289c13… — sama dengan remote). Klaim subagent analytics soal
   "file dimodifikasi agen lain" adalah salah baca diff vs HEAD stale,
   bukan intrusi.
3. E31.2 (mqtt `useBrokerConfig`) + E31.5 (monitoring
   `DowntimeEventsPage`) + bagian system/mqtt E31.14 + seluruh P1/P3
   tetap Todo — di luar prioritas ronde ini.

Dokumen: `AUDIT.md` §46 (file ini), `docs/UI_STRUCTURE_RULES.md`
(prinsip 0 + R8), `docs/LINEAR.md` §8, `docs/linear-seed.json` v36.

## 47. E31 ronde 2 (P1 fondasi reusable) + FAT-280 Opsi B sessionStorage

Perintah Fathur 2026-11-20 19:54 WIB ("lanjutkan") — ronde 2 = P1
dulu sebagai fondasi (komponen hasil ekstraksi ronde 3 harus langsung
memakai komponen shared yang benar), lalu ronde 3 paralel. Paralel
dengan ronde 2: diagnosis + implementasi bug auth FAT-280.

**P1 — E31.6–E31.10 (FAT-269–273, Done).** Satu agen, lima tiket:
- E31.6: `<select>` mentah 55 blok di 31 file → 0. `ui/Select`
  diperluas prop `wrapperClassName`. Bypass terdokumentasi: 2 select
  Topbar (warna background kondisional mode tidak bisa diekspresikan
  ui/Select) — komentar R2-bypass di baris 207 & 250.
- E31.7: 9 konversi ke `LoadErrorBanner` (5) + `EmptyStateBlock` /
  `TableStateRow` (4). Yang sengaja TIDAK dikonversi (bukan bypass):
  banner feedback dismiss/success, validation-issues terstruktur,
  banner amber filter-invalid, chip DENY, tampilan data, error submit
  modal, strip inline kompak, empty state sukses berikon, fallback
  nilai sel, props empty DataTable, error aksi rekonsiliasi.
- E31.8: `utils/formatDate.ts` baru (facade atas
  `utils/historicalExport/timezone.ts`, Asia/Jakarta) + 42 penggantian
  di 20 file; `toLocaleString()` tanggal mentah → 0 (sisa hanya format
  angka + counter detik live yang sengaja dibiarkan).
- E31.9: `FilterBar` generik baru (`components/industrial/FilterBar.tsx`
  + `FilterSearchField` + `FilterResetButton`); digabung 4 FilterBar
  (WorkOrder, Telemetry, OperationalEvents, Shift). Bypass: MachineFilterBar
  (toggle tersegmentasi + penghitung) + OperatorsToolbar parsial.
- E31.10: 13 tabel dimigrasi ke `DataTable` (Device, Machines, Station,
  Operators + 4 CRUD produksi + BrokerVersions, DynSecClients,
  Assignments, Policies, Audit); pemakai DataTable 8 → 21 file; tabel
  hand-rolled 18 → 5 (4 bypass terdokumentasi: OeeHourlyTable,
  OeeRollupTable, OverviewPage — kartu ganda; BrokerDiffModal — bukan
  tabel data).
- Delta visual kecil (bukan perubahan perilaku, tapi perlu cek visual):
  5 tabel yang dulu tanpa empty state kini menampilkan teks empty baru
  ("Belum ada versi konfigurasi", dst.); loading teks "Memuat …"
  menjadi skeleton DataTable; header kolom "Aksi" kini rata kiri (isi
  tetap rata kanan); border kartu `rounded-md` → `rounded-lg`.
- WARN checker naik 39 → 41: 2 WARN baru dari migrasi DataTable
  (DeviceTable 220, OperatorsTable 203 — ColumnDef + useMemo). Catatan:
  `useBrokerConfig` terhitung 250/250 oleh checker (wc -l: 249 —
  checker menghitung baris 1 lebih banyak); tetap WARN, E31.2 di ronde 3
  makin mendesak.

**FAT-280 — Opsi B sessionStorage + silent restore (In Review).**
Keputusan Fathur 2026-11-20 20:01 WIB. Diagnosis (§47a): BUKAN bug
kode — konsekuensi desain D5 (token hanya di memori; AuthProvider
start `isAuthenticated=false`; AdminLayout redirect ke `/login`).
TEMUAN PENTING (dicatat atas permintaan Fathur): TIDAK ADA refresh
token di mana pun — panel: grep `refreshToken|refresh_token` = 0;
backend live OpenAPI: POST `/auth/refresh` hanya menerima JWT yang
masih berlaku ("Refresh an unexpired operator JWT"), respons
`{success, token, expires_in, authzVersion}`. Silent refresh setelah
reload mustahil tanpa menyimpan token itu sendiri atau mengubah backend.
Opsi jangka panjang (refresh token terpisah / cookie httpOnly) butuh
tiket backend — follow-up, belum dibuatkan tiket.
Implementasi (5 file): `transport.ts` 460→521 (`setHttpToken` menulis
tembus ke sessionStorage key `iiot-oee-access-token`; `getStored` /
`clearStored` + guard `sessionStorageSafe()`; logout menghapus
simpanan; komentar D5 diperbarui); `context/authSessionRestore.ts`
baru (118) + `authSessionRestore.test.ts` baru (273, 10 tes);
`AuthContext.tsx` 282→293 (state `isRestoringSession`, `applySession`
dipakai login + restore); `AdminLayout.tsx` 49→58 (placeholder
"Memulihkan sesi…" selama restore). Restore hanya mode Real; mode Demo
dilewati (state auth demo in-memory, token `mem_jwt_…` palsu).
Alur: token tersimpan → `refreshSession()` (validasi + rotasi) →
`getAuthMe()` → pulihkan sesi. 400/401 → simpanan dihapus; galat
jaringan → simpanan dipertahankan (backend sering restart).
Batas: reload setelah JWT kedaluwarsa (>900 dtk) tetap login ulang.
Edge (di luar tiket): reload di halaman `/login` yang restore-nya
berhasil tetap di `/login` (LoginPage tidak redirect saat
terauntentikasi).
TIGA TES GAGAL saat verifikasi pusat, diperbaiki parent (bukan agen):
(1) Token hasil rotasi tidak pernah disimpan helper restore — hanya
diandalkan efek samping `refreshSession()` klien asli; 2 tes fake-client
gagal. Perbaikan: `setHttpToken(refreshed.token)` setelah refresh
sukses di `authSessionRestore.ts`. (2) Tes integrasi 401 gagal palsu:
memakai ulang port 3061 membuat request pertama menabrak koneksi
keep-alive mati dari server stub sebelumnya → galat NETWORK
(httpStatus 0), bukan 401 — simpanan dipertahankan. Perbaikan: tes
401 memakai port 3062. Setelah perbaikan: 10/10 tes auth hijau.

**Verifikasi pusat (ronde 2 + FAT-280):** tsc 0, tes 531/531
(521 + 10 baru), build OK, checker 0 FAIL / 41 WARN, 365 file.
**Belum:** verifikasi live FAT-280 di browser (login ADM-001 →
reload → tetap di `/admin`; logout → reload tetap di `/login`; tab
baru → tetap minta login) + cek visual delta E31.10 — menyusul setelah
push + redeploy Vercel.

Dokumen: `AUDIT.md` §47 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v37.

## 48. E31 ronde 3 kelompok A (P0 sisa) — FAT-265 + FAT-268

Perintah Fathur 2026-11-20 20:45 WIB ("oke, push juga commit terbaru")
— push parsial kelompok A yang sudah selesai, sementara kelompok B/C
masih berjalan. Push #15.

**E31.2 (FAT-265) — useBrokerConfig 249 → 125.** Dipecah PER CONCERN
(bukan per tab — kelima tab berbagi satu state load + satu state
feedback, hook per tab akan menduplikasi load): komposisi tipis +
6 sub-hook baru di `features/mqtt/hooks/` — brokerConfigTypes (29,
5 tipe + komentar E20/E23, cegah import siklik), useBrokerConfigFeedback
(16), useBrokerConfigLoad (99), useBrokerConfigStage (77),
useBrokerConfigVersions (48), useBrokerConfigConfirm (85, helper
ackUnvalidated E28 pindah ke sini). Bentuk kembalian komposisi
identik — 30 field, tidak ada yang hilang/tambah, urutan sama persis
(diverifikasi programatik); BrokerConfigManagerPage (satu-satunya
pemanggil) + BrokerConfirmModal tidak disentuh. Total baris naik
807 → 1.114 di 10 file (header/interface/import berulang — harga
pemisahan tanggung jawab, prinsip 0).
**E31.5 (FAT-268) — DowntimeEventsPage 558 → 391** (di bawah lunak
page 400). Dua ekstraksi ke `features/monitoring/hooks/`:
useDowntimeExport (95 — export + cooldown 30 dtk + state, filter
diteruskan per render) dan useDowntimeEventColumns (149 — ke-6 kolom,
pola useOperationalEventColumns). useOperationalEventColumns TIDAK
dipakai ulang — tipe berbeda (OperationalEvent + ack vs DowntimeEvent
+ label); hook baru pasangan per domain. Filter UI tetap inline
(di luar tiket). `catch (err: any)` pada kode pindah diubah ke
`catch (err: unknown)` + cast — perilaku identik, typing lebih ketat.

**Status verifikasi (jujur):** verifikasi pusat PENUH ditunda sampai
B/C selesai — tree saat push masih bercampur edit B/C yang belum
selesai. tsc pada tree campuran: 6 error, SEMUANYA di file B/C yang
masih dikerjakan (BackendHealthIndicator yang dipindah B — path import
relatif salah; monitoring-shift.ts yang dipecah C — pctOrNull belum
didefinisikan/diimpor). File kelompok A BERSIH dari error. Tiket
FAT-265/268 tetap In Progress sampai verifikasi pusat ronde 3
(tsc 0, tes hijau, build OK, checker 0 FAIL) selesai.

Dokumen: `AUDIT.md` §48 (file ini), `docs/LINEAR.md` §8.

## 49. E31 ronde 3 selesai (B + C) + perbaikan race FAT-280

Ronde 3 (perintah Fathur 20:41 WIB "lanjutkan", 3 agen paralel).
Kelompok A sudah di-push #15 (AUDIT.md §48). Kelompok B + C selesai
lokal 2026-11-20 ~20:47–20:48 WIB; verifikasi pusat + push #16 di
bagian ini.

**Kelompok B — P2 sisa (FAT-275, FAT-276, FAT-277).**
- E31.12: OverviewPage 456→355 + OverviewLiveTable baru (122);
  LiveStatePage 292→194 + LiveStateCard baru (116).
- E31.13: Topbar 371→304 + ChangePasswordModal baru (99) di
  `layouts/components/` (subfolder baru — penyimpangan lokasi: modal
  spesifik Topbar; anggaran checker layouts/ [250,400] mencakupnya;
  bila lebih suka `features/auth/components/`, pindahnya sebaris
  import); BackendHealthIndicator pindah ke
  `features/auth/components/` (93, isi tidak berubah).
- E31.14 (FAT-277, system+mqtt — SELESAI SELURUHNYA): RolesTab
  202→94 + RoleCard baru (154); OperatorDetailModal 237→119 +
  OperatorRoleAssignments (70) + OperatorQuickAssignForm (114);
  Mqtt*Modals dipecah per modal (RotatePassword 62, AttachRole 63,
  CreateGroup 49, ManageGroupMembers 90, CreateRole 55, AddAcl 67).
  Catatan: ketiga file Mqtt*Modals lama dihapus lokal → jadi orphan di
  remote setelah push (push_files tidak bisa menghapus) — masuk daftar
  cleanup yang butuh persetujuan Fathur. Tabrakan nama CreateRoleModal
  (mqtt vs IAM) didokumentasikan di header file mqtt.
**Kelompok C — P3 (FAT-278, FAT-279).**
- E31.15: dto.ts 540 → 7 file per domain + barrel; types/mqtt.ts 396
  → mqtt-dynsec 65 + mqtt-config 342 + barrel; mappers/monitoring.ts
  531 → 5 file + barrel; mappers/system.ts 455 → 3 file + barrel.
  Semua barrel re-export di path lama — impor pemanggil tidak berubah;
  semua export terverifikasi tanpa duplikat (dto 36/36, mqtt 26/26,
  mapper 27 fungsi). types/mqtt-config.ts 342 masih di atas lunak
  types (300) tapi di bawah keras (500) — satu domain kohesif,
  tidak dipecah lebih jauh (prinsip 0).
- E31.16: telemetrySocket.ts 461 → telemetryFrame 230 +
  telemetrySim 85 + telemetrySocket 207; historyFilters.ts 453 →
  utils/historyParams 232 + hooks/useHistoryFilters 62 +
  utils/historyWorkOrder 184 + barrel; features/shared/ dirapikan ke
  ui/hooks/utils + barrel di 5 path lama. TableStateRow ASLI dibiarkan
  (primitif bersama, dipakai 8 file) — yang DIHAPUS hanya shim
  re-export di features/analytics/components/ (0 importir) → orphan
  remote, masuk daftar cleanup.
**Perbaikan parent saat verifikasi pusat (2 bug split):**
- BackendHealthIndicator yang dipindah B memakai path import relatif
  lama (`../../services/api/...`) — diperbaiki ke `../../../`.
- monitoring-shift.ts (pecahan C) memakai `pctOrNull` yang tidak
  diekspor dari monitoring-telemetry.ts — helper diekspor + diimpor.
**Checker FAIL + perbaikan:** `features/shared/hooks/useHistoricalQueries.ts`
280 baris melanggar batas keras hook (250) — akibat pemindahan C dari
`shared/` ke `hooks/` (anggaran lebih ketat). Dipecah parent per
domain: useHistoryMasterQueries (61) + useHistoryDataQueries (239) +
barrel (9); impor pemanggil tidak berubah (barrel lama di
`features/shared/` tetap jalan). Catatan: saat pemindahan saya sempat
salah menulis satu baris (useDowntimeHistoryQuery kehilangan
`to: filters.to` + `active_only`) — diperbaiki sebelum verifikasi;
tes hijau memastikan tidak ada perubahan perilaku.

**FAT-280 — perbaikan race (In Review).** Verifikasi live 20:42 WIB
GAGAL (reload tetap ke /login) — BUKAN deploy basi (bundle live
mengandung marker FAT-280). Root cause: `useSessionRestore` init
`isRestoringSession=false` → AdminLayout redirect ke /login SEBELUM
effect restore berjalan. Perbaikan: `shouldRestoreAtBoot()` sebagai
lazy initializer (mode Real + ada token tersimpan → restoring=true
sejak render pertama) + LoginPage redirect bila sudah terautentikasi
(hormati mustChangePassword → /force-change-password). AuthContext
tidak diubah (293/300). Tes baru 4 (total 535). **TERVERIFIKASI LIVE
2026-11-20 21:01–21:03 WIB (ADM-001, Push #16) — 5/5 langkah LULUS:**
login → /admin; reload di /admin → "Memulihkan sesi…" lalu TETAP di
/admin tanpa login ulang; buka /login saat sesi aktif → kembali ke
/admin; logout → /login, reload tetap di /login; tab baru tetap minta
login. → Done.

**Verifikasi pusat (ronde 3 + FAT-280 + perbaikan):** tsc 0,
tes 535/535, build OK, checker 0 FAIL / 32 WARN, 409 file.
**E31 SELESAI SELURUHNYA** — 16/16 tiket Done (audit + P0–P3).
Arah lanjutan dicatat sebagai E32 (lihat docs/LINEAR.md §8).

Dokumen: `AUDIT.md` §49 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v38.

## 50. FAT-289 — Panel konsumsi refresh token terpisah (follow-up FAT-280)

Perintah Fathur 2026-11-20 21:17 WIB: target seperti Opsi B, backend
dikerjakan di tempat lain, panel bagian Muse. Backend belum live saat
implementasi (OpenAPI masih kontrak lama `{token}`; belum ada tiket
backend refresh token di Linear) — implementasi panel dibuat kompatibel
mundur.

**Implementasi (subagent, selesai lokal ~21:22 WIB):** skema
LoginResponse + RefreshResponse terima `refresh_token` opsional (+
`refresh_expires_in`); transport.ts menyimpan refresh token di
sessionStorage (kunci `iiot-oee-refresh-token`, write-through seperti
FAT-280; 521→574, keras 600 aman); login() menangkap refresh_token
bila ada (dan menghapus yang basi bila backend lama tidak mengirim);
refreshSession() memakai refresh token bila ada, fallback access token
— alur identik hari ini terhadap backend lama; rotasi disimpan; 401
menghapus kedua token (tiga lapis, idempotent); shouldRestoreAtBoot()
true bila salah satu token tersimpan; restore menghidrasi keduanya;
AuthContext TIDAK diubah (292/300). Tes baru 11 (5 restore + 6 auth,
port stub segar 3063–3070).
**Koreksi parent (penting):** subagen mengirim refresh token dalam
field BARU `{refresh_token}` — dikembalikan ke field `{token}` yang
SAMA sesuai kontrak OpenAPI live (endpoint /auth/refresh hanya
mengenal `{token}`; field tak dikenal bisa ditolak 400 bila body
STRICT). Asumsi: server membedakan access vs refresh token dari
nilainya. Bila backend ternyata memakai field `{refresh_token}`
sendiri, satu baris di refreshSession() yang diubah — dicatat sebagai
pertanyaan terbuka untuk agen backend. TIDAK ada credentials:include
(varian cookie httpOnly = follow-up terpisah).

**Verifikasi pusat:** tsc 0, tes 546/546, build OK, checker 0 FAIL /
32 WARN, 410 file. **Verifikasi live MENUNGGU backend live** — sampai
backend mengirim refresh_token, panel berperilaku persis seperti hari
ini.

Dokumen: `AUDIT.md` §50 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v39.

## 51. E33 — Pisahkan Audit Trail dari Operational Events (Opsi 3, arsitektur 3 store)

Keputusan Fathur 2026-11-21: Opsi 3 dari analisis
`~/workspace/audit-vs-operational-events-analysis.md` (audit vs
operational events: satu tipe `AuditLogItem = OperationalEvent`, satu
enum 32 nilai, `/system/audit` = alias feed operasional, kolom ack
memutasi baris audit, demo dua store vs live satu tabel).

**Tiket (Linear, dibuat 2026-11-21, semua Todo):** epic E33 FAT-290 +
P33.1 FAT-291, P33.2 FAT-292, P33.3 FAT-293, P33.4 FAT-294 (panel);
B33.1 FAT-295, B33.2 FAT-296, B33.3 FAT-297, B33.4 FAT-298 (backend,
agen lain); D33.1 FAT-299 (ADR + kriteria selesai). P33.4 bergantung
pada B33.1/B33.2. R-18/R-19 (terbuka sejak 18 Nov) dijawab di B33.1.

**Target (ISA-18.2 + 21 CFR Part 11 §11.10(e)):** (1) Alarm & Event
journal stateful + ack + rtn-unacknowledged; (2) Audit trail
append-only who/what/when/why + old→new, tanpa jalur update/delete;
(3) IAM audit sudah terpisah — biarkan.

**Verifikasi hitungan Linear 2026-11-21** (list 232 + 57 get_issue
susulan — list_issues melewatkan FAT-7, FAT-27–31, FAT-71–121): total
289 = 258 Done / 21 Todo / 1 In Progress (hanya FAT-28) / 8 In Review /
1 Canceled. Koreksi: FAT-34 (E10) + FAT-40 ternyata sudah Done.
Pasca-E33: total 299 (258 Done / 31 Todo / 1 In Progress / 8 In Review /
1 Canceled). Seed v40.

Dokumen: `AUDIT.md` §51 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v40.

## 52. E33 — Implementasi panel P33.1–P33.3 (FAT-291–293)

Perintah Fathur 2026-11-21 07:50 WIB: mulai kerjakan bagian admin-panel
E33. P33.4 (FAT-294) TIDAK dikerjakan — menunggu backend B33.1/B33.2 live.

**P33.1 (FAT-291) — AuditTrailPage arsip murni** (1 file):
`AuditTrailPage.tsx` 327→315. Kolom Acknowledgment DIHAPUS (keputusan
parent, dicatat di komentar tiket: ack sudah tercatat sebagai entri
`OPERATIONAL_EVENT_ACKNOWLEDGED` di feed yang sama; state ack yang bisa
berubah di halaman arsip bertentangan dengan append-only). Subjudul jujur:
"System Audit — alias feed operasional (ADMIN + LAN)... Audit trail
terpisah sedang dibangun (E33)." Tautan silang "Lihat Operational Events"
→ /admin/audit. Export/filter/pagination/gerbang tidak berubah. Bonus
kecil: sel Timestamp kini pakai `formatDateTime` (dulu `toLocaleString`).

**P33.2 (FAT-292) — OperationalEventsPage daftar kerja + rtn-unacknowledged**
(4 file): helper baru `eventAckState.ts` + 10 tes (`getEventAckState`:
acked / active-unack / rtn-unack — rtn-unack hanya untuk `DEVICE_OFFLINE`
yang sudah diikuti `DEVICE_ONLINE` device sama dengan recorded_at lebih
baru); kolom Ack: "Belum Ack" (warning) vs "Clear — belum di-ack" (neutral);
subjudul tanpa kata "audit"; tautan silang ke /admin/system-audit. Derivasi
best-effort dalam jendela halaman yang dimuat; state server-side eksak
butuh B33.4 (FAT-298). Catatan: badge lama berbunyi "Pending Ack" —
diselaraskan jadi "Belum Ack".

**P33.3 (FAT-293) — Demo satu store** (7 file + perbaikan parent):
`INITIAL_AUDIT_LOGS` (aud-001/002/003) pindah verbatim ke
`INITIAL_OPERATIONAL_EVENTS`; `store.auditLogs` dihapus; `addAudit()`
(signature sama, ~20 pemanggil tak berubah) kini unshift ke
`operationalEvents`; `getSystemAuditPage`/`getAuditLogs`/export demo
membaca store yang sama; snapshot/restore diperbarui. **Perbaikan parent
(dedup):** bind/unbind di demo/machines.ts sempat menulis DUA entri
(addAudit + addOperationalEvent, tipe sama) ke satu store — addAudit di
kedua situs itu dihapus, tinggal addOperationalEvent (SATU entri per aksi,
seperti live); addAudit CREATE_MACHINE dipertahankan (satu-satunya catatan
pembuatan mesin); tes bind +2 → +1.

**Verifikasi pusat:** tsc 0, tes 556/556, build OK, checker 0 FAIL /
33 WARN, 412 file. WARN baru (+1): `seeds/monitoring.ts` 526/500 (lunak)
akibat pemindahan 3 entri seed — diterima, bukan FAIL. Verifikasi live
(cek visual kedua halaman) menyusul.

Dokumen: `AUDIT.md` §52 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v41.

## 53. E33 — Verifikasi visual live P33.1–P33.3 (FAT-291–293) — SEMUA LOLOS

Verifikasi visual live 2026-11-21 09:55–10:01 WIB (ADM-001, deploy 690ff55,
Push #18). Tidak ada data diubah (tidak ada ack, tidak ada submit; filter
sementara direset).

**P33.1 (FAT-291) — LOLOS semua:** subjudul baru tampil persis
("System Audit — alias feed operasional (ADMIN + LAN)..."); kolom
Acknowledgment TIDAK ada (kolom: Timestamp, Event & Perangkat, Trigger &
WO, Detail); tautan "Lihat Operational Events" → /admin/audit berfungsi.
Tidak ada cacat visual di halaman ini.

**P33.2 (FAT-292) — LOLOS semua:** subjudul baru tampil persis (tanpa
kata "audit"); tautan "Lihat Audit Trail →" berfungsi; badge "Belum Ack"
(amber) tampil. **Badge "Clear — belum di-ack" (netral) TERBUKTI tampil:**
pasangan OFFLINE 20 Nov 16.53 → ONLINE 16.54 (STM32-OEE-SIM, halaman 3,
tampilan TANPA filter) menampilkan badge Clear; pasangan lain di halaman
yang sama juga Clear (OFFLINE 16.08 → ONLINE 16.52/16.53/16.54; OFFLINE
14.21 → ONLINE 14.42). Kontrol: OFFLINE 17.21 tetap "Belum Ack" karena
ONLINE lebih barunya ada di halaman 1 — konsisten dengan aturan strict
"ONLINE lebih baru" + derivasi best-effort dalam halaman yang dimuat.

**Catatan penting (bukan bug, sudah didokumentasikan):** pada putaran
pertama, tampilan TERFILTER (Event Type = DEVICE_OFFLINE saja) menunjukkan
semua OFFLINE sebagai "Belum Ack" — wajar, karena filter server-side
menghilangkan event ONLINE dari daftar yang dimuat, jadi derivasi tidak
punya pasangan. State rtn-unacknowledged yang eksak lintas halaman/filter
butuh backend B33.4 (FAT-298).

**P33.3 (FAT-293):** verifikasi visual live TIDAK BERLAKU — deploy live
berjalan mode Real, sedangkan P33.3 mengubah store demo (tidak ada
permukaan demo di live). Bukti: tsc 0, tes 556/556 (termasuk tes dedup
bind/unbind), build OK, checker 0 FAIL.

**Cacat visual baru (di luar E33, belum diperbaiki):** di satu-satunya
baris yang sudah di-ack (SECURITY_REJECTION 19 Nov 16.20), catatan ack
miring menumpuk dengan isi JSON panjang di kolom Pesan — kolom Pesan
menampilkan JSON mentah tanpa pembungkusan kata (`break-words`), jadi teks
panjang tanpa spasi meluber ke kolom Acknowledgment. Perbaikan: tambah
`break-words` (dan pertimbangkan pemotongan) pada sel Pesan di
`useOperationalEventColumns.tsx` — menunggu perintah Fathur.

**Status tiket:** FAT-291/292/293 → Done (komentar bukti di Linear).
Sisa E33: P33.4 (FAT-294, Todo — tunggu backend B33.1/B33.2) + backend
FAT-295–298 + D33.1 FAT-299.

Dokumen: `AUDIT.md` §53 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v42.

## 54. Perbaikan overlap kolom Pesan — Operational Events (follow-up verifikasi E33)

Temuan verifikasi visual live 2026-11-21 (§53): di baris yang sudah
di-ack, catatan ack miring menumpuk dengan isi JSON panjang di kolom
Pesan — kolom Pesan menampilkan JSON mentah tanpa pembungkusan kata, jadi
teks panjang tanpa spasi meluber ke kolom Acknowledgment.

**Perbaikan (satu baris, CSS saja):** `break-words` pada sel Pesan di
`src/features/monitoring/hooks/useOperationalEventColumns.tsx` — JSON
panjang kini membungkus dalam lebar kolom (`max-w-md`), tidak lagi
meluber. Tidak ada perubahan data, logika, atau kolom lain.

**Verifikasi pusat:** tsc 0, tes 556/556, build OK, checker 0 FAIL /
33 WARN, 412 file. Verifikasi visual live menyusul setelah deploy.

**Catatan arah (pengingat Fathur 2026-11-21 10:05 WIB):** target
pengembangan tetap **Opsi 3 — Arsitektur (jangka panjang, sesuai
industri)**. Yang Done baru irisan panel (P33.1–P33.3); epic E33
(FAT-290) tetap terbuka sampai arsitektur 3 store utuh: P33.4 (FAT-294,
panel konsumsi kontrak baru — tunggu backend B33.1/B33.2) + backend
B33.1–B33.4 (FAT-295–298) + D33.1 ADR (FAT-299). Perbaikan kecil ini
tidak mengubah arah itu.

Dokumen: `AUDIT.md` §54 (file ini).

## 55. E33 — Keputusan rancangan halaman Opsi 3 + tiket P33.5–P33.7 (FAT-300–302)

Keputusan Fathur 2026-11-21 10:20 WIB: **setuju semua rancangan**
analisis halaman (`~/workspace/analisis-halaman-opsi-3.md`) — 3 halaman
(Alarm & Event / Audit Trail / Audit IAM), Audit IAM naik jadi halaman
penuh, ganti nama "Operational Events" → "Alarm & Event" + rute kanonik
`/audit` → `/admin/alarms`, mulai tahap A–C (panel saja) sekarang.

Tiket baru di bawah epic E33 (FAT-290), semua Todo saat dibuat:

- **P33.5 (FAT-300, Medium)** — tahap A: halaman Alarm & Event, 2 tampilan
  (Perlu Tindakan / Riwayat) + filter State. → In Progress.
- **P33.6 (FAT-301, Medium)** — tahap B: Audit IAM jadi halaman penuh
  `/admin/iam-audit` + export CSV + paging server-side + pintasan DENY.
  → In Progress.
- **P33.7 (FAT-302, Low)** — tahap C: rute kanonik + redirect + tautan
  silang 3 halaman + nama sidebar. Tetap Todo — bergantung P33.5/P33.6.

Pelaksanaan: P33.5 + P33.6 paralel (2 subagen), P33.7 setelah keduanya
oleh parent; verifikasi pusat + push + verifikasi visual live menyusul.

Dokumen: `AUDIT.md` §55 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v43 (total 302 = 262 Done / 31 Todo /
3 In Progress / 4 In Review / 1 Canceled).

## 56. E33 — Implementasi panel tahap A–C analisis halaman Opsi 3 (FAT-300–302)

Keputusan Fathur 2026-11-21 10:20 WIB: setuju semua rancangan analisis
halaman (`~/workspace/analisis-halaman-opsi-3.md`). Implementasi panel
tahap A–C selesai lokal 2026-11-21 ~10:35 WIB (P33.5 + P33.6 paralel
oleh 2 subagen + P33.7 oleh parent).

**P33.5 (FAT-300) — Alarm & Event, 2 tampilan + filter State:**
`eventView.ts` baru (helper murni) + `OperationalEventViewTabs.tsx`
baru + `eventView.test.ts` (13 tes baru); `OperationalEventsPage.tsx`
(state `view` default `'action'`, query `acknowledged=false` di tab
Perlu Tindakan) + `OperationalEventsFilters.tsx` (Filter State
menggantikan Ack Status — superset-nya). Sort tampilan aksi: aktif dulu,
lalu clear, terbaru dulu per kelompok. Derivasi rtn-unack selalu memakai
daftar halaman PENUH sebagai referensi (pasangan OFFLINE→ONLINE tidak
hilang saat penyaringan). **Kejujuran angka:** tidak ada query COUNT(*)
total di backend — jumlah tab adalah batas bawah ("12+") kecuali halaman
1 tanpa halaman berikut; didokumentasikan di `eventView.ts`.
Tidak dibuat: pintasan "hanya yang butuh saya" yang bisa dibagikan lewat
URL (tab itu sendiri adalah pintasannya; tampilan aktif tidak tercermin
di URL — tugas kecil terpisah bila diminta).

**P33.6 (FAT-301) — Audit IAM jadi halaman penuh `/admin/iam-audit`:**
`IamAuditPage.tsx` + `useIamAudit.ts` + `IamAuditFilterBar.tsx` +
`IamAuditTable.tsx` + `iamAudit.ts` + `iamAudit.test.ts` (6 tes baru)
baru; `AuditTab.tsx` DIHAPUS (diganti komponen baru, kolom/filter
dipindah verbatim); `AccessControlPage.tsx` (tab dihapus → tautan
"Lihat Audit IAM →"); `useIamData.ts` (berhenti memuat keputusan audit);
`Router.tsx` + `Sidebar.tsx` ("Audit IAM", ikon ScrollText) +
`Breadcrumbs.tsx` + `serialization.ts` (`formatIamAuditExportRows`).
Baru: export CSV, pintasan "Hanya DENY", filter teks Resource/Action,
Subjek jadi tautan deep-link inspector
(`/admin/access-control?tab=inspector&operator=<subject>`).
**Limitasi jujur:** paginasi adalah CLIENT-SIDE (irisan 25 baris dari
daftar yang dimuat, default limit 100) — `GET /access-control/audit`
hanya mendukung subject/decision/mode/from/to/limit, tanpa
cursor/offset. Paging server-side butuh perubahan kontrak backend (di
luar B33.x; belum ditiketkan).

**P33.7 (FAT-302) — rute kanonik + redirect + tautan silang + nama
sidebar (oleh parent):** rute kanonik `/admin/alarms`;
redirect → `/admin/alarms` dari `/audit`, `/admin/audit`,
`/monitoring/events`, `/events`; `/admin/system-audit` kanonik,
`/system-audit` + `/admin/system/audit` redirect ke sana; sidebar
"Operational Events" → "Alarm & Event" (`/admin/alarms`); breadcrumb
`audit`/`events`/`alarms` → "Alarm & Event"; judul h1 halaman →
"Alarm & Event"; tautan silang lengkap di ketiga halaman (Alarm & Event
↔ Audit Trail ↔ Audit IAM); tautan Overview "Semua Event →" dan catatan
MachineBindModal diperbarui ke nama baru.

**Verifikasi pusat:** tsc 0, tes 575/575 (556 + 13 P33.5 + 6 P33.6),
build OK, checker 0 FAIL / 35 WARN, 420 file. WARN baru (+2, lunak,
di bawah batas keras): `useIamAudit.ts` 159/150, `serialization.ts`
311/300 — diterima per prinsip 0. Verifikasi visual live menyusul
setelah push.

Dokumen: `AUDIT.md` §56 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v44.

## 57. E33 — Verifikasi visual live P33.5–P33.7 + spec kebutuhan backend (FAT-303)

**Verifikasi visual live 2026-11-21 10:33–10:35 WIB** (ADM-001, deploy
`7c53435`, browser task, tanpa perubahan data): ketiga halaman + redirect
**lolos**. Alarm & Event: sidebar + h1 "Alarm & Event"; tab "Perlu
Tindakan 50+" (default) + "Riwayat 50+"; filter State 3 opsi di Perlu
Tindakan, 4 opsi di Riwayat; tautan silang ke Audit Trail + Audit IAM
berfungsi. Audit IAM: tabel, filter, Export CSV, "Hanya DENY" (4 baris
DENY, OPR-1001), paginasi 25/halaman (halaman 2 tampil), tab Audit di
Hak Akses hilang, tautan "Lihat Audit IAM →" berfungsi. Redirect:
`/audit` → `/admin/alarms`, `/admin/audit` → `/admin/alarms`,
`/system-audit` → `/admin/system-audit`. Audit Trail: tautan silang
keduanya berfungsi.
Catatan: State="Sudah ack" mengembalikan 0 baris di jendela 7 dan 90
hari — mekanik tab/filter bekerja, baris ack belum bisa dikonfirmasi
visual karena tidak ada datanya. FAT-300/301/302 → **Done**.

**Cacat backend terbukti live (bukan panel):** semua sel Waktu Audit IAM
menampilkan "01 Jan 1970, 07.00". Akar dilacak ke kode: mapper panel
`mapIamAuditDecision` memakai `iso(pick(r.timestamp, r.created_at,
r.createdAt))` dan `iso()` hanya menerima string ISO tidak kosong — bila
field tidak ada ATAU berupa angka, panel jatuh ke `new Date(0)`.
Jadi backend tidak mengirim timestamp ISO (atau mengirim angka); skema
respons 200 `GET /access-control/audit` di OpenAPI live juga kosong
(`{}`).

**Spec kebutuhan backend** (perintah Fathur 10:35 WIB, setelah tugas
selesai): `docs/BACKEND_REQUIREMENTS_E33_PAGES.md` (~26 KB) — kontrak
lengkap dengan payload untuk backend menyesuaikan mengikuti admin-panel:
§1 B33.1 kategori + R-18/R-19 (FAT-295), §2 B33.2 store audit append-only
+ `GET /system/audit-trail` (FAT-296), §3 B33.3 ack → entri audit baru
(FAT-297), §4 B33.4 `alarmState` server-side + `totalCount` asli
(FAT-298), §5 B33.5 IAM audit timestamp + paging (tiket baru **FAT-303**,
High), §6 kontrak umum, §7 cara panel memverifikasi, §8 daftar tugas.
Urutan disarankan: §5 dulu (cacat live) → §1 → §2 → §3 → §4.

Dokumen: `AUDIT.md` §57 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v45.

## 58. E33 — P33.8: filter Event Type per halaman mengikuti keluarga Opsi 3 (FAT-304)

Temuan Fathur 2026-11-21 10:44 WIB setelah P33.5–P33.7 Done: filter
"Event Type" masih menampilkan daftar yang SAMA PERSIS di halaman Alarm
& Event dan di halaman Audit Trail — keduanya memakai daftar penuh 32
nilai `OPERATIONAL_EVENT_TYPES`. Padahal tiap halaman adalah satu store
(Opsi 3) dan analisis halaman sudah menuliskan arahnya (filter
event_type di halaman Audit hanya menampilkan keluarga sistem).

Perbaikan (panel saja, tanpa backend — pemetaan statis dari enum):
- Baru `eventCategory.ts` + `eventCategory.test.ts` (5 tes): pemetaan
  tiap `event_type` ke `'operational' | 'system'`, SAMA PERSIS dengan
  tabel §1 `docs/BACKEND_REQUIREMENTS_E33_PAGES.md` — operasional 14
  eksplisit + pola `DEVICE_EVENT_<n>`; sistem 18 eksplisit (termasuk
  `OPERATIONAL_EVENT_ACKNOWLEDGED` + `SECURITY_REJECTION`) + pola
  `COMMAND_*_DISPATCHED` + `MQTT_ADMIN_*`. Nilai tak dikenal jatuh ke
  `system` (lebih aman tampil di arsip audit).
- Alarm & Event: dropdown Event Type hanya menawarkan keluarga
  operasional (14 nilai + 'Semua').
- Audit Trail: dropdown Event Type hanya menawarkan keluarga sistem
  (18 nilai + 'Semua').
- Opsi 'Semua' tetap ada di kedua halaman — feed hari ini masih
  tercampur sampai B33.1 live; dropdown hanya membatasi pilihan filter,
  bukan isi daftar. Halaman History gabungan tidak diubah (bukan salah
  satu dari 3 store); pemisahan data server-side tetap tugas backend
  B33.1 (FAT-295).

**Verifikasi pusat:** tsc 0, tes 580/580 (575 + 5 baru), build OK,
checker 0 FAIL / 35 WARN, 422 file. Verifikasi visual live menyusul
setelah push.

Dokumen: `AUDIT.md` §58 (file ini), `docs/LINEAR.md` §8,
`docs/linear-seed.json` v46.

**Verifikasi visual live 2026-11-21 10:53–10:54 WIB** (ADM-001, deploy
`e7dade1`, browser task, tanpa perubahan data): **lolos**.
Dropdown Alarm & Event tepat 15 opsi (ALL + 14 tipe operasional), tanpa
satu pun tipe sistem; pilih DEVICE_OFFLINE → 11 baris, semua
DEVICE_OFFLINE (tab "Perlu Tindakan 11", "Riwayat 11"). Dropdown Audit
Trail tepat 19 opsi (Semua Event Type + 18 tipe sistem), tanpa satu pun
tipe operasional; pilih OPERATOR_PROVISIONED → 3 baris, semua catatan
pembuatan operator. Catatan: opsi "semua" di Alarm berlabel "ALL" (bukan
"Semua") — kosmetik, sudah begitu sejak sebelum P33.8. Satu kejadian
transien: navigasi langsung ke /admin/alarms setelah login pertama
sempat menampilkan "Memulihkan sesi…" lalu kembali ke /login; login
kedua + navigasi lewat sidebar berjalan normal — bukan cacat halaman,
dicatat sebagai observasi. FAT-304 → **Done**.

---

## §59 — FAT-306: Analytics/Telemetry — mesin default hardcode CNC-MILLING-01 (2026-11-23)

**Temuan (audit end-to-end 2026-11-23, `~/workspace/audit-end-to-end-2026-11-23.md` §5):**
halaman Analytics (`/analytics`) gagal memuat ringkasan OEE, timeline,
dan tabel Per Jam ("Gagal memuat ringkasan OEE", "Gagal memuat timeline",
"Gagal memuat data"); rollup 0/0/0; Telemetry 0 semua. Panel mengirim
`machine_id=CNC-MILLING-01` (hardcode) padahal mesin live adalah
`CNC-MILLING-SIM`.

**Diagnostik live (ADM-001, 23 Nov 09:32–09:35 WIB, read-only):**
- Diagnostik #1 (pilih CNC-MILLING-SIM lewat dropdown + Refresh) tidak
  meyakinkan: pemilih menampilkan CNC-MILLING-SIM sebagai satu-satunya
  opsi, tetapi judul halaman tetap menyebut CNC-MILLING-01 — filter
  kemungkinan tidak pernah berubah (memilih opsi yang sudah tampil tidak
  memicu perubahan; `value` select tetap CNC-MILLING-01 sementara opsi
  yang dirender hanya SIM). Data CNC-MILLING-SIM terbukti ADA di backend
  (tab Rollup Telemetry: CNC-MILLING-SIM OEE 0,02%, 29.805 sampel).
- Diagnostik #2 (URL langsung `/analytics?machine_id=CNC-MILLING-SIM`,
  param dibaca `historyParams`): **TERBUKTI — mesin adalah penyebabnya.**
  Ketiga error hilang: ringkasan termuat (OEE 1,7%, Availability 1,7%,
  Performance 91,8%, Quality 91,8%, 24.590 good / 0 defect, 7 hari),
  timeline termuat (bucket 5m, mostly UNCONFIGURED, blok UNPLANNED_DOWNTIME
  ~22 Nov, segmen 23:44–23:49 READY, downtime ID:3 81 jam 49 mnt),
  tabel Per Jam termuat (08:00 OEE 17,89%, 07:00 33,31%, 06:00 42,76%),
  rollup berisi nilai nyata. Tidak ada lagi "CNC-MILLING-01" di halaman.
  Judul memakai nama tampilan mesin ("Milling 5-Axis CNC (Simulation)")
  bila mesinnya ada di master data, ID mentah bila tidak — itu yang
  menjelaskan selisih label pada diagnostik #1.

**Perbaikan (panel saja):**
- BARU `resolveDefaultMachineId(machines, devices)` di
  `src/features/shared/utils/defaultDevice.ts` — mesin terikat device
  ONLINE pertama, lalu mesin pertama, lalu `undefined`; fungsi murni.
  Pola cermin FAT-170 untuk device.
- `useOeeAnalyticsBase.ts`: default `machineId: 'CNC-MILLING-01'` dihapus
  dari `useHistoryFilters`; `selectedMachine = filters.machineId ||
  resolveDefaultMachineId(machines, devices) || ''`. URL `?machine_id=…`
  tetap menang. Demo tidak berubah (seed: CNC-MILLING-01 terikat
  STM32-OEE-01 online urutan pertama → default demo tetap).
- Telemetry (butir c tiket): tidak ada perubahan — halaman Telemetry
  sudah memakai default device dari daftar live (FAT-170,
  `resolveDefaultDeviceId`) dan tidak punya default mesin hardcode;
  label mesin di Telemetry berasal dari baris rollup API, bukan default
  panel. Terverifikasi: rollup Telemetry menampilkan CNC-MILLING-SIM
  dengan data nyata.
- Tes BARU `src/features/shared/utils/defaultDevice.test.ts` (1 tes,
  5 asersi: online-bound, fallback pertama, kosong/null, seed demo,
  offline-bound tidak didahulukan).

**Verifikasi pusat:** tsc 0, tes 581/581 (580 + 1 baru), build OK,
checker 0 FAIL / 35 WARN, 423 file. Verifikasi visual live menyusul
setelah push (deploy Vercel) — halaman Analytics dengan filter default
harus menampilkan ringkasan/timeline/Per Jam untuk CNC-MILLING-SIM tanpa
error. FAT-306 tetap In Progress sampai verifikasi live.

**Observasi sampingan (di luar lingkup FAT-306, dicatat untuk tindak
lanjut — angka-angka ini dari backend, bukan mapper panel):**
- Ringkasan Quality 91,8% padahal 0 defect (24.590 good / 0 defect) —
  seharusnya 100%; Performance juga 91,8% (angka yang sama).
- Baris Per Jam: Performance 6.626,98% / 9.515,87% / 8.222,22% (parts
  4.175–5.995 vs target 63) dan OP/RUN 3.147 jam dalam satu bucket jam —
  agregasi backend yang tampak tidak wajar.
- Kolom TANGGAL pada rollup Per Hari menampilkan "CNC-MILLING-SIM"
  (bukan tanggal) pada tampilan yang diekstrak — perlu dicek saat
  verifikasi live, apakah cacat tampil atau artefak ekstraksi.

## §60 — Sweep Linear 2026-11-23: FAT-306 + P30.3 Done live; FAT-307 rollup TANGGAL (2026-11-23)

**Push #24** `3af26eaf` 2026-11-23 ~09:52 WIB (FAT-306 + AUDIT.md §59 +
LINEAR.md + seed v48) — disetujui Fathur ("Ya, push sekarang").

**Verifikasi visual live 2026-11-23 10:07–10:08 WIB (ADM-001, browser,
URL bersih, deploy 3af26eaf) — FAT-306 LULOS 5/6:**
- (a) Mesin default = CNC-MILLING-SIM ("CNC-MILLING-SIM · Milling 5-Axis
  CNC (Simulation)"; header "7 hari terakhir · Mesin CNC-MILLING-SIM").
- (b) Ringkasan termuat, 0× "Gagal memuat": OEE 1,7%, Availability 1,7%
  (Run 1m / Operating 230m), Performance 91,8% (Target/Jam 63 pcs),
  Quality 91,8% (24.590 good / 0 defect).
- (c) Timeline termuat (mis. "Segmen 23:42–23:47 READY",
  "23:47–09:12 UNPLANNED_DOWNTIME"; sisanya UNCONFIGURED 5m).
- (d) Per Jam termuat (08:00 OEE 17,89%, 07:00 33,31%, 06:00 42,76%).
- (e) "CNC-MILLING-01" 0 kemunculan; "CNC-MILLING-SIM" 8×.
- (f) GAGAL — rollup Per Hari (Shift): kolom TANGGAL menampilkan
  "CNC-MILLING-SIM" di ketiga baris (bukan tanggal). Bukan artefak
  ekstraksi — cacat tampil nyata, dipisah ke FAT-307.
- FAT-306 → **Done** (komentar bukti Linear). Observasi angka backend
  dari §59 terkonfirmasi ulang: Per Jam 23:00 Performance 6.626,67%,
  Quality 2,83%, OEE 187,39% — agregasi backend di luar lingkup panel.

**FAT-307 (baru, Medium, standalone) — Rollup Per Hari: kolom TANGGAL
menampilkan ID mesin:**
- Akar masalah PANEL (terbukti di kode): `mapRollup`
  (`src/services/api/http/mappers/monitoring-telemetry.ts:177`) memilih
  groupKey dengan urutan pick `groupKey → lineId → machineId → deviceId →
  bucket` tanpa memperhatikan groupBy. Untuk groupBy=day server mengirim
  `bucket` (tanggal) DAN `machineId`; machineId menang. `OeeRollupTable`
  merender `row.groupKey` sebagai kolom pertama untuk groupBy=day.
  Kontrak server sudah benar (OpenAPI live 2026-11-23:
  GET /telemetry/rollup mengembalikan `bucket` + `groupBy` per baris).
- Perbaikan (lokal, belum push): groupKey dipilih mengikuti groupBy —
  day/month → `bucket` dulu; machine → `machineId`; line → `lineId`.
- Tes BARU `src/services/api/http/mappers/monitoring-telemetry.test.ts`
  (5 tes: day→bucket, month→bucket, machine→machineId, line→lineId,
  day tanpa bucket jatuh ke machineId) — lolos 5/5. tsc 0.
  FAT-307 In Progress; menunggu pusat verifikasi penuh + push +
  verifikasi visual live.

**P30.3 (FAT-256) → Done — verifikasi visual live 10:07–10:08 WIB:**
panel stasiun tak dikenal tampil sebagai "Diagnostik Terminal — Stasiun
Tak Terdaftar" ("Terminal HMI yang mencoba mengirim data tanpa terdaftar
di registry (event SECURITY_REJECTION, device_id null, station_label
mentah)..."); empty state "Tidak ada terminal tak dikenal yang mencoba
mengirim data."; frasa "perangkat tak dikenal" 0×.
**P30.1 (FAT-254) + P30.2 (FAT-255) tetap In Review (verifikasi
sebagian):** kolom JENIS ada + badge "Edge device" untuk STM32-OEE-SIM
terbukti; catatan dua kelas ID di modal registrasi terbukti verbatim.
Yang belum teramati live: badge "Terminal" (tidak ada baris STATION-/
KIOSK- di data live) dan ringkasan commissioning (hanya muncul SETELAH
registrasi sukses — `StationRegisterModal.tsx:31,65`; cek baca-saja
tidak bisa mencapainya). Keduanya menunggu FAT-236 AC1 (registrasi
ADMIN-CONSOLE-01). Catatan: isi modal menyebut server "HANYA menerima
ID berpola STM32- ... sampai backend diperbaiki (FAT-237 / B30.1)" —
FAT-237 kini Done, jadi catatan itu mungkin sudah basi; AC1 akan
membuktikannya.

**Sweep Linear 2026-11-23 (perintah Fathur 09:52 WIB):** daftar lengkap
via list_issues includeArchived + paginasi = **302 issue (267 Done /
21 Todo / 2 In Progress / 11 In Review / 1 Canceled)**. Seed v48 yang
ikut Push #24 SALAH hitung (total 306, In Review 3) — koreksi jadi
seed v49 di push berikutnya. Terbuka 34. DITUTUP: FAT-211 (E24; anak
FAT-212 + FAT-213 Done) dan FAT-226 (E26; anak FAT-227/228/229/230
Done) — komentar bukti dipasang. Pelajaran alat: `save_issue` memakai
field `state`, bukan `status` (`status` diabaikan diam-diam, ok:true
tetapi tidak berubah). FAT-237 + FAT-231 ternyata sudah Done.
Tidak ditutup: epik E33 (FAT-290) + E30 (FAT-248) + E25 (FAT-214, anak
FAT-247 gapless menunggu keputusan Fathur) + FAT-7; B33.1–B33.4
(FAT-295–298, In Review, milik agen lain); H30.1–H30.4 (FAT-249–252,
In Review, HMI); D30.1 (FAT-260, menunggu keputusan Fathur); H30.5
(FAT-253, tugas fisik Fathur); SYS-B (FAT-71/74/77/83, backend); FAT-28
(In Progress, sisa 403 role-gate butuh login OPERATOR); FAT-29
(keputusan deploy Nginx vs Vercel); FAT-30 (tes LAN); FAT-31
(verifikasi visual, Fathur). Berjalan: implementasi P33.4 (FAT-294) +
P33.9 (FAT-305) oleh 2 subagen paralel; verifikasi live FAT-236
AC1–AC4 (browser). Antre: ADR D33.1 (FAT-299), checklist DoD FAT-27.

## §61 — D33.1 (FAT-299): ADR arsitektur 3 store (2026-11-23)

Dokumen keputusan ditulis: `docs/ADR-E33-three-store-architecture.md`
(Status Accepted — keputusan Fathur 2026-11-21 07:44 + 10:20 WIB, target
Opsi 3 diingatkan lagi 10:05 WIB). Isi: konteks pencampuran (1 tabel, 32
nilai, `/system/audit` = alias, ack memutasi audit), keputusan 3 store /
3 halaman + rute kanonik, batas Opsi 3 (enum 32 tetap; ingestion tidak
berubah; audit IAM tetap; demo tetap satu store in-memory — pemisahan
adalah kontrak Real/live), kontrak ringkas (category, alarmState,
`/system/audit-trail`, `auditEntry`, cursor IAM), jawaban R-18 (machine_id
global DIDUKUNG) / R-19 (`acknowledged` TIDAK didukung di `/system/audit`),
DoD per tiket anak, syarat tutup epic FAT-290 (semua anak Done + ketiga
store terverifikasi live end-to-end), catatan HMI/EE (HMI tidak berubah
cara kirim event; `SECURITY_REJECTION` tampil di Audit Trail; EE tidak
perlu firmware baru).
Adendum E33 ditambahkan di `docs/API_DOCUMENTATION.md` (salinan lama —
hanya adendum bertanggal, isi lama tidak diubah; sumber kebenaran kontrak:
OpenAPI live 2026-11-23 + `docs/BACKEND_REQUIREMENTS_E33_PAGES.md`).
FAT-299 → **Done** (dokumen + epic diperbarui). Epic FAT-290 tetap
terbuka — hanya ditutup setelah FAT-294 (P33.4) ditutup.

## §62 — P33.4 (FAT-294): panel konsumsi kontrak B33.1–B33.4 — category, alarmState server, totalCount/counts server, Audit Trail pindah ke GET /system/audit-trail

**Tiket:** FAT-294 (P33.4, E33 Opsi 3) — ruang lingkup diperinci komentar 2026-11-23 dari audit end-to-end (temuannya: tab "50+", badge Clear 0 baris hal. 1, dropdown vs baris tidak selaras). **Status: SELESAI LOKAL, BELUM push, BELUM verifikasi visual live.** Dikerjakan 2026-11-23 ~10:07–10:40 WIB. TIDAK ada perubahan Linear (instruksi tugas); FAT-294 → In Review 2026-11-23 (pusat verifikasi lokal hijau); Done hanya setelah push + verifikasi visual live.

**Kontrak yang dikonsumsi (sudah live, OpenAPI 2026-11-23):** `category` + `alarmState` param & field di `GET /operational-events` dan `GET /system/audit`; `pagination.totalCount` (total asli) + `pagination.counts {activeUnack, rtnUnack, acked}`; `GET /system/audit-trail` (record `id, seq, recordedAt, actor, actorRole, action, category, entityType/Id/Label, oldValue, newValue, reason, source, prevHash, hash`; pagination `totalCount, retentionDays`) + `GET /system/audit-trail/export`.

### Yang berubah (5 butir ruang lingkup)

1. **Kirim `category`.** `useOperationalEventsQuery` selalu mengirim `category=operational` (halaman Alarm & Event hanya keluarga operasional — baris sistem seperti `AUTH_TOKEN_REFRESHED` tidak lagi lolos; temuan audit §4 teratasi di sisi panel). Builder `buildOperationalEventsEndpoint` + `alarmState` param (`query.alarm_state`). `GET /system/audit` tidak lagi dipakai panel — lihat butir 4.
2. **`alarmState` server menggantikan derivasi client-side.** `OperationalEvent` kini membawa `category`, `alarm_state`, `condition` (mapper `mapOperationalEvent` membaca ketiganya; fallback hanya untuk respons backend lama: kategori → `'system'`, alarm → `'acked'` bila sudah di-ack selainnya `'active-unack'`, `condition` → null). `eventView.ts` (`filterEventsByState`, `sortActionView`) + kolom Ack (`useOperationalEventColumns`, kini tanpa param `events`) membaca `alarm_state` baris itu sendiri. **`eventAckState.ts` + tesnya DIHAPUS** — derivasi pasangan OFFLINE→ONLINE dalam halaman yang dimuat terbukti salah bila pasangan ONLINE ada di halaman lain (bukti audit: Clear 0 baris hal. 1 padahal pasangan 20 Nov 16.53→16.54 ada di halaman lama). Badge "Clear — belum di-ack" kini stabil di halaman berapapun.
3. **`totalCount`/`counts` server untuk jumlah tab.** `pageMeta` (`primitives.ts`) kini mengutamakan `totalCount`/`total_count` atas `count` (panjang halaman) — perilaku lama dipertahankan bila `totalCount` tidak ada — dan meneruskan `counts` + `retention_days`. `describeTabCounts` menerima objek `{events, pageIndex, hasMore, totalCount?, counts?}`: `counts` ada → kedua tab pasti (`action = activeUnack + rtnUnack`, `history = totalCount`); hanya `totalCount` → Riwayat pasti, Perlu Tindakan dari halaman; tanpa keduanya → hitungan halaman seperti dulu. `TabCount` mendapat flag `server` (tooltip tab membedakan "dihitung server" dari "semua hasil sudah termuat"). **Satu query tambahan ringan (limit=1) di tampilan 'action'** mengambil `counts`/`totalCount` tanpa filter tampilan `acknowledged=false` (query daftar di tampilan itu totalnya hanya mencakup yang belum di-ack — tanpa query kedua, tab Riwayat akan salah); di tampilan 'history' query daftar sudah tanpa filter tampilan sehingga tidak ada query tambahan.
4. **AuditTrailPage pindah ke `GET /system/audit-trail` — SATU alur kanonik.** `AuditTrailRecord` baru (`types/system.ts`); `AuditLogItem` kini alias record arsip (alias lama `= OperationalEvent` dihapus). Mapper baru `mapAuditTrailRecord` (`oldValue`/`newValue` dipertahankan apa adanya, termasuk null eksplisit — dibaca langsung, bukan lewat `pick` yang melewatkan null). Endpoint registry `SYSTEM_AUDIT_TRAIL` + `SYSTEM_AUDIT_TRAIL_EXPORT`; `getSystemAuditPage`/`exportSystemAuditData`/`mapAuditLog`/`buildSystemAuditExportEndpoint`/`formatSystemAuditExportRows`/`useSystemAuditQuery` **DIHAPUS** (tidak ada fallback ke `/system/audit`). Halaman menampilkan kolom baru: No. (`seq`), Timestamp, Aksi & Pelaku, Entitas, Perubahan (lama → baru), Alasan, Sumber; subjudul "alias" (P33.1) **DIHAPUS** — halaman bukan lagi alias feed operasional; retensi arsip (`pagination.retention_days`) ditampilkan bila ada. Filter Event Type (keluarga sistem) dipetakan ke param `action`; filter Mesin ke `machine_id`; ekspor ke `/system/audit-trail/export` (csv). **Kesenjangan kontrak yang ditemukan:** endpoint ekspor live TIDAK mendaftarkan `machine_id` (daftar menerimanya) — filter Mesin tidak diteruskan ke ekspor; dicatat di komentar halaman + butuh backend bila ingin selaras. Demo: store audit TERPISAH (`store.auditTrail`, seed `INITIAL_AUDIT_TRAIL` 6 record, `seq` 1–6); `addAudit` menulis ke kedua store (feed operasional + arsip, `seq` naik — cermin B33.3: ack → entri `OPERATIONAL_EVENT_ACKNOWLEDGED`); `acknowledgeOperationalEvent` demo kini juga mengubah `alarm_state` → `'acked'` (sebelumnya hanya `acknowledged`, badge akan tetap "Belum Ack"); `getAuditLogs` dialihkan ke audit-trail (limit 200).
5. **Dropdown vs baris selaras.** Setelah butir 1 + 4: baris Alarm hanya operasional (server menyaring `category=operational`), baris Audit hanya record arsip sistem (store terpisah) — dropdown sistem (18) di Audit vs baris operasional tidak lagi terjadi.

### Verifikasi (lokal, 2026-11-23)

- `npx tsc --noEmit`: **0 error**.
- `npm test` (suite penuh): **602/602 lolos** (sebelumnya 581 — +21 tes baru: `eventView.test.ts` ditulis ulang untuk state server + `counts`; `mappers/monitoring-events.test.ts` baru — 10 tes: passthrough + fallback mapper op-event & audit-trail; `primitives.test.ts` baru — 7 tes: `totalCount` diutamakan, `counts`, `retentionDays`; builder audit-trail + `category`/`alarmState` di `historicalExport.test.ts`; stub `healthAuditTransport.test.ts` ditulis ulang ke `/system/audit-trail` — asersi record arsip + `total_count`/`retention_days` + ekspor; `modeAndTransport`, `e23-batch3`, `contractAlignment` diperbarui ke nama baru).
- Batas baris checker: semua file di bawah batas keras (AuditTrailPage 382/600, demo/monitoring 494/600, seeds/monitoring 674/900, serialization 331/500).
- Catatan: komentar usang di `src/services/api/demo/iam/policies.test.ts:16` (menyebut `buildSystemAuditExportEndpoint` "yang belum ada") dibiarkan — file itu pekerjaan chat lain (P33.9) yang sedang berjalan; bukan ruang lingkup tiket ini.

### Belum terverifikasi — butuh push + live

1. **Verifikasi visual live (butuh push + redeploy Vercel):** (a) `/admin/alarms` — tab menampilkan angka pasti tanpa "+" (Perlu Tindakan = activeUnack+rtnUnack server, Riwayat = totalCount); badge "Clear — belum di-ack" tampil untuk OFFLINE 20 Nov 16.53 (pasangan ONLINE di halaman lain — inilah pembuktian derivasi server vs derivasi lama); tidak ada lagi `AUTH_TOKEN_REFRESHED` di baris Alarm. (b) `/admin/system-audit` — kolom No./Aksi & Pelaku/Entitas/Perubahan/Alasan/Sumber terisi dari store arsip; tidak ada lagi subjudul alias; ekspor CSV berisi kolom arsip. (c) Filter State (Aktif/Clear/Sudah ack) menyaring benar di kedua tampilan.
2. **Perilaku live B33.1–B33.4 (milik agen lain, FAT-295–298, In Review)** — panel kini mengonsumsinya, tetapi nilai servernya sendiri (apakah `alarmState` OFFLINE 17.21 yang ONLINE-nya di halaman lain benar `rtn-unack`; apakah `counts` cocok dengan filter yang sama) baru terbukti lewat verifikasi (1). Bila nilai server salah, itu temuan backend, bukan panel.
3. **Ekspor Audit Trail dengan filter Mesin** — sengaja tidak diteruskan (endpoint ekspor tidak menerima `machine_id`); verifikasi live: ekspor mengabaikan filter mesin — bila Fathur menganggapnya cacat, butuh tiket backend (tambahkan `machine_id` ke `GET /system/audit-trail/export`).
4. **Satu query tambahan limit=1 di tampilan 'action'** — beban tambahan satu request ringan per perubahan filter; pantau di live bila terasa (alternatif: hapus bila server kelak menghitung `counts` tanpa pengaruh `acknowledged` — tidak hari ini).

## §63 — FAT-27: checklist DoD §15 per modul (2026-11-23)

Penilaian selesai 2026-11-23 (read-only, 4 penilai paralel + verifikasi
koordinator; suite tes dijalankan: 602/602 hijau). Dokumen lengkap:
`docs/DOD-FAT-27-checklist.md` (13 modul × 14 poin, semua dengan bukti
file:baris). Ringkas: 182 sel = **89 ✓ / 63 ~ / 12 ✗ / 18 N/A** —
tidak ada satu pun modul yang memenuhi ke-14 poin. Terkuat: Work Orders
dan Downtime (10 ✓, 0 ✗). Terlemah: Access Control (4 ✓, 3 ✗) dan
MQTT/Broker (5 ✓, 3 ✗). Poin ✓ di semua modul: 11 (tanpa token/password
persisten), 13 (tanpa aktuasi, ADR-003), 14 (tanpa endpoint tak
terdaftar). Poin lemah lintas modul: 12 (uji integrasi LAN tidak ada di
modul mana pun — FAT-30 diblokir, butuh LAN; Overview tanpa satu pun file
tes), 9 (tidak ada modul yang ✓ penuh untuk dialog 409), 7 (5 modul ✗ —
tanpa React Query/`queryKey`), 1 (Zod tidak konsisten — mapper manual
dominan; ✗ penuh di Access Control dan MQTT). Yang belum terpenuhi
menjadi daftar tindak lanjut di dokumen (FAT-30; push P33.4/P33.9/
FAT-307/FAT-308; kontrak 409 backend; keputusan Fathur atas pengecualian
Public poin 6, arti `unknown` poin 4, replikasi ADMIN-immutable poin 5;
refactor mapper ke Zod + migrasi React Query).

**Kendala Linear (dicatat jujur):** FAT-27 ternyata **terarsip**
(`archivedAt` 2026-11-21 00:07 UTC) — Linear menolak komentar pada issue
terarsip ("Could not find referenced Issue", 400), dan konektor Linear
tidak menyediakan alat unarchive (`save_issue` menolak key `archived`).
Karena itu checklist TIDAK bisa dipasang sebagai komentar tiket (syarat
Done harfiah tiket) — catatannya hidup di `docs/DOD-FAT-27-checklist.md`.
FAT-27 tetap In Progress sampai di-unarchive (via UI Linear) dan komentar
dipasang, atau Fathur menerima dokumen repo sebagai catatannya. Dokumen
ini belum ikut push #25 (manifest sudah dikunci) — ikut push berikutnya.

## §64 — Verifikasi visual live Push #25 (P33.4 + FAT-307 + FAT-308) — 2026-11-23

Deploy gate: build baru (commit 220b894) live di Vercel. Verifikasi
10:44–10:47 WIB, ADM-001, read-only, 7/7 butir LOLOS: (1) tab "Perlu
Tindakan 144" tanpa "+" ("dihitung server dari seluruh data"); (2)
OFFLINE 20 Nov 2026 16.53 (DEVICE_OFFLINE, MQTT_LWT, STM32-OEE-SIM)
berlencana "Clear — belum di-ack" + tombol Ack; (3) 0×
AUTH_TOKEN_REFRESHED di 144 baris (50+50+44), filter hanya tipe
operasional; (4) Audit Trail kolom arsip NO. | TIMESTAMP | AKSI &
PELAKU | ENTITAS | PERUBAHAN (LAMA → BARU) | ALASAN | SUMBER, entri
#779–#760 hal. 1, subtitle arsip append-only, 0× kata "alias"; (5)
Export CSV terunduh 242 KB; (6) rollup Per Hari kolom TANGGAL kini
tanggal ISO ("2026-11-20T17:00:00.000Z" dst.), bukan CNC-MILLING-SIM
— catatan: ISO mentah, belum diformat tanggal lokal (kosmetik); (7)
modal Daftarkan Stasiun: catatan kuning baru menyebut server menerima
ID terminal (terbukti ADMIN-CONSOLE-01, FAT-236), klaim lama "HANYA
STM32-" hilang; modal ditutup Batal. **FAT-294, FAT-307, FAT-308 →
Done (komentar bukti dipasang).** Caveat: isi baris CSV tidak
terverifikasi (unduhan browser cloud tidak dapat dibuka dari sisi
agen); halaman 3 Alarm sempat gagal 2× (NETWORK) lalu termuat saat
retry. Temuan insidental (di luar tiket, dicek ulang terpisah):
ringkasan OEE/timeline/Per Jam sempat "Gagal memuat" dan /admin/devices
sempat berbanner "Format perangkat dari server tidak sesuai skema."
dengan 0 perangkat — /health backend saat itu 200 ×3, uptime 3307 dtk,
telemetri mengalir, jadi kemungkinan gangguan jaringan sesaat; hasil
cek ulang menyusul.

## §65 — FAT-309: getDevices gagal total bila ada baris stasiun (regresi live, pemicu registrasi ADMIN-CONSOLE-01)

Gejala live 2026-11-23 10:44–10:51 WIB (verifikasi Push #25 + cek ulang
3× percobaan): /admin/devices berbanner "Format perangkat dari server
tidak sesuai skema." + semua counter 0; /analytics ringkasan OEE +
timeline + tabel Per Jam "Gagal memuat" — sementara Rollup Per Hari
tetap termuat sebagian dan dashboard live. Bukan gangguan sesaat dan
bukan backend down (/health 200 ×3, uptime 3307 dtk, telemetri mengalir).

Akar (terbukti di kode): EdgeDeviceSchema (schemas/dto-assets.ts)
mewajibkan device_id cocok regex ^STM32-[A-Za-z0-9_-]+$; getDevices()
(http/devices.ts) = reqAllPages(DEVICES_LIST, mapDevice) — satu baris
non-STM32 melempar INVALID_RESPONSE untuk SELURUH daftar. Server
mengirim stasiun sebagai baris devices biasa. Pemicu: stasiun
ADMIN-CONSOLE-01 terdaftar live 10:12 WIB (FAT-236 AC1 — registrasi uji
oleh agen ini) = baris terminal pertama di daftar; sebelumnya daftar
hanya berisi STM32 (audit 09:17 + verifikasi FAT-306 10:07 normal).
Dampak berantai: useMasterAssetsQuery = Promise.all(getMachines +
getDevices + getProducts + getOperators) gagal total bila getDevices
gagal → masterData undefined → Analytics kehilangan data master.
Cacat LATEN sejak E27: komentar di http/stations.ts + mappers/assets.ts
sudah memperingatkan "seluruh daftar akan gagal parse bila satu stasiun
ikut terdaftar" — hanya jalur Stations yang diperbaiki (mapStation
toleran). Push #25 TIDAK bersalah (tidak menyentuh jalur ini).

Perbaikan (lokal, menunggu push): (1) http/devices.ts — mapEdgeDeviceRow
baru: baris non-STM32 dilewati (return null), stasiun tetap dilayani
getStations/mapStation; regex sama dengan EdgeDeviceSchema. (2)
http/transport.ts — reqList/reqAllPages menerima mapper nullable
(T | null) dan membuang baris null; pemanggil lama tidak berubah.
(3) Tes baru http/devices.test.ts (stub server, port segar 3071/3072):
campuran STM32 + ADMIN-CONSOLE-01 + STATION-LINI-01 → hanya 2 STM32;
hanya stasiun → []. Verifikasi pusat: tsc 0, tes 604/604, build OK,
checker 0 FAIL / 35 WARN (426 file). FAT-309 (High) → In Progress.

Port Push #26: `mapEdgeDeviceRow` + `reqList`/`reqAllPages` nullable di-port
ke struktur remote (`http/devices.ts`, `http/transport/requests.ts`); monolit
`transport.ts` lama TIDAK ikut push. Verifikasi di worktree port: tsc 25
error (sama dengan baseline pristine remote — pra-ada, lihat §66), tes 640
lolos / 15 gagal (gagal identik dengan baseline), 2/2 tes baru FAT-309 lolos,
build OK, checker 0 FAIL. Klaim "tsc 0, tes 604/604" di atas adalah verifikasi
checkout lama (struktur pra-E32), bukan struktur remote — dikoreksi di sini.

## §66 — P33.9 (FAT-305): Audit IAM memakai paging server-side (cursor + totalCount)

**Status: SELESAI, push #26, belum verifikasi visual live.**
Tiket: P33.9 (FAT-305), anak epic E33 (FAT-290 — sudah Done atas keputusan
Fathur, FAT-305 tetap terbuka terpisah). Backend B33.5 (FAT-303) sudah Done +
live: `GET /access-control/audit` mendukung `cursor` + `limit`, envelope
`{data, pagination{limit, hasMore, truncated, nextCursor, totalCount}}`,
skema 200 terdokumentasi di OpenAPI live 2026-11-23. Panel sebelumnya
paginasi client-side (ambil `limit=100`, iris 25/halaman di klien) — limitasi
yang didokumentasikan di P33.6.

### Yang diubah (11 file + 2 port)

1. `src/types/iam.ts` — `IamAuditFilters` + `cursor?: string | null`;
   tipe baru `IamAuditPage {decisions, totalCount, hasMore, nextCursor}`.
2. `src/services/api/http/iam/policies.ts` — `getIamAuditDecisions`
   mengembalikan `IamAuditPage` (PORT, lihat bawah).
3. `src/services/api/demo/iam/policies.ts` — paritas demo: cursor demo
   adalah offset berkode `iam-audit:<offset>`; cursor rusak/tanpa prefix =
   halaman pertama (defensif).
4. `src/features/system/utils/iamAudit.ts` — `paginateIamAuditDecisions`
   DIHAPUS; gantinya helper murni tumpukan cursor + `iamAuditPageCount`
   (informatif) + `formatIamAuditResultLabel` + `IAM_AUDIT_EXPORT_LIMIT = 1000`.
5. `src/features/system/hooks/useIamAudit.ts` — tulis ulang paging:
   `limit=25` per halaman; state `pageInfo {totalCount, hasMore,
   nextCursor}` + `cursorState`; `isPaging`; penjaga respons basi
   (request-seq); `reload` memuat ulang halaman aktif dengan cursor-nya.
6. `src/features/system/IamAuditPage.tsx` — `resultCount` kini
   `totalCount` server; catatan amber bila ekspor terpotong.
7. `src/features/system/components/IamAuditFilterBar.tsx` — label via
   `formatIamAuditResultLabel`; bila filter teks aktif, tampil
   `· N cocok di halaman ini`.
8. `src/features/system/components/IamAuditTable.tsx` — prop baru
   `isFetching` (tombol paging dikunci + strip "Menyinkronkan...").
9. `src/features/system/utils/iamAudit.test.ts` — 11 tes (filter 3, nama
   file CSV 1, tumpukan cursor 4, pageCount 1, label totalCount 2).
10. `src/services/api/demo/iam/policies.test.ts` (baru) — 3 tes demo.
11. `src/services/api/http/transport/requests.ts` — `reqList`/`reqAllPages`
    nullable (PORT FAT-309, lihat §65).
12. `docs/DOD-FAT-27-checklist.md` (baru) — checklist DoD §15 per modul.

### Port ke struktur remote (E32) — BUKAN salinan mentah checkout lama

Implementasi P33.9 + FAT-309 dikerjakan di checkout utama (struktur pra-E32,
HEAD 7095217); remote main sudah struktur pasca-E32 (569 file vs 471 di
checkout lama; 98 file split hanya ada di remote). Push #26 dikerjakan dari
worktree baru di origin/main 9e519c1: 9 file P33.9 disalin verbatim (diff vs
remote hanya perubahan P33.9 — diverifikasi per baris, baris yang dihapus
adalah kode lama P33.6); 1 fungsi di-port: `getIamAuditDecisions` masuk ke
`iam/policies.ts` (remote: barrel `http/iam.ts` + split `iam/roles.ts` +
`iam/policies.ts`; monolit `http/iam.ts` lama 416 baris TIDAK ikut push —
barrel tetap utuh). File-file struktur lama lainnya (`transport.ts` monolit,
`mode.ts`, `reconciliation.ts`, dsb.) TIDAK ikut push. Snapshot penuh dari
checkout lama akan menghapus 98 file remote — dilarang.

### Verifikasi (worktree Push #26, 2026-11-23)

- `npx tsc --noEmit`: 25 error — IDENTIK dengan baseline pristine
  origin/main (25 error pra-ada: rename P33.4 `SystemAuditExportQuery` /
  `exportSystemAuditData` di file split `demo/monitoring/audit.ts` + 4 tes
  `auditLogs` + 2 tes ekspor; remote main memang belum tsc-hijau — bukan
  akibat push ini, tidak memburuk).
- Tes: 640 lolos / 15 gagal — 15 gagal IDENTIK dengan baseline pristine;
  16/16 tes baru lolos (iamAudit 11 + policies demo 3 + FAT-309 2).
- Build OK (vite build). Checker 0 FAIL / 15 WARN (528 file).
- Verifikasi visual live BUTUH deploy Vercel: buka `/admin/iam-audit`
  sebagai ADM-001, cek "Menampilkan N keputusan" = total server (bukan
  25/100), Berikutnya/Sebelumnya bekerja, "Hanya DENY" + filter tetap
  bekerja, ekspor CSV mengunduh baris hasil filter; cek /admin/devices
  tampil + Analytics termuat (FAT-309).

### Keputusan desain + limitasi (dari draf P33.9)

- Paging mundur = tumpukan cursor (endpoint hanya maju via `nextCursor`).
- Perangkap `totalCount` (camelCase): `pageMeta`/`normalizeListResponse`
  hanya membaca `count`/`total_count` — `getIamAuditDecisions` membaca
  `totalCount` eksplisit dari envelope (fallback `total_count`/`count`/
  jumlah baris).
- Filter teks Resource/Action kini per halaman (server tidak punya filter
  itu); label jujur "N cocok di halaman ini".
- Ekspor CSV: satu panggilan `limit=1000` + filter server; bila masih ada
  baris di luar itu, `exportTruncated=true` + catatan amber.
- `pageCount` hanya informatif (`ceil(totalCount/25)`).

## §67 — Perbaiki 25 error tsc + 7 tes gagal (fallout rename P33.4)

**Status: SELESAI LOKAL, belum push.**
Perintah Fathur 2026-11-23 ("ya, perbaiki semua"): remote main (0a31283)
tsc 25 error + 15 baris gagal tes (7 tes unik) — semuanya pra-ada sejak
P33.4, BUKAN akibat Push #26. Akar: P33.4 mengganti nama di monolit checkout
lama (`SystemAudit` → `SystemAuditTrail`, `auditLogs` → `auditTrail` /
`operationalEvents`) tapi file-file split di remote tidak ikut diperbarui.

### Yang diperbaiki (9 file + 1 hapus)

1. `src/services/api/demo/monitoring/audit.ts` DIHAPUS — file yatim
   (orphan): tidak diimpor siapa pun; `demo/monitoring.ts` (barrel) sudah
   punya `getSystemAuditTrailPage` + `exportSystemAuditTrailData` yang
   membaca `store.auditTrail`. Fungsinya (`getSystemAuditPage` /
   `exportSystemAuditData` alias lama) sudah tidak punya pemanggil.
2. 4 file tes aset (`bindingAuthorization`, `bindingConcurrency`,
   `deviceManagement`, `machineManagement`): `store.auditLogs` →
   `store.auditTrail` (snapshot/restore + asersi "zero side-effects") —
   arsip audit kini di `auditTrail`, bukan `auditLogs` yang dihapus P33.3.
3. `deviceManagement.test.ts`: literal `OperationalEvent` DEVICE_OFFLINE
   dilengkapi `category: 'operational'`, `alarm_state: 'acked'`,
   `condition: 'ACTIVE'` (sama seperti literal identik di
   `deviceMachineBinding.test.ts`; 'acked' = sudah di-ack per aturan mapper).
4. `e23-batch3-exports.test.ts` + `endpointCoverage.test.ts`:
   `exportSystemAuditData` → `exportSystemAuditTrailData`.
5. `httpContract.test.ts`: `SYSTEM_AUDIT_EXPORT` →
   `SYSTEM_AUDIT_TRAIL_EXPORT` + path `/api/v1/system/audit-trail/export`
   (registry tetap 137 kunci).

### Verifikasi (worktree, 2026-11-23)

- `npx tsc --noEmit`: **0 error** (dari 25).
- Tes: **647 lolos / 0 gagal** (dari 640 lolos / 15 baris gagal = 7 tes unik
  — semuanya kini lolos).
- Build OK. Checker 0 FAIL / 15 WARN.
- Tidak ada perubahan perilaku panel (hanya tes + file yatim + nama endpoint
  di tes).
