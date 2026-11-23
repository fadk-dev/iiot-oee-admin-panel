/**
 * Method HTTP — domain iam: policies, effective permissions, audit.
 *
 * Dipisah dari `http/iam.ts` (401/600) pada FAT-285 (E32.4), mengikuti pola
 * demo (`demo/iam/policies.ts`, E20 P20.3) dan kontrak rule 2 (urutan
 * domain sama di kedua sisi). Barrel penggabung ada di `http/iam.ts`.
 * Tanpa mengubah perilaku.
 *
 * E20 P20.3: baca IAM digate `access_control.read` (kunci terpisah dari
 * `access_control.manage` untuk tulis); body tulis policy camelCase
 * (§3.4, spec 042) — TANPA `reason` di baris policy (hanya di audit IAM).
 */
import { MUTATION_TIMEOUT_MS, assertLanForMutation, assertAuthenticatedHttp, reqJson, reqList, checkAbortHttp } from '../transport';
import { num, splitList } from '../primitives';
import { mapIamPolicy, mapIamAuditDecision, mapIamSubjectEffectivePermissions } from '../mappers';
import { ADMIN_ENDPOINTS } from '../../endpoints';
import { IamPolicyRule, IamAuditDecision, IamAuditFilters, IamAuditPage, IamEffectivePermissions } from '../../../../types/iam';

const IAM_READ_CAPABILITY = 'access_control.read' as const;
const IAM_MANAGE_CAPABILITY = 'access_control.manage' as const;

export const httpIamPolicies = {
  /**
   * E28 Batch A (B17): spec 20 Nov mendukung filter server-side
   * `?roleId=` — kirim ke server, jangan saring client-side bila hanya
   * satu role yang dibutuhkan.
   */
  async getIamPolicies(
    filters: { roleId?: string } = {},
    signal?: AbortSignal,
  ): Promise<IamPolicyRule[]> {
    checkAbortHttp(signal);
    assertAuthenticatedHttp();
    return reqList(
      {
        path: ADMIN_ENDPOINTS.IAM_POLICIES_LIST.buildPath(),
        query: filters.roleId ? { roleId: filters.roleId } : undefined,
        signal,
        endpointKey: 'IAM_POLICIES_LIST',
        capability: IAM_READ_CAPABILITY,
      },
      mapIamPolicy,
      100,
    ).then((p) => p.data);
  },

  /**
   * Body tulis policy kanonis (§3.4, spec 042): camelCase
   * `{roleId, permissionId, resourcePattern, effect, abacCondition,
   * subjectMatch?}` — TANPA `reason` (hanya tersimpan di audit IAM).
   */
  async createIamPolicy(data: {
    roleId: string;
    permissionId: string;
    resourcePattern: string;
    effect: 'ALLOW' | 'DENY';
    abacCondition?: Record<string, unknown> | null;
    subjectMatch?: string;
  }): Promise<IamPolicyRule> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    return reqJson(
      {
        method: 'POST',
        path: ADMIN_ENDPOINTS.IAM_POLICIES_CREATE.buildPath(),
        body: {
          roleId: data.roleId,
          permissionId: data.permissionId,
          resourcePattern: data.resourcePattern,
          effect: data.effect,
          // E28 Batch A (FAT-229 MUT-03): POST menolak `abacCondition: null`
          // (optional record, bukan nullable) — omit bila kosong/null.
          ...(data.abacCondition !== undefined && data.abacCondition !== null
            ? { abacCondition: data.abacCondition }
            : {}),
          ...(data.subjectMatch ? { subjectMatch: data.subjectMatch } : {}),
        },
        timeoutMs: MUTATION_TIMEOUT_MS,
        retry: false,
        endpointKey: 'IAM_POLICIES_CREATE',
        capability: IAM_MANAGE_CAPABILITY,
      },
      mapIamPolicy,
    );
  },

  /**
   * PUT policy (§3.4): hanya `subjectMatch`/`resourcePattern`/`effect`/
   * `abacCondition`/`enabled` — action TIDAK bisa diubah (ikatan permission).
   *
   * E28 Batch A (FAT-229 MUT-03): PUT BOLEH nullable — `abacCondition: null`
   * di sini berarti HAPUS kondisi (per spec), jadi body diteruskan apa adanya
   * (`{...changes}`), TIDAK di-omit seperti POST. Jangan samakan dengan create.
   */
  async updateIamPolicy(
    policyId: string,
    changes: Partial<Pick<IamPolicyRule, 'subjectMatch' | 'resourcePattern' | 'effect' | 'abacCondition' | 'enabled'>>
  ): Promise<IamPolicyRule> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    return reqJson(
      {
        method: 'PUT',
        path: ADMIN_ENDPOINTS.IAM_POLICIES_UPDATE.buildPath(policyId),
        body: { ...changes },
        timeoutMs: MUTATION_TIMEOUT_MS,
        retry: false,
        endpointKey: 'IAM_POLICIES_UPDATE',
        capability: IAM_MANAGE_CAPABILITY,
        resourceId: policyId,
      },
      mapIamPolicy,
    );
  },

  async deleteIamPolicy(policyId: string): Promise<{ success: boolean }> {
    assertAuthenticatedHttp();
    assertLanForMutation();
    const raw = await reqJson<{ success?: boolean } | undefined>({
      method: 'DELETE',
      path: ADMIN_ENDPOINTS.IAM_POLICIES_DELETE.buildPath(policyId),
      timeoutMs: MUTATION_TIMEOUT_MS,
      retry: false,
      endpointKey: 'IAM_POLICIES_DELETE',
      capability: IAM_MANAGE_CAPABILITY,
      resourceId: policyId,
    });
    return { success: raw?.success ?? true };
  },

  async getSubjectEffectivePermissions(
    operatorId: string,
    signal?: AbortSignal
  ): Promise<IamEffectivePermissions> {
    checkAbortHttp(signal);
    assertAuthenticatedHttp();
    const raw = await reqJson<Record<string, unknown>>({
      path: ADMIN_ENDPOINTS.IAM_SUBJECT_EFFECTIVE_PERMISSIONS.buildPath(operatorId),
      signal,
      endpointKey: 'IAM_SUBJECT_EFFECTIVE_PERMISSIONS',
      capability: IAM_READ_CAPABILITY,
      resourceId: operatorId,
    });
    return mapIamSubjectEffectivePermissions(raw, operatorId);
  },

  /**
   * P33.9 (FAT-305): paging server-side (B33.5, OpenAPI live 2026-11-23) —
   * kirim `cursor` + `limit`, baca `pagination.nextCursor`/`hasMore`/
   * `totalCount` dari envelope. `totalCount` dibaca eksplisit di sini
   * (camelCase): `pageMeta`/`normalizeListResponse` hanya mengenal
   * `count`/`total_count`, jadi memakai `reqList` akan mengembalikan
   * jumlah baris halaman sebagai total — salah. Bila backend tidak
   * mengirim totalCount, fallback = jumlah baris halaman ini.
   */
  async getIamAuditDecisions(filters: IamAuditFilters = {}, signal?: AbortSignal): Promise<IamAuditPage> {
    checkAbortHttp(signal);
    assertAuthenticatedHttp();
    const limit = filters.limit ?? 100;
    const query: Record<string, string | number> = { limit };
    if (filters.subject) query.subject = filters.subject;
    if (filters.decision) query.decision = filters.decision;
    if (filters.mode) query.mode = filters.mode;
    if (filters.from) query.from = filters.from;
    if (filters.to) query.to = filters.to;
    if (filters.cursor) query.cursor = filters.cursor;
    const raw = await reqJson<unknown>(
      {
        path: ADMIN_ENDPOINTS.IAM_AUDIT.buildPath(),
        query,
        signal,
        endpointKey: 'IAM_AUDIT',
        capability: IAM_READ_CAPABILITY,
      },
    );
    const { items, meta } = splitList(raw);
    const decisions = items.map((it) => mapIamAuditDecision(it));
    return {
      decisions,
      totalCount: num(meta?.totalCount ?? meta?.total_count ?? meta?.count, decisions.length),
      hasMore: Boolean(meta?.hasMore ?? meta?.has_more ?? false),
      nextCursor: (meta?.nextCursor ?? meta?.next_cursor ?? null) as string | null,
    };
  },

  async toggleIamPolicy(policyId: string, enabled: boolean): Promise<IamPolicyRule> {
    return httpIamPolicies.updateIamPolicy(policyId, { enabled });
  }
};
