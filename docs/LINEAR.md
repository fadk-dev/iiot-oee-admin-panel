# Linear — Fondasi Tracking Development IIoT OEE Admin Panel

**Repo:** `fadk-dev/iiot-oee-admin-panel`
**Linear workspace:** Fattr · **Tim:** FAT (`Fattr`, `9b78f1b6-f10f-44ed-9f68-434213b94fca`)
**Project Linear:** `IIoT OEE Admin Panel` (baru — belum ada project di workspace per 2026-11-16)
**Dokumen acuan:** `docs/API_DOCUMENTATION.md` + `docs/admin-panel/ADMIN_PANEL_DOCUMENTATION.md`
(+ file upload asli: `API_DOCUMENTATION.md` 1780 baris, `ADMIN_PANEL_BUILD_GUIDE.md` 1553 baris)
**Status audit terakhir:** `AUDIT.md` — `tsc` 0 error, `npm test` 70/70, `npm run build` sukses
(commit audit `717c9ac` di `main`; tindak lanjut env §8 sudah selesai + push
`7f00adc` di `main`, lokal `59b0316` — lihat F1.2)

> Aturan utama: **Linear adalah satu-satunya sumber kebenaran untuk progress.**
> Chat, `AUDIT.md`, dan commit GitHub adalah bukti pendukung — bukan pengganti
> status di Linear. Tidak ada fitur, bug, atau verifikasi yang "selesai" kalau
> issue-nya di Linear belum `Done` dengan bukti yang tercantum.

---

## 1. Struktur

### 1.1 Satu Project, dua puluh tujuh Epic

| Epic (parent issue) | Fase Guide | Isi |
| --- | --- | --- |
| E1 Fase 1 — Fondasi | §4.1–4.9 | Env, HTTP client, error, sesi, capability, paginasi |
| E2 Fase 2 — Kerangka UI | §5 | Routes, Sidebar, Topbar, layout |
| E3 Fase 3 — Modul Baca | §6.1–6.8 | Dashboard, Devices, Machines, Products, WO, Downtime, Audit, Telemetri |
| E4 Fase 4 — Modul Tulis | §7.1–7.4 | Mutasi, validasi, konflik 409, preservasi histori |
| E5 Fase 5 — Konsol IAM | §8 | Access Control, 18 rute |
| E6 Fase 6 — Konsol MQTT | §9.1–9.3 | Dynamic Security 23 ops, Broker Config 13 ops, Overview |
| E7 Fase 7 — Realtime | §10 | WebSocket telemetry |
| E8 Verifikasi, Testing & Go-live | §11–15 | A11y/perf, matriks uji §12, deployment §13, DoD §15 |
| E9 Refactoring struktur direktori | — | Kontrak `docs/DIRECTORY_STRUCTURE.md` + checker + pecah god-file per domain |
| E10 Mode Akses Private/Public | D1, §4.1–4.2 | Switch `VITE_ACCESS_MODE` + enforcement + kebutuhan backend (B1–B25) |
| E11 Perbaikan Telemetry & OEE | §6.8, §Q, §K | Audit 2026-11-16: 25 gap Telemetry History / OEE per jam / Timeline Shift — 5 usulan prioritas dalam scope (F-1–F-4, U-1) |
| E12 Lanjutan Perbaikan Telemetry & OEE | §6.8, §Q, §K | Audit 2026-11-16: 19 usulan tersisa (F-5–F-13, X-1–X-6, U-2–U-5) — admin-panel saja; infra (Nginx) + backend dikecualikan |
| E13 Backend gaps — System Admin | §3.3, §3.4, §6.7, §H, §M, §N, §O, §P | Audit 2026-11-17: 50 gap backend System Admin (SYS-B1–SYS-B50) — kontrak IAM, audit, health, MQTT DynSec/Config, master data |
| E14 Tindak lanjut panel keputusan Fase 0 | K-01–K-15 | Perubahan panel dari 12 keputusan Fase 0 yang diputuskan (K-03 slash, K-10 method, K-11 provision); K-05/K-06/K-07 diputuskan menyusul (E15) |
| E15 K-05/K-06/K-07 ikuti desain API doc | K-05–K-07 | Panel mengikuti desain API_DOCUMENTATION/Guide Lampiran A (4 body dynsec objek tunggal, password wajib min 8, mapper enabled, overview null → UNAVAILABLE); B34/B43 dicatat sebagai tugas dokumentasi backend |
| E16 Sinkronisasi dokumen panduan backend | — | Perbarui plan + gaps + mode akses + audit telemetry pasca-E14/E15 (angka Linear/registry/tests, status panel pasca-audit) |
| E17 Analisis relevansi keputusan Fase 0 vs backend 18 Nov & industri | K-01–K-15 | Pull keputusan backend 18 Nov (SYS-B8–B50); 7 dikonfirmasi, 1 disempurnakan, 3 dibalik (K-03/K-09/K-11), 3 terbuka, 1 belum tercakup; tindak lanjut panel P-A–P-L |
| E18 Penutupan keputusan gap (delegasi Fathur) | K-01–K-15 + B1/B3/B4/B6/B7/B16/enum | 22/22 diputuskan via delegasi: 4 pembalikan diterima, 4 Fase 0 dikonfirmasi tetap, 7 gap baru diputuskan, 7 arah panel disetujui (P-I tertunda); satu alur kanonis, tanpa duplikasi/deprecated flow |
| E19 Gaps doc: semua gap tertutup (status) + push | SYS-B1–B50 | Tabel status 50/50 di gaps doc (39 backend 18 Nov, 6 delegasi E18, 5 panel-side); "tertutup" = keputusan tercatat, bukan implementasi selesai — SYS-B1–B50 tetap Todo |
| E20 Sinkronisasi ke API docs terupdate | 294 entri diff | Diff 162 OK / 102 CHANGE / 21 NEW / 9 REMOVE; D-1–D-14 diputuskan mengikuti api_docs; gaps lama diarsipkan; implementasi 4 batch SELESAI + terverifikasi independen 2026-11-19 (registry 132 → 137) |
| E21 Penutupan backend sync/gaps di Linear | SYS-B1–B50 + R-1–R-15 | Dilaksanakan SETELAH E20 selesai + terverifikasi — verifikasi tiap gap vs api_docs terupdate, tutup yang implementasi backend-nya tercermin di dokumen |
| E28 Triase + implementasi panel + penutupan Linear | AUDIT §38 | Triase 64 issue terbuka (14 SUDAH SELESAI, 8 TERBLOKIR, 32 RELEVAN); Batch A 7 panel (commit 179ecf7, tes 466/466) + Batch B 8 panel (commit d770c2b, tes 483/483); tutup 29 issue di Linear. Bukan epic Linear — paket kerja tanpa issue baru. |
| E29 Spec 044: Migrasi login admin ke POST /auth/admin/login | Spec 044 | Login admin strict tanpa station_id (registry AUTH_ADMIN_LOGIN, LoginPage tanpa field Station, 403 role-gate passthrough, refresh tanpa gate LAN); Batch A commit 38752fc (tes 492/492) + Batch B commit e4d1d6a (tes 499/499); tutup 7 issue (FAT-240–246), epic FAT-239 DITUTUP Done 20 Nov 2026 setelah verifikasi live parent (login ADM-001 via endpoint baru berhasil dari Vercel, tanpa 403 — AUDIT §39 + §40). |
| E30 HMI tanpa login operator + station sebagai identitas terminal (QR 4 zona) | Keputusan Fathur 20 Nov 2026 | Lintas-repo (HMI oee-hmi + admin-panel + backend): HMI tanpa login operator, start via tombol fisik, logging via 4 QR zona (PID/MID/OID/SID + DATE, auto-create WO jalur A / resolve WO jalur B); station = identitas terminal terikat satu mesin. KONFLIK: HMI ADR-0004 (Accepted 20 Nov 2026) menolak QR-sebagai-autentikasi — implementasi butuh amandemen ADR + perubahan kontrak dispatch; HMI unit 003 (QR dual-lane) sudah selesai, jangan duplikasi. Epic FAT-248 + 12 anak (FAT-249–260), dibuat 20 Nov 2026, semua Todo. |

Setiap Epic adalah **parent issue**; modul di bawahnya adalah **child issue**
(`parentId` ke Epic). Tidak ada issue yatim: semua task harus punya parent Epic,
kecuali bug mendesak yang langsung di-link ke Epic yang relevan.

### 1.2 Milestone Project (per Fase)

Milestone di Project Linear = Fase Guide, supaya progress per fase terbaca di
Project Overview:

- M1 Fondasi (§4) · M2 Kerangka UI (§5) · M3 Modul Baca (§6) · M4 Modul Tulis (§7)
- M5 IAM (§8) · M6 MQTT (§9) · M7 Realtime (§10) · M8 Go-live (§11–15)

Target date milestone **tidak diisi** sampai backend tersedia — tanggal palsu
lebih merusak daripada tanpa tanggal. Target diisi saat backend / jadwal
verifikasi sudah nyata.

### 1.3 Daftar issue awal (28 issue: 8 Epic + 20 child)

Status di bawah ini adalah **status benar per 2026-11-16 dari `AUDIT.md`**,
bukan rencana. Yang sudah selesai di mode Demo tetap `Done` — dengan label
`demo` dan catatan "belum terverifikasi mode Real" di deskripsi, bukan
dianggap selesai penuh.

| # | Issue | Parent | Status awal | Prioritas | Label |
| --- | --- | --- | --- | --- | --- |
| E1 | Fase 1 — Fondasi (§4) | — | Done | High | `fase-1`, `demo` |
| F1.1 | Transport HTTP 131 operasi + switch Demo/Real | E1 | Done | High | `fase-1`, `demo`, `real-backend` |
| F1.2 | Env single source of truth (`mode.ts`) + preset login mati di env real + hapus ganti-role | E1 | Done | High | `fase-1`, `env`, `security` |
| F1.3 | Sesi & Auth: login wajib, token hanya di memori, refresh single-flight | E1 | Done | High | `fase-1`, `security` |
| F1.4 | Capability-first UI, paginasi & filter (§4.5, 4.7–4.9) | E1 | Done | Medium | `fase-1`, `demo` |
| E2 | Fase 2 — Kerangka UI (§5) | — | Done | Medium | `fase-2`, `demo` |
| F2.1 | Routes / Sidebar / Layout / Topbar + Network banner | E2 | Done | Medium | `fase-2`, `demo`, `verification` |
| E3 | Fase 3 — Modul Baca (§6) | — | Done | High | `fase-3`, `demo` |
| F3.1 | Dashboard, Live State & Analitik OEE (§6.1) | E3 | Done | High | `fase-3`, `demo` |
| F3.2 | Devices & Machines + bind lifecycle (§6.2–6.3) | E3 | Done | High | `fase-3`, `demo` |
| F3.3 | Products, Work Orders, Operators (§6.4–6.5) | E3 | Done | High | `fase-3`, `demo` |
| F3.4 | Downtime, Operational Events & Audit Sistem (§6.6–6.7) | E3 | Done | Medium | `fase-3`, `demo` |
| F3.5 | Telemetri, Ekspor & Rekonsiliasi (§6.8) | E3 | Done | Medium | `fase-3`, `demo` |
| F3.6 | Master Lines / Shifts / Shift-Schedules — halaman baru (§5, Lamp. L–N) | E3 | Done | High | `fase-3`, `demo`, `feature` |
| E4 | Fase 4 — Modul Tulis (§7) | — | Done | High | `fase-4`, `demo` |
| F4.1 | Mutasi, validasi client, matriks konflik 409, preservasi histori | E4 | Done | High | `fase-4`, `demo` |
| E5 | Fase 5 — Konsol IAM (§8) | — | Done | High | `fase-5`, `demo` |
| F5.1 | Konsol IAM — 18 rute Access Control | E5 | Done | High | `fase-5`, `demo`, `security` |
| E6 | Fase 6 — Konsol MQTT (§9) | — | Done | High | `fase-6`, `demo` |
| F6.1 | Dynamic Security 23 ops + Broker Config 13 ops + Overview | E6 | Done | High | `fase-6`, `demo`, `security` |
| E7 | Fase 7 — Realtime (§10) | — | Done* | Medium | `fase-7`, `demo` |
| F7.1 | WebSocket telemetry + reconnect + simulasi demo 5 dtk | E7 | Done | Medium | `fase-7`, `demo`, `real-backend` |
| E8 | Verifikasi, Testing & Go-live (§11–15) | — | **Todo** | High | `verification` |
| V8.1 | Verifikasi visual di browser sungguhan (3 halaman baru + Topbar) | E8 | **Todo** | High | `verification` |
| V8.2 | Verifikasi Mode Real end-to-end vs backend | E8 | **In Progress** | High | `verification`, `real-backend` |
| V8.3 | Uji integrasi LAN per modul (Guide §12, 1 alur E2E/modul) | E8 | **Todo — Blocked** | High | `verification`, `real-backend`, `blocked` |
| V8.4 | Deployment Nginx §13 (Vite statis, port 80/8080, CSP, no-store) | E8 | **Todo** | Medium | `deployment` |
| V8.5 | Definition of Done §15 — checklist per modul | E8 | **Todo** | High | `verification`, `docs` |
| E9 | Refactoring struktur direktori & kontrak penulisan kode | — | Done | High | `docs` |
| R9.1 | Kontrak directory-structure + checker otomatis | E9 | Done | High | `docs` |
| R9.2 | Pecah services/api: mockData, schemas, endpoints per domain | E9 | Done | High | `docs` |
| R9.3 | Pecah client.ts demo + httpClient.ts per domain | E9 | Done | High | `docs` |
| R9.4 | Pecah utils/capabilities.ts per concern | E9 | Done | Medium | `docs` |
| R9.5 | Halaman besar: ekstraksi tab/modal per halaman | E9 | Done | Medium | `docs` |
| R9.6 | Verifikasi refactoring: tsc, tests, build, preview + AUDIT.md | E9 | Done | High | `verification`, `docs` |
| E10 | Mode Akses Private/Public (LAN vs Internet) | — | **In Progress** | High | `security`, `feature` |
| A10.1 | Switch Private/Public di panel (env + enforcement + UI) | E10 | Done | High | `security`, `feature` |
| A10.2 | Kebutuhan backend mode akses (B1–B25, checklist V1–V12) | E10 | **Todo — Blocked** | High | `security`, `real-backend`, `blocked` |
| E11 | Perbaikan Telemetry & OEE (audit 2026-11-16) | — | Done | High | `fase-3` |
| T11.1 | Kirim from/to (+limit) ke hourly & aggregate Telemetry History | E11 | Done | High | `fase-3` |
| T11.2 | Ikat shift summary + timeline ke periode/shift yang sama | E11 | Done | High | `fase-3` |
| T11.3 | Rollup halaman OEE mengikuti mesin terpilih (atau label scope) | E11 | Done | High | `fase-3` |
| T11.4 | Samakan angka seed demo agar terrekoniliasi | E11 | Done | High | `fase-3`, `demo` |
| T11.5 | Label scope eksplisit di setiap widget | E11 | Done | Medium | `fase-3` |
| T11.6 | Pecah demo/telemetry.ts — checker 1 FAIL akibat E11 | E11 | Done | High | `fase-3` |
| E12 | Lanjutan Perbaikan Telemetry & OEE (audit 2026-11-16) | — | Done | High | `fase-3` |
| T12.1 | Filter shift (tanggal + shift) di Telemetry History dan halaman OEE | E12 | Done | High | `fase-3` |
| T12.2 | Tab Aggregate menampilkan deret per-bucket | E12 | Done | Medium | `fase-3` |
| T12.3 | Kolom tabel per jam dilengkapi + samakan presisi | E12 | Done | Medium | `fase-3` |
| T12.4 | Perbaiki pemetaan planned downtime (sisi panel) | E12 | Done | Medium | `fase-3` |
| T12.5 | Empty / loading / error state di semua tabel dan kartu | E12 | Done | Medium | `fase-3` |
| T12.6 | Indikator rekonsiliasi + investigasi selisih parts | E12 | Done | Medium | `fase-3` |
| T12.7 | Samakan kolom ekspor dengan layar (+ ekspor rollup) | E12 | Done | Medium | `fase-3` |
| T12.8 | Delegasikan builder endpoint ke registry | E12 | Done | Medium | `fase-3` |
| T12.9 | Kontrol periode (date-range picker) di halaman OEE | E12 | Done | Medium | `fase-3` |
| T12.10 | Toggle scope rollup: mesin ini / semua mesin | E12 | Done | Medium | `fase-3` |
| T12.11 | Zona waktu tunggal Asia/Jakarta + label sumbu waktu timeline | E12 | Done | Medium | `fase-3` |
| T12.12 | Flag provisional konsisten di semua tampilan | E12 | Done | Medium | `fase-3` |
| T12.13 | Downtime overlay: menampilkan N dari M + paginasi | E12 | Done | Low | `fase-3` |
| T12.14 | Hapus hourly_downtime_sec (field hantu) dari tipe, seed, CSV | E12 | Done | Low | `fase-3` |
| T12.15 | Perbaiki mapping cycle_time_ms berdasarkan satuan field | E12 | Done | Low | `fase-3` |
| T12.16 | Perbaiki komentar refetchAll + isRefreshing mencakup semua query | E12 | Done | Low | `fase-3` |
| T12.17 | Reset pilihan segmen saat ganti bucket timeline | E12 | Done | Low | `fase-3` |
| T12.18 | Samakan default dengan dokumen, atau catat deviasinya | E12 | Done | Low | `fase-3` |
| T12.19 | Satu tampilan kanonis OEE per jam + tautan silang | E12 | Done | Low | `fase-3` |
| T12.6a | Terapkan Opsi A: summary parts dari Σ hourly | E12 | Done | High | `fase-3` |
| E13 | Backend gaps — System Admin (SYS-B1–SYS-B50) | — | **Todo** | High | `real-backend`, `docs` |
| SYS-B1 | POST `/access-control/policies`: body panel tidak cocok dengan kontrak backend; `subjectMatch` tidak pernah bisa diisi | E13 | **Todo** | High | `real-backend` |
| SYS-B2 | PUT `/access-control/policies/:id` (+ toggle aktif/nonaktif): method PATCH vs PUT dan nama field salah | E13 | **Todo** | High | `real-backend` |
| SYS-B3 | ABAC: grammar/atribut panel ≠ backend; placeholder panel justru contoh yang tidak valid | E13 | **Todo** | High | `real-backend` |
| SYS-B4 | GET `/auth/me`: `mustChangePassword` / `isActive` / `isProtected` dibuang; tidak ada alur ganti-password-wajib | E13 | **Todo** | High | `real-backend` |
| SYS-B5 | PUT `/access-control/roles/:id`: panel mengirim PATCH; deskripsi saja yang benar | E13 | **Todo** | Medium | `real-backend` |
| SYS-B6 | Bentuk respons GET `/roles`, `/permissions`, `/policies`, `/user-roles`, `/subjects/...`, `/info` tidak dispesifikasi field-per-field; panel menebak dan memberi default diam-diam | E13 | **Todo** | Medium | `real-backend` |
| SYS-B7 | Role preset: panel/demo mengunci keempat preset sebagai immutable — dokumen hanya mengunci ADMIN; perilaku hapus role ber-pemakaian tidak didokumentasikan | E13 | **Todo** | Medium | `real-backend` |
| SYS-B8 | Capability `access_control.read` tidak ada di panel; kunci capability panel belum tentu sama dengan katalog backend; 403 pada read bisa salah menurunkan `manage` | E13 | **Todo** | Medium | `real-backend` |
| SYS-B9 | Proyeksi capability `/auth/me`: `domain`/`surface`/`mode`/`reason` per capability dan `enforcedDomains` dibuang; mode `partial` tidak jelas sumbernya | E13 | **Todo** | Medium | `real-backend` |
| SYS-B10 | POST `/access-control/permissions`: tidak ada UI; demo aktif memblokir dengan kode karangan; casing body belum pasti | E13 | **Todo** | Medium | `real-backend` |
| SYS-B11 | GET `/access-control/audit`: tanpa filter server-side; limit di-hardcode 100; keputusan di atas 100 hilang diam-diam | E13 | **Done** | Medium | `real-backend` |
| SYS-B12 | Inspector `GET /subjects/:operatorId/effective-permissions`: bentuk respons tidak terdokumentasi; subjek default hardcode `SUP-042`; error deep-link ditelan | E13 | **Todo** | Low | `real-backend` |
| SYS-B13 | POST `/access-control/roles/:id/permissions`: `reason` yang diketik admin dibuang di Real mode | E13 | **Todo** | Low | `real-backend` |
| SYS-B14 | Mutasi assignment: `reason` tidak dikirim; revoke memakai composite key tanpa `id` | E13 | **Todo** | Low | `real-backend` |
| SYS-B15 | Refresh token: panel mengembalikan `authz_version` karangan (selalu 0/stale di Real); penanganan 401 `AUTHZ_STALE`/`SUBJECT_INACTIVE` generik | E13 | **Todo** | Low | `real-backend` |
| SYS-B16 | Login: lockout client-side (5 percobaan/30 dtk) vs rate limit server (5/60 dtk); dokumentasi `Retry-After` belum ada | E13 | **Todo** | Low | `real-backend` |
| SYS-B17 | GET `/access-control/user-roles` & `/policies`: panel tidak mengirim filter `operatorId`/`roleId`; muat-semua + saring client-side | E13 | **Done** | Low | `real-backend` |
| SYS-B18 | Aturan anti-eskalasi/wildcard karangan panel/demo yang lebih ketat dari dokumen | E13 | **Todo** | Low | `real-backend` |
| SYS-B19 | Skema item audit (`OperationalEventItem`) tidak didefinisikan di dokumen mana pun; semua kolom AuditTrailPage adalah asumsi mapper | E13 | **Todo** | High | `real-backend` |
| SYS-B20 | `GET /health` tidak menyediakan field yang ditampilkan SystemHealthPage; transport HTTP mensintesis data kesehatan palsu | E13 | **Todo** | High | `real-backend` |
| SYS-B21 | PATCH ack tidak mengirim `operatorId`; dokumen bertentangan soal wajib/tidak | E13 | **Todo** | Medium | `real-backend` |
| SYS-B22 | Filter `severity` dan `acknowledged` di halaman Operational Events dibuang oleh transport HTTP; di Demo jalan, di Real mode diam-diam diabaikan | E13 | **Todo** | Medium | `real-backend` |
| SYS-B23 | Konflik dokumen: `machine_id` pada list global dan ekspor operational-events; Guide bilang didukung, API doc tidak mencantumkannya | E13 | **Done** | Medium | `real-backend` |
| SYS-B24 | Dukungan `event_type` pada `GET /system/audit` tidak ada di dokumen; panel bisa mengirimnya (via URL) dan demo mengabaikannya | E13 | **Todo** | Medium | `real-backend` |
| SYS-B25 | Bentuk envelope `meta` list tidak didefinisikan; paginasi cursor dan total bisa gagal diam-diam | E13 | **Todo** | Low | `real-backend` |
| SYS-B26 | System audit tidak bisa diekspor: tidak ada endpoint ekspor dan tidak ada tombolnya di UI | E13 | **Todo** | Low | `real-backend` |
| SYS-B27 | Tidak ada endpoint info/versi backend; SystemInfoPage murni statis | E13 | **Todo** | Low | `real-backend` |
| SYS-B28 | Rotasi password MQTT: http memakai POST, dokumen memakai PATCH | E13 | **Todo** | High | `real-backend` |
| SYS-B29 | Enable/disable klien MQTT: http memakai POST + `{disabled}`, dokumen memakai PATCH + `{enabled}` | E13 | **Todo** | High | `real-backend` |
| SYS-B30 | Provisioning perangkat: http mengubah nilai `access` menjadi `telemetry` / `telemetry+state` | E13 | **Todo** | High | `real-backend` |
| SYS-B31 | Tambah peran ke klien: http mengirim `{roles:[{rolename, priority}]}`, dokumen memakai `{rolename, priority?}` | E13 | **Done** | High | `real-backend` |
| SYS-B32 | Tambah ACL ke peran: http mengirim `{acls:[acl]}`, dokumen memakai objek ACL tunggal `{acltype, topic, ...}` | E13 | **Done** | High | `real-backend` |
| SYS-B33 | Buat klien: password kosong dikirim sebagai string kosong; auto-generate tidak dijamin dokumen; field `textname`/`textdescription`/`groups`/`clientid` dibuang di sebagian mode | E13 | **Done** | High | `real-backend` |
| SYS-B34 | Bentuk respons `POST /clients` (password sekali tampil) tidak dinamai di dokumen | E13 | **Done** | Medium | `real-backend` |
| SYS-B35 | Mapper `mapMqttClient`: logika `enabled` bisa terbalik bila backend mengembalikan `enabled:false` | E13 | **Done** | Medium | `real-backend` |
| SYS-B36 | Tambah klien ke grup: http mengirim `{clients:[{username}]}`, dokumen memakai `{username, priority?}` | E13 | **Done** | Medium | `real-backend` |
| SYS-B37 | Tambah peran ke grup: http mengirim `{roles:[{rolename}]}`, dokumen memakai `{rolename, priority?}` | E13 | **Done** | Medium | `real-backend` |
| SYS-B38 | `GET /mqtt/configuration` tanpa trailing slash; dokumen API mewajibkan trailing slash | E13 | **Todo** | Medium | `real-backend` |
| SYS-B39 | Stage konfigurasi: panel mengirim `{config, summary}`, dokumen memakai `{config, baseVersionId?, reason?, comment?}` | E13 | **Todo** | Medium | `real-backend` |
| SYS-B40 | Detail error 422 staging: dokumen menyebut field `details`, panel hanya mem-parsing `issues` | E13 | **Todo** | Medium | `real-backend` |
| SYS-B41 | Apply/rollback: panel tidak mengirim `acknowledgeUnvalidated`, dan hanya polling operasi satu kali | E13 | **Done** | Medium | `real-backend` |
| SYS-B42 | `POST /backups` tidak ada di dokumen (endpoint hantu); tidak ada restore/download backup | E13 | **Todo** | Medium | `real-backend` |
| SYS-B43 | Model konfigurasi terstruktur tidak dispesifikasi; field, default, dan enum status versi/operasi ditebak panel | E13 | **Todo** | Medium | `real-backend` |
| SYS-B44 | Overview: bentuk dalam `{dynamicSecurity, configuration}` tidak dispesifikasi; `null` (plugin nonaktif) diubah panel menjadi nilai yang menyesatkan | E13 | **Todo** | Low | `real-backend` |
| SYS-B45 | Filter Shift Schedules: panel memakai snake_case, Guide memakai camelCase | E13 | **Todo** | Medium | `real-backend` |
| SYS-B46 | Respons list/detail Shift Schedule: field denormalisasi (`shiftName/shiftCode/startTime/endTime`) tidak dijamin dokumen | E13 | **Todo** | Medium | `real-backend` |
| SYS-B47 | Operators: `is_active` pada create dihilangkan http; proteksi `ADM-001` berbeda status demo vs dokumen | E13 | **Todo** | Low | `real-backend` |
| SYS-B48 | List DynSec & Operators tanpa pagination/filter server-side; panel mengambil semua | E13 | **Todo** | Low | `real-backend` |
| SYS-B49 | Hapus Production Line: demo memblokir bila line dipakai operator; dokumen hanya menyebut machines + snapshot WO | E13 | **Todo** | Low | `real-backend` |
| SYS-B50 | Hapus Shift: demo hanya memeriksa shift_schedules, bukan snapshot WO; efek ubah jam shift ke jadwal yang ada tidak dispesifikasi | E13 | **Todo** | Low | `real-backend` |
| E14 | Tindak lanjut panel keputusan Fase 0 (K-01–K-15) | — | Done | High | `real-backend`, `docs` |
| P14.1 | K-03: GET /mqtt/configuration wajib trailing slash | E14 | Done | High | `real-backend` |
| P14.2 | K-10: PUT untuk updateIamRole + updateIamPolicy | E14 | Done | High | `real-backend` |
| P14.3 | K-10: PATCH rotasi password + toggle dynsec ({enabled}) | E14 | Done | High | `real-backend` |
| P14.4 | K-11: provisioning lewat POST /clients/provision | E14 | Done | High | `real-backend` |
| P14.5 | Verifikasi E14: tsc, tests, build, preview, checker + AUDIT.md §17 | E14 | Done | High | `verification`, `docs` |
| E15 | K-05/K-06/K-07: ikuti desain API_DOCUMENTATION | — | Done | High | `real-backend`, `docs` |
| P15.1 | K-05: 4 body sub-operasi dynsec ke objek tunggal | E15 | Done | High | `real-backend` |
| P15.2 | K-06 B33: password wajib di UI buat klien (min 8) | E15 | Done | High | `real-backend` |
| P15.3 | K-06 B35: perbaiki logika enabled mapMqttClient | E15 | Done | High | `real-backend` |
| P15.4 | K-07 B44: overview configuration null → UNAVAILABLE | E15 | Done | High | `real-backend` |
| P15.5 | Verifikasi E15: tsc, tests, build, preview, checker + AUDIT.md §18 | E15 | Done | High | `verification`, `docs` |
| E16 | Sinkronisasi dokumen panduan upgrade backend (plan + gaps + terkait) | — | Done | High | `real-backend`, `docs` |
| P16.1 | BACKEND_UPGRADE_PLAN.md: angka + status (Linear 129, registry 132, tests 335/335, AUDIT §14–§18, v1.1) | E16 | Done | High | `real-backend`, `docs` |
| P16.2 | BACKEND_GAPS_SYSTEM_ADMIN.md: status panel pasca-audit E14/E15 + registry 132 | E16 | Done | High | `real-backend`, `docs` |
| P16.3 | BACKEND_REQUIREMENTS_ACCESS_MODE.md (B7: 131→132) + docs/archive/TELEMETRY_AUDIT.md (pointer status panel) | E16 | Done | High | `real-backend`, `docs` |
| P16.4 | Verifikasi E16 + LINEAR.md + seed v15 | E16 | Done | High | `verification`, `docs` |
| E17 | Analisis relevansi keputusan Fase 0 vs keputusan backend 18 Nov & real-case industri | K-01–K-15 | Done | High | `real-backend`, `docs` |
| P17.1 | Pull + baca keputusan backend 18 Nov (SYS-B8..B50) + decision log Fase 0 | E17 | Done | High | `real-backend`, `docs` |
| P17.2 | Riset praktik industri untuk keputusan ber-alternatif | E17 | Done | High | `real-backend`, `docs` |
| P17.3 | Tulis dokumen analisis + daftar tindak lanjut panel | E17 | Done | High | `real-backend`, `docs` |
| P17.4 | Verifikasi E17 + LINEAR.md + seed v16 | E17 | Done | High | `verification`, `docs` |
| E18 | Penutupan keputusan gap (delegasi Fathur): 15 keputusan gap + 7 arah panel | K-01–K-15 + B1/B3/B4/B6/B7/B16/enum | Done | High | `real-backend`, `docs` |
| P18.1 | Rekam keputusan A1–A4 + B1–B4 (decision log + gaps doc) | E18 | Done | High | `real-backend`, `docs` |
| P18.2 | Rekam keputusan C1–C7 (gaps doc + rencana) | E18 | Done | High | `real-backend`, `docs` |
| P18.3 | Rekam arah panel D1–D7 + rencana implementasi (tanpa duplikasi/deprecated flow) | E18 | Done | High | `real-backend`, `docs` |
| P18.4 | Verifikasi E18 + LINEAR.md + seed v17 | E18 | Done | High | `verification`, `docs` |
| E19 | Gaps doc: semua gap SYS-B1–B50 tertutup (status) + push | SYS-B1–B50 | Done | High | `real-backend`, `docs` |
| P19.1 | Perbarui gaps doc: tabel status 50/50 + header + pertanyaan terbuka | E19 | Done | High | `real-backend`, `docs` |
| P19.2 | Verifikasi E19 + LINEAR.md + seed v18 + snapshot-push GitHub | E19 | Done | High | `verification`, `docs` |
| E20 | Sinkronisasi admin-panel ke API docs terupdate (backend upgrade) | API docs baru 2100 baris | Done | High | `real-backend` |
| P20.1 | Diff API baru vs panel (laporan diff, tanpa ubah kode) | E20 | Done | High | `real-backend`, `docs` |
| P20.2 | Batch 1: provisioning perangkat (/devices/provision; hapus legacy + accessMap) | E20 | Done | High | `real-backend` |
| P20.3 | Batch 2: auth + IAM (gate mustChangePassword, hapus lockout paralel, bentuk kanonis) | E20 | Done | High | `real-backend` |
| P20.4 | Batch 3: health/detail + audit (hapus sintesis, skema OperationalEventItem, enum, export) | E20 | Done | High | `real-backend` |
| P20.5 | Batch 4: telemetry/OEE/mesin/status-history + config + misc + `GET /system/access-mode` (server) | E20 | Done | High | `real-backend` |
| P20.6 | Verifikasi E20 + docs + LINEAR.md + seed v19 | E20 | Done | High | `verification`, `docs` |
| P20.7 | Keputusan D-1–D-14 mengikuti api_docs + dokumen tinjau-ulang + arsip gaps lama | E20 | Done | High | `real-backend`, `docs` |
| E21 | Penutupan backend sync/gaps di Linear (pasca E20) | SYS-B1–B50 + R-1–R-15 | Done | High | `real-backend`, `docs` |
| P21.1 | Verifikasi IAM (B1–B18) vs api_docs baru | E21 | Done | High | `real-backend` |
| P21.2 | Verifikasi Audit/Health (B19–B27) vs api_docs baru | E21 | Done | High | `real-backend` |
| P21.3 | Verifikasi DynSec (B28–B37) vs api_docs baru | E21 | Done | High | `real-backend` |
| P21.4 | Verifikasi Config (B38–B44) vs api_docs baru | E21 | Done | High | `real-backend` |
| P21.5 | Verifikasi Master Data (B45–B50) vs api_docs baru | E21 | Done | High | `real-backend` |
| P21.6 | R-items + kontradiksi → tindak lanjut backend (R-16–R-23 baru) | E21 | Done | High | `real-backend`, `docs` |
| P21.7 | Verifikasi E21 + AUDIT §25 + LINEAR.md + seed v21 | E21 | Done | High | `verification`, `docs` |
| FAT-168 | Arsip dokumen gap tertutup + perbarui dokumentasi admin panel | — | Done | High | `docs` |
| E22 | Live API audit Fase 1: gap baru (N-2–N-5) | API_LIVE_AUDIT.md | Todo | Medium | `verification`, `real-backend` |
| N-2 | Panel: default device hardcoded STM32-OEE-01 — ambil dari daftar live | E22 | Done | Low | `verification`, `real-backend` |
| N-3 | Backend: urutan gate auth-vs-validasi tidak konsisten pada mutasi | E22 | Todo | Low | `verification`, `real-backend` |
| N-4 | Backend: dua teks pesan 401 berbeda | E22 | Todo | Low | `verification`, `real-backend` |
| N-5 | Produk live tanpa sku/isActive — panel tampilkan productId sebagai SKU | E22 | Done | Low | `verification`, `real-backend` |
| E23 | Audit endpoint vs api_docs live (OpenAPI): gap baru N-6–N-41 | API_DOCS_AUDIT.md | Todo | High | `verification`, `real-backend` |
| N-6 | CORS origin panel Vercel tidak diizinkan — blokir semua akses browser | E23 | Done | Urgent | `security`, `real-backend`, `verification` |
| N-7 | Inspector effective-permissions: roles string[] dibaca sebagai objek | E23 | Done | High | `verification`, `real-backend` |
| N-8 | Reconciliation refresh: body {from,to} vs spec {startWindow,endWindow} | E23 | Done | High | `verification`, `real-backend` |
| N-9 | 7 sub-op DynSec kembalikan {success} saja; panel petakan jadi objek penuh | E23 | Done | High | `verification`, `real-backend` |
| N-10 | MQTT config status: bentuk spec bertentangan total dengan mapper panel | E23 | Done | High | `verification`, `real-backend` |
| N-11 | Telemetry aggregate: delta vs count — total_parts selalu 0 | E23 | Done | High | `verification`, `real-backend` |
| N-12 | Config stage: bridges butuh password + validation/impact/diff dibuang | E23 | Done | High | `verification`, `real-backend` |
| N-13 | Config diff: lines[] diabaikan — tampilan diff selalu kosong | E23 | Done | High | `verification`, `real-backend` |
| N-14 | Machines: lineId tidak pernah dikirim | E23 | Done | Medium | `verification`, `real-backend` |
| N-15 | PUT device: null untuk IP/firmware yang dikosongkan → 400 | E23 | Done | Medium | `verification`, `real-backend` |
| N-16 | Shifts: ShiftSchema HH:MM ketat vs spec string polos | E23 | Done | Medium | `verification`, `real-backend` |
| N-17 | Shift schedules: dayOfWeek 1..7 vs spec number tanpa konvensi | E23 | Done | Medium | `verification`, `real-backend` |
| N-18 | PATCH shift-schedule mengirim lineId yang tak ada di body spec | E23 | Done | Medium | `verification`, `real-backend` |
| N-19 | Filter WO ID diam-diam tidak berfungsi | E23 | Done | Medium | `verification`, `real-backend` |
| N-20 | /health/detail: DEGRADED hilang + adminConnection difabrikasi | E23 | Done | Medium | `verification`, `real-backend` |
| N-21 | Telemetry history: 4 field spec dilewatkan mapper | E23 | Done | Medium | `verification`, `real-backend` |
| N-22 | Reconciliation jobs: mapper baca field yang tak ada | E23 | Done | Medium | `verification`, `real-backend` |
| N-23 | Query limit wajib di spec tapi panel tak selalu mengirim | E23 | Done | Medium | `verification`, `real-backend` |
| N-24 | Encoding ekspor: spec JSON-string vs panel baca teks mentah | E23 | Done | Medium | `verification`, `real-backend` |
| N-25 | Downtime mapper: kategori selalu OTHER + param tak terdaftar + tipe operator | E23 | Done | Medium | `verification`, `real-backend` |
| N-26 | Telemetry rollup: group_by='line' tak dikenal + envelope=true | E23 | Done | Medium | `verification`, `real-backend` |
| N-27 | OEE shift-summary: counts + nama tak ada — parts selalu 0 | E23 | Done | Medium | `verification`, `real-backend` |
| N-28 | MQTT overview: status di-hardcode + lastOperation + reason | E23 | Done | Medium | `verification`, `real-backend` |
| N-29 | Config GET: unmanaged[] objek + default fabrikasi | E23 | Done | Medium | `verification`, `real-backend` |
| N-30 | Config raw: dokumen JSON ditampilkan sebagai teks config | E23 | Done | Medium | `verification`, `real-backend` |
| N-31 | Config operations: type salah petakan + timestamp epoch | E23 | Done | Medium | `verification`, `real-backend` |
| N-34 | Ekspor op-events: filter event_type tidak dikirim padahal spec menerimanya | E23 | Done | Medium | `verification`, `real-backend` |
| N-32 | Device health eventFlags: asumsi bit belum terverifikasi | E23 | Todo | Low | `verification`, `real-backend` |
| N-33 | DynSec status: bentuk spec bertentangan total, laten | E23 | Done | Low | `verification`, `real-backend` |
| N-35 | WO cancel/resolve: fabrikasi respons | E23 | Done | Low | `verification`, `real-backend` |
| N-36 | IAM info: catalogueVersion dibuang | E23 | Done | Low | `verification`, `real-backend` |
| N-37 | Legacy POST /devices: model/serial dibuang + mac_address diwajibkan | E23 | Done | Low | `verification`, `real-backend` |
| N-38 | Halaman login tanpa badge mode API / indikator koneksi | E23 | Done (E28, 20 Nov 2026) | Low | `verification`, `real-backend` |
| N-39 | MQTT_CONFIG_GET: trailing slash di template registry | E23 | Done | Low | `verification`, `real-backend` |
| N-40 | Spec OpenAPI tidak mendeklarasikan respons error 401/400 (17 op Access Control) | E23 | Todo | Low | `verification`, `real-backend` |
| N-41 | Perilaku 404 vs [] untuk device tak dikenal tidak konsisten | E23 | Done | Low | `verification`, `real-backend` |
| E24 | Fase 2 browser pasca-push: temuan data live-state/presence | API_DOCS_AUDIT.md | Todo | High | `verification`, `real-backend` |
| N-42 | Live-state & presence perangkat nol/stale setelah restart backend | E24 | Todo | High | `verification`, `real-backend` |
| N-43 | Agregat all-null ditampilkan 0% bukan '—' | E24 | Done | Low | `verification`, `real-backend` |
| E25 | End-to-end testing pasca-push: pencocokan panel vs API live | E2E_TEST.md | Todo | High | `verification`, `real-backend` |
| E2E-01 | Overview + Live-State menelan error diam-diam (catch {} tanpa banner) | E25 | Done | High | `verification`, `real-backend` |
| E2E-02 | Halaman Quality menyamarkan error sebagai empty state | E25 | Done | Medium | `verification`, `real-backend` |
| E2E-03 | System Health macet di 'Memuat…' selamanya bila GET /health gagal | E25 | Done | Medium | `verification`, `real-backend` |
| E2E-04 | OEE hourly: totalCount null → parts_produced 0 (angka 0 menyesatkan) | E25 | Done | Medium | `verification`, `real-backend` |
| E2E-05 | 4 halaman CRUD + Reconciliation tanpa empty state (satu tiket pola) | E25 | Done | Low | `verification`, `real-backend` |
| E2E-06 | Peringatan shift 'tidak tersedia' sempat muncul saat loading di /telemetry (kemungkinan race) | E25 | Done | Low | `verification`, `real-backend` |
| E2E-07 | Investigasi: selisih rekonsiliasi 7 hari vs jendela shift (235 vs 99 mnt) | E25 | Done | Low | `verification`, `real-backend` |
| E2E-08 | MQTT live config tidak bisa dibaca: ENOENT /mosquitto/config/mosquitto.conf | E25 | Todo | High | `verification`, `real-backend` |
| E2E-09 | Event audit: atribusi perangkat salah + description berisi JSON mentah | E25 | Todo | Medium | `verification`, `real-backend` |
| E2E-10 | Kerapian tampilan list: WO ID duplikat, 'SN:' kosong, suhu '-', sel LINE/SCOPE kosong | E25 | Done | Low | `verification`, `real-backend` |
| E2E-11 | Tampilan timeline Analytics: label sumbu berantakan + 'Downtime ID tidak ditemukan' | E25 | Done | Low | `verification`, `real-backend` |
| E26 | Uji mutasi E2E panel vs API live (Bagian A+B) | E2E_MUTATION_TEST.md | Todo | High | `verification`, `real-backend` |
| MUT-01 | DynSec menampilkan banner network-error palsu padahal mutasi sukses di server, dan list tampil stale sampai halaman di-remount | E26 | Done | Medium | `verification`, `real-backend` |
| MUT-02 | DynSec client-create selalu gagal 'Role not found' untuk semua role termasuk admin | E26 | Todo | High | `verification`, `real-backend` |
| MUT-03 | Policy create dengan ABAC kosong mengirim abacCondition: null, server menolak (expected record) | E26 | Done | Medium | `verification`, `real-backend` |
| MUT-04 | Overwrite label downtime tidak bisa mengembalikan status 'Belum dikategorikan' / teks alasan asli | E26 | Done | Low | `verification`, `real-backend` |
| E27 | Spec 043: Device Registry & Station Audit | — | Todo | High | `verification`, `real-backend` |
| T1 | Device Registry (CRUD devices) — halaman /admin/stations | E27 | Todo | High | `verification`, `real-backend` |
| T2 | Audit Trail tampilkan station_label + badge "Tidak terdaftar" | E27 | Todo | High | `verification`, `real-backend` |
| T3 | Diagnostik login kiosk + CTA "Daftarkan stasiun ini" | E27 | Todo | Medium | `verification`, `real-backend` |
| LOGIN | LoginPage: pesan "Stasiun tidak terdaftar" + kosongkan default prefill station | E27 | Todo | High | `verification`, `real-backend` |
| VERIFY | Verifikasi live AC1–AC4 (browser, parent) | E27 | Todo | Medium | `verification`, `real-backend` |

\* E7 `Done` hanya untuk simulasi demo. Verifikasi WS sungguhan ikut V8.2/V8.3.

Detail lengkap tiap issue (deskripsi, kriteria terima, bukti): lihat
`docs/linear-seed.json` — file itu adalah sumber pembuatan issue di Linear,
supaya isi Linear dan repo selalu bisa dicocokkan ulang.

### 1.4 Yang sengaja TIDAK dibuat issue terpisah

- Diskrepansi dokumen D-1 (`POST /auth/password/change` body) dan D-2
  (`GET /auth/me` shape): sudah ditangani (`mapAuthMe` defensif, API doc §L
  dipakai) dan didokumentasikan di `AUDIT.md` §3 — dicatat di deskripsi
  F1.1, bukan issue sendiri.
- Safety boundary ADR-003 (tidak ada aktuasi mesin, tidak ada
  `POST /devices/:id/command`, tidak ada `POST /clients/provision`): aturan
  permanen, dicatat di deskripsi E4/E6 dan diuji oleh `iamAndSecurity.test.ts`
  — bukan issue yang bisa `Done`.
- 4 issue onboarding Linear (`FAT-1`–`FAT-4`): milik workspace, bukan project
  ini — biarkan apa adanya, jangan dihapus dari Linear.

---

## 2. Workflow — arti tiap status (tim FAT)

Status bawaan tim FAT dipakai apa adanya, tidak dibuat status custom:

| Status Linear | Arti di project ini | Siapa yang memindahkan |
| --- | --- | --- |
| `Backlog` | Ide / temuan belum diprioritaskan. Belum ada komitmen. | Siapa saja, saat triage |
| `Todo` | Sudah disepakati, siap dikerjakan, belum dimulai. | Saat issue dibuat dari audit/rencana |
| `In Progress` | Sedang dikerjakan (ada branch/commit aktif). Hanya **satu** issue `In Progress` per orang dalam satu waktu. | Muse / Fathur saat mulai kerja |
| `In Review` | Kode sudah di-push (commit di GitHub), menunggu verifikasi: `tsc` + test + build, atau cek visual Fathur. | Muse setelah push |
| `Done` | **Semua** kriteria terima terpenuhi + bukti tercantum di issue (commit SHA, hasil test/build). Demo-only harus menulis "Demo-only" di komentar penutup. | Setelah bukti lengkap — bukan saat push |
| `Canceled` | Dibatalkan dengan alasan di komentar (mis. duplikat keputusan dokumen). Jangan hapus issue. | Setelah keputusan tercatat |
| `Duplicate` | Duplikat issue lain — komentar berisi nomor issue yang dipertahankan. | Saat triage |

Aturan tambahan:

- **Tidak ada lompat status.** `Todo` → `In Progress` → `In Review` → `Done`.
  Kalau verifikasi gagal, kembali ke `In Progress` dengan komentar berisi
  apa yang gagal.
- **Blocked bukan status.** Blocker dicatat dengan label `blocked` + komentar
  "Blocked by: …" (mis. "tidak ada backend"). Issue tetap di `Todo`, supaya
  antrean yang benar-benar bisa dikerjakan tetap terlihat.
- **Prioritas:** `Urgent` = panel tidak bisa dipakai / keamanan; `High` =
  modul Guide / verifikasi go-live; `Medium` = penyempurnaan; `Low` = nice-to-have.
  Prioritas default modul Guide adalah `High`, bukan `Urgent`.

---

## 3. Label

Label bawaan workspace yang dipakai: `Bug`, `Feature`, `Improvement`.
Label baru yang dibuat untuk project ini:

| Label | Arti |
| --- | --- |
| `fase-1` … `fase-7` | Fase Build Guide tempat issue berada |
| `demo` | Selesai / berlaku di mode Demo (belum tentu di Real) |
| `real-backend` | Butuh / menyangkut backend sungguhan |
| `blocked` | Terhambat faktor luar (saat ini: belum ada backend) |
| `verification` | Butuh pengecekan (visual / E2E / integrasi), bukan coding |
| `env` | Konfigurasi environment (`.env`, `mode.ts`) |
| `security` | Auth, IAM, token, Dynamic Security |
| `deployment` | Build, Nginx, hosting |
| `docs` | Dokumentasi / audit |

Satu issue boleh punya beberapa label, tapi **wajib** punya minimal satu
label `fase-*` (kecuali Epic E8) dan label `demo`/`real-backend` bila relevan.
Label bukan pengganti status — jangan menandai selesai dengan label.

---

## 4. Isi standar tiap issue

Setiap issue (kecuali Epic) wajib berisi di deskripsi:

1. **Referensi Guide:** nomor pasal (mis. "Guide §6.8, Lamp. A") + endpoint
   yang dicakup (mis. "`GET /api/v1/operational-events/` — trailing slash wajib").
2. **Kriteria terima:** checklist dari Definition of Done §15 yang relevan
   untuk modul itu (lihat §5 di bawah).
3. **Bukti selesai:** commit SHA GitHub + `tsc` / `npm test` / `npm run build`
   (mis. "70/70, `717c9ac`"). Tanpa bukti, issue tidak boleh `Done`.
4. **Batasan yang diketahui:** kalau Demo-only, tulis eksplisit
   ("Belum terverifikasi mode Real — lihat V8.2").

Deskripsi Epic berisi: ringkasan fase, daftar child issue, dan tautan ke
`AUDIT.md` + repo GitHub.

---

## 5. Definition of Done (Guide §15) — checklist penutup tiap modul

Sebuah modul dianggap selesai bila seluruh poin ini terpenuhi:

- [ ] Semua endpoint modul dipanggil lewat klien terpusat dengan Zod.
- [ ] Loading / empty / error / konflik / stale state tertangani dan konsisten.
- [ ] Otorisasi UI memakai capability key; `403` menurunkan capability dan
      `401` stale memaksa login ulang.
- [ ] Aksi dengan scope/atribut tidak diketahui memakai state `unknown`,
      bukan ditebak atau di-disable proaktif.
- [ ] Tidak ada evaluasi role/scope/policy yang direplikasi di klien.
- [ ] Mode remote menonaktifkan seluruh mutasi dengan banner.
- [ ] Paginasi server dan filter tercermin pada `queryKey`.
- [ ] Mutasi memakai konfirmasi, anti double-submit, dan refetch pasca-sukses.
- [ ] Konflik `409` dipetakan ke dialog dengan tindakan korektif.
- [ ] Ekspor memakai Bearer, menangani `403`/`429`, dan membaca header file.
- [ ] Tidak ada token/password di storage persisten, URL, atau log.
- [ ] Unit test klien + komponen hijau; minimal satu uji integrasi LAN per modul.
- [ ] Tidak ada tombol aktuasi mesin di seluruh panel.
- [ ] Tidak ada referensi ke endpoint yang tidak terdaftar
      (mis. `POST /clients/provision`).

Catatan jujur untuk project ini: poin "uji integrasi LAN per modul" **belum
bisa** dipenuhi sebelum backend ada — modul yang `Done` di Demo tetap
mencantumkan poin itu sebagai belum terpenuhi di V8.3, bukan dicentang paksa.

---

## 6. Cara kerja sehari-hari (Muse + Fathur)

### 6.1 Memulai pekerjaan

1. Ambil issue `Todo` dengan prioritas tertinggi di Epic yang sedang aktif.
2. Pindahkan ke `In Progress`, tulis komentar "Mulai: …" bila ada konteks.
3. Buat branch dari nama branch Linear issue itu
   (mis. `affdhikaad/fat-12-nama-issue` — Linear yang menghasilkan namanya).
4. Kerjakan di `~/workspace/iiot-oee-admin-panel/`, commit dengan pesan
   yang menyebut ID issue: `[FAT-12] …`.

### 6.2 Menyelesaikan pekerjaan

1. Verifikasi lokal: `npx tsc --noEmit` (0 error) + `npm test` + `npm run build`.
2. Push ke GitHub (`fadk-dev/iiot-oee-admin-panel`, `main` — pola snapshot
   yang selama ini dipakai, dengan approval Fathur).
3. Pindahkan issue ke `In Review`, komentar berisi: commit SHA, hasil
   test/build, dan apa yang **belum** terverifikasi.
4. Pindahkan ke `Done` hanya setelah verifikasi yang diminta issue itu
   selesai (untuk issue Demo: test/build hijau sudah cukup + catatan
   Demo-only; untuk issue verifikasi: hasil cek Fathur / backend).

### 6.3 Peran Fathur (yang hanya bisa dilakukan dia)

- Cek visual di browser sungguhan (`npm run dev`) — issue V8.1.
- Keputusan soal backend (kapan ada, URL-nya) — yang membuka blokir V8.2/V8.3.
- Pembuatan repo / import Vercel / env production — bukan di Linear, tapi
  hasilnya dicatat sebagai komentar di issue terkait.
- Approval push GitHub — tetap lewat kartu approval seperti selama ini.

### 6.4 Kalau ada temuan baru

- Temuan audit / bug baru → **buat issue baru** (label `Bug`, parent Epic
  yang relevan), jangan menumpang di issue yang sudah `Done`.
- Issue `Done` yang ternyata rusak → **reopen** (kembali ke `In Progress`)
  dengan komentar berisi bukti rusaknya, jangan buat duplikat diam-diam.
- Perubahan keputusan dokumen (mis. D-1/D-2 baru) → komentar di issue
  terkait + perbarui `AUDIT.md` §3.

### 6.5 Ritme

- **Tidak ada Sprint/Cycle paksa** untuk sekarang (tim 1 orang + Muse).
  Yang dipakai adalah Milestone per Fase (§1.2) + review mingguan singkat:
  tiap akhir minggu, lihat Project Overview — apa yang pindah ke `Done`,
  apa yang masih `blocked`, dan apa yang harus jadi `Todo` berikutnya.
- Kalau tim bertambah atau ada deadline backend, barulah Cycle mingguan
  diaktifkan di Linear — keputusan itu dicatat di issue E8, bukan diam-diam.

---

## 7. Keterkaitan GitHub ↔ Linear

| Di GitHub / repo | Di Linear |
| --- | --- |
| Commit / push | Komentar di issue + pindah ke `In Review` |
| `AUDIT.md` | Ringkasan audit per fase; issue berisi tautan ke bagiannya |
| `docs/linear-seed.json` | Cetak biru pembuatan issue (judul, deskripsi, status awal, label) |
| Branch Linear (`fat-xxx-...`) | Branch kerja untuk issue itu |
| PR / snapshot push | Disebut di komentar issue dengan SHA-nya |

`AUDIT.md` tetap menjadi laporan audit yang bisa dibaca tanpa Linear,
tapi status implementasi yang berlaku adalah status di Linear.

---

## 8. Status Linear — dibuat 2026-11-16 (terverifikasi)

- Koneksi Linear: **connected**, akses tulis diberikan Fathur 2026-11-16
  (`issues.create` + `projects.create` + `labels.create` + `issues.manage` +
  `projects.manage` + `comments.create` — semua `granted`).
- Tim: hanya `FAT / Fattr`. Pengguna: Fathur (`affdhikaad@gmail.com`, admin).
- Project: **IIoT OEE Admin Panel** — `P-FAT-1`,
  https://linear.app/fattr/project/iiot-oee-admin-panel-f2137236e571
- Label: 15 label §3 sudah dibuat (di luar `Bug`/`Feature`/`Improvement` bawaan).
- Issue: **246 issue terverifikasi** (238 per 20 Nov 2026 + 8 tiket baru E29
  FAT-239–FAT-246 dibuat 20 Nov 2026; `list_issues` 20 Nov mengembalikan 183 issue
  — FAT-1–FAT-4 + FAT-71–FAT-121 hilang dari hasil itu, diverifikasi lewat
  `get_issue` satu per satu seperti anomali triase E28):
  **207 Done, 2 In Progress, 37 Todo** (pasca verifikasi live E29 + reopen FAT-213/221, 20 Nov 2026),
  32 tanpa parent, 204 child dengan `parentId`. Total mencakup 4 issue
  onboarding bawaan Linear (FAT-1–FAT-4, Todo, bukan kerja proyek); tanpa
  keempatnya, total proyek = 232. Todo tersisa (62): 4 onboarding + 14 SYS-B
  terbuka + E13 (FAT-71) + V8.1/V8.3/V8.4/V8.5 (FAT-31/30/29/27) + A10.2
  (FAT-40) + E8 (FAT-7) + E22 (FAT-169) + N-2–N-5 (FAT-170/171/173/172) +
  E23 (FAT-174) + N-6 (FAT-175) + N-32 (FAT-202) + N-38 parsial (FAT-207) +
  N-40/N-41 (FAT-209/210) + E24 (FAT-211) + N-42 (FAT-212) + N-43 (FAT-213)
  + E25 (FAT-214) + E2E-01–E2E-11 (FAT-215–225) + E26 (FAT-226) +
  MUT-01–MUT-04 (FAT-227–230) + E27 (FAT-231) + T1–T3 + LOGIN + VERIFY
  (FAT-232–236) + FAT-237 (Q1, Todo) + FAT-238 (Q2, Todo).
  E28 (20 Nov 2026, AUDIT.md §38): triase 64 issue terbuka — 14 SUDAH SELESAI
  (FAT-175, 172, 82, 88, 94, 102–108, 112, 210) + 15 panel Batch A+B
  (FAT-215, 229, 227, 213, 218, 216, 217, 170, 207, 219, 230, 224, 220, 221, 225)
  ditutup = 29 Done; deskripsi 8 terblokir (FAT-74, 77, 83, 202, 209, 30, 40, 29)
  + 6 backend/verifikasi (FAT-171, 173, 212, 222, 223, 228) diperbarui, tetap Todo.
  Todo tersisa pasca-E28 (35): 4 onboarding (FAT-1–FAT-4) + E13 (FAT-71) + B3/B6/B12
  (FAT-74/77/83) + V8.1/V8.3/V8.4/V8.5 (FAT-31/30/29/27) + A10.2 (FAT-40) + E8
  (FAT-7) + E22 (FAT-169) + N-3/N-4 (FAT-171/173) + E23 (FAT-174) + N-32/N-40
  (FAT-202/209) + E24 (FAT-211) + N-42 (FAT-212) + E25 (FAT-214) + E2E-08/E2E-09
  (FAT-222/223) + E26 (FAT-226) + MUT-02 (FAT-228) + E27 (FAT-231) + T1–T3 + LOGIN
  + VERIFY (FAT-232–236) + FAT-237 + FAT-238.
  E23 Batch 1–4 (19 Nov 2026) menutup 31 issue panel (FAT-176–182, 183–191,
  192–201, 203–206, 208).
  In Progress: E10 (FAT-34) + V8.2 (FAT-28, tidak lagi Blocked sejak API
  live 19 Nov 2026 — AUDIT.md §27; tes browser-nya parkir menunggu perbaikan N-6).
  E22 (FAT-169, Todo, Medium) + 4 anak N-2–N-5 dari audit API live Fase 1,
  19 Nov 2026 (API_LIVE_AUDIT.md). N-1 (502 PATCH dynsec enable) TIDAK
  dijadikan issue — tidak terreproduksi pada verifikasi ulang parent
  16:03 WIB; transien restart backend ~15:52 WIB.
  E23 (FAT-174, Todo, High) + 36 anak N-6–N-41 dari audit endpoint vs api_docs
  live (OpenAPI), 19 Nov 2026 (API_DOCS_AUDIT.md). N-6 (FAT-175, Urgent) =
  CORS origin Vercel tidak diizinkan — blokir semua tes browser sampai backend
  memperbaikinya.
  E26 (FAT-226, Todo, High) + 4 anak MUT-01–MUT-04 dari uji mutasi E2E panel
  vs API live, 19 Nov 2026 (E2E_MUTATION_TEST.md + AUDIT.md §35): 35 mutasi
  lolos, 0x 403 dari Vercel meski Private (bukti empiris, A10.2 belum
  terbukti). MUT-02 (FAT-228, High) = backend (dengan caveat
  edge_publisher); MUT-01 (FAT-227, Medium) + MUT-03 (FAT-229, Medium) +
  MUT-04 (FAT-230, Low) = panel.
  E27 (FAT-231, Todo, High) + 5 anak T1 (FAT-232, High), T2 (FAT-233, High),
  T3 (FAT-234, Medium), LOGIN (FAT-235, High), VERIFY (FAT-236, Medium) dari
  Spec 043 (backend commit b4456eb, 20 Nov 2026) — Device Registry
  (/admin/stations) + station_label di audit + diagnostik login kiosk
  (AUDIT.md §37). Spec OpenAPI live STALE (0 hit station_label /
  STATION_NOT_FOUND / hostname). Implementasi panel selesai + terverifikasi
  lokal 20 Nov 2026 (tsc 0, tes 454/454, build OK, checker 0 FAIL) — tiket
  tetap Todo menunggu VERIFY live AC1–AC4 (FAT-236, browser, parent).
  E29 (FAT-239, Todo, High) + 7 anak T1 (FAT-240), T2 (FAT-241), T3
  (FAT-242), T4 (FAT-243), T5 (FAT-244), T6 (FAT-245), T7 (FAT-246) dari
  Spec 044 (20 Nov 2026) — migrasi login admin ke POST /auth/admin/login
  (AUDIT.md §39). Batch A (commit lokal 38752fc, tes 492/492) + Batch B
  (commit lokal e4d1d6a, tes 499/499) selesai + terverifikasi lokal;
  7 anak DITUTUP 20 Nov 2026 (FAT-240–246, bukti di AUDIT §39.8); epic
  FAT-239 DITUTUP Done 20 Nov 2026 setelah verifikasi live parent (login
  ADM-001 via endpoint baru berhasil dari Vercel, tanpa 403 — urutan gate vs
  auth TERJAWAB; AUDIT §39 + §40; Q-02 tertutup oleh migrasi ini, AUDIT
  §39.6). Todo tersisa pasca verifikasi live E29 + reopen (37): 35 pasca-E28
  + FAT-213 (N-43) + FAT-221 (E2E-07) — dibuka kembali 20 Nov 2026 setelah
  verifikasi live membuktikan penutupan E28 belum lengkap; perbaikan ulang
  selesai lokal (AUDIT §40), menunggu verifikasi live.
  E30 (FAT-248, Todo, High) + 12 anak dibuat 20 Nov 2026 dari keputusan Fathur (HMI tanpa login operator + station sebagai identitas terminal): H30.1 (FAT-249), H30.2 (FAT-250), H30.3 (FAT-251), H30.4 (FAT-252), H30.5 (FAT-253) HMI (repo fadk-dev/oee-hmi); P30.1 (FAT-254), P30.2 (FAT-255), P30.3 (FAT-256) admin-panel; B30.1 (FAT-257), B30.2 (FAT-258), B30.3 (FAT-259) backend (agen lain, tanpa akses backend sisi ini); D30.1 (FAT-260) docs. KONFLIK TERCATAT di deskripsi epic: HMI ADR-0004 (Accepted 20 Nov 2026) menolak QR-sebagai-autentikasi dan mewajibkan sesi operator — implementasi E30 butuh amandemen ADR-0004 + perubahan kontrak dispatch; HMI unit 003 (inisiasi QR dual-lane, T201–T213) sudah selesai + terdeploy — jangan duplikasi; FAT-238 ditutup Done agen lain 20 Nov 16:48 dalam kerangka login lama, kebutuhan audit baru dilacak di P30.3; FAT-237 tetap Todo. Total Linear pasca-E30: 260 issue (223 Done / 27 Todo / 2 In Progress / 7 In Review / 1 Canceled). Implementasi panel P30.1–P30.3 + HMI H30.1–H30.4 selesai lokal 20 Nov 2026 (AUDIT.md §42: panel tsc 0, tes 509/509, build OK, checker 0 FAIL; HMI tsc 0, lint:arch OK, vitest 215/215) — di-push 20 Nov 2026 (Push #8 panel 77121b5 + push HMI 12c22cd); 7 tiket pindah ke In Review.

  FAT-261 (standalone, tanpa epic, Done, Medium) — Panel konsumsi HEALTH_UPDATE dari WS (temuan audit WS health 20 Nov 2026): HEALTH_UPDATE tiap ~5 dtk selama ini tidak dibaca panel sama sekali; diperbaiki jadi event bertipe + mapper WS → DeviceHealth + DeviceHealthDrawer update live + badge "Live WS". Sistem health TIDAK diubah. Implementasi selesai lokal 20 Nov 2026 (AUDIT.md §43: tsc 0, tes 521/521, build OK, checker 0 FAIL) + di-push (Push #9, 06a73db) + terverifikasi LIVE 17:48–17:49 WIB (badge Live WS muncul, umur laporan 4 dtk → 0 dtk dan bertahan).

  FAT-262 (standalone, tanpa epic, In Review, Medium) — Hardening UI/UX sidebar (temuan Fathur 20 Nov 2026): (1) ikon Overview tidak center saat minimize → link pakai justify-center p-2 seperti ikon grup; (2) break line antar grup hilang saat minimize → divider border-slate-800 antar grup (kecuali sebelum grup pertama). Lingkup: src/layouts/Sidebar.tsx saja. Implementasi selesai lokal 20 Nov 2026 (AUDIT.md §44: tsc 0, tes 521/521, build OK, checker 0 FAIL) + di-push (Push #11, 7c6a6ba); verifikasi visual live menyusul.

  E31 (FAT-263, Todo, High) + anak E31.1 (FAT-264, In Progress) dibuat 20 Nov 2026 dari perintah Fathur: audit struktur UI + refactoring modular per halaman (admin-panel SAJA — bukan HMI/backend). Latar: DIRECTORY_STRUCTURE.md (R9) sudah menegakkan batas keras (checker 0 FAIL) tapi tidak menangkap halaman yang menanam tab/modal/tabel inline, komponen multi-concern, dan pola UI yang diduplikasi lintas fitur. Tahapan: audit → aturan pondasi docs/UI_STRUCTURE_RULES.md → refactor per halaman/domain. Total Linear: 264 issue (224 Done / 28 Todo / 3 In Progress / 8 In Review / 1 Canceled). Koreksi: inReview sebelumnya tertulis 6, seharusnya 7 pasca-E30 lalu 8 pasca-FAT-262. Audit selesai 20 Nov 2026 ~19:23 WIB (laporan ~/workspace/ui-audit-findings.md, 312 baris; angka utama diverifikasi ulang): 43 file melewati batas lunak; 6 file tinggal 1–16 baris dari FAIL (useBrokerConfig 249/250, useOeeAnalytics 247/250, TelemetryTabPanels 296/300, DowntimeEventsPage 584/600); DataTable 5 pemakai vs 16 tabel hand-rolled; ui/Select 1 pemakai vs 29 file <select> mentah; 4 halaman CRUD production klon kerangka sama; aturan 5 kontrak BERSIH (0 pelanggaran). Aturan pondasi ditulis ke docs/UI_STRUCTURE_RULES.md (5 prinsip + 10 aturan R1–R10 + anatomi halaman modular + katalog reusable). Tiket refactor dibuat 20 Nov 2026 (semua Todo): P0 E31.2–E31.5 (FAT-265–268), P1 E31.6–E31.10 (FAT-269–273), P2 E31.11–E31.14 (FAT-274–277), P3 E31.15–E31.16 (FAT-278–279). Urutan yang disarankan: P0 → P1 → P2 → P3. Koreksi hitungan: seed v35 ditulis sebelum FAT-264 pindah ke Done, jadi Done saat itu 225 bukan 224. Ronde 1 (perintah Fathur 19:33 WIB, prioritas production/assets/analytics): E31.11 (FAT-274) Done — 4 halaman CRUD 413/402/379/454 → 283/278/269/335; E31.3 (FAT-266) + E31.4 (FAT-267) Done — useOeeAnalytics dipecah per query (bentuk kembalian identik, 42 field), TelemetryTabPanels 296→30 + 4 panel (rollup ternyata tab ke-4); E31.14 (FAT-277) tetap In Progress — bagian assets + analytics selesai (DeviceDetailModal/DeviceHealthDrawer pindah ke components/, DeviceDetailModal dipecah 392→193, MachineDetailModal 222→157, ShiftTimeline 272→182; overlay-nya ternyata sudah terpisah sejak R9.2), bagian system + mqtt tetap Todo. Prinsip Fathur 19:42 WIB: baris target bukan target mutlak — yang utama pemisahan komponen kontainer UI dan pemisahan tanggung jawab (UI_STRUCTURE_RULES.md prinsip 0 + R8); target ~200 baris/page E31.11 dinyatakan tidak berlaku. Verifikasi pusat ronde 1: tsc 0, tes 521/521, build OK, checker 0 FAIL / 39 WARN. Catatan push: push_files tidak bisa menghapus file — path lama DeviceDetailModal/DeviceHealthDrawer di root assets jadi orphan di remote (butuh persetujuan Fathur untuk hapus). Ronde 2 (perintah Fathur 19:54 WIB "lanjutkan", P1 fondasi dulu): E31.6–E31.10 (FAT-269–273) Done — <select> mentah 55 blok → 0 (2 bypass Topbar), 9 konversi LoadErrorBanner/EmptyStateBlock, utils/formatDate.ts + 42 penggantian, FilterBar generik (4 digabung, 2 bypass), 13 tabel migrasi ke DataTable (pemakai 8 → 21; 4 bypass). Delta visual kecil: empty state baru di 5 tabel, loading jadi skeleton, header "Aksi" rata kiri, border rounded-lg. Verifikasi pusat ronde 2 + FAT-280: tsc 0, tes 531/531, build OK, checker 0 FAIL / 41 WARN. Ronde 3 (perintah Fathur 20:41 WIB "lanjutkan", 3 agen paralel): kelompok A (P0) selesai lokal + di-push (Push #15) — E31.2 (FAT-265) useBrokerConfig 249→125 + 6 sub-hook per concern (bentuk kembalian identik 30 field), E31.5 (FAT-268) DowntimeEventsPage 558→391 (export+cooldown → hook, kolom → komponen). FAT-265/268 tetap In Progress — verifikasi pusat penuh ditunda sampai B/C selesai (tsc tree campuran saat push: 6 error, semuanya di file B/C yang masih dikerjakan). Kelompok B (P2 sisa) + C (P3) selesai lokal 20:47–20:48 WIB + di-push (Push #16 commit 461f3e4) — E31.12 (FAT-275) Overview 456→355 + LiveState 292→194; E31.13 (FAT-276) Topbar 371→304 + ChangePasswordModal di layouts/components/ + BackendHealthIndicator pindah; E31.14 (FAT-277) SELESAI SELURUHNYA (RolesTab, OperatorDetailModal, Mqtt*Modals per modal); E31.15 (FAT-278) dto/types/mappers per domain + barrel; E31.16 (FAT-279) telemetrySocket + historyFilters + shared/ dirapikan (shim TableStateRow analytics dihapus). Perbaikan parent saat verifikasi: import BackendHealthIndicator, export pctOrNull, useHistoricalQueries 280 (FAIL batas keras hook) dipecah jadi master 61 + data 239 + barrel. Verifikasi pusat ronde 3: tsc 0, tes 535/535, build OK, checker 0 FAIL / 32 WARN, 409 file. **E31 SELESAI SELURUHNYA — 16/16 tiket Done.** Total Linear: 289 issue (242 Done / 35 Todo / 2 In Progress / 9 In Review / 1 Canceled).

  E32 (FAT-281, Todo, High) — Struktur lanjutan: tes, demo seed & layanan inti. Arah ditentukan 2026-11-20 ~20:50 WIB (perintah Fathur: perbarui todo Linear + tentukan arah lanjutan), dari bukti checker (0 FAIL / 32 WARN, 409 file): E32.1 (FAT-282, High) AuthContext 293/300 — 7 baris dari batas keras; E32.2 (FAT-283, High) file tes dekat batas keras — modeAndTransport 792/800 + telemetryRange 739; E32.3 (FAT-284, Medium) sisa file tes besar — deviceMachineBinding 592, contractAlignment 560, e23-batch3 544; E32.4 (FAT-285, Medium) layanan inti — transport 522, mode 453, mqttConfig 404, iam 401, reconciliation 406; E32.5 (FAT-286, Medium) demo seed — machines 519, oee 489, devices 485, roles 482, monitoring 445, helpers 415; E32.6 (FAT-287, Medium) UI shell — DataTable 305, Topbar 305, HistoricalExportToolbar 289, Sidebar 288; E32.7 (FAT-288, Low) sisa WARN feature + types — DeviceHealthDrawer 221, DeviceTable 220, useDevices 214, WorkOrderDetailModal 213, OperatorsTable 203, useStations 195, useRolePermissions 188, useOperatorCrud 187, mqtt-config 343, specs 343, useHistoryDataQueries 239, useDowntimeEventColumns 150. Prinsip 0 tetap berlaku. Terkait (bukan bagian E32, butuh keputusan Fathur): cleanup orphan remote (DeviceDetailModal/DeviceHealthDrawer + MachineDetailModal di root assets, 3 Mqtt*Modals, shim TableStateRow, salinan doc path lama). **E32 SELESAI SELURUHNYA 2026-11-21 ~00:10 WIB lokal + push 07:15 WIB (snapshot 315954c + 16 hapus file; remote 5e4ced9, pohon identik) — 8/8 tiket Done.**

  E33 (FAT-290, Todo, High) — Pisahkan Audit Trail dari Operational Events (arsitektur 3 store). Keputusan Fathur 2026-11-21: Opsi 3 dari analisis `~/workspace/audit-vs-operational-events-analysis.md` (satu tipe `AuditLogItem = OperationalEvent`, satu enum 32 nilai, `/system/audit` = alias feed operasional, kolom ack memutasi baris audit, demo dua store vs live satu tabel). Target pola industri (ISA-18.2 + 21 CFR Part 11 §11.10(e)): (1) Alarm & Event journal stateful + ack + rtn-unacknowledged; (2) Audit trail append-only who/what/when/why + old→new, tanpa jalur update/delete; (3) IAM audit sudah terpisah — biarkan. Anak: P33.1 (FAT-291, Medium) AuditTrailPage jadi arsip murni; P33.2 (FAT-292, Medium) OperationalEventsPage jadi daftar kerja + rtn-unacknowledged; P33.3 (FAT-293, Low) demo satukan store; P33.4 (FAT-294, Medium) panel konsumsi kontrak baru — bergantung B33.1/B33.2; B33.1 (FAT-295, High) backend jawab R-18/R-19 + kontrak kategori; B33.2 (FAT-296, High) backend audit trail store terpisah append-only; B33.3 (FAT-297, High) backend ack menulis entri audit baru tanpa memutasi baris audit; B33.4 (FAT-298, Medium) backend state rtn-unacknowledged; D33.1 (FAT-299, Medium) ADR + kriteria selesai. Total Linear: 299 issue (258 Done / 31 Todo / 1 In Progress / 8 In Review / 1 Canceled). Catatan verifikasi 2026-11-21: hitungan diverifikasi langsung (list 232 + 57 get_issue susulan); FAT-34 + FAT-40 ternyata sudah Done; In Progress tinggal FAT-28. **Implementasi panel P33.1–P33.3 SELESAI LOKAL 2026-11-21 ~07:56 WIB (3 subagen paralel + perbaikan dedup parent):** P33.1 kolom Ack dihapus + subjudul jujur + tautan silang; P33.2 helper getEventAckState + badge "Clear — belum di-ack" + subjudul tanpa "audit"; P33.3 demo satu store (auditLogs dihapus, addAudit → operationalEvents) + dedup bind/unbind (2 entri → 1). Verifikasi pusat: tsc 0, tes 556/556, build OK, checker 0 FAIL / 33 WARN (WARN baru: seeds/monitoring.ts 526/500 lunak). P33.4 tetap Todo (tunggu backend). Total Linear: 299 issue (259 Done / 28 Todo / 4 In Progress / 7 In Review / 1 Canceled) — diverifikasi ulang 2026-11-21 ~08:00 WIB (list 242 + 57 get_issue susulan). **PUSH #18 690ff55 2026-11-21 ~09:01 WIB; verifikasi visual live 09:55-10:01 WIB (ADM-001): P33.1 LOLOS semua (subjudul persis, kolom Ack hilang, tautan silang jalan); P33.2 LOLOS semua (subjudul tanpa "audit", tautan jalan, badge "Belum Ack" + "Clear - belum di-ack" TERBUKTI tampil - OFFLINE 20 Nov 16.53 -> ONLINE 16.54 STM32-OEE-SIM; kontrol OFFLINE 17.21 tetap "Belum Ack" karena ONLINE lebih barunya di halaman 1, limitasi best-effort); P33.3 Done (bukti tes, visual live tidak berlaku - live mode Real). FAT-291/292/293 -> Done. Cacat baru di luar E33: catatan ack menumpuk JSON panjang di kolom Pesan (tanpa break-words) - perbaikan menunggu perintah. Total Linear: 299 issue (262 Done / 28 Todo / 1 In Progress / 4 In Review / 1 Canceled). Seed v42.** **Keputusan Fathur 2026-11-21 10:20 WIB: setuju SEMUA rancangan analisis halaman (~/workspace/analisis-halaman-opsi-3.md) — 3 halaman, Audit IAM jadi halaman penuh, ganti nama + rute /audit -> /admin/alarms, mulai tahap A-C sekarang. Tiket baru: P33.5 FAT-300 (tahap A, 2 tampilan + filter State), P33.6 FAT-301 (tahap B, Audit IAM halaman penuh), P33.7 FAT-302 (tahap C, rute kanonik + redirect + tautan silang; Todo, bergantung P33.5/P33.6). Total Linear: 302 issue (262 Done / 31 Todo / 3 In Progress / 4 In Review / 1 Canceled). Seed v43.** **Implementasi panel tahap A-C SELESAI LOKAL 2026-11-21 ~10:35 WIB (P33.5 + P33.6 paralel 2 subagen, P33.7 parent): P33.5 2 tampilan + filter State (eventView.ts + 13 tes; jumlah tab batas bawah "N+" karena tanpa COUNT total); P33.6 Audit IAM halaman penuh /admin/iam-audit (AuditTab.tsx dihapus; export CSV + pintasan DENY + filter Resource/Action; paginasi CLIENT-SIDE karena endpoint tanpa cursor/offset); P33.7 rute kanonik /admin/alarms + redirect rute lama + tautan silang 3 halaman + "Alarm & Event". Verifikasi pusat: tsc 0, tes 575/575, build OK, checker 0 FAIL / 35 WARN. Push + verifikasi visual live menyusul. Total Linear: 302 issue (262 Done / 30 Todo / 1 In Progress / 7 In Review / 1 Canceled). Seed v44.** **P33.5–P33.7 SELESAI + Done (verifikasi visual live 2026-11-21 10:33–10:35 WIB lolos semua: tab + filter State, Audit IAM + DENY + paging, redirect rute lama, tautan silang; catatan: State="Sudah ack" 0 baris di 7/90 hari). CACAT BACKEND: semua Waktu Audit IAM "01 Jan 1970" — backend tanpa timestamp ISO; tiket baru FAT-303 (B33.5, High). Spec kebutuhan backend: docs/BACKEND_REQUIREMENTS_E33_PAGES.md (§1–§5 + payload, urutan §5→§1→§2→§3→§4). Total Linear: 303 issue (265 Done / 31 Todo / 1 In Progress / 4 In Review / 1 Canceled). Seed v45.** **P33.8 (FAT-304, temuan Fathur 10:44 WIB): filter Event Type per halaman mengikuti keluarga — Alarm = operasional (14), Audit = sistem (18), helper eventCategory.ts + 5 tes. Selesai lokal, verifikasi pusat tsc 0 / tes 580/580 / build OK / checker 0 FAIL. Total Linear: 304 issue (265 Done / 31 Todo / 1 In Progress / 5 In Review / 1 Canceled). Seed v46.** **P33.8 (FAT-304) Done — verifikasi visual live 2026-11-21 10:53–10:54 WIB lolos (dropdown Alarm 15 opsi operasional, Audit 19 opsi sistem; filter bekerja). Total Linear: 304 issue (266 Done / 31 Todo / 1 In Progress / 4 In Review / 1 Canceled). Seed v47.** **FAT-303 (B33.5) Done 2026-11-23 — Waktu Audit IAM terverifikasi live benar (hal. 1–2 + DENY), "01 Jan 1970" hilang; cursor paging belum terverifikasi live lewat panel → tiket baru P33.9 FAT-305 (Todo, anak FAT-290). FAT-306 (2026-11-23, High, standalone): Analytics/Telemetry — mesin default hardcode CNC-MILLING-01 tidak ada di live (live = CNC-MILLING-SIM); ringkasan/timeline/Per Jam gagal dimuat. Diagnostik live membuktikan mesin adalah penyebabnya (URL ?machine_id=CNC-MILLING-SIM → ketiga error hilang). Perbaikan panel: resolveDefaultMachineId() baru + useOeeAnalyticsBase memakai default dari daftar live (pola FAT-170); Telemetry tidak diubah (sudah benar). Verifikasi pusat: tsc 0, tes 581/581, build OK, checker 0 FAIL; AUDIT.md §59. Total Linear: 306 issue (267 Done / 32 Todo / 2 In Progress / 3 In Review / 1 Canceled). Seed v48.** **Koreksi hitungan 2026-11-23 (sweep, list includeArchived + paginasi):** seed v48 SALAH (total 306, In Review 3). Hitungan benar: **Total Linear: 304 issue (279 Done / 16 Todo / 1 In Progress / 7 In Review / 1 Canceled). Seed v49.** Perubahan sejak v48: FAT-211 + FAT-226 ditutup (epik E24/E26 selesai); FAT-306 + FAT-256 + FAT-254 + FAT-255 + FAT-236 + FAT-299 Done (verifikasi live 23 Nov); FAT-295–298 (B33.1–B33.4) ditutup agen lain 23 Nov 10:12 WIB; tiket baru FAT-307 (rollup TANGGAL) + FAT-308 (catatan modal basi); FAT-294 + FAT-307 + FAT-308 → In Review (implementasi selesai lokal, pusat verifikasi hijau, menunggu push + verifikasi live); FAT-305 (P33.9) implementasi selesai lokal, diparkir untuk besok. Terbuka 24.

  FAT-280 (standalone, tanpa epic, Done, High) — Bug: reload selalu minta login ulang. Diagnosis 2026-11-20 ~19:57 WIB: BUKAN bug kode — konsekuensi desain D5 (token hanya di memori). TEMUAN PENTING: tidak ada refresh token di mana pun (panel grep = 0; backend /auth/refresh hanya menerima JWT yang masih berlaku) — dicatat di komentar tiket + AUDIT.md §47; opsi jangka panjang (refresh token terpisah / cookie httpOnly) butuh tiket backend, belum dibuat. Keputusan Fathur 20:01 WIB: Opsi B (sessionStorage + silent restore). Implementasi selesai lokal 2026-11-20 ~20:09 WIB (transport.ts persist sessionStorage, authSessionRestore.ts baru + 10 tes, AuthContext + AdminLayout "Memulihkan sesi…"; restore hanya mode Real; batas reload >900 dtk tetap login ulang). Verifikasi pusat: tsc 0, tes 531/531, build OK, checker 0 FAIL — termasuk 3 tes auth yang sempat gagal dan diperbaiki parent (token rotasi tidak disimpan helper; tes integrasi 401 gagal palsu karena reuse port stub 3061). Di-push (Push #14); verifikasi LIVE 20:42 WIB GAGAL (race render pertama) — diperbaiki (shouldRestoreAtBoot + redirect LoginPage, Push #16) — **TERVERIFIKASI LIVE 2026-11-20 21:01–21:03 WIB: 5/5 langkah lulus → Done.** Follow-up panel: FAT-289 (konsumsi refresh token terpisah).

  FAT-289 (standalone, tanpa epic, In Review, High) — Panel: konsumsi refresh token terpisah (follow-up FAT-280). Perintah Fathur 21:17 WIB: target seperti Opsi B, backend dikerjakan di tempat lain, panel bagian Muse. Backend belum live saat implementasi (OpenAPI masih kontrak lama {token}; belum ada tiket backend refresh token di Linear). Implementasi panel selesai lokal 2026-11-20 ~21:22 WIB: skema login/refresh terima refresh_token opsional (+ refresh_expires_in); refresh token disimpan di sessionStorage (kunci iiot-oee-refresh-token, write-through seperti FAT-280); refreshSession pakai refresh token bila ada, fallback access token (kompatibel mundur — panel tetap jalan terhadap backend lama); rotasi disimpan; logout/401 hapus kedua token; shouldRestoreAtBoot true bila salah satu token tersimpan; AuthContext tidak diubah (292/300). Koreksi parent: subagen sempat mengirim refresh token dalam field baru {refresh_token} — dikembalikan ke field {token} yang sama sesuai kontrak OpenAPI live (bila backend memakai {refresh_token}, satu baris yang diubah). Tanpa credentials:include (varian cookie = follow-up terpisah). Verifikasi pusat: tsc 0, tes 546/546 (11 tes baru), build OK, checker 0 FAIL / 32 WARN, 410 file. Di-push (Push #17); verifikasi live MENUNGGU backend live.
  Riwayat: 28 issue awal + E9/R9.1–R9.6 dibuat 2026-11-16 ~14:20 WIB
  (R9.2–R9.6 Done malam itu); E11/T11.1–T11.6 dibuat 2026-11-16 malam dari
  audit telemetry `docs/TELEMETRY_AUDIT.md`, Done 2026-11-16 malam —
  AUDIT.md §14, Epic E11 ditutup 2026-11-17; E12/T12.1–T12.19 dibuat
  2026-11-17 dari `docs/E12_PROPOSAL.md` — admin-panel saja, infra Nginx +
  backend dikecualikan, Done 2026-11-17 — AUDIT.md §15, Epic E12 ditutup
  2026-11-17, di-push `af5011f`; T12.6a (Opsi A, FAT-70) dibuat 2026-11-17
  atas keputusan Fathur, Done 2026-11-17 — AUDIT.md §15; E13/SYS-B1–SYS-B50 dibuat 2026-11-17 dari `docs/BACKEND_GAPS_SYSTEM_ADMIN.md` — gap backend System Admin, belum dikerjakan, Epic E13 Todo; E14/P14.1–P14.5 dibuat 2026-11-17 dari keputusan Fase 0 Fathur (decision log Lampiran C `docs/BACKEND_UPGRADE_PLAN.md`) — tindak lanjut panel, Done 2026-11-17 — AUDIT.md §17, Epic E14 ditutup 2026-11-17; E15/P15.1–P15.5 dibuat 2026-11-17 dari keputusan Fathur mengikuti desain API_DOCUMENTATION untuk K-05/K-06/K-07 (decision log Lampiran C `docs/BACKEND_UPGRADE_PLAN.md`) — tindak lanjut panel, Done 2026-11-17 — AUDIT.md §18, Epic E15 ditutup 2026-11-17; E16/P16.1–P16.4 dibuat 2026-11-17 dari permintaan Fathur menyinkronkan dokumen panduan upgrade backend — Done 2026-11-17 — AUDIT.md §19, Epic E16 ditutup 2026-11-17; E17/P17.1–P17.4 dibuat 2026-11-18 dari permintaan Fathur menganalisis relevansi keputusan Fase 0 vs keputusan backend 18 Nov (SYS-B8–B50, Fathur) & real-case industri — Done 2026-11-18 — AUDIT.md §20, Epic E17 ditutup 2026-11-18; E18/P18.1–P18.4 dibuat 2026-11-18 dari delegasi Fathur menutup seluruh keputusan gap (22 item: 4 pembalikan diterima, 4 Fase 0 dikonfirmasi tetap, 7 gap baru, 7 arah panel) — Done 2026-11-18 — AUDIT.md §21, Epic E18 ditutup 2026-11-18; E19/P19.1–P19.2 dibuat 2026-11-18 dari permintaan Fathur memperbarui gaps doc agar semua gap tertutup + push — tabel status 50/50 (39 backend 18 Nov, 6 delegasi E18, 5 panel-side); "tertutup" = keputusan tercatat, SYS-B1–B50 tetap Todo — Done 2026-11-18 — AUDIT.md §22, Epic E19 ditutup 2026-11-18; E20/P20.1 dibuat 2026-11-19 dari API docs terupdate Fathur (diff 294 entri, P20.1 Done) + P20.7 dibuat 2026-11-19 dari permintaan Fathur mengikuti api_docs (D-1–D-14 diputuskan, dokumen tinjau-ulang baru, gaps lama diarsipkan) — AUDIT.md §23, Epic E20 masih berjalan (implementasi batch menunggu kata Fathur); implementasi 4 batch SELESAI + terverifikasi independen 2026-11-19 (AUDIT.md §24) — Epic E20 ditutup 2026-11-19, 2 temuan verifikasi diperbaiki parent (test tanggal PeriodRangePicker + pola terlarang /clients/provision); FAT-168 (arsip dokumen gap + perbarui dokumentasi admin panel) dibuat 2026-11-19, Done 2026-11-19 — AUDIT.md §26.
- Status tim: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`,
  `Canceled`, `Duplicate` — dipakai apa adanya (lihat §2).

### Pemetaan kunci → nomor Linear

| Kunci | Issue Linear | Kunci | Issue Linear |
| --- | --- | --- | --- |
| E1 Fase 1 | FAT-9 | F3.3 | FAT-26 |
| E2 Fase 2 | FAT-5 | F3.4 | FAT-20 |
| E3 Fase 3 | FAT-12 | F3.5 | FAT-23 |
| E4 Fase 4 | FAT-10 | F3.6 | FAT-24 |
| E5 Fase 5 | FAT-6 | F4.1 | FAT-25 |
| E6 Fase 6 | FAT-11 | F5.1 | FAT-22 |
| E7 Fase 7 | FAT-8 | F6.1 | FAT-21 |
| E8 Verifikasi | FAT-7 | F7.1 | FAT-32 |
| F1.1 | FAT-14 | V8.1 | FAT-31 |
| F1.2 | FAT-15 | V8.2 | FAT-28 |
| F1.3 | FAT-16 | V8.3 | FAT-30 |
| F1.4 | FAT-13 | V8.4 | FAT-29 |
| F2.1 | FAT-19 | V8.5 | FAT-27 |
| F3.1 | FAT-18 | R9.4 | FAT-38 |
| F3.2 | FAT-17 | R9.5 | FAT-39 |
| E9 Refactoring | FAT-33 | R9.6 | FAT-42 |
| R9.1 | FAT-35 | E10 Akses | FAT-34 |
| R9.2 | FAT-37 | A10.1 | FAT-41 |
| R9.3 | FAT-36 | A10.2 | FAT-40 |
| E11 Telemetry | FAT-43 | T11.1 | FAT-44 |
| T11.2 | FAT-47 | T11.3 | FAT-48 |
| T11.4 | FAT-46 | T11.5 | FAT-45 |
| T11.6 | FAT-49 | | |
| E12 Lanjutan | FAT-50 | T12.1 | FAT-54 |
| T12.2 | FAT-51 | T12.3 | FAT-53 |
| T12.4 | FAT-55 | T12.5 | FAT-52 |
| T12.6 | FAT-56 | T12.7 | FAT-60 |
| T12.8 | FAT-61 | T12.9 | FAT-62 |
| T12.10 | FAT-57 | T12.11 | FAT-59 |
| T12.12 | FAT-58 | T12.13 | FAT-63 |
| T12.14 | FAT-66 | T12.15 | FAT-67 |
| T12.16 | FAT-68 | T12.17 | FAT-69 |
| T12.18 | FAT-65 | T12.19 | FAT-64 |
| T12.6a | FAT-70 | | |
| E13 Backend gaps | FAT-71 | SYS-B1 | FAT-72 |
| SYS-B2 | FAT-73 | SYS-B3 | FAT-74 |
| SYS-B4 | FAT-75 | SYS-B5 | FAT-76 |
| SYS-B6 | FAT-77 | SYS-B7 | FAT-78 |
| SYS-B8 | FAT-79 | SYS-B9 | FAT-80 |
| SYS-B10 | FAT-81 | SYS-B11 | FAT-82 |
| SYS-B12 | FAT-83 | SYS-B13 | FAT-84 |
| SYS-B14 | FAT-85 | SYS-B15 | FAT-86 |
| SYS-B16 | FAT-87 | SYS-B17 | FAT-88 |
| SYS-B18 | FAT-89 | SYS-B19 | FAT-90 |
| SYS-B20 | FAT-91 | SYS-B21 | FAT-92 |
| SYS-B22 | FAT-93 | SYS-B23 | FAT-94 |
| SYS-B24 | FAT-95 | SYS-B25 | FAT-96 |
| SYS-B26 | FAT-97 | SYS-B27 | FAT-98 |
| SYS-B28 | FAT-99 | SYS-B29 | FAT-100 |
| SYS-B30 | FAT-101 | SYS-B31 | FAT-102 |
| SYS-B32 | FAT-103 | SYS-B33 | FAT-104 |
| SYS-B34 | FAT-105 | SYS-B35 | FAT-106 |
| SYS-B36 | FAT-107 | SYS-B37 | FAT-108 |
| SYS-B38 | FAT-109 | SYS-B39 | FAT-110 |
| SYS-B40 | FAT-111 | SYS-B41 | FAT-112 |
| SYS-B42 | FAT-113 | SYS-B43 | FAT-114 |
| SYS-B44 | FAT-115 | SYS-B45 | FAT-116 |
| SYS-B46 | FAT-117 | SYS-B47 | FAT-118 |
| SYS-B48 | FAT-119 | SYS-B49 | FAT-120 |
| SYS-B50 | FAT-121 |  |  |
| E14 Tindak lanjut panel | FAT-122 | P14.1 | FAT-123 |
| P14.2 | FAT-124 | P14.3 | FAT-125 |
| P14.4 | FAT-126 | P14.5 | FAT-127 |
| E15 K-05/K-06/K-07 ikuti API doc | FAT-128 | P15.1 | FAT-129 |
| P15.2 | FAT-130 | P15.3 | FAT-131 |
| P15.4 | FAT-132 | P15.5 | FAT-133 |
| E16 Sinkronisasi dokumen panduan | FAT-134 | P16.1 | FAT-135 |
| P16.2 | FAT-136 | P16.3 | FAT-137 |
| P16.4 | FAT-138 | E17 Analisis relevansi Fase 0 | FAT-139 |
| P17.1 | FAT-140 | P17.2 | FAT-141 |
| P17.3 | FAT-142 | P17.4 | FAT-143 |
| E18 Penutupan keputusan gap | FAT-144 | P18.1 | FAT-145 |
| P18.2 | FAT-146 | P18.3 | FAT-147 |
| P18.4 | FAT-148 | E19 Gaps doc semua gap tertutup | FAT-149 |
| P19.1 | FAT-150 | P19.2 | FAT-151 |
| E20 Sinkronisasi API terupdate | FAT-152 | P20.1 | FAT-153 |
| P20.2 | FAT-154 | P20.3 | FAT-155 |
| P20.4 | FAT-156 | P20.5 | FAT-157 |
| P20.6 | FAT-158 | P20.7 | FAT-159 |
| E21 Penutupan backend sync/gaps | FAT-160 | P21.1 | FAT-161 |
| P21.2 | FAT-162 | P21.3 | FAT-163 |
| P21.4 | FAT-164 | P21.5 | FAT-165 |
| P21.6 | FAT-166 | P21.7 | FAT-167 |

Perhatian: nomor FAT tidak berurutan per fase — Linear memberinya sesuai
urutan pembuatan paralel, jadi selalu pakai tabel ini (dan `docs/linear-seed.json`
bagian `created`), bukan tebakan urutan.

### Yang belum bisa dibuat lewat API

- **Milestone M1–M8 (§1.2) belum ada di Linear.** Konektor Linear yang
  tersedia tidak menyediakan tool membuat/mendaftar milestone, dan
  `save_issue` menolak nama milestone yang belum ada — jadi field
  `milestone` di `linear-seed.json` belum diterapkan ke issue. Kalau mau
  milestone tampil di Project Overview, buat M1–M8 manual di Linear
  (Project → Milestones), lalu pasang ke issue lewat UI. Sampai saat itu,
  label `fase-*` adalah penanda fase yang berlaku.
- Deskripsi FAT-17 sempat tersimpan sebagai `string\[\]` (artefak escaping
  saat pembuatan) — sudah diperbaiki 2026-11-16 menjadi `string array`.
