import test from 'node:test';
import assert from 'node:assert/strict';
import type { IamAuditDecision } from '../../../types/iam';
import {
  IAM_AUDIT_PAGE_SIZE,
  advanceIamAuditCursor,
  buildIamAuditCsvFilename,
  cursorForIamAuditPage,
  filterIamAuditByResourceAction,
  formatIamAuditResultLabel,
  iamAuditPageCount,
  initialIamAuditCursorStack,
  retreatIamAuditCursor,
} from './iamAudit';

const makeDecision = (overrides: Partial<IamAuditDecision>): IamAuditDecision => ({
  id: overrides.id ?? 'dec-1',
  subject: overrides.subject ?? 'ADM-001',
  decision: overrides.decision ?? 'ALLOW',
  mode: overrides.mode ?? 'enforce',
  action: overrides.action ?? 'mqtt.dynamic_security.read',
  resource: overrides.resource ?? 'mqtt/dynamic-security/roles',
  reason: overrides.reason ?? 'policy match',
  timestamp: overrides.timestamp ?? '2026-11-21T03:00:00.000Z',
});

test('P33.6: filter Resource/Action kosong = semua baris', () => {
  const rows = [makeDecision({ id: 'a' }), makeDecision({ id: 'b' })];
  assert.deepEqual(
    filterIamAuditByResourceAction(rows, { resourceQuery: '', actionQuery: '' }).map((d) => d.id),
    ['a', 'b'],
  );
});

test('P33.6: filter Resource substring, tidak sensitif huruf', () => {
  const rows = [
    makeDecision({ id: 'a', resource: 'mqtt/dynamic-security/roles' }),
    makeDecision({ id: 'b', resource: 'operators/ADM-001' }),
  ];
  assert.deepEqual(
    filterIamAuditByResourceAction(rows, { resourceQuery: 'DYNAMIC-SECURITY', actionQuery: '' }).map((d) => d.id),
    ['a'],
  );
});

test('P33.6: filter Action substring digabung dengan Resource (AND)', () => {
  const rows = [
    makeDecision({ id: 'a', action: 'mqtt.dynamic_security.read', resource: 'mqtt/x' }),
    makeDecision({ id: 'b', action: 'mqtt.dynamic_security.write', resource: 'mqtt/x' }),
    makeDecision({ id: 'c', action: 'mqtt.dynamic_security.read', resource: 'other/y' }),
  ];
  assert.deepEqual(
    filterIamAuditByResourceAction(rows, { resourceQuery: 'mqtt/x', actionQuery: 'read' }).map((d) => d.id),
    ['a'],
  );
});

test('P33.6: nama file ekspor CSV memakai tanggal lokal', () => {
  assert.equal(
    buildIamAuditCsvFilename(new Date(2026, 10, 21, 9, 30)),
    'audit-iam-2026-11-21.csv',
  );
});

test('P33.9: tumpukan cursor awal = halaman pertama (cursor null)', () => {
  const state = initialIamAuditCursorStack();
  assert.deepEqual(state.stack, [null]);
  assert.equal(state.pageIndex, 0);
  assert.equal(cursorForIamAuditPage(state), null);
  assert.equal(retreatIamAuditCursor(state), null);
});

test('P33.9: maju mendorong nextCursor ke rantai; mundur kembali ke cursor tersimpan', () => {
  let state = initialIamAuditCursorStack();
  // Halaman 1 -> 2: nextCursor 'c2' belum pernah dikunjungi.
  const forward = advanceIamAuditCursor(state, 'c2');
  assert.ok(forward);
  state = forward;
  assert.deepEqual(state.stack, [null, 'c2']);
  assert.equal(state.pageIndex, 1);
  assert.equal(cursorForIamAuditPage(state), 'c2');

  // Halaman 2 -> 3: nextCursor 'c3'.
  const forward2 = advanceIamAuditCursor(state, 'c3');
  assert.ok(forward2);
  state = forward2;
  assert.deepEqual(state.stack, [null, 'c2', 'c3']);
  assert.equal(state.pageIndex, 2);

  // Halaman 3 -> 2: mundur memakai cursor tersimpan, rantai tidak berubah.
  const back = retreatIamAuditCursor(state);
  assert.ok(back);
  state = back;
  assert.deepEqual(state.stack, [null, 'c2', 'c3']);
  assert.equal(state.pageIndex, 1);
  assert.equal(cursorForIamAuditPage(state), 'c2');

  // Halaman 2 -> 3 lagi: memakai cursor tersimpan 'c3', BUKAN nextCursor baru.
  const forwardAgain = advanceIamAuditCursor(state, 'c3-baru-yang-harus-diabaikan');
  assert.ok(forwardAgain);
  state = forwardAgain;
  assert.deepEqual(state.stack, [null, 'c2', 'c3']);
  assert.equal(state.pageIndex, 2);
  assert.equal(cursorForIamAuditPage(state), 'c3');
});

test('P33.9: maju di halaman terakhir = null (tanpa nextCursor, tanpa cursor tersimpan)', () => {
  const state = initialIamAuditCursorStack();
  assert.equal(advanceIamAuditCursor(state, null), null);
});

test('P33.9: mundur dari halaman pertama = null', () => {
  const state = initialIamAuditCursorStack();
  assert.equal(retreatIamAuditCursor(state), null);
});

test('P33.9: jumlah halaman informatif dari totalCount server', () => {
  assert.equal(iamAuditPageCount(0), 1);
  assert.equal(iamAuditPageCount(IAM_AUDIT_PAGE_SIZE), 1);
  assert.equal(iamAuditPageCount(IAM_AUDIT_PAGE_SIZE + 1), 2);
  assert.equal(iamAuditPageCount(100), 4);
});

test('P33.9: label hasil memakai totalCount server, bukan jumlah baris yang dimuat', () => {
  assert.equal(formatIamAuditResultLabel(100), 'Menampilkan 100 keputusan');
  assert.equal(formatIamAuditResultLabel(0), 'Menampilkan 0 keputusan');
  // Filter teks aktif: total server tetap, ditambah yang cocok di halaman ini.
  assert.equal(
    formatIamAuditResultLabel(100, 3),
    'Menampilkan 100 keputusan · 3 cocok di halaman ini',
  );
});

test('P33.9: filter teks + paging — filter hanya menyaring halaman yang dimuat, totalCount tidak berubah', () => {
  // Halaman server 1 (25 baris) — 2 baris cocok dengan 'roles'.
  const pageRows = [
    makeDecision({ id: 'a', resource: 'mqtt/dynamic-security/roles' }),
    makeDecision({ id: 'b', resource: 'operators/ADM-001' }),
    makeDecision({ id: 'c', resource: 'mqtt/dynamic-security/roles' }),
  ];
  const filtered = filterIamAuditByResourceAction(pageRows, {
    resourceQuery: 'roles',
    actionQuery: '',
  });
  assert.deepEqual(filtered.map((d) => d.id), ['a', 'c']);
  // totalCount server (mis. 100) TIDAK ikut menyempit oleh filter teks.
  assert.equal(
    formatIamAuditResultLabel(100, filtered.length),
    'Menampilkan 100 keputusan · 2 cocok di halaman ini',
  );
});
