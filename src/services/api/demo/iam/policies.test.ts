import test from 'node:test';
import assert from 'node:assert/strict';
import { demoIamPolicies } from './policies';
import { store } from '../store';
import type { IamAuditPage } from '../../../../types/iam';

// ---------------------------------------------------------------------------
// P33.9 (FAT-305): paging server-side Audit IAM di mode demo — paritas
// dengan kontrak HTTP (cursor + limit -> {decisions, totalCount, hasMore,
// nextCursor}). Cursor demo adalah offset berkode (`iam-audit:<offset>`);
// formatnya TIDAK sama dengan cursor server asli dan hanya berlaku lokal.
//
// CATATAN: tes ini mengimpor demoIamPolicies + store LANGSUNG, bukan lewat
// ./client — client menarik seluruh demoApiClient termasuk demo/monitoring
// yang saat ini rusak oleh pekerjaan chat lain yang belum selesai
// (mengimpor `buildSystemAuditExportEndpoint` yang belum ada).
// ---------------------------------------------------------------------------

function loginAdmin() {
  store.networkAccessMode = 'LAN';
  store.isAuthenticated = true;
  store.authToken = 'test_jwt_admin';
  store.tokenAuthzVersion = store.iamInfo.authzVersion;
  const admin = store.operators.find((o) => o.role === 'ADMIN');
  assert.ok(admin, 'seed demo harus punya operator ADMIN');
  store.currentUserRole = 'ADMIN';
  store.currentUserId = admin.operator_id;
  store.currentUserName = admin.name;
  store.currentUserLineId = admin.line_id;
}

test('P33.9 demo: paging maju limit=2 mengikuti nextCursor sampai habis; totalCount konsisten', async () => {
  loginAdmin();
  const baseline = await demoIamPolicies.getIamAuditDecisions({ limit: 1000 });
  assert.ok(baseline.totalCount > 0, 'seed demo harus punya baris audit IAM');
  assert.equal(baseline.decisions.length, baseline.totalCount);
  assert.equal(baseline.hasMore, false);
  assert.equal(baseline.nextCursor, null);

  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: IamAuditPage = await demoIamPolicies.getIamAuditDecisions({ limit: 2, cursor: cursor ?? undefined });
    assert.equal(page.totalCount, baseline.totalCount, 'totalCount sama di semua halaman');
    assert.ok(page.decisions.length > 0 && page.decisions.length <= 2);
    seen.push(...page.decisions.map((d) => d.id));
    cursor = page.nextCursor;
    pages += 1;
    assert.ok(pages <= 10, 'paging tidak boleh berputar tanpa henti');
  } while (cursor !== null);
  assert.ok(pages >= 2, 'seed harus cukup untuk >1 halaman dengan limit=2');
  assert.deepEqual(seen, baseline.decisions.map((d) => d.id));
});

test('P33.9 demo: filter decision + paging — totalCount mengikuti filter server', async () => {
  loginAdmin();
  const baseline = await demoIamPolicies.getIamAuditDecisions({ decision: 'DENY', limit: 1000 });
  assert.ok(
    baseline.decisions.every((d) => d.decision === 'DENY'),
    'semua baris hasil filter harus DENY',
  );
  assert.equal(baseline.totalCount, baseline.decisions.length);

  const first = await demoIamPolicies.getIamAuditDecisions({ decision: 'DENY', limit: 1 });
  assert.equal(first.totalCount, baseline.totalCount);
  assert.equal(first.decisions.length, Math.min(1, baseline.totalCount));
  if (baseline.totalCount > 1) {
    assert.equal(first.hasMore, true);
    assert.ok(first.nextCursor);
    const second = await demoIamPolicies.getIamAuditDecisions({
      decision: 'DENY',
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    assert.equal(second.totalCount, baseline.totalCount);
    assert.notEqual(second.decisions[0].id, first.decisions[0].id);
  }
});

test('P33.9 demo: cursor rusak/tanpa prefix = halaman pertama (defensif)', async () => {
  loginAdmin();
  const baseline = await demoIamPolicies.getIamAuditDecisions({ limit: 1000 });
  const page = await demoIamPolicies.getIamAuditDecisions({ limit: 2, cursor: 'cursor-asal-yang-tidak-sah' });
  assert.equal(page.totalCount, baseline.totalCount);
  assert.deepEqual(
    page.decisions.map((d) => d.id),
    baseline.decisions.slice(0, 2).map((d) => d.id),
  );
});
