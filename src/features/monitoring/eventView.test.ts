import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationalEvent } from '../../types/monitoring';
import {
  acknowledgedParamForView,
  describeTabCounts,
  EVENT_STATE_FILTER_LABELS,
  filterEventsByState,
  formatTabCount,
  sortActionView,
  stateFilterOptionsForView,
  type OperationalEventStateFilter,
} from './eventView';

// ---------------------------------------------------------------------------
// FAT-300 (P33.5, E33 tahap A analisis halaman Opsi 3 §3) + P33.4 (FAT-294):
// dua tampilan Alarm & Event + filter State — kini memakai STATE SERVER.
// Aturan:
// - view 'action' → server `acknowledged=false`; 'history' → undefined.
// - Filter State client-side atas halaman yang dimuat; state dibaca dari
//   `alarm_state` server per baris (tanpa derivasi, tanpa daftar referensi).
// - Urutan 'action': active-unack dulu, lalu rtn-unack, terbaru dulu
//   di tiap kelompok (sort stabil).
// - Jumlah tab: `counts` server → kedua tab pasti; hanya `totalCount` →
//   Riwayat pasti, Perlu Tindakan dari halaman; tanpa keduanya → hitungan
//   halaman (pasti hanya bila halaman 1 tanpa halaman berikut).
// ---------------------------------------------------------------------------

function baseEvent(overrides: Partial<OperationalEvent> = {}): OperationalEvent {
  return {
    id: 'op-ev-900',
    recorded_at: '2026-11-21T00:30:00Z',
    device_id: 'STM32-OEE-01',
    station_label: null,
    machine_id: null,
    machine_name: null,
    wo_id: null,
    event_type: 'DEVICE_OFFLINE',
    trigger_source: 'DEVICE',
    event_code: null,
    snapshot_total_count: null,
    snapshot_run_sec: null,
    description: 'device offline',
    acknowledged: false,
    acknowledged_at: null,
    acknowledged_by: null,
    ack_note: null,
    created_at: '2026-11-21T00:30:00Z',
    category: 'operational',
    alarm_state: 'active-unack',
    condition: 'ACTIVE',
    ...overrides,
  };
}

test("view 'action' memakai acknowledged=false; 'history' tanpa param ack", () => {
  assert.equal(acknowledgedParamForView('action'), false);
  assert.equal(acknowledgedParamForView('history'), undefined);
});

test("opsi State: 'action' tanpa ACKED; 'history' semua opsi", () => {
  assert.deepEqual(stateFilterOptionsForView('action'), ['ALL', 'ACTIVE_UNACK', 'RTN_UNACK']);
  assert.deepEqual(stateFilterOptionsForView('history'), [
    'ALL',
    'ACTIVE_UNACK',
    'RTN_UNACK',
    'ACKED',
  ]);
});

test('filter State ALL mengembalikan semua baris', () => {
  const events = [baseEvent(), baseEvent({ id: 'op-ev-901', acknowledged: true, alarm_state: 'acked' })];
  assert.equal(filterEventsByState(events, 'ALL').length, 2);
});

test('filter ACTIVE_UNACK: hanya baris dengan alarm_state active-unack', () => {
  const events = [
    baseEvent({ id: 'a1' }),
    baseEvent({ id: 'a2', alarm_state: 'rtn-unack', condition: 'CLEAR' }),
    baseEvent({ id: 'a3', event_type: 'DEVICE_ONLINE', alarm_state: 'active-unack', condition: 'NORMAL' }),
    baseEvent({ id: 'a4', acknowledged: true, alarm_state: 'acked' }),
  ];
  assert.deepEqual(
    filterEventsByState(events, 'ACTIVE_UNACK').map((e) => e.id),
    ['a1', 'a3']
  );
});

test('filter RTN_UNACK: hanya baris dengan alarm_state rtn-unack (tanpa butuh pasangan ONLINE di halaman)', () => {
  // P33.4: baris rtn-unack dikenali dari field server — tidak perlu lagi
  // ada DEVICE_ONLINE untuk device yang sama di daftar yang sama.
  const events = [
    baseEvent({ id: 'r1', alarm_state: 'rtn-unack', condition: 'CLEAR' }),
    baseEvent({ id: 'r2' }),
  ];
  assert.deepEqual(
    filterEventsByState(events, 'RTN_UNACK').map((e) => e.id),
    ['r1']
  );
});

test('filter ACKED: hanya yang sudah di-ack', () => {
  const acked = baseEvent({ id: 'k1', acknowledged: true, alarm_state: 'acked' });
  const unacked = baseEvent({ id: 'k2' });
  assert.deepEqual(
    filterEventsByState([acked, unacked], 'ACKED').map((e) => e.id),
    ['k1']
  );
});

test('sort tampilan action: active-unack (lebih lama) tetap di atas rtn-unack (lebih baru)', () => {
  const rtnNewer = baseEvent({
    id: 's1',
    recorded_at: '2026-11-21T00:40:00Z',
    alarm_state: 'rtn-unack',
    condition: 'CLEAR',
  });
  const activeOlder = baseEvent({
    id: 's2',
    device_id: 'STM32-OEE-02',
    recorded_at: '2026-11-21T00:10:00Z',
  });
  const sorted = sortActionView([rtnNewer, activeOlder]).map((e) => e.id);
  assert.deepEqual(sorted, ['s2', 's1']);
});

test('sort tampilan action: terbaru dulu di dalam kelompok state yang sama', () => {
  const older = baseEvent({ id: 't1', recorded_at: '2026-11-21T00:10:00Z' });
  const newer = baseEvent({ id: 't2', recorded_at: '2026-11-21T00:30:00Z' });
  assert.deepEqual(
    sortActionView([older, newer]).map((e) => e.id),
    ['t2', 't1']
  );
});

test('jumlah tab: counts server → kedua tab pasti tanpa "+"', () => {
  const events = [baseEvent({ id: 'c1' })];
  const counts = describeTabCounts({
    events,
    pageIndex: 0,
    hasMore: true,
    totalCount: 1284,
    counts: { activeUnack: 37, rtnUnack: 12, acked: 1235 },
  });
  assert.deepEqual(counts.action, { count: 49, exact: true, server: true });
  assert.deepEqual(counts.history, { count: 1284, exact: true, server: true });
  assert.equal(formatTabCount(counts.action), '49');
  assert.equal(formatTabCount(counts.history), '1284');
});

test('jumlah tab: counts server tanpa totalCount → Riwayat = jumlah ketiga counts', () => {
  const counts = describeTabCounts({
    events: [],
    pageIndex: 2,
    hasMore: true,
    counts: { activeUnack: 3, rtnUnack: 1, acked: 10 },
  });
  assert.deepEqual(counts.action, { count: 4, exact: true, server: true });
  assert.deepEqual(counts.history, { count: 14, exact: true, server: true });
});

test('jumlah tab: hanya totalCount → Riwayat pasti, Perlu Tindakan dari halaman', () => {
  const events = [
    baseEvent({ id: 'c1' }),
    baseEvent({ id: 'c2', acknowledged: true, alarm_state: 'acked' }),
    baseEvent({ id: 'c3' }),
  ];
  const counts = describeTabCounts({ events, pageIndex: 0, hasMore: true, totalCount: 1284 });
  assert.deepEqual(counts.action, { count: 2, exact: false });
  assert.deepEqual(counts.history, { count: 1284, exact: true, server: true });
  assert.equal(formatTabCount(counts.action), '2+');
  assert.equal(formatTabCount(counts.history), '1284');
});

test('jumlah tab: tanpa angka server, halaman 1 tanpa halaman berikut = pasti', () => {
  const events = [
    baseEvent({ id: 'c1' }),
    baseEvent({ id: 'c2', acknowledged: true, alarm_state: 'acked' }),
    baseEvent({ id: 'c3' }),
  ];
  const counts = describeTabCounts({ events, pageIndex: 0, hasMore: false });
  assert.deepEqual(counts.action, { count: 2, exact: true });
  assert.deepEqual(counts.history, { count: 3, exact: true });
  assert.equal(formatTabCount(counts.action), '2');
});

test('jumlah tab: tanpa angka server, ada halaman berikut = batas bawah ("+")', () => {
  const events = [baseEvent({ id: 'c1' }), baseEvent({ id: 'c2', acknowledged: true, alarm_state: 'acked' })];
  const counts = describeTabCounts({ events, pageIndex: 0, hasMore: true });
  assert.deepEqual(counts.action, { count: 1, exact: false });
  assert.equal(formatTabCount(counts.action), '1+');
  assert.equal(formatTabCount(counts.history), '2+');
});

test('jumlah tab: tanpa angka server, halaman berikutnya tanpa has_more tetap batas bawah', () => {
  const events = [baseEvent({ id: 'c1' })];
  const counts = describeTabCounts({ events, pageIndex: 1, hasMore: false });
  assert.deepEqual(counts.action, { count: 1, exact: false });
  assert.equal(formatTabCount(counts.history), '1+');
});

// Sanity: semua nilai filter State punya label tampil (tidak ada opsi tanpa label).
test('semua nilai State punya label', () => {
  const all: OperationalEventStateFilter[] = ['ALL', 'ACTIVE_UNACK', 'RTN_UNACK', 'ACKED'];
  for (const value of all) {
    assert.ok(EVENT_STATE_FILTER_LABELS[value].length > 0, value);
  }
});
