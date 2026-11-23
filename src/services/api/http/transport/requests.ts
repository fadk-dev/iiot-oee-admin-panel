/**
 * Request berlevel tinggi transport HTTP (FAT-285, E32.4): reqJson / reqList /
 * reqAllPages / reqExport.
 *
 * Dipisah dari `transport.ts` (575/600, ambang batas keras) tanpa mengubah
 * perilaku:
 * - Normalisasi list: array langsung ATAU `{data, meta}` (D7).
 * - Error envelope `{error, message, issues?, active_wo_id?}` dipetakan
 *   terpusat via `mapHttpErrorToApiError` (§4.3); 401 → logout, 403 →
 *   capability diturunkan (AuthContext) — lewat hook di `hooks`.
 * - Ekspor mengembalikan file (bukan envelope): baca `Content-Disposition`
 *   + header `X-Export-*`.
 * - TIDAK ADA evaluasi policy/role/scope di klien (§4.5/§4.6h): server yang
 *   memutuskan; klien hanya meneruskan 403 ke capability store.
 */
import { ApiError } from '../../../../types/auth';
import { CursorPageResponse, ExportResult } from '../../../../types/historical';
import { splitList, pageMeta } from '../primitives';
import { resolveExportTimeoutMs } from '../../mode';
import { parseExportMetadataHeaders } from '../../../../utils/historicalExport';
import { fetchRaw } from './fetch';
import { calledKeys, hooks } from './session';
import type { ReqOpts } from './types';

/** JSON request + pemetaan error terpusat + hook 401/403 (Guide §4.3/§4.5). */
export async function reqJson<T>(opts: ReqOpts, parse?: (raw: unknown) => T): Promise<T> {
  try {
    const raw = await fetchRaw(opts);
    if (opts.endpointKey) calledKeys.add(opts.endpointKey);
    if (raw.status === 204 || !raw.text) return undefined as T;
    const data = raw.json;
    return parse ? parse(data) : (data as T);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.httpStatus === 401) {
        // §L: bedakan 401 AUTHZ_STALE (subjek stale → login ulang) dan 401
        // SUBJECT_INACTIVE (akun nonaktif) dari 401 umum — pesannya jelas.
        const reason =
          err.code === 'AUTHZ_STALE'
            ? 'Hak akses akun berubah (AUTHZ_STALE). Silakan login ulang.'
            : err.code === 'SUBJECT_INACTIVE'
              ? 'Akun operator nonaktif (SUBJECT_INACTIVE). Silakan hubungi administrator.'
              : err.message;
        hooks.onUnauthorized?.(reason);
      }
      // 403 hanya diturunkan ke capability bila panggilan membawa kunci
      // capability; tanpa kunci, tidak ada yang bisa diturunkan.
      if (err.httpStatus === 403 && opts.capability) {
        hooks.onForbidden?.(opts.capability, opts.resourceId, err.message);
      }
    }
    throw err;
  }
}

export async function reqList<T>(
  opts: ReqOpts,
  // FAT-309: mapper boleh mengembalikan null untuk melewati satu baris
  // (mis. baris stasiun di daftar edge device) — baris null dibuang,
  // bukan menggagalkan seluruh halaman. Pemanggil lama (mapper selalu
  // mengembalikan T) tidak berubah perilakunya.
  mapItem: (raw: unknown) => T | null,
  fallbackLimit = 50,
): Promise<CursorPageResponse<T>> {
  const raw = await reqJson<unknown>(opts);
  const { items, meta } = splitList(raw);
  const data = items.map((it) => mapItem(it)).filter((x): x is T => x !== null);
  return { data, pagination: pageMeta(meta, fallbackLimit, data.length) };
}

export async function reqAllPages<T>(
  basePath: string,
  // FAT-309: lihat reqList — mapper boleh mengembalikan null (baris dilewati).
  mapItem: (raw: unknown) => T | null,
  signal?: AbortSignal,
  endpointKey?: ReqOpts['endpointKey'],
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const res: CursorPageResponse<T> = await reqList(
      { path: basePath, query: { limit: 100, envelope: true, ...(cursor ? { cursor } : {}) }, signal, endpointKey },
      mapItem,
      100,
    );
    out.push(...res.data);
    cursor = res.pagination.next_cursor;
    if (!res.pagination.has_more || !cursor) break;
  }
  return out;
}

export async function reqExport(opts: ReqOpts, format: 'csv' | 'ndjson' | 'json', fallbackName: string): Promise<ExportResult> {
  const raw = await fetchRaw({ ...opts, timeoutMs: resolveExportTimeoutMs(), retry: false });
  if (opts.endpointKey) calledKeys.add(opts.endpointKey);
  const headers: Record<string, string> = {};
  raw.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const metadata = parseExportMetadataHeaders({
    'X-Export-Source': headers['x-export-source'],
    'X-Export-Generated-At': headers['x-export-generated-at'],
    'X-Export-Device-Id': headers['x-export-device-id'],
    'X-Export-Time-Window': headers['x-export-time-window'],
  });
  const disposition = headers['content-disposition'] ?? '';
  const nameMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const filename = nameMatch ? decodeURIComponent(nameMatch[1].trim()) : fallbackName;
  // E23 Batch 3 (FAT-193, N-24): spec live — 200 ekspor = application/json
  // STRING (bukan text/csv). Bila server meng-JSON-encode string CSV itu
  // (body diawali `"` dan diakhiri `"`), uraikan dulu ke teks CSV asli —
  // kalau tidak, CSV rusak (dikutip, escape `\n` literal, rowCount 0).
  // Teks CSV polos (bukan JSON valid / hasil parse bukan string) dipakai
  // apa adanya seperti sebelumnya.
  let content = raw.text;
  const trimmed = content.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(trimmed);
      if (typeof decoded === 'string') content = decoded;
    } catch {
      // Bukan JSON — pakai teks mentah.
    }
  }
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const rowCount = format === 'csv' ? Math.max(0, lines.length - 1) : lines.length;
  return {
    filename,
    mimeType: headers['content-type'] ?? (format === 'csv' ? 'text/csv' : format === 'ndjson' ? 'application/x-ndjson' : 'application/json'),
    format,
    content,
    rowCount,
    metadata: { ...metadata, contentDisposition: disposition || undefined },
    endpoint: opts.path,
  };
}
