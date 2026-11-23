# ADR-E33 — Arsitektur 3 Store: Alarm & Event, Audit Trail, Audit IAM

- **Status:** Accepted (keputusan Fathur)
- **Tanggal keputusan:** 2026-11-21 (07:44 WIB dibuat sebagai E33; 10:20 WIB Fathur menyetujui
  semua rancangan analisis halaman; 10:05 WIB Fathur mengingatkan target pengembangan adalah
  Opsi 3 — arsitektur jangka panjang, sesuai industri)
- **Epic:** FAT-290 (E33 — Pisahkan Audit Trail dari Operational Events)
- **Tiket keputusan ini:** FAT-299 (D33.1)
- **Dokumen analisis:** `~/workspace/audit-vs-operational-events-analysis.md`,
  `~/workspace/analisis-halaman-opsi-3.md`
- **Spesifikasi kebutuhan backend:** `docs/BACKEND_REQUIREMENTS_E33_PAGES.md`
- **Status implementasi saat ADR ditulis (2026-11-23):** panel P33.1–P33.3 + P33.5–P33.8 Done
  dan terverifikasi live; P33.4 (FAT-294) sedang dikerjakan; P33.9 (FAT-305) dijadwalkan besok;
  B33.5 (FAT-303) Done live; B33.1–B33.4 (FAT-295–298) In Review — kontraknya live di OpenAPI,
  perilaku live-nya dibuktikan lewat P33.4.

## Konteks

Backend hanya punya SATU tabel event (`operational_events`) dengan SATU enum tertutup 32 nilai.
`/system/audit` adalah alias dari feed operasional yang sama (api_docs §I) — bukan store audit
yang terpisah. `AuditLogItem = OperationalEvent` di panel. Ack memutasi baris audit: sebuah
audit trail yang bisa berubah bukan arsip. Mode demo menyembunyikan pencampuran ini (2 store
di demo vs 1 tabel di live). Satu-satunya permukaan audit yang benar-benar terpisah adalah
audit IAM.

Acuan industri: ISA-18.2 / IEC 62682 (siklus hidup alarm, termasuk rtn-unacknowledged;
ack ≠ perbaikan; ack = entri historian tersendiri), 21 CFR Part 11 §11.10(e) + EU Annex 11 /
ALCOA+ (append-only, independen, siapa/apa/kapan/mengapa + old→new, waktu server), ISA-95.

## Keputusan

Arsitektur target adalah **3 store, 3 halaman — satu halaman per store**:

1. **Alarm & Event** — journal operasional stateful (`/admin/alarms`): 2 tampilan dalam 1 halaman
   ("Perlu Tindakan" / "Riwayat"), filter State, hitung tab. Sumber: `GET /operational-events`
   dengan `category=operational`. Ack terjadi di sini dan menulis SATU entri audit baru
   (bukan memutasi baris audit).
2. **Audit Trail** — arsip append-only (`/admin/system-audit`): kolom old→new + alasan + nomor
   entri, filter QA. Sumber: `GET /system/audit-trail` (store terpisah). Tidak ada jalur
   update/delete; ack tidak pernah menyentuh baris ini.
3. **Audit IAM** — halaman penuh (`/admin/iam-audit`, naik dari tab): ekspor CSV + paging +
   pintasan "Hanya DENY". Sumber: `GET /access-control/audit` (sudah terpisah sejak awal).

Rute lama `/audit` dan `/admin/audit` dialihkan ke `/admin/alarms`; `/system-audit` ke
`/admin/system-audit`. Tautan silang wajib di ketiga halaman.

## Batas Opsi 3 (yang TIDAK diubah)

- Enum event tetap 32 nilai — tidak ada nilai baru, tidak ada pemecahan enum.
- Jalur ingestion event tidak berubah (HMI dan perangkat tetap mengirim event seperti biasa;
  backend yang merutekan ke store yang tepat).
- Audit IAM tetap seperti sekarang sebagai store — yang berubah hanya paging panelnya
  (P33.9: client-side → server-side cursor).
- Mode demo tetap satu store in-memory (P33.3): ketiga halaman demo membaca satu store yang
  sama dan difilter per halaman menurut keluarga event. Pemisahan 3 store adalah kontrak
  mode Real/live; demo mensimulasikan tampilannya, bukan store-nya.

## Kontrak (ringkas; detail di `docs/BACKEND_REQUIREMENTS_E33_PAGES.md`)

- `GET /operational-events`: param `category` (`operational`|`system`), per baris `category`,
  `alarmState`, `condition` (ACTIVE/CLEAR/NORMAL); pagination `count`, `counts`
  `{activeUnack, rtnUnack, acked}`, `totalCount`.
- `GET /system/audit-trail` (BARU): record `id, seq, recordedAt, actor, actorRole, action,
  category, entityId/entityLabel/entityType, oldValue, newValue, reason, source, prevHash,
  hash`; pagination `hasMore/limit/nextCursor/retentionDays/totalCount/truncated`.
  `/system/audit` tetap sebagai alias lama sampai P33.4; setelah P33.4 panel tidak lagi
  memakainya (deprecated di sisi panel).
- `PATCH /operational-events/{id}/ack`: respons 200 menyertakan `auditEntry` (nullable object
  berisi field audit lengkap) pada ack pertama; ack berulang mengembalikan `auditEntry: null`.
- `GET /access-control/audit`: `timestamp` string ISO per baris + param `cursor`/`limit` +
  pagination `{limit, nextCursor, hasMore, truncated, totalCount}`.

## Jawaban R-18 / R-19 (terjawab oleh B33.1, FAT-295)

- **R-18:** `machine_id` pada endpoint global DIDUKUNG.
- **R-19:** `acknowledged` TIDAK didukung pada `/system/audit` (store audit tidak mengenal
  konsep ack — ack adalah peristiwa operasional yang dicatat sebagai entri audit baru).

## Kriteria selesai (DoD) per tiket anak

| Tiket | DoD |
|---|---|
| P33.1 (FAT-291) | AuditTrailPage arsip murni (tanpa kolom ack) — Done, live 2026-11-21 |
| P33.2 (FAT-292) | OperationalEventsPage daftar kerja + rtn-unacknowledged — Done, live 2026-11-21 |
| P33.3 (FAT-293) | Demo satu store — Done, live 2026-11-21 |
| P33.4 (FAT-294) | Panel konsumsi kontrak baru (category, alarmState server, totalCount/counts, `/system/audit-trail`) + verifikasi live — sedang dikerjakan |
| P33.5 (FAT-300) | Alarm & Event 2 tampilan + filter State — Done, live 2026-11-21 |
| P33.6 (FAT-301) | Audit IAM halaman penuh — Done, live 2026-11-21 |
| P33.7 (FAT-302) | Rute kanonik + redirect + tautan silang — Done, live 2026-11-21 |
| P33.8 (FAT-304) | Filter Event Type per keluarga halaman — Done, live 2026-11-21 |
| P33.9 (FAT-305) | Paginasi IAM server-side (cursor) + verifikasi live — dijadwalkan besok |
| B33.1 (FAT-295) | Kategori + R-18/R-19 — kontrak live; perilaku dibuktikan lewat P33.4 |
| B33.2 (FAT-296) | Store audit append-only + `GET /system/audit-trail` — kontrak live; perilaku dibuktikan lewat P33.4 |
| B33.3 (FAT-297) | Ack menulis entri audit baru — kontrak live; perilaku dibuktikan lewat P33.4 |
| B33.4 (FAT-298) | `alarmState` server-side — kontrak live; perilaku dibuktikan lewat P33.4 |
| B33.5 (FAT-303) | Timestamp IAM ISO + paging server-side — Done, terverifikasi live 2026-11-23 |
| D33.1 (FAT-299) | ADR ini + epic diperbarui — Done dengan dokumen ini |

**Epic FAT-290 ditutup bila:** semua tiket anak Done DAN ketiga store terverifikasi live
end-to-end (halaman Alarm, Audit Trail, dan Audit IAM masing-masing membaca store-nya
sendiri — dibuktikan oleh verifikasi live P33.4 + P33.9).

## Catatan HMI / EE

- **HMI:** tidak ada perubahan pada cara HMI mengirim event (tetap ke backend seperti biasa).
  Yang berubah adalah di mana event itu dibaca kembali: `SECURITY_REJECTION` (mis. stasiun
  tak terdaftar) adalah event keluarga sistem — tampil di Audit Trail, bukan di daftar kerja
  Alarm. Verifikasi manual HMI (H30.5, FAT-253) tidak terdampak.
- **EE (perangkat):** enum 32 nilai tidak berubah; perangkat tidak perlu firmware baru.
  Perilaku ack berubah di sisi server (menulis entri audit) — perangkat tidak terlibat.
- **Panel:** satu alur kanonik per halaman; tidak ada fallback ke feed campuran. Demo tetap
  satu store (lihat Batas di atas) — perbedaan demo vs live dicatat jujur di sini, bukan
  disembunyikan.

## Referensi

- Analisis pencampuran: `~/workspace/audit-vs-operational-events-analysis.md`
- Analisis halaman: `~/workspace/analisis-halaman-opsi-3.md`
- Spec backend: `docs/BACKEND_REQUIREMENTS_E33_PAGES.md` (§1–§5 + payload; urutan
  disarankan §5→§1→§2→§3→§4)
- Audit end-to-end 2026-11-23: `~/workspace/audit-end-to-end-2026-11-23.md` (§2–§4, §9)
- OpenAPI live 2026-11-23: `~/workspace/oee-live-openapi-2026-11-23.json`
- AUDIT.md §52–§60 (riwayat implementasi panel E33)
