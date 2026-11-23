/**
 * Method demo — domain IAM: policies, effective-permissions, audit.
 *
 * Dipisah dari demo/iam.ts (694 baris) pada E20 P20.3 (FAT-155), mengikuti
 * pola R9.2 (kontrak docs/DIRECTORY_STRUCTURE.md). Barrel penggabung ada di
 * demo/iam.ts.
 *
 * E20 P20.3: baris policy kanonis camelCase (§3.4, spec 042) — TANPA `reason`,
 * TANPA `privilege_level`/`policy_count`; validasi ABAC di create/update
 * policy (predikat tak sah → 400 INVALID_POLICY); filter audit
 * subject/decision/mode/from/to.
 */
import { store } from '../store';
import { checkAbort, assertCapability } from '../helpers';
import { ADMIN_ENDPOINTS } from '../../endpoints';
import { IamPolicyRule, IamEffectivePermissions, IamAuditFilters, IamAuditPage } from '../../../../types/iam';
import { ApiError } from '../../../../types/auth';
import { isAdminRoleName, isReservedPermission, policyMatchesSubject, policyTargetsAdmin, validateAbacCondition } from '../../../../utils/capabilities';
import { IamPolicyRuleSchema } from '../../schemas';

// E28 Batch A (FAT-229 MUT-03): skema baris policy TIDAK lagi menerima
// null — tapi seed/store lama menyimpan `abacCondition: null` untuk "tanpa
// syarat". Normalisasi null → undefined SEBELUM parse (baca saja); nilai
// yang ditulis ke server tetap di-omit di lapisan HTTP (http/iam.ts).
function toSchemaPolicy(p: IamPolicyRule): IamPolicyRule {
  return IamPolicyRuleSchema.parse({ ...p, abacCondition: p.abacCondition ?? undefined });
}

const DEMO_IAM_AUDIT_CURSOR_PREFIX = 'iam-audit:';

function encodeDemoIamAuditCursor(offset: number): string {
  return `${DEMO_IAM_AUDIT_CURSOR_PREFIX}${offset}`;
}

function decodeDemoIamAuditCursor(cursor: string | null | undefined): number {
  if (!cursor || !cursor.startsWith(DEMO_IAM_AUDIT_CURSOR_PREFIX)) return 0;
  const n = Number(cursor.slice(DEMO_IAM_AUDIT_CURSOR_PREFIX.length));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export const demoIamPolicies = {
  async getIamPolicies(
    filters: { roleId?: string } = {},
    signal?: AbortSignal,
  ): Promise<IamPolicyRule[]> {
    checkAbort(signal);
    assertCapability('access_control.read', ['ADMIN']);
    const qs = filters.roleId ? `?roleId=${encodeURIComponent(filters.roleId)}` : '';
    store.recordEndpoint('IAM_POLICIES_LIST', `${ADMIN_ENDPOINTS.IAM_POLICIES_LIST.buildPath()}${qs}`);
    const all = store.iamPolicies.map((p) => toSchemaPolicy(p));
    // E28 Batch A (B17): filter server-side (paritas dengan HTTP).
    return filters.roleId ? all.filter((p) => p.roleId === filters.roleId) : all;
  },

  async createIamPolicy(data: {
    roleId: string;
    permissionId: string;
    resourcePattern: string;
    effect: 'ALLOW' | 'DENY';
    abacCondition?: Record<string, unknown> | null;
    subjectMatch?: string;
  }): Promise<IamPolicyRule> {
    assertCapability('access_control.manage', ['ADMIN']);
    store.recordEndpoint('IAM_POLICIES_CREATE', ADMIN_ENDPOINTS.IAM_POLICIES_CREATE.buildPath());
    const role = store.iamRoles.find((r) => r.id === data.roleId);
    const perm = store.iamPermissions.find((p) => p.id === data.permissionId);
    if (!role || !perm) {
      throw new ApiError({ code: 'NOT_FOUND', message: 'Role atau permission tidak ditemukan.', httpStatus: 404 });
    }
    const subjectMatch = data.subjectMatch?.trim() || `role:${role.name}`;
    if (policyTargetsAdmin(subjectMatch) && data.effect === 'DENY') {
      throw new ApiError({
        code: 'FORBIDDEN',
        message: 'Anti-Lockout Guard: Policy DENY pada role ADMIN dilarang.',
        httpStatus: 403,
      });
    }
    const hasCustomOrWildcardRole = subjectMatch === '*' || !isAdminRoleName(role.name);
    const resType = data.resourcePattern.split(':')[0] || '*';
    if (
      hasCustomOrWildcardRole &&
      data.effect === 'ALLOW' &&
      (isReservedPermission(perm.action, resType) || data.resourcePattern.trim() === '*' || data.resourcePattern.trim() === 'org:*')
    ) {
      throw new ApiError({
        code: 'PRIVILEGE_ESCALATION_DENIED',
        message: `Permission "${perm.action}:${resType}" adalah reserved permission yang tidak boleh diberikan melalui policy untuk custom role.`,
        httpStatus: 403,
      });
    }
    // §3.4: `abacCondition` divalidasi struktur → predikat tak sah 400
    // INVALID_POLICY. Validator dipertahankan APA ADANYA (R-1).
    if (data.abacCondition !== undefined && data.abacCondition !== null) {
      const checked = validateAbacCondition(data.abacCondition);
      if (!checked.valid) {
        throw new ApiError({
          code: 'INVALID_POLICY',
          message: `Kondisi ABAC tidak valid: ${checked.reason ?? 'predikat tidak dikenal.'}`,
          httpStatus: 400,
        });
      }
    }
    const newPol: IamPolicyRule = toSchemaPolicy({
      id: `pol-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`,
      roleId: role.id,
      roleName: role.name,
      subjectMatch,
      permissionId: perm.id,
      action: perm.action,
      resourceType: perm.resourceType,
      resourcePattern: data.resourcePattern.trim(),
      effect: data.effect,
      abacCondition: data.abacCondition ?? null,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    store.iamPolicies.push(newPol);
    store.iamInfo.authzVersion += 1;
    store.tokenAuthzVersion = store.iamInfo.authzVersion;
    store.addAudit('CREATE_POLICY', 'IAM', newPol.id, `Created ${newPol.effect} policy for ${newPol.roleName}: ${newPol.action}`);
    return { ...newPol };
  },

  async updateIamPolicy(
    policyId: string,
    patch: Partial<Pick<IamPolicyRule, 'subjectMatch' | 'resourcePattern' | 'effect' | 'abacCondition' | 'enabled'>>
  ): Promise<IamPolicyRule> {
    assertCapability('access_control.manage', ['ADMIN'], { resourceId: policyId });
    store.recordEndpoint('IAM_POLICIES_UPDATE', ADMIN_ENDPOINTS.IAM_POLICIES_UPDATE.buildPath(policyId));
    const pol = store.iamPolicies.find((p) => p.id === policyId);
    if (!pol) throw new ApiError({ code: 'NOT_FOUND', message: 'Policy tidak ditemukan.', httpStatus: 404 });
    if (policyTargetsAdmin(pol.subjectMatch) && (patch.enabled === false || patch.effect === 'DENY')) {
      throw new ApiError({
        code: 'FORBIDDEN',
        message: 'Anti-Lockout Guard: Menonaktifkan atau mengubah policy ADMIN menjadi DENY dilarang.',
        httpStatus: 403,
      });
    }
    const nextResource = patch.resourcePattern ?? pol.resourcePattern;
    const nextEffect = patch.effect ?? pol.effect;
    const hasCustomOrWildcardRole = pol.subjectMatch === '*' || !isAdminRoleName(pol.roleName);
    const resType = nextResource.split(':')[0] || '*';
    if (
      hasCustomOrWildcardRole &&
      nextEffect === 'ALLOW' &&
      (isReservedPermission(pol.action, resType) || nextResource.trim() === '*' || nextResource.trim() === 'org:*')
    ) {
      throw new ApiError({
        code: 'PRIVILEGE_ESCALATION_DENIED',
        message: `Permission "${pol.action}:${resType}" adalah reserved permission untuk sistem dan dilarang pada custom role.`,
        httpStatus: 403,
      });
    }
    if (patch.abacCondition !== undefined && patch.abacCondition !== null) {
      const checked = validateAbacCondition(patch.abacCondition);
      if (!checked.valid) {
        throw new ApiError({
          code: 'INVALID_POLICY',
          message: `Kondisi ABAC tidak valid: ${checked.reason ?? 'predikat tidak dikenal.'}`,
          httpStatus: 400,
        });
      }
    }
    if (patch.subjectMatch !== undefined) pol.subjectMatch = patch.subjectMatch.trim();
    if (patch.resourcePattern !== undefined) pol.resourcePattern = patch.resourcePattern.trim();
    if (patch.effect !== undefined) pol.effect = patch.effect;
    if (patch.abacCondition !== undefined) pol.abacCondition = patch.abacCondition;
    if (patch.enabled !== undefined) pol.enabled = patch.enabled;
    store.iamInfo.authzVersion += 1;
    store.tokenAuthzVersion = store.iamInfo.authzVersion;
    store.addAudit('UPDATE_POLICY', 'IAM', policyId, `Updated policy ${policyId}`);
    return toSchemaPolicy({ ...pol });
  },

  async toggleIamPolicy(policyId: string, enabled: boolean): Promise<IamPolicyRule> {
    return demoIamPolicies.updateIamPolicy(policyId, { enabled });
  },

  async deleteIamPolicy(policyId: string): Promise<{ success: boolean }> {
    assertCapability('access_control.manage', ['ADMIN'], { resourceId: policyId });
    store.recordEndpoint('IAM_POLICIES_DELETE', ADMIN_ENDPOINTS.IAM_POLICIES_DELETE.buildPath(policyId));
    const pol = store.iamPolicies.find((p) => p.id === policyId);
    if (!pol) throw new ApiError({ code: 'NOT_FOUND', message: 'Policy tidak ditemukan.', httpStatus: 404 });
    if (policyTargetsAdmin(pol.subjectMatch)) {
      throw new ApiError({
        code: 'FORBIDDEN',
        message: 'Anti-Lockout Guard: Menghapus policy ADMIN dilarang.',
        httpStatus: 403,
      });
    }
    store.iamPolicies = store.iamPolicies.filter((p) => p.id !== policyId);
    store.iamInfo.authzVersion += 1;
    store.tokenAuthzVersion = store.iamInfo.authzVersion;
    store.addAudit('DELETE_POLICY', 'IAM', policyId, `Deleted policy ${policyId}`);
    return { success: true };
  },

  async getSubjectEffectivePermissions(
    operatorId: string,
    signal?: AbortSignal
  ): Promise<IamEffectivePermissions> {
    checkAbort(signal);
    assertCapability('access_control.read', ['ADMIN'], { resourceId: operatorId });
    store.recordEndpoint(
      'IAM_SUBJECT_EFFECTIVE_PERMISSIONS',
      ADMIN_ENDPOINTS.IAM_SUBJECT_EFFECTIVE_PERMISSIONS.buildPath(operatorId)
    );
    const op = store.operators.find((o) => o.operator_id === operatorId);
    if (!op) {
      throw new ApiError({ code: 'OPERATOR_NOT_FOUND', message: 'Operator tidak ditemukan.', httpStatus: 404 });
    }
    const assignments = store.iamAssignments.filter((a) => a.operator_id === operatorId);
    const roleNames = Array.from(new Set([op.role, ...assignments.map((a) => a.role_name)]));
    const matchingPolicies = store.iamPolicies.filter(
      (p) =>
        p.enabled &&
        roleNames.some((r) => policyMatchesSubject(p.subjectMatch, { role: r, operatorId }))
    );

    return {
      operatorId: op.operator_id,
      primaryRole: op.role,
      isActive: op.is_active,
      isProtected: Boolean(op.is_protected),
      authzVersion: store.iamInfo.authzVersion,
      effectiveInMode: store.iamInfo.effectiveInMode,
      assignments: assignments.map((a) => ({ ...a })),
      // E23 Batch 1 (FAT-176, N-7): spec live — `roles` adalah string[];
      // detail peran (scope) hidup di `assignments[]`.
      roles: roleNames,
      permissions: matchingPolicies.map((p) => ({
        action: p.action,
        resourceType: p.resourceType,
        resourcePattern: p.resourcePattern,
        effect: p.effect,
        sourceRole: p.roleName,
        abacCondition: p.abacCondition ?? null,
      })),
    };
  },

  /**
   * §3.4: filter `subject/decision/mode/from/to` (server-side) + `limit`.
   */
  /**
   * P33.9 (FAT-305): paging server-side, paritas dengan HTTP. Cursor demo
   * adalah offset halaman yang dikodekan (`iam-audit:<offset>`) — buram
   * bagi pemanggil, dan TIDAK sama formatnya dengan cursor server asli;
   * hanya berlaku di dalam mode demo. Cursor rusak/tanpa prefix = halaman
   * pertama (defensif, bukan error).
   */
  async getIamAuditDecisions(filters: IamAuditFilters = {}, signal?: AbortSignal): Promise<IamAuditPage> {
    checkAbort(signal);
    assertCapability('access_control.read', ['ADMIN']);
    store.recordEndpoint('IAM_AUDIT', ADMIN_ENDPOINTS.IAM_AUDIT.buildPath());
    const limit = filters.limit ?? 100;
    let rows = store.iamAuditDecisions;
    if (filters.subject) {
      const needle = filters.subject.trim().toLowerCase();
      rows = rows.filter((d) => d.subject.toLowerCase().includes(needle));
    }
    if (filters.decision) rows = rows.filter((d) => d.decision === filters.decision);
    if (filters.mode) rows = rows.filter((d) => d.mode === filters.mode);
    if (filters.from) rows = rows.filter((d) => d.timestamp >= filters.from!);
    if (filters.to) rows = rows.filter((d) => d.timestamp <= filters.to!);
    const totalCount = rows.length;
    const offset = decodeDemoIamAuditCursor(filters.cursor);
    const page = rows.slice(offset, offset + Math.min(1000, limit));
    const nextOffset = offset + page.length;
    const hasMore = nextOffset < totalCount;
    return {
      decisions: page.map((d) => ({ ...d })),
      totalCount,
      hasMore,
      nextCursor: hasMore ? encodeDemoIamAuditCursor(nextOffset) : null,
    };
  }
};
