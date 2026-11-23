import type { AlarmState, OperationalEvent } from '../../types/monitoring';

/**
 * FAT-300 (P33.5, E33 tahap A analisis halaman Opsi 3 §3) + P33.4
 * (FAT-294, E33): dua tampilan Alarm & Event dalam satu halaman + filter
 * State — kini memakai STATE SERVER (kontrak live B33.4).
 *
 * Tampilan:
 * - 'action' ("Perlu Tindakan", default): hanya event yang belum di-ack
 *   (active-unack + rtn-unack), diurutkan state dulu (masih aktif
 *   didahulukan) lalu terbaru. Query server-side memakai
 *   `acknowledged=false` + `category=operational`.
 * - 'history' ("Riwayat"): semua event dalam rentang, urutan server
 *   (terbaru dulu). Query tanpa param `acknowledged`.
 *
 * Pindah tampilan TIDAK mengganti filter lain (device, tipe, rentang) —
 * hanya menyaring state ack dan mereset paginasi ke halaman 1.
 *
 * STATE SERVER (P33.4 — menggantikan derivasi client-side P33.2):
 * tiap baris membawa `alarm_state` dari server (`active-unack` /
 * `rtn-unack` / `acked`, dihitung dari LOG LENGKAP server, §4
 * docs/BACKEND_REQUIREMENTS_E33_PAGES.md). Derivasi lama
 * (`eventAckState.ts`: pasangan OFFLINE→ONLINE dalam halaman yang
 * dimuat) DIHAPUS — ia best-effort dan salah bila pasangan ONLINE ada di
 * halaman lain (bukti audit 2026-11-23: Clear 0 baris di halaman 1
 * padahal pasangannya ada di halaman lama). Filter State dan badge kini
 * membaca `alarm_state` baris itu sendiri — stabil di halaman berapapun.
 *
 * JUMLAH TAB (P33.4): server mengirim `pagination.totalCount` (total
 * asli baris yang cocok) + `pagination.counts` {activeUnack, rtnUnack,
 * acked} — dipakai bila ada (`exact: true`, tanpa "+"). Bila `counts`
 * tidak ada, `totalCount` saja sudah cukup untuk tab Riwayat; tab
 * Perlu Tindakan jatuh ke hitungan halaman (batas bawah, "+"). Bila
 * keduanya tidak ada (backend lama), kembali ke hitungan halaman penuh
 * seperti sebelum P33.4. `TabCount.server` menandai angka yang dihitung
 * server (tooltip tab membedakannya dari "semua hasil sudah termuat").
 *
 * Filter State adalah penyaring CLIENT-SIDE atas halaman yang dimuat
 * (server tidak disuruh memfilter per state di tampilan ini — filter
 * `alarmState` param tersedia di kontrak, tapi tampilan ini memakai
 * `acknowledged` + penyaringan lokal supaya satu halaman memuat semua
 * state untuk kedua tampilan).
 */
export type OperationalEventView = 'action' | 'history';

export type OperationalEventStateFilter = 'ALL' | 'ACTIVE_UNACK' | 'RTN_UNACK' | 'ACKED';

export const EVENT_VIEW_LABELS: Record<OperationalEventView, string> = {
  action: 'Perlu Tindakan',
  history: 'Riwayat',
};

export const EVENT_STATE_FILTER_LABELS: Record<OperationalEventStateFilter, string> = {
  ALL: 'Semua',
  ACTIVE_UNACK: 'Aktif belum ack',
  RTN_UNACK: 'Clear belum di-ack',
  ACKED: 'Sudah ack',
};

/**
 * Param `acknowledged` server-side untuk tampilan aktif. 'action' memakai
 * `false` (hanya yang belum di-ack); 'history' memakai `undefined`
 * (semua event).
 */
export function acknowledgedParamForView(view: OperationalEventView): boolean | undefined {
  return view === 'action' ? false : undefined;
}

/**
 * Opsi Filter State yang berlaku per tampilan. 'ACKED' tidak ditawarkan di
 * tampilan 'action' — server di tampilan itu hanya mengembalikan event
 * yang belum di-ack, jadi opsi itu akan selalu kosong.
 */
export function stateFilterOptionsForView(
  view: OperationalEventView
): OperationalEventStateFilter[] {
  return view === 'action'
    ? ['ALL', 'ACTIVE_UNACK', 'RTN_UNACK']
    : ['ALL', 'ACTIVE_UNACK', 'RTN_UNACK', 'ACKED'];
}

const WANTED_STATE: Record<Exclude<OperationalEventStateFilter, 'ALL'>, AlarmState> = {
  ACTIVE_UNACK: 'active-unack',
  RTN_UNACK: 'rtn-unack',
  ACKED: 'acked',
};

/**
 * Saring daftar halaman yang dimuat menurut Filter State. 'ALL'
 * mengembalikan daftar apa adanya. State dibaca dari `alarm_state`
 * server per baris — tanpa derivasi, tanpa daftar referensi.
 */
export function filterEventsByState(
  events: readonly OperationalEvent[],
  stateFilter: OperationalEventStateFilter
): OperationalEvent[] {
  if (stateFilter === 'ALL') {
    return [...events];
  }
  const wanted = WANTED_STATE[stateFilter];
  return events.filter((ev) => ev.alarm_state === wanted);
}

/**
 * Urutan tampilan "Perlu Tindakan": active-unack dulu (kondisi masih
 * aktif = paling butuh tindakan), lalu rtn-unack (sudah clear, belum
 * dilihat); terbaru dulu di dalam tiap kelompok (recorded_at desc —
 * eksplisit, tidak mengandalkan urutan masuk). Sort stabil untuk baris
 * dengan state dan waktu yang sama.
 */
export function sortActionView(events: readonly OperationalEvent[]): OperationalEvent[] {
  const rank = (state: AlarmState): number =>
    state === 'active-unack' ? 0 : state === 'rtn-unack' ? 1 : 2;
  return [...events].sort((a, b) => {
    const byState = rank(a.alarm_state) - rank(b.alarm_state);
    if (byState !== 0) return byState;
    // recorded_at rusak → NaN → 0 → urutan masuk dipertahankan (stabil).
    return Date.parse(b.recorded_at) - Date.parse(a.recorded_at);
  });
}

export interface TabCount {
  /** Jumlah baris yang cocok (total server, atau baris halaman bila tanpa server). */
  count: number;
  /**
   * True bila `count` adalah total pasti: dihitung server (`server: true`),
   * atau halaman 1 tanpa halaman berikut (semua hasil sudah termuat).
   * Selain itu `count` adalah batas bawah.
   */
  exact: boolean;
  /** True bila `count` berasal dari `pagination.totalCount`/`counts` server. */
  server?: boolean;
}

/** Ringkasan state server dari `pagination.counts` (B33.4). */
export interface ServerEventCounts {
  activeUnack: number;
  rtnUnack: number;
  acked: number;
}

export interface TabCountsSource {
  /** Baris halaman yang dimuat (dipakai hanya bila tanpa angka server). */
  events: readonly OperationalEvent[];
  /** 0 = halaman pertama (dipakai hanya bila tanpa angka server). */
  pageIndex: number;
  hasMore: boolean;
  /** `pagination.totalCount` server — total asli baris yang cocok. */
  totalCount?: number;
  /** `pagination.counts` server — ringkasan state untuk filter yang sama. */
  counts?: ServerEventCounts;
}

/**
 * Jumlah tab: 'action' = belum di-ack (active-unack + rtn-unack),
 * 'history' = semua baris.
 *
 * - `counts` ada → kedua tab pasti (server): action =
 *   activeUnack + rtnUnack; history = totalCount (atau jumlah ketiga
 *   counts bila totalCount tidak ada).
 * - Hanya `totalCount` → history pasti; action dari halaman (pasti hanya
 *   bila halaman 1 tanpa halaman berikut).
 * - Tanpa keduanya → hitungan halaman seperti sebelum P33.4 (pasti hanya
 *   bila halaman 1 tanpa halaman berikut).
 */
export function describeTabCounts(source: TabCountsSource): { action: TabCount; history: TabCount } {
  const { events, pageIndex, hasMore, totalCount, counts } = source;
  const pageComplete = pageIndex === 0 && !hasMore;
  if (counts) {
    const actionCount = counts.activeUnack + counts.rtnUnack;
    return {
      action: { count: actionCount, exact: true, server: true },
      history: { count: totalCount ?? actionCount + counts.acked, exact: true, server: true },
    };
  }
  const pageUnacked = events.filter((e) => !e.acknowledged).length;
  if (totalCount !== undefined) {
    return {
      action: { count: pageUnacked, exact: pageComplete },
      history: { count: totalCount, exact: true, server: true },
    };
  }
  return {
    action: { count: pageUnacked, exact: pageComplete },
    history: { count: events.length, exact: pageComplete },
  };
}

/** Tampilkan jumlah tab: pasti → "12", batas bawah → "12+". */
export function formatTabCount(tabCount: TabCount): string {
  return tabCount.exact ? String(tabCount.count) : `${tabCount.count}+`;
}
