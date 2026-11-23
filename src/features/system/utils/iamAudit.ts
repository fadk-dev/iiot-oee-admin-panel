import type { IamAuditDecision, IamAuditFilters } from '../../../types/iam';

/** P33.9 (FAT-305): ukuran satu halaman server Audit IAM (`limit` ke GET /access-control/audit). */
export const IAM_AUDIT_PAGE_SIZE = 25;

/** Batas ekspor CSV: satu panggilan `limit=1000` (maksimum OpenAPI) + filter server yang sedang diterapkan. */
export const IAM_AUDIT_EXPORT_LIMIT = 1000;

export interface IamAuditClientFilters {
  resourceQuery: string;
  actionQuery: string;
}

/**
 * Filter client-side atas daftar yang sudah dimuat (Resource/Action).
 * Server (GET /access-control/audit) hanya mendukung filter
 * subject/decision/mode/from/to — filter teks Resource/Action belum ada di
 * kontrak, jadi disaring di panel. Pencarian substring, tidak sensitif
 * huruf besar/kecil; query kosong = tanpa filter.
 */
export function filterIamAuditByResourceAction(
  decisions: readonly IamAuditDecision[],
  filters: IamAuditClientFilters,
): IamAuditDecision[] {
  const resource = filters.resourceQuery.trim().toLowerCase();
  const action = filters.actionQuery.trim().toLowerCase();
  if (!resource && !action) return [...decisions];
  return decisions.filter(
    (d) =>
      (!resource || d.resource.toLowerCase().includes(resource)) &&
      (!action || d.action.toLowerCase().includes(action)),
  );
}

/**
 * P33.9 (FAT-305): tumpukan cursor paging server-side Audit IAM.
 *
 * Endpoint `GET /access-control/audit` (B33.5) hanya maju: tiap halaman
 * mengembalikan `nextCursor` untuk halaman berikut, TANPA cursor untuk
 * halaman sebelumnya. Supaya "Sebelumnya" tetap bisa, hook menyimpan
 * rantai cursor halaman yang sudah dikunjungi:
 *
 * - `stack[0]` selalu `null` (cursor halaman pertama);
 * - `stack[i]` = cursor yang dipakai mengambil halaman ke-`i`;
 * - `pageIndex` = halaman aktif di dalam rantai.
 *
 * Maju memakai `nextCursor` halaman aktif BILA belum pernah dikunjungi
 * (didorong ke rantai), atau memakai cursor yang sudah tersimpan BILA
 * halaman itu pernah dikunjungi (kembali-maju tidak mengulang fetch
 * yang sama dua kali). Mundur hanya menggeser `pageIndex` — hook
 * mengambil ulang halaman itu dengan cursor tersimpan, jadi data selalu
 * segar (bukan cache). Karena log audit pada dasarnya append-only,
 * urutan halaman stabil dalam praktik; bila keputusan baru masuk di
 * antara dua kunjungan, isi halaman bisa bergeser — itu sifat paging
 * cursor atas log hidup, bukan bug.
 *
 * Rantai direset ke `[null]` setiap kali filter server berubah.
 */
export interface IamAuditCursorStack {
  stack: (string | null)[];
  pageIndex: number;
}

export function initialIamAuditCursorStack(): IamAuditCursorStack {
  return { stack: [null], pageIndex: 0 };
}

/** Cursor yang dipakai mengambil halaman aktif. */
export function cursorForIamAuditPage(state: IamAuditCursorStack): string | null {
  return state.stack[state.pageIndex] ?? null;
}

/**
 * Geser ke halaman berikut. Mengembalikan state baru, atau `null` bila
 * tidak ada halaman berikut (tidak ada `nextCursor` DAN tidak ada cursor
 * tersimpan untuk halaman berikut).
 */
export function advanceIamAuditCursor(
  state: IamAuditCursorStack,
  nextCursor: string | null,
): IamAuditCursorStack | null {
  const stored = state.stack[state.pageIndex + 1];
  if (stored !== undefined) return { stack: state.stack, pageIndex: state.pageIndex + 1 };
  if (nextCursor === null) return null;
  return {
    stack: [...state.stack.slice(0, state.pageIndex + 1), nextCursor],
    pageIndex: state.pageIndex + 1,
  };
}

/** Geser ke halaman sebelumnya; `null` bila sudah di halaman pertama. */
export function retreatIamAuditCursor(state: IamAuditCursorStack): IamAuditCursorStack | null {
  if (state.pageIndex <= 0) return null;
  return { stack: state.stack, pageIndex: state.pageIndex - 1 };
}

/**
 * Jumlah halaman informatif dari `totalCount` server (hanya tampilan —
 * paging cursor TIDAK bisa lompat ke halaman sembarang, jadi angka ini
 * tidak pernah dipakai untuk navigasi).
 */
export function iamAuditPageCount(totalCount: number, pageSize: number = IAM_AUDIT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / pageSize));
}

/**
 * Teks "Menampilkan N keputusan": N SELALU total server (`totalCount`),
 * bukan jumlah baris yang dimuat. Bila filter teks Resource/Action aktif,
 * tambahkan berapa baris yang cocok DI HALAMAN INI — karena filter teks
 * hanya menyaring halaman yang dimuat, bukan seluruh dataset server.
 */
export function formatIamAuditResultLabel(
  totalCount: number,
  pageMatchCount?: number | null,
): string {
  if (pageMatchCount === null || pageMatchCount === undefined) {
    return `Menampilkan ${totalCount} keputusan`;
  }
  return `Menampilkan ${totalCount} keputusan · ${pageMatchCount} cocok di halaman ini`;
}

/** Nama file ekspor CSV: audit-iam-YYYY-MM-DD.csv (tanggal lokal). */
export function buildIamAuditCsvFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `audit-iam-${y}-${m}-${d}.csv`;
}

export interface IamAuditServerDraft {
  subject: string;
  decision: 'ALL' | 'ALLOW' | 'DENY';
  mode: 'ALL' | 'shadow' | 'enforce';
  from: string;
  to: string;
}

/** Draf filter halaman Audit IAM: filter server + filter client (Resource/Action). */
export interface IamAuditDraft extends IamAuditServerDraft {
  resourceQuery: string;
  actionQuery: string;
}

export const EMPTY_IAM_AUDIT_DRAFT: IamAuditDraft = {
  subject: '',
  decision: 'ALL',
  mode: 'ALL',
  from: '',
  to: '',
  resourceQuery: '',
  actionQuery: '',
};

/** Petakan draf filter ke query GET /access-control/audit (§3.4). */
export function iamAuditDraftToServerFilters(draft: IamAuditDraft): IamAuditFilters {
  return {
    subject: draft.subject.trim() || undefined,
    decision: draft.decision === 'ALL' ? undefined : draft.decision,
    mode: draft.mode === 'ALL' ? undefined : draft.mode,
    from: draft.from ? new Date(draft.from).toISOString() : undefined,
    to: draft.to ? new Date(draft.to).toISOString() : undefined,
  };
}
