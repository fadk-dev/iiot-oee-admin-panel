import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../../services/api/client';
import { useCapability } from '../../../context/AuthContext';
import type { IamAuditDecision, IamAuditFilters } from '../../../types/iam';
import {
  formatIamAuditExportRows,
  serializeExportRecords,
  triggerBrowserDownload,
} from '../../../utils/historicalExport';
import {
  EMPTY_IAM_AUDIT_DRAFT,
  IAM_AUDIT_EXPORT_LIMIT,
  IAM_AUDIT_PAGE_SIZE,
  advanceIamAuditCursor,
  buildIamAuditCsvFilename,
  cursorForIamAuditPage,
  filterIamAuditByResourceAction,
  iamAuditDraftToServerFilters,
  iamAuditPageCount,
  initialIamAuditCursorStack,
  retreatIamAuditCursor,
  type IamAuditCursorStack,
  type IamAuditDraft,
} from '../utils/iamAudit';

/**
 * Satu alur data halaman Audit IAM (P33.9, FAT-305): muat keputusan
 * `GET /access-control/audit` dengan filter server (subject/decision/
 * mode/from/to) + paging server-side `cursor`/`limit` (B33.5), saring
 * Resource/Action di panel, ekspor CSV.
 *
 * Paging server-side: tiap halaman diminta dengan `limit=25`; `hasMore`/
 * `nextCursor`/`totalCount` dibaca dari envelope server. Mundur memakai
 * tumpukan cursor (lihat `advanceIamAuditCursor`/`retreatIamAuditCursor`
 * di utils — halaman sebelumnya diambil ulang dengan cursor yang
 * tersimpan, bukan dari cache). Filter teks Resource/Action hanya
 * menyaring HALAMAN yang dimuat — server tidak punya filter itu —
 * jadi baris yang cocok di halaman lain baru terlihat setelah maju.
 *
 * Ekspor mengambil SATU halaman besar (`limit=1000`, maksimum OpenAPI)
 * dengan filter server yang sedang diterapkan, lalu menyaring teks di
 * panel. Bila server masih punya baris di luar 1.000 itu, ekspor
 * terpotong — `exportTruncated` memberi tahu halaman untuk menampilkan
 * catatan itu.
 */
export const useIamAudit = () => {
  // Baca IAM digate `access_control.read` (§3.4) — sama seperti tab lama.
  const canRead = useCapability('access_control.read');

  /** Baris HALAMAN server yang sedang tampil (bukan seluruh dataset). */
  const [decisions, setDecisions] = useState<IamAuditDecision[]>([]);
  const [pageInfo, setPageInfo] = useState<{
    totalCount: number;
    hasMore: boolean;
    nextCursor: string | null;
  }>({ totalCount: 0, hasMore: false, nextCursor: null });
  const [cursorState, setCursorState] = useState<IamAuditCursorStack>(
    initialIamAuditCursorStack,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isPaging, setIsPaging] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<IamAuditDraft>(EMPTY_IAM_AUDIT_DRAFT);
  const [appliedFilters, setAppliedFilters] = useState<IamAuditFilters>({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportTruncated, setExportTruncated] = useState(false);

  // Penjaga respons basi: klik Berikutnya/Sebelumnya yang cepat tidak
  // boleh menimpa halaman dengan respons yang datang belakangan.
  const requestSeq = useRef(0);

  const loadPage = useCallback(
    async (args: {
      filters: IamAuditFilters;
      state: IamAuditCursorStack;
      mode: 'initial' | 'apply' | 'page';
    }): Promise<void> => {
      const seq = ++requestSeq.current;
      if (args.mode === 'initial') setIsLoading(true);
      else if (args.mode === 'apply') setIsApplying(true);
      else setIsPaging(true);
      setError(null);
      try {
        const page = await apiClient.getIamAuditDecisions({
          ...args.filters,
          cursor: cursorForIamAuditPage(args.state) ?? undefined,
          limit: IAM_AUDIT_PAGE_SIZE,
        });
        if (requestSeq.current !== seq) return;
        setDecisions(page.decisions);
        setPageInfo({
          totalCount: page.totalCount,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        });
        setCursorState(args.state);
      } catch (err: unknown) {
        if (requestSeq.current === seq) setError(err);
      } finally {
        if (requestSeq.current === seq) {
          if (args.mode === 'initial') setIsLoading(false);
          else if (args.mode === 'apply') setIsApplying(false);
          else setIsPaging(false);
        }
      }
    },
    [],
  );

  // Muat awal tanpa filter begitu gerbang mengizinkan.
  useEffect(() => {
    if (!canRead.canInteract) {
      setIsLoading(false);
      return;
    }
    void loadPage({ filters: {}, state: initialIamAuditCursorStack(), mode: 'initial' });
  }, [canRead.canInteract, loadPage]);

  const applyWith = useCallback(
    async (next: IamAuditDraft) => {
      const filters = iamAuditDraftToServerFilters(next);
      setDraft(next);
      setAppliedFilters(filters);
      await loadPage({ filters, state: initialIamAuditCursorStack(), mode: 'apply' });
    },
    [loadPage],
  );

  const applyFilters = useCallback(() => void applyWith(draft), [applyWith, draft]);
  const resetFilters = useCallback(
    () => void applyWith(EMPTY_IAM_AUDIT_DRAFT),
    [applyWith],
  );
  /** Pintasan "hanya DENY": satu klik — set filter + langsung terapkan. */
  const applyDenyOnly = useCallback(
    () => void applyWith({ ...draft, decision: 'DENY' }),
    [applyWith, draft],
  );

  const updateDraft = useCallback((patch: Partial<IamAuditDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const filtered = useMemo(
    () =>
      filterIamAuditByResourceAction(decisions, {
        resourceQuery: draft.resourceQuery,
        actionQuery: draft.actionQuery,
      }),
    [decisions, draft.resourceQuery, draft.actionQuery],
  );

  const nextPage = useCallback(() => {
    if (isPaging || isLoading || isApplying) return;
    const next = advanceIamAuditCursor(cursorState, pageInfo.nextCursor);
    if (!next) return;
    void loadPage({ filters: appliedFilters, state: next, mode: 'page' });
  }, [isPaging, isLoading, isApplying, cursorState, pageInfo.nextCursor, appliedFilters, loadPage]);

  const prevPage = useCallback(() => {
    if (isPaging || isLoading || isApplying) return;
    const prev = retreatIamAuditCursor(cursorState);
    if (!prev) return;
    void loadPage({ filters: appliedFilters, state: prev, mode: 'page' });
  }, [isPaging, isLoading, isApplying, cursorState, appliedFilters, loadPage]);

  const resetPage = useCallback(() => {
    if (isPaging || isLoading || isApplying) return;
    if (cursorState.pageIndex === 0) return;
    void loadPage({ filters: appliedFilters, state: initialIamAuditCursorStack(), mode: 'page' });
  }, [isPaging, isLoading, isApplying, cursorState.pageIndex, appliedFilters, loadPage]);

  /** Muat ulang halaman aktif dengan cursor-nya (bukan kembali ke halaman 1). */
  const reload = useCallback(() => {
    if (isPaging || isLoading || isApplying) return;
    void loadPage({ filters: appliedFilters, state: cursorState, mode: 'page' });
  }, [isPaging, isLoading, isApplying, appliedFilters, cursorState, loadPage]);

  const exportCsv = useCallback(async () => {
    setExportError(null);
    setExportTruncated(false);
    setIsExporting(true);
    try {
      const page = await apiClient.getIamAuditDecisions({
        ...appliedFilters,
        limit: IAM_AUDIT_EXPORT_LIMIT,
      });
      const rows = filterIamAuditByResourceAction(page.decisions, {
        resourceQuery: draft.resourceQuery,
        actionQuery: draft.actionQuery,
      });
      const { content, mimeType } = serializeExportRecords(
        formatIamAuditExportRows(rows),
        'csv',
      );
      triggerBrowserDownload(buildIamAuditCsvFilename(), content, mimeType);
      setExportTruncated(page.hasMore);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Gagal mengekspor CSV.');
    } finally {
      setIsExporting(false);
    }
  }, [appliedFilters, draft.resourceQuery, draft.actionQuery]);

  return {
    canRead,
    pageRows: filtered,
    /** Baris yang cocok dengan filter teks DI HALAMAN INI (bukan total). */
    filteredCount: filtered.length,
    /** Total baris yang cocok dengan filter server (dari envelope server). */
    totalCount: pageInfo.totalCount,
    pageIndex: cursorState.pageIndex,
    /** Jumlah halaman informatif dari totalCount — bukan untuk navigasi. */
    pageCount: iamAuditPageCount(pageInfo.totalCount),
    hasMore: pageInfo.hasMore,
    hasPrev: cursorState.pageIndex > 0,
    isLoading,
    isPaging,
    isApplying,
    error,
    draft,
    updateDraft,
    applyFilters,
    resetFilters,
    applyDenyOnly,
    nextPage,
    prevPage,
    resetPage,
    reload,
    exportCsv,
    isExporting,
    exportError,
    exportTruncated,
  };
};
