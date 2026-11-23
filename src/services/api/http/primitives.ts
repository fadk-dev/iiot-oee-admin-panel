/**
 * Primitif koersi + paginasi/list (dipakai mapper & transport).
 *
 * Dipisah dari file god-file pada refactoring R9 (kontrak docs/DIRECTORY_STRUCTURE.md).
 * Satu file = satu domain. Barrel penggabung ada di file induknya.
 */
import { z } from 'zod';
import { ApiError } from '../../../types/auth';
import { CursorPageResponse } from '../../../types/historical';

export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};

export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

export const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

export const iso = (v: unknown): string => (typeof v === 'string' && v ? v : new Date(0).toISOString());

export const pick = <T>(...vals: Array<T | undefined | null>): T | undefined => vals.find((v) => v !== undefined && v !== null);

/** Daftar mentah: array langsung atau `{data, meta}` (Guide D7). */
export function splitList(raw: unknown): { items: unknown[]; meta: Record<string, unknown> | null } {
  if (Array.isArray(raw)) return { items: raw, meta: null };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return { items: o.data, meta: (o.meta ?? o.pagination ?? null) as Record<string, unknown> | null };
  }
  return { items: [], meta: null };
}

export function pageMeta(meta: Record<string, unknown> | null, fallbackLimit: number, count: number): CursorPageResponse<never>['pagination'] {
  const hasMore = Boolean(meta?.hasMore ?? meta?.has_more ?? false);
  // P33.4 (FAT-294, B33.4): `totalCount` server kini TOTAL ASLI baris yang
  // cocok dengan filter (bukan panjang halaman) — dibaca diutamakan atas
  // `count` (panjang halaman). Bila `totalCount` tidak ada (endpoint lama),
  // `count` tetap dipakai sebagai fallback seperti sebelumnya.
  const totalCount =
    meta?.totalCount !== undefined || meta?.total_count !== undefined
      ? num(meta?.totalCount ?? meta?.total_count, count)
      : meta?.count !== undefined
        ? num(meta?.count, count)
        : count;
  const countsRaw = meta?.counts;
  const counts =
    countsRaw && typeof countsRaw === 'object'
      ? {
          activeUnack: num((countsRaw as Record<string, unknown>).activeUnack, 0),
          rtnUnack: num((countsRaw as Record<string, unknown>).rtnUnack, 0),
          acked: num((countsRaw as Record<string, unknown>).acked, 0),
        }
      : undefined;
  return {
    limit: num(meta?.limit, fallbackLimit),
    next_cursor: (meta?.nextCursor ?? meta?.next_cursor ?? null) as string | null,
    has_more: hasMore,
    truncated: Boolean(meta?.truncated ?? hasMore),
    total_count: totalCount,
    ...(counts ? { counts } : {}),
    ...(meta?.retentionDays !== undefined || meta?.retention_days !== undefined
      ? { retention_days: num(meta?.retentionDays ?? meta?.retention_days, 0) }
      : {}),
  };
}

export function invalidResponse(message: string): ApiError {
  return new ApiError({ code: 'INVALID_RESPONSE', message, httpStatus: 200 });
}

/** Validasi hasil mapping dengan skema Zod lokal; gagal parse = INVALID_RESPONSE (§4.2.7). */
export function mustParse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidResponse(`Format ${label} dari server tidak sesuai skema.`);
  return parsed.data;
}
