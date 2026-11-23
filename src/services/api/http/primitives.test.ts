import test from 'node:test';
import assert from 'node:assert/strict';
import { pageMeta } from './primitives';

// ---------------------------------------------------------------------------
// P33.4 (FAT-294, B33.4): `pageMeta` — `totalCount` server adalah TOTAL
// ASLI baris yang cocok (bukan panjang halaman) dan diutamakan atas
// `count`; `counts` + `retentionDays` diteruskan bila ada.
// ---------------------------------------------------------------------------

test('pageMeta: totalCount diutamakan atas count (total asli vs panjang halaman)', () => {
  const meta = pageMeta(
    { limit: 50, hasMore: true, nextCursor: 'abc', count: 50, totalCount: 1284 },
    50,
    50
  );
  assert.equal(meta.total_count, 1284);
  assert.equal(meta.has_more, true);
  assert.equal(meta.next_cursor, 'abc');
});

test('pageMeta: total_count snake_case juga dibaca', () => {
  const meta = pageMeta({ limit: 50, hasMore: false, nextCursor: null, count: 2, total_count: 37 }, 50, 2);
  assert.equal(meta.total_count, 37);
});

test('pageMeta: tanpa totalCount → count dipakai sebagai fallback (perilaku lama)', () => {
  const meta = pageMeta({ limit: 50, hasMore: false, nextCursor: null, count: 2 }, 50, 2);
  assert.equal(meta.total_count, 2);
});

test('pageMeta: tanpa count maupun totalCount → panjang halaman', () => {
  const meta = pageMeta({ limit: 50, hasMore: false, nextCursor: null }, 50, 7);
  assert.equal(meta.total_count, 7);
});

test('pageMeta: counts server diteruskan apa adanya', () => {
  const meta = pageMeta(
    {
      limit: 50,
      hasMore: true,
      nextCursor: 'x',
      count: 50,
      totalCount: 1284,
      counts: { activeUnack: 37, rtnUnack: 12, acked: 1235 },
    },
    50,
    50
  );
  assert.deepEqual(meta.counts, { activeUnack: 37, rtnUnack: 12, acked: 1235 });
  assert.equal(meta.total_count, 1284);
});

test('pageMeta: tanpa counts → field counts tidak ada (endpoint lain tidak terpengaruh)', () => {
  const meta = pageMeta({ limit: 50, hasMore: false, nextCursor: null, count: 2 }, 50, 2);
  assert.equal(meta.counts, undefined);
});

test('pageMeta: retentionDays diteruskan (arsip audit)', () => {
  const meta = pageMeta(
    { limit: 20, hasMore: false, nextCursor: null, count: 6, totalCount: 6, retentionDays: 90 },
    20,
    6
  );
  assert.equal(meta.retention_days, 90);
  assert.equal(meta.total_count, 6);
});
